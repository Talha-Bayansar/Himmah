import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, LogOut } from "lucide-react";
import { Button } from "../components/ui/button";
import { ActionButton } from "../components/shared/action-button";
import { LanguageSelector, useLocale } from "../localization/locale";
import { InstallApp } from "../pwa/install";
import { m } from "../paraglide/messages.js";
import type { Organization } from "./contracts";

export function AccountSettings({
  user,
  organization,
  pending,
  onSignOut,
}: {
  user: { name: string; email: string; emailVerified: boolean };
  organization?: Organization;
  pending: boolean;
  onSignOut: () => void;
}) {
  useLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="settings-page">
      <h1 ref={heading} tabIndex={-1} data-page-heading>
        {m.settings()}
      </h1>
      <section className="settings-panel" aria-labelledby="profile-heading">
        <h2 id="profile-heading">{m.profile()}</h2>
        <div className="settings-identity">
          <span className="avatar" aria-hidden="true">
            {user.name.slice(0, 1)}
          </span>
          <div>
            <strong>{user.name}</strong>
            <p>{user.email}</p>
            <small>
              {user.emailVerified ? m.verified() : m.verify_email()}
            </small>
          </div>
        </div>
        <div className="settings-language">
          <span>{m.language()}</span>
          <LanguageSelector />
        </div>
        <InstallApp />
        <ActionButton variant="outline" pending={pending} onClick={onSignOut}>
          <LogOut size={18} />
          {m.sign_out()}
        </ActionButton>
      </section>
      {organization && (
        <section
          className="settings-panel"
          aria-labelledby="organization-settings-heading"
        >
          <h2 id="organization-settings-heading">{m.organization_details()}</h2>
          <dl className="settings-details">
            <div>
              <dt>{m.organization_name()}</dt>
              <dd>{organization.name}</dd>
            </div>
            <div>
              <dt>{m.workspace_address()}</dt>
              <dd>{organization.slug}</dd>
            </div>
            <div>
              <dt>{m.timezone()}</dt>
              <dd>{organization.timezone}</dd>
            </div>
            <div>
              <dt>{m.your_role()}</dt>
              <dd>{m[`role_${organization.role}`]()}</dd>
            </div>
          </dl>
          {organization.role !== "volunteer" && (
            <div className="settings-links">
              {(["periods", "staff", "invitations"] as const).map((section) => (
                <Button key={section} variant="outline" asChild>
                  <Link
                    to="/workspace/$organizationId/$section"
                    params={{ organizationId: organization.id, section }}
                  >
                    <span>
                      {section === "periods"
                        ? m.periods_title()
                        : section === "staff"
                          ? m.directory_staff()
                          : m.directory_invitations()}
                    </span>
                    <ArrowRight size={18} />
                  </Link>
                </Button>
              ))}
            </div>
          )}
        </section>
      )}
      {!organization && (
        <Button variant="outline" asChild>
          <Link to="/start">{m.my_organizations()}</Link>
        </Button>
      )}
    </div>
  );
}
