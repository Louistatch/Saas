'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import { Camera, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface PhotoUploadProps {
  /** Current photo URL (if already uploaded) */
  value: string | null
  /** Called with the public URL after successful upload, or null on remove */
  onChange: (url: string | null) => void
  /** Folder path inside the bucket (e.g. "cooperative-id/member-id") */
  folder?: string
  /** Size of the preview */
  size?: 'sm' | 'md' | 'lg'
  className?: string
  disabled?: boolean
}

// 7:9 — the ISO/ICAO identity-photo ratio, and exactly the ratio of the
// portrait window in lib/card-engine/renderer.ts. What is framed here is what
// lands on the printed card, with no second crop in between.
const sizes = {
  sm: 'w-20 h-[103px]',
  md: 'w-28 h-36',
  lg: 'w-36 h-[185px]',
}

/**
 * Framing guide drawn inside the empty frame: head and shoulders where they
 * must land, plus the card's own corner registration ticks. An operator
 * photographing 200 members in a courtyard gets the rule from the shape, not
 * from a paragraph they will not read.
 */
function FramingGuide() {
  return (
    <svg viewBox="0 0 70 90" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <title>Cadrage attendu</title>
      <g fill="none" stroke="currentColor" strokeWidth="1" className="text-muted-foreground/45">
        <path d="M6 14V6h8M56 6h8v8M64 76v8h-8M14 84H6v-8" />
        {/* Head fills ~45% of the frame height and the shoulders start right
            under the chin — the proportions of a compliant ID portrait. */}
        <circle cx="35" cy="33" r="19" strokeDasharray="3 3" />
        <path d="M7 84c0-16 12.5-26 28-26s28 10 28 26" strokeDasharray="3 3" />
      </g>
    </svg>
  )
}

const PHOTO_TIPS = [
  'Cadrer la tête et le haut des épaules — la tête occupe ~70 % de la hauteur.',
  'Tenir le téléphone à la verticale, à hauteur des yeux, à environ 1 mètre.',
  'Fond uni et clair (un mur, un drap) — ni contre-jour, ni soleil direct.',
  'Visage de face, regard vers l’objectif, expression neutre, sans chapeau ni lunettes teintées.',
  'Lumière du jour à l’ombre : pas de flash, pas d’ombre portée sur le visage.',
]

/** The capture rules, for a form column wide enough to show them. */
export function PhotoGuidelines({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border bg-muted/30 p-3', className)}>
      <p className="text-xs font-medium">Réussir la photo de la carte</p>
      <ul className="mt-1.5 space-y-1">
        {PHOTO_TIPS.map((tip) => (
          <li key={tip} className="flex gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <span aria-hidden="true">•</span>
            <span>{tip}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        Format portrait 7:9 (photo d’identité). Une image plus large sera recadrée sur son centre.
      </p>
    </div>
  )
}

/**
 * Verify the file is really an image by inspecting its magic bytes, not the
 * (spoofable) Content-Type. Accepts JPEG, PNG, WebP, GIF.
 */
async function hasImageMagicBytes(file: File): Promise<boolean> {
  const buf = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const is = (sig: number[], offset = 0) => sig.every((b, i) => buf[offset + i] === b)
  const jpeg = is([0xff, 0xd8, 0xff])
  const png = is([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const gif = is([0x47, 0x49, 0x46, 0x38])
  const webp = is([0x52, 0x49, 0x46, 0x46]) && is([0x57, 0x45, 0x42, 0x50], 8)
  return jpeg || png || gif || webp
}

export function PhotoUpload({
  value,
  onChange,
  folder = 'photos',
  size = 'md',
  className,
  disabled = false,
}: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = useMemo(() => createClient(), [])

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setError('Seules les images sont acceptées')
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('La photo ne doit pas dépasser 5 Mo')
        return
      }

      // Validate the REAL file type via magic bytes (Content-Type is spoofable).
      const okMagic = await hasImageMagicBytes(file)
      if (!okMagic) {
        setError('Fichier image invalide ou corrompu')
        return
      }

      setError(null)
      setUploading(true)

      try {
        // Crypto-secure unique filename (no Math.random collisions).
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
        const rand =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${performance.now()}`
        const safeName = `${Date.now()}-${rand}.${ext}`
        const filename = `${folder}/${safeName}`

        const { error: uploadError } = await supabase.storage
          .from('member-photos')
          .upload(filename, file, {
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage.from('member-photos').getPublicUrl(filename)

        onChange(urlData.publicUrl)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Échec de l'upload")
      } finally {
        setUploading(false)
      }
    },
    [folder, onChange, supabase],
  )

  const handleRemove = useCallback(async () => {
    if (!value) return
    // Extract path from URL
    const url = new URL(value)
    const pathParts = url.pathname.split('/storage/v1/object/public/member-photos/')
    if (pathParts[1]) {
      await supabase.storage.from('member-photos').remove([pathParts[1]])
    }
    onChange(null)
  }, [value, onChange, supabase])

  // Une photo déjà présente affiche deux actions distinctes (changer /
  // supprimer) plutôt qu'une zone entière cliquable : un <button> ne peut pas
  // en contenir un autre, et « Supprimer » en est déjà un.
  const frameClassName = cn(
    'relative rounded-lg border-2 border-dashed border-border overflow-hidden flex items-center justify-center bg-muted/30 transition-colors',
    value && 'border-solid border-border',
    sizes[size],
  )

  return (
    <div className={cn('space-y-2', className)}>
      {value ? (
        <div className={frameClassName}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Membre" className="w-full h-full object-cover" />
          {!disabled && (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="absolute bottom-1 left-1 bg-background/90 text-foreground rounded-full p-1 hover:bg-background transition-colors"
                aria-label="Changer la photo"
              >
                <Camera className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => handleRemove()}
                className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/80 transition-colors"
                aria-label="Supprimer la photo"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          className={cn(frameClassName, !disabled && 'hover:border-primary/50 cursor-pointer')}
          onClick={() => !disabled && !uploading && inputRef.current?.click()}
          disabled={disabled}
          aria-label="Ajouter une photo"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <>
              {/* The camera sits inside the head outline: the affordance and
                  the framing instruction occupy the same spot, so neither
                  crowds the other in a frame this small. */}
              <FramingGuide />
              <Camera
                className="absolute h-5 w-5 text-muted-foreground"
                style={{ left: '50%', top: '36.7%', transform: 'translate(-50%,-50%)' }}
              />
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          // Reset so same file can be re-selected
          e.target.value = ''
        }}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
