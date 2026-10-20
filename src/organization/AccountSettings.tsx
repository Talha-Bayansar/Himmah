import { PushSettings } from "../notifications/PushSettings";
import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, LogOut, Building2 } from "lucide-react";
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
  user: { id: string; name: string; email: string; emailVerified: boolean };
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
      <header className="profile-heading">
        <h1 ref={heading} tabIndex={-1} data-page-heading>
          {m.profile()}
        </h1>
        <p>{m.profile_intro()}</p>
      </header>
      <section className="settings-panel" aria-label={m.profile()}>
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
      {user.emailVerified && <PushSettings key={user.id} userId={user.id} />}
      {organization && !["owner", "admin"].includes(organization.role) && (
        <Button variant="outline" asChild>
          <Link
            to="/workspace/$organizationId/$section"
            params={{
              organizationId: organization.id,
              section: "organization",
            }}
          >
            <Building2 aria-hidden="true" />
            <span>{m.organization_details()}</span>
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      )}
      {!organization && (
        <Button variant="outline" asChild>
          <Link to="/start">{m.my_organizations()}</Link>
        </Button>
      )}
    </div>
  );
}
