import { useNavigate, useRouterState } from "@tanstack/react-router";
export const pageForms = [
  "activity",
  "session-series",
  "session-schedule",
  "access",
  "relationship-type",
  "relationship",
  "communication",
  "group-members",
] as const;
export type PageForm = (typeof pageForms)[number];
export function useFormNavigation(organizationId: string) {
  const navigate = useNavigate();
  const returnTo = useRouterState({ select: (state) => state.location.href });
  return (form: PageForm, recordId: string, session?: string) =>
    void navigate({
      to: "/workspace/$organizationId/forms/$form/$recordId",
      params: { organizationId, form, recordId },
      search: { returnTo, ...(session ? { session } : {}) },
    });
}

/** Return links stay within the current organization, including after URL normalization. */
export function formReturn(
  value: unknown,
  organizationId: string,
): string | null {
  if (typeof value !== "string" || !value.startsWith("/workspace/"))
    return null;
  try {
    const url = new URL(value, "https://himmah.invalid");
    const prefix = `/workspace/${organizationId}/`;
    return url.origin === "https://himmah.invalid" &&
      url.pathname.startsWith(prefix) &&
      !url.pathname.startsWith(prefix + "forms/")
      ? url.pathname + url.search + url.hash
      : null;
  } catch {
    return null;
  }
}
