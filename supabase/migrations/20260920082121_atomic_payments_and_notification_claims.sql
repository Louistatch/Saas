-- Server-only transactional settlement: a crash cannot leave a successful payment without its cotisation.
CREATE OR REPLACE FUNCTION public.settle_payment_atomic(p_payment_id uuid, p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE p public.payments%ROWTYPE; v_status text := p_patch->>'status';
  v_now timestamptz := now(); v_phone text; v_first text; v_body text;
BEGIN
  IF v_status IS NULL OR v_status NOT IN ('success','failed') THEN RAISE EXCEPTION 'Invalid terminal status'; END IF;
  SELECT * INTO p FROM public.payments WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF p.status NOT IN ('pending','processing') THEN RETURN jsonb_build_object('claimed',false); END IF;
  IF p.member_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.members m
    WHERE m.id=p.member_id AND m.cooperative_id=p.cooperative_id) THEN RAISE EXCEPTION 'Member organisation mismatch'; END IF;
  IF p.cotisation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cotisations c
    WHERE c.id=p.cotisation_id AND c.cooperative_id=p.cooperative_id AND c.member_id=p.member_id
      AND c.amount=p.amount_fcfa AND c.currency=p.currency) THEN RAISE EXCEPTION 'Cotisation mismatch'; END IF;
  UPDATE public.payments SET status=v_status, paid_at=CASE WHEN v_status='success' THEN v_now ELSE NULL END,
    provider_tx_id=COALESCE(p_patch->>'provider_tx_id',provider_tx_id),
    failure_reason=CASE WHEN v_status='failed' THEN p_patch->>'failure_reason' ELSE NULL END,
    metadata=COALESCE(metadata,'{}'::jsonb)||COALESCE(p_patch->'metadata','{}'::jsonb), updated_at=v_now
    WHERE id=p.id;
  IF v_status='success' AND p.cotisation_id IS NOT NULL THEN
    UPDATE public.cotisations SET status='paid', paid_date=v_now::date WHERE id=p.cotisation_id;
  END IF;
  INSERT INTO public.notifications_inapp(cooperative_id,title,body,type,link)
    VALUES(p.cooperative_id,CASE WHEN v_status='success' THEN 'Paiement reçu' ELSE 'Paiement échoué' END,
      format('Paiement de %s %s — référence %s',p.amount_fcfa,p.currency,p.reference),
      CASE WHEN v_status='success' THEN 'success' ELSE 'alert' END,'/dashboard/cotisations');
  IF v_status='success' AND p.member_id IS NOT NULL THEN
    SELECT phone,first_name INTO v_phone,v_first FROM public.members WHERE id=p.member_id;
    SELECT body_fr INTO v_body FROM public.notification_templates WHERE key='cotisation_paid' AND channel='sms';
    IF v_phone IS NOT NULL AND COALESCE(v_body,'')<>'' THEN
      INSERT INTO public.notification_queue(member_id,cooperative_id,channel,template_key,recipient_phone,
        variables,body_rendered,scheduled_at)
      VALUES(p.member_id,p.cooperative_id,'sms','cotisation_paid',v_phone,
        jsonb_build_object('prenom',v_first,'montant',p.amount_fcfa::text),
        replace(replace(v_body,'{prenom}',COALESCE(v_first,'')),'{montant}',p.amount_fcfa::text),v_now);
    END IF;
  END IF;
  RETURN jsonb_build_object('claimed',true);
END $$;
REVOKE ALL ON FUNCTION public.settle_payment_atomic(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_payment_atomic(uuid,jsonb) TO service_role;
-- Additive preparation before deploying the app; access restrictions follow after deployment.
ALTER TABLE public.buyer_requests ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid();

ALTER TABLE public.notification_queue ADD COLUMN locked_until timestamptz,
  ADD COLUMN claim_token uuid;
CREATE INDEX notification_queue_due_idx ON public.notification_queue(scheduled_at)
  WHERE status IN ('pending','failed') AND attempts<3;
CREATE OR REPLACE FUNCTION public.claim_notification_batch(p_limit integer DEFAULT 5)
RETURNS SETOF public.notification_queue LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  WITH candidates AS (
    SELECT id FROM public.notification_queue
    WHERE status IN ('pending','failed') AND attempts<3 AND scheduled_at<=now()
      AND (locked_until IS NULL OR locked_until<now())
    ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limit,10))
  )
  UPDATE public.notification_queue q SET locked_until=now()+interval '5 minutes',
    claim_token=gen_random_uuid(),attempts=q.attempts+1
  FROM candidates c WHERE q.id=c.id RETURNING q.*;
$$;
REVOKE ALL ON FUNCTION public.claim_notification_batch(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_batch(integer) TO service_role;
