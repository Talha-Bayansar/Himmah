import { MetricSkeleton } from "../components/shared/infinite-list";
import { MetricSummary } from "../components/shared/metric-summary";
import { useQuery } from "@tanstack/react-query";
import { DirectoryError, directoryRequest } from "../community/client";
import { ErrorNotice } from "../activities/Activities";
import { sessionPrice } from "../activities/contracts";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import type { AttendanceSummary } from "./contracts";

export function SessionStats({
  summary,
  compact = false,
  paidSession = false,
}: {
  summary: AttendanceSummary;
  compact?: boolean;
  paidSession?: boolean;
}) {
  const locale = useLocale()?.locale ?? "en";
  const financial =
    paidSession && summary.paid !== null && summary.paid !== undefined;
  return (
    <div
      className={
        compact ? "session-stats session-stats-compact" : "session-stats"
      }
    >
      <MetricSummary
        label={m.management_stats()}
        compact={compact}
        className="session-stat-grid"
        items={[
          { label: m.attendance_present(), value: summary.present },
          ...(financial
            ? [
                { label: m.cash_paid(), value: summary.paid },
                {
                  label: m.cash_unpaid(),
                  value: (summary.unpaid ?? 0) + (summary.partial ?? 0),
                },
              ]
            : []),
        ]}
      />
      {financial && !compact && (
        <details className="session-help session-money-details">
          <summary>
            {m.interface_financial_details()} ·{" "}
            {sessionPrice(summary.outstandingMinor ?? 0, locale)}{" "}
            {m.cash_outstanding().toLocaleLowerCase(locale)}
          </summary>
          <dl className="session-money-grid">
            <div>
              <dt>{m.management_expected()}</dt>
              <dd>{sessionPrice(summary.expectedMinor ?? 0, locale)}</dd>
            </div>
            <div>
              <dt>{m.management_received()}</dt>
              <dd>{sessionPrice(summary.paidMinor ?? 0, locale)}</dd>
            </div>
            <div>
              <dt>{m.cash_outstanding()}</dt>
              <dd>{sessionPrice(summary.outstandingMinor ?? 0, locale)}</dd>
            </div>
          </dl>
          {!!summary.partial && (
            <p className="activity-note">
              {m.management_partial_count({ count: String(summary.partial) })}
            </p>
          )}
        </details>
      )}
      {financial && !compact && summary.paymentCount !== summary.present && (
        <p className="activity-note">{m.management_scope()}</p>
      )}
    </div>
  );
}
export function SessionStatsPreview({
  user,
  org,
  activity,
  session,
  paidSession,
}: {
  user: string;
  org: string;
  activity: string;
  session: string;
  paidSession: boolean;
}) {
  const query = useQuery({
    queryKey: [
      "organization",
      user,
      org,
      "attendance",
      session,
      "preview-stats",
    ],
    queryFn: async ({ signal }) => {
      const result = await directoryRequest<{ summary: AttendanceSummary }>(
        `/api/organizations/${org}/activities/${activity}/sessions/${session}/attendance?limit=1`,
        { signal },
      );
      if (!result.summary || !Number.isSafeInteger(result.summary.present))
        throw new DirectoryError("service");
      return result;
    },
  });
  if (query.isPending)
    return (
      <MetricSkeleton
        count={paidSession ? 3 : 1}
        columns={paidSession ? 3 : 1}
      />
    );
  if (query.isError)
    return (
      <ErrorNotice
        error={query.error}
        pending={query.isFetching}
        retry={() => void query.refetch()}
      />
    );
  return (
    <SessionStats
      compact
      summary={query.data.summary}
      paidSession={paidSession}
    />
  );
}
