import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Building2, Users, Folder, ShieldCheck, Mail } from "lucide-react";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import type { Organization } from "./contracts";

export const workspaceSections = [
  "overview",
  "members",
  "groups",
  "staff",
  "invitations",
] as const;
export type WorkspaceSection = (typeof workspaceSections)[number];
export function WorkspaceNavigation({
  organization,
  section,
}: {
  organization: Organization;
  section: WorkspaceSection;
}) {
  useLocale();
  const nav = useRef<HTMLElement>(null);
  const labels = {
    overview: m.workspace(),
    members: m.directory_members(),
    groups: m.directory_groups(),
    staff: m.directory_staff(),
    invitations: m.directory_invitations(),
  };
  const icons = {
    overview: Building2,
    members: Users,
    groups: Folder,
    staff: ShieldCheck,
    invitations: Mail,
  };
  useEffect(() => {
    // Announce each new page without opening the keyboard or moving focus into a form.
    const heading = nav.current?.parentElement?.querySelector<HTMLElement>(
      "[data-page-heading]",
    );
    heading?.focus({ preventScroll: true });
    nav.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [section, organization.id]);
  return (
    <nav
      ref={nav}
      className="workspace-navigation"
      aria-label={m.directory_title()}
    >
      {workspaceSections
        .filter(
          (key) => key === "overview" || organization.role !== "volunteer",
        )
        .map((key) => {
          const Icon = icons[key];
          return (
            <Link
              key={key}
              to="/workspace/$organizationId/$section"
              params={{ organizationId: organization.id, section: key }}
              aria-current={section === key ? "page" : undefined}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{labels[key]}</span>
            </Link>
          );
        })}
    </nav>
  );
}
