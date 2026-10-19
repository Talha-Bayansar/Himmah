import { Skeleton } from "../components/ui/skeleton";
import { Link } from "@tanstack/react-router";
import {
  Users,
  Folder,
  Settings,
  CalendarDays,
  Gift,
  Ticket,
  TrendingUp,
} from "lucide-react";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";

export const workspaceSections = [
  "me",
  "my-rewards",
  "my-redemptions",
  "activities",
  "members",
  "groups",
  "rewards",
  "access",
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
  if (!role)
    return (
      <nav className="workspace-navigation" aria-label={m.directory_loading()}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="flex min-w-0 flex-1 justify-center p-2">
            <Skeleton className="h-10 w-full max-w-14" />
          </span>
        ))}
      </nav>
    );
  if (role === "participant")
    return (
      <nav
        className="workspace-navigation participant-navigation"
        aria-label={m.participant_account()}
      >
        {(
          [
            {
              section: "me",
              label: m.participant_nav_progress(),
              Icon: TrendingUp,
            },
            {
              section: "my-rewards",
              label: m.participant_nav_rewards(),
              Icon: Gift,
            },
            {
              section: "my-redemptions",
              label: m.participant_nav_history(),
              Icon: Ticket,
            },
            { section: "settings", label: m.settings(), Icon: Settings },
          ] as const
        ).map((item) => (
          <Link
            key={item.section}
            to="/workspace/$organizationId/$section"
            params={{ organizationId, section: item.section }}
            aria-current={section === item.section ? "page" : undefined}
          >
            <item.Icon size={20} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    );

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
            key === "settings" ||
            key === "activities" ||
            key === "members" ||
            role !== "volunteer",
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
