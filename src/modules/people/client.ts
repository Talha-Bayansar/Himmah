import { directoryRequest, DirectoryError } from "../../community/client";
import { m } from "../../paraglide/messages.js";
export const request = directoryRequest;
export const accessDenied = (error: unknown) =>
  error instanceof DirectoryError &&
  ["not_found_or_forbidden", "sign_in", "verify_required"].includes(error.code);
export function peopleMessage(error: unknown) {
  if (error instanceof DirectoryError) {
    if (
      error.code === "version_conflict" ||
      error.code === "request_key_conflict"
    )
      return m.people_conflict();
    if (error.code === "not_found_or_forbidden") return m.people_denied();
    if (error.code === "people_unavailable") return m.people_unavailable();
    if (error.code === "invalid_input") return m.people_form_invalid();
    if (error.code === "archived_reference")
      return m.people_archived_reference();
    if (error.code === "duplicate_active_record")
      return m.people_duplicate_record();
  }
  return m.error_service();
}
