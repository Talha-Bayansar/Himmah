export interface OrganizationInput {
  name: string;
  slug: string;
  timezone: string;
  creationKey: string;
  adultAuthorized: true;
}
export interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  role: "owner" | "admin" | "volunteer";
  createdAt: string;
}
export function organizationSlug(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
    .replace(/-$/, "");
}
export function validateOrganization(value: unknown): OrganizationInput {
  if (!value || typeof value !== "object")
    throw Error("Enter your organization details.");
  const v = value as Record<string, unknown>;
  if (v.adultAuthorized !== true)
    throw Error(
      "Confirm that you are an adult authorized to manage this organization.",
    );
  const name = typeof v.name === "string" ? v.name.trim() : "";
  const slug = typeof v.slug === "string" ? v.slug.trim().toLowerCase() : "";
  const timezone = typeof v.timezone === "string" ? v.timezone : "";
  if (name.length < 2 || name.length > 100)
    throw Error("Organization name must be 2–100 characters.");
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    slug.length < 3 ||
    slug.length > 48
  )
    throw Error(
      "Workspace address must be 3–48 lowercase letters, numbers or hyphens.",
    );
  if (
    ["admin", "api", "start", "demo", "auth", "support", "www"].includes(slug)
  )
    throw Error("Choose a different workspace address.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    if (!timezone) throw Error();
  } catch {
    throw Error("Choose a valid timezone.");
  }
  if (
    typeof v.creationKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v.creationKey,
    )
  )
    throw Error("Refresh the setup page and try again.");
  return {
    name,
    slug,
    timezone,
    creationKey: v.creationKey,
    adultAuthorized: true,
  };
}
export function requireSameOrigin(request: Request, appOrigin: string) {
  if (request.headers.get("origin") !== appOrigin)
    throw Error("Request origin not allowed.");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw Error("Cross-site request not allowed.");
}
