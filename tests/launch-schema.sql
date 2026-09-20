-- Sanitized schema fixture from production metadata only. Contains no user records.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_user::text $$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
CREATE TYPE public.user_role AS ENUM ('super_admin','cooperative_admin','member','guest','ouvrier','acheteur','agronome','none');
CREATE TYPE public.haroo_profile_type AS ENUM ('ouvrier','acheteur','agronome');
CREATE TYPE public.partner_status AS ENUM ('candidate','training','exam_pending','certified','active','suspended','expired','revoked');
CREATE TYPE public.partner_membership_role AS ENUM ('owner','manager','agent');
CREATE TYPE public.partner_membership_status AS ENUM ('active','revoked');
CREATE TYPE public.partner_assignment_status AS ENUM ('active','revoked','ended');
CREATE TYPE public.partner_access_scope AS ENUM ('members.read','members.manage','cards.read','cards.manage','cards.print','kobo.manage','imports.manage','analytics.read','reports.generate','projects.manage','support.manage');
CREATE TYPE public.partner_ledger_entry_type AS ENUM ('CREDIT','DEBIT','REFUND','REVERSAL','ADJUSTMENT','BONUS');
CREATE TYPE public.partner_payment_purpose AS ENUM ('wallet_topup','certification','operator_subscription');
CREATE TYPE public.partner_payment_intent_status AS ENUM ('pending','processing','success','failed','cancelled','expired');
CREATE TYPE public.card_print_order_status AS ENUM ('requested','paid','printed','delivered','cancelled');
CREATE TYPE public.organization_earning_status AS ENUM ('pending','available','paid','cancelled');
CREATE TABLE public.academy_quiz_options (id uuid NOT NULL DEFAULT gen_random_uuid(),question_id uuid NOT NULL,label text NOT NULL,is_correct boolean NOT NULL DEFAULT false,order_index integer NOT NULL,created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.buyer_matches (id uuid NOT NULL DEFAULT gen_random_uuid(),request_id uuid NOT NULL,listing_id uuid NOT NULL,match_score integer NOT NULL,match_reason text,status text NOT NULL DEFAULT 'proposed'::text,created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.buyer_requests (id uuid NOT NULL DEFAULT gen_random_uuid(),cooperative_id uuid,buyer_name text NOT NULL,buyer_phone text,buyer_email text,culture text NOT NULL,quantity_kg_needed numeric NOT NULL,max_price_per_kg_fcfa numeric,quality_grade_min text,location_prefecture text,needed_by date,status text NOT NULL DEFAULT 'open'::text,notes text,created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.cooperatives (id uuid NOT NULL DEFAULT uuid_generate_v4(),name text NOT NULL,description text,logo_url text,primary_color text DEFAULT '#16a34a'::text,created_at timestamp with time zone DEFAULT now(),updated_at timestamp with time zone DEFAULT now(),faitiere_name text,level text,parent_id uuid,village_id uuid,culture_categories jsonb,coordo_name text,coordo_phone text,deleted_at timestamp with time zone,is_demo boolean NOT NULL DEFAULT false);
CREATE TABLE public.cotisations (id uuid NOT NULL DEFAULT gen_random_uuid(),member_id uuid NOT NULL,cooperative_id uuid NOT NULL,campaign text,status text NOT NULL DEFAULT 'pending'::text,amount integer,created_at timestamp with time zone NOT NULL DEFAULT now(),type text DEFAULT 'cotisation'::text,currency text DEFAULT 'XOF'::text,due_date text,paid_date text,notes text,reference_number text);
CREATE TABLE public.market_listings (id uuid NOT NULL DEFAULT gen_random_uuid(),member_id uuid NOT NULL,cooperative_id uuid NOT NULL,culture text NOT NULL,quantity_kg numeric NOT NULL,price_per_kg_fcfa numeric NOT NULL,quality_grade text DEFAULT 'B'::text,harvest_date_estimated date,location_canton text,location_prefecture text,description text,status text NOT NULL DEFAULT 'active'::text,views_count integer DEFAULT 0,contact_count integer DEFAULT 0,expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval),created_at timestamp with time zone DEFAULT now(),updated_at timestamp with time zone DEFAULT now());
CREATE TABLE public.member_cards (id uuid NOT NULL DEFAULT uuid_generate_v4(),cooperative_id uuid,member_id uuid,card_number text NOT NULL,status text NOT NULL DEFAULT 'active'::text,expiry_date date,qr_data text,created_at timestamp with time zone DEFAULT now(),updated_at timestamp with time zone DEFAULT now(),card_type text NOT NULL DEFAULT 'FAITIERE'::text,deleted_at timestamp with time zone);
CREATE TABLE public.members (id uuid NOT NULL DEFAULT uuid_generate_v4(),cooperative_id uuid NOT NULL,first_name text NOT NULL,last_name text NOT NULL,email text,phone text,address text,date_of_birth date,status text NOT NULL DEFAULT 'active'::text,created_at timestamp with time zone DEFAULT now(),updated_at timestamp with time zone DEFAULT now(),photo_url text,village text,canton text,prefecture text,region text,canton_id uuid,prefecture_id uuid,region_id uuid,faitiere text,signature_url text,deleted_at timestamp with time zone);
CREATE TABLE public.notification_queue (id uuid NOT NULL DEFAULT gen_random_uuid(),member_id uuid,cooperative_id uuid,channel text NOT NULL,template_key text,recipient_phone text,recipient_email text,variables jsonb DEFAULT '{}'::jsonb,body_rendered text,status text NOT NULL DEFAULT 'pending'::text,attempts integer DEFAULT 0,last_error text,scheduled_at timestamp with time zone DEFAULT now(),sent_at timestamp with time zone,created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.notification_templates (id uuid NOT NULL DEFAULT gen_random_uuid(),key text NOT NULL,channel text NOT NULL,subject text,body_fr text NOT NULL,created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.notifications_inapp (id uuid NOT NULL DEFAULT gen_random_uuid(),cooperative_id uuid NOT NULL,title text NOT NULL,body text NOT NULL,type text NOT NULL DEFAULT 'info'::text,icon text,link text,read_at timestamp with time zone,created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.partner_assignment_scopes (assignment_id uuid NOT NULL,scope partner_access_scope NOT NULL);
CREATE TABLE public.partner_certifications (id uuid NOT NULL DEFAULT gen_random_uuid(),user_id uuid NOT NULL,academy_module_id uuid,training_completed_at timestamp with time zone,exam_score integer,exam_passed_at timestamp with time zone,certified_at timestamp with time zone,partner_id uuid,created_at timestamp with time zone NOT NULL DEFAULT now(),updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.partner_memberships (id uuid NOT NULL DEFAULT gen_random_uuid(),partner_id uuid NOT NULL,user_id uuid NOT NULL,membership_role partner_membership_role NOT NULL DEFAULT 'owner'::partner_membership_role,status partner_membership_status NOT NULL DEFAULT 'active'::partner_membership_status,created_at timestamp with time zone NOT NULL DEFAULT now(),updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.partner_organization_assignments (id uuid NOT NULL DEFAULT gen_random_uuid(),partner_id uuid NOT NULL,cooperative_id uuid NOT NULL,status partner_assignment_status NOT NULL DEFAULT 'active'::partner_assignment_status,is_primary_operator boolean NOT NULL DEFAULT false,started_at timestamp with time zone NOT NULL DEFAULT now(),ended_at timestamp with time zone,approved_by uuid,revoked_by uuid,created_at timestamp with time zone NOT NULL DEFAULT now(),updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.partners (id uuid NOT NULL DEFAULT gen_random_uuid(),partner_code text NOT NULL,business_name text,display_name text NOT NULL,phone text,email text,region_id uuid,prefecture_id uuid,status partner_status NOT NULL DEFAULT 'candidate'::partner_status,created_at timestamp with time zone NOT NULL DEFAULT now(),updated_at timestamp with time zone NOT NULL DEFAULT now(),suspended_at timestamp with time zone);
CREATE TABLE public.payments (id uuid NOT NULL DEFAULT gen_random_uuid(),member_id uuid,cooperative_id uuid NOT NULL,cotisation_id uuid,amount_fcfa numeric NOT NULL,currency text NOT NULL DEFAULT 'XOF'::text,provider text NOT NULL DEFAULT 'orange_money'::text,phone text,reference text,provider_tx_id text,status text NOT NULL DEFAULT 'pending'::text,failure_reason text,metadata jsonb DEFAULT '{}'::jsonb,paid_at timestamp with time zone,created_at timestamp with time zone DEFAULT now(),updated_at timestamp with time zone DEFAULT now());
CREATE TABLE public.profiles (id uuid NOT NULL,email text NOT NULL,first_name text,last_name text,role user_role NOT NULL DEFAULT 'member'::user_role,cooperative_id uuid,created_at timestamp with time zone DEFAULT now(),updated_at timestamp with time zone DEFAULT now(),deleted_at timestamp with time zone,haroo_type haroo_profile_type,haroo_activated_at timestamp with time zone,org_activated_at timestamp with time zone,is_demo boolean NOT NULL DEFAULT false);
ALTER TABLE academy_quiz_options ADD PRIMARY KEY (id);
ALTER TABLE academy_quiz_options ADD UNIQUE (question_id, order_index);
ALTER TABLE buyer_matches ADD CHECK (((match_score >= 0) AND (match_score <= 100)));
ALTER TABLE buyer_matches ADD PRIMARY KEY (id);
ALTER TABLE buyer_matches ADD UNIQUE (request_id, listing_id);
ALTER TABLE buyer_matches ADD CHECK ((status = ANY (ARRAY['proposed'::text, 'accepted'::text, 'rejected'::text, 'completed'::text])));
ALTER TABLE buyer_requests ADD PRIMARY KEY (id);
ALTER TABLE buyer_requests ADD CHECK ((quality_grade_min = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])));
ALTER TABLE buyer_requests ADD CHECK ((quantity_kg_needed > (0)::numeric));
ALTER TABLE buyer_requests ADD CHECK ((status = ANY (ARRAY['open'::text, 'matched'::text, 'fulfilled'::text, 'cancelled'::text])));
ALTER TABLE cooperatives ADD UNIQUE (name);
ALTER TABLE cooperatives ADD PRIMARY KEY (id);
ALTER TABLE cotisations ADD PRIMARY KEY (id);
ALTER TABLE market_listings ADD PRIMARY KEY (id);
ALTER TABLE market_listings ADD CHECK ((price_per_kg_fcfa > (0)::numeric));
ALTER TABLE market_listings ADD CHECK ((quality_grade = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])));
ALTER TABLE market_listings ADD CHECK ((quantity_kg > (0)::numeric));
ALTER TABLE market_listings ADD CHECK ((status = ANY (ARRAY['active'::text, 'sold'::text, 'expired'::text, 'cancelled'::text])));
ALTER TABLE member_cards ADD UNIQUE (card_number);
ALTER TABLE member_cards ADD CHECK ((card_type = ANY (ARRAY['FAITIERE'::text, 'OUVRIER'::text, 'ACHETEUR'::text, 'AGRONOME'::text])));
ALTER TABLE member_cards ADD CHECK (((card_type <> 'FAITIERE'::text) OR ((cooperative_id IS NOT NULL) AND (member_id IS NOT NULL))));
ALTER TABLE member_cards ADD PRIMARY KEY (id);
ALTER TABLE member_cards ADD CHECK ((status = ANY (ARRAY['active'::text, 'pending'::text, 'expired'::text, 'revoked'::text])));
ALTER TABLE members ADD PRIMARY KEY (id);
ALTER TABLE members ADD CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text])));
ALTER TABLE notification_queue ADD CHECK ((channel = ANY (ARRAY['sms'::text, 'whatsapp'::text, 'email'::text, 'in_app'::text])));
ALTER TABLE notification_queue ADD PRIMARY KEY (id);
ALTER TABLE notification_queue ADD CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE notification_templates ADD CHECK ((channel = ANY (ARRAY['sms'::text, 'whatsapp'::text, 'email'::text, 'in_app'::text])));
ALTER TABLE notification_templates ADD UNIQUE (key);
ALTER TABLE notification_templates ADD PRIMARY KEY (id);
ALTER TABLE notifications_inapp ADD PRIMARY KEY (id);
ALTER TABLE notifications_inapp ADD CHECK ((type = ANY (ARRAY['info'::text, 'success'::text, 'warning'::text, 'alert'::text])));
ALTER TABLE partner_assignment_scopes ADD PRIMARY KEY (assignment_id, scope);
ALTER TABLE partner_certifications ADD CHECK (((exam_score IS NULL) OR ((exam_score >= 0) AND (exam_score <= 100))));
ALTER TABLE partner_certifications ADD PRIMARY KEY (id);
ALTER TABLE partner_certifications ADD UNIQUE (user_id);
ALTER TABLE partner_memberships ADD UNIQUE (partner_id, user_id);
ALTER TABLE partner_memberships ADD PRIMARY KEY (id);
ALTER TABLE partner_organization_assignments ADD PRIMARY KEY (id);
ALTER TABLE partners ADD UNIQUE (partner_code);
ALTER TABLE partners ADD PRIMARY KEY (id);
ALTER TABLE payments ADD CHECK ((amount_fcfa > (0)::numeric));
ALTER TABLE payments ADD PRIMARY KEY (id);
ALTER TABLE payments ADD CHECK ((provider = ANY (ARRAY['orange_money'::text, 'moov'::text, 'tmoney'::text, 'cash'::text])));
ALTER TABLE payments ADD UNIQUE (reference);
ALTER TABLE payments ADD CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'success'::text, 'failed'::text, 'refunded'::text])));
ALTER TABLE profiles ADD UNIQUE (email);
ALTER TABLE profiles ADD CHECK (((role = ANY (ARRAY['none'::user_role, 'super_admin'::user_role])) OR (cooperative_id IS NOT NULL))) NOT VALID;
ALTER TABLE profiles ADD PRIMARY KEY (id);
CREATE OR REPLACE FUNCTION public.get_accessible_cooperative_ids()
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role    public.user_role;
  v_coop    uuid;
  v_ids     uuid[];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN '{}';
  END IF;

  SELECT role, cooperative_id INTO v_role, v_coop
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_role = 'super_admin' THEN
    SELECT array_agg(id) INTO v_ids FROM public.cooperatives;
    RETURN COALESCE(v_ids, '{}');
  END IF;

  IF v_coop IS NULL THEN
    RETURN '{}';
  END IF;

  WITH RECURSIVE hierarchy AS (
    SELECT id FROM public.cooperatives WHERE id = v_coop
    UNION ALL
    SELECT c.id
    FROM public.cooperatives c
    JOIN hierarchy h ON c.parent_id = h.id
  )
  SELECT array_agg(id) INTO v_ids FROM hierarchy;

  RETURN COALESCE(v_ids, '{}');
END;
$function$
;
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.role           IS DISTINCT FROM OLD.role
  OR NEW.haroo_type     IS DISTINCT FROM OLD.haroo_type
  OR NEW.cooperative_id IS DISTINCT FROM OLD.cooperative_id
  OR NEW.id             IS DISTINCT FROM OLD.id
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'::user_role
    ) THEN
      RAISE EXCEPTION
        'Role, couche Haroo et rattachement ne sont pas modifiables par leur titulaire';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE TRIGGER protect_profile_privileges_trg BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();
CREATE VIEW public.cooperative_stats AS SELECT id,name FROM public.cooperatives;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
DO $$ DECLARE t record; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.tablename); END LOOP; END $$;


CREATE TABLE public.academy_quiz_questions(id uuid,quiz_id uuid,question_type text,prompt text,explanation text,metadata jsonb,points integer,order_index integer,created_at timestamptz);
GRANT SELECT ON public.academy_quiz_questions TO anon,authenticated;
