import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-primary', className)} />
}

export function LoadingBlock({
  message,
  className,
}: {
  message?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-12',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Spinner className="h-8 w-8" />
      {message ? (
        <p className="text-muted-foreground text-sm">{message}</p>
      ) : null}
    </div>
  )
}
