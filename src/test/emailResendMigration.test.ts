import { describe, expect, it } from 'vitest'
import {
  buildConfirmationUrl,
  buildTemplateProps,
  mapTemplateKey,
  normalizeHookSecret,
} from '../../supabase/functions/_shared/authEmailPayload.ts'
import {
  DEFAULT_FROM_ADDRESS,
  getEmailSubject,
} from '../../supabase/functions/_shared/emailConfig.ts'
import { parseRetryAfterHeader, ResendApiError } from '../../supabase/functions/_shared/resend.ts'

describe('authEmailPayload', () => {
  it('normalizes Supabase hook secrets', () => {
    expect(normalizeHookSecret('v1,whsec_base64secret')).toBe('base64secret')
    expect(normalizeHookSecret('base64secret')).toBe('base64secret')
  })

  it('maps Supabase email action types to template keys', () => {
    expect(mapTemplateKey('signup')).toBe('signup')
    expect(mapTemplateKey('email_change_new')).toBe('email_change')
    expect(mapTemplateKey('unknown_action')).toBeNull()
  })

  it('builds Supabase auth verify URLs', () => {
    const url = buildConfirmationUrl('https://hzsswurcqaxrsacseknz.supabase.co', {
      token_hash: 'hash123',
      email_action_type: 'signup',
      redirect_to: 'https://signalyz.ai',
    })

    expect(url).toBe(
      'https://hzsswurcqaxrsacseknz.supabase.co/auth/v1/verify?token=hash123&type=signup&redirect_to=https%3A%2F%2Fsignalyz.ai'
    )
  })

  it('builds template props for signup emails', () => {
    const props = buildTemplateProps(
      { email: 'user@example.com' },
      {
        token: '123456',
        token_hash: 'hash123',
        redirect_to: 'https://signalyz.ai',
        email_action_type: 'signup',
      },
      'https://hzsswurcqaxrsacseknz.supabase.co',
      'Signalyz',
      'signalyz.ai'
    )

    expect(props.recipient).toBe('user@example.com')
    expect(props.siteName).toBe('Signalyz')
    expect(props.siteUrl).toBe('https://signalyz.ai')
    expect(props.confirmationUrl).toContain('/auth/v1/verify')
    expect(props.token).toBe('123456')
  })

  it('uses new_email for email change templates', () => {
    const props = buildTemplateProps(
      { email: 'old@example.com', new_email: 'new@example.com' },
      {
        token: '123456',
        token_hash: 'hash123',
        redirect_to: 'https://signalyz.ai',
        email_action_type: 'email_change',
      },
      'https://hzsswurcqaxrsacseknz.supabase.co',
      'Signalyz',
      'signalyz.ai'
    )

    expect(props.email).toBe('old@example.com')
    expect(props.newEmail).toBe('new@example.com')
  })
})

describe('emailConfig', () => {
  it('uses notify@signalyz.ai as the default sender', () => {
    expect(DEFAULT_FROM_ADDRESS).toBe('Signalyz <notify@signalyz.ai>')
  })

  it('returns subjects for supported templates', () => {
    expect(getEmailSubject('signup')).toBe('Confirm your Signalyz account.')
    expect(getEmailSubject('recovery')).toBe('Reset your Signalyz password')
    expect(getEmailSubject('unknown')).toBe('Notification')
  })
})

describe('resend helpers', () => {
  it('parses retry-after headers', () => {
    expect(parseRetryAfterHeader('60')).toBe(60)
    expect(parseRetryAfterHeader(null)).toBeNull()
    expect(parseRetryAfterHeader('invalid')).toBeNull()
  })

  it('exposes structured rate-limit errors', () => {
    const error = new ResendApiError('Too many requests', 429, 30)
    expect(error.status).toBe(429)
    expect(error.retryAfterSeconds).toBe(30)
  })
})
