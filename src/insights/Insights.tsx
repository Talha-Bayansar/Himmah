import { Statistic } from "./Statistic";
import { perSession, share } from "./statistics";
import {
  Users,
  UserPlus,
  Repeat2,
  CalendarCheck,
  ChartNoAxesColumn,
  Wallet,
  Coins,
  CirclePercent,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState, Link } from "@tanstack/react-router";
import { ArrowRight, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import { directoryRequest, DirectoryError } from "../community/client";
import { ErrorNotice } from "../activities/Activities";
import {
  DirectoryHeader,
  DirectoryList,
  DirectoryItem,
  DirectoryRecord,
} from "../components/shared/directory-layout";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { FormSurface } from "../components/shared/form-surface";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { useLocale } from "../localization/locale";
import { sessionPrice } from "../activities/contracts";
import type { Organization } from "../organization/contracts";
import { useSearch } from "../modules/people/shared";
import { m } from "../paraglide/messages.js";
import {
  insightsFilters,
  type InsightsFilters,
  type InsightsReport,
  type InsightsOption,
} from "./contracts";

function OptionPicker({
  kind,
  org,
  user,
  onSelect,
  onClose,
}: {
  kind: "activities" | "groups";
  org: string;
  user: string;
  onSelect: (id: string, name: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const search = useSearch(q);
  const query = useInfiniteQuery({
    queryKey: ["organization", user, org, "insights-options", kind, search],
    initialPageParam: null as string | null,
    retry: false,
    queryFn: ({ pageParam, signal }) =>
      directoryRequest<{ items: InsightsOption[]; nextCursor: string | null }>(
        `/api/organizations/${org}/insights/options?kind=${kind}&q=${encodeURIComponent(search)}` +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  });
  return (
    <FormSurface
      title={kind === "activities" ? m.insights_activity() : m.insights_group()}
      description={m.insights_choose()}
      onClose={onClose}
    >
      <Label className="sr-only" htmlFor="insights-option-search">
        {m.directory_search()}
      </Label>
      <Input
        id="insights-option-search"
        type="search"
        maxLength={80}
        value={q}
        placeholder={m.directory_search()}
        onChange={(e) => setQ(e.target.value)}
      />
      <Button variant="ghost" onClick={() => onSelect("", "")}>
        {m.insights_all()}
      </Button>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError &&
        (!query.data ||
          (query.error instanceof DirectoryError &&
            ["forbidden", "not_found", "sign_in"].includes(
              query.error.code,
            ))) ? (
        <ErrorNotice
          error={query.error}
          pending={query.isFetching}
          retry={() => void query.refetch()}
        />
      ) : (
        <>
          <div className="insights-options">
            {query.data?.pages
              .flatMap((p) => p.items)
              .map((item) => (
                <Button
                  key={item.id}
                  variant="ghost"
                  onClick={() => onSelect(item.id, item.name)}
                >
                  {item.name}
                  {item.archived && (
                    <span className="activity-note">
                      {m.insights_archived()}
                    </span>
                  )}
                </Button>
              ))}
          </div>
          {!query.data?.pages.some((p) => p.items.length) && (
            <p className="directory-empty">{m.attendance_empty()}</p>
          )}
          <InfiniteFooter {...query} />
        </>
      )}
      <Button variant="outline" onClick={onClose}>
        {m.done()}
      </Button>
    </FormSurface>
  );
}
export default function Insights({
  organization,
  userId,
}: {
  organization: Organization;
  userId: string;
}) {
  const cache = useQueryClient();
  const [accessError, setAccessError] = useState<unknown>(null);
  const navigate = useNavigate(),
    locale = useLocale()?.locale ?? "en";
  const raw = useRouterState({
    select: (s) => s.location.search as Partial<InsightsFilters>,
  });
  let initial: InsightsFilters;
  try {
    initial = insightsFilters(raw, organization.timezone);
  } catch {
    initial = insightsFilters({}, organization.timezone);
  }
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState(initial),
    [invalid, setInvalid] = useState(false),
    [picker, setPicker] = useState<"activities" | "groups" | null>(null),
    [names, setNames] = useState({ activity: "", group: "" });
  const signature = JSON.stringify(raw);
  useEffect(() => {
    try {
      setDraft(insightsFilters(raw, organization.timezone));
      setInvalid(false);
    } catch {
      setInvalid(true);
    }
  }, [signature, organization.timezone]);
  const filterKey = [
    raw.from ?? "",
    raw.to ?? "",
    raw.activity ?? "",
    raw.group ?? "",
    raw.bucket ?? "week",
  ];
  const params = new URLSearchParams(
    Object.entries(raw).filter(([, v]) => typeof v === "string" && v) as [
      string,
      string,
    ][],
  );
  const report = useInfiniteQuery({
    queryKey: [
      "organization",
      userId,
      organization.id,
      "insights",
      ...filterKey,
    ],
    initialPageParam: null as string | null,
    retry: false,
    enabled: ["owner", "admin"].includes(organization.role) && !accessError,
    queryFn: ({ pageParam, signal }) =>
      directoryRequest<InsightsReport>(
        `/api/organizations/${organization.id}/insights?${params}` +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  });
  const data = report.data?.pages[0],
    denied =
      report.error instanceof DirectoryError &&
      ["forbidden", "not_found", "sign_in", "verify_required"].includes(
        report.error.code,
      );
  useEffect(() => {
    if (!denied) return;
    setAccessError(report.error);
    setPicker(null);
    setNames({ activity: "", group: "" });
    for (const key of ["insights", "insights-options"]) {
      const queryKey = ["organization", userId, organization.id, key];
      void cache.cancelQueries({ queryKey });
      cache.removeQueries({ queryKey });
    }
  }, [denied, report.error, cache, userId, organization.id]);
  const date = (v: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(v + "T12:00:00Z"));
  const money = (v: number) => sessionPrice(v, locale);
  const apply = (reset = false) => {
    try {
      const next = insightsFilters(reset ? {} : draft, organization.timezone);
      setInvalid(false);
      setFiltersOpen(false);
      void navigate({
        to: "/workspace/$organizationId/insights",
        params: { organizationId: organization.id },
        search: next,
      });
      if (reset) setNames({ activity: "", group: "" });
    } catch {
      setInvalid(true);
    }
  };
  if (!["owner", "admin"].includes(organization.role))
    return <p role="alert">{m.people_denied()}</p>;
  if (accessError)
    return (
      <ErrorNotice
        error={accessError}
        pending={false}
        retry={() => setAccessError(null)}
      />
    );
  return (
    <section className="directory insights-page">
      <DirectoryHeader
        title={m.insights_title()}
        description={m.insights_intro()}
        autoFocus={false}
        action={
          <Button
            variant="outline"
            size="icon"
            disabled={report.isFetching}
            aria-label={m.insights_refresh()}
            onClick={() => void report.refetch()}
          >
            <RefreshCw
              aria-hidden="true"
              className={report.isFetching ? "animate-spin" : ""}
            />
          </Button>
        }
      />
      <details
        className="session-help insights-filter-panel"
        open={filtersOpen || invalid}
        onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
      >
        <summary>{m.insights_filters()}</summary>
        <form
          className="insights-filters"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <div>
            <Label htmlFor="insights-from">{m.insights_from()}</Label>
            <Input
              id="insights-from"
              type="date"
              required
              min="2000-01-01"
              max="2099-12-31"
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="insights-to">{m.insights_to()}</Label>
            <Input
              id="insights-to"
              type="date"
              required
              min="2000-01-01"
              max="2099-12-31"
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="insights-period">{m.insights_period()}</Label>
            <NativeSelect
              id="insights-period"
              value={draft.bucket}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  bucket: e.target.value as "week" | "month",
                })
              }
            >
              <NativeSelectOption value="week">
                {m.insights_weekly()}
              </NativeSelectOption>
              <NativeSelectOption value="month">
                {m.insights_monthly()}
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <div>
            <Label>{m.insights_activity()}</Label>
            <Button
              type="button"
              variant="outline"
              aria-label={m.insights_activity()}
              onClick={() => setPicker("activities")}
            >
              {draft.activity
                ? (data?.filters.activity === draft.activity
                    ? data.activityName
                    : names.activity) || m.insights_selected_activity()
                : m.insights_all()}
            </Button>
          </div>
          <div>
            <Label>{m.insights_group()}</Label>
            <Button
              type="button"
              variant="outline"
              aria-label={m.insights_group()}
              onClick={() => setPicker("groups")}
            >
              {draft.group
                ? (data?.filters.group === draft.group
                    ? data.groupName
                    : names.group) || m.insights_selected_group()
                : m.insights_all()}
            </Button>
          </div>
          <div className="insights-filter-actions">
            <Button type="submit">
              <SlidersHorizontal aria-hidden="true" />
              {m.insights_apply()}
            </Button>
            <Button type="button" variant="ghost" onClick={() => apply(true)}>
              <X aria-hidden="true" />
              {m.insights_reset()}
            </Button>
          </div>
          {invalid && <p role="alert">{m.insights_range()}</p>}
        </form>
      </details>
      {report.isError && data && !denied && !report.isFetchNextPageError && (
        <ErrorNotice
          error={report.error}
          pending={report.isFetching}
          retry={() => void report.refetch()}
        />
      )}
      {report.isPending ? (
        <ListSkeleton />
      ) : denied || (report.isError && !data) ? (
        <ErrorNotice
          error={report.error}
          pending={report.isFetching}
          retry={() => void report.refetch()}
        />
      ) : (
        data && (
          <>
            <p className="activity-note">
              {date(data.filters.from)} – {date(data.filters.to)} ·{" "}
              {data.timezone}
            </p>
            {(data.filters.activity || data.filters.group) && (
              <div className="insights-filter-chips">
                {data.filters.activity && (
                  <span>
                    {data.activityName || m.insights_selected_activity()}
                  </span>
                )}
                {data.filters.group && (
                  <span>{data.groupName || m.insights_selected_group()}</span>
                )}
              </div>
            )}
            <dl
              className="insights-metrics"
              aria-label={m.insights_participation()}
            >
              <Statistic
                label={m.insights_visits()}
                icon={CalendarCheck}
                value={data.summary.visits.toLocaleString(locale)}
                current={data.summary.visits}
                previous={data.summary.previous?.visits}
              />
              <Statistic
                label={m.insights_unique()}
                icon={Users}
                value={data.summary.unique.toLocaleString(locale)}
                current={data.summary.unique}
                previous={data.summary.previous?.unique}
              />
              <Statistic
                label={m.insights_first()}
                icon={UserPlus}
                value={data.summary.first.toLocaleString(locale)}
                current={data.summary.first}
                previous={data.summary.previous?.first}
              />
              <Statistic
                label={m.insights_returning()}
                icon={Repeat2}
                value={data.summary.returning.toLocaleString(locale)}
                current={data.summary.returning}
                previous={data.summary.previous?.returning}
              />
            </dl>
            <p className="activity-note">
              {(data.summary.comparisonKind === "month"
                ? m.statistics_compare_month
                : m.statistics_compare_period)({
                from: date(data.summary.previousFrom),
                to: date(data.summary.previousTo),
              })}
            </p>
            <section className="insights-section">
              <h2>{m.statistics_context()}</h2>
              <dl className="insights-context">
                <Statistic
                  label={m.statistics_average()}
                  icon={ChartNoAxesColumn}
                  value={
                    perSession(
                      data.summary.visits,
                      data.summary.sessions,
                    )?.toLocaleString(locale, { maximumFractionDigits: 1 }) ??
                    m.statistics_no_denominator()
                  }
                  current={perSession(
                    data.summary.visits,
                    data.summary.sessions,
                  )}
                  previous={
                    data.summary.previous &&
                    perSession(
                      data.summary.previous.visits,
                      data.summary.previous.sessions,
                    )
                  }
                />
                <Statistic
                  label={m.statistics_return_share()}
                  icon={Repeat2}
                  value={
                    share(data.summary.returning, data.summary.unique) === null
                      ? m.statistics_no_denominator()
                      : m.statistics_percentage({
                          value: share(
                            data.summary.returning,
                            data.summary.unique,
                          )!.toLocaleString(locale, {
                            maximumFractionDigits: 1,
                          }),
                        })
                  }
                  current={share(data.summary.returning, data.summary.unique)}
                  previous={
                    data.summary.previous &&
                    share(
                      data.summary.previous.returning,
                      data.summary.previous.unique,
                    )
                  }
                  points
                  preference="neutral"
                />
              </dl>
            </section>
            {!data.summary.sessions && (
              <p className="directory-empty">{m.insights_empty()}</p>
            )}
            <section className="insights-section">
              <h2>{m.insights_trend()}</h2>
              <figure className="insights-chart">
                <svg
                  viewBox={`0 0 ${Math.max(data.trend.length, 1) * 20} 120`}
                  role="img"
                  aria-label={m.insights_trend()}
                  preserveAspectRatio="none"
                >
                  {data.trend.map((point, i) => {
                    const height = point.visits
                      ? Math.max(
                          2,
                          (point.visits /
                            Math.max(1, ...data.trend.map((p) => p.visits))) *
                            110,
                        )
                      : 0;
                    return (
                      <rect
                        key={point.date}
                        x={i * 20 + 3}
                        y={120 - height}
                        width={14}
                        height={height}
                        rx={2}
                      >
                        <title>
                          {date(point.date)}: {m.insights_visits()}{" "}
                          {point.visits}, {m.insights_unique()} {point.unique}
                        </title>
                      </rect>
                    );
                  })}
                </svg>
                <figcaption>
                  {data.trend[0] && date(data.trend[0].date)}
                  <span>
                    {data.trend.at(-1) && date(data.trend.at(-1)!.date)}
                  </span>
                </figcaption>
              </figure>
              <details className="session-help">
                <summary>{m.insights_trend_details()}</summary>
                <dl className="insights-trend-list">
                  {data.trend.map((point) => (
                    <div key={point.date}>
                      <dt>{date(point.date)}</dt>
                      <dd>
                        {m.insights_period_counts({
                          visits: String(point.visits),
                          unique: String(point.unique),
                        })}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            </section>
            <section className="insights-section">
              <h2>{m.insights_payments()}</h2>
              <p className="activity-note">{m.insights_balance_help()}</p>
              <dl className="session-money-grid insights-money">
                <Statistic
                  label={m.insights_charged()}
                  icon={Coins}
                  value={money(data.summary.chargedMinor)}
                  current={data.summary.chargedMinor}
                  previous={data.summary.previous?.chargedMinor}
                  previousValue={
                    data.summary.previous &&
                    money(data.summary.previous.chargedMinor)
                  }
                  preference="neutral"
                />
                <Statistic
                  label={m.management_received()}
                  icon={Wallet}
                  value={money(data.summary.paidMinor)}
                  current={data.summary.paidMinor}
                  previous={data.summary.previous?.paidMinor}
                  previousValue={
                    data.summary.previous &&
                    money(data.summary.previous.paidMinor)
                  }
                  preference="neutral"
                />
                <Statistic
                  label={m.cash_outstanding()}
                  icon={Wallet}
                  value={money(data.summary.outstandingMinor)}
                  current={data.summary.outstandingMinor}
                  previous={data.summary.previous?.outstandingMinor}
                  previousValue={
                    data.summary.previous &&
                    money(data.summary.previous.outstandingMinor)
                  }
                  preference="lower"
                />
                <Statistic
                  label={m.statistics_collection()}
                  icon={CirclePercent}
                  value={
                    share(data.summary.paidMinor, data.summary.chargedMinor) ===
                    null
                      ? m.statistics_no_denominator()
                      : m.statistics_percentage({
                          value: share(
                            data.summary.paidMinor,
                            data.summary.chargedMinor,
                          )!.toLocaleString(locale, {
                            maximumFractionDigits: 1,
                          }),
                        })
                  }
                  current={share(
                    data.summary.paidMinor,
                    data.summary.chargedMinor,
                  )}
                  previous={
                    data.summary.previous &&
                    share(
                      data.summary.previous.paidMinor,
                      data.summary.previous.chargedMinor,
                    )
                  }
                  points
                />
              </dl>
              {(data.summary.unallocatedMinor ?? 0) > 0 && (
                <p className="directory-notice">
                  {m.cash_unallocated()}:{" "}
                  {money(data.summary.unallocatedMinor!)}
                </p>
              )}
              <details className="session-help">
                <summary>{m.insights_cash_flow()}</summary>
                <p>
                  {data.filters.group
                    ? m.insights_group_cash_help()
                    : m.insights_cash_help()}
                </p>
                <strong>{money(data.summary.cashMinor)}</strong>
              </details>
            </section>
            <section className="insights-section">
              <h2>{m.insights_by_activity()}</h2>
              <DirectoryList label={m.insights_by_activity()}>
                {report.data?.pages
                  .flatMap((page) => page.items)
                  .map((item) => (
                    <DirectoryItem key={item.id} linked>
                      <Link
                        className="directory-item-link insights-activity-link"
                        to="/workspace/$organizationId/activities/$activityId"
                        params={{
                          organizationId: organization.id,
                          activityId: item.id,
                        }}
                      >
                        <DirectoryRecord
                          name={item.name}
                          detail={
                            <>
                              {m.insights_activity_counts({
                                sessions: String(item.sessions),
                                visits: String(item.visits),
                                unique: String(item.unique),
                              })}
                              <br />
                              {m.cash_outstanding()}:{" "}
                              {money(item.outstandingMinor)}
                            </>
                          }
                        />
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </DirectoryItem>
                  ))}
              </DirectoryList>
              <InfiniteFooter {...report} />
            </section>
            <details className="session-help">
              <summary>{m.insights_definitions()}</summary>
              <p>{m.insights_definitions_help()}</p>
              <p>{m.statistics_context_help()}</p>
              <p>{m.statistics_comparison_help()}</p>
              <p>{m.insights_group_help()}</p>
              <p>
                {m.insights_registration_counts({
                  registered: String(data.summary.registrations),
                  attended: String(data.summary.registeredPresent),
                  walkins: String(data.summary.walkIns),
                })}
              </p>
              <p>
                {m.insights_sessions({ count: String(data.summary.sessions) })}
              </p>
            </details>
            <p className="activity-note">
              {m.insights_generated({
                time: new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: data.timezone,
                }).format(new Date(data.generatedAt)),
              })}
            </p>
          </>
        )
      )}
      {picker && !denied && (
        <OptionPicker
          kind={picker}
          org={organization.id}
          user={userId}
          onClose={() => setPicker(null)}
          onSelect={(id, name) => {
            const field = picker === "activities" ? "activity" : "group";
            setDraft({ ...draft, [field]: id });
            setNames({ ...names, [field]: name });
            setPicker(null);
          }}
        />
      )}
    </section>
  );
}
