'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface InAppNotification {
  id: string
  title: string
  body: string
  type: 'info' | 'success' | 'warning' | 'alert'
  icon: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

interface NotificationBellProps {
  cooperativeId: string
  className?: string
}

const TYPE_COLORS: Record<InAppNotification['type'], string> = {
  info: 'text-blue-600',
  success: 'text-green-600',
  warning: 'text-amber-600',
  alert: 'text-red-600',
}

export function NotificationBell({ cooperativeId, className }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<InAppNotification[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const mountIdRef = useRef(0)

  const unreadCount = notifications.filter((n) => !n.read_at).length

  const fetchNotifications = useCallback(async () => {
    if (!cooperativeId) return
    setLoading(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('notifications_inapp')
        .select('id, title, body, type, icon, link, read_at, created_at')
        .eq('cooperative_id', cooperativeId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (data) setNotifications(data as InAppNotification[])
    } finally {
      setLoading(false)
    }
  }, [cooperativeId])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    if (!cooperativeId) return

    // Unique channel name per mount so Supabase always creates a fresh
    // channel object — prevents "cannot add postgres_changes callbacks after
    // subscribe()" in React StrictMode (double-invoke) and on fast re-renders.
    const id = ++mountIdRef.current
    const supabase = createClient()
    const channel = supabase
      .channel(`notifs-bell:${cooperativeId}:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications_inapp',
          filter: `cooperative_id=eq.${cooperativeId}`,
        },
        (payload) => {
          setNotifications((prev) =>
            [payload.new as InAppNotification, ...prev].slice(0, 20)
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [cooperativeId])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const markAsRead = useCallback(
    async (id: string) => {
      try {
        const supabase = createClient()
        const now = new Date().toISOString()
        await supabase
          .from('notifications_inapp')
          .update({ read_at: now })
          .eq('id', id)
          .eq('cooperative_id', cooperativeId)
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read_at: now } : n))
        )
      } catch (error) {
        console.error('Failed to mark notification as read:', error)
      }
    },
    [cooperativeId]
  )

  const markAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read_at)
    if (!unread.length) return
    try {
      const supabase = createClient()
      const now = new Date().toISOString()
      await supabase
        .from('notifications_inapp')
        .update({ read_at: now })
        .eq('cooperative_id', cooperativeId)
        .is('read_at', null)
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })))
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error)
    }
  }, [notifications, cooperativeId])

  function formatTime(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60_000)
    if (diffMin < 1) return "à l'instant"
    if (diffMin < 60) return `il y a ${diffMin} min`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `il y a ${diffH}h`
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Notifications"
        onClick={() => {
          setOpen((v) => !v)
          if (!open) fetchNotifications()
        }}
        className="relative"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-border bg-popover shadow-lg z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-primary hover:underline"
              >
                Tout marquer lu
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {loading && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Chargement…
              </div>
            )}
            {!loading && notifications.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Aucune notification
              </div>
            )}
            {!loading &&
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={cn(
                    'flex gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors',
                    !notif.read_at && 'bg-muted/30'
                  )}
                  onClick={() => {
                    if (!notif.read_at) markAsRead(notif.id)
                    if (notif.link) window.location.href = notif.link
                  }}
                >
                  {/* Unread dot */}
                  <div className="mt-1.5 flex-shrink-0">
                    {!notif.read_at ? (
                      <span className="block h-2 w-2 rounded-full bg-primary" />
                    ) : (
                      <span className="block h-2 w-2 rounded-full bg-transparent" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-sm font-medium truncate',
                        TYPE_COLORS[notif.type]
                      )}
                    >
                      {notif.title}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {notif.body}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      {formatTime(notif.created_at)}
                    </p>
                  </div>
                </div>
              ))}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-border px-4 py-2 text-center">
              <a
                href="/dashboard/notifications"
                className="text-xs text-primary hover:underline"
                onClick={() => setOpen(false)}
              >
                Voir toutes les notifications
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
