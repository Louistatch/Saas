'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import { Camera, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

const sizes = {
  sm: 'w-20 h-24',
  md: 'w-28 h-36',
  lg: 'w-36 h-44',
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

      setError(null)
      setUploading(true)

      try {
        // Generate a unique filename — path MUST start with cooperative ID
        // for storage policy enforcement (tenant-scoped uploads)
        const ext = file.name.split('.').pop() || 'jpg'
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const filename = `${folder}/${safeName}`

        const { error: uploadError } = await supabase.storage
          .from('member-photos')
          .upload(filename, file, {
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) throw uploadError

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('member-photos')
          .getPublicUrl(filename)

        onChange(urlData.publicUrl)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Échec de l\'upload')
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

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className={cn(
          'relative rounded-lg border-2 border-dashed border-border overflow-hidden flex items-center justify-center bg-muted/30 transition-colors',
          !disabled && 'hover:border-primary/50 cursor-pointer',
          value && 'border-solid border-border',
          sizes[size],
        )}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload photo"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Photo du membre"
              className="w-full h-full object-cover"
            />
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemove()
                }}
                className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/80 transition-colors"
                aria-label="Supprimer la photo"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </>
        ) : uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <div className="text-center p-2">
            <Camera className="h-6 w-6 text-muted-foreground mx-auto" />
            <p className="text-[10px] text-muted-foreground mt-1">Photo ID</p>
          </div>
        )}
      </div>

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
