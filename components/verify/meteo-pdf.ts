'use client'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PdfWeatherDay {
  date: string
  temperature_max: number | null
  temperature_min: number | null
  temperature_mean: number | null
  precipitation_mm: number | null
  precipitation_probability?: number | null
  humidity_pct: number | null
  wind_speed_ms: number | null
  et0_mm: number | null
}

export interface PdfWeatherHour {
  time: string
  temperature: number
  apparent_temperature: number
  precipitation_probability: number
  weather_code: number
  wind_speed_ms: number
  humidity_pct: number
}

export interface PdfMinutely15 {
  time: string
  precipitation: number
  weather_code: number
  temperature: number
}

export interface PdfSeasonal {
  month: string
  temperature_mean: number
  precipitation_mm: number
}

export interface PdfAgroInsights {
  drought_risk?: 'low' | 'moderate' | 'high' | 'critical'
  planting_window?: string | null
  spray_window?: string | null
  water_stress_days?: number
  heat_stress_days?: number
}

export interface BulletinData {
  region: string
  city: string
  weather: PdfWeatherDay[]
  hourly: PdfWeatherHour[]
  nowcast: PdfMinutely15[]
  seasonal: PdfSeasonal[]
  agro_insights?: PdfAgroInsights
  data_source?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const WMO_LABELS: Record<number, string> = {
  0: 'Ciel dégagé', 1: 'Princ. dégagé', 2: 'Part. nuageux', 3: 'Nuageux',
  45: 'Brouillard', 48: 'Brouillard givrant',
  51: 'Bruine légère', 53: 'Bruine', 55: 'Bruine forte',
  61: 'Pluie légère', 63: 'Pluie modérée', 65: 'Pluie forte',
  80: 'Averses légères', 81: 'Averses', 82: 'Averses fortes',
  95: 'Orage', 96: 'Orage + grêle', 99: 'Orage violent',
}
function wmoLabel(code: number): string {
  const keys = Object.keys(WMO_LABELS).map(Number)
  const nearest = keys.reduce((p, c) => Math.abs(c - code) < Math.abs(p - code) ? c : p)
  return WMO_LABELS[nearest] ?? `Code ${code}`
}

function frDate(iso: string): string {
  try {
    const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  } catch { return iso }
}

function frMonth(iso: string): string {
  try {
    return new Date(iso + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  } catch { return iso }
}

function dayShort(iso: string): string {
  try {
    const today = new Date().toISOString().slice(0, 10)
    if (iso === today) return "Aujourd'hui"
    const diff = Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
    if (diff === 1) return 'Demain'
    return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
  } catch { return iso }
}

function nowHourLagos(): string {
  return new Date(Date.now() + 3600000).toISOString().slice(0, 13)
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function precipColor(mm: number): [number, number, number] {
  if (mm > 10) return [30, 64, 175]   // dark blue
  if (mm > 5)  return [59, 130, 246]  // blue
  if (mm > 1)  return [96, 165, 250]  // light blue
  if (mm > 0)  return [186, 230, 253] // very light blue
  return [226, 232, 240]              // gray
}

function riskColor(risk?: string): [number, number, number] {
  if (risk === 'critical') return [220, 38, 38]
  if (risk === 'high')     return [234, 88, 12]
  if (risk === 'moderate') return [202, 138, 4]
  return [22, 163, 74]
}

// ── Main generator ────────────────────────────────────────────────────────────

export async function generateMeteoBulletin(data: BulletinData): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PAGE_W = 210
  const MARGIN = 14
  const CONTENT_W = PAGE_W - MARGIN * 2

  // ── Color palette ──
  const BLUE_DARK  = [15, 23, 42]   as [number,number,number]
  const BLUE_MED   = [30, 58, 138]  as [number,number,number]
  const BLUE_LIGHT = [59, 130, 246] as [number,number,number]
  const GREEN      = [21, 128, 61]  as [number,number,number]
  const WHITE      = [255, 255, 255] as [number,number,number]
  const GRAY_LIGHT = [248, 250, 252] as [number,number,number]
  const GRAY_TEXT  = [100, 116, 139] as [number,number,number]
  const TEXT_DARK  = [15, 23, 42]   as [number,number,number]

  let y = 0
  const nowStr = new Date().toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })
  const todayStr = new Date().toISOString().slice(0, 10)

  // ══════════════════════════ HEADER ════════════════════════════════════════

  // Background band
  doc.setFillColor(...BLUE_DARK)
  doc.rect(0, 0, PAGE_W, 42, 'F')

  // Green accent bar
  doc.setFillColor(...GREEN)
  doc.rect(0, 0, 4, 42, 'F')

  doc.setTextColor(...WHITE)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('BULLETIN MÉTÉO AGRICOLE', MARGIN + 4, 16)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`FaîtiereHub  •  ${data.city}, Région ${data.region}  •  Togo`, MARGIN + 4, 25)
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text(`Généré le ${nowStr}`, MARGIN + 4, 33)
  doc.setFontSize(8)
  doc.text('Sources : ECMWF IFS · GFS NOAA · ICON DWD  (ensemble 3 modèles)', PAGE_W - MARGIN, 33, { align: 'right' })

  y = 50

  // ══════════════════════════ CURRENT CONDITIONS ════════════════════════════

  const todayRow   = data.weather.find(d => d.date === todayStr)
  const nowHour    = nowHourLagos()
  const curSlot    = data.hourly.find(h => h.time.slice(0, 13) >= nowHour) ?? data.hourly[0]

  doc.setFillColor(...GRAY_LIGHT)
  doc.roundedRect(MARGIN, y, CONTENT_W, 34, 3, 3, 'F')
  doc.setFillColor(...BLUE_MED)
  doc.roundedRect(MARGIN, y, CONTENT_W, 8, 3, 3, 'F')
  doc.rect(MARGIN, y + 5, CONTENT_W, 3, 'F')

  doc.setTextColor(...WHITE)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('SITUATION ACTUELLE', MARGIN + 4, y + 5.5)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...TEXT_DARK)
  doc.setFontSize(9)

  const colW = CONTENT_W / 3
  const row1y = y + 15
  const row2y = y + 24

  // Col 1
  const temp = curSlot?.temperature ?? todayRow?.temperature_mean ?? null
  const feels = curSlot?.apparent_temperature
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...BLUE_LIGHT)
  doc.text(`${temp != null ? Math.round(temp) : '—'}°C`, MARGIN + 4, row1y + 4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY_TEXT)
  doc.text(`Ressenti ${feels != null ? Math.round(feels) : '—'}°C`, MARGIN + 4, row1y + 10)
  doc.text(`Min ${todayRow?.temperature_min != null ? Math.round(todayRow.temperature_min) : '—'}° · Max ${todayRow?.temperature_max != null ? Math.round(todayRow.temperature_max) : '—'}°`, MARGIN + 4, row2y + 4)

  // Col 2
  const precip = todayRow?.precipitation_mm ?? 0
  const prob   = todayRow?.precipitation_probability ?? 0
  doc.setFontSize(9)
  doc.setTextColor(...TEXT_DARK)
  doc.setFont('helvetica', 'bold')
  doc.text(`${precip.toFixed(1)} mm`, MARGIN + colW + 4, row1y + 4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY_TEXT)
  doc.text(`Précipitations aujourd'hui`, MARGIN + colW + 4, row1y + 10)
  doc.text(`Probabilité : ${Math.round(prob)}%`, MARGIN + colW + 4, row2y + 4)

  // Col 3
  const hum  = todayRow?.humidity_pct ?? curSlot?.humidity_pct
  const wind = todayRow?.wind_speed_ms
  const et0  = todayRow?.et0_mm
  const wmo  = curSlot ? wmoLabel(curSlot.weather_code) : 'N/D'
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_DARK)
  doc.setFont('helvetica', 'bold')
  doc.text(wmo, MARGIN + colW * 2 + 4, row1y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY_TEXT)
  doc.text(`Humidité : ${hum != null ? Math.round(hum) : '—'}%   Vent : ${wind != null ? wind.toFixed(1) : '—'} m/s`, MARGIN + colW * 2 + 4, row1y + 7)
  doc.text(`ETo FAO-56 : ${et0 != null ? et0.toFixed(1) : '—'} mm/j`, MARGIN + colW * 2 + 4, row2y + 4)

  y += 42

  // ══════════════════════════ NOWCAST 6H ════════════════════════════════════

  const futureNowcast = data.nowcast.filter(s => {
    const slotMs = new Date(s.time + ':00+01:00').getTime()
    return slotMs >= Date.now()
  }).slice(0, 24)

  if (futureNowcast.length > 0) {
    y += 6
    doc.setFillColor(...BLUE_MED)
    doc.roundedRect(MARGIN, y, CONTENT_W, 8, 3, 3, 'F')
    doc.rect(MARGIN, y + 5, CONTENT_W, 3, 'F')
    doc.setTextColor(...WHITE)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('NOWCASTING — PROCHAINES 6 HEURES (intervalles 15 min)', MARGIN + 4, y + 5.5)
    y += 10

    const rows = futureNowcast.map(s => {
      const slotMs = new Date(s.time + ':00+01:00').getTime()
      const minFromNow = Math.round((slotMs - Date.now()) / 60000)
      const timeLabel = minFromNow <= 0 ? 'Maintenant' : `+${minFromNow} min`
      const hhmm = s.time.slice(11, 16)
      const intensity = s.precipitation > 5 ? 'Forte' : s.precipitation > 1 ? 'Modérée' : s.precipitation > 0.05 ? 'Légère' : '—'
      return [hhmm, timeLabel, `${s.precipitation.toFixed(2)} mm`, intensity, `${Math.round(s.temperature)}°C`]
    })

    autoTable(doc, {
      startY: y,
      head: [['Heure', 'Dans', 'Précip.', 'Intensité', 'Temp.']],
      body: rows,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 7.5, cellPadding: 2, textColor: TEXT_DARK },
      headStyles: { fillColor: BLUE_LIGHT, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: GRAY_LIGHT },
      columnStyles: {
        0: { halign: 'center', cellWidth: 18 },
        1: { halign: 'center', cellWidth: 22 },
        2: { halign: 'center', cellWidth: 22 },
        3: { halign: 'left' },
        4: { halign: 'center', cellWidth: 18 },
      },
      willDrawCell: (hookData: { section: string; row: { raw: unknown }; column: { index: number } }) => {
        if (hookData.section === 'body' && hookData.column.index === 2) {
          const raw = hookData.row.raw
          const mm = parseFloat(String(Array.isArray(raw) ? raw[2] : 0))
          if (!isNaN(mm) && mm > 0.05) {
            const [r, g, b] = precipColor(mm)
            doc.setFillColor(r, g, b)
          }
        }
      },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4
  }

  // ══════════════════════════ 7-DAY FORECAST ════════════════════════════════

  y += 6
  doc.setFillColor(...BLUE_MED)
  doc.roundedRect(MARGIN, y, CONTENT_W, 8, 3, 3, 'F')
  doc.rect(MARGIN, y + 5, CONTENT_W, 3, 'F')
  doc.setTextColor(...WHITE)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('PRÉVISIONS 7 JOURS', MARGIN + 4, y + 5.5)
  y += 10

  const futureDays = data.weather.filter(d => d.date >= todayStr).slice(0, 7)

  autoTable(doc, {
    startY: y,
    head: [['Jour', 'Min', 'Max', 'Pluie', 'Probabilité', 'Vent', 'ETo', 'Conditions']],
    body: futureDays.map(d => [
      dayShort(d.date),
      `${d.temperature_min != null ? Math.round(d.temperature_min) : '—'}°C`,
      `${d.temperature_max != null ? Math.round(d.temperature_max) : '—'}°C`,
      `${(d.precipitation_mm ?? 0).toFixed(1)} mm`,
      `${d.precipitation_probability != null ? Math.round(d.precipitation_probability) : '—'}%`,
      `${d.wind_speed_ms != null ? d.wind_speed_ms.toFixed(1) : '—'} m/s`,
      `${d.et0_mm != null ? d.et0_mm.toFixed(1) : '—'} mm`,
      d.precipitation_mm != null && d.precipitation_mm > 10 ? 'Pluie importante'
        : d.precipitation_mm != null && d.precipitation_mm > 2 ? 'Pluie légère'
        : d.temperature_max != null && d.temperature_max > 35 ? 'Chaleur forte'
        : 'Sec / nuageux',
    ]),
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 7.5, cellPadding: 2, textColor: TEXT_DARK },
    headStyles: { fillColor: BLUE_LIGHT, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: GRAY_LIGHT },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'center', textColor: [59, 130, 246] as [number,number,number] },
      2: { halign: 'center', textColor: [234, 88, 12] as [number,number,number] },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center' },
      6: { halign: 'center', textColor: GREEN },
    },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4

  // ══════════════════════════ AGRONOMIC ALERTS ══════════════════════════════

  const ins = data.agro_insights
  if (ins) {
    // Check if we need a new page
    if (y > 230) { doc.addPage(); y = 20 }

    y += 6
    doc.setFillColor(...BLUE_MED)
    doc.roundedRect(MARGIN, y, CONTENT_W, 8, 3, 3, 'F')
    doc.rect(MARGIN, y + 5, CONTENT_W, 3, 'F')
    doc.setTextColor(...WHITE)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('ALERTES AGRONOMIQUES', MARGIN + 4, y + 5.5)
    y += 12

    const alerts: { icon: string; label: string; text: string; color: [number,number,number] }[] = []

    if (ins.drought_risk === 'critical') alerts.push({ icon: '⚠', label: 'CRITIQUE', text: 'Sécheresse critique — Irriguer immédiatement', color: [220, 38, 38] })
    else if (ins.drought_risk === 'high') alerts.push({ icon: '!', label: 'ÉLEVÉ', text: 'Risque élevé de sécheresse — Irriguer sous 48h', color: [234, 88, 12] })
    else if (ins.drought_risk === 'moderate') alerts.push({ icon: '~', label: 'MODÉRÉ', text: "Risque modéré de sécheresse — Surveiller l'humidité", color: [202, 138, 4] })
    else alerts.push({ icon: '✓', label: 'BON', text: 'Risque de sécheresse faible', color: GREEN })

    if (ins.spray_window) alerts.push({ icon: '✓', label: 'TRAITEMENT', text: `Fenêtre favorable : ${ins.spray_window} — Vent faible, conditions idéales`, color: GREEN })
    if (ins.planting_window) alerts.push({ icon: '✓', label: 'SEMIS', text: `${ins.planting_window}`, color: GREEN })
    if ((ins.heat_stress_days ?? 0) > 2) alerts.push({ icon: '!', label: 'CHALEUR', text: `Stress thermique prévu ${ins.heat_stress_days} jours (>36°C) — Protégez les cultures`, color: [234, 88, 12] })
    if ((ins.water_stress_days ?? 0) > 3) alerts.push({ icon: '!', label: 'STRESS HYDRIQUE', text: `${ins.water_stress_days} jours avec ETo > précipitations — Planifiez l'irrigation`, color: [202, 138, 4] })

    for (const alert of alerts) {
      doc.setFillColor(alert.color[0], alert.color[1], alert.color[2])
      doc.roundedRect(MARGIN, y, 24, 8, 1, 1, 'F')
      doc.setTextColor(...WHITE)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.text(alert.label, MARGIN + 2, y + 5.5, { maxWidth: 20 })

      doc.setTextColor(...TEXT_DARK)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.text(alert.text, MARGIN + 28, y + 5.5, { maxWidth: CONTENT_W - 30 })
      y += 11
    }
  }

  // ══════════════════════════ PRACTICAL ADVICE ══════════════════════════════

  if (y > 220) { doc.addPage(); y = 20 }

  y += 6
  doc.setFillColor(...BLUE_MED)
  doc.roundedRect(MARGIN, y, CONTENT_W, 8, 3, 3, 'F')
  doc.rect(MARGIN, y + 5, CONTENT_W, 3, 'F')
  doc.setTextColor(...WHITE)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('CONSEILS PRATIQUES', MARGIN + 4, y + 5.5)
  y += 12

  const et0Today = todayRow?.et0_mm ?? 0
  const precipToday = todayRow?.precipitation_mm ?? 0
  const irrigNeeded = Math.max(0, et0Today - precipToday)
  const nextRainDay = futureDays.find(d => d.date > todayStr && (d.precipitation_mm ?? 0) > 2)
  const dryDays = futureDays.filter(d => d.date > todayStr && (d.precipitation_mm ?? 0) < 1).length

  const advice: { section: string; lines: string[] }[] = [
    {
      section: 'IRRIGATION',
      lines: [
        `ETo FAO-56 aujourd'hui : ${et0Today.toFixed(1)} mm/j  —  Précipitations : ${precipToday.toFixed(1)} mm`,
        irrigNeeded > 0
          ? `→ Besoin en irrigation : environ ${(irrigNeeded * 1.15).toFixed(1)} mm/j (ETo × coeff. cultural 1.15)`
          : `→ Précipitations suffisantes — irrigation non nécessaire aujourd'hui`,
        nextRainDay
          ? `→ Prochaine pluie prévue : ${dayShort(nextRainDay.date)} (${(nextRainDay.precipitation_mm ?? 0).toFixed(1)} mm)`
          : dryDays >= 5
          ? `→ ${dryDays} jours secs à venir — prévoir un plan d'irrigation`
          : `→ Conditions d'humidité acceptables cette semaine`,
      ],
    },
    {
      section: 'TRAITEMENTS PHYTOSANITAIRES',
      lines: [
        ins?.spray_window
          ? `→ Fenêtre recommandée : ${ins.spray_window} matin (vent < 4 m/s, pas de pluie dans les 6h)`
          : `→ Vérifier les prévisions horaires avant tout traitement`,
        `→ Éviter les traitements si pluie prévue dans les 4h (lessivage des produits)`,
        `→ Idéal : vent < 3 m/s, T° entre 15-25°C, humidité 40-80%`,
      ],
    },
    {
      section: 'SEMIS ET RÉCOLTE',
      lines: [
        ins?.planting_window
          ? `→ Fenêtre de semis favorable les prochains jours`
          : `→ Vérifier les températures sol (optimal : 20-32°C pour la plupart des cultures)`,
        `→ Récolte : éviter les jours pluvieux — qualité du grain compromise`,
        futureDays.some(d => (d.precipitation_mm ?? 0) > 15)
          ? `→ Fortes pluies prévues : sécuriser les stocks et vérifier le drainage`
          : `→ Pas de risque de fortes pluies dans les 7 prochains jours`,
      ],
    },
  ]

  for (const block of advice) {
    doc.setFillColor(...GRAY_LIGHT)
    doc.roundedRect(MARGIN, y, CONTENT_W, 6, 1, 1, 'F')
    doc.setTextColor(...BLUE_MED)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.text(block.section, MARGIN + 4, y + 4)
    y += 8

    doc.setTextColor(...TEXT_DARK)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    for (const line of block.lines) {
      doc.text(line, MARGIN + 4, y, { maxWidth: CONTENT_W - 8 })
      y += 6
    }
    y += 3
  }

  // ══════════════════════════ SEASONAL OUTLOOK ══════════════════════════════

  if (data.seasonal.length > 0) {
    if (y > 220) { doc.addPage(); y = 20 }

    y += 4
    doc.setFillColor(...BLUE_MED)
    doc.roundedRect(MARGIN, y, CONTENT_W, 8, 3, 3, 'F')
    doc.rect(MARGIN, y + 5, CONTENT_W, 3, 'F')
    doc.setTextColor(...WHITE)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('PRÉVISION SAISONNIÈRE — 3 MOIS (Modèle CFS NOAA)', MARGIN + 4, y + 5.5)
    y += 10

    autoTable(doc, {
      startY: y,
      head: [['Mois', 'Temp. Moy.', 'Précipitations', 'Tendance']],
      body: data.seasonal.map(s => {
        const tempTrend = s.temperature_mean > 30 ? 'Chaud' : s.temperature_mean > 27 ? 'Normal' : 'Frais'
        const precipTrend = s.precipitation_mm > 150 ? 'Bonne pluviométrie' : s.precipitation_mm > 80 ? 'Normale' : 'Sèche'
        return [
          frMonth(s.month),
          `${s.temperature_mean.toFixed(1)}°C`,
          `${Math.round(s.precipitation_mm)} mm`,
          `${tempTrend} · ${precipTrend}`,
        ]
      }),
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 8, cellPadding: 2.5, textColor: TEXT_DARK },
      headStyles: { fillColor: BLUE_LIGHT, textColor: WHITE, fontStyle: 'bold', fontSize: 8.5 },
      alternateRowStyles: { fillColor: GRAY_LIGHT },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'center', textColor: [234, 88, 12] as [number,number,number] },
        2: { halign: 'center', textColor: [59, 130, 246] as [number,number,number] },
        3: { fontStyle: 'italic' },
      },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4
  }

  // ══════════════════════════ FOOTER ════════════════════════════════════════

  const PAGE_H = 297
  doc.setFillColor(...BLUE_DARK)
  doc.rect(0, PAGE_H - 18, PAGE_W, 18, 'F')
  doc.setFillColor(...GREEN)
  doc.rect(0, PAGE_H - 18, 4, 18, 'F')

  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('FaîtiereHub — Météo Agricole Togo', MARGIN + 4, PAGE_H - 10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(148, 163, 184)
  doc.text(
    'Sources : ECMWF IFS 0.25° · GFS NOAA Seamless · ICON DWD Seamless · Nowcast Open-Meteo · FAO-56 Penman-Monteith',
    MARGIN + 4,
    PAGE_H - 5
  )
  doc.setTextColor(148, 163, 184)
  doc.text(`Bulletin généré le ${nowStr}`, PAGE_W - MARGIN, PAGE_H - 5, { align: 'right' })

  // ══════════════════════════ PAGE NUMBERS ══════════════════════════════════

  const totalPages = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    if (i > 1) {
      doc.setFillColor(...BLUE_DARK)
      doc.rect(0, PAGE_H - 18, PAGE_W, 18, 'F')
      doc.setFillColor(...GREEN)
      doc.rect(0, PAGE_H - 18, 4, 18, 'F')
      doc.setTextColor(148, 163, 184)
      doc.setFontSize(7)
      doc.text(`Page ${i} / ${totalPages}`, PAGE_W / 2, PAGE_H - 9, { align: 'center' })
    }
  }

  // ══════════════════════════ SAVE / SHARE ══════════════════════════════════

  const filename = `bulletin-meteo-${data.region.toLowerCase()}-${todayStr}.pdf`

  // Try Web Share API (mobile — lets user pick WhatsApp directly)
  const blob = doc.output('blob')
  const file = new File([blob], filename, { type: 'application/pdf' })

  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        title: `Bulletin Météo Agricole — ${data.city}`,
        text: `Bulletin météo agricole FaîtiereHub pour la région ${data.region}. Prévisions 7 jours + alertes agronomiques.`,
        files: [file],
      })
      return
    } catch {
      // User cancelled share or share failed → fallback to download
    }
  }

  // Fallback: download PDF
  doc.save(filename)
}
