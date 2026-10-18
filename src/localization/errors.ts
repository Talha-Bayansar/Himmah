import { m } from "../paraglide/messages.js";
import { locales } from "../paraglide/runtime.js";
const messages = [
  m.error_title,
  m.error_description,
  m.error_generic,
  m.error_account_unavailable,
  m.error_signout,
  m.error_adult,
  m.error_signup,
  m.error_signin,
  m.error_code,
  m.error_recovery,
  m.error_reset,
  m.error_send_code,
  m.error_authorized,
  m.notice_account_created,
  m.notice_check_inbox,
  m.notice_verified,
  m.notice_verified_continue,
  m.notice_recovery,
  m.notice_password_updated,
  m.notice_code_sent,
  m.error_details,
  m.error_name,
  m.error_slug,
  m.error_slug_reserved,
  m.error_timezone,
  m.error_refresh,
  m.error_taken,
  m.error_rate_limit,
  m.error_workspace_unavailable,
  m.error_workspace_missing,
  m.error_service,
  m.error_credentials,
  m.error_expired_code,
  m.error_existing_email,
] as const;
// Server validation retains stable English messages; translate only known public errors.
// Unknown upstream text must never leak internal details or untranslated provider messages.
export function localizedText(text: string) {
  for (const message of messages) {
    if (locales.some((locale) => message({}, { locale }) === text))
      return message();
  }
  return m.error_generic();
}
export function authError(code: string | undefined, fallback: string) {
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD":
      return m.error_credentials();
    case "OTP_EXPIRED":
      return m.error_expired_code();
    case "INVALID_OTP":
      return m.error_code();
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return m.error_existing_email();
    case "TOO_MANY_REQUESTS":
      return m.error_rate_limit();
    default:
      return fallback;
  }
}
