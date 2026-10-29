import { useBillingActions } from "./use-billing-actions";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Banknote, Save, Undo2, X } from "lucide-react";
import OrganizationPortal from "../organization/OrganizationPortal";
import type { Organization } from "../organization/contracts";
import {
  DirectoryError,
  directoryRequest,
  useDirectoryPages,
} from "../community/client";
import {
  DirectoryHeader,
  DirectoryToolbar,
  DirectoryList,
  DirectoryItem,
  DirectoryRecord,
} from "../components/shared/directory-layout";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { ItemActions } from "../components/shared/item-actions";
import { CollectionError } from "../components/shared/collection-error";
import { FormSurface } from "../components/shared/form-surface";
import { formReturn } from "../components/shared/form-navigation";
import { useConfirmation } from "../components/shared/confirmation";
import { ActionButton } from "../components/shared/action-button";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Checkbox } from "../components/ui/checkbox";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { useLocale } from "../localization/locale";
import { useSearch } from "../modules/people/shared";
import {
  localTime,
  zonedInstant,
  priceFromText,
  sessionPrice,
} from "../activities/contracts";
import { m } from "../paraglide/messages.js";
import {
  cashViews,
  type CashCharge,
  type CashReceipt,
  type CashSummary,
  type CashView,
} from "./contracts";
export type CashFilters = { q: string; view: CashView };
type Props = {
  organizationId: string;
  activityId: string;
  sessionId: string;
  record?: boolean;
  chargeId?: string;
  personId?: string;
  returnTo?: string;
  filters: CashFilters;
  onFiltersChange: (f: CashFilters) => void;
};
const denied = (e: unknown) =>
  e instanceof DirectoryError &&
  ["forbidden", "not_found", "sign_in", "verify_required"].includes(e.code);
const label = (v: CashView) =>
  ({
    all: m.cash_all,
    not_charged: m.billing_not_charged,
    participants: m.cash_choose_contacts,
    outstanding: m.cash_outstanding,
    unpaid: m.cash_unpaid,
    partial: m.cash_partial,
    paid: m.cash_paid,
    review: m.cash_review,
    history: m.cash_history,
  })[v]();
export default function CashPage(props: Props) {
  return (
    <OrganizationPortal
      initialMode="signin"
      workspaceId={props.organizationId}
      workspaceSection="activities"
    >
      {(user, organization) => (
        <Scope
          key={
            user +
            organization.id +
            props.sessionId +
            (props.record
              ? "record" + (props.personId || props.chargeId || "")
              : "list")
          }
          {...props}
          user={user}
          organization={organization}
        />
      )}
    </OrganizationPortal>
  );
}
function Scope(props: Props & { user: string; organization: Organization }) {
  const cache = useQueryClient(),
    [error, setError] = useState<unknown>(null);
  const onDenied = useCallback(
    (e: unknown) => {
      setError(e);
      const queryKey = [
        "organization",
        props.user,
        props.organizationId,
        "activities",
      ];
      void cache.cancelQueries({ queryKey });
      cache.removeQueries({ queryKey });
      const attendanceKey = [
        "organization",
        props.user,
        props.organizationId,
        "attendance",
      ];
      void cache.cancelQueries({ queryKey: attendanceKey });
      cache.removeQueries({ queryKey: attendanceKey });
    },
    [cache, props.user, props.organizationId],
  );
  return error ? (
    <CollectionError error={error} />
  ) : (
    <Content {...props} onDenied={onDenied} />
  );
}
function Content(
  props: Props & {
    user: string;
    organization: Organization;
    onDenied: (e: unknown) => void;
  },
) {
  const {
    organizationId: org,
    activityId: activity,
    sessionId: session,
    user,
    filters,
    onFiltersChange,
    onDenied,
  } = props;
  const locale = useLocale()?.locale ?? "en",
    cache = useQueryClient(),
    confirm = useConfirmation(),
    navigate = useNavigate(),
    [reversal, setReversal] = useState<CashReceipt | null>(null),
    [reason, setReason] = useState("");
  const scope = [
      "organization",
      user,
      org,
      "activities",
      "cash",
      activity,
      session,
    ],
    path = `/api/organizations/${org}/activities/${activity}/sessions/${session}/cash`,
    q = useSearch(filters.q);
  const billingActions = useBillingActions(
    user,
    org,
    activity,
    session,
    onDenied,
  );
  const pages = useDirectoryPages<CashCharge | CashReceipt>(
    [...scope, filters.view, q],
    `${path}?view=${filters.view}&q=${encodeURIComponent(q)}`,
    { enabled: !props.record },
  );
  const summaryQuery = useQuery({
    queryKey: [...scope, "form-summary"],
    enabled: !!props.record,
    queryFn: ({ signal }) =>
      directoryRequest<{ summary: CashSummary }>(path + "?limit=1", { signal }),
    retry: false,
  });
  const reverse = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      directoryRequest(path, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => {
      await cache.invalidateQueries({
        queryKey: ["organization", user, org, "activities"],
      });
      setReversal(null);
      setReason("");
    },
    onError: (e) => {
      if (denied(e)) onDenied(e);
      else if (
        e instanceof DirectoryError &&
        !["service", "rate_limit"].includes(e.code)
      ) {
        reverseAttempt.current = null;
        void cache.invalidateQueries({ queryKey: scope });
      }
    },
  });
  const reverseAttempt = useRef<Record<string, unknown> | null>(null);
  useEffect(() => {
    const error = pages.error ?? summaryQuery.error;
    if (denied(error)) onDenied(error);
  }, [pages.error, summaryQuery.error, onDenied]);
  const reverseApproved = useRef(false);
  const closeReversal = async () => {
    if (reverse.isPending) return;
    if (
      (!reason && !reverseAttempt.current) ||
      (await confirm({
        title: m.directory_discard(),
        description: reverseAttempt.current
          ? m.cash_uncertain()
          : m.directory_discard_description(),
        confirmLabel: m.directory_discard(),
        destructive: true,
      }))
    ) {
      reverseApproved.current = true;
      setReversal(null);
      setReason("");
      reverseAttempt.current = null;
    }
  };
  useBlocker({
    shouldBlockFn: async () =>
      !!reversal &&
      !reverseApproved.current &&
      (reverse.isPending ||
        ((!!reason || !!reverseAttempt.current) &&
          !(await confirm({
            title: m.directory_discard(),
            description: reverseAttempt.current
              ? m.cash_uncertain()
              : m.directory_discard_description(),
            confirmLabel: m.directory_discard(),
            destructive: true,
          })))),
    enableBeforeUnload: () =>
      !!reversal && (!!reason || !!reverseAttempt.current),
  });
  if (props.record) {
    if (summaryQuery.isPending) return <ListSkeleton />;
    if (summaryQuery.isError)
      return (
        <CollectionError
          error={summaryQuery.error}
          retry={() => void summaryQuery.refetch()}
        />
      );
    return (
      <CashForm
        {...props}
        path={path}
        scope={scope}
        summary={summaryQuery.data.summary}
      />
    );
  }
  if (pages.isPending) return <ListSkeleton />;
  if (pages.isError && !pages.data)
    return (
      <CollectionError error={pages.error} retry={() => void pages.refetch()} />
    );
  const summary = (pages.data!.pages[0] as unknown as { summary: CashSummary })
    .summary;
  const record = (chargeId?: string) =>
    void navigate({
      to: "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/record-cash",
      params: { organizationId: org, activityId: activity, sessionId: session },
      search: {
        chargeId: chargeId ?? "",
        returnTo: `/workspace/${org}/activities/${activity}/sessions/${session}/cash?q=${encodeURIComponent(filters.q)}&view=${filters.view}`,
      },
    });
  const money = (n: number) => sessionPrice(n, locale),
    date = (v: string) =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: summary.timezone,
      }).format(new Date(v));
  return (
    <section className="directory cash-page">
      <Button variant="link" className="settings-back" asChild>
        <Link
          to="/workspace/$organizationId/activities/$activityId/sessions/$sessionId"
          params={{
            organizationId: org,
            activityId: activity,
            sessionId: session,
          }}
        >
          <ArrowLeft aria-hidden="true" />
          {m.sessions_view()}
        </Link>
      </Button>
      <DirectoryHeader
        title={m.cash_title()}
        description={summary.name}
        action={
          summary.canRecord ? (
            <Button
              className="people-section-add"
              aria-label={m.cash_record()}
              onClick={() => record()}
            >
              <Banknote aria-hidden="true" />
              <span className="hidden sm:inline">{m.cash_record()}</span>
            </Button>
          ) : undefined
        }
      />
      {billingActions.notice}
      {!!summary.toChargeCount && (
        <p className="activity-note">
          {m.billing_to_charge({ count: summary.toChargeCount })}
        </p>
      )}
      <dl className="cash-totals">
        {[
          [m.cash_outstanding(), summary.outstandingMinor],
          [m.cash_applied(), summary.paidMinor],
        ].map(([title, value]) => (
          <div key={String(title)}>
            <dt>{title}</dt>
            <dd>{money(Number(value))}</dd>
          </div>
        ))}
      </dl>
      {(summary.unallocatedMinor ?? 0) > 0 && (
        <p className="directory-notice">
          {m.cash_unallocated()}: {money(summary.unallocatedMinor!)}
        </p>
      )}
      <details className="session-help cash-total-details">
        <summary>{m.cash_more_totals()}</summary>
        <dl className="cash-totals">
          <div>
            <dt>{m.cash_owed()}</dt>
            <dd>{money(summary.owedMinor)}</dd>
          </div>
          {summary.canManage && (
            <>
              <div>
                <dt>{m.cash_collected()}</dt>
                <dd>{money(summary.collectedMinor ?? 0)}</dd>
              </div>
              <div>
                <dt>{m.cash_unallocated()}</dt>
                <dd>{money(summary.unallocatedMinor ?? 0)}</dd>
              </div>
            </>
          )}
        </dl>
      </details>
      {!summary.canManage && <p className="activity-note">{m.cash_scoped()}</p>}
      <DirectoryToolbar
        id="cash-search"
        label={m.directory_search()}
        value={filters.q}
        onChange={(q) => onFiltersChange({ ...filters, q })}
      >
        <Label htmlFor="cash-view">{m.registration_view()}</Label>
        <NativeSelect
          id="cash-view"
          value={filters.view}
          onChange={(e) =>
            onFiltersChange({ ...filters, view: e.target.value as CashView })
          }
        >
          {cashViews
            .filter(
              (v) =>
                v !== "participants" && (v !== "history" || summary.canManage),
            )
            .map((v) => (
              <NativeSelectOption key={v} value={v}>
                {label(v)}
              </NativeSelectOption>
            ))}
        </NativeSelect>
      </DirectoryToolbar>
      <DirectoryList label={m.cash_title()}>
        {pages
          .data!.pages.flatMap((p) => p.items)
          .map((item) =>
            filters.view === "history"
              ? (() => {
                  const r = item as CashReceipt;
                  return (
                    <DirectoryItem key={r.id}>
                      <div className="cash-receipt-record">
                        <DirectoryRecord
                          icon={<Banknote aria-hidden="true" size={18} />}
                          name={money(r.amountMinor)}
                          detail={
                            <>
                              {date(r.occurredAt)} ·{" "}
                              {r.collectorName || m.staff_unnamed()}
                              {r.payerLabel && <> · {r.payerLabel}</>}
                              <br />
                              {m.cash_recorded_at({ time: date(r.createdAt) })}
                              {r.reversedAt && (
                                <>
                                  <br />
                                  {m.cash_reversed_by({
                                    name: r.reversedBy || m.staff_unnamed(),
                                    time: date(r.reversedAt),
                                  })}
                                </>
                              )}
                              {r.reversed && (
                                <>
                                  {" "}
                                  · {m.cash_reversed()}: {r.reason}
                                </>
                              )}
                              {r.unallocatedMinor > 0 && (
                                <>
                                  <br />
                                  {m.cash_unallocated()}:{" "}
                                  {money(r.unallocatedMinor)}
                                </>
                              )}
                            </>
                          }
                        />
                        <details className="session-help">
                          <summary>{m.cash_allocations()}</summary>
                          {r.allocations.map((a, i) => (
                            <p key={i}>
                              {a.name}: {money(a.amountMinor)}
                            </p>
                          ))}
                        </details>
                      </div>
                      {!r.reversed && (
                        <ItemActions
                          name={money(r.amountMinor)}
                          actions={[
                            {
                              label: m.cash_reverse(),
                              icon: Undo2,
                              destructive: true,
                              onSelect: () => {
                                reverseApproved.current = false;
                                reverseAttempt.current = null;
                                reverse.reset();
                                setReason("");
                                setReversal(r);
                              },
                            },
                          ]}
                        />
                      )}
                    </DirectoryItem>
                  );
                })()
              : (() => {
                  const c = item as CashCharge;
                  return (
                    <DirectoryItem key={c.id}>
                      <DirectoryRecord
                        name={c.name}
                        detail={
                          <>
                            {c.status === "not_charged"
                              ? m.cash_row_fee({ amount: money(c.amountMinor) })
                              : c.status === "paid"
                                ? m.cash_paid()
                                : m.cash_row_due({
                                    amount: money(c.outstandingMinor),
                                  })}
                            {c.status === "partial" && (
                              <> · {m.cash_partial()}</>
                            )}
                            {c.status === "not_charged" && (
                              <> · {m.billing_not_charged()}</>
                            )}
                            {c.registrationRequired && (
                              <>
                                <br />
                                {m.billing_required_help()}
                              </>
                            )}
                            {c.reviewRequired && (
                              <>
                                <br />
                                {m.pricing_review()}
                              </>
                            )}
                          </>
                        }
                      />
                      {summary.canRecord &&
                        !c.reviewRequired &&
                        !c.registrationRequired &&
                        c.outstandingMinor > 0 && (
                          <div className="cash-row-actions">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={billingActions.blocked}
                              onClick={() => billingActions.record(c)}
                              aria-label={m.quick_cash_for({ name: c.name })}
                            >
                              <Banknote aria-hidden="true" />
                              {m.quick_cash_title()}
                            </Button>
                            {c.status === "not_charged" && (
                              <ItemActions
                                name={c.name}
                                actions={[
                                  {
                                    label: m.billing_add_charge(),
                                    icon: Banknote,
                                    disabled: billingActions.blocked,
                                    onSelect: () => billingActions.charge(c),
                                  },
                                ]}
                              />
                            )}
                          </div>
                        )}
                    </DirectoryItem>
                  );
                })(),
          )}
      </DirectoryList>
      {!pages.data!.pages.some((p) => p.items.length) && (
        <p className="directory-empty">{m.directory_empty()}</p>
      )}
      <InfiniteFooter {...pages} />
      {reversal && (
        <FormSurface
          title={m.cash_reverse()}
          description={m.cash_reverse_help()}
          onClose={() => void closeReversal()}
        >
          <form
            className="directory-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!reverseAttempt.current) {
                if (!reason.trim()) return;
                if (
                  !(await confirm({
                    title: m.cash_reverse(),
                    description: m.cash_reverse_help(),
                    confirmLabel: m.cash_reverse(),
                    destructive: true,
                  }))
                )
                  return;
                reverseAttempt.current = {
                  key: crypto.randomUUID(),
                  action: "reverse",
                  receiptId: reversal.id,
                  reason: reason.trim(),
                };
              }
              try {
                await reverse.mutateAsync(reverseAttempt.current);
                reverseAttempt.current = null;
              } catch (e) {
                if (
                  e instanceof DirectoryError &&
                  !["service", "rate_limit"].includes(e.code)
                )
                  reverseAttempt.current = null;
              }
            }}
          >
            <Label htmlFor="cash-reverse-reason">{m.sessions_reason()}</Label>
            <Input
              id="cash-reverse-reason"
              value={reason}
              maxLength={300}
              required
              disabled={reverse.isPending || !!reverseAttempt.current}
              onChange={(e) => setReason(e.target.value)}
            />
            {reverse.isError && <CollectionError error={reverse.error} />}
            <div className="directory-actions">
              <Button
                type="button"
                variant="outline"
                disabled={reverse.isPending}
                onClick={() => void closeReversal()}
              >
                {m.cancel()}
              </Button>
              <ActionButton type="submit" pending={reverse.isPending}>
                {reverseAttempt.current ? m.try_again() : m.cash_reverse()}
              </ActionButton>
            </div>
          </form>
        </FormSurface>
      )}
    </section>
  );
}
function CashForm(
  props: Props & {
    user: string;
    organization: Organization;
    onDenied: (e: unknown) => void;
    path: string;
    scope: readonly unknown[];
    summary: CashSummary;
  },
) {
  const { summary, path, scope, onDenied } = props,
    locale = useLocale()?.locale ?? "en",
    cache = useQueryClient(),
    navigate = useNavigate(),
    confirm = useConfirmation();
  const [selected, setSelected] = useState<
      Map<string, { charge: CashCharge; text: string }>
    >(() => new Map()),
    [amount, setAmount] = useState(""),
    [payer, setPayer] = useState(""),
    [occurred, setOccurred] = useState(() =>
      localTime(new Date().toISOString(), summary.timezone),
    ),
    [search, setSearch] = useState(""),
    [invalid, setInvalid] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [refreshError, setRefreshError] = useState<unknown>(null);
  const attempt = useRef<Record<string, unknown> | null>(null),
    approved = useRef(false),
    initialized = useRef(false),
    query = useSearch(search);
  const options = useDirectoryPages<CashCharge>(
    [...scope, "options", query],
    path + "?view=participants&q=" + encodeURIComponent(query),
    { enabled: summary.canRecord },
  );
  const initial = useQuery({
    queryKey: [...scope, "initial", props.chargeId, props.personId],
    enabled: !!(props.chargeId || props.personId),
    queryFn: ({ signal }) =>
      directoryRequest<{ item: CashCharge }>(
        path +
          (props.personId
            ? "/participants/" + props.personId
            : "/charges/" + props.chargeId),
        { signal },
      ),
    retry: false,
  });
  useEffect(() => {
    if (initial.data && !initialized.current) {
      initialized.current = true;
      const charge = initial.data.item;
      if (
        !charge.reviewRequired &&
        charge.outstandingMinor > 0 &&
        !charge.registrationRequired
      ) {
        setSelected(
          new Map([
            [
              charge.id,
              { charge, text: (charge.outstandingMinor / 100).toFixed(2) },
            ],
          ]),
        );
        setAmount((charge.outstandingMinor / 100).toFixed(2));
      }
    }
  }, [initial.data]);
  useEffect(() => {
    const error = initial.error ?? options.error;
    if (denied(error)) onDenied(error);
  }, [initial.error, options.error, onDenied]);
  const returnTo = formReturn(props.returnTo, props.organizationId),
    fallback = `/workspace/${props.organizationId}/activities/${props.activityId}/sessions/${props.sessionId}/cash`;
  const leave = async () => {
    if (operation.isPending) return;
    if (
      !dirty ||
      (await confirm({
        title: m.directory_discard(),
        description: attempt.current
          ? m.cash_uncertain()
          : m.directory_discard_description(),
        confirmLabel: m.directory_discard(),
        destructive: true,
      }))
    ) {
      approved.current = true;
      await navigate({
        to:
          returnTo && !returnTo.includes("/record-cash") ? returnTo : fallback,
        replace: true,
      });
    }
  };
  const operation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      directoryRequest(path, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => {
      approved.current = true;
      await cache.invalidateQueries({
        queryKey: ["organization", props.user, props.organizationId],
      });
      await navigate({
        to:
          returnTo && !returnTo.includes("/record-cash") ? returnTo : fallback,
        replace: true,
      });
    },
    onError: (e) => {
      if (denied(e)) {
        onDenied(e);
        return;
      }
      if (
        e instanceof DirectoryError &&
        !["service", "rate_limit"].includes(e.code)
      ) {
        attempt.current = null;
        void cache.invalidateQueries({ queryKey: scope });
      }
    },
  });
  const frozen = operation.isPending || !!attempt.current || refreshing,
    dirty = selected.size > 0 || !!amount || !!payer || !!attempt.current;
  useBlocker({
    shouldBlockFn: async () =>
      !approved.current &&
      (operation.isPending ||
        (dirty &&
          !(await confirm({
            title: m.directory_discard(),
            description: attempt.current
              ? m.cash_uncertain()
              : m.directory_discard_description(),
            confirmLabel: m.directory_discard(),
            destructive: true,
          })))),
    enableBeforeUnload: () => !approved.current && dirty,
  });
  const refresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const results = await Promise.all(
        [...selected.values()].map(async (value) => ({
          value,
          result: await directoryRequest<{ item: CashCharge }>(
            path +
              (value.charge.status === "not_charged"
                ? "/participants/" + value.charge.personId
                : "/charges/" + value.charge.id),
          ),
        })),
      );
      setSelected(
        new Map(
          results.map(({ value, result }) => [
            result.item.id,
            { charge: result.item, text: value.text },
          ]),
        ),
      );
    } catch (e) {
      setRefreshError(e);
      if (denied(e)) onDenied(e);
    } finally {
      setRefreshing(false);
    }
  };
  const money = (n: number) => sessionPrice(n, locale);
  let total = 0;
  for (const value of selected.values()) {
    try {
      total += priceFromText(value.text);
    } catch {}
  }
  let received = 0;
  try {
    received = priceFromText(amount);
  } catch {}
  if (initial.isPending && (props.chargeId || props.personId))
    return <ListSkeleton />;
  if (initial.isError)
    return (
      <CollectionError
        error={initial.error}
        retry={() => void initial.refetch()}
      />
    );
  return (
    <FormSurface
      page
      title={m.cash_record()}
      description={summary.name + " · " + m.cash_form_help()}
      onClose={() => void leave()}
    >
      {initial.data?.item.registrationRequired && (
        <p role="alert">{m.billing_required_help()}</p>
      )}
      {!summary.canRecord ? (
        <p role="alert">{m.cash_closed()}</p>
      ) : (
        <form
          className="directory-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!attempt.current) {
              try {
                if (selected.size < 1 || selected.size > 50) throw Error();
                const amountMinor = priceFromText(amount),
                  allocations = [...selected.values()].map(
                    ({ charge, text }) => {
                      const allocated = priceFromText(text);
                      if (
                        charge.reviewRequired ||
                        charge.registrationRequired ||
                        allocated > charge.outstandingMinor
                      )
                        throw Error();
                      return charge.status === "not_charged"
                        ? {
                            personId: charge.personId!,
                            contactVersion: charge.contactVersion!,
                            sessionVersion: charge.sessionVersion!,
                            version: 0,
                            amountMinor: allocated,
                          }
                        : {
                            chargeId: charge.id,
                            version: charge.version,
                            amountMinor: allocated,
                          };
                    },
                  );
                if (
                  allocations.reduce((sum, a) => sum + a.amountMinor, 0) >
                  amountMinor
                )
                  throw Error();
                const occurredAt = zonedInstant(occurred, summary.timezone);
                if (Date.parse(occurredAt) > Date.now() + 300000) throw Error();
                if (
                  !(await confirm({
                    title: m.cash_record(),
                    description:
                      m.cash_confirm({
                        amount: money(amountMinor),
                        allocated: money(total),
                        unallocated: money(amountMinor - total),
                      }) +
                      ([...selected.values()].some(
                        (v) => v.charge.status === "not_charged",
                      )
                        ? " " +
                          m.billing_new_charges({
                            price: money(
                              [...selected.values()]
                                .filter(
                                  (v) => v.charge.status === "not_charged",
                                )
                                .reduce(
                                  (sum, v) => sum + v.charge.amountMinor,
                                  0,
                                ),
                            ),
                          })
                        : ""),
                    confirmLabel: m.cash_record(),
                  }))
                )
                  return;
                attempt.current = {
                  key: crypto.randomUUID(),
                  action: "record",
                  amountMinor,
                  payerLabel: payer,
                  occurredAt,
                  allocations,
                };
                setInvalid(false);
              } catch {
                setInvalid(true);
                return;
              }
            }
            await operation.mutateAsync(attempt.current).catch(() => {});
          }}
        >
          <div>
            <Label htmlFor="cash-amount">{m.cash_received_amount()}</Label>
            <Input
              id="cash-amount"
              inputMode="decimal"
              value={amount}
              required
              disabled={frozen}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <details className="session-help receipt-details">
            <summary>{m.quick_cash_receipt_details()}</summary>
            <div className="directory-form">
              {" "}
              <div>
                <Label htmlFor="cash-payer">{m.cash_payer()}</Label>
                <Input
                  id="cash-payer"
                  value={payer}
                  maxLength={100}
                  disabled={frozen}
                  onChange={(e) => setPayer(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="cash-occurred">{m.cash_occurred()}</Label>
                <Input
                  id="cash-occurred"
                  type="datetime-local"
                  value={occurred}
                  required
                  disabled={frozen}
                  onChange={(e) => setOccurred(e.target.value)}
                />
                <p className="activity-note">
                  {m.activities_timezone({ timezone: summary.timezone })}
                </p>
              </div>
            </div>
          </details>
          <section className="space-y-3" aria-label={m.cash_allocations()}>
            <h2>
              {m.quick_cash_people()} · {selected.size}/50
            </h2>
            {[...selected.values()].map(({ charge, text }) => (
              <div className="cash-allocation" key={charge.id}>
                <Label htmlFor={"cash-allocation-" + charge.id}>
                  {charge.name} ·{" "}
                  {charge.status === "not_charged"
                    ? m.pricing_amount_short()
                    : m.cash_outstanding()}
                  : {money(charge.outstandingMinor)}
                </Label>
                {charge.status === "not_charged" && (
                  <p className="activity-note">
                    {m.billing_charge_on_save({
                      price: money(charge.amountMinor),
                    })}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    id={"cash-allocation-" + charge.id}
                    inputMode="decimal"
                    value={text}
                    required
                    disabled={frozen}
                    onChange={(e) => {
                      const next = new Map(selected);
                      next.set(charge.id, { charge, text: e.target.value });
                      setSelected(next);
                    }}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={m.cash_remove({ name: charge.name })}
                    disabled={frozen}
                    onClick={() => {
                      const next = new Map(selected);
                      next.delete(charge.id);
                      setSelected(next);
                    }}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
            <DirectoryToolbar
              id="cash-options-search"
              label={m.directory_search()}
              value={search}
              onChange={setSearch}
            />
            {options.isPending ? (
              <ListSkeleton />
            ) : options.isError && !options.data ? (
              <CollectionError
                error={options.error}
                retry={() => void options.refetch()}
              />
            ) : (
              <>
                <DirectoryList label={m.cash_choose_contacts()}>
                  {options.data?.pages
                    .flatMap((p) => p.items)
                    .map((charge) => (
                      <DirectoryItem key={charge.id}>
                        <Label className="cash-option">
                          <Checkbox
                            checked={selected.has(charge.id)}
                            disabled={
                              frozen ||
                              (!selected.has(charge.id) && selected.size >= 50)
                            }
                            onCheckedChange={(checked) => {
                              const next = new Map(selected);
                              if (checked) {
                                next.set(charge.id, {
                                  charge,
                                  text: (charge.outstandingMinor / 100).toFixed(
                                    2,
                                  ),
                                });
                                if (!amount && !selected.size)
                                  setAmount(
                                    (charge.outstandingMinor / 100).toFixed(2),
                                  );
                              } else next.delete(charge.id);
                              setSelected(next);
                            }}
                          />
                          <span>
                            {charge.name} · {money(charge.outstandingMinor)}
                          </span>
                        </Label>
                      </DirectoryItem>
                    ))}
                </DirectoryList>
                <InfiniteFooter {...options} />
              </>
            )}
          </section>
          <p className="cash-allocation-total">
            {m.cash_applied()}: {money(total)} · {m.cash_unallocated()}:{" "}
            {money(received - total)}
          </p>
          {(invalid || received < total) && (
            <p role="alert">{m.cash_validation()}</p>
          )}
          {!!refreshError && <CollectionError error={refreshError} />}
          {operation.isError && (
            <>
              <CollectionError error={operation.error} />
              {!attempt.current && (
                <ActionButton
                  type="button"
                  variant="outline"
                  pending={refreshing}
                  onClick={() => void refresh()}
                >
                  {m.cash_refresh()}
                </ActionButton>
              )}
            </>
          )}
          {attempt.current && !operation.isPending && (
            <p role="alert">{m.cash_uncertain()}</p>
          )}
          <div className="directory-actions">
            <Button
              type="button"
              variant="outline"
              disabled={operation.isPending}
              onClick={() => void leave()}
            >
              <X aria-hidden="true" />
              {m.cancel()}
            </Button>
            <ActionButton
              type="submit"
              pending={operation.isPending}
              disabled={refreshing || !selected.size}
            >
              <Save aria-hidden="true" />
              {attempt.current ? m.try_again() : m.cash_record()}
            </ActionButton>
          </div>
        </form>
      )}
    </FormSurface>
  );
}
