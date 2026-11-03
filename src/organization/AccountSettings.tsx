import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Building2, LogOut } from "lucide-react";
import { ActionButton } from "../components/shared/action-button";
import { DirectoryHeader } from "../components/shared/directory-layout";
import { LanguageSelector, useLocale } from "../localization/locale";
import { PushSettings } from "../notifications/PushSettings";
import { m } from "../paraglide/messages.js";
import { InstallApp } from "../pwa/install";
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
  return (
    <div className="settings-page preferences-page">
      <DirectoryHeader
        title={m.profile()}
        description={m.profile_intro()}
        autoFocus={false}
      />
      <section
        className="settings-identity preferences-identity"
        aria-labelledby="preferences-account-name"
      >
        <span className="avatar" aria-hidden="true">
          {[...user.name.trim()][0]}
        </span>
        <div>
          <h2 id="preferences-account-name">{user.name}</h2>
          <p>{user.email}</p>
          <small className="preferences-verification">
            {user.emailVerified && <BadgeCheck aria-hidden="true" />}
            {user.emailVerified ? m.verified() : m.verify_email()}
          </small>
        </div>
      </section>
      <section
        className="preferences-section"
        aria-labelledby="preferences-app-heading"
      >
        <h2 id="preferences-app-heading">{m.preferences_app()}</h2>
        <div className="preferences-language">
          <span>{m.language()}</span>
          <LanguageSelector />
        </div>
        <div className="preferences-tools">
          <InstallApp />
        </div>
      </section>
      {user.emailVerified && <PushSettings key={user.id} userId={user.id} />}
      <section
        className="preferences-section preferences-account-actions"
        aria-label={m.profile()}
      >
        {organization && !["owner", "admin"].includes(organization.role) && (
          <Link
            className="preferences-link"
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
        )}
        {!organization && (
          <Link className="preferences-link" to="/start">
            <Building2 aria-hidden="true" />
            <span>{m.my_organizations()}</span>
            <ArrowRight aria-hidden="true" />
          </Link>
        )}
        <ActionButton variant="outline" pending={pending} onClick={onSignOut}>
          <LogOut size={18} aria-hidden="true" />
          {m.sign_out()}
        </ActionButton>
      </section>
    </div>
  );
}
