import { sessionPrice } from "../activities/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useBlocker } from "@tanstack/react-router";
import { ArrowLeft, Plus, Settings2, UserMinus } from "lucide-react";
import OrganizationPortal from "../organization/OrganizationPortal";
import type { Organization } from "../organization/contracts";
import type { Session } from "../activities/contracts";
import { ErrorNotice } from "../activities/Activities";
import { DirectoryError, directoryRequest } from "../community/client";
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
import {
  RecordOptions,
  type RecordOption,
} from "../components/shared/record-options";
import { FormSurface } from "../components/shared/form-surface";
import { ActionButton } from "../components/shared/action-button";
import { useConfirmation } from "../components/shared/confirmation";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { Card, CardContent } from "../components/ui/card";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import { useSearch } from "../modules/people/shared";
import {
  registrationViews,
  type RegistrationView,
  type RegistrationSummary,
  type RegistrationOption,
  type RegistrationRow,
  type RegistrationEvent,
} from "./contracts";
export type RegistrationFilters = { q: string; view: RegistrationView };
const denied = (error: unknown) =>
  error instanceof DirectoryError &&
  ["forbidden", "not_found", "sign_in", "verify_required"].includes(error.code);
const viewLabel = (view: RegistrationView) =>
  ({
    confirmed: m.registration_confirmed,
    cancelled: m.registration_cancelled,
    expected: m.registration_expected,
    original: m.registration_original,
    history: m.registration_history,
  })[view]();
export default function RegistrationPage({
  organizationId,
  activityId,
  sessionId,
  filters,
  onFiltersChange,
}: {
  organizationId: string;
  activityId: string;
  sessionId: string;
  filters: RegistrationFilters;
  onFiltersChange: (filters: RegistrationFilters) => void;
}) {
  return (
    <OrganizationPortal
      initialMode="signin"
      workspaceId={organizationId}
      workspaceSection="activities"
    >
      {(user, organization) => (
        <Scope
          key={user + organizationId + activityId + sessionId}
          user={user}
          organization={organization}
          activityId={activityId}
          sessionId={sessionId}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      )}
    </OrganizationPortal>
  );
}
function Scope(props: {
  user: string;
  organization: Organization;
  activityId: string;
  sessionId: string;
  filters: RegistrationFilters;
  onFiltersChange: (filters: RegistrationFilters) => void;
}) {
  const cache = useQueryClient(),
    [error, setError] = useState<unknown>(null);
  const report = useCallback(
    (error: unknown) => {
      setError(error);
      const queryKey = [
        "organization",
        props.user,
        props.organization.id,
        "activities",
      ];
      void cache.cancelQueries({ queryKey });
      cache.removeQueries({ queryKey });
    },
    [cache, props.user, props.organization.id],
  );
  return error ? (
    <ErrorNotice error={error} />
  ) : (
    <Content {...props} onDenied={report} />
  );
}
function Content({
  user,
  organization,
  activityId,
  sessionId,
  filters,
  onFiltersChange,
  onDenied,
}: {
  user: string;
  organization: Organization;
  activityId: string;
  sessionId: string;
  filters: RegistrationFilters;
  onFiltersChange: (filters: RegistrationFilters) => void;
  onDenied: (e: unknown) => void;
}) {
  const locale = useLocale()?.locale ?? "en",
    cache = useQueryClient(),
    query = useSearch(filters.q),
    [editor, setEditor] = useState<
      "register" | "configure" | RegistrationRow | null
    >(null);
  const base = `/api/organizations/${organization.id}/activities/${activityId}/sessions/${sessionId}`,
    scope = [
      "organization",
      user,
      organization.id,
      "activities",
      "registrations",
      activityId,
      sessionId,
    ];
  const detail = useQuery({
    queryKey: [...scope, "session"],
    queryFn: ({ signal }) =>
      directoryRequest<{ item: Session }>(base, { signal }),
    retry: false,
  });
  const pages = useInfiniteQuery({
    queryKey: [...scope, filters.view, query],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      directoryRequest<{
        items: (RegistrationRow | RegistrationEvent)[];
        summary: RegistrationSummary;
        nextCursor: string | null;
      }>(
        base +
          "/registrations?view=" +
          filters.view +
          "&q=" +
          encodeURIComponent(query) +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    retry: false,
  });
  useEffect(() => {
    const error = detail.error ?? pages.error;
    if (denied(error)) onDenied(error);
  }, [detail.error, pages.error, onDenied]);
  if (detail.isError)
    return (
      <ErrorNotice error={detail.error} retry={() => void detail.refetch()} />
    );
  if (pages.isError && (!pages.data || denied(pages.error)))
    return (
      <ErrorNotice error={pages.error} retry={() => void pages.refetch()} />
    );
  if (detail.isPending || pages.isPending) return <ListSkeleton />;
  const summary = pages.data!.pages[0]!.summary,
    session = detail.data.item;
  const time = (at: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: session.timezone,
    }).format(new Date(at));
  return (
    <section className="directory registration-page">
      <Button variant="link" className="settings-back" asChild>
        <Link
          to="/workspace/$organizationId/activities/$activityId/sessions/$sessionId"
          params={{ organizationId: organization.id, activityId, sessionId }}
        >
          <ArrowLeft aria-hidden="true" />
          {m.sessions_view()}
        </Link>
      </Button>
      <DirectoryHeader
        title={m.registration_title()}
        description={session.name}
        action={
          summary.canRegister ? (
            <Button
              className="people-section-add"
              aria-label={m.registration_add()}
              onClick={() => setEditor("register")}
            >
              <Plus aria-hidden="true" />
              <span>{m.registration_add()}</span>
            </Button>
          ) : undefined
        }
      />
      <Card density="compact">
        <CardContent className="registration-summary">
          <div className="registration-summary-heading">
            <strong>
              {m.registration_reserved({ count: summary.confirmed })}
            </strong>
          </div>
          <p>
            {summary.capacity === null
              ? m.registration_unlimited()
              : m.registration_seats({
                  capacity: summary.capacity,
                  remaining: summary.remaining ?? 0,
                })}
          </p>
          <p>
            {summary.mode === "required"
              ? m.registration_expected_count({ count: summary.expected ?? 0 })
              : m.registration_optional()}
          </p>
          {summary.frozenAt ? (
            <p>
              {m.registration_frozen({
                time: time(summary.frozenAt),
                count: summary.originalExpected ?? 0,
              })}
            </p>
          ) : summary.mode === "required" ? (
            <p>
              {m.registration_freezes_at({
                time: time(summary.checkInOpensAt),
              })}
            </p>
          ) : null}
          {(summary.priceMinor ?? 0) > 0 && (
            <p>
              {m.pricing_per_session({
                price: sessionPrice(summary.priceMinor!, locale),
              })}
            </p>
          )}
          {summary.canManage && (summary.chargeReviewCount ?? 0) > 0 && (
            <p>
              {m.pricing_review_count({ count: summary.chargeReviewCount! })}
            </p>
          )}
          {summary.canManage && (
            <div className="registration-settings-row">
              <Button
                size="sm"
                variant="outline"
                disabled={!summary.canConfigure}
                aria-describedby={
                  !summary.canConfigure
                    ? "registration-settings-locked"
                    : undefined
                }
                onClick={() => setEditor("configure")}
              >
                <Settings2 aria-hidden="true" />
                {m.registration_settings()}
              </Button>
              {!summary.canConfigure && (
                <p id="registration-settings-locked">
                  {m.registration_settings_locked_help()}
                </p>
              )}
            </div>
          )}
          {summary.cancelled && <p>{m.sessions_cancelled()}</p>}
          {!summary.canManage && <p>{m.registration_scoped()}</p>}
        </CardContent>
      </Card>
      <details className="session-help registration-help">
        <summary>{m.registration_about()}</summary>
        {summary.mode === "open" && <p>{m.registration_open_help()}</p>}
        <p>{m.registration_independent()}</p>
      </details>
      <DirectoryToolbar
        id="registration-search"
        label={m.directory_search()}
        value={filters.q}
        onChange={(q) => onFiltersChange({ ...filters, q })}
      >
        <Label htmlFor="registration-view">{m.registration_view()}</Label>
        <NativeSelect
          id="registration-view"
          value={filters.view}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              view: e.target.value as RegistrationView,
            })
          }
        >
          {registrationViews
            .filter((v) => v !== "history" || summary.canManage)
            .map((v) => (
              <NativeSelectOption key={v} value={v}>
                {viewLabel(v)}
              </NativeSelectOption>
            ))}
        </NativeSelect>
      </DirectoryToolbar>
      <DirectoryList
        label={viewLabel(filters.view)}
        busy={pages.isFetchingNextPage}
      >
        {pages
          .data!.pages.flatMap((p) => p.items)
          .map((item) =>
            filters.view === "history" ? (
              <DirectoryItem key={item.id}>
                <DirectoryRecord
                  name={
                    (item as RegistrationEvent).name ?? viewLabel("history")
                  }
                  detail={
                    <>
                      {m[
                        ("registration_event_" +
                          (item as RegistrationEvent)
                            .action) as "registration_event_register"
                      ]()}{" "}
                      · {time(item.createdAt)}
                      {(item as RegistrationEvent).reason && (
                        <>
                          <br />
                          {(item as RegistrationEvent).reason}
                        </>
                      )}
                    </>
                  }
                />
              </DirectoryItem>
            ) : (
              <DirectoryItem key={item.id}>
                <DirectoryRecord
                  name={item.name!}
                  detail={
                    <>
                      {viewLabel((item as RegistrationRow).status)}
                      {(item as RegistrationRow).source === "walk_in" &&
                        " · " + m.registration_walk_in()}
                      {(item as RegistrationRow).charge && (
                        <>
                          <br />
                          {m.pricing_charge({
                            price: sessionPrice(
                              (item as RegistrationRow).charge!.amountMinor,
                              locale,
                            ),
                          })}
                          {(item as RegistrationRow).charge!.reviewRequired &&
                            " · " + m.pricing_review()}
                        </>
                      )}
                    </>
                  }
                />
                {summary.canManage &&
                  summary.canRegister &&
                  (item as RegistrationRow).status === "confirmed" && (
                    <ItemActions
                      name={item.name!}
                      actions={[
                        {
                          label: m.registration_cancel(),
                          icon: UserMinus,
                          destructive: true,
                          onSelect: () => setEditor(item as RegistrationRow),
                        },
                      ]}
                    />
                  )}
              </DirectoryItem>
            ),
          )}
      </DirectoryList>
      {!pages.data!.pages.some((p) => p.items.length) && (
        <p className="directory-empty">{m.directory_empty()}</p>
      )}
      <InfiniteFooter {...pages} />
      {editor && (
        <Editor
          key={typeof editor === "string" ? editor : editor.id}
          mode={typeof editor === "string" ? editor : "cancel"}
          row={typeof editor === "object" ? editor : null}
          summary={summary}
          path={base + "/registrations"}
          scope={scope}
          onDenied={onDenied}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            await cache.invalidateQueries({ queryKey: scope });
            setEditor(null);
          }}
        />
      )}
    </section>
  );
}
function Editor({
  mode,
  row,
  summary,
  path,
  scope,
  onClose,
  onSaved,
  onDenied,
}: {
  mode: "register" | "configure" | "cancel";
  row: RegistrationRow | null;
  summary: RegistrationSummary;
  path: string;
  scope: readonly unknown[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDenied: (e: unknown) => void;
}) {
  const locale = useLocale()?.locale ?? "en";
  const cache = useQueryClient();
  const confirm = useConfirmation(),
    [opening] = useState(summary),
    [needsReason, setNeedsReason] = useState(!!summary.frozenAt),
    [selected, setSelected] = useState<RegistrationOption | null>(null),
    [policy, setPolicy] = useState(opening.mode),
    [capacity, setCapacity] = useState(opening.capacity?.toString() ?? ""),
    [reason, setReason] = useState(""),
    [invalid, setInvalid] = useState(false),
    attempt = useRef<Record<string, unknown> | null>(null),
    approved = useRef(false);
  const operation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      directoryRequest(path, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: onSaved,
    onError: (error) => {
      if (denied(error)) {
        onDenied(error);
        return;
      }
      if (
        error instanceof DirectoryError &&
        error.code === "registration_reason"
      )
        setNeedsReason(true);
      if (
        error instanceof DirectoryError &&
        error.code !== "service" &&
        error.code !== "rate_limit"
      ) {
        attempt.current = null;
        void cache.invalidateQueries({ queryKey: scope });
      }
    },
  });
  const frozen = operation.isPending || !!attempt.current,
    dirty =
      !!selected ||
      !!reason ||
      policy !== opening.mode ||
      capacity !== (opening.capacity?.toString() ?? "") ||
      !!attempt.current;
  const canLeave = async () =>
    !dirty ||
    operation.isSuccess ||
    (await confirm({
      title: m.directory_discard(),
      description: m.directory_discard_description(),
      confirmLabel: m.directory_discard(),
      destructive: true,
    }));
  const close = async () => {
    if (!operation.isPending && (await canLeave())) {
      approved.current = true;
      onClose();
    }
  };
  useBlocker({
    shouldBlockFn: async () =>
      !approved.current && (operation.isPending || !(await canLeave())),
    enableBeforeUnload: () =>
      !approved.current &&
      !operation.isSuccess &&
      (operation.isPending || dirty),
  });
  async function submit() {
    if (!attempt.current) {
      if (
        (mode === "register" && !selected) ||
        ((mode === "cancel" ||
          (mode === "register" && (needsReason || !!summary.frozenAt))) &&
          !reason.trim())
      ) {
        setInvalid(true);
        return;
      }
      if (
        mode === "register" &&
        (opening.priceMinor ?? 0) > 0 &&
        !(await confirm({
          title: m.registration_add(),
          description: m.pricing_confirm({
            price: sessionPrice(opening.priceMinor!, locale),
          }),
          confirmLabel: m.registration_add(),
        }))
      )
        return;
      if (
        mode === "cancel" &&
        !(await confirm({
          title: m.registration_cancel(),
          description: row!.charge
            ? row!.name + ". " + m.pricing_cancel_review()
            : row!.name,
          confirmLabel: m.registration_cancel(),
          destructive: true,
        }))
      )
        return;
      attempt.current = {
        key: crypto.randomUUID(),
        action: mode,
        ...(mode === "configure"
          ? {
              version: opening.version,
              mode: policy,
              capacity: capacity === "" ? null : Number(capacity),
            }
          : {
              personId: mode === "cancel" ? row!.personId : selected!.id,
              version: mode === "cancel" ? row!.version : selected!.version,
              reason: reason.trim(),
              ...(mode === "register"
                ? {
                    contactVersion: selected!.contactVersion,
                    ...(opening.sessionVersion !== undefined
                      ? { sessionVersion: opening.sessionVersion }
                      : {}),
                  }
                : {}),
            }),
      };
    }
    await operation.mutateAsync(attempt.current).catch(() => {});
  }
  return (
    <FormSurface
      title={
        mode === "configure"
          ? m.registration_settings()
          : mode === "cancel"
            ? m.registration_cancel()
            : m.registration_add()
      }
      description={
        mode === "configure"
          ? m.registration_policy_help()
          : mode === "cancel"
            ? row!.name
            : m.registration_add_help()
      }
      onClose={() => void close()}
    >
      <form
        className="directory-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!operation.isPending) void submit();
        }}
      >
        {mode === "configure" ? (
          <>
            <div>
              <Label htmlFor="registration-mode">{m.registration_mode()}</Label>
              <NativeSelect
                id="registration-mode"
                value={policy}
                disabled={frozen}
                onChange={(e) => setPolicy(e.target.value as typeof policy)}
              >
                <NativeSelectOption value="open">
                  {m.registration_optional()}
                </NativeSelectOption>
                <NativeSelectOption value="required">
                  {m.registration_required()}
                </NativeSelectOption>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="registration-capacity">
                {m.registration_capacity()}
              </Label>
              <Input
                id="registration-capacity"
                type="number"
                inputMode="numeric"
                min={1}
                max={100000}
                step={1}
                value={capacity}
                disabled={frozen}
                onChange={(e) => setCapacity(e.target.value)}
              />
              <p>{m.registration_capacity_help()}</p>
            </div>
          </>
        ) : mode === "register" ? (
          <RecordOptions
            path={path + "/options"}
            scope={[...scope, "options"]}
            selected={
              new Map<string, RecordOption>(
                selected ? [[selected.id, selected]] : [],
              )
            }
            onToggle={(item) =>
              setSelected(
                selected?.id === item.id ? null : (item as RegistrationOption),
              )
            }
            disabled={frozen}
          />
        ) : null}
        {(mode === "cancel" ||
          (mode === "register" && (needsReason || !!summary.frozenAt))) && (
          <div>
            <Label htmlFor="registration-reason">
              {m.registration_reason_label()}
            </Label>
            <Textarea
              id="registration-reason"
              required
              maxLength={300}
              disabled={frozen}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        )}
        {invalid && <p role="alert">{m.registration_selection_required()}</p>}
        {operation.isError && <ErrorNotice error={operation.error} />}
        {attempt.current && operation.isError && (
          <p>{m.registration_uncertain()}</p>
        )}
        <div className="directory-actions">
          <Button
            type="button"
            variant="outline"
            disabled={operation.isPending}
            onClick={() => void close()}
          >
            {m.cancel()}
          </Button>
          <ActionButton
            type="submit"
            pending={operation.isPending}
            variant={mode === "cancel" ? "destructive" : "default"}
          >
            {attempt.current && operation.isError
              ? m.try_again()
              : m.directory_save()}
          </ActionButton>
        </div>
      </form>
    </FormSurface>
  );
}
