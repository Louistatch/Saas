/**
 * Session management utilities.
 * Provides session isolation, cache namespacing, and cross-tab sync.
 */

const SESSION_KEY = 'fh_session_id'
const TENANT_KEY = 'fh_tenant_id'
const USER_KEY = 'fh_user_id'

/**
 * Generate a unique session fingerprint for this browser tab.
 */
export function getSessionId(): string {
  // sessionStorage is per-tab — perfect for tab isolation
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}

/**
 * Set the current tenant (cooperative) for cache namespacing.
 */
export function setTenantId(tenantId: string | null) {
  if (tenantId) {
    sessionStorage.setItem(TENANT_KEY, tenantId)
  } else {
    sessionStorage.removeItem(TENANT_KEY)
  }
}

export function getTenantId(): string | null {
  return sessionStorage.getItem(TENANT_KEY)
}

/**
 * Set the current user ID for cache namespacing.
 */
export function setUserId(userId: string | null) {
  if (userId) {
    sessionStorage.setItem(USER_KEY, userId)
  } else {
    sessionStorage.removeItem(USER_KEY)
  }
}

export function getUserId(): string | null {
  return sessionStorage.getItem(USER_KEY)
}

/**
 * Complete session destruction — clears EVERYTHING.
 * Call this on logout.
 */
export function destroySession() {
  // Clear sessionStorage (tab-specific)
  sessionStorage.clear()
  
  // Clear localStorage (shared across tabs)
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && (
      key.startsWith('sb-') || // Supabase keys
      key.startsWith('fh_') || // Our keys
      key.startsWith('supabase') ||
      key === 'current_coop_id' ||
      key === 'faitierehub_locale'
    )) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k))
  
  // Clear all cookies (including httpOnly via expiry)
  document.cookie.split(';').forEach((c) => {
    const name = c.trim().split('=')[0]
    if (name) {
      // Clear for all possible paths
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/auth`
    }
  })
}

/**
 * Broadcast a logout event to all other tabs.
 */
export function broadcastLogout() {
  try {
    const bc = new BroadcastChannel('fh_auth')
    bc.postMessage({ type: 'LOGOUT', timestamp: Date.now() })
    bc.close()
  } catch {
    // BroadcastChannel not supported — fallback to localStorage event
    localStorage.setItem('fh_logout_event', Date.now().toString())
    localStorage.removeItem('fh_logout_event')
  }
}

/**
 * Listen for logout events from other tabs.
 */
export function onLogoutBroadcast(callback: () => void): () => void {
  // BroadcastChannel method
  let bc: BroadcastChannel | null = null
  try {
    bc = new BroadcastChannel('fh_auth')
    bc.onmessage = (event) => {
      if (event.data?.type === 'LOGOUT') {
        callback()
      }
    }
  } catch {
    // Fallback: localStorage event
  }

  // localStorage fallback (works in all browsers)
  const handler = (e: StorageEvent) => {
    if (e.key === 'fh_logout_event') {
      callback()
    }
  }
  window.addEventListener('storage', handler)

  // Return cleanup function
  return () => {
    bc?.close()
    window.removeEventListener('storage', handler)
  }
}
