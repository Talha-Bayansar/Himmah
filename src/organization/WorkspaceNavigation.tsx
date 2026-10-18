import { Link } from "@tanstack/react-router";
import { Users, Folder, Settings } from "lucide-react";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";

export const workspaceSections = [
  "members",
  "groups",
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
    members: m.directory_members(),
    groups: m.directory_groups(),
    settings: m.settings(),
  };
  const icons = { members: Users, groups: Folder, settings: Settings };
  const active =
    section === "members" || section === "groups" ? section : "settings";
  return (
    <nav className="workspace-navigation" aria-label={m.directory_title()}>
      {(["members", "groups", "settings"] as const)
        .filter((key) => key === "settings" || role !== "volunteer")
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
