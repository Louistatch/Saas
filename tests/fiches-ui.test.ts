/**
 * Parcours d'achat et dépôt côté navigateur (UI U1–U12) : règles pures
 * partagées par la fenêtre d'achat, la page d'achat et l'administration.
 *   - libellés et formats de la vitrine (lib/fiches/types.ts) ;
 *   - achats gardés sur l'appareil (lib/fiches/local-purchases.ts) ;
 *   - suivi borné du paiement (lib/fiches/payment-tracking.ts) ;
 *   - envoi du formulaire « Payer » (lib/fiches/purchase-submit.ts) ;
 *   - dépôt : noms d'objets, contrôles, erreurs, validation (lib/fiches/upload*.ts).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { validateFichePath } from '../lib/fiches/files'
import {
  LOCAL_PURCHASES_KEY,
  MAX_LOCAL_PURCHASES,
  RESUME_WINDOW_MS,
  dismissLocalPurchase,
  forgetLocalPurchase,
  parseLocalPurchases,
  readLocalPurchases,
  rememberPurchase,
  resumableFor,
  upsertLocalPurchase,
} from '../lib/fiches/local-purchases'
import {
  LATE_POLL_MS,
  LATE_WATCH_MS,
  POLL_BASE_MS,
  POLL_WINDOW_MS,
  feeNote,
  lateWatchActive,
  maskMobileMoneyPhone,
  newPurchaseHref,
  nextPollDelay,
  payStateOf,
  payStateOfReply,
  pollExpired,
  purchaseReference,
  purchaseUrl,
  supportBuyWhatsappUrl,
  supportWhatsappUrl,
  whatsappShareUrl,
} from '../lib/fiches/payment-tracking'
import {
  PROVIDERS_UNAVAILABLE,
  RESUMED_NOTE,
  SANDBOX_TEST_COUNTRY,
  SANDBOX_TEST_NUMBERS,
  buyErrorOf,
  createSubmitLock,
  phoneSample,
  pickProvider,
  providersFromReply,
  providersOf,
  replyStillShown,
  sandboxTestBuyer,
  trackingFromReply,
} from '../lib/fiches/purchase-submit'
import {
  formatFcfa,
  formatFileSize,
  labelFicheStatus,
  labelFileType,
  priceLabel,
  summarizeFiles,
} from '../lib/fiches/types'
import {
  MIME_BY_EXT,
  checkUploadFile,
  draftPayload,
  sanitizeStorageName,
  serverFieldErrors,
  translateStorageError,
  uniqueStorageName,
  validateFicheDraft,
} from '../lib/fiches/upload'
import { type UploadStorage, uploadFicheCover, uploadFicheFiles } from '../lib/fiches/upload-client'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.test'

const NBSP = ' ' // séparateur de milliers fr-FR
const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const F1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const F2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

class MemoryStorage {
  data = new Map<string, string>()
  failWrites = false
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new Error('QuotaExceededError')
    this.data.set(k, v)
  }
}

// ── U7 : vitrine ────────────────────────────────────────────────────────────

test('U7 : prix formaté à la française, « Gratuit » pour 0', () => {
  assert.equal(formatFcfa(1000), `1${NBSP}000 FCFA`)
  assert.equal(formatFcfa(250000), `250${NBSP}000 FCFA`)
  assert.equal(priceLabel(0), 'Gratuit')
  assert.equal(priceLabel(-5), 'Gratuit')
  assert.equal(priceLabel(1500), `1${NBSP}500 FCFA`)
})

test('U7 : contenu du livrable en une ligne (format, nombre, taille)', () => {
  assert.equal(
    summarizeFiles([{ type: 'xlsx', size: 48 * 1024 }]),
    '1 fichier Excel (.xlsx) · 48 Ko',
  )
  assert.equal(
    summarizeFiles([
      { type: 'xlsx', size: 600 * 1024 },
      { type: 'pdf', size: 650 * 1024 },
    ]),
    '2 fichiers : Excel (.xlsx), PDF · 1,2 Mo',
  )
  // Taille inconnue pour un fichier : pas de total trompeur.
  assert.equal(
    summarizeFiles([
      { type: 'docx', size: null },
      { type: 'docx', size: 10 },
    ]),
    '2 fichiers Word (.docx)',
  )
  assert.equal(summarizeFiles([]), null)
  assert.equal(summarizeFiles(undefined), null)
  assert.equal(labelFileType('XLSX'), 'Excel (.xlsx)')
  assert.equal(labelFileType('csv'), '.csv')
  assert.equal(formatFileSize(10), '1 Ko')
  assert.equal(formatFileSize(null), null)
})

test('U12 : statut partagé — un brouillon n’est jamais « Archivé »', () => {
  assert.equal(labelFicheStatus('draft'), 'Brouillon')
  assert.equal(labelFicheStatus('published'), 'Publiée')
  assert.equal(labelFicheStatus('archived'), 'Retirée')
})

// ── U1 : achats gardés sur l'appareil ─────────────────────────────────────

test('U1 : lecture tolérante (JSON cassé, entrées malformées ignorées)', () => {
  assert.deepEqual(parseLocalPurchases('{pas du json'), [])
  assert.deepEqual(parseLocalPurchases('{"a":1}'), [])
  const list = parseLocalPurchases(
    JSON.stringify([
      { purchaseId: P1, ficheId: F1, title: 'Maïs', createdAt: '2026-10-18T10:00:00Z' },
      { purchaseId: 'pas-un-uuid', ficheId: F1, title: 'x', createdAt: '2026-10-18T10:00:00Z' },
      { purchaseId: P2, ficheId: F1, title: 'x', createdAt: 'hier' },
      null,
    ]),
  )
  assert.equal(list.length, 1)
  assert.equal(list[0]?.purchaseId, P1)
})

test('U1 : un seul exemplaire par achat, le plus récent en tête, liste plafonnée', () => {
  let list = upsertLocalPurchase([], {
    purchaseId: P1,
    ficheId: F1,
    title: 'A',
    createdAt: '2026-10-18T09:00:00Z',
  })
  list = upsertLocalPurchase(list, {
    purchaseId: P2,
    ficheId: F2,
    title: 'B',
    createdAt: '2026-10-18T10:00:00Z',
  })
  // Réécriture de P1 : la date d'origine est conservée.
  list = upsertLocalPurchase(list, {
    purchaseId: P1,
    ficheId: F1,
    title: 'A (titre à jour)',
    createdAt: '2026-10-18T11:00:00Z',
  })
  assert.deepEqual(
    list.map((p) => [p.purchaseId, p.title, p.createdAt]),
    [
      [P2, 'B', '2026-10-18T10:00:00Z'],
      [P1, 'A (titre à jour)', '2026-10-18T09:00:00Z'],
    ],
  )
  let many = list
  for (let i = 0; i < 30; i++)
    many = upsertLocalPurchase(many, {
      purchaseId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      ficheId: F1,
      title: `n${i}`,
      createdAt: new Date(Date.UTC(2026, 9, 18, 12, i)).toISOString(),
    })
  assert.equal(many.length, MAX_LOCAL_PURCHASES)
})

test('U1 : reprise seulement pour la même fiche, moins de 24 h, non écartée', () => {
  const now = Date.parse('2026-10-18T12:00:00Z')
  const list = [
    { purchaseId: P1, ficheId: F1, title: 'A', createdAt: '2026-10-18T11:00:00Z' },
    { purchaseId: P2, ficheId: F2, title: 'B', createdAt: '2026-10-18T11:30:00Z' },
  ]
  assert.equal(resumableFor(list, F1, now)?.purchaseId, P1)
  assert.equal(resumableFor(list, F1, now + RESUME_WINDOW_MS), null)
  assert.equal(resumableFor([{ ...list[0], dismissed: true } as never], F1, now), null)
  assert.equal(resumableFor(list, 'autre', now), null)
})

test('U1 : écrire, écarter (« ce n’est pas moi »), oublier — sans jamais lever', () => {
  const s = new MemoryStorage()
  assert.equal(rememberPurchase({ purchaseId: P1, ficheId: F1, title: 'Maïs' }, s), true)
  assert.equal(readLocalPurchases(s).length, 1)
  const stored = JSON.parse(s.data.get(LOCAL_PURCHASES_KEY) ?? '[]')
  // Rien d'autre que l'id d'achat, la fiche, le titre et la date.
  assert.deepEqual(Object.keys(stored[0]).sort(), ['createdAt', 'ficheId', 'purchaseId', 'title'])

  assert.equal(dismissLocalPurchase(P1, s), true)
  assert.equal(readLocalPurchases(s)[0]?.dismissed, true)
  assert.equal(resumableFor(readLocalPurchases(s), F1), null)
  assert.equal(forgetLocalPurchase(P1, s), true)
  assert.deepEqual(readLocalPurchases(s), [])

  // Stockage plein ou bloqué : false, pas d'exception ; id invalide refusé.
  s.failWrites = true
  assert.equal(rememberPurchase({ purchaseId: P2, ficheId: F1, title: 'x' }, s), false)
  assert.equal(
    rememberPurchase({ purchaseId: 'x', ficheId: F1, title: 'x' }, new MemoryStorage()),
    false,
  )
  const broken = {
    getItem: () => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('SecurityError')
    },
  }
  assert.deepEqual(readLocalPurchases(broken), [])
  assert.equal(rememberPurchase({ purchaseId: P1, ficheId: F1, title: 'x' }, broken), false)
})

// ── U13 : « Payer » — une seule requête, réponse dans la bonne fenêtre ────

test('U13 : verrou d’envoi — double clic dans le même tour : une requête ; libéré après une erreur', async () => {
  const lock = createSubmitLock()
  let requests = 0
  let fail = true
  // Même ordre que handleBuy : verrou pris AVANT le premier await, rendu dans finally.
  const submit = async (ficheId: string) => {
    if (!lock.tryAcquire(ficheId)) return 'ignoré'
    try {
      await Promise.resolve()
      requests++
      if (fail) throw new Error('réseau')
      return 'envoyé'
    } catch {
      return 'erreur'
    } finally {
      lock.release(ficheId)
    }
  }
  assert.deepEqual(await Promise.all([submit(F1), submit(F1)]), ['erreur', 'ignoré'])
  assert.equal(requests, 1)
  assert.equal(lock.isHeld(F1), false, 'rendu après l’erreur')
  fail = false
  assert.equal(await submit(F1), 'envoyé')
  // Par fiche : la requête en vol d'une fiche ne bloque pas une autre fiche.
  assert.equal(lock.tryAcquire(F1), true)
  assert.equal(lock.tryAcquire(F2), true)
  assert.equal(lock.tryAcquire(F1), false)
})

test('U13 : réponse tardive affichée seulement dans la fenêtre ouverte de SA fiche', () => {
  assert.equal(replyStillShown({ open: true, ficheId: F1 }, F1), true)
  assert.equal(replyStillShown({ open: false, ficheId: F1 }, F1), false)
  assert.equal(replyStillShown({ open: true, ficheId: F2 }, F1), false)
  assert.equal(replyStillShown({ open: true, ficheId: null }, F1), false)
})

test('U13 : paiement repris → mode « repris », sans promettre de nouvelle demande au téléphone', () => {
  // Réponse du serveur quand un autre onglet a déjà lancé le paiement.
  const resumed = trackingFromReply({ purchase_id: P1, resumed: true } as never)
  assert.deepEqual(resumed, { mode: 'resumed', note: RESUMED_NOTE })
  assert.match(RESUMED_NOTE, /validez-le sur votre téléphone/)
  assert.doesNotMatch(RESUMED_NOTE, /FedaPay/)
  assert.deepEqual(trackingFromReply({ direct: true } as never), { mode: 'direct', note: null })
  // Une réponse ancienne avec un lien n'ouvre jamais de page FedaPay : suivi direct.
  assert.deepEqual(trackingFromReply({ url: 'https://pay.test/x' } as never), {
    mode: 'direct',
    note: null,
  })
})

// ── U14 : paiement toujours sur le site (FedaPay direct) ──────────────────

const FP_REPLY = {
  environment: 'live',
  configured: true,
  providers: [
    { id: 'mtn_bj', label: 'MTN Mobile Money', country: 'bj', mode: 'direct' },
    { id: 'moov_bj', label: 'Moov Money (Flooz)', country: 'bj', mode: 'direct' },
    { id: 'celtiis_bj', label: 'Celtiis Cash', country: 'bj', mode: 'direct' },
    { id: 'moov_tg', label: 'Moov Money (Flooz)', country: 'tg', mode: 'direct' },
    { id: 'togocel_tg', label: 'Mixx by Yas (T-Money)', country: 'tg', mode: 'direct' },
  ],
}

test('U14 : opérateurs = la réponse de l’API, par pays, jamais une page FedaPay', () => {
  const ready = providersFromReply(200, FP_REPLY)
  assert.equal(ready.kind, 'ready')
  if (ready.kind !== 'ready') return
  assert.equal(ready.environment, 'live')
  assert.deepEqual(
    providersOf(ready.providers, 'tg').map((p) => p.label),
    ['Moov Money (Flooz)', 'Mixx by Yas (T-Money)'],
  )
  assert.deepEqual(
    providersOf(ready.providers, 'bj').map((p) => p.label),
    ['MTN Mobile Money', 'Moov Money (Flooz)', 'Celtiis Cash'],
  )
  // Un opérateur en mode « checkout » (page FedaPay) ou malformé n'est jamais proposé.
  const mixed = providersFromReply(200, {
    environment: 'sandbox',
    providers: [
      { id: 'moov_tg', label: 'Moov Money (Flooz)', country: 'tg', mode: 'checkout' },
      { id: 'togocel_tg', label: 'Mixx by Yas (T-Money)', country: 'tg', mode: 'direct' },
      { id: 'x', label: '', country: 'tg', mode: 'direct' },
      { id: 'y', label: 'Y', country: 'ci', mode: 'direct' },
    ],
  })
  assert.equal(mixed.kind, 'ready')
  if (mixed.kind === 'ready') {
    assert.equal(mixed.environment, 'sandbox')
    assert.deepEqual(
      mixed.providers.map((p) => p.id),
      ['togocel_tg'],
    )
  }
  // Environnement inconnu → live : la note « Mode test » ne s'affiche jamais par défaut.
  const unknownEnv = providersFromReply(200, { ...FP_REPLY, environment: 'test' })
  assert.equal(unknownEnv.kind === 'ready' && unknownEnv.environment, 'live')
})

test('U14 : liste vide ou 503 → pas de formulaire ; erreur passagère → réessayer, sans liste de secours', () => {
  assert.deepEqual(
    providersFromReply(503, {
      error: 'Le paiement Mobile Money est momentanément indisponible. Réessayez plus tard.',
      providers: [],
    }),
    {
      kind: 'unavailable',
      message: 'Le paiement Mobile Money est momentanément indisponible. Réessayez plus tard.',
    },
  )
  assert.deepEqual(providersFromReply(200, { environment: 'live', providers: [] }), {
    kind: 'unavailable',
    message: PROVIDERS_UNAVAILABLE,
  })
  assert.deepEqual(providersFromReply(500, null), { kind: 'error' })
  assert.deepEqual(providersFromReply(429, {}), { kind: 'error' })
  // Fenêtre : aucune liste codée en dur, aucune variante « page FedaPay ».
  const dialog = readFileSync(
    path.join(__dirname, '..', 'components', 'marketplace', 'fiche-access-dialog.tsx'),
    'utf8',
  )
  assert.ok(!dialog.includes('FEDAPAY_PROVIDERS'), 'pas de liste de secours')
  assert.ok(!/checkout|page FedaPay|page de paiement/i.test(dialog))
})

test('U14 : opérateur gardé s’il existe dans le pays ; jamais présélectionné parmi plusieurs', () => {
  const ready = providersFromReply(200, FP_REPLY)
  const list = ready.kind === 'ready' ? ready.providers : []
  assert.equal(pickProvider(list, 'tg', 'togocel_tg'), 'togocel_tg')
  // Togo (Moov, Mixx by Yas) et Bénin (3) : l'acheteur choisit lui-même.
  assert.equal(pickProvider(list, 'tg', ''), '')
  assert.equal(pickProvider(list, 'tg', 'mtn_bj'), '')
  assert.equal(pickProvider(list, 'bj', ''), '')
  // Un seul opérateur proposé dans le pays : il est choisi.
  const onlyYas = list.filter((p) => p.id !== 'moov_tg')
  assert.equal(pickProvider(onlyYas, 'tg', ''), 'togocel_tg')
  assert.equal(pickProvider([], 'bj', 'mtn_bj'), '')
})

test('U14 : exemple de numéro cohérent avec l’opérateur choisi, neutre sans opérateur', () => {
  assert.equal(phoneSample('tg', 'moov_tg'), '96 00 00 00')
  assert.equal(phoneSample('tg', 'togocel_tg'), '90 00 00 00')
  assert.equal(phoneSample('tg', ''), '00 00 00 00')
  assert.equal(phoneSample('bj', 'mtn_bj'), '01 97 00 00 00')
  assert.equal(phoneSample('bj', 'moov_bj'), '01 95 00 00 00')
  assert.equal(phoneSample('bj', 'celtiis_bj'), '01 00 00 00 00')
  assert.equal(phoneSample('bj', ''), '01 00 00 00 00')
  // Formulaire : pas d'opérateur au départ, exemple d'après l'opérateur choisi.
  const dialog = readFileSync(
    path.join(__dirname, '..', 'components', 'marketplace', 'fiche-access-dialog.tsx'),
    'utf8',
  )
  assert.ok(dialog.includes('placeholder={phoneSample(buyer.country, buyer.provider)}'))
  assert.ok(dialog.includes("    provider: '',\n"))
})

test('U14 : erreur d’envoi → message, champ en cause, autre opérateur proposé', () => {
  assert.deepEqual(
    buyErrorOf(400, {
      error: 'Numéro Mobile Money invalide',
      details: { phone: ['Numéro togolais : 8 chiffres, sans l’indicatif +228.'] },
    }),
    {
      text: 'Numéro togolais : 8 chiffres, sans l’indicatif +228.',
      field: 'phone',
      tryOther: false,
    },
  )
  assert.deepEqual(
    buyErrorOf(400, {
      error: 'x',
      details: {
        provider: ['Celtiis Cash est momentanément indisponible : choisissez un autre opérateur.'],
      },
    }),
    {
      text: 'Celtiis Cash est momentanément indisponible : choisissez un autre opérateur.',
      field: 'provider',
      tryOther: true,
    },
  )
  // 502 sans achat : l'opérateur n'a pas lancé la demande → un autre opérateur est proposé.
  const sendFailed = buyErrorOf(502, {
    error: 'L’opérateur n’a pas pu lancer le paiement. Vérifiez le numéro et réessayez.',
  })
  assert.equal(sendFailed.tryOther, true)
  assert.match(sendFailed.text, /Vérifiez le numéro/)
  assert.equal(buyErrorOf(502, {}).tryOther, true)
  // Paiement déjà en cours, trop d'essais : le message du serveur, sans autre opérateur.
  const busy = buyErrorOf(409, {
    error:
      'Un paiement est déjà en cours pour ce numéro : validez-le sur votre téléphone ou réessayez dans quelques minutes.',
  })
  assert.equal(busy.tryOther, false)
  assert.match(busy.text, /déjà en cours/)
  assert.match(buyErrorOf(500, null).text, /Réessayez dans quelques minutes/)
})

test('U14 : numéro masqué sur l’écran d’attente', () => {
  assert.equal(maskMobileMoneyPhone('tg', '90 12 34 56'), '+228 90 •• •• 56')
  assert.equal(maskMobileMoneyPhone('tg', '+228 90123456'), '+228 90 •• •• 56')
  assert.equal(maskMobileMoneyPhone('bj', '01 97 00 00 01'), '+229 01 97 •• •• 01')
  assert.equal(maskMobileMoneyPhone('bj', '97000001'), '+229 97 •• •• 01')
  assert.equal(maskMobileMoneyPhone('tg', 'abc'), '+228 ••••')
})

test('U14 : frais — montant débité de FedaPay, sinon « des frais peuvent s’ajouter »', () => {
  const nb = (s: string) => s.replace(/\u202f|\u00a0/g, ' ')
  assert.equal(
    nb(feeNote({ amount: 1000, amount_debited: 1042, fees: 42 })),
    'Montant débité : 1 042 FCFA, dont 42 FCFA de frais d’opérateur.',
  )
  assert.equal(
    nb(feeNote({ amount: 1000, amount_debited: 1042, fees: null })),
    'Montant débité : 1 042 FCFA, dont 42 FCFA de frais d’opérateur.',
  )
  assert.equal(
    nb(feeNote({ amount: 1000, amount_debited: 1000, fees: 0 })),
    'Montant débité : 1 000 FCFA, sans frais d’opérateur.',
  )
  for (const unknown of [
    { amount: 1000, amount_debited: null, fees: null },
    { amount: 1000 },
    { amount: 1000, amount_debited: 900, fees: null },
  ])
    assert.equal(feeNote(unknown), 'Des frais d’opérateur peuvent s’ajouter.')
})

test('U14 : état affiché d’après `state` du serveur (expirée ≠ refusée), jamais de faux succès', () => {
  assert.equal(payStateOfReply({ state: 'expired', status: 'failed' }), 'expired')
  assert.equal(payStateOfReply({ state: 'failed', status: 'failed' }), 'failed')
  assert.equal(
    payStateOfReply({ state: 'completed', status: 'completed', access_granted: true }),
    'completed',
  )
  assert.equal(payStateOfReply({ state: 'completed', access_granted: false }), 'pending')
  // Réponse sans `state` (ancienne) : le statut brut.
  assert.equal(payStateOfReply({ status: 'refunded' }), 'refunded')
  assert.equal(payStateOfReply({ state: 'bizarre', status: 'pending' }), 'pending')
  assert.equal(payStateOfReply({}), 'pending')
})

test('U14 : après un refus, relecture en arrière-plan bornée (paiement tardif)', () => {
  assert.equal(LATE_POLL_MS, 15_000)
  assert.equal(lateWatchActive(0, 0), true)
  assert.equal(lateWatchActive(0, LATE_WATCH_MS - 1), true)
  assert.equal(lateWatchActive(0, LATE_WATCH_MS), false)
  assert.equal(lateWatchActive(10_000, 0), false, 'horloge revenue en arrière')
})

test('U14 : mode test — numéros officiels du Sandbox, affichés seulement en sandbox', () => {
  assert.deepEqual([...SANDBOX_TEST_NUMBERS], ['64000001', '66000001'])
  // Numéros du Bénin (documentation FedaPay : pays « bj ») : un clic passe au Bénin.
  assert.equal(SANDBOX_TEST_COUNTRY, 'bj')
  const ready = providersFromReply(200, FP_REPLY)
  const list = ready.kind === 'ready' ? ready.providers : []
  const togo = { name: 'Test', phone: '', country: 'tg' as const, provider: 'moov_tg' }
  assert.deepEqual(sandboxTestBuyer(togo, list, '64000001'), {
    name: 'Test',
    phone: '64000001',
    country: 'bj',
    provider: 'mtn_bj',
  })
  // Opérateur du Bénin déjà choisi : gardé.
  assert.equal(
    sandboxTestBuyer({ ...togo, country: 'bj', provider: 'celtiis_bj' }, list, '66000001').provider,
    'celtiis_bj',
  )
  const dialog = readFileSync(
    path.join(__dirname, '..', 'components', 'marketplace', 'fiche-access-dialog.tsx'),
    'utf8',
  )
  assert.ok(
    dialog.includes("providersState.kind === 'ready' && providersState.environment === 'sandbox'"),
  )
  assert.ok(dialog.includes('{sandbox ? ('))
})

test('U14 : aucun écran ne montre FedaPay (ni cadre, ni nouvel onglet vers FedaPay)', () => {
  for (const file of [
    ['components', 'marketplace', 'fiche-access-dialog.tsx'],
    ['components', 'marketplace', 'purchase-tracker.tsx'],
    ['app', 'marketplace', 'achat', '[purchaseId]', 'page.tsx'],
    ['lib', 'fiches', 'purchase-submit.ts'],
  ]) {
    const src = readFileSync(path.join(__dirname, '..', ...file), 'utf8')
    const name = file.join('/')
    assert.ok(!/<iframe/i.test(src), `${name} : pas d’iframe`)
    assert.ok(!/checkoutUrl|'iframe'/.test(src), `${name} : pas de mode iframe`)
    assert.ok(!/nouvel onglet/i.test(src), `${name} : pas de lien « nouvel onglet »`)
    assert.ok(!/fedapay\.com/i.test(src), `${name} : aucun lien FedaPay`)
  }
  assert.ok(supportBuyWhatsappUrl('Maïs').startsWith('https://wa.me/22892548838?text='))
  // Le navigateur refuse tout cadre FedaPay (CSP frame-src).
  const config = readFileSync(path.join(__dirname, '..', 'next.config.mjs'), 'utf8')
  const frameSrc = config.match(/"frame-src[^"]*"/)?.[0] ?? ''
  assert.ok(frameSrc.startsWith('"frame-src'), 'frame-src présent')
  assert.ok(!/fedapay/i.test(frameSrc), `aucun cadre FedaPay : ${frameSrc}`)
})

test('U15 : nouvelle demande explicite — jamais de reprise ; reprise seulement à l’ouverture', () => {
  const dialog = readFileSync(
    path.join(__dirname, '..', 'components', 'marketplace', 'fiche-access-dialog.tsx'),
    'utf8',
  )
  // L'envoi ne joint resume_purchase_id que hors relance explicite.
  assert.ok(
    dialog.includes(
      'const resume = freshRef.current ? null : resumableFor(readLocalPurchases(), forFiche.id)',
    ),
  )
  // Réessayer / Recevoir une nouvelle demande / Ce n'est pas moi : relance explicite.
  const retry = dialog.slice(dialog.indexOf('const retryPurchase = useCallback('))
  assert.ok(retry.slice(0, 200).includes('freshRef.current = true'))
  assert.ok(
    dialog.includes(
      'dismissLocalPurchase(view.purchaseId)\n                      freshRef.current = true',
    ),
  )
  // Lien « nouvel_achat=1 » : formulaire direct, sans reprise à l'ouverture.
  assert.ok(dialog.includes('freshRef.current = startFreshRef.current'))
  assert.ok(dialog.includes('current.price_non_member > 0 && !freshRef.current'))
  assert.equal(
    newPurchaseHref('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    '/marketplace?fiche=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&nouvel_achat=1',
  )
  const page = readFileSync(
    path.join(__dirname, '..', 'app', 'marketplace', 'achat', '[purchaseId]', 'page.tsx'),
    'utf8',
  )
  assert.ok(page.includes('retry={{ href: newPurchaseHref(info.fiche_id) }}'))
  const grid = readFileSync(
    path.join(__dirname, '..', 'components', 'marketplace', 'fiche-grid.tsx'),
    'utf8',
  )
  assert.ok(
    grid.includes('startFresh={selectedFiche !== null && freshFicheId === selectedFiche.id}'),
  )
  const market = readFileSync(path.join(__dirname, '..', 'app', 'marketplace', 'page.tsx'), 'utf8')
  assert.ok(market.includes("searchParams.get('nouvel_achat') === '1'"))
})

test('U15 : écrans d’attente — « Envoyer une nouvelle demande » dès que can_retry, « Recevoir une nouvelle demande » après 5 min', () => {
  const tracker = readFileSync(
    path.join(__dirname, '..', 'components', 'marketplace', 'purchase-tracker.tsx'),
    'utf8',
  )
  assert.ok(tracker.includes('{retry && info?.can_retry ? ('))
  assert.ok(tracker.includes('Envoyer une nouvelle demande'))
  assert.ok(tracker.includes('Recevoir une nouvelle demande'))
  assert.ok(!tracker.includes('Recommencer avec un autre numéro'))
})

test('U15 : paiement tardif pendant un nouvel envoi — les fichiers restent, jamais de 2e demande à valider', () => {
  const dialog = readFileSync(
    path.join(__dirname, '..', 'components', 'marketplace', 'fiche-access-dialog.tsx'),
    'utf8',
  )
  // Rappel tardif : note « refusez la nouvelle demande » quand un envoi est en cours.
  assert.ok(dialog.includes('buyLock.isHeld(entry.ficheId)'))
  assert.ok(dialog.includes('lateTookOverRef.current = entry.ficheId'))
  // Réponse de l'envoi : l'écran des fichiers n'est pas remplacé par le suivi.
  const start = dialog.indexOf('const handleBuy = useCallback(')
  const body = dialog.slice(start, dialog.indexOf('\n  )\n', start))
  const guard = body.indexOf('if (lateTookOverRef.current === forFiche.id) return')
  assert.ok(guard > body.indexOf('if (!isShown(forFiche.id)) return'))
  assert.ok(guard < body.indexOf('setView('), 'garde avant tout changement d’écran')
})

test('U13 : fenêtre d’achat — verrou avant le 1er await, rendu dans finally, fiche gardée à l’envoi', () => {
  const src = readFileSync(
    path.join(__dirname, '..', 'components', 'marketplace', 'fiche-access-dialog.tsx'),
    'utf8',
  )
  const start = src.indexOf('const handleBuy = useCallback(')
  assert.ok(start > 0, 'handleBuy introuvable')
  const body = src.slice(start, src.indexOf('\n  )\n', start))
  const at = (needle: string) => {
    const i = body.indexOf(needle)
    assert.ok(i >= 0, `absent de handleBuy : ${needle}`)
    return i
  }
  const firstAwait = at('await ')
  assert.ok(at('e.preventDefault()') < at('buyLock.tryAcquire(forFiche.id)'))
  assert.ok(at('buyLock.tryAcquire(forFiche.id)') < firstAwait, 'verrou pris avant le 1er await')
  const finallyAt = at('} finally {')
  assert.ok(at('buyLock.release(forFiche.id)') > finallyAt, 'verrou rendu dans finally')
  // L'achat est gardé sous la fiche de l'envoi, puis l'écran ne change que si elle est encore ouverte.
  assert.ok(
    at('ficheId: forFiche.id, title: forFiche.title') < at('if (!isShown(forFiche.id)) return'),
  )
  assert.ok(at('if (!isShown(forFiche.id)) return') < at('setView('))
  // Suivi et appareil : la fiche de l'achat, jamais celle à l'écran.
  assert.ok(src.includes('ficheId: view.ficheId'))
  assert.ok(src.includes('downloadPurchase(view.purchaseId, reference, view.ficheId)'))
  assert.ok(!/buyingRef/.test(src))
})

// ── U2 : suivi borné ──────────────────────────────────────────────────────

test('U2 : 4 s, puis 8 s et 15 s après des 429 ; arrêt au bout de 5 min', () => {
  assert.equal(nextPollDelay(0), POLL_BASE_MS)
  assert.equal(nextPollDelay(1), 8_000)
  assert.equal(nextPollDelay(2), 15_000)
  assert.equal(nextPollDelay(9), 15_000)
  assert.equal(pollExpired(0, POLL_WINDOW_MS - 1), false)
  assert.equal(pollExpired(0, POLL_WINDOW_MS), true)
})

test('U2 : états distincts, jamais de faux succès', () => {
  assert.equal(payStateOf('completed', true), 'completed')
  assert.equal(payStateOf('completed', false), 'pending')
  assert.equal(payStateOf('failed'), 'failed')
  assert.equal(payStateOf('refunded'), 'refunded')
  assert.equal(payStateOf('pending'), 'pending')
  assert.equal(payStateOf(undefined), 'pending')
  assert.equal(payStateOf('bizarre'), 'pending')
})

test('U1/U2 : lien à garder, partage WhatsApp et référence pour le support', () => {
  const url = purchaseUrl('https://www.faitierehub.com/', P1)
  assert.equal(url, `https://www.faitierehub.com/marketplace/achat/${P1}`)
  const share = whatsappShareUrl('Maïs & soja', url)
  assert.ok(share.startsWith('https://wa.me/?text='))
  const text = decodeURIComponent(share.split('text=')[1] ?? '')
  assert.ok(text.includes('Gardez ce lien pour retélécharger votre compte d’exploitation'))
  assert.ok(text.includes(url))
  assert.ok(text.includes('Maïs & soja'))
  assert.equal(purchaseReference({ id: P1, reference: '987654' }), '987654')
  assert.equal(purchaseReference({ id: P1, reference: null }), '11111111')
  assert.ok(supportWhatsappUrl('987654').startsWith('https://wa.me/22892548838?text='))
})

// ── U9 : dépôt ────────────────────────────────────────────────────────────

test('U9 : nom d’objet accepté par le serveur, accents et signes retirés', () => {
  const ficheId = F1
  for (const raw of [
    'Compte Maïs 2026 (v2).XLSX',
    '..\\..\\secret.pdf',
    'é.docx',
    'budget..final.xlsx',
    '   .pdf',
    `${'a'.repeat(300)}.pdf`,
  ]) {
    const name = sanitizeStorageName(raw)
    assert.ok(
      validateFichePath(`plateforme/${ficheId}/${name}`, {
        platform: true,
        cooperativeId: null,
        ficheId,
      }),
      `${raw} → ${name}`,
    )
  }
  assert.equal(sanitizeStorageName('Compte Maïs 2026 (v2).XLSX'), 'Compte-Mais-2026-v2.xlsx')
  assert.equal(uniqueStorageName('compte.xlsx', new Set(['compte.xlsx'])), 'compte-2.xlsx')
  assert.equal(
    uniqueStorageName('compte.xlsx', new Set(['compte.xlsx', 'compte-2.xlsx'])),
    'compte-3.xlsx',
  )
})

test('U9 : contrôle avant envoi (format, taille, vide)', () => {
  assert.equal(checkUploadFile({ name: 'a.xlsx', size: 10 }), null)
  assert.match(checkUploadFile({ name: 'photo.jpg', size: 10 }) ?? '', /format non accepté/)
  assert.match(checkUploadFile({ name: 'gros.pdf', size: 21 * 1024 * 1024 }) ?? '', /20 Mo/)
  assert.match(checkUploadFile({ name: 'vide.pdf', size: 0 }) ?? '', /vide/)
})

test('U9 : erreurs de stockage traduites en consignes', () => {
  assert.match(
    translateStorageError('mime type application/octet-stream is not supported', 'a.xlsx'),
    /^« a\.xlsx » : format non accepté/,
  )
  assert.match(
    translateStorageError('The object exceeded the maximum allowed size'),
    /trop volumineux/,
  )
  assert.match(translateStorageError('Failed to fetch'), /connexion interrompue/)
  assert.match(translateStorageError('The resource already exists'), /même nom/)
  assert.match(translateStorageError('new row violates row-level security policy'), /envoi refusé/)
})

test('U9 : validation locale = schéma du serveur, une erreur par champ', () => {
  const ok = {
    title: 'Maïs pluvial',
    description: '',
    culture: 'Mais',
    type_agriculture: 'conventionnel',
    campaign: '2026-2027',
    price: '1000',
    region_id: '',
    prefecture_id: '',
    canton_id: '',
  }
  assert.deepEqual(validateFicheDraft(ok), {})
  const errs = validateFicheDraft({
    ...ok,
    title: 'ab',
    culture: '',
    campaign: 'x'.repeat(51),
    price: '2000000',
  })
  assert.deepEqual(Object.keys(errs).sort(), ['campaign', 'culture', 'price_non_member', 'title'])
  assert.match(errs.price_non_member ?? '', /1 000 000/)
  assert.ok(validateFicheDraft({ ...ok, price: '' }).price_non_member)
  assert.equal(draftPayload({ ...ok, description: '  ' }).description, undefined)
  assert.deepEqual(serverFieldErrors({ title: ['Trop court'], files: 'x' }), {
    title: 'Trop court',
  })
  assert.deepEqual(serverFieldErrors(null), {})
})

function fakeStorage(fail: Record<string, string> = {}) {
  const calls: Array<{ bucket: string; path: string; contentType?: string }> = []
  const storage: UploadStorage = {
    from(bucket) {
      return {
        upload: async (path, _body, options) => {
          calls.push({ bucket, path, contentType: options?.contentType })
          const message = fail[path]
          return { error: message ? { message } : null }
        },
        getPublicUrl: (path) => ({
          data: {
            publicUrl: `https://proj.supabase.test/storage/v1/object/public/${bucket}/${path}`,
          },
        }),
      }
    },
  }
  return { storage, calls }
}

test('U9 : fichiers envoyés dans le dossier de la fiche, type MIME d’après l’extension', async () => {
  const { storage, calls } = fakeStorage({
    [`plateforme/${F1}/budget.xlsx`]: 'The resource already exists',
  })
  const progress: string[] = []
  const xlsx = new File([new Uint8Array([0x50, 0x4b, 3, 4])], 'budget.xlsx', {
    type: 'application/octet-stream',
  })
  const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'Notice Maïs.pdf')
  const out = await uploadFicheFiles(storage, {
    root: 'plateforme',
    ficheId: F1,
    files: [xlsx, pdf],
    onProgress: (i, n, name) => progress.push(`${i}/${n} ${name}`),
  })
  assert.deepEqual(progress, ['1/2 budget.xlsx', '2/2 Notice Maïs.pdf'])
  // Objet resté d'un essai précédent : nouveau nom, jamais d'écrasement.
  assert.deepEqual(
    out.map((f) => f.url),
    [`plateforme/${F1}/budget-2.xlsx`, `plateforme/${F1}/Notice-Mais.pdf`],
  )
  assert.equal(out[0]?.name, 'budget.xlsx')
  assert.equal(calls[0]?.contentType, MIME_BY_EXT.xlsx)
  assert.equal(
    calls.every((c) => c.bucket === 'fiches-techniques'),
    true,
  )
})

test('U9 : échec d’envoi → message traduit ; couverture versionnée', async () => {
  const { storage } = fakeStorage({
    [`${F2}/${F1}/a.pdf`]: 'mime type application/x-zip is not supported',
  })
  await assert.rejects(
    uploadFicheFiles(storage, {
      root: F2,
      ficheId: F1,
      files: [new File([new Uint8Array([1])], 'a.pdf')],
    }),
    /« a\.pdf » : format non accepté/,
  )
  const cover = fakeStorage()
  const url = await uploadFicheCover(cover.storage, {
    root: 'plateforme',
    ficheId: F1,
    blob: new Blob([new Uint8Array([1])], { type: 'image/webp' }),
  })
  assert.equal(
    url,
    `https://proj.supabase.test/storage/v1/object/public/fiches-covers/plateforme/${F1}.webp`,
  )
  await uploadFicheCover(cover.storage, {
    root: 'plateforme',
    ficheId: F1,
    blob: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
    version: 'k1',
  })
  assert.equal(cover.calls[1]?.path, `plateforme/${F1}-k1.jpg`)
})
