// Réponses des API /api/payg/*, /api/institution/* telles que les écrans les lisent.

import type { CardFormat, MembershipRole, OperatorKind } from '@/lib/payg/model'

export interface PaygCapabilities {
  issueCards: boolean
  printCards: boolean
  seeWallet: boolean
  recharge: boolean
  seeLedger: boolean
  manageAgents: boolean
  exportReports: boolean
  orderFaitierehubPrint: boolean
}

export interface PaygCooperative {
  id: string
  name: string
  scopes: string[]
  freeRemaining: number
}

export interface TrainingAccount {
  id: string
  user_id: string
  partner_id: string | null
  total_fcfa: number
  installment_fcfa: number
  paid_fcfa: number
  payer: 'self' | 'institution'
  status: 'unpaid' | 'partial' | 'paid' | 'waived'
}

export interface PaygMe {
  user_id: string
  is_super_admin: boolean
  memberships: {
    partner_id: string
    display_name: string
    kind: OperatorKind
    role: MembershipRole
    status: string
  }[]
  current?: {
    partner_id: string
    partner_code: string
    display_name: string
    kind: OperatorKind
    status: string
    role: MembershipRole
    capabilities: PaygCapabilities
    other_partners: { partner_id: string; display_name: string; role: MembershipRole }[]
  }
  wallet?: { credit_balance: number; welcome_credits: number; welcome_granted: boolean }
  cooperatives?: PaygCooperative[]
  pricing: {
    commission_fcfa: number
    packs: { code: string; credits: number; price_fcfa: number }[]
    training_fcfa: number
    card_prices: readonly { format: string; label: string; priceFcfa: number }[]
  }
  training: TrainingAccount | null
  certification: {
    partner_id: string
    training_completed_at: string | null
    exam_passed_at: string | null
    certified_at: string | null
  } | null
}

export interface MemberRow {
  id: string
  first_name: string
  last_name: string
  village: string | null
  has_photo: boolean
  status: string
  card: {
    id: string
    card_number: string
    expiry_date: string | null
    commercial: boolean
    card_format: CardFormat
  } | null
}

export interface IssuedCard {
  member_card_id: string
  card_number: string
  card_status: string
  cooperative: string
  producer: string
  mode: string
  source: 'welcome' | 'purchased' | null
  commission_status: 'consumed' | 'released' | null
  card_format: CardFormat
  producer_price_fcfa: number | null
  issued_by: string
  issued_at: string
}

export interface LedgerEntry {
  id: string
  entry_type: string
  credits: number
  welcome_delta: number
  balance_after: number
  amount_fcfa: number | null
  note: string | null
  created_at: string
  label: string
  actor: string
}

export interface ActivityEntry {
  id: string
  at: string
  action: string
  label: string
  actor: string
  cooperative: string | null
  details: Record<string, unknown>
}

export interface AgentRow {
  user_id: string
  name: string
  email: string | null
  role: MembershipRole
  status: string
  joined_at: string
  cooperatives: { id: string; name: string; scopes: string[] }[]
  training: {
    id: string
    user_id: string
    total_fcfa: number
    paid_fcfa: number
    payer: 'self' | 'institution'
    status: string
  } | null
  certification: {
    training_completed_at: string | null
    exam_passed_at: string | null
    certified_at: string | null
  } | null
  cards_issued: number
  last_activity_at: string | null
}

export interface PendingInvitation {
  id: string
  email: string
  full_name: string
  membership_role: MembershipRole
  expires_at: string
  created_at: string
}

export interface PrintOrder {
  id: string
  status: string
  card_format: 'plastified' | 'pvc'
  delivery_address: string
  delivery_contact: string
  note: string | null
  fabrication_fcfa: number | null
  delivery_fcfa: number | null
  quote_note: string | null
  created_at: string
  cards: number
  total_fcfa: number | null
}
