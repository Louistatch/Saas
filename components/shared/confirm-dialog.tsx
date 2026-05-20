'use client'

import * as React from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = false,
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={async (e) => {
              e.preventDefault()
              await onConfirm()
            }}
            className={cn(
              destructive && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
            )}
          >
            {loading ? 'En cours…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Imperative helper, mirroring window.confirm but with the AlertDialog UI.
 * Renders a one-shot dialog into a portal and resolves a boolean.
 */
export function useConfirm() {
  const [state, setState] = React.useState<
    | null
    | (Omit<ConfirmDialogProps, 'open' | 'onOpenChange' | 'onConfirm'> & {
        resolve: (v: boolean) => void
      })
  >(null)

  const confirm = React.useCallback(
    (opts: Omit<ConfirmDialogProps, 'open' | 'onOpenChange' | 'onConfirm'>) =>
      new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    [],
  )

  const node = state ? (
    <ConfirmDialog
      open={!!state}
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      destructive={state.destructive}
      onOpenChange={(o) => {
        if (!o) {
          state.resolve(false)
          setState(null)
        }
      }}
      onConfirm={() => {
        state.resolve(true)
        setState(null)
      }}
    />
  ) : null

  return { confirm, confirmNode: node }
}
