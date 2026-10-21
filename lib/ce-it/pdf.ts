import { calculateEnterpriseBudget } from '@/lib/agronomy/enterprise-budget'
import { jsPDF } from 'jspdf'
import type { VersionInput } from './schema'

/** Text-only PDFs: no remote images, HTML execution or untrusted URL fetch. */
function document(title: string, sections: Array<[string, string[]]>) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = 18
  const line = (text: string, size = 10) => {
    pdf.setFontSize(size)
    for (const part of pdf.splitTextToSize(
      text.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''),
      174,
    ) as string[]) {
      if (y > 275) {
        pdf.addPage()
        y = 18
      }
      pdf.text(part, 18, y)
      y += size === 10 ? 5 : 7
    }
  }
  line('FaitiereHub | CE et itineraire technique', 12)
  line(title, 15)
  y += 4
  for (const [heading, lines] of sections) {
    line(heading, 12)
    for (const text of lines) line(text)
    y += 4
  }
  line(
    'Document previsionnel contextualise. Les resultats ne sont pas garantis. La consultation personnalisee fait l’objet d’un accord distinct.',
  )
  return new Uint8Array(pdf.output('arraybuffer'))
}
export function generateDocuments(title: string, data: VersionInput) {
  const sources = data.sources.map(
    (s, i) =>
      `${i + 1}. ${s.title} | ${s.url} | droits: ${s.rights} | verifie le ${s.checkedOn} | ${s.notes}`,
  )
  const ce = document(title, [
    [
      'Contexte',
      [data.context, `Superficie de reference : ${data.areaHa} ha. Montants en FCFA (XOF).`],
    ],
    [
      'Charges',
      data.costs.map((c) => `${c.label}: ${c.quantity} x ${c.unitPrice} FCFA | ${c.scaling}`),
    ],
    [
      'Scenarios',
      calculateEnterpriseBudget(data).map(
        (s) =>
          `${s.label} : rendement ${s.yieldTonnesPerHa} t/ha, prix ${s.salePricePerTonne} FCFA/t ; produit ${Math.round(s.revenue)}, charges ${Math.round(s.totalCost)}, resultat ${Math.round(s.result)} FCFA.`,
      ),
    ],
    ['References', sources],
  ])
  const it = document(title, [
    ['Contexte', [data.context]],
    [
      'Itineraire technique',
      data.itinerary.map(
        (s) =>
          `J${s.dayStart} a J${s.dayEnd} : ${s.operation}. ${s.instructions} Precautions : ${s.precautions}`,
      ),
    ],
    ['References et droits', sources],
  ])
  return { ce, it }
}
