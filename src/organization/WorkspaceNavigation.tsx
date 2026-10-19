import { Skeleton } from "../components/ui/skeleton";
import { Link } from "@tanstack/react-router";
import {
  Flag,
  Users,
  SlidersHorizontal,
  CircleUserRound,
  CalendarDays,
  Gift,
  Ticket,
  TrendingUp,
} from "lucide-react";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";

export const workspaceSections = [
  "challenges",
  "collect",
  "my-coupons",
  "manage",
  "organization",
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
              section: "challenges",
              label: m.challenge_nav(),
              Icon: Flag,
            },
            {
              section: "my-rewards",
              label: m.participant_nav_rewards(),
              Icon: Gift,
            },
            {
              section: "my-coupons",
              label: m.coupons_nav(),
              Icon: Ticket,
            },
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

  const admin = role === "owner" || role === "admin";
  const items = [
    { section: "activities", label: m.nav_agenda(), Icon: CalendarDays },
    { section: "members", label: m.nav_people(), Icon: Users },
    ...(admin
      ? [
          {
            section: "rewards",
            label: m.participant_nav_rewards(),
            Icon: Gift,
          },
          {
            section: "manage",
            label: m.manage_title(),
            Icon: SlidersHorizontal,
          },
        ]
      : []),
  ];
  const active =
    section === "members" || section === "groups"
      ? "members"
      : section === "collect"
        ? "rewards"
        : section === "challenges"
          ? "activities"
          : section === "activities" || section === "rewards"
            ? section
            : [
                  "manage",
                  "organization",
                  "access",
                  "periods",
                  "staff",
                  "invitations",
                ].includes(section)
              ? "manage"
              : null;
  return (
    <nav className="workspace-navigation" aria-label={m.directory_title()}>
      {items.map(({ section: target, label, Icon }) => (
        <Link
          key={target}
          to="/workspace/$organizationId/$section"
          params={{ organizationId, section: target }}
          aria-current={active === target ? "page" : undefined}
        >
          <Icon size={20} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
