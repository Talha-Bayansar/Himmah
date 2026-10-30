import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { DirectoryError, useDirectoryPages } from "../community/client";
import { ErrorNotice } from "../activities/Activities";
import {
  DirectoryHeader,
  DirectoryToolbar,
} from "../components/shared/directory-layout";
import {
  ListSkeleton,
  InfiniteFooter,
} from "../components/shared/infinite-list";
import { Button } from "../components/ui/button";
import type { Organization } from "../organization/contracts";
import type { DashboardSession } from "./contracts";
import { SessionList } from "./SessionList";
import { m } from "../paraglide/messages.js";
export default function PlannedSessions({
  organization,
  userId,
}: {
  organization: Organization;
  userId: string;
}) {
  const navigate = useNavigate(),
    cache = useQueryClient();
  const raw = useRouterState({
    select: (s) => (s.location.search as { q?: string }).q ?? "",
  });
  const search = raw.trim(),
    prefix = ["organization", userId, organization.id, "planned-sessions"];
  const [accessError, setAccessError] = useState<unknown>(null);
  const query = useDirectoryPages<DashboardSession>(
    [...prefix, search],
    `/api/organizations/${organization.id}/sessions?q=${encodeURIComponent(search)}`,
    { enabled: !accessError, staleTime: 0, refetchOnMount: "always" },
  );
  const denied =
    query.error instanceof DirectoryError &&
    ["forbidden", "not_found", "verify_required", "sign_in"].includes(
      query.error.code,
    )
      ? query.error
      : null;
  useEffect(() => {
    if (!denied) return;
    setAccessError(denied);
    const privateKey = ["organization", userId, organization.id];
    void cache.cancelQueries({ queryKey: privateKey });
    cache.removeQueries({ queryKey: privateKey });
  }, [denied, cache, userId, organization.id]);
  if (accessError || denied)
    return (
      <ErrorNotice
        error={accessError || denied}
        retry={() => setAccessError(null)}
      />
    );
  // Sessions can be rescheduled while more pages load. Keep the first visible snapshot once.
  const seen = new Set<string>();
  const items = (query.data?.pages.flatMap((p) => p.items) ?? []).filter(
    (item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    },
  );
  return (
    <section
      className="directory planned-sessions"
      aria-label={m.schedule_title()}
    >
      <Button variant="link" className="settings-back" asChild>
        <Link
          to="/workspace/$organizationId/$section"
          params={{ organizationId: organization.id, section: "dashboard" }}
        >
          <ArrowLeft aria-hidden="true" size={16} />
          {m.dashboard_title()}
        </Link>
      </Button>
      <DirectoryHeader
        title={m.schedule_title()}
        description={m.schedule_description()}
        autoFocus={false}
        action={
          <Button
            variant="outline"
            size="icon"
            aria-label={m.schedule_refresh()}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={18} aria-hidden="true" />
          </Button>
        }
      />
      <DirectoryToolbar
        id="planned-session-search"
        label={m.schedule_search()}
        value={raw}
        onChange={(q) =>
          void navigate({
            to: "/workspace/$organizationId/schedule",
            params: { organizationId: organization.id },
            search: { q },
            replace: true,
          })
        }
      />
      {query.isError && !query.isFetchNextPageError && (
        <ErrorNotice
          error={query.error}
          pending={query.isFetching}
          retry={() => void query.refetch()}
        />
      )}
      {query.isPending ? (
        <ListSkeleton />
      ) : (
        <>
          {items.length ? (
            <SessionList
              items={items}
              organizationId={organization.id}
              label={m.schedule_title()}
            />
          ) : (
            !query.isError && (
              <p className="directory-empty">
                {search ? m.directory_no_matches() : m.dashboard_no_sessions()}
              </p>
            )
          )}
          {query.data && !!items.length && <InfiniteFooter {...query} />}
        </>
      )}
    </section>
  );
}
