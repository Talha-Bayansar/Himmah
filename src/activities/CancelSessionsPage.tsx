import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useBlocker,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { Ban, CalendarDays, X } from "lucide-react";
import { directoryRequest, DirectoryError } from "../community/client";
import { FormSurface } from "../components/shared/form-surface";
import { formReturn } from "../components/shared/form-navigation";
import { useConfirmation } from "../components/shared/confirmation";
import { ListSkeleton } from "../components/shared/infinite-list";
import { ActionButton } from "../components/shared/action-button";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import type { Organization } from "../organization/contracts";
import { ErrorNotice } from "./Activities";
import { sessionPrice, sessionTitle } from "./contracts";
import { cancellationTotals, type CancellationPreview } from "./cancellation";
type Command = {
  anchor: string;
  scope: string;
  snapshot: string;
  reason: string;
  key: string;
};
export function CancelSessionsPage({
  user,
  organization,
  recordId,
}: {
  user: string;
  organization: Organization;
  recordId: string;
}) {
  const search = useRouterState({
    select: (s) => s.location.search as { session?: string; returnTo?: string },
  });
  const navigate = useNavigate(),
    cache = useQueryClient(),
    confirm = useConfirmation(),
    locale = useLocale()?.locale ?? "en";
  const [scope, setScope] = useState("one"),
    [reason, setReason] = useState(""),
    [command, setCommand] = useState<Command | null>(null),
    [reviewing, setReviewing] = useState(false);
  const [accessError, setAccessError] = useState<unknown>(null);
  const approved = useRef(false),
    org = organization.id,
    base = `/api/organizations/${org}/activities/${recordId}/sessions`;
  const safeReturn = formReturn(search.returnTo, org);
  const close = () =>
    void navigate({
      to: safeReturn ?? `/workspace/${org}/activities/${recordId}`,
      replace: true,
    });
  const allowed = ["owner", "admin"].includes(organization.role);
  const preview = useQuery({
    queryKey: [
      "organization",
      user,
      org,
      "cancellation-preview",
      recordId,
      search.session,
      scope,
    ],
    enabled: allowed && !command && !accessError,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      directoryRequest<CancellationPreview>(
        base +
          `?cancellationPreview=${encodeURIComponent(search.session ?? "")}&scope=${scope}`,
        { signal },
      ),
  });
  const save = useMutation({
    mutationFn: async (value: Command) => {
      await directoryRequest(base + "?cancelPlan=true", {
        method: "POST",
        body: JSON.stringify(value),
      });
      approved.current = true;
      await cache.invalidateQueries({ queryKey: ["organization", user, org] });
    },
    onSuccess: close,
  });
  const dirty = !!reason.trim() || scope !== "one" || !!command;
  const canLeave = async () =>
    !dirty ||
    (await confirm({
      title: m.directory_discard(),
      description:
        command && !save.isSuccess
          ? m.cancellation_uncertain()
          : m.directory_discard_description(),
      confirmLabel: m.directory_discard(),
      destructive: true,
    }));
  useBlocker({
    shouldBlockFn: async () =>
      !approved.current && (save.isPending || reviewing || !(await canLeave())),
    enableBeforeUnload: () => !approved.current && dirty,
  });
  const cancel = async () => {
    if (!save.isPending && !reviewing && (await canLeave())) {
      approved.current = true;
      close();
    }
  };
  const cancelLabel = (count: number) =>
    count === 1
      ? m.sessions_cancel()
      : m.cancellation_cancel_count({ count: String(count) });
  const submit = async () => {
    if (command) {
      save.mutate(command);
      return;
    }
    if (
      !preview.data ||
      preview.isFetching ||
      !reason.trim() ||
      !search.session
    )
      return;
    const reviewed = preview.data;
    const value = {
      anchor: search.session,
      scope,
      snapshot: reviewed.snapshot,
      reason: reason.trim(),
      key: crypto.randomUUID(),
    };
    setReviewing(true);
    try {
      const totals = cancellationTotals(reviewed);
      if (
        await confirm({
          title:
            reviewed.items.length === 1
              ? m.cancellation_confirm_one()
              : m.cancellation_confirm({
                  count: String(reviewed.items.length),
                }),
          description: m.cancellation_confirm_help({
            count: String(reviewed.items.length),
            registrations: String(totals.registrations),
            money: sessionPrice(totals.collectedMinor, locale),
          }),
          confirmLabel: cancelLabel(reviewed.items.length),
          destructive: true,
        })
      ) {
        setCommand(value);
        save.mutate(value);
      }
    } finally {
      setReviewing(false);
    }
  };
  const conflict =
    save.error instanceof DirectoryError && save.error.code === "conflict";
  const denied = [preview.error, save.error].find(
    (e) =>
      e instanceof DirectoryError &&
      ["forbidden", "not_found", "sign_in", "verify_required"].includes(e.code),
  );
  useEffect(() => {
    if (!denied) return;
    setAccessError(denied);
    const privateKey = ["organization", user, org];
    const privateChildren = {
      queryKey: privateKey,
      predicate: (q: { queryKey: readonly unknown[] }) =>
        q.queryKey.length > privateKey.length,
    };
    void cache.cancelQueries(privateChildren);
    cache.removeQueries(privateChildren);
  }, [denied, cache, user, org]);
  if (!allowed) return <p role="alert">{m.people_denied()}</p>;
  if (accessError || denied)
    return <ErrorNotice error={accessError || denied} />;
  const data = preview.data,
    totals = data ? cancellationTotals(data) : null;
  const busy = save.isPending || reviewing,
    locked = !!command || busy;
  return (
    <FormSurface
      page
      title={m.cancellation_title()}
      description={m.cancellation_help()}
      onClose={() => void cancel()}
    >
      {save.isError && <ErrorNotice error={save.error} />}
      <form
        className="directory-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {data?.seriesId && (
          <div>
            <Label htmlFor="cancel-scope">{m.series_scope()}</Label>
            <NativeSelect
              id="cancel-scope"
              value={scope}
              disabled={locked || preview.isFetching}
              onChange={(e) => setScope(e.target.value)}
            >
              <NativeSelectOption value="one">
                {m.series_one()}
              </NativeSelectOption>
              <NativeSelectOption value="future">
                {m.series_future()}
              </NativeSelectOption>
            </NativeSelect>
          </div>
        )}
        {preview.isPending ? (
          <ListSkeleton />
        ) : preview.isError ? (
          <ErrorNotice
            error={preview.error}
            retry={() => void preview.refetch()}
            pending={preview.isFetching}
          />
        ) : (
          data && (
            <>
              <div>
                <h2>
                  {data.items.length === 1
                    ? m.cancellation_single()
                    : m.series_preview_count({
                        count: String(data.items.length),
                      })}
                </h2>
                <p className="activity-note">{m.cancellation_skipped()}</p>
              </div>
              {totals && (
                <dl className="session-stat-grid">
                  <div>
                    <dt>{m.registration_title()}</dt>
                    <dd>{totals.registrations}</dd>
                  </div>
                  {totals.charges > 0 && (
                    <div>
                      <dt>{m.cancellation_charges()}</dt>
                      <dd>{totals.charges}</dd>
                    </div>
                  )}
                  {totals.attendance > 0 && (
                    <div>
                      <dt>{m.attendance_present()}</dt>
                      <dd>{totals.attendance}</dd>
                    </div>
                  )}
                  {totals.collectedMinor > 0 && (
                    <div>
                      <dt>{m.cash_collected()}</dt>
                      <dd>{sessionPrice(totals.collectedMinor, locale)}</dd>
                    </div>
                  )}
                </dl>
              )}
              {totals && (totals.charges > 0 || totals.collectedMinor > 0) && (
                <p className="activity-status" role="note">
                  {m.cancellation_money_review()}
                </p>
              )}
              <ol className="schedule-preview">
                {data.items.map((item) => (
                  <li key={item.id}>
                    <CalendarDays size={20} aria-hidden="true" />
                    <div>
                      <strong>{sessionTitle(item)}</strong>
                      <p>
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: item.timezone,
                        }).formatRange(
                          new Date(item.startsAt),
                          new Date(item.endsAt),
                        )}
                      </p>
                      {item.collectedMinor > 0 && (
                        <p className="activity-note">
                          {m.cash_collected()}:{" "}
                          {sessionPrice(item.collectedMinor, locale)}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )
        )}
        <div>
          <Label htmlFor="cancellation-reason">{m.cancellation_reason()}</Label>
          <Textarea
            id="cancellation-reason"
            value={reason}
            maxLength={300}
            required
            disabled={locked}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {command && save.isError && !conflict && (
          <p role="status">{m.cancellation_uncertain()}</p>
        )}
        {conflict ? (
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              setCommand(null);
              save.reset();
              await preview.refetch();
            }}
          >
            {m.series_refresh()}
          </Button>
        ) : (
          <div className="directory-actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void cancel()}
            >
              <X aria-hidden="true" size={16} />
              {m.cancellation_keep()}
            </Button>
            <ActionButton
              type="submit"
              variant="destructive"
              pending={busy}
              disabled={
                !data || preview.isError || preview.isFetching || !reason.trim()
              }
            >
              <Ban size={16} aria-hidden="true" />
              {command
                ? m.cancellation_retry()
                : data
                  ? cancelLabel(data.items.length)
                  : m.cancellation_title()}
            </ActionButton>
          </div>
        )}
      </form>
    </FormSurface>
  );
}
