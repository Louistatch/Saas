'use client'
export function AnalyticsSettings() {
  return (
    <button
      type="button"
      className="rounded-md border px-4 py-2 text-sm"
      onClick={() => window.dispatchEvent(new Event('fhub:analytics-settings'))}
    >
      Modifier mon choix de mesure d’audience
    </button>
  )
}
