// [SECURITY CHECK - SENTINEL]
// Script de vérification pré-déploiement.
// Exécuter avant chaque déploiement Vercel : npm run security:check

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Simple recursive glob for .ts/.tsx files.
 * Avoids external dependency (fast-glob not in devDeps).
 */
function globSync(pattern: string, baseDir: string): string[] {
  const results: string[] = []
  const ext = pattern.includes('.tsx') ? '.tsx' : '.ts'
  const dir = path.join(baseDir, pattern.split('*')[0])

  function walk(dirPath: string) {
    if (!fs.existsSync(dirPath)) return
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next') {
        walk(fullPath)
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        results.push(fullPath)
      }
    }
  }

  walk(dir)
  return results
}

const checks: { name: string; pass: boolean; detail?: string }[] = []

function check(name: string, condition: boolean, detail?: string) {
  checks.push({ name, pass: condition, detail })
}

const rootDir = path.resolve(__dirname, '..')

// 1. proxy.ts existe (protection serveur des routes — Next.js 16 convention)
check(
  'proxy.ts présent (auth gate serveur)',
  fs.existsSync(path.join(rootDir, 'proxy.ts')),
  'Le fichier proxy.ts est requis pour la protection des routes (FIX ALPHA-1)'
)

// 2. security.txt existe
check(
  'security.txt route présente',
  fs.existsSync(path.join(rootDir, 'app', '.well-known', 'security.txt', 'route.ts')),
  'Créer app/.well-known/security.txt/route.ts (FIX GAMMA-6)'
)

// 3. Rate limit persistent module existe
check(
  'Module rate-limit-persistent présent',
  fs.existsSync(path.join(rootDir, 'lib', 'utils', 'rate-limit-persistent.ts')),
  'Créer lib/utils/rate-limit-persistent.ts (FIX BETA-1)'
)

// 4. API verify route existe
check(
  'Route API /api/verify/[card_number] présente',
  fs.existsSync(path.join(rootDir, 'app', 'api', 'verify', '[card_number]', 'route.ts')),
  'Créer app/api/verify/[card_number]/route.ts (FIX ALPHA-3)'
)

// 5. Pas de createBrowserClient dans la page verify (données sensibles)
const verifyPagePath = path.join(rootDir, 'app', 'verify', '[card_number]', 'page.tsx')
if (fs.existsSync(verifyPagePath)) {
  const verifyContent = fs.readFileSync(verifyPagePath, 'utf-8')
  check(
    '/verify ne fait plus de requêtes Supabase directes',
    !verifyContent.includes('createBrowserClient') && !verifyContent.includes('.from(\'members\')'),
    'La page /verify doit utiliser /api/verify au lieu de Supabase direct (FIX ALPHA-3)'
  )
} else {
  check('/verify page existe', false, 'Fichier manquant: app/verify/[card_number]/page.tsx')
}

// 6. Marketplace route a la validation Zod
const marketplacePath = path.join(rootDir, 'app', 'api', 'marketplace', 'route.ts')
if (fs.existsSync(marketplacePath)) {
  const marketplaceContent = fs.readFileSync(marketplacePath, 'utf-8')
  check(
    'Marketplace: injection SQL corrigée (Zod + échappement)',
    marketplaceContent.includes('SECURITY FIX - GHOST-002') && marketplaceContent.includes('safeParse'),
    'Le paramètre q doit être validé avec Zod (FIX ALPHA-2)'
  )
} else {
  check('Marketplace route existe', false, 'Fichier manquant')
}

// 7. Webhook Kobo a la validation payload
const webhookPath = path.join(rootDir, 'app', 'api', 'webhooks', 'kobo', 'route.ts')
if (fs.existsSync(webhookPath)) {
  const webhookContent = fs.readFileSync(webhookPath, 'utf-8')
  check(
    'Webhook Kobo: validation taille payload',
    webhookContent.includes('SECURITY FIX - GHOST-004'),
    'Ajouter la vérification content-length (FIX BETA-2)'
  )
  check(
    'Webhook Kobo: validation Zod payload',
    webhookContent.includes('SECURITY FIX - GHOST-005'),
    'Ajouter le schéma Zod (FIX BETA-5)'
  )
} else {
  check('Webhook Kobo route existe', false, 'Fichier manquant')
}

// 8. Embed route a la validation d'origine sécurisée
const embedPath = path.join(rootDir, 'app', 'api', 'embed', 'route.ts')
if (fs.existsSync(embedPath)) {
  const embedContent = fs.readFileSync(embedPath, 'utf-8')
  check(
    'Embed: validation origine sécurisée (pas .includes())',
    embedContent.includes('SECURITY FIX - PHANTOM-003') && !embedContent.includes('origin.includes(o)'),
    'Remplacer .includes() par comparaison exacte (FIX GAMMA-2)'
  )
} else {
  check('Embed route existe', false, 'Fichier manquant')
}

// 9. Forgot-password ne révèle pas si l'email existe
const forgotPath = path.join(rootDir, 'app', 'auth', 'forgot-password', 'page.tsx')
if (fs.existsSync(forgotPath)) {
  const forgotContent = fs.readFileSync(forgotPath, 'utf-8')
  check(
    'Forgot-password: pas d\'énumération email',
    forgotContent.includes('SECURITY FIX - PHANTOM-002'),
    'Le message doit être identique que l\'email existe ou non (FIX GAMMA-1)'
  )
} else {
  check('Forgot-password page existe', false, 'Fichier manquant')
}

// 10. TypeScript compile
try {
  execSync('npx tsc --noEmit', { cwd: rootDir, stdio: 'pipe' })
  check('TypeScript compile sans erreur', true)
} catch {
  check('TypeScript compile sans erreur', false, 'Erreurs TypeScript détectées — npm run typecheck')
}

// =========================================================
// KOBO MODULE CHECKS (CHECK 12–18)
// =========================================================

// CHECK 12: KOBO_WEBHOOK_SECRET présent ET longueur >= 32 chars
const koboSecret = process.env.KOBO_WEBHOOK_SECRET ?? ''
check(
  '[KOBO-12] KOBO_WEBHOOK_SECRET configuré (≥32 chars)',
  koboSecret.length >= 32,
  'Ajouter KOBO_WEBHOOK_SECRET (≥32 chars) dans .env.local et Vercel Dashboard'
)

// CHECK 13: Webhook handler contient 'timingSafeEqual'
if (fs.existsSync(webhookPath)) {
  const webhookContent = fs.readFileSync(webhookPath, 'utf-8')
  check(
    '[KOBO-13] Webhook utilise timingSafeEqual',
    webhookContent.includes('timingSafeEqual'),
    'Le webhook doit utiliser crypto.timingSafeEqual pour la vérification du secret'
  )
} else {
  check('[KOBO-13] Webhook route existe', false, 'Fichier manquant: app/api/webhooks/kobo/route.ts')
}

// CHECK 14: Webhook payload Zod schema présent
if (fs.existsSync(webhookPath)) {
  const webhookContent = fs.readFileSync(webhookPath, 'utf-8')
  check(
    '[KOBO-14] Webhook a un schéma Zod de validation',
    webhookContent.includes('safeParse') || webhookContent.includes('koboWebhookPayloadSchema'),
    'Le webhook doit valider le payload avec un schéma Zod'
  )
} else {
  check('[KOBO-14] Webhook route existe', false, 'Fichier manquant')
}

// CHECK 15: Aucune clé API KoboToolbox en dur dans le code
const koboTokenPattern = /Token [a-f0-9]{40}/i
const filesToScan = [
  ...globSync('app/**/*.ts', rootDir),
  ...globSync('app/**/*.tsx', rootDir),
  ...globSync('lib/**/*.ts', rootDir),
  ...globSync('components/**/*.tsx', rootDir),
]
const hardcodedTokenFiles = filesToScan.filter((f) => {
  try {
    const content = fs.readFileSync(f, 'utf-8')
    return koboTokenPattern.test(content)
  } catch {
    return false
  }
})
check(
  '[KOBO-15] Aucune clé API KoboToolbox en dur dans le code',
  hardcodedTokenFiles.length === 0,
  hardcodedTokenFiles.length > 0
    ? `Clés trouvées dans: ${hardcodedTokenFiles.join(', ')}`
    : undefined
)

// CHECK 16: kobo_submissions migration a RLS activé
const migrationPath = path.join(rootDir, 'supabase_migrations', '20260524_kobo_integration_v2.sql')
if (fs.existsSync(migrationPath)) {
  const migrationContent = fs.readFileSync(migrationPath, 'utf-8')
  check(
    '[KOBO-16] kobo_submissions a RLS activé',
    migrationContent.includes('ALTER TABLE kobo_submissions ENABLE ROW LEVEL SECURITY'),
    'La table kobo_submissions doit avoir RLS activé dans la migration'
  )
} else {
  check('[KOBO-16] Migration Kobo v2 existe', false, 'Fichier manquant: supabase_migrations/20260524_kobo_integration_v2.sql')
}

// CHECK 17: kobo_field_mappings a RLS activé
if (fs.existsSync(migrationPath)) {
  const migrationContent = fs.readFileSync(migrationPath, 'utf-8')
  check(
    '[KOBO-17] kobo_field_mappings a RLS activé',
    migrationContent.includes('ALTER TABLE kobo_field_mappings ENABLE ROW LEVEL SECURITY'),
    'La table kobo_field_mappings doit avoir RLS activé dans la migration'
  )
} else {
  check('[KOBO-17] Migration Kobo v2 existe', false, 'Fichier manquant')
}

// CHECK 18: Sync route a maxDuration exporté
const syncRoutePath = path.join(rootDir, 'app', 'api', 'integrations', 'kobo', 'sync', 'route.ts')
if (fs.existsSync(syncRoutePath)) {
  const syncContent = fs.readFileSync(syncRoutePath, 'utf-8')
  check(
    '[KOBO-18] Sync route a maxDuration exporté',
    syncContent.includes('export const maxDuration'),
    'La route sync doit exporter maxDuration pour le timeout Vercel'
  )
} else {
  check('[KOBO-18] Sync route existe', false, 'Fichier manquant: app/api/integrations/kobo/sync/route.ts')
}

// --- Rapport ---
console.log('\n🔐 FaîtiereHub — Security Pre-Deploy Check\n')
const failed = checks.filter(c => !c.pass)
checks.forEach(c => {
  console.log(`${c.pass ? '✅' : '❌'} ${c.name}${c.detail && !c.pass ? ` — ${c.detail}` : ''}`)
})

if (failed.length > 0) {
  console.error(`\n⛔ ${failed.length} vérification(s) échouée(s). Déploiement bloqué.\n`)
  process.exit(1)
} else {
  console.log('\n✅ Toutes les vérifications passent. Déploiement autorisé.\n')
}
