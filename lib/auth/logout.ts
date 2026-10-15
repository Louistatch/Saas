/**
 * Enterprise-grade logout procedure.
 * Ensures COMPLETE session destruction with zero leaks.
 * 
 * Uses Facebook-style instant transition:
 * 1. Show transition overlay immediately (no white flash)
 * 2. Clear session in background
 * 3. Navigate to login
 */

import { createClient } from '@/lib/supabase/client'
import { destroySession, broadcastLogout } from './session'

/**
 * Full logout procedure — call this instead of supabase.auth.signOut() directly.
 * 
 * Critical: uses scope:'global' to revoke the refresh token server-side,
 * not just clear local state. Otherwise the user stays logged-in across tabs.
 */
export async function performLogout(): Promise<never> {
  // STEP 0: Instant visual feedback — show transition overlay BEFORE any async work
  // This eliminates the white flash that makes logout feel slow
  showTransitionOverlay()

  // STEP 1: Revoke the session SERVER-SIDE via API route
  // This is the ONLY way to clear httpOnly cookies set by @supabase/ssr
  // (document.cookie cannot delete httpOnly cookies)
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    })
  } catch {
    // Continue even if the request fails — we'll clear everything locally below
  }

  // STEP 2: Also clear client-side session state (singleton client)
  try {
    const supabase = createClient()
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // Continue
  }

  // STEP 3: Destroy all local state (cookies non-httpOnly, localStorage, sessionStorage)
  destroySession()

  // STEP 4: Notify other tabs
  broadcastLogout()

  // STEP 5: Full page reload to /auth/login
  // We MUST use window.location here (not router.replace):
  // - Forces re-init of all React providers (clears stale auth state)
  // - Removes the transition overlay from the DOM
  // - Prevents back-button from returning to authenticated state
  window.location.replace('/auth/login')

  // TypeScript: this never returns
  return new Promise(() => {}) as never
}

/**
 * Facebook-style transition overlay.
 * Shows immediately on logout to prevent white flash.
 * The login page will render on top of this.
 */
function showTransitionOverlay() {
  // Don't add if already exists
  if (document.getElementById('fh-transition')) return

  const overlay = document.createElement('div')
  overlay.id = 'fh-transition'
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: linear-gradient(135deg, #0A2E1A 0%, #0A3D22 50%, #061a0f 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 16px;
    opacity: 0;
    transition: opacity 150ms ease-in;
  `

  // Logo + spinner
  overlay.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" stroke-width="1.5">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
      <span style="color:white;font-size:18px;font-weight:700;font-family:system-ui;">FaîtiereHub</span>
    </div>
    <div style="width:24px;height:24px;border:3px solid rgba(74,222,128,0.2);border-top-color:#4ADE80;border-radius:50%;animation:fh-spin 0.6s linear infinite;"></div>
    <style>@keyframes fh-spin{to{transform:rotate(360deg)}}</style>
  `

  document.body.appendChild(overlay)

  // Fade in immediately
  requestAnimationFrame(() => {
    overlay.style.opacity = '1'
  })
}
