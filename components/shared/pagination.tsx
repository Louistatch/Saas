'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PaginationBarProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  className?: string
}

export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  if (total <= pageSize) return null

  return (
    <div
      className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-border pt-4 mt-2 ${className ?? ''}`}
    >
      <p className="text-xs text-muted-foreground">
        Affichage de <strong className="text-foreground">{start}-{end}</strong> sur{' '}
        <strong className="text-foreground">{total}</strong>
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="border-border"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Page précédente"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          Page {page} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="border-border"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Page suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
