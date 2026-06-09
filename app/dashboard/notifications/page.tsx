'use client'

import { useState, useEffect } from 'react'
import { Bell, CheckCheck, Trash2, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCooperative } from '@/app/context/cooperative-context'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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

const TYPE_CONFIG = {
  info:    { icon: Info,          className: 'text-blue-600',  bg: 'bg-blue-50 dark:bg-blue-950/30' },
  success: { icon: CheckCircle,   className: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/30' },
  warning: { icon: AlertTriangle, className: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  alert:   { icon: AlertCircle,   className: 'text-red-600',   bg: 'bg-red-50 dark:bg-red-950/30' },
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return "À l'instant"
  if (diffMin < 60) return `Il y a ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `Il y a ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `Il y a ${diffD}j`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function NotificationsPage() {
  const { currentCooperative } = useCooperative()
  const [notifications, setNotifications] = useState<InAppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  useEffect(() => {
    if (!currentCooperative) return
    const supabase = createClient()
    setLoading(true)

    supabase
      .from('notifications_inapp')
      .select('id, title, body, type, icon, link, read_at, created_at')
      .eq('cooperative_id', currentCooperative.id)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data) setNotifications(data as InAppNotification[])
        setLoading(false)
      })

    // Realtime subscription
    const channel = supabase
      .channel(`notifs-page:${currentCooperative.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications_inapp',
        filter: `cooperative_id=eq.${currentCooperative.id}`,
      }, (payload) => {
        setNotifications(prev => [payload.new as InAppNotification, ...prev])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [currentCooperative])

  const markAsRead = async (id: string) => {
    if (!currentCooperative) return
    const supabase = createClient()
    const now = new Date().toISOString()
    await supabase
      .from('notifications_inapp')
      .update({ read_at: now })
      .eq('id', id)
      .eq('cooperative_id', currentCooperative.id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: now } : n))
  }

  const markAllRead = async () => {
    if (!currentCooperative) return
    const supabase = createClient()
    const now = new Date().toISOString()
    await supabase
      .from('notifications_inapp')
      .update({ read_at: now })
      .eq('cooperative_id', currentCooperative.id)
      .is('read_at', null)
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? now })))
  }

  const deleteNotification = async (id: string) => {
    if (!currentCooperative) return
    const supabase = createClient()
    await supabase
      .from('notifications_inapp')
      .delete()
      .eq('id', id)
      .eq('cooperative_id', currentCooperative.id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const visible = filter === 'unread'
    ? notifications.filter(n => !n.read_at)
    : notifications

  const unreadCount = notifications.filter(n => !n.read_at).length

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-muted-foreground">{unreadCount} non lue{unreadCount > 1 ? 's' : ''}</p>
            )}
          </div>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} className="gap-2">
            <CheckCheck className="h-4 w-4" />
            Tout marquer lu
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 border-b border-border">
        {(['all', 'unread'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={cn(
              'pb-2 px-1 text-sm font-medium border-b-2 transition-colors',
              filter === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab === 'all' ? 'Toutes' : `Non lues${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
          </button>
        ))}
      </div>

      {/* Notifications list */}
      {loading && (
        <div className="py-12 text-center text-muted-foreground">
          Chargement…
        </div>
      )}

      {!loading && visible.length === 0 && (
        <div className="py-16 text-center space-y-2">
          <Bell className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="text-muted-foreground">
            {filter === 'unread' ? 'Toutes les notifications ont été lues.' : 'Aucune notification.'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {visible.map(notif => {
          const config = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG.info
          const Icon = config.icon
          return (
            <div
              key={notif.id}
              className={cn(
                'group flex gap-4 rounded-xl border border-border p-4 transition-colors',
                !notif.read_at ? config.bg : 'bg-background',
                notif.link && 'cursor-pointer hover:bg-muted/50'
              )}
              onClick={() => {
                if (!notif.read_at) markAsRead(notif.id)
                if (notif.link) window.location.href = notif.link
              }}
            >
              <div className="mt-0.5 flex-shrink-0">
                <Icon className={cn('h-5 w-5', config.className)} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={cn('text-sm font-semibold', !notif.read_at ? 'text-foreground' : 'text-muted-foreground')}>
                    {notif.icon && <span className="mr-1.5">{notif.icon}</span>}
                    {notif.title}
                  </p>
                  {!notif.read_at && (
                    <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                  )}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{notif.body}</p>
                <p className="mt-1 text-xs text-muted-foreground/60">{formatTime(notif.created_at)}</p>
              </div>

              <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                {!notif.read_at && (
                  <button
                    onClick={e => { e.stopPropagation(); markAsRead(notif.id) }}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Marquer lu"
                  >
                    <CheckCheck className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={e => { e.stopPropagation(); deleteNotification(notif.id) }}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 dark:hover:bg-red-950/30"
                  title="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
