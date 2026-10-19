import { Link } from "@tanstack/react-router";
import { Users, Folder, Settings, CalendarDays } from "lucide-react";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";

export const workspaceSections = [
  "activities",
  "members",
  "groups",
  "periods",
  "staff",
  "invitations",
  "settings",
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
  const labels = {
    activities: m.activities_title(),
    members: m.directory_members(),
    groups: m.directory_groups(),
    settings: m.settings(),
  };
  const icons = {
    activities: CalendarDays,
    members: Users,
    groups: Folder,
    settings: Settings,
  };
  const active =
    section === "activities" || section === "members" || section === "groups"
      ? section
      : "settings";
  return (
    <nav className="workspace-navigation" aria-label={m.directory_title()}>
      {(["activities", "members", "groups", "settings"] as const)
        .filter(
          (key) =>
            key === "settings" || key === "activities" || role !== "volunteer",
        )
        .map((key) => {
          const Icon = icons[key];
          return (
            <Link
              key={key}
              to="/workspace/$organizationId/$section"
              params={{ organizationId, section: key }}
              aria-current={active === key ? "page" : undefined}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{labels[key]}</span>
            </Link>
          );
        })}
    </nav>
  );
}
