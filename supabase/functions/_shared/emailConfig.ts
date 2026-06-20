export const SITE_NAME = 'Signalyz'
export const FROM_NAME = 'Signalyz'
export const ROOT_DOMAIN = 'signalyz.ai'
export const DEFAULT_FROM_ADDRESS = `${FROM_NAME} <notify@signalyz.ai>`

export const SIGNUP_SUBJECT = 'Confirm your Signalyz account.'

export const EMAIL_SUBJECTS: Record<string, string> = {
  signup: SIGNUP_SUBJECT,
  invite: "You've been invited to Signalyz",
  magiclink: 'Your Signalyz login link',
  recovery: 'Reset your Signalyz password',
  email_change: 'Confirm your Signalyz email change',
  reauthentication: 'Your Signalyz verification code',
}

export const SUPPORTED_TEMPLATE_KEYS = new Set([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'reauthentication',
])

export function getEmailSubject(templateKey: string): string {
  if (templateKey === 'signup') {
    return SIGNUP_SUBJECT
  }
  return EMAIL_SUBJECTS[templateKey] ?? 'Notification'
}
