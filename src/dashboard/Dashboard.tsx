import { SessionList } from "./SessionList";
import { Statistic } from "../insights/Statistic";
import { perSession } from "../insights/statistics";
import { CalendarCheck, ChartNoAxesColumn, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, RefreshCw, Users } from "lucide-react";
import { directoryRequest, DirectoryError } from "../community/client";
import { ErrorNotice } from "../activities/Activities";
import { DirectoryHeader } from "../components/shared/directory-layout";
import { ListSkeleton } from "../components/shared/infinite-list";
import { Button } from "../components/ui/button";
import { useLocale } from "../localization/locale";
import { sessionPrice } from "../activities/contracts";
import type { Organization } from "../organization/contracts";
import { insightsFilters, type InsightsReport } from "../insights/contracts";
import type { DashboardReport } from "./contracts";
import { m } from "../paraglide/messages.js";

export default function Dashboard({
  organization,
  userId,
}: {
  organization: Organization;
  userId: string;
}) {
  const locale = useLocale()?.locale ?? "en",
    cache = useQueryClient();
  const admin = ["owner", "admin"].includes(organization.role);
  const [accessError, setAccessError] = useState<unknown>(null);
  const filters = insightsFilters({}, organization.timezone);
  const prefix = ["organization", userId, organization.id, "dashboard"];
  const upcoming = useQuery({
    queryKey: [...prefix, "upcoming"],
    retry: false,
    enabled: !accessError,
    queryFn: ({ signal }) =>
      directoryRequest<DashboardReport>(
        `/api/organizations/${organization.id}/dashboard`,
        { signal },
      ),
  });
  const report = useQuery({
    queryKey: [...prefix, "summary", filters],
    retry: false,
    enabled: admin && !accessError,
    queryFn: ({ signal }) =>
      directoryRequest<InsightsReport>(
        `/api/organizations/${organization.id}/insights?${new URLSearchParams(filters)}`,
        { signal },
      ),
  });
  useEffect(() => {
    if (admin) return;
    const keys = [
      ["organization", userId, organization.id, "dashboard", "summary"],
      ["organization", userId, organization.id, "insights"],
      ["organization", userId, organization.id, "insights-options"],
    ];
    for (const queryKey of keys) {
      void cache.cancelQueries({ queryKey });
      cache.removeQueries({ queryKey });
    }
  }, [admin, cache, organization.id, userId]);
  const deniedError = [upcoming.error, admin ? report.error : null].find(
    (e) =>
      e instanceof DirectoryError &&
      ["forbidden", "not_found", "verify_required", "sign_in"].includes(e.code),
  );
  useEffect(() => {
    if (!deniedError) return;
    setAccessError(deniedError);
    for (const part of [
      "dashboard",
      "planned-sessions",
      "insights",
      "insights-options",
    ]) {
      const queryKey = ["organization", userId, organization.id, part];
      void cache.cancelQueries({ queryKey });
      cache.removeQueries({ queryKey });
    }
  }, [deniedError, cache, organization.id, userId]);
  if (accessError || deniedError)
    return (
      <ErrorNotice
        error={accessError || deniedError}
        pending={false}
        retry={() => setAccessError(null)}
      />
    );
  const busy = upcoming.isFetching || (admin && report.isFetching);
  const refresh = () => {
    void upcoming.refetch();
    if (admin) void report.refetch();
  };
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value + "T12:00:00Z"));
  const updated = (instant: string) =>
    m.insights_generated({
      time: new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: organization.timezone,
      }).format(new Date(instant)),
    });
  const summary = report.data?.summary;
  return (
    <div className="dashboard-page">
      <DirectoryHeader
        title={m.dashboard_title()}
        description={m.dashboard_intro()}
        autoFocus={false}
        action={
          <Button
            variant="outline"
            size="icon"
            aria-label={m.dashboard_refresh()}
            disabled={busy}
            onClick={refresh}
          >
            <RefreshCw aria-hidden="true" size={18} />
          </Button>
        }
      />
      <section
        className="dashboard-section"
        aria-labelledby="dashboard-upcoming"
      >
        <div className="dashboard-section-heading">
          <h2 id="dashboard-upcoming">{m.dashboard_upcoming()}</h2>
          <Link
            to="/workspace/$organizationId/schedule"
            params={{ organizationId: organization.id }}
            search={{ q: "" }}
          >
            {m.dashboard_all_activities()}
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
        {upcoming.isError && (
          <ErrorNotice
            error={upcoming.error}
            pending={upcoming.isFetching}
            retry={upcoming.refetch}
          />
        )}
        {upcoming.isPending ? (
          <ListSkeleton />
        ) : (
          upcoming.data && (
            <>
              {upcoming.data.items.length === 0 ? (
                <p className="directory-empty">{m.dashboard_no_sessions()}</p>
              ) : (
                <SessionList
                  items={upcoming.data.items}
                  organizationId={organization.id}
                  label={m.dashboard_upcoming()}
                />
              )}
              <p className="activity-note dashboard-freshness">
                {m.insights_generated({
                  time: new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: organization.timezone,
                  }).format(new Date(upcoming.data.generatedAt)),
                })}
              </p>
            </>
          )
        )}
      </section>
      {admin && (
        <section
          className="dashboard-section"
          aria-labelledby="dashboard-actions"
        >
          <h2 id="dashboard-actions">{m.dashboard_actions()}</h2>
          <div className="dashboard-shortcuts">
            <Link
              to="/workspace/$organizationId/people/contacts"
              params={{ organizationId: organization.id }}
            >
              <Users aria-hidden="true" size={20} />
              <span>{m.dashboard_contacts()}</span>
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
            <Link
              to="/workspace/$organizationId/forms/$form/$recordId"
              params={{
                organizationId: organization.id,
                form: "activity",
                recordId: "new",
              }}
              search={{ returnTo: `/workspace/${organization.id}/dashboard` }}
            >
              <CalendarDays aria-hidden="true" size={20} />
              <span>{m.dashboard_plan()}</span>
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
          </div>
        </section>
      )}
      {admin && (
        <section
          className="dashboard-section"
          aria-labelledby="dashboard-overview"
        >
          <div className="dashboard-section-heading">
            <h2 id="dashboard-overview">{m.dashboard_month()}</h2>
            <Link
              to="/workspace/$organizationId/insights"
              params={{ organizationId: organization.id }}
              search={filters}
            >
              {m.dashboard_report()}
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
          <p className="activity-note">
            {date(filters.from)} – {date(filters.to)}
          </p>
          {report.isError && (
            <ErrorNotice
              error={report.error}
              pending={report.isFetching}
              retry={report.refetch}
            />
          )}
          {report.isPending ? (
            <ListSkeleton />
          ) : (
            summary && (
              <>
                <dl className="insights-metrics dashboard-metrics">
                  <Statistic
                    label={m.insights_visits()}
                    icon={CalendarCheck}
                    value={summary.visits.toLocaleString(locale)}
                    current={summary.visits}
                    previous={summary.previous?.visits}
                  />
                  <Statistic
                    label={m.insights_unique()}
                    icon={Users}
                    value={summary.unique.toLocaleString(locale)}
                    current={summary.unique}
                    previous={summary.previous?.unique}
                  />
                  <Statistic
                    label={m.statistics_average()}
                    icon={ChartNoAxesColumn}
                    value={
                      perSession(
                        summary.visits,
                        summary.sessions,
                      )?.toLocaleString(locale, { maximumFractionDigits: 1 }) ??
                      m.statistics_no_denominator()
                    }
                    current={perSession(summary.visits, summary.sessions)}
                    previous={
                      summary.previous &&
                      perSession(
                        summary.previous.visits,
                        summary.previous.sessions,
                      )
                    }
                  />
                  <Statistic
                    label={m.cash_outstanding()}
                    icon={Wallet}
                    value={sessionPrice(summary.outstandingMinor, locale)}
                    current={summary.outstandingMinor}
                    previous={summary.previous?.outstandingMinor}
                    previousValue={
                      summary.previous &&
                      sessionPrice(summary.previous.outstandingMinor, locale)
                    }
                    preference="lower"
                  />
                </dl>
                {summary.previousFrom && summary.previousTo && (
                  <p className="activity-note">
                    {(summary.comparisonKind === "month"
                      ? m.statistics_compare_month
                      : m.statistics_compare_period)({
                      from: date(summary.previousFrom),
                      to: date(summary.previousTo),
                    })}
                  </p>
                )}
                <p className="activity-note">
                  {m.dashboard_balance_note()}
                  {report.data?.generatedAt && (
                    <>
                      <br />
                      {updated(report.data.generatedAt)} ·{" "}
                      {organization.timezone}
                    </>
                  )}
                </p>
              </>
            )
          )}
        </section>
      )}
    </div>
  );
}
