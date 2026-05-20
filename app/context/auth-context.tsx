'use client'

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
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
  login: (email: string, password: string) => Promise<void>
  signup: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    cooperativeName?: string,
  ) => Promise<void>
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
  const supabase = useMemo(() => createClient(), [])

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
      window.location.replace('/auth/login')
    })
    return cleanup
  }, [])

  const fetchProfile = useCallback(
    async (userId: string): Promise<AuthUser | null> => {
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
    let mounted = true

    const initAuth = async () => {
      try {
        const { data: { user: sbUser } } = await supabase.auth.getUser()
        if (sbUser && mounted) {
          const profile = await fetchProfile(sbUser.id)
          if (mounted && profile) setUser(profile)
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
        if (session?.user) {
          const profile = await fetchProfile(session.user.id)
          if (mounted && profile) setUser(profile)
          // If profile is null, user stays null — they'll be treated as unauthenticated
        }
      },
    )

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [supabase, fetchProfile])

  const login = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    [supabase],
  )

  /**
   * Polls for the trigger-created profile row. Returns the row or null on timeout.
   */
  const waitForProfile = useCallback(
    async (userId: string, attempts = 8, delayMs = 400): Promise<ProfileRow | null> => {
      for (let i = 0; i < attempts; i++) {
        await new Promise((r) => setTimeout(r, delayMs))
        const { data } = await supabase
          .from('profiles')
          .select('id, email, first_name, last_name, role, cooperative_id')
          .eq('id', userId)
          .single<ProfileRow>()
        if (data) return data
      }
      return null
    },
    [supabase],
  )

  const signup = useCallback(
    async (
      email: string,
      password: string,
      firstName: string,
      lastName: string,
      cooperativeName?: string,
    ) => {
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
      if (!data.user) return

      if (cooperativeName) {
        const profile = await waitForProfile(data.user.id)
        if (!profile) {
          log.warn('Profile trigger did not run within timeout — skipping cooperative bootstrap')
          return
        }

        const { data: coop, error: coopError } = await supabase
          .from('cooperatives')
          .insert({ name: cooperativeName, description: '' })
          .select('id')
          .single<{ id: string }>()

        if (coopError || !coop) {
          log.error('Failed to create cooperative on signup', coopError)
          return
        }

        const { error: profErr } = await supabase
          .from('profiles')
          .update({ cooperative_id: coop.id, role: 'cooperative_admin' })
          .eq('id', data.user.id)
        if (profErr) {
          log.error('Failed to link cooperative to profile', profErr)
        }
      }
    },
    [supabase, waitForProfile],
  )

  const logout = useCallback(async () => {
    // Use the enterprise logout procedure for complete session destruction
    const { performLogout } = await import('@/lib/auth/logout')
    await performLogout()
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!user) return
    const profile = await fetchProfile(user.id)
    if (profile) setUser(profile)
  }, [fetchProfile, user])

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
