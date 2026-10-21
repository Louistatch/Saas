'use client'
import { type ComponentProps, useState } from 'react'

/** Client form: preserve long agronomic inputs and card number after a rejected request. */
export function DataForm({
  onData,
  children,
  ...props
}: Omit<ComponentProps<'form'>, 'action' | 'onSubmit'> & {
  onData: (data: FormData) => unknown | Promise<unknown>
}) {
  const [error, setError] = useState('')
  return (
    <form
      {...props}
      onSubmit={async (event) => {
        event.preventDefault()
        setError('')
        try {
          await onData(new FormData(event.currentTarget))
        } catch {
          setError('Formulaire invalide. Vérifiez les champs requis et la date d’expiration.')
        }
      }}
    >
      {children}
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
