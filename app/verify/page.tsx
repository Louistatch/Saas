'use client'

import { extractCardNumber } from '@/lib/verify/card-number'
import { ArrowLeft, ScanLine, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'

/**
 * Manual card check, for when the camera is unavailable (linked from /scan). Accepts the number
 * printed on the card (e.g. FEN-66261) or the full verification link, then opens /verify/<card>.
 */
export default function VerifyManualPage() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const card = extractCardNumber(value)
    if (!card) {
      setError(
        'Numéro non reconnu. Saisissez-le tel qu’il est imprimé sur la carte, par exemple FEN-66261.',
      )
      return
    }
    setError('')
    router.push(`/verify/${encodeURIComponent(card)}`)
  }

  return (
    <main className="min-h-[100dvh] bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-md">
        <Link
          href="/scan"
          className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Scanner un QR code
        </Link>
        <h1 className="mt-6 flex items-center gap-2 text-2xl font-bold text-slate-900">
          <ShieldCheck className="h-6 w-6 text-emerald-700" aria-hidden />
          Vérifier une carte
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Saisissez le numéro imprimé sur la carte membre pour vérifier son authenticité.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3" noValidate>
          <label htmlFor="card-number" className="block text-sm font-semibold text-slate-800">
            Numéro de carte
          </label>
          <input
            id="card-number"
            name="card"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="FEN-66261"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'card-number-error' : undefined}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg tracking-wide text-slate-900 outline-none focus-visible:border-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-700/30"
          />
          {error && (
            <p id="card-number-error" role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
          >
            <ScanLine className="h-5 w-5" aria-hidden />
            Vérifier la carte
          </button>
        </form>
      </div>
    </main>
  )
}
