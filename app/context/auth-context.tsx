'use client'

import { destroySession, onLogoutBroadcast, setTenantId, setUserId } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/client'
import { createLogger } from '@/lib/utils/logger'
import { effectiveHarooType } from '@/lib/utils/permissions'
import type { AuthUser, HarooType, UserRole } from '@/types/domain'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import type React from 'react'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const log = createLogger('auth')

export type { AuthUser, UserRole, HarooType } from '@/types/domain'
// Backwards-compat re-export so existing imports of `User` keep working.
export type User = AuthUser

export interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<AuthUser | null>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface ProfileRow {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  role: UserRole
  haroo_type: HarooType | null
  cooperative_id: string | null
}

function profileToAuthUser(profile: ProfileRow): AuthUser {
  return {
    id: profile.id,
    email: profile.email,
    firstName: profile.first_name ?? '',
    lastName: profile.last_name ?? '',
    role: profile.role,
    // La colonne fait foi ; le rôle hérité n'est qu'un repli pour les comptes
    // créés avant que la couche Haroo n'ait sa propre colonne.
    harooType: effectiveHarooType(profile.role, profile.haroo_type),
    cooperativeId: profile.cooperative_id ?? undefined,
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null)
  const router = useRouter()

  // Initialize the Supabase client only in the browser to avoid throwing
  // during SSR prerendering when NEXT_PUBLIC env vars are baked in at
  // Vercel build time but absent in a local build environment.
  useEffect(() => {
    setSupabase(createClient())
  }, [])

  // Track user in session for cache namespacing
  useEffect(() => {
    if (user) {
      setUserId(user.id)
      setTenantId(user.cooperativeId ?? null)
    } else {
      setUserId(null)
      setTenantId(null)
    }
  }, [user])

  // Listen for logout from other tabs
  useEffect(() => {
    const cleanup = onLogoutBroadcast(() => {
      // Another tab logged out — clear our state too
      setUser(null)
      destroySession()
      // Only redirect if we're on a protected page (avoid redirect loops on auth pages)
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth/')) {
        window.location.replace('/auth/login')
      }
    })
    return cleanup
  }, [])

  const fetchProfile = useCallback(
    async (userId: string): Promise<AuthUser | null> => {
      if (!supabase) return null
      // C3 FIX: retry up to 6 times / 800 ms each = 4.8 s total.
      // This must exceed the server-side trigger wait (MAX_PROFILE_WAIT × 400 ms = 3.2 s)
      // to avoid zombie-session false-positives on slow DB triggers.
      const MAX_ATTEMPTS = 6
      const RETRY_MS = 800
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, first_name, last_name, role, haroo_type, cooperative_id')
          .eq('id', userId)
          .single<ProfileRow>()
        if (!error && data) {
          return profileToAuthUser(data)
        }
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, RETRY_MS))
        } else {
          log.debug('Profile not available after retries', { code: error?.code })
        }
      }
      return null
    },
    [supabase],
  )

  useEffect(() => {
    if (!supabase) return
    let mounted = true

    const initAuth = async () => {
      try {
        const {
          data: { user: sbUser },
          error: authError,
        } = await supabase.auth.getUser()

        // If auth error (expired token, etc.) → clean up silently
        if (authError) {
          log.debug('Auth error on init, cleaning up', authError.message)
          try {
            await supabase.auth.signOut({ scope: 'local' })
          } catch {}
          if (mounted) setIsLoading(false)
          return
        }

        if (sbUser && mounted) {
          const profile = await fetchProfile(sbUser.id)
          if (mounted) {
            if (profile) {
              setUser(profile)
            } else {
              // User exists in auth but no profile → zombie session
              log.debug('Zombie session detected (no profile), cleaning up')
              try {
                await supabase.auth.signOut({ scope: 'local' })
              } catch {}
            }
          }
        }
      } catch (error) {
        // No session or network issue — not an error for unauthenticated visitors
        log.debug('No active session', error)
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    initAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      if (event === 'SIGNED_OUT') {
        setUser(null)
        return
      }

      // AUTH-08: password recovery flow — Supabase emits this when the user
      // lands from a reset-password email link. Route them to set a new password.
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/auth/reset-password')
        return
      }

      // Connexion réelle uniquement (jamais INITIAL_SESSION/TOKEN_REFRESHED,
      // qui se déclenchent à chaque rechargement de page) — § suivi admin
      // « qui s'est connecté ». Fire-and-forget, ne bloque jamais l'UI.
      if (event === 'SIGNED_IN') {
        void fetch('/api/auth/log-login', { method: 'POST' }).catch(() => {})
      }

      // Filet de sécurité, indépendant de la config Supabase (Site URL /
      // Redirect URLs) : si un lien magique atterrit en flux implicite
      // (access_token dans le fragment d'URL au lieu de passer par
      // /auth/callback), supabase-js l'a déjà consommé pour établir la
      // session à ce stade (detectSessionInUrl) — on efface juste le
      // fragment de la barre d'adresse pour ne jamais laisser le jeton
      // visible ni dans l'historique du navigateur.
      if (typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }

      // Couvre SIGNED_IN, INITIAL_SESSION, TOKEN_REFRESHED et USER_UPDATED :
      // dans tous les cas on resynchronise le profil.
      //
      // IMPORTANT : ne JAMAIS await une requête Supabase directement dans ce
      // callback. Il s'exécute en détenant le verrou d'auth (navigator.locks)
      // et toute requête PostgREST attend ce même verrou pour résoudre le
      // jeton → interblocage → isLoading reste true → « Chargement… » infini
      // (observé après un refresh ou un changement de compte). Le setTimeout
      // sort du callback et libère le verrou avant la requête.
      if (session?.user) {
        const userId = session.user.id
        setTimeout(() => {
          if (!mounted) return
          void fetchProfile(userId).then((profile) => {
            if (mounted && profile) setUser(profile)
            // If profile is null, user stays null — treated as unauthenticated.
          })
        }, 0)
      }
    })

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [supabase, fetchProfile, router])

  const login = useCallback(
    async (email: string, password: string): Promise<AuthUser | null> => {
      if (!supabase) throw new Error('Auth client not initialized')
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      if (!data.user) return null
      // Resolve the freshest profile so the caller can route by role.
      const profile = await fetchProfile(data.user.id)
      if (profile) setUser(profile)
      return profile
    },
    [supabase, fetchProfile],
  )

  const refreshProfile = useCallback(async () => {
    if (!user) return
    const profile = await fetchProfile(user.id)
    if (profile) setUser(profile)
  }, [fetchProfile, user])

  const logout = useCallback(async () => {
    // Use the enterprise logout procedure for complete session destruction
    const { performLogout } = await import('@/lib/auth/logout')
    await performLogout()
  }, [])

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
