import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, RefreshCw, Users } from "lucide-react";
import { directoryRequest, DirectoryError } from "../community/client";
import { ErrorNotice } from "../activities/Activities";
import {
  DirectoryHeader,
  DirectoryList,
  DirectoryItem,
  DirectoryRecord,
} from "../components/shared/directory-layout";
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
    for (const part of ["dashboard", "insights", "insights-options"]) {
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
            to="/workspace/$organizationId/$section"
            params={{ organizationId: organization.id, section: "activities" }}
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
                <DirectoryList label={m.dashboard_upcoming()}>
                  {upcoming.data.items.map((item) => (
                    <DirectoryItem key={item.id} linked>
                      <Link
                        className="directory-item-link"
                        to="/workspace/$organizationId/activities/$activityId/sessions/$sessionId"
                        params={{
                          organizationId: organization.id,
                          activityId: item.activityId,
                          sessionId: item.id,
                        }}
                      >
                        <DirectoryRecord
                          name={item.name}
                          detail={
                            <>
                              <time dateTime={item.startsAt}>
                                {new Intl.DateTimeFormat(locale, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                  timeZone: item.timezone,
                                }).formatRange(
                                  new Date(item.startsAt),
                                  new Date(item.endsAt),
                                )}
                              </time>
                              {item.location && <span>{item.location}</span>}
                            </>
                          }
                          icon={<CalendarDays aria-hidden="true" size={20} />}
                        />
                        <ArrowRight aria-hidden="true" size={18} />
                      </Link>
                    </DirectoryItem>
                  ))}
                </DirectoryList>
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
                  {[
                    [
                      m.insights_visits(),
                      summary.visits.toLocaleString(locale),
                    ],
                    [
                      m.insights_unique(),
                      summary.unique.toLocaleString(locale),
                    ],
                    [
                      m.cash_outstanding(),
                      sessionPrice(summary.outstandingMinor, locale),
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
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
