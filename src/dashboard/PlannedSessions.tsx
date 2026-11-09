import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import { UtilityButton } from "../components/shared/utility-button";
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
  const filters = useRouterState({
    select: (s) =>
      s.location.search as { q?: string; view?: "past" | "upcoming" },
  });
  const raw = filters.q ?? "",
    view = filters.view === "past" ? "past" : "upcoming";
  const search = raw.trim(),
    prefix = ["organization", userId, organization.id, "planned-sessions"];
  const [accessError, setAccessError] = useState<unknown>(null);
  const query = useDirectoryPages<DashboardSession>(
    [...prefix, view, search],
    `/api/organizations/${organization.id}/sessions?view=${view}&q=${encodeURIComponent(search)}`,
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
        description={
          view === "past" ? m.schedule_recent_help() : m.schedule_description()
        }
        autoFocus={false}
        action={
          <UtilityButton
            aria-label={m.schedule_refresh()}
            pending={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={18} aria-hidden="true" />
          </UtilityButton>
        }
      />
      <Tabs
        value={view}
        onValueChange={(view) =>
          void navigate({
            to: "/workspace/$organizationId/schedule",
            params: { organizationId: organization.id },
            search: { q: raw, view: view as "upcoming" | "past" },
            replace: true,
          })
        }
      >
        <TabsList aria-label={m.schedule_title()}>
          <TabsTrigger value="upcoming">{m.sessions_upcoming()}</TabsTrigger>
          <TabsTrigger value="past">{m.schedule_recent()}</TabsTrigger>
        </TabsList>
        <TabsContent value={view} className="planned-session-content">
          <DirectoryToolbar
            id="planned-session-search"
            label={m.schedule_search()}
            value={raw}
            onChange={(q) =>
              void navigate({
                to: "/workspace/$organizationId/schedule",
                params: { organizationId: organization.id },
                search: { q, view },
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
                  management={view === "past"}
                />
              ) : (
                !query.isError && (
                  <p className="directory-empty">
                    {search
                      ? m.directory_no_matches()
                      : view === "past"
                        ? m.schedule_no_recent()
                        : m.dashboard_no_sessions()}
                  </p>
                )
              )}
              {query.data && !!items.length && <InfiniteFooter {...query} />}
            </>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
