/**
 * Texte long d'une leçon (`academy_lessons.content_body`) : texte brut structuré par
 * convention (titre en capitales, sections « 1. TITRE », listes « - », cases « □ », étapes
 * « 1. texte »). Ce module le découpe en blocs sémantiques ; le composant les rend en HTML
 * (h2, p, ul, ol) sans jamais injecter de HTML brut. Fonctions pures, testées dans
 * tests/academy-lesson-text.test.ts.
 */

export type LessonBlock =
  | { kind: 'heading'; text: string; number: number | null }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[]; ordered: boolean; checklist: boolean }

const HEADING = /^(?:(\d+)\.\s+)?([^a-zà-ÿ]{3,})$/u
const BULLET = /^[-•]\s+(.*)$/
const CHECK = /^[□☐]\s+(.*)$/
const STEP = /^(\d+)[.)]\s+(.*)$/

/** Un titre est une ligne courte sans minuscule (« OBJECTIFS », « 3. DÉDUPLICATION »). */
export function isHeadingLine(line: string): boolean {
  const t = line.trim()
  if (t.length === 0 || t.length > 80) return false
  const m = HEADING.exec(t)
  if (!m) return false
  // Au moins une lettre : « 1 200 » ou « → » ne sont pas des titres.
  return /\p{L}/u.test(m[2])
}

export function parseLessonText(body: string | null | undefined): LessonBlock[] {
  if (!body) return []
  const blocks: LessonBlock[] = []
  let para: string[] = []
  let list: { items: string[]; ordered: boolean; checklist: boolean } | null = null

  const flushPara = () => {
    if (para.length > 0) {
      blocks.push({ kind: 'paragraph', text: para.join(' ') })
      para = []
    }
  }
  const flushList = () => {
    if (list) {
      blocks.push({ kind: 'list', ...list })
      list = null
    }
  }
  const pushItem = (text: string, ordered: boolean, checklist: boolean) => {
    flushPara()
    if (!list || list.ordered !== ordered || list.checklist !== checklist) {
      flushList()
      list = { items: [], ordered, checklist }
    }
    list.items.push(text.trim())
  }

  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (line === '') {
      flushPara()
      flushList()
      continue
    }
    if (isHeadingLine(line)) {
      flushPara()
      flushList()
      const m = HEADING.exec(line)
      blocks.push({
        kind: 'heading',
        text: titleCase(m?.[2] ?? line),
        number: m?.[1] ? Number(m[1]) : null,
      })
      continue
    }
    const bullet = BULLET.exec(line)
    if (bullet) {
      pushItem(bullet[1], false, false)
      continue
    }
    const check = CHECK.exec(line)
    if (check) {
      pushItem(check[1], false, true)
      continue
    }
    const step = STEP.exec(line)
    if (step) {
      pushItem(step[2], true, false)
      continue
    }
    flushList()
    para.push(line)
  }
  flushPara()
  flushList()
  return blocks
}

const ACRONYMS = new Set([
  'PAYG',
  'QR',
  'MLM',
  'MEAL',
  'PVC',
  'SMS',
  'CSV',
  'KPI',
  'ONG',
  'FCFA',
  'API',
  'URL',
  'PDF',
  'GPS',
  'ODK',
])
const BRANDS: Record<string, string> = {
  faîtierehub: 'FaîtiereHub',
  kobotoolbox: 'KoboToolbox',
  kobo: 'Kobo',
  excel: 'Excel',
  haroo: 'Haroo',
}

/** « DÉDUPLICATION » → « Déduplication » ; sigles connus et marques conservés. */
export function titleCase(text: string): string {
  const words = text.split(' ').map((original) => {
    const upper = original.replace(/[^\p{L}]/gu, '')
    if (ACRONYMS.has(upper)) return original
    const lower = original.toLocaleLowerCase('fr-FR')
    const brand = BRANDS[lower.replace(/[^\p{L}]/gu, '')]
    return brand ? lower.replace(/\p{L}+/u, brand) : lower
  })
  const joined = words.join(' ')
  return joined.charAt(0).toLocaleUpperCase('fr-FR') + joined.slice(1)
}

/** Première section « Objectifs » du texte, pour l'aperçu du cursus. */
export function objectiveFromText(body: string | null | undefined): string | null {
  const blocks = parseLessonText(body)
  const i = blocks.findIndex((b) => b.kind === 'heading' && /^objectifs?$/i.test(b.text))
  const next = blocks[i + 1]
  return i >= 0 && next?.kind === 'paragraph' ? next.text : null
}
