import { Link } from "@tanstack/react-router";
import { CalendarDays, SlidersHorizontal, Users, House } from "lucide-react";
import { Skeleton } from "../components/ui/skeleton";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
export const workspaceSections = [
  "dashboard",
  "people",
  "activities",
  "schedule",
  "insights",
  "follow-up",
  "learning",
  "exports",
  "custom-fields",
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
      <Link
        to="/workspace/$organizationId/$section"
        params={{ organizationId, section: "dashboard" }}
        aria-label={m.dashboard_title()}
        aria-current={
          section === "dashboard" ||
          section === "insights" ||
          section === "follow-up" ||
          section === "learning"
            ? "page"
            : undefined
        }
      >
        <House aria-hidden="true" size={20} />
        <span className="navigation-full-label">{m.dashboard_title()}</span>
        <span className="navigation-short-label" aria-hidden="true">
          {m.interface_home_short()}
        </span>
      </Link>
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
        aria-label={m.activities_title()}
        aria-current={
          section === "activities" || section === "schedule"
            ? "page"
            : undefined
        }
      >
        <CalendarDays aria-hidden="true" size={20} />
        <span className="navigation-full-label">{m.activities_title()}</span>
        <span className="navigation-short-label" aria-hidden="true">
          {m.interface_agenda()}
        </span>
      </Link>
      {admin && (
        <Link
          to="/workspace/$organizationId/$section"
          params={{ organizationId, section: "manage" }}
          aria-current={
            [
              "exports",
              "custom-fields",
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
