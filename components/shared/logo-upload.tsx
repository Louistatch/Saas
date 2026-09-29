'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { ImageIcon, Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface LogoUploadProps {
  /** Current logo URL, or null. */
  value: string | null
  /** Called with the public URL after a successful upload, or null on remove. */
  onChange: (url: string | null) => void
  /** Cooperative id — also the storage folder, which the bucket RLS checks. */
  cooperativeId: string
  disabled?: boolean
  className?: string
}

const BUCKET = 'cooperative-logos'
const MAX_BYTES = 512 * 1024

/**
 * Verify the file really is an image from its magic bytes rather than its
 * (spoofable) Content-Type — same rule as components/shared/photo-upload.
 * SVG is text, so it is matched separately on its root element.
 */
async function isAcceptedImage(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const is = (sig: number[], offset = 0) => sig.every((b, i) => head[offset + i] === b)
  if (is([0xff, 0xd8, 0xff])) return true // jpeg
  if (is([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return true // png
  if (is([0x52, 0x49, 0x46, 0x46]) && is([0x57, 0x45, 0x42, 0x50], 8)) return true // webp
  if (file.type === 'image/svg+xml') {
    const text = await file.slice(0, 1024).text()
    return /<svg[\s>]/i.test(text)
  }
  return false
}

/**
 * Organisation logo uploader.
 *
 * The preview is a SQUARE plate on a dark swatch, because that is exactly how
 * lib/card-engine/renderer.ts prints it: a rounded square, fitted with `meet`
 * so the emblem is letterboxed rather than cropped. Showing it on a light
 * rectangle here would hide the one problem that actually matters — a wide
 * wordmark shrinks to almost nothing inside a square plate.
 */
export function LogoUpload({
  value,
  onChange,
  cooperativeId,
  disabled = false,
  className,
}: LogoUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = useMemo(() => createClient(), [])

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)

      if (file.size > MAX_BYTES) {
        setError('Le logo ne doit pas dépasser 500 Ko')
        return
      }
      if (!(await isAcceptedImage(file))) {
        setError('Format non accepté — PNG, JPEG, WebP ou SVG')
        return
      }

      setUploading(true)
      try {
        const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '')
        const rand =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}`
        // First path segment MUST be the cooperative id: the bucket policy
        // checks it against get_accessible_cooperative_ids().
        const path = `${cooperativeId}/${Date.now()}-${rand}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { cacheControl: '3600', upsert: false })
        if (uploadError) throw uploadError

        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
        onChange(data.publicUrl)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Échec de l'envoi")
      } finally {
        setUploading(false)
      }
    },
    [cooperativeId, onChange, supabase],
  )

  const handleRemove = useCallback(async () => {
    if (!value) return
    try {
      const path = new URL(value).pathname.split(`/storage/v1/object/public/${BUCKET}/`)[1]
      if (path) await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)])
    } catch {
      // The row is what matters; an orphaned object is harmless.
    }
    onChange(null)
  }, [value, onChange, supabase])

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-start gap-4">
        <div className="relative h-24 w-24 shrink-0 rounded-2xl bg-[#0d3d22] p-2 shadow-inner">
          {value ? (
            <>
              {/* Plain <img>: the source is an arbitrary Supabase Storage URL,
                  which next/image would need an explicit remote pattern for. */}
              <img
                src={value}
                alt="Logo de l'organisation"
                className="h-full w-full rounded-xl bg-white/95 object-contain p-1.5"
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove()}
                  className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground transition-colors hover:bg-destructive/80"
                  aria-label="Supprimer le logo"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </>
          ) : (
            <div className="grid h-full w-full place-items-center rounded-xl border-2 border-dashed border-white/25">
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-white/60" />
              ) : (
                <ImageIcon className="h-5 w-5 text-white/50" />
              )}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <button
            type="button"
            onClick={() => !disabled && !uploading && inputRef.current?.click()}
            disabled={disabled || uploading}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 disabled:opacity-50"
          >
            {value ? 'Remplacer le logo' : 'Téléverser un logo'}
          </button>
          <ul className="space-y-1 text-[11px] leading-snug text-muted-foreground">
            <li>
              <strong className="font-medium text-foreground">Carré de préférence.</strong> Le logo
              est posé dans un cadre carré sur la carte : un logo large est réduit pour tenir en
              entier, jamais rogné — il paraît donc plus petit.
            </li>
            <li>PNG à fond transparent ou SVG pour un rendu net à l&apos;impression.</li>
            <li>512 × 512 px minimum, 500 Ko maximum.</li>
            <li>Aperçu sur fond sombre : c&apos;est le fond réel de la carte.</li>
          </ul>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
