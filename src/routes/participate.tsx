import { useEffect, useState } from "react";
import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
import { AccountSkeleton } from "../components/shared/page-skeleton";
import { Button } from "../components/ui/button";
import { m } from "../paraglide/messages.js";
import { useLocale } from "../localization/locale";
export const Route = createFileRoute("/participate")({
  component: Participate,
});
function Participate() {
  useLocale();
  const hash = useLocation({ select: (location) => location.hash }),
    [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    setToken(window.location.hash.slice(1));
  }, [hash]);
  if (token === null)
    return (
      <div className="p-8">
        <AccountSkeleton />
      </div>
    );
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    return (
      <div className="empty-state">
        <h1>{m.directory_invalid_invitation()}</h1>
        <Button asChild>
          <Link to="/start">{m.back_signin()}</Link>
        </Button>
      </div>
    );
  return (
    <OrganizationPortal initialMode="signin" participantInviteToken={token} />
  );
}
