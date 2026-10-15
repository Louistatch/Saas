// Orange Money West Africa payment initiation and callback handling

export interface OrangeMoneyPaymentParams {
  phone: string        // format: +228XXXXXXXX
  amount: number       // in FCFA
  reference: string    // unique payment reference
  description?: string
  returnUrl?: string
}

export interface OrangeMoneyResult {
  success: boolean
  paymentUrl?: string   // redirect URL for user to complete payment
  txId?: string
  error?: string
}

interface OrangeMoneyApiResponse {
  payment_url: string
  tx_id: string
}

export async function initiateOrangeMoneyPayment(
  params: OrangeMoneyPaymentParams,
): Promise<OrangeMoneyResult> {
  const apiUrl = process.env.ORANGE_MONEY_API_URL
  const apiKey = process.env.ORANGE_MONEY_API_KEY
  const merchantKey = process.env.ORANGE_MONEY_MERCHANT_KEY

  if (!apiUrl || !apiKey || !merchantKey) {
    return { success: false, error: 'Orange Money environment variables not configured' }
  }

  try {
    const response = await fetch(`${apiUrl}/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        merchant_key: merchantKey,
        phone: params.phone,
        amount: params.amount,
        reference: params.reference,
        description: params.description ?? '',
        return_url: params.returnUrl ?? '',
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      const text = await response.text()
      return { success: false, error: `Orange Money API error ${response.status}: ${text}` }
    }

    const data = (await response.json()) as OrangeMoneyApiResponse
    return {
      success: true,
      paymentUrl: data.payment_url,
      txId: data.tx_id,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export function generatePaymentReference(prefix: string): string {
  const year = new Date().getFullYear()
  const random = Math.random().toString(36).slice(2, 7).toUpperCase()
  const ts = Date.now().toString(36).toUpperCase()
  return `${prefix}-${year}-${ts}${random}`
}
