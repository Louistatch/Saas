// CinetPay — mobile money payment aggregator covering Flooz (Moov Africa) and
// TMoney (Togocom/Yas) through a single API, plus cards. Chosen over
// Orange Money (marginal in Togo) because it natively covers the two
// operators that make up ~100% of Togo's mobile money market.
//
// API reference: https://docs.cinetpay.com/api/1.0-en/checkout/initialisation
//                https://docs.cinetpay.com/api/1.0-en/checkout/verification
//
// Flow:
//   1. initiateCinetPayPayment() → returns a hosted payment_url; redirect the
//      payer there. CinetPay's own checkout page lets them choose Flooz,
//      TMoney or another available method — we don't hardcode an operator.
//   2. CinetPay POSTs to our notify_url with only a transaction id — by
//      design, it never sends the payment status itself (anti man-in-the-
//      middle). We must call checkCinetPayTransaction() to get the
//      authoritative status before crediting anything.

const CINETPAY_BASE_URL = 'https://api-checkout.cinetpay.com/v2/payment'

export interface CinetPayPaymentParams {
  transactionId: string   // must match the `reference` used elsewhere (payments.reference)
  amount: number          // FCFA — CinetPay requires amounts to be multiples of 5
  description: string
  customerName?: string
  customerSurname?: string
  customerPhone?: string  // format: 9-digit local number, e.g. 90123456
  notifyUrl: string
  returnUrl: string
}

export interface CinetPayInitiateResult {
  success: boolean
  paymentUrl?: string
  paymentToken?: string
  error?: string
}

interface CinetPayInitiateApiResponse {
  code: string
  message: string
  description?: string
  data?: { payment_token: string; payment_url: string }
  api_response_id?: string
}

export async function initiateCinetPayPayment(
  params: CinetPayPaymentParams,
): Promise<CinetPayInitiateResult> {
  const apiKey = process.env.CINETPAY_API_KEY
  const siteId = process.env.CINETPAY_SITE_ID

  if (!apiKey || !siteId) {
    return { success: false, error: 'CinetPay environment variables not configured' }
  }

  // CinetPay rejects amounts that aren't multiples of 5 FCFA.
  const amount = Math.round(params.amount / 5) * 5

  try {
    const response = await fetch(CINETPAY_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: apiKey,
        site_id: siteId,
        transaction_id: params.transactionId,
        amount,
        currency: 'XOF',
        description: params.description,
        notify_url: params.notifyUrl,
        return_url: params.returnUrl,
        channels: 'MOBILE_MONEY',
        customer_name: params.customerName ?? 'Membre',
        customer_surname: params.customerSurname ?? 'FaîtiereHub',
        customer_phone_number: params.customerPhone ?? '',
      }),
      signal: AbortSignal.timeout(10_000),
    })

    const data = (await response.json()) as CinetPayInitiateApiResponse

    // Rely on payment_url being present rather than a specific `code` value —
    // CinetPay's documented success code for this endpoint wasn't confirmed
    // against a live account; the presence of a usable checkout link is the
    // unambiguous signal either way.
    if (!response.ok || !data.data?.payment_url) {
      return { success: false, error: data.description || data.message || `CinetPay error ${response.status}` }
    }

    return { success: true, paymentUrl: data.data.payment_url, paymentToken: data.data.payment_token }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export type CinetPayTransactionStatus = 'ACCEPTED' | 'REFUSED' | 'PENDING' | 'CANCELLED'

export interface CinetPayCheckResult {
  success: boolean
  status?: CinetPayTransactionStatus
  amount?: number
  currency?: string
  paymentMethod?: string
  operatorId?: string
  error?: string
}

interface CinetPayCheckApiResponse {
  code: string
  message: string
  data?: {
    amount: string
    currency: string
    status: CinetPayTransactionStatus
    payment_method: string
    operator_id: string
  }
}

/**
 * Authoritative status check — always call this after a notify_url ping
 * or before crediting a payment. Never trust a client-side redirect or
 * the notify_url body alone (CinetPay deliberately omits the status there).
 */
export async function checkCinetPayTransaction(transactionId: string): Promise<CinetPayCheckResult> {
  const apiKey = process.env.CINETPAY_API_KEY
  const siteId = process.env.CINETPAY_SITE_ID

  if (!apiKey || !siteId) {
    return { success: false, error: 'CinetPay environment variables not configured' }
  }

  try {
    const response = await fetch(`${CINETPAY_BASE_URL}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: apiKey, site_id: siteId, transaction_id: transactionId }),
      signal: AbortSignal.timeout(10_000),
    })

    const data = (await response.json()) as CinetPayCheckApiResponse

    if (!response.ok || !data.data) {
      return { success: false, error: data.message || `CinetPay error ${response.status}` }
    }

    return {
      success: true,
      status: data.data.status,
      amount: Number(data.data.amount),
      currency: data.data.currency,
      paymentMethod: data.data.payment_method,
      operatorId: data.data.operator_id,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}
