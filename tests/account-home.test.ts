import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { trainingShareMessage, whatsappShareUrl } from '../components/operator/share-training'
import { accountHomeUrl } from '../lib/account/journey'

describe('accueil du compte après confirmation', () => {
  it('envoie un candidat opérateur (ni organisation, ni Haroo) dans son espace', () => {
    assert.equal(accountHomeUrl({ role: 'none', harooType: null }, { operator: true }), '/operator')
    assert.equal(accountHomeUrl({ role: 'none', harooType: null }), '/dashboard')
  })
  it('laisse la priorité à l’organisation puis à Haroo', () => {
    assert.equal(
      accountHomeUrl({ role: 'member', harooType: null }, { operator: true }),
      '/dashboard',
    )
    assert.equal(
      accountHomeUrl({ role: 'cooperative_admin', harooType: 'ouvrier' }, { operator: true }),
      '/dashboard',
    )
    assert.equal(
      accountHomeUrl({ role: 'none', harooType: 'ouvrier' }, { operator: true }),
      '/haroo',
    )
    assert.equal(
      accountHomeUrl({ role: 'super_admin', harooType: null }, { operator: true }),
      '/admin',
    )
  })
})

describe('partage de la formation', () => {
  it('prépare un message WhatsApp avec le lien d’inscription', () => {
    const text = trainingShareMessage('https://www.faitierehub.com/auth/signup/operator')
    assert.match(text, /formation gratuite/i)
    assert.match(text, /\/auth\/signup\/operator$/)
    const url = whatsappShareUrl(text)
    assert.ok(url.startsWith('https://wa.me/?text='))
    assert.equal(decodeURIComponent(url.slice('https://wa.me/?text='.length)), text)
  })
})
