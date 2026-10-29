import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useBillingActions } from "../cash/use-billing-actions";
import { sessionPrice } from "../activities/contracts";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Banknote,
  ClipboardCheck,
  History,
  Search,
  Users,
  X,
} from "lucide-react";
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
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { useLocale } from "../localization/locale";
import type { Organization } from "../organization/contracts";
import { m } from "../paraglide/messages.js";
import { AttendanceEditor } from "./AttendanceEditor";
import { AttendanceHistory } from "./AttendanceHistory";
import {
  attendanceStatuses,
  type AttendancePerson,
  type AttendanceResult,
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
    select: (s) =>
      s.location.search as { q?: string; status?: string; roster?: string },
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
    [selected, setSelected] = useState<Map<string, AttendancePerson>>(
      new Map(),
    ),
    [editor, setEditor] = useState<AttendancePerson[] | null>(null),
    [history, setHistory] = useState<AttendancePerson | null>(null),
    [notice, setNotice] = useState<AttendanceResult | null>(null),
    [lastPeople, setLastPeople] = useState<AttendancePerson[]>([]);
  const search = typeof filters.q === "string" ? filters.q : "",
    status = filters.status ?? "all",
    rosterFilter = filters.roster ?? "all";
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
  const session = useQuery({
    queryKey: [...key, "session", activityId],
    enabled: canManage,
    queryFn: ({ signal }) =>
      directoryRequest<{ item: Session }>(base, { signal }),
  });
  const roster = useInfiniteQuery({
    queryKey: [...key, "roster", activityId, search, status, rosterFilter],
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
          "&status=" +
          status +
          "&roster=" +
          rosterFilter +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const summary = roster.data?.pages[0]?.summary,
    rows = roster.data?.pages.flatMap((page) => page.items) ?? [];
  const canEdit = summary?.canEdit === true;
  const changeFilter = (
    kind: "search" | "status" | "roster",
    value: string,
  ) => {
    setSelected(new Map());
    void navigate({
      to: "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/attendance",
      params: { organizationId: organization.id, activityId, sessionId },
      search: {
        q: kind === "search" ? value : search,
        status: kind === "status" ? value : status,
        roster: kind === "roster" ? value : rosterFilter,
      },
      replace: true,
    });
  };
  const openSelected = () => {
    const current = new Map(rows.map((row) => [row.id, row]));
    setEditor([...selected.values()].map((row) => current.get(row.id) ?? row));
  };
  const complete = async (result: AttendanceResult) => {
    setLastPeople(editor ?? []);
    setNotice(result);
    setEditor(null);
    setSelected(new Map());
    await cache.invalidateQueries({ queryKey: key });
  };
  const saved =
      notice?.items.filter(
        (item) => item.outcome === "saved" || item.outcome === "unchanged",
      ).length ?? 0,
    failed = (notice?.items.length ?? 0) - saved;
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
          <p>{m.attendance_help()}</p>
        </div>
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
          <Schedule {...session.data.item} />
        </div>
      )}
      {billingActions.notice}
      {notice && (
        <div className="attendance-notice" role={failed ? "alert" : "status"}>
          <p>{m.attendance_saved({ count: String(saved) })}</p>
          {!!failed && (
            <>
              <p>{m.attendance_failed({ count: String(failed) })}</p>
              <ul>
                {notice.items
                  .filter(
                    (item) => !["saved", "unchanged"].includes(item.outcome),
                  )
                  .map((item) => (
                    <li key={item.personId}>
                      {lastPeople.find((person) => person.id === item.personId)
                        ?.name ?? m.directory_members()}
                      :{" "}
                      {item.outcome === "conflict"
                        ? m.attendance_conflict()
                        : item.outcome === "ineligible"
                          ? m.attendance_ineligible()
                          : m.attendance_reason_required()}
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>
      )}
      {summary && (
        <>
          <dl className="attendance-totals" aria-label={m.attendance_totals()}>
            {attendanceStatuses.map((value) => (
              <div key={value}>
                <dt>{statusLabel(value)}</dt>
                <dd>{summary[value]}</dd>
              </div>
            ))}
          </dl>
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
            onChange={(e) => changeFilter("search", e.target.value)}
          />
        </label>
        <div>
          <Label htmlFor="attendance-roster">{m.attendance_roster()}</Label>
          <NativeSelect
            id="attendance-roster"
            value={rosterFilter}
            onChange={(e) => changeFilter("roster", e.target.value)}
          >
            {(["all", "registered", "expected"] as const).map((v) => (
              <NativeSelectOption key={v} value={v}>
                {m[("attendance_roster_" + v) as "attendance_roster_all"]()}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Label htmlFor="attendance-filter">{m.attendance_filter()}</Label>
          <NativeSelect
            id="attendance-filter"
            value={status}
            onChange={(e) => changeFilter("status", e.target.value)}
          >
            <NativeSelectOption value="all">
              {m.attendance_all()}
            </NativeSelectOption>
            {attendanceStatuses.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {statusLabel(value)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
      {!!selected.size && (
        <div className="attendance-bulkbar">
          <p role="status">
            {m.attendance_selected({ count: String(selected.size) })}
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelected(new Map())}
            >
              <X size={16} aria-hidden="true" />
              {m.attendance_clear()}
            </Button>
            <Button type="button" disabled={!canEdit} onClick={openSelected}>
              <Users size={16} aria-hidden="true" />
              {m.attendance_bulk()}
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
                  <label className="attendance-select">
                    <Checkbox
                      aria-label={m.attendance_select({ name: row.name })}
                      checked={selected.has(row.id)}
                      disabled={
                        !canEdit ||
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
                    <span className="sr-only">
                      {m.attendance_select({ name: row.name })}
                    </span>
                  </label>
                  <div>
                    <h2>{row.name}</h2>
                    <p
                      className={
                        "attendance-state attendance-state-" + row.status
                      }
                    >
                      {statusLabel(row.status)}
                    </p>
                    {!financialDenied && row.billing && (
                      <p
                        className="attendance-payment"
                        data-billing-state={row.billing.status}
                      >
                        {row.billing.status === "not_charged"
                          ? m.billing_not_charged()
                          : row.billing.status === "paid"
                            ? m.cash_paid()
                            : row.billing.status === "partial"
                              ? m.cash_partial()
                              : m.cash_unpaid()}
                        {" · " +
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
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canEdit}
                  onClick={() => setEditor([row])}
                >
                  <ClipboardCheck size={16} aria-hidden="true" />
                  {row.version ? m.attendance_update() : m.attendance_record()}
                </Button>
              </article>
            ))}
          </div>
          {!rows.length && (
            <p className="directory-empty">{m.attendance_empty()}</p>
          )}
          <InfiniteFooter {...roster} />
        </>
      )}
      {editor && (
        <AttendanceEditor
          records={editor}
          path={base + "/attendance"}
          onClose={() => {
            setEditor(null);
            void cache.invalidateQueries({ queryKey: key });
          }}
          onSaved={complete}
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
