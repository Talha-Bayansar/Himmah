import { Link } from "@tanstack/react-router";
import { CalendarDays, SlidersHorizontal, Users } from "lucide-react";
import { Skeleton } from "../components/ui/skeleton";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
export const workspaceSections = [
  "people",
  "activities",
  "manage",
  "organization",
  "staff",
  "invitations",
  "access",
  "settings",
  "notifications",
] as const;
export type WorkspaceSection = (typeof workspaceSections)[number];
export function WorkspaceNavigation({
  organizationId,
  role,
  section,
}: {
  organizationId: string;
  role: string | undefined;
  section: WorkspaceSection;
}) {
  useLocale();
  if (!role)
    return (
      <nav className="workspace-navigation" aria-label={m.directory_loading()}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 flex-1" />
        ))}
      </nav>
    );
  const admin = ["owner", "admin"].includes(role);
  return (
    <nav className="workspace-navigation" aria-label={m.main_navigation()}>
      {admin && (
        <Link
          to="/workspace/$organizationId/people/contacts"
          params={{ organizationId }}
          aria-current={section === "people" ? "page" : undefined}
        >
          <Users aria-hidden="true" size={20} />
          <span>{m.nav_people()}</span>
        </Link>
      )}
      <Link
        to="/workspace/$organizationId/$section"
        params={{ organizationId, section: "activities" }}
        aria-current={section === "activities" ? "page" : undefined}
      >
        <CalendarDays aria-hidden="true" size={20} />
        <span>{m.activities_title()}</span>
      </Link>
      {admin && (
        <Link
          to="/workspace/$organizationId/$section"
          params={{ organizationId, section: "manage" }}
          aria-current={
            [
              "manage",
              "organization",
              "staff",
              "invitations",
              "access",
            ].includes(section)
              ? "page"
              : undefined
          }
        >
          <SlidersHorizontal aria-hidden="true" size={20} />
          <span>{m.manage_title()}</span>
        </Link>
      )}
    </nav>
  );
}
