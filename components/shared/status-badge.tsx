import * as React from 'react'
import { cn } from '@/lib/utils'
import type { CardStatus, MemberStatus, UserRole } from '@/types/domain'
import { Shield } from 'lucide-react'

const tone = {
  green: 'bg-green-100 text-green-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  gray: 'bg-gray-100 text-gray-700',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800',
}

const CARD_TONE: Record<CardStatus, keyof typeof tone> = {
  active: 'green',
  pending: 'yellow',
  expired: 'gray',
  revoked: 'red',
}

const MEMBER_TONE: Record<MemberStatus, keyof typeof tone> = {
  active: 'green',
  inactive: 'gray',
  suspended: 'red',
}

const ROLE_TONE: Record<UserRole, keyof typeof tone> = {
  super_admin: 'purple',
  cooperative_admin: 'blue',
  member: 'green',
  guest: 'gray',
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function Pill({
  children,
  toneKey,
  className,
}: {
  children: React.ReactNode
  toneKey: keyof typeof tone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium',
        tone[toneKey],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function CardStatusBadge({ status }: { status: string }) {
  const key = (status in CARD_TONE ? status : 'pending') as CardStatus
  return <Pill toneKey={CARD_TONE[key]}>{capitalize(key)}</Pill>
}

export function MemberStatusBadge({ status }: { status: string }) {
  const key = (status in MEMBER_TONE ? status : 'inactive') as MemberStatus
  return <Pill toneKey={MEMBER_TONE[key]}>{capitalize(key)}</Pill>
}

export function RoleBadge({ role }: { role: string }) {
  const key = (role in ROLE_TONE ? role : 'guest') as UserRole
  const showShield = key === 'super_admin' || key === 'cooperative_admin'
  return (
    <Pill toneKey={ROLE_TONE[key]}>
      {showShield ? <Shield className="h-3 w-3" /> : null}
      {key.replace('_', ' ')}
    </Pill>
  )
}

export function PublishedBadge({ active }: { active: boolean }) {
  return (
    <Pill toneKey={active ? 'green' : 'gray'}>{active ? 'Published' : 'Draft'}</Pill>
  )
}
