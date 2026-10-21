// PAYG : les vraies migrations dans PGlite, puis les scénarios du cahier des charges.
// FENOMAT (institution, 10 agents, un portefeuille), MAPTO (autre institution), un opérateur
// individuel. Crédits offerts une fois, achat de 20 crédits, une carte = un crédit, aucun
// double débit, refus sans crédit, cloisonnement, quota gratuit historique, formation en tranches.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const MIGRATIONS = [
  '20260919084427_partner_capability_foundation.sql',
  '20260919131948_partner_billing_wallet.sql',
  '20260919133345_partner_billing_security_hardening.sql',
  '20260919140105_physical_card_business.sql',
  '20260921033406_free_card_allowance.sql',
  '20261021_100000_payg_operators.sql',
]

// Comptes
const ADMIN = 1
const FENOMAT_OWNER = 2
const AGENTS = Array.from({ length: 10 }, (_, i) => 10 + i) // 10 agents FENOMAT
const MAPTO_OWNER = 30
const MAPTO_AGENT = 31
const KOSSI = 40 // opérateur individuel
const UNCERTIFIED_AGENT = 41
// Opérateurs
const FENOMAT = 100
const MAPTO = 101
const KOSSI_P = 102
// Coopératives
const C1 = 200 // FENOMAT, agent 0
const C2 = 201 // FENOMAT, agent 1
const C3 = 202 // MAPTO
const C4 = 203 // Kossi

async function setup() {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    GRANT USAGE ON SCHEMA private TO authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.regions(id uuid PRIMARY KEY, name text);
    CREATE TABLE public.prefectures(id uuid PRIMARY KEY, region_id uuid, name text);
    CREATE TABLE public.academy_modules(id uuid PRIMARY KEY, title text);
    CREATE TABLE public.platform_settings(key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz DEFAULT now());
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, email text, role text NOT NULL DEFAULT 'none', deleted_at timestamptz);
    CREATE TABLE public.cooperatives(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE public.members(
      id uuid PRIMARY KEY, cooperative_id uuid NOT NULL REFERENCES public.cooperatives(id),
      first_name text NOT NULL, last_name text NOT NULL, email text, region text, deleted_at timestamptz);
    CREATE TABLE public.member_cards(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cooperative_id uuid REFERENCES public.cooperatives(id), member_id uuid REFERENCES public.members(id),
      card_number text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'active', expiry_date date, qr_data text,
      card_type text NOT NULL DEFAULT 'FAITIERE', deleted_at timestamptz, revoked_at timestamptz,
      revoked_reason text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX idx_member_cards_active_member ON public.member_cards(member_id) WHERE status = 'active';
    CREATE FUNCTION public.get_accessible_cooperative_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$ SELECT ARRAY[]::uuid[] $$;
    CREATE FUNCTION private.org_admin_access(target_coop uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin') $$;
    GRANT EXECUTE ON FUNCTION private.org_admin_access(uuid) TO authenticated;
  `)
  for (const file of MIGRATIONS) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))

  // Politiques de production sur members / member_cards (lecture et écriture déléguées).
  await db.exec(`
    ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.member_cards ENABLE ROW LEVEL SECURITY;
    CREATE POLICY members_read ON public.members FOR SELECT TO authenticated USING (
      private.org_admin_access(cooperative_id)
      OR has_partner_org_access(cooperative_id, 'members.read') OR has_partner_org_access(cooperative_id, 'members.manage'));
    CREATE POLICY cards_read ON public.member_cards FOR SELECT TO authenticated USING (
      private.org_admin_access(cooperative_id)
      OR has_partner_org_access(cooperative_id, 'cards.read') OR has_partner_org_access(cooperative_id, 'cards.manage'));
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT EXECUTE ON FUNCTION public.has_partner_org_access(uuid, public.partner_access_scope) TO authenticated;
  `)
  return db
}

async function seed(db) {
  const profiles = [ADMIN, FENOMAT_OWNER, ...AGENTS, MAPTO_OWNER, MAPTO_AGENT, KOSSI, UNCERTIFIED_AGENT]
  await db.exec(`
    INSERT INTO public.profiles(id, email, role) VALUES
      ${profiles.map((p) => `('${id(p)}','u${p}@test.tg','${p === ADMIN ? 'super_admin' : 'none'}')`).join(',')};
    INSERT INTO public.cooperatives VALUES
      ('${id(C1)}','Coop Kpalimé'),('${id(C2)}','Coop Atakpamé'),('${id(C3)}','Coop Dapaong'),('${id(C4)}','Coop Tsévié');
    INSERT INTO public.partners(id, partner_code, display_name, status, operator_kind) VALUES
      ('${id(FENOMAT)}','TG-FEN-001','FENOMAT','active','institutional'),
      ('${id(MAPTO)}','TG-MAP-001','MAPTO','active','institutional'),
      ('${id(KOSSI_P)}','TG-XX-001','Kossi Agro-Services','active','individual');
    INSERT INTO public.partner_memberships(partner_id, user_id, membership_role) VALUES
      ('${id(FENOMAT)}','${id(FENOMAT_OWNER)}','owner'),
      ${AGENTS.map((a) => `('${id(FENOMAT)}','${id(a)}','agent')`).join(',')},
      ('${id(FENOMAT)}','${id(UNCERTIFIED_AGENT)}','agent'),
      ('${id(MAPTO)}','${id(MAPTO_OWNER)}','owner'),
      ('${id(MAPTO)}','${id(MAPTO_AGENT)}','agent'),
      ('${id(KOSSI_P)}','${id(KOSSI)}','owner');
    INSERT INTO public.partner_certifications(user_id, partner_id, certified_at) VALUES
      ('${id(FENOMAT_OWNER)}','${id(FENOMAT)}', now()),
      ${AGENTS.map((a) => `('${id(a)}','${id(FENOMAT)}', now())`).join(',')},
      ('${id(UNCERTIFIED_AGENT)}','${id(FENOMAT)}', NULL),
      ('${id(MAPTO_OWNER)}','${id(MAPTO)}', now()),
      ('${id(MAPTO_AGENT)}','${id(MAPTO)}', now()),
      ('${id(KOSSI)}','${id(KOSSI_P)}', now());
  `)
  const mandates = [
    [FENOMAT, C1, 300],
    [FENOMAT, C2, 301],
    [MAPTO, C3, 302],
    [KOSSI_P, C4, 303],
  ]
  for (const [partner, coop, mandate] of mandates) {
    await db.exec(`
      INSERT INTO public.partner_organization_assignments(id, partner_id, cooperative_id)
        VALUES ('${id(mandate)}','${id(partner)}','${id(coop)}');
      INSERT INTO public.partner_assignment_scopes(assignment_id, scope)
        SELECT '${id(mandate)}', s::public.partner_access_scope
        FROM unnest(ARRAY['members.read','members.manage','cards.read','cards.manage','cards.print']) s;
    `)
  }
  // Agents FENOMAT : agent 0 → C1, agent 1 → C2, les autres → C1. Agent MAPTO → C3.
  await db.exec(`
    INSERT INTO public.partner_agent_cooperatives(partner_id, user_id, cooperative_id) VALUES
      ('${id(FENOMAT)}','${id(AGENTS[0])}','${id(C1)}'),
      ('${id(FENOMAT)}','${id(AGENTS[1])}','${id(C2)}'),
      ${AGENTS.slice(2)
        .map((a) => `('${id(FENOMAT)}','${id(a)}','${id(C1)}')`)
        .join(',')},
      ('${id(FENOMAT)}','${id(UNCERTIFIED_AGENT)}','${id(C1)}'),
      ('${id(MAPTO)}','${id(MAPTO_AGENT)}','${id(C3)}');
  `)
  // 30 producteurs par coopérative.
  let n = 1000
  for (const coop of [C1, C2, C3, C4]) {
    const rows = []
    for (let i = 0; i < 30; i++) rows.push(`('${id(n++)}','${id(coop)}','Prénom','Nom${i}','Plateaux')`)
    await db.exec(
      `INSERT INTO public.members(id, cooperative_id, first_name, last_name, region) VALUES ${rows.join(',')}`,
    )
  }
}

const memberOf = (coop, i) => id(1000 + [C1, C2, C3, C4].indexOf(coop) * 30 + i)
const json = async (db, sql) => (await db.query(sql)).rows[0].r
const issue = (db, { actor, partner, member, mode = 'commercial', number, key, format = 'pvc' }) =>
  json(
    db,
    `SELECT public.payg_issue_member_card('${id(actor)}','${id(partner)}','${member}','${mode}',
      '${number}', '2027-10-21', '${format}', 2500, '${key}') AS r`,
  )
const wallet = async (db, partner) =>
  (
    await db.query(
      `SELECT credit_balance, welcome_credits FROM public.partner_wallets WHERE partner_id = '${id(partner)}'`,
    )
  ).rows[0]
const count = async (db, sql) => (await db.query(sql)).rows[0].n

test('PAYG : institution, agents, crédits, cartes, cloisonnement, quota, formation', async (t) => {
  const db = await setup()
  t.after(() => db.close())
  // La migration se rejoue sans effet de bord.
  await db.exec(readFileSync('supabase/migrations/20261021_100000_payg_operators.sql', 'utf8'))
  await seed(db)

  await t.test('un portefeuille unique pour FENOMAT et ses 10 agents', async () => {
    assert.equal(
      await count(
        db,
        `SELECT count(*)::int AS n FROM public.partner_wallets WHERE partner_id = '${id(FENOMAT)}'`,
      ),
      1,
    )
    assert.equal(
      await count(
        db,
        `SELECT count(*)::int AS n FROM public.partner_memberships WHERE partner_id = '${id(FENOMAT)}' AND membership_role = 'agent'`,
      ),
      11,
    )
  })

  await t.test('10 crédits offerts à l’institution, une seule fois', async () => {
    const first = await json(db, `SELECT public.payg_grant_welcome_credits('${id(FENOMAT)}', NULL) AS r`)
    assert.equal(first.outcome, 'granted')
    const again = await json(db, `SELECT public.payg_grant_welcome_credits('${id(FENOMAT)}', NULL) AS r`)
    assert.equal(again.outcome, 'already_granted')
    assert.deepEqual(await wallet(db, FENOMAT), { credit_balance: 10, welcome_credits: 10 })
  })

  await t.test('chaque carte payante consomme exactement un crédit, les offerts d’abord', async () => {
    for (let i = 0; i < 10; i++) {
      const agent = AGENTS[i === 0 ? 0 : (i % 8) + 2] // agents de C1
      const r = await issue(db, {
        actor: agent,
        partner: FENOMAT,
        member: memberOf(C1, i),
        number: `FEN-${1000 + i}`,
        key: `issue-c1-${i}`,
      })
      assert.equal(r.outcome, 'issued', JSON.stringify(r))
      assert.equal(r.source, 'welcome')
      assert.equal(r.credit_balance, 9 - i)
    }
    assert.deepEqual(await wallet(db, FENOMAT), { credit_balance: 0, welcome_credits: 0 })
  })

  await t.test('sans crédit, l’émission payante est refusée et rien n’est créé', async () => {
    const cards = await count(db, 'SELECT count(*)::int AS n FROM public.member_cards')
    const ledger = await count(db, 'SELECT count(*)::int AS n FROM public.payg_credit_ledger')
    const r = await issue(db, {
      actor: AGENTS[0],
      partner: FENOMAT,
      member: memberOf(C1, 10),
      number: 'FEN-2000',
      key: 'issue-c1-10',
    })
    assert.equal(r.outcome, 'insufficient_credits')
    assert.equal(await count(db, 'SELECT count(*)::int AS n FROM public.member_cards'), cards)
    assert.equal(await count(db, 'SELECT count(*)::int AS n FROM public.payg_credit_ledger'), ledger)
  })

  await t.test('recharge : 20 crédits pour 5 000 FCFA, minimum 20, montant contrôlé', async () => {
    const low = await json(
      db,
      `SELECT public.payg_purchase_credits('${id(FENOMAT)}', 10, 2500, 'buy-low') AS r`,
    )
    assert.equal(low.outcome, 'below_minimum')
    const wrong = await json(
      db,
      `SELECT public.payg_purchase_credits('${id(FENOMAT)}', 20, 4000, 'buy-wrong') AS r`,
    )
    assert.equal(wrong.outcome, 'amount_mismatch')
    const ok = await json(
      db,
      `SELECT public.payg_purchase_credits('${id(FENOMAT)}', 20, 5000, 'buy-1', NULL, '${id(FENOMAT_OWNER)}') AS r`,
    )
    assert.equal(ok.outcome, 'applied')
    assert.equal(ok.credit_balance, 20)
    const replay = await json(
      db,
      `SELECT public.payg_purchase_credits('${id(FENOMAT)}', 20, 5000, 'buy-1') AS r`,
    )
    assert.equal(replay.outcome, 'already_applied')
    assert.deepEqual(await wallet(db, FENOMAT), { credit_balance: 20, welcome_credits: 0 })
  })

  await t.test('aucun double débit : même clé, même producteur, numéro déjà pris', async () => {
    const r = await issue(db, {
      actor: AGENTS[0],
      partner: FENOMAT,
      member: memberOf(C1, 10),
      number: 'FEN-2000',
      key: 'issue-c1-10b',
    })
    assert.equal(r.outcome, 'issued')
    assert.equal(r.source, 'purchased')
    assert.equal(r.credit_balance, 19)
    // Double clic : même clé, même carte, pas de second crédit.
    const replay = await issue(db, {
      actor: AGENTS[0],
      partner: FENOMAT,
      member: memberOf(C1, 10),
      number: 'FEN-2000',
      key: 'issue-c1-10b',
    })
    assert.equal(replay.outcome, 'already_issued')
    assert.equal(replay.member_card_id, r.member_card_id)
    // Autre clé, même producteur déjà carté : refusé, pas de crédit.
    const second = await issue(db, {
      actor: AGENTS[2],
      partner: FENOMAT,
      member: memberOf(C1, 10),
      number: 'FEN-2001',
      key: 'issue-c1-10c',
    })
    assert.equal(second.outcome, 'already_has_card')
    // Numéro déjà utilisé : l’opération échoue, le crédit n’est pas consommé.
    const clash = await issue(db, {
      actor: AGENTS[0],
      partner: FENOMAT,
      member: memberOf(C1, 11),
      number: 'FEN-2000',
      key: 'issue-c1-11',
    })
    assert.equal(clash.outcome, 'card_number_taken')
    assert.equal((await wallet(db, FENOMAT)).credit_balance, 19)
    assert.equal(
      await count(db, `SELECT count(*)::int AS n FROM public.card_commissions WHERE partner_id = '${id(FENOMAT)}'`),
      11,
    )
  })

  await t.test('la 11ᵉ carte d’une coopérative n’est plus bloquée par le quota gratuit', async () => {
    // C1 compte 11 cartes commerciales : le quota gratuit n’a pas bougé.
    const quota = await db.query(
      `SELECT cards_issued FROM private.cooperative_card_allowances WHERE cooperative_id = '${id(C1)}'`,
    )
    assert.equal(quota.rows.length ? quota.rows[0].cards_issued : 0, 0)
    // Les 10 cartes gratuites historiques restent disponibles, puis s’arrêtent net.
    for (let i = 0; i < 10; i++) {
      const r = await issue(db, {
        actor: KOSSI,
        partner: KOSSI_P,
        member: memberOf(C4, i),
        mode: 'free_allowance',
        number: `KOS-${i}`,
        key: `free-c4-${i}`,
        format: 'digital',
      })
      assert.equal(r.outcome, 'issued', JSON.stringify(r))
    }
    const eleventh = await issue(db, {
      actor: KOSSI,
      partner: KOSSI_P,
      member: memberOf(C4, 10),
      mode: 'free_allowance',
      number: 'KOS-10',
      key: 'free-c4-10',
      format: 'digital',
    })
    assert.equal(eleventh.outcome, 'free_allowance_exhausted')
    const left = (
      await db.query(
        `SELECT * FROM public.payg_free_card_allowance(ARRAY['${id(C4)}','${id(C2)}']::uuid[]) ORDER BY 1`,
      )
    ).rows
    assert.deepEqual(
      left.map((r) => [r.card_limit, r.cards_issued]),
      [
        [10, 0],
        [10, 10],
      ],
      'C2 (aucune carte gratuite) et C4 (10 utilisées)',
    )
    // Kossi n’a pas encore ses crédits offerts : la carte commerciale est refusée…
    const noCredit = await issue(db, {
      actor: KOSSI,
      partner: KOSSI_P,
      member: memberOf(C4, 10),
      number: 'KOS-10',
      key: 'paid-c4-10',
    })
    assert.equal(noCredit.outcome, 'insufficient_credits')
    // … puis acceptée avec ses 10 crédits offerts (pas de double gratuité : 9 restants).
    await db.query(`SELECT public.payg_grant_welcome_credits('${id(KOSSI_P)}', NULL)`)
    const paid = await issue(db, {
      actor: KOSSI,
      partner: KOSSI_P,
      member: memberOf(C4, 10),
      number: 'KOS-10',
      key: 'paid-c4-10b',
    })
    assert.equal(paid.outcome, 'issued')
    assert.deepEqual(await wallet(db, KOSSI_P), { credit_balance: 9, welcome_credits: 9 })
  })

  await t.test('un agent n’agit que sur ses coopératives, une institution jamais chez l’autre', async () => {
    const outside = await issue(db, {
      actor: AGENTS[0],
      partner: FENOMAT,
      member: memberOf(C2, 0),
      number: 'FEN-3000',
      key: 'agent0-c2',
    })
    assert.equal(outside.outcome, 'forbidden', 'agent 0 n’a pas C2')
    const inside = await issue(db, {
      actor: AGENTS[1],
      partner: FENOMAT,
      member: memberOf(C2, 0),
      number: 'FEN-3000',
      key: 'agent1-c2',
    })
    assert.equal(inside.outcome, 'issued')
    const cross = await issue(db, {
      actor: MAPTO_AGENT,
      partner: FENOMAT,
      member: memberOf(C1, 20),
      number: 'MAP-1',
      key: 'mapto-on-fenomat',
    })
    assert.equal(cross.outcome, 'forbidden', 'un agent MAPTO ne débite pas FENOMAT')
    const crossCoop = await issue(db, {
      actor: MAPTO_AGENT,
      partner: MAPTO,
      member: memberOf(C1, 20),
      number: 'MAP-2',
      key: 'mapto-on-c1',
    })
    assert.equal(crossCoop.outcome, 'forbidden', 'MAPTO n’a aucun mandat sur C1')
    const uncertified = await issue(db, {
      actor: UNCERTIFIED_AGENT,
      partner: FENOMAT,
      member: memberOf(C1, 21),
      number: 'FEN-4000',
      key: 'uncertified',
    })
    assert.equal(uncertified.outcome, 'forbidden', 'un agent non certifié n’émet pas')

    // Lecture (RLS) : chacun ne voit que ses producteurs.
    const as = (n) =>
      db.exec(
        `RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id(n)}',false)`,
      )
    const coopsSeen = async () =>
      (await db.query('SELECT DISTINCT cooperative_id FROM public.members ORDER BY 1')).rows.map(
        (r) => r.cooperative_id,
      )
    await as(AGENTS[0])
    assert.deepEqual(await coopsSeen(), [id(C1)])
    await as(AGENTS[1])
    assert.deepEqual(await coopsSeen(), [id(C2)])
    await as(FENOMAT_OWNER)
    assert.deepEqual(await coopsSeen(), [id(C1), id(C2)])
    await as(MAPTO_AGENT)
    assert.deepEqual(await coopsSeen(), [id(C3)])
    await as(UNCERTIFIED_AGENT)
    assert.deepEqual(await coopsSeen(), [])
    // Grand livre : l’agent ne voit que ses propres débits ; MAPTO ne voit rien de FENOMAT.
    await as(AGENTS[1])
    const own = await count(db, 'SELECT count(*)::int AS n FROM public.payg_credit_ledger')
    assert.equal(own, 1)
    await as(FENOMAT_OWNER)
    assert.ok((await count(db, 'SELECT count(*)::int AS n FROM public.payg_credit_ledger')) >= 13)
    await as(MAPTO_OWNER)
    assert.equal(
      await count(
        db,
        `SELECT count(*)::int AS n FROM public.payg_credit_ledger WHERE partner_id = '${id(FENOMAT)}'`,
      ),
      0,
    )
    assert.equal(
      await count(
        db,
        `SELECT count(*)::int AS n FROM public.partner_wallets WHERE partner_id = '${id(FENOMAT)}'`,
      ),
      0,
    )
    await db.exec('RESET ROLE')
  })

  await t.test('un agent retiré perd aussitôt l’accès', async () => {
    await db.exec(
      `UPDATE public.partner_memberships SET status = 'revoked' WHERE user_id = '${id(AGENTS[9])}'`,
    )
    assert.equal(
      await count(
        db,
        `SELECT count(*)::int AS n FROM public.partner_agent_cooperatives WHERE user_id = '${id(AGENTS[9])}' AND status = 'active'`,
      ),
      0,
    )
    const r = await issue(db, {
      actor: AGENTS[9],
      partner: FENOMAT,
      member: memberOf(C1, 22),
      number: 'FEN-5000',
      key: 'revoked-agent',
    })
    assert.equal(r.outcome, 'forbidden')
  })

  await t.test('carte émise par erreur : le super_admin rend le crédit, une seule fois', async () => {
    const card = (
      await db.query(`SELECT id FROM public.member_cards WHERE card_number = 'FEN-3000'`)
    ).rows[0].id
    const before = (await wallet(db, FENOMAT)).credit_balance
    const denied = await json(
      db,
      `SELECT public.payg_release_card_commission('${card}', '${id(FENOMAT_OWNER)}', 'erreur de saisie') AS r`,
    )
    assert.equal(denied.outcome, 'forbidden')
    const ok = await json(
      db,
      `SELECT public.payg_release_card_commission('${card}', '${id(ADMIN)}', 'erreur de saisie') AS r`,
    )
    assert.equal(ok.outcome, 'released')
    assert.equal((await wallet(db, FENOMAT)).credit_balance, before + 1)
    const twice = await json(
      db,
      `SELECT public.payg_release_card_commission('${card}', '${id(ADMIN)}', 'encore') AS r`,
    )
    assert.equal(twice.outcome, 'already_released')
    const status = (await db.query(`SELECT status FROM public.member_cards WHERE id = '${card}'`))
      .rows[0].status
    assert.equal(status, 'revoked')
  })

  await t.test('formation : 15 000 en 5 tranches de 3 000, séparée des crédits', async () => {
    const credits = (await wallet(db, FENOMAT)).credit_balance
    await db.exec(`
      INSERT INTO public.training_fee_accounts(id, user_id, partner_id, payer)
        VALUES ('${id(500)}','${id(AGENTS[2])}','${id(FENOMAT)}','institution')
        ON CONFLICT (user_id) DO NOTHING;
    `)
    const account = (
      await db.query(
        `SELECT id FROM public.training_fee_accounts WHERE user_id = '${id(AGENTS[2])}'`,
      )
    ).rows[0].id
    const pay = (amount, key) =>
      json(
        db,
        `SELECT public.payg_record_training_payment('${account}', ${amount}, 'manual', '${key}') AS r`,
      )
    assert.equal((await pay(2500, 't-bad')).outcome, 'invalid_amount')
    for (let i = 1; i <= 5; i++) {
      const r = await pay(3000, `t-${i}`)
      assert.equal(r.outcome, 'applied')
      assert.equal(r.paid_fcfa, 3000 * i)
      assert.equal(r.status, i === 5 ? 'paid' : 'partial')
    }
    assert.equal((await pay(3000, 't-6')).outcome, 'already_paid')
    assert.equal((await pay(3000, 't-1')).outcome, 'already_applied')
    // En une fois pour un autre agent.
    await db.exec(`
      INSERT INTO public.training_fee_accounts(user_id, partner_id) VALUES ('${id(AGENTS[3])}','${id(FENOMAT)}')
        ON CONFLICT (user_id) DO NOTHING`)
    const other = (
      await db.query(
        `SELECT id FROM public.training_fee_accounts WHERE user_id = '${id(AGENTS[3])}'`,
      )
    ).rows[0].id
    const full = await json(
      db,
      `SELECT public.payg_record_training_payment('${other}', 15000, 'manual', 't-full') AS r`,
    )
    assert.equal(full.status, 'paid')
    assert.equal((await wallet(db, FENOMAT)).credit_balance, credits, 'les crédits ne bougent pas')
  })

  await t.test('les grands livres sont en ajout seul et les indicateurs les reflètent', async () => {
    await assert.rejects(db.exec('UPDATE public.payg_credit_ledger SET credits = 99'), /ajout seul/)
    await assert.rejects(db.exec('DELETE FROM public.payg_credit_ledger'), /ajout seul/)
    await assert.rejects(db.exec('DELETE FROM public.training_fee_payments'), /ajout seul/)
    const o = await json(db, 'SELECT public.payg_admin_overview() AS r')
    assert.equal(o.operators.institutional_active, 2)
    assert.equal(o.operators.individual_active, 1)
    assert.equal(o.credits.purchased, 20)
    assert.equal(o.credits.purchased_fcfa, 5000)
    // FENOMAT : 10 offertes + 2 achetées (dont 1 rendue) ; Kossi : 1 offerte.
    assert.equal(o.credits.consumed_welcome, 11)
    assert.equal(o.credits.consumed_purchased, 1)
    assert.equal(o.commissions_earned_fcfa, 250)
    assert.equal(o.recharge.first, 1)
    assert.equal(o.recharge.second, 0)
    assert.equal(o.training.paid, 2)
    const fen = o.agents_by_institution.find((x) => x.name === 'FENOMAT')
    assert.equal(fen.agents, 10, 'l’agent retiré ne compte plus')
  })
})
