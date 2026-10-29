import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAttendanceMembership } from "./use-attendance-membership";
import { useBillingActions } from "../cash/use-billing-actions";
import { sessionPrice } from "../activities/contracts";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Banknote, Plus, UserMinus, History, Search } from "lucide-react";
import { useState } from "react";
import { ErrorNotice, Schedule } from "../activities/Activities";
import type { Session } from "../activities/contracts";
import { DirectoryError, directoryRequest } from "../community/client";
import { ActionButton } from "../components/shared/action-button";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { ItemActions } from "../components/shared/item-actions";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useLocale } from "../localization/locale";
import type { Organization } from "../organization/contracts";
import { m } from "../paraglide/messages.js";
import { AttendancePicker } from "./AttendancePicker";
import { AttendanceHistory } from "./AttendanceHistory";
import {
  type AttendancePerson,
  type AttendanceStatus,
  type AttendanceSummary,
} from "./contracts";
export function statusLabel(status: AttendanceStatus) {
  return {
    unmarked: m.attendance_unmarked,
    present: m.attendance_present,
    absent: m.attendance_absent,
    excused: m.attendance_excused,
  }[status]();
}
export const attendanceKey = (user: string, org: string, session: string) => [
  "organization",
  user,
  org,
  "attendance",
  session,
];
export default function Attendance({
  organization,
  userId,
  activityId,
  sessionId,
}: {
  organization: Organization;
  userId: string;
  activityId: string;
  sessionId: string;
}) {
  const locale = useLocale()?.locale ?? "en";
  const navigate = useNavigate();
  const filters = useRouterState({
    select: (s) => s.location.search as { q?: string },
  });
  const isAdmin = ["owner", "admin"].includes(organization.role);
  const access = useQuery({
    queryKey: ["organization", userId, organization.id, "my-access"],
    enabled: !isAdmin,
    queryFn: ({ signal }) =>
      directoryRequest<{ item: { canAttend: boolean } }>(
        `/api/organizations/${organization.id}/access/me`,
        { signal },
      ),
  });
  const cache = useQueryClient(),
    canManage =
      isAdmin || (!access.isError && access.data?.item.canAttend === true),
    [financialDenied, setFinancialDenied] = useState(false),
    [adding, setAdding] = useState(false),
    [history, setHistory] = useState<AttendancePerson | null>(null);
  const search = typeof filters.q === "string" ? filters.q : "";
  const billingActions = useBillingActions(
    userId,
    organization.id,
    activityId,
    sessionId,
    () => {
      setFinancialDenied(true);
      cache.setQueriesData<{ pages?: { items: AttendancePerson[] }[] }>(
        { queryKey: ["organization", userId, organization.id, "attendance"] },
        (data) =>
          data?.pages
            ? {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  items: page.items.map((row) => ({ ...row, billing: null })),
                })),
              }
            : data,
      );
      void cache.cancelQueries({
        queryKey: ["organization", userId, organization.id, "activities"],
      });
      cache.removeQueries({
        queryKey: ["organization", userId, organization.id, "activities"],
      });
    },
  );
  const base = `/api/organizations/${organization.id}/activities/${activityId}/sessions/${sessionId}`,
    key = attendanceKey(userId, organization.id, sessionId);
  const membership = useAttendanceMembership(base + "/attendance", key);
  const session = useQuery({
    queryKey: [...key, "session", activityId],
    enabled: canManage,
    queryFn: ({ signal }) =>
      directoryRequest<{ item: Session }>(base, { signal }),
  });
  const roster = useInfiniteQuery({
    queryKey: [...key, "roster", activityId, search, "present-only"],
    enabled: canManage,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      directoryRequest<{
        items: AttendancePerson[];
        nextCursor: string | null;
        summary: AttendanceSummary;
      }>(
        base +
          "/attendance?q=" +
          encodeURIComponent(search) +
          "&roster=participants" +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const summary = roster.data?.pages[0]?.summary,
    rows = (roster.data?.pages.flatMap((page) => page.items) ?? []).filter(
      (row) => row.status === "present",
    );
  const canEdit = summary?.canEdit === true;
  const changeSearch = (value: string) => {
    void navigate({
      to: "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/attendance",
      params: { organizationId: organization.id, activityId, sessionId },
      search: { q: value },
      replace: true,
    });
  };
  if (!isAdmin && access.isPending) return <ListSkeleton />;
  if (!isAdmin && access.isError)
    return (
      <ErrorNotice
        error={access.error}
        pending={access.isFetching}
        retry={() => {
          void access.refetch();
        }}
      />
    );
  if (membership.denied)
    return (
      <ErrorNotice
        error={membership.error}
        pending={roster.isFetching}
        retry={() => {
          void roster.refetch().then(() => membership.reset());
        }}
      />
    );
  if (!canManage) return <p role="alert">{m.attendance_access()}</p>;
  if (
    roster.isError &&
    roster.error instanceof DirectoryError &&
    ["forbidden", "not_found", "sign_in"].includes(roster.error.code)
  )
    return (
      <ErrorNotice
        error={roster.error}
        pending={roster.isFetching}
        retry={() => {
          void roster.refetch();
        }}
      />
    );
  return (
    <section className="attendance-page">
      <div className="directory-heading">
        <div>
          <h1 tabIndex={-1} data-page-heading>
            {m.attendance_title()}
          </h1>
        </div>
        <Button
          disabled={!canEdit || membership.blocked}
          onClick={() => setAdding(true)}
        >
          <Plus aria-hidden="true" />
          {m.attendance_add()}
        </Button>
      </div>
      {session.isPending ? (
        <ListSkeleton />
      ) : session.isError ? (
        <ErrorNotice
          error={session.error}
          retry={() => void session.refetch()}
          pending={session.isFetching}
        />
      ) : (
        <div className="attendance-context">
          <h2>{session.data.item.name}</h2>
          <Schedule {...session.data.item} compact />
        </div>
      )}
      {billingActions.notice}
      {!adding && membership.notice}
      {summary && (
        <>
          <p className="activity-note" role="status">
            {m.attendance_present_count({ count: String(summary.present) })}
          </p>
          {!canEdit && (
            <div className="attendance-notice">
              <p>
                {summary.cancelled
                  ? m.attendance_cancelled()
                  : m.attendance_not_started()}
              </p>
              <ActionButton
                type="button"
                variant="outline"
                pending={roster.isFetching}
                onClick={() => void roster.refetch()}
              >
                {m.attendance_refresh()}
              </ActionButton>
            </div>
          )}
        </>
      )}
      <div className="attendance-filters">
        <label className="activity-group-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">{m.directory_search()}</span>
          <Input
            type="search"
            maxLength={80}
            value={search}
            placeholder={m.directory_search()}
            onChange={(e) => changeSearch(e.target.value)}
          />
        </label>
      </div>
      {roster.isPending ? (
        <ListSkeleton />
      ) : roster.isError && !roster.data ? (
        <ErrorNotice
          error={roster.error}
          retry={() => void roster.refetch()}
          pending={roster.isFetching}
        />
      ) : (
        <>
          <div className="attendance-list">
            {rows.map((row) => (
              <article className="attendance-row" key={row.id}>
                <div className="attendance-row-heading">
                  <div>
                    <h2>{row.name}</h2>
                    {!financialDenied && row.billing && (
                      <p
                        className="attendance-payment"
                        data-billing-state={row.billing.status}
                      >
                        {row.billing.status === "not_charged"
                          ? m.cash_unpaid()
                          : row.billing.status === "paid"
                            ? m.cash_paid()
                            : row.billing.status === "partial"
                              ? m.cash_partial()
                              : m.cash_unpaid()}
                        {row.billing.status !== "paid" &&
                          " · " +
                            (row.billing.status === "not_charged"
                              ? m.pricing_amount_short()
                              : m.cash_outstanding()) +
                            ": " +
                            sessionPrice(
                              row.billing.status === "not_charged"
                                ? row.billing.amountMinor
                                : row.billing.outstandingMinor,
                              locale,
                            )}
                        {row.billing.reviewRequired && (
                          <>
                            <br />
                            {m.pricing_review()}
                          </>
                        )}
                        {row.billing.registrationRequired && (
                          <>
                            <br />
                            {m.billing_required_help()}
                          </>
                        )}
                      </p>
                    )}
                    {(row.archived || !row.eligible) && (
                      <p className="attendance-retained">
                        {row.archived
                          ? m.attendance_archived()
                          : m.attendance_outside()}
                      </p>
                    )}
                  </div>
                  <ItemActions
                    name={row.name}
                    pending={
                      billingActions.pending &&
                      billingActions.personId === row.id
                    }
                    actions={[
                      ...(!financialDenied &&
                      row.billing &&
                      !row.billing.reviewRequired &&
                      !row.billing.registrationRequired &&
                      row.billing.outstandingMinor > 0
                        ? [
                            {
                              label: m.cash_record(),
                              icon: Banknote,
                              disabled: billingActions.blocked,
                              onSelect: () =>
                                billingActions.record(row.billing!),
                            },
                            ...(row.billing.status === "not_charged"
                              ? [
                                  {
                                    label: m.billing_add_charge(),
                                    icon: Banknote,
                                    disabled: billingActions.blocked,
                                    onSelect: () =>
                                      billingActions.charge(row.billing!),
                                  },
                                ]
                              : []),
                          ]
                        : []),
                      {
                        label: m.attendance_history(),
                        icon: History,
                        onSelect: () => setHistory(row),
                      },
                    ]}
                  />
                </div>
                <div className="attendance-row-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!canEdit || membership.blocked}
                    onClick={() => void membership.change(row, "remove")}
                    aria-label={m.attendance_remove_for({ name: row.name })}
                  >
                    <UserMinus size={16} aria-hidden="true" />
                    {m.attendance_remove()}
                  </Button>
                  {!financialDenied &&
                    row.billing &&
                    !row.billing.reviewRequired &&
                    !row.billing.registrationRequired &&
                    row.billing.outstandingMinor > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={billingActions.blocked}
                        onClick={() => billingActions.record(row.billing!)}
                        aria-label={m.quick_cash_for({ name: row.name })}
                      >
                        <Banknote aria-hidden="true" />
                        {m.quick_cash_title()}
                      </Button>
                    )}
                </div>
              </article>
            ))}
          </div>
          {!rows.length && (
            <p className="directory-empty">
              {search ? m.attendance_empty() : m.attendance_present_empty()}
            </p>
          )}
          <InfiniteFooter {...roster} />
        </>
      )}
      {adding && canEdit && (
        <AttendancePicker
          path={base + "/attendance"}
          queryKey={key}
          onClose={() => {
            if (membership.allowClose()) setAdding(false);
          }}
          pending={membership.blocked}
          notice={membership.notice}
          onSelect={(person) => void membership.change(person, "add")}
        />
      )}
      {history && (
        <AttendanceHistory
          person={history}
          path={base + "/attendance"}
          queryKey={key}
          timezone={session.data?.item.timezone ?? organization.timezone}
          onClose={() => setHistory(null)}
        />
      )}
    </section>
  );
}
