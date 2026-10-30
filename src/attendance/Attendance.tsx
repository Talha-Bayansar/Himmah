import { sessionTitle } from "../activities/contracts";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAttendanceMembership } from "./use-attendance-membership";
import { CashScope } from "../cash/CashPage";
import type { CashFilters } from "../cash/CashPage";
import { useBillingActions } from "../cash/use-billing-actions";
import { sessionPrice } from "../activities/contracts";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Banknote, Plus, UserMinus, History, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorNotice, Schedule } from "../activities/Activities";
import type { Session } from "../activities/contracts";
import { DirectoryError, directoryRequest } from "../community/client";
import { ActionButton } from "../components/shared/action-button";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { ItemActions } from "../components/shared/item-actions";
import { Checkbox } from "../components/ui/checkbox";
import { SessionStats } from "./SessionStats";
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
    select: (s) => s.location.search as { q?: string; cashView?: string },
  });
  const isAdmin = ["owner", "admin"].includes(organization.role);
  const access = useQuery({
    queryKey: ["organization", userId, organization.id, "my-access"],
    enabled: !isAdmin,
    queryFn: ({ signal }) =>
      directoryRequest<{ item: { canAttend: boolean; canCollect?: boolean } }>(
        `/api/organizations/${organization.id}/access/me`,
        { signal },
      ),
  });
  const cache = useQueryClient(),
    canManage =
      isAdmin || (!access.isError && access.data?.item.canAttend === true),
    [financialDenied, setFinancialDenied] = useState(false),
    [adding, setAdding] = useState(false),
    [historyOpen, setHistoryOpen] = useState(filters.cashView === "history"),
    [receiptFilters, setReceiptFilters] = useState<CashFilters>({
      q: "",
      view: "history",
    }),
    [selected, setSelected] = useState<Map<string, AttendancePerson>>(
      new Map(),
    ),
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
  useEffect(() => setSelected(new Map()), [membership.completed]);
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
  const current = new Map(rows.map((row) => [row.id, row]));
  const selectedRows = [...selected.values()].map(
    (row) => current.get(row.id) ?? row,
  );
  const paidTargets = selectedRows.filter(
    (row) =>
      row.billing &&
      row.billing.outstandingMinor > 0 &&
      !row.billing.reviewRequired &&
      !row.billing.registrationRequired,
  );
  const unpaidTargets = selectedRows.filter(
    (row) => row.billing && row.billing.paidMinor > 0,
  );
  const bulk = async (action: "remove" | "paid" | "unpaid") => {
    if (
      await membership.change(
        action === "paid"
          ? paidTargets
          : action === "unpaid"
            ? unpaidTargets
            : selectedRows,
        action,
      )
    )
      setSelected(new Map());
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
  if (!canManage && access.data?.item.canCollect)
    return (
      <CashScope
        user={userId}
        organization={organization}
        organizationId={organization.id}
        activityId={activityId}
        sessionId={sessionId}
        unified
        filters={{
          q: search,
          view: (filters.cashView as CashFilters["view"]) ?? "all",
        }}
        onFiltersChange={(value) =>
          void navigate({
            to: "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/attendance",
            params: { organizationId: organization.id, activityId, sessionId },
            search: { q: value.q, cashView: value.view },
            replace: true,
          })
        }
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
            {m.management_title()}
          </h1>
        </div>
        <Button
          disabled={!canEdit || membership.blocked}
          onClick={() => {
            setSelected(new Map());
            setAdding(true);
          }}
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
          <h2>{sessionTitle(session.data.item)}</h2>
          {session.data.item.topic && (
            <p className="activity-note">{session.data.item.name}</p>
          )}
          <Schedule {...session.data.item} compact />
        </div>
      )}
      {billingActions.notice}
      {!adding && membership.notice}
      {summary && (
        <>
          <SessionStats
            summary={summary}
            paidSession={(session.data?.item.priceMinor ?? 0) > 0}
          />
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
      {!!selected.size && (
        <div className="participant-bulkbar">
          <p>{m.attendance_selected({ count: String(selected.size) })}</p>
          <div>
            <Button
              variant="outline"
              size="sm"
              disabled={!canEdit || membership.blocked || !paidTargets.length}
              onClick={() => void bulk("paid")}
            >
              {m.management_mark_paid()}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canEdit || membership.blocked || !unpaidTargets.length}
              onClick={() => void bulk("unpaid")}
            >
              {m.management_mark_unpaid()}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={membership.blocked}
              onClick={() => void bulk("remove")}
            >
              <UserMinus aria-hidden="true" />
              {m.attendance_remove()}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={membership.blocked}
              onClick={() => setSelected(new Map())}
            >
              {m.attendance_clear()}
            </Button>
          </div>
        </div>
      )}
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
                  <Checkbox
                    aria-label={m.attendance_select({ name: row.name })}
                    checked={selected.has(row.id)}
                    disabled={
                      !canEdit ||
                      membership.blocked ||
                      (!selected.has(row.id) && selected.size >= 50)
                    }
                    onCheckedChange={(checked) =>
                      setSelected((previous) => {
                        const next = new Map(previous);
                        if (checked) next.set(row.id, row);
                        else next.delete(row.id);
                        return next;
                      })
                    }
                  />
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
                              label: m.management_payment_details(),
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
                        label: m.attendance_remove(),
                        icon: UserMinus,
                        disabled: !canEdit || membership.blocked,
                        onSelect: async () => {
                          await membership.change(row, "remove");
                        },
                        destructive: true,
                      },
                      {
                        label: m.attendance_history(),
                        icon: History,
                        onSelect: () => setHistory(row),
                      },
                    ]}
                  />
                </div>
                <div className="attendance-row-actions">
                  {!financialDenied &&
                    row.billing &&
                    !row.billing.reviewRequired &&
                    !row.billing.registrationRequired && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!canEdit || membership.blocked}
                        onClick={() =>
                          void membership.change(
                            row,
                            row.billing!.status === "paid" ? "unpaid" : "paid",
                          )
                        }
                        aria-label={(row.billing.status === "paid"
                          ? m.management_unpaid_for
                          : m.management_paid_for)({ name: row.name })}
                      >
                        <Banknote aria-hidden="true" />
                        {row.billing.status === "paid"
                          ? m.management_mark_unpaid()
                          : m.management_mark_paid()}
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
      {isAdmin && (session.data?.item.priceMinor ?? 0) > 0 && (
        <details
          className="session-help"
          open={historyOpen}
          onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
        >
          <summary>{m.cash_history()}</summary>
          {historyOpen && (
            <CashScope
              user={userId}
              organization={organization}
              organizationId={organization.id}
              activityId={activityId}
              sessionId={sessionId}
              historyOnly
              filters={receiptFilters}
              onFiltersChange={setReceiptFilters}
            />
          )}
        </details>
      )}
      {adding && canEdit && (
        <AttendancePicker
          path={base + "/attendance"}
          queryKey={key}
          onClose={() => {
            if (membership.allowClose()) setAdding(false);
          }}
          pending={membership.blocked}
          completed={membership.completed}
          notice={membership.notice}
          onSelect={(people) => membership.change(people, "add")}
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
