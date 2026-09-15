'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { getVisibleServices, type ServiceDefinition } from '@/lib/services/registry'

function StatusDot({ status }: { status: ServiceDefinition['status'] }) {
  const color =
    status === 'healthy' ? 'bg-primary'
    : status === 'degraded' ? 'bg-amber-500'
    : status === 'broken' ? 'bg-destructive'
    : 'bg-muted-foreground/40'
  return <span className={`h-1.5 w-1.5 rounded-full ${color} shrink-0`} aria-hidden="true" />
}

/**
 * "+ Services" launcher — the single entry point to every module in the
 * Service Registry (lib/services/registry.ts). Built on the existing cmdk
 * Command primitives, which already provide search, keyboard navigation,
 * and Escape/click-outside close.
 */
export function ServiceLauncher({ role }: { role: string | undefined }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const services = useMemo(() => getVisibleServices(role), [role])
  const categories = useMemo(
    () => [...new Set(services.map((s) => s.category))],
    [services],
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const go = (route: string) => {
    setOpen(false)
    router.push(route)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 h-8 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
        aria-label="Ouvrir le lanceur de services"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Services</span>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Lanceur de services FaîtiereHub"
        description="Rechercher un module ou un service de l'écosystème"
      >
        <CommandInput placeholder="Rechercher un service…" />
        <CommandList>
          <CommandEmpty>Aucun service trouvé.</CommandEmpty>
          {categories.map((category) => (
            <CommandGroup key={category} heading={category}>
              {services
                .filter((s) => s.category === category)
                .map((s) => (
                  <CommandItem
                    key={s.id}
                    value={`${s.name} ${s.description}`}
                    onSelect={() => go(s.route)}
                  >
                    <s.icon className="h-4 w-4" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{s.name}</span>
                        {s.type !== 'native' && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 shrink-0">
                            {s.type === 'connected' ? 'connecté' : 'externe'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{s.description}</p>
                    </div>
                    <StatusDot status={s.status} />
                  </CommandItem>
                ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  )
}
