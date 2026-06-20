export type SendResendEmailParams = {
  from: string
  to: string
  subject: string
  html: string
  text?: string
  idempotencyKey?: string
}

export class ResendApiError extends Error {
  status: number
  retryAfterSeconds: number | null

  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message)
    this.name = 'ResendApiError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export function parseRetryAfterHeader(value: string | null): number | null {
  if (!value) {
    return null
  }
  const seconds = Number.parseInt(value, 10)
  return Number.isFinite(seconds) ? seconds : null
}

export async function sendResendEmail(
  params: SendResendEmailParams,
  apiKey: string
): Promise<{ id: string }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  if (params.idempotencyKey) {
    headers['Idempotency-Key'] = params.idempotencyKey
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      ...(params.text ? { text: params.text } : {}),
    }),
  })

  if (!response.ok) {
    const retryAfterSeconds =
      response.status === 429 ? parseRetryAfterHeader(response.headers.get('retry-after')) : null

    let message = `Resend API error (${response.status})`
    try {
      const body = await response.json()
      if (typeof body?.message === 'string' && body.message.length > 0) {
        message = body.message
      }
    } catch {
      // Ignore JSON parse errors and use the default message.
    }

    throw new ResendApiError(message, response.status, retryAfterSeconds)
  }

  const body = await response.json()
  return { id: body.id }
}
