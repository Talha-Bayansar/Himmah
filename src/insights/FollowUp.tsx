import { useEffect, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  UserRoundSearch,
} from "lucide-react";
import {
  DirectoryHeader,
  DirectoryToolbar,
  DirectoryList,
  DirectoryItem,
  DirectoryRecord,
} from "../components/shared/directory-layout";
import {
  ListSkeleton,
  InfiniteFooter,
} from "../components/shared/infinite-list";
import { Button } from "../components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { Label } from "../components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { directoryRequest, DirectoryError } from "../community/client";
import { ErrorNotice } from "../activities/Activities";
import type { Organization } from "../organization/contracts";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import {
  followUpPeriods,
  type FollowUpFilters,
  type FollowUpReport,
} from "./follow-up";
export default function FollowUp({
  organization,
  userId,
}: {
  organization: Organization;
  userId: string;
}) {
  const raw = useRouterState({
    select: (s) =>
      s.location.search as Partial<FollowUpFilters> & { q?: string },
  });
  const days = (followUpPeriods as readonly number[]).includes(Number(raw.days))
      ? Number(raw.days)
      : 30,
    view = raw.view === "never" ? "never" : "recent",
    q = raw.q ?? "";
  const navigate = useNavigate(),
    cache = useQueryClient(),
    locale = useLocale()?.locale ?? "en";
  const [accessError, setAccessError] = useState<unknown>(null),
    allowed = ["owner", "admin"].includes(organization.role);
  const prefix = ["organization", userId, organization.id, "follow-up"];
  const query = useInfiniteQuery({
    queryKey: [...prefix, organization.role, days, view, q.trim()],
    enabled: allowed && !accessError,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      directoryRequest<FollowUpReport>(
        `/api/organizations/${organization.id}/insights/follow-up?${new URLSearchParams({ days: String(days), view, q: q.trim(), ...(pageParam ? { cursor: pageParam } : {}) })}`,
        { signal },
      ),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  });
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
    const key = ["organization", userId, organization.id];
    const filter = {
      queryKey: key,
      predicate: (q: { queryKey: readonly unknown[] }) =>
        q.queryKey.length > key.length,
    };
    void cache.cancelQueries(filter);
    cache.removeQueries(filter);
  }, [denied, cache, userId, organization.id]);
  if (!allowed) return <p role="alert">{m.people_denied()}</p>;
  if (accessError || denied)
    return (
      <ErrorNotice
        error={accessError || denied}
        retry={() => setAccessError(null)}
      />
    );
  const data = query.data?.pages[0],
    seen = new Set<string>(),
    items = (query.data?.pages.flatMap((p) => p.items) ?? []).filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  const apply = (next: Partial<FollowUpFilters> & { q?: string }) =>
    void navigate({
      to: "/workspace/$organizationId/follow-up",
      params: { organizationId: organization.id },
      search: { days, view, q, ...next },
      replace: true,
    });
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: data?.timezone ?? organization.timezone,
    }).format(new Date(value));
  return (
    <section className="directory follow-up-page">
      <Button variant="link" className="settings-back" asChild>
        <Link
          to="/workspace/$organizationId/$section"
          params={{ organizationId: organization.id, section: "dashboard" }}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {m.dashboard_title()}
        </Link>
      </Button>
      <DirectoryHeader
        title={m.follow_up_title()}
        description={m.follow_up_intro()}
        autoFocus={false}
        action={
          <Button
            variant="outline"
            size="icon"
            aria-label={m.follow_up_refresh()}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={18} aria-hidden="true" />
          </Button>
        }
      />
      <DirectoryToolbar
        id="follow-up-search"
        label={m.directory_search()}
        value={q}
        onChange={(q) => apply({ q })}
      >
        {view === "recent" && (
          <div>
            <Label htmlFor="follow-up-days">{m.follow_up_period()}</Label>
            <NativeSelect
              id="follow-up-days"
              value={String(days)}
              onChange={(e) => apply({ days: Number(e.target.value) })}
            >
              {followUpPeriods.map((days) => (
                <NativeSelectOption key={days} value={String(days)}>
                  {m.follow_up_days({ days: String(days) })}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}
      </DirectoryToolbar>
      <Tabs
        value={view}
        onValueChange={(v) => apply({ view: v as FollowUpFilters["view"] })}
      >
        <TabsList aria-label={m.follow_up_title()} className="follow-up-tabs">
          <TabsTrigger value="recent">
            {m.follow_up_recent()}
            {data ? ` (${data.summary.recent})` : ""}
          </TabsTrigger>
          <TabsTrigger value="never">
            {m.follow_up_never()}
            {data ? ` (${data.summary.never})` : ""}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {data && (
        <p className="activity-note follow-up-context">
          {view === "recent"
            ? m.follow_up_since({
                date: new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeZone: "UTC",
                }).format(new Date(data.since + "T12:00:00Z")),
              })
            : m.follow_up_never_help()}
        </p>
      )}
      {query.isError && !query.isFetchNextPageError && (
        <ErrorNotice
          error={query.error}
          retry={() => void query.refetch()}
          pending={query.isFetching}
        />
      )}
      {query.isPending ? (
        <ListSkeleton />
      ) : items.length ? (
        <>
          <DirectoryList
            label={
              view === "recent" ? m.follow_up_recent() : m.follow_up_never()
            }
          >
            {items.map((item) => (
              <DirectoryItem linked key={item.id}>
                <Link
                  className="directory-item-link"
                  to="/workspace/$organizationId/people/contacts/$contactId"
                  params={{
                    organizationId: organization.id,
                    contactId: item.id,
                  }}
                >
                  <DirectoryRecord
                    name={item.name}
                    icon={<UserRoundSearch size={20} aria-hidden="true" />}
                    detail={
                      <>
                        {item.lastVisit ? (
                          <>
                            <span>
                              {m.follow_up_last({ date: date(item.lastVisit) })}
                            </span>
                            <span>
                              {item.lastTopic
                                ? `${item.lastActivity} · ${item.lastTopic}`
                                : item.lastActivity}
                            </span>
                          </>
                        ) : (
                          <>
                            <span>{m.follow_up_no_record()}</span>
                            <span>
                              {m.follow_up_added({
                                date: date(item.createdAt),
                              })}
                            </span>
                          </>
                        )}
                      </>
                    }
                  />
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </DirectoryItem>
            ))}
          </DirectoryList>
          <InfiniteFooter {...query} />
        </>
      ) : (
        !query.isError && (
          <p className="directory-empty">
            {q.trim() ? m.directory_no_matches() : m.follow_up_empty()}
          </p>
        )
      )}
      <details className="session-help">
        <summary>{m.follow_up_about()}</summary>
        <p>{m.follow_up_definition()}</p>
      </details>
      {data && (
        <p className="activity-note dashboard-freshness">
          {m.insights_generated({
            time: new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: data.timezone,
            }).format(new Date(data.generatedAt)),
          })}{" "}
          · {data.timezone}
        </p>
      )}
    </section>
  );
}
