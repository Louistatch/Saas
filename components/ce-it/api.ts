export async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api/ce-it/${path}`,
    body === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          cache: 'no-store',
        },
  )
  const value = await response.json()
  if (!response.ok) throw new Error(value.error ?? 'Service indisponible')
  return value as T
}
export const field =
  'mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-950'
export const button =
  'min-h-11 rounded-xl bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-50'
export interface FileLink {
  kind: string
  url: string
}
