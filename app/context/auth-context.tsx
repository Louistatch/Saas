'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createLogger } from '@/lib/utils/logger'
import { setUserId, setTenantId, onLogoutBroadcast, destroySession } from '@/lib/auth/session'
import type { AuthUser, UserRole } from '@/types/domain'

const log = createLogger('auth')

export type { AuthUser, UserRole } from '@/types/domain'
// Backwards-compat re-export so existing imports of `User` keep working.
export type User = AuthUser

export interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<AuthUser | null>
  signup: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    cooperativeName?: string,
  ) => Promise<{ needsEmailConfirmation: boolean }>
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
  cooperative_id: string | null
}

function profileToAuthUser(profile: ProfileRow): AuthUser {
  return {
    id: profile.id,
    email: profile.email,
    firstName: profile.first_name ?? '',
    lastName: profile.last_name ?? '',
    role: profile.role,
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
      // Try up to 2 times (the profile trigger may not have fired yet on first login)
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, first_name, last_name, role, cooperative_id')
          .eq('id', userId)
          .single<ProfileRow>()
        if (!error && data) {
          return profileToAuthUser(data)
        }
        if (attempt === 0) {
          // Wait 1s and retry — gives the trigger time to create the profile
          await new Promise((r) => setTimeout(r, 1000))
        } else {
          log.debug('Profile not available after retry', { code: error?.code })
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
        const { data: { user: sbUser }, error: authError } = await supabase.auth.getUser()
        
        // If auth error (expired token, etc.) → clean up silently
        if (authError) {
          log.debug('Auth error on init, cleaning up', authError.message)
          try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
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
              try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
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

        // AUTH-08: profile/email/role updated server-side — refresh in-memory user
        // so a role change (e.g. from the admin panel) takes effect without re-login.
        if (event === 'USER_UPDATED') {
          if (session?.user) {
            const profile = await fetchProfile(session.user.id)
            if (mounted && profile) setUser(profile)
          }
          return
        }

        if (session?.user) {
          const profile = await fetchProfile(session.user.id)
          if (mounted && profile) setUser(profile)
          // If profile is null, user stays null — treated as unauthenticated.
        }
      },
    )

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

  const signup = useCallback(
    async (
      email: string,
      password: string,
      firstName: string,
      lastName: string,
      cooperativeName?: string,
    ): Promise<{ needsEmailConfirmation: boolean }> => {
      if (!supabase) throw new Error('Auth client not initialized')
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            first_name: firstName,
            last_name: lastName,
            // role is decided by the DB trigger; we don't trust user_metadata
          },
        },
      })
      if (error) throw error
      if (!data.user) return { needsEmailConfirmation: false }

      // When email confirmation is ON, there is no active session yet, so the
      // cooperative bootstrap can't run here — it will run after the user
      // confirms and lands authenticated. Signal the UI to show a check-email screen.
      const hasSession = !!data.session
      if (cooperativeName && hasSession) {
        // AUTH-03: cooperative creation + role assignment happen SERVER-SIDE.
        const res = await fetch('/api/auth/complete-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ cooperativeName }),
        })
        if (!res.ok) {
          const { error: msg } = (await res.json().catch(() => ({}))) as { error?: string }
          log.error('complete-signup failed', { status: res.status, msg })
          throw new Error(msg ?? 'Failed to finalize cooperative setup')
        }
        await refreshProfile()
      }

      return { needsEmailConfirmation: !hasSession }
    },
    [supabase, refreshProfile],
  )

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
    signup,
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
