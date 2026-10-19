import { RouteTabs } from "../components/shared/route-tabs";
import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronRight,
  ChartNoAxesCombined,
  ShieldCheck,
  UserRoundPlus,
  UsersRound,
  Building2,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import type { Organization } from "./contracts";

export function Management({ organization }: { organization: Organization }) {
  useLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  const groups = [
    {
      title: m.manage_engagement(),
      items: [
        {
          section: "periods",
          title: m.periods_title(),
          description: m.manage_periods_help(),
          Icon: ChartNoAxesCombined,
        },
      ],
    },
    {
      title: m.manage_team(),
      items: [
        {
          section: "staff",
          title: m.directory_staff(),
          description: m.manage_staff_help(),
          Icon: UsersRound,
        },
        {
          section: "invitations",
          title: m.directory_invitations(),
          description: m.manage_invites_help(),
          Icon: UserRoundPlus,
        },
        {
          section: "access",
          title: m.access_title(),
          description: m.manage_access_help(),
          Icon: ShieldCheck,
        },
      ],
    },
    {
      title: m.manage_organization(),
      items: [
        {
          section: "organization",
          title: m.organization_details(),
          description: m.manage_organization_help(),
          Icon: Building2,
        },
      ],
    },
  ];
  return (
    <section className="directory management-page">
      <div className="directory-heading">
        <div>
          <h1 ref={heading} tabIndex={-1} data-page-heading>
            {m.manage_title()}
          </h1>
          <p>{m.manage_intro()}</p>
        </div>
      </div>
      {groups.map((group) => (
        <section key={group.title} className="management-section">
          <h2>{group.title}</h2>
          <ul className="management-links">
            {group.items.map(({ section, title, description, Icon }) => (
              <li key={section}>
                <Link
                  to="/workspace/$organizationId/$section"
                  params={{ organizationId: organization.id, section }}
                >
                  <span className="management-icon">
                    <Icon aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{title}</strong>
                    <span>{description}</span>
                  </span>
                  <ChevronRight aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
export function OrganizationDetails({
  organization,
}: {
  organization: Organization;
}) {
  useLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  const admin = ["owner", "admin"].includes(organization.role);
  return (
    <section className="directory">
      <Button variant="link" className="settings-back" asChild>
        <Link
          to="/workspace/$organizationId/$section"
          params={{
            organizationId: organization.id,
            section: admin ? "manage" : "settings",
          }}
        >
          <ArrowLeft aria-hidden="true" />
          {admin ? m.back_to_manage() : m.back_to_profile()}
        </Link>
      </Button>
      <div className="directory-heading">
        <h1 ref={heading} tabIndex={-1} data-page-heading>
          {m.organization_details()}
        </h1>
      </div>
      <section className="settings-panel">
        <h2>{organization.name}</h2>
        <dl className="settings-details">
          {[
            [m.workspace_address(), organization.slug],
            [m.timezone(), organization.timezone],
            [m.your_role(), m[`role_${organization.role}`]()],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </section>
  );
}
export function PeopleTabs({
  organizationId,
  section,
}: {
  organizationId: string;
  section: "members" | "groups";
}) {
  useLocale();
  return (
    <RouteTabs aria-label={m.nav_people()}>
      {(["members", "groups"] as const).map((tab) => (
        <Link
          key={tab}
          to="/workspace/$organizationId/$section"
          params={{ organizationId, section: tab }}
          aria-current={section === tab ? "page" : undefined}
        >
          {tab === "members" ? m.directory_members() : m.directory_groups()}
        </Link>
      ))}
    </RouteTabs>
  );
}
