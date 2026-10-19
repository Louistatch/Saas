'use client'

import { ProtectedRoute } from '@/app/components/protected-route'
import { useAuth } from '@/app/context/auth-context'
import { HarooLifeMessagesPage } from '@/components/haroolife/messages-inbox'
import { hasOrgLayer, isHarooRole } from '@/lib/utils/permissions'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function Messages() {
  const room = useSearchParams().get('room')
  const { user } = useAuth()
  // Back to the person's own space, as the login redirect chooses it.
  const home =
    user && !hasOrgLayer(user.role) && isHarooRole(user.role, user.harooType)
      ? '/haroo'
      : '/dashboard'
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link
        href={home}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Mon espace
      </Link>
      <h1 className="mb-6 text-2xl font-black">Messages HarooLife</h1>
      <HarooLifeMessagesPage
        initialRoom={room && /^dm:[0-9a-f]{16}:[0-9a-f]{16}$/.test(room) ? room : null}
      />
    </main>
  )
}

export default function MessagesPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={null}>
        <Messages />
      </Suspense>
    </ProtectedRoute>
  )
}
