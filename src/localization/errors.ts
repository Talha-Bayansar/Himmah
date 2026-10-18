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
  m.error_password_short,
  m.error_password_long,
  m.error_auth_network,
  m.error_verification_required,
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
    case "weak_password":
    case "PASSWORD_TOO_SHORT":
      return m.error_password_short();
    case "PASSWORD_TOO_LONG":
      return m.error_password_long();
    case "email_not_confirmed":
    case "EMAIL_NOT_VERIFIED":
      return m.error_verification_required();
    case "invalid_credentials":
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD":
      return m.error_credentials();
    case "OTP_EXPIRED":
      return m.error_expired_code();
    case "INVALID_OTP":
      return m.error_code();
    case "user_already_exists":
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return m.error_existing_email();
    case "over_request_rate_limit":
    case "TOO_MANY_REQUESTS":
      return m.error_rate_limit();
    default:
      return fallback;
  }
}

// The Neon wrapper throws AuthApiError for non-2xx responses. It does not
// reliably return Better Auth's { error } union, and it normalizes codes.
export function authFailure(error: unknown, fallback = m.error_service()) {
  if (error && typeof error === "object") {
    const failure = error as {
      code?: unknown;
      status?: unknown;
      message?: unknown;
    };
    if (failure.status === 429) return m.error_rate_limit();
    if (typeof failure.code === "string") {
      const result = authError(failure.code, "");
      if (result) return result;
    }
    if (typeof failure.message === "string") {
      const known = localizedText(failure.message);
      if (known !== m.error_generic()) return known;
    }
    if (error instanceof TypeError) return m.error_auth_network();
  }
  return fallback;
}
