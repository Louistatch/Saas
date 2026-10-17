/** Public diagnostic codes only. Never include a CAPTCHA token, key, or a raw exception. */
export function captchaExceptionCode(error: unknown): string {
  if (error instanceof Error && /^script-(load|timeout)$/.test(error.message)) return error.message
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code)
    if (/^\d{3,6}$/.test(code)) return code
  }
  return 'render'
}

export function captchaFailure(raw: unknown) {
  const code =
    typeof raw === 'string' && /^(?:\d{3,6}|script-load|script-timeout|render)$/.test(raw)
      ? raw
      : 'unknown'
  if (code === '110200' || code === '400021')
    return {
      code,
      reason: 'domain',
      message:
        'Le contrôle anti-robot n’est pas autorisé pour ce site. Un réglage Cloudflare doit être corrigé par notre équipe.',
    }
  if (['110100', '110110', '400020', '400070'].includes(code))
    return {
      code,
      reason: 'configuration',
      message:
        'Le contrôle anti-robot de ce site est mal configuré. Notre équipe doit vérifier le widget Cloudflare.',
    }
  if (code === '200100' || code === '110600')
    return {
      code,
      reason: 'clock-or-timeout',
      message:
        'Le contrôle a expiré. Vérifie la date et l’heure automatiques du téléphone, puis relance-le.',
    }
  if (code === '110620')
    return {
      code,
      reason: 'interaction-timeout',
      message:
        'Le délai pour valider le contrôle est dépassé. Relance-le et termine la vérification.',
    }
  if (code === 'script-load' || code === 'script-timeout' || code === '200500')
    return {
      code,
      reason: 'loading',
      message:
        'Le contrôle ne se charge pas. Autorise le contrôle Cloudflare dans ton navigateur ou essaie une autre connexion.',
    }
  return {
    code,
    reason: 'challenge',
    message: 'Cloudflare n’a pas validé le contrôle. Relance-le en gardant cette page ouverte.',
  }
}
