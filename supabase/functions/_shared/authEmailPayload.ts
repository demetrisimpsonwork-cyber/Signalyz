export type SupabaseAuthEmailData = {
  token: string
  token_hash: string
  redirect_to: string
  email_action_type: string
  site_url?: string
  token_new?: string
  token_hash_new?: string
  old_email?: string
}

export type SupabaseAuthUser = {
  email: string
  new_email?: string
}

export function normalizeHookSecret(rawSecret: string): string {
  return rawSecret.replace(/^v1,whsec_/, '')
}

export function mapTemplateKey(emailActionType: string): string | null {
  if (emailActionType === 'email_change_new') {
    return 'email_change'
  }
  if (
    emailActionType === 'signup' ||
    emailActionType === 'invite' ||
    emailActionType === 'magiclink' ||
    emailActionType === 'recovery' ||
    emailActionType === 'email_change' ||
    emailActionType === 'reauthentication'
  ) {
    return emailActionType
  }
  return null
}

export function buildConfirmationUrl(
  supabaseUrl: string,
  emailData: Pick<SupabaseAuthEmailData, 'token_hash' | 'email_action_type' | 'redirect_to'>
): string {
  const baseUrl = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/verify`
  const params = new URLSearchParams({
    token: emailData.token_hash,
    type: emailData.email_action_type,
    redirect_to: emailData.redirect_to,
  })
  return `${baseUrl}?${params.toString()}`
}

export function buildTemplateProps(
  user: SupabaseAuthUser,
  emailData: SupabaseAuthEmailData,
  supabaseUrl: string,
  siteName: string,
  rootDomain: string
) {
  return {
    siteName,
    siteUrl: `https://${rootDomain}`,
    recipient: user.email,
    confirmationUrl: buildConfirmationUrl(supabaseUrl, emailData),
    token: emailData.token,
    email: user.email,
    newEmail: user.new_email ?? emailData.old_email ?? user.email,
  }
}
