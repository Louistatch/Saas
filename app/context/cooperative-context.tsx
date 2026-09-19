'use client'

import { createClient } from '@/lib/supabase/client'
import { createLogger } from '@/lib/utils/logger'
import type { Cooperative, CooperativeRow } from '@/types/domain'
import type React from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './auth-context'

const log = createLogger('coop-context')

export type { Cooperative } from '@/types/domain'

export interface CooperativeContextType {
  cooperatives: Cooperative[]
  currentCooperative: Cooperative | null
  isLoading: boolean
  switchCooperative: (cooperativeId: string) => void
  updateCooperative: (cooperative: Cooperative) => Promise<void>
  addCooperative: (
    cooperative: Pick<Cooperative, 'name' | 'description' | 'primaryColor'>,
  ) => Promise<Cooperative | null>
  refreshCooperatives: () => Promise<void>
}

const CooperativeContext = createContext<CooperativeContextType | undefined>(undefined)

function rowToCooperative(c: CooperativeRow): Cooperative {
  return {
    id: c.id,
    name: c.name,
    description: c.description ?? undefined,
    logo: c.logo_url ?? undefined,
    primaryColor: c.primary_color ?? undefined,
    faitiereName: c.faitiere_name ?? undefined,
    level: c.level ?? undefined,
    parentId: c.parent_id ?? undefined,
  }
}

export function CooperativeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [cooperatives, setCooperatives] = useState<Cooperative[]>([])
  const [currentCooperative, setCurrentCooperative] = useState<Cooperative | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  // Identifiant du compte observé au rendu précédent. Une `ref` plutôt qu'un
  // état : la valeur sert uniquement à comparer, jamais à rendre, et l'effet
  // n'a donc pas à se redéclencher quand elle change.
  const lastUserIdRef = useRef<string | null>(null)

  const fetchCooperatives = useCallback(async () => {
    if (!user) {
      setCooperatives([])
      setCurrentCooperative(null)
      setIsLoading(false)
      return
    }

    // Compte sans couche organisationnelle (role='none', ou Haroo pur) : rien
    // à charger, jamais de repli sur `mapped[0]` ni sur `current_coop_id` du
    // localStorage. Sans ce garde-fou, la condition ci-dessous ne filtrait
    // QUE si `cooperativeId` était renseigné — un compte sans coopérative
    // tombait sur la requête non filtrée (toutes les coopératives), et le
    // `current_coop_id` mis en cache par un AUTRE compte dans un AUTRE onglet
    // du même navigateur (localStorage est partagé entre onglets, pas par
    // session) pouvait alors s'y trouver et être sélectionné — fuite de
    // données d'une coopérative réelle vers un compte qui n'y appartient pas.
    if (user.role !== 'super_admin' && !user.cooperativeId) {
      setCooperatives([])
      setCurrentCooperative(null)
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      let query = supabase
        .from('cooperatives')
        .select(
          'id, name, description, logo_url, primary_color, faitiere_name, level, parent_id, created_at',
        )

      if (user.role !== 'super_admin' && user.cooperativeId) {
        // For faitiere/union admins: load the full hierarchy (self + children + grandchildren)
        // For cooperative admins: load only their cooperative

        // Use the SQL function that already computes the full accessible hierarchy
        const { data: accessibleIds } = await supabase.rpc('get_accessible_cooperative_ids')
        if (accessibleIds && accessibleIds.length > 0) {
          query = supabase
            .from('cooperatives')
            .select(
              'id, name, description, logo_url, primary_color, faitiere_name, level, parent_id, created_at',
            )
            .in('id', accessibleIds as string[])
        } else {
          query = query.eq('id', user.cooperativeId)
        }
      }

      const { data, error } = await query.order('name')
      if (error) throw error

      const mapped = ((data as CooperativeRow[] | null) ?? []).map(rowToCooperative)
      setCooperatives(mapped)

      // Persist last-selected cooperative for super_admin so they don't reset on refresh
      const stored =
        typeof window !== 'undefined' ? window.localStorage.getItem('current_coop_id') : null
      const fallback = user.cooperativeId
        ? mapped.find((c) => c.id === user.cooperativeId)
        : undefined
      const fromStored = stored ? mapped.find((c) => c.id === stored) : undefined
      setCurrentCooperative(fromStored ?? fallback ?? mapped[0] ?? null)
    } catch (e) {
      log.error('Failed to fetch cooperatives', e)
    } finally {
      setIsLoading(false)
    }
  }, [user, supabase])

  // Changement de compte : purger les données du précédent locataire.
  // Sans cela, une coopérative reste affichée après une bascule de compte —
  // et `current_coop_id` du localStorage rouvrirait celle de l'ancien.
  useEffect(() => {
    const previous = lastUserIdRef.current
    const currentId = user?.id ?? null
    if (currentId === previous) return

    // `previous === null` couvre le premier rendu et la déconnexion : il n'y a
    // alors rien à purger.
    if (previous !== null && currentId !== null) {
      setCooperatives([])
      setCurrentCooperative(null)
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('current_coop_id')
      }
    }
    lastUserIdRef.current = currentId
  }, [user?.id])

  // Fetch cooperatives when user changes (separate from switch detection)
  useEffect(() => {
    fetchCooperatives()
  }, [fetchCooperatives])

  const switchCooperative = useCallback(
    (cooperativeId: string) => {
      const coop = cooperatives.find((c) => c.id === cooperativeId)
      if (coop) {
        setCurrentCooperative(coop)
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('current_coop_id', coop.id)
        }
      }
    },
    [cooperatives],
  )

  const updateCooperative = useCallback(
    async (updated: Cooperative) => {
      const { error } = await supabase
        .from('cooperatives')
        .update({
          name: updated.name,
          description: updated.description ?? null,
          logo_url: updated.logo ?? null,
          primary_color: updated.primaryColor ?? null,
        })
        .eq('id', updated.id)
      if (error) {
        log.error('Failed to update cooperative', error)
        throw error
      }
      setCooperatives((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      if (currentCooperative?.id === updated.id) setCurrentCooperative(updated)
    },
    [currentCooperative, supabase],
  )

  const addCooperative = useCallback(
    async (input: Pick<Cooperative, 'name' | 'description' | 'primaryColor'>) => {
      const { data, error } = await supabase
        .from('cooperatives')
        .insert({
          name: input.name,
          description: input.description ?? null,
          primary_color: input.primaryColor ?? null,
        })
        .select('id, name, description, logo_url, primary_color, created_at')
        .single<CooperativeRow>()
      if (error || !data) {
        log.error('Failed to insert cooperative', error)
        return null
      }
      const mapped = rowToCooperative(data)
      setCooperatives((prev) => [...prev, mapped].sort((a, b) => a.name.localeCompare(b.name)))
      return mapped
    },
    [supabase],
  )

  const value: CooperativeContextType = {
    cooperatives,
    currentCooperative,
    isLoading,
    switchCooperative,
    updateCooperative,
    addCooperative,
    refreshCooperatives: fetchCooperatives,
  }

  return <CooperativeContext.Provider value={value}>{children}</CooperativeContext.Provider>
}

export function useCooperative() {
  const context = useContext(CooperativeContext)
  if (context === undefined) {
    throw new Error('useCooperative must be used within a CooperativeProvider')
  }
  return context
}
