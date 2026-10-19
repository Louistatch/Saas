/**
 * A notification on the phone from the running game, when the player is in another app (the
 * game tab is hidden) and has allowed alerts: shown by the service worker, so tapping it comes
 * back to the game. Nothing happens otherwise: the game shows its own notice.
 */
export async function alertIfAway(title: string, body: string, tag: string): Promise<boolean> {
  try {
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return false
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
    const reg = await navigator.serviceWorker?.getRegistration()
    if (!reg) return false
    await reg.showNotification(title, {
      body,
      tag,
      icon: '/icons/icon-192.png',
      data: { link: '/haroolife' },
    })
    return true
  } catch {
    return false
  }
}
