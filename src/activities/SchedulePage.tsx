import { useEffect, useRef, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useBlocker,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { CalendarDays, Save, X } from "lucide-react";
import {
  directoryRequest,
  DirectoryError,
  directoryMessage,
} from "../community/client";
import { FormSurface } from "../components/shared/form-surface";
import { formReturn } from "../components/shared/form-navigation";
import { useConfirmation } from "../components/shared/confirmation";
import { ListSkeleton } from "../components/shared/infinite-list";
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
import { m } from "../paraglide/messages.js";
import type { Organization } from "../organization/contracts";
import { ErrorNotice } from "./Activities";
import {
  localTime,
  priceFromText,
  sessionPrice,
  type Activity,
} from "./contracts";
import {
  rescheduleOccurrences,
  scheduleTimes,
  shiftLocal,
  validateOccurrences,
  weeklyOccurrences,
  type Occurrence,
  type ScheduleRow,
} from "./recurrence";

type Row = ScheduleRow & { seriesId?: string | null };
export function SchedulePage({
  user,
  organization,
  recordId,
  form,
}: {
  user: string;
  organization: Organization;
  recordId: string;
  form: string;
}) {
  const search = useRouterState({
    select: (s) => s.location.search as { session?: string; returnTo?: string },
  });
  const editing = form === "session-schedule";
  const base = `/api/organizations/${organization.id}/activities/${recordId}`;
  const query = useQuery({
    queryKey: [
      "organization",
      user,
      organization.id,
      "schedule-form",
      recordId,
      search.session,
    ],
    enabled: ["owner", "admin"].includes(organization.role),
    retry: false,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const activity = await directoryRequest<{ item: Activity }>(base, {
        signal,
      });
      const rows = editing
        ? await directoryRequest<{ items: Row[] }>(
            base +
              "/sessions?schedule=" +
              encodeURIComponent(search.session ?? ""),
            { signal },
          )
        : { items: [] };
      if (editing && !rows.items.some((r) => r.id === search.session))
        throw new DirectoryError("session_future");
      return { activity: activity.item, rows: rows.items };
    },
  });
  if (!["owner", "admin"].includes(organization.role))
    return <p role="alert">{m.people_denied()}</p>;
  if (query.isPending) return <ListSkeleton />;
  if (query.isError)
    return (
      <ErrorNotice error={query.error} retry={() => void query.refetch()} />
    );
  if (query.data.activity.cancelled)
    return <p role="alert">{m.directory_registration_closed()}</p>;
  return (
    <ScheduleEditor
      user={user}
      organization={organization}
      activity={query.data.activity}
      rows={query.data.rows}
      anchorId={search.session}
      editing={editing}
      returnTo={formReturn(search.returnTo, organization.id)}
      refresh={async () => {
        await query.refetch();
      }}
    />
  );
}
export function ScheduleEditor({
  user,
  organization,
  activity,
  rows,
  anchorId,
  editing,
  returnTo,
  refresh,
}: {
  user: string;
  organization: Organization;
  activity: Activity;
  rows: Row[];
  anchorId?: string | undefined;
  editing: boolean;
  returnTo: string | null;
  refresh: () => Promise<void>;
}) {
  const timezone = activity.timezone,
    anchor = rows.find((r) => r.id === anchorId);
  const locale = useLocale()?.locale ?? "en",
    navigate = useNavigate(),
    cache = useQueryClient(),
    confirm = useConfirmation();
  const approved = useRef(false),
    key = useRef(crypto.randomUUID());
  const [review, setReview] = useState<{
    body: Record<string, unknown>;
    dates: (Occurrence & { id?: string })[];
  } | null>(null);
  useEffect(() => {
    // A long date review starts at the context and first occurrence without moving keyboard focus.
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" });
  }, [review]);
  const [validation, setValidation] = useState<string | null>(null),
    [attempted, setAttempted] = useState(false);
  const close = () =>
    void navigate({
      to: returnTo ?? `/workspace/${organization.id}/activities/${activity.id}`,
      replace: true,
    });
  const save = useMutation({
    mutationFn: async () => {
      await directoryRequest(
        `/api/organizations/${organization.id}/activities/${activity.id}/sessions?plan=true`,
        {
          method: "POST",
          body: JSON.stringify({ ...review!.body, key: key.current }),
        },
      );
      approved.current = true;
      await cache.invalidateQueries({
        queryKey: ["organization", user, organization.id],
      });
    },
    onSuccess: close,
  });
  const form = useForm({
    defaultValues: {
      startLocal: anchor ? localTime(anchor.startsAt, timezone) : "",
      endLocal: anchor ? localTime(anchor.endsAt, timezone) : "",
      weekdays: [] as number[],
      stop: "count",
      count: "8",
      until: "",
      location: activity.location,
      paid: (activity.priceMinor ?? 0) > 0,
      price: ((activity.priceMinor ?? 0) / 100).toFixed(2),
      scope: "one",
    },
    onSubmit: async ({ value }) => {
      try {
        let dates: (Occurrence & { id?: string; version?: number })[];
        if (editing) {
          if (!anchor) throw new DirectoryError("session_future");
          dates = rescheduleOccurrences(
            value.scope === "future" ? rows : [anchor],
            anchor,
            value.startLocal,
            value.endLocal,
          );
        } else
          dates = weeklyOccurrences(
            value.startLocal,
            value.endLocal,
            value.weekdays,
            value.stop === "count"
              ? { count: Number(value.count) }
              : { until: value.until },
          );
        validateOccurrences(dates, timezone);
        const priceMinor = value.paid ? priceFromText(value.price) : 0;
        const body = editing
          ? {
              mode: "edit",
              anchor: anchorId,
              scope: value.scope,
              occurrences: dates,
            }
          : {
              mode: "create",
              version: activity.version,
              location: value.location,
              priceMinor,
              rule: {
                startLocal: value.startLocal,
                endLocal: value.endLocal,
                weekdays: value.weekdays,
                stop:
                  value.stop === "count"
                    ? { count: Number(value.count) }
                    : { until: value.until },
              },
              occurrences: dates,
            };
        setValidation(null);
        setReview({ body, dates });
      } catch (error) {
        setValidation(
          error instanceof Error
            ? directoryMessage(new DirectoryError(error.message))
            : m.directory_invalid_input(),
        );
      }
    },
  });
  const dirty = useStore(form.store, (s) => s.isDirty);
  const canLeave = async () =>
    (!dirty && !attempted) ||
    (await confirm({
      title: m.directory_discard(),
      description:
        attempted && !save.isSuccess
          ? m.series_uncertain()
          : m.directory_discard_description(),
      confirmLabel: m.directory_discard(),
      destructive: true,
    }));
  useBlocker({
    shouldBlockFn: async () =>
      !approved.current && (save.isPending || !(await canLeave())),
    enableBeforeUnload: () => !approved.current && (dirty || attempted),
  });
  const cancel = async () => {
    if (!save.isPending && (await canLeave())) {
      approved.current = true;
      close();
    }
  };
  const dateLabel = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  const intervalLabel = (startsAt: string, endsAt: string) =>
    dateLabel(startsAt) +
    " – " +
    (localTime(startsAt, timezone).slice(0, 10) ===
    localTime(endsAt, timezone).slice(0, 10)
      ? new Intl.DateTimeFormat(locale, {
          timeStyle: "short",
          timeZone: timezone,
        }).format(new Date(endsAt))
      : dateLabel(endsAt));
  const conflict =
    save.error instanceof DirectoryError &&
    ["conflict", "session_future", "registration_locked"].includes(
      save.error.code,
    );
  return (
    <FormSurface
      page
      title={editing ? m.series_change_schedule() : m.series_plan()}
      description={editing ? m.series_edit_help() : m.series_help()}
      onClose={() => void cancel()}
    >
      <div className="schedule-context">
        <p className="activity-status">{activity.name}</p>
        <p className="activity-note">{m.activities_timezone({ timezone })}</p>
      </div>
      {save.isError && <ErrorNotice error={save.error} />}
      {validation && <p role="alert">{validation}</p>}
      {review ? (
        <div className="directory-form">
          <h2>
            {m.series_preview_count({ count: String(review.dates.length) })}
          </h2>
          {!editing && (
            <div className="session-registration-summary">
              {!!review.body.location && <p>{String(review.body.location)}</p>}
              <p>
                {Number(review.body.priceMinor) > 0
                  ? m.pricing_per_session({
                      price: sessionPrice(
                        Number(review.body.priceMinor),
                        locale,
                      ),
                    })
                  : m.series_free()}
              </p>
            </div>
          )}
          <ol className="schedule-preview">
            {review.dates.map((date, index) => {
              const old = rows.find((r) => r.id === date.id);
              return (
                <li key={date.id ?? index}>
                  <CalendarDays size={20} aria-hidden="true" />
                  <div>
                    {old && (
                      <p className="activity-note">
                        {m.series_old_date()}:{" "}
                        {intervalLabel(old.startsAt, old.endsAt)}
                      </p>
                    )}
                    <p>
                      {old && `${m.series_new_date()}: `}
                      {intervalLabel(
                        scheduleTimes(date, timezone).startsAt,
                        scheduleTimes(date, timezone).endsAt,
                      )}
                    </p>
                    {old?.topic && <p className="activity-note">{old.topic}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
          {attempted && save.isError && !conflict && (
            <p role="status">{m.series_uncertain()}</p>
          )}
          {conflict ? (
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={async () => {
                await refresh();
                setReview(null);
                setAttempted(false);
                key.current = crypto.randomUUID();
                save.reset();
              }}
            >
              {m.series_refresh()}
            </Button>
          ) : (
            <>
              {!attempted && (
                <Button variant="outline" onClick={() => setReview(null)}>
                  {m.series_back_edit()}
                </Button>
              )}
              <div className="directory-actions">
                <Button
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() => void cancel()}
                >
                  <X size={16} />
                  {m.cancel()}
                </Button>
                <ActionButton
                  pending={save.isPending}
                  onClick={() => {
                    setAttempted(true);
                    save.mutate();
                  }}
                >
                  <Save size={16} aria-hidden="true" />
                  {attempted
                    ? m.series_retry()
                    : editing
                      ? m.series_save({ count: String(review.dates.length) })
                      : m.series_create({ count: String(review.dates.length) })}
                </ActionButton>
              </div>
            </>
          )}
        </div>
      ) : (
        <form
          className="directory-form activity-form"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          {editing && anchor?.seriesId && (
            <form.Field name="scope">
              {(field) => (
                <div>
                  <Label htmlFor="schedule-scope">{m.series_scope()}</Label>
                  <NativeSelect
                    id="schedule-scope"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
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
            </form.Field>
          )}
          {(["startLocal", "endLocal"] as const).map((name) => (
            <form.Field name={name} key={name}>
              {(field) => (
                <div>
                  <Label htmlFor={"schedule-" + name}>
                    {name === "startLocal"
                      ? m.activities_start()
                      : m.activities_end()}
                  </Label>
                  <Input
                    id={"schedule-" + name}
                    type="datetime-local"
                    required
                    value={field.state.value}
                    onChange={(e) => {
                      field.handleChange(e.target.value);
                      if (name === "startLocal") {
                        form.setFieldValue(
                          "endLocal",
                          e.target.value
                            ? shiftLocal(e.target.value, 3600000)
                            : "",
                        );
                        if (!editing) {
                          form.setFieldValue(
                            "weekdays",
                            e.target.value
                              ? [new Date(e.target.value + "Z").getUTCDay()]
                              : [],
                          );
                        }
                      }
                    }}
                  />
                </div>
              )}
            </form.Field>
          ))}
          {!editing && (
            <>
              <form.Field name="weekdays">
                {(field) => (
                  <fieldset className="schedule-weekdays">
                    <legend>{m.series_days()}</legend>
                    {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                      <label className="directory-check" key={day}>
                        <Checkbox
                          checked={field.state.value.includes(day)}
                          onCheckedChange={(v) =>
                            field.handleChange(
                              v === true
                                ? [...field.state.value, day]
                                : field.state.value.filter((d) => d !== day),
                            )
                          }
                        />
                        {new Intl.DateTimeFormat(locale, {
                          weekday: "long",
                          timeZone: "UTC",
                        }).format(new Date(Date.UTC(2026, 10, 1 + day)))}
                      </label>
                    ))}
                  </fieldset>
                )}
              </form.Field>
              <form.Field name="stop">
                {(field) => (
                  <div>
                    <Label htmlFor="schedule-stop">{m.series_stop()}</Label>
                    <NativeSelect
                      id="schedule-stop"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    >
                      <NativeSelectOption value="count">
                        {m.series_after()}
                      </NativeSelectOption>
                      <NativeSelectOption value="until">
                        {m.series_until()}
                      </NativeSelectOption>
                    </NativeSelect>
                    <form.Subscribe selector={(s) => s.values.stop}>
                      {(stop) =>
                        stop === "count" ? (
                          <form.Field name="count">
                            {(f) => (
                              <div>
                                <Label htmlFor="schedule-count">
                                  {m.series_count()}
                                </Label>
                                <Input
                                  id="schedule-count"
                                  type="number"
                                  min={2}
                                  max={52}
                                  required
                                  value={f.state.value}
                                  onChange={(e) =>
                                    f.handleChange(e.target.value)
                                  }
                                />
                              </div>
                            )}
                          </form.Field>
                        ) : (
                          <form.Field name="until">
                            {(f) => (
                              <div>
                                <Label htmlFor="schedule-until">
                                  {m.series_until_date()}
                                </Label>
                                <Input
                                  id="schedule-until"
                                  type="date"
                                  required
                                  value={f.state.value}
                                  onChange={(e) =>
                                    f.handleChange(e.target.value)
                                  }
                                />
                              </div>
                            )}
                          </form.Field>
                        )
                      }
                    </form.Subscribe>
                  </div>
                )}
              </form.Field>
              <p className="activity-note">{m.series_bound()}</p>
              <form.Field name="location">
                {(field) => (
                  <div>
                    <Label htmlFor="schedule-location">
                      {m.activities_location()}
                    </Label>
                    <Input
                      id="schedule-location"
                      maxLength={160}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="paid">
                {(field) => (
                  <div>
                    <Label htmlFor="schedule-paid" className="directory-check">
                      <Checkbox
                        id="schedule-paid"
                        checked={field.state.value}
                        onCheckedChange={(v) => field.handleChange(v === true)}
                      />
                      {m.pricing_paid()}
                    </Label>
                    {field.state.value && (
                      <form.Field name="price">
                        {(price) => (
                          <div>
                            <Label htmlFor="schedule-price">
                              {m.pricing_amount()}
                            </Label>
                            <Input
                              id="schedule-price"
                              inputMode="decimal"
                              required
                              value={price.state.value}
                              onChange={(e) =>
                                price.handleChange(e.target.value)
                              }
                            />
                          </div>
                        )}
                      </form.Field>
                    )}
                    <p className="activity-note">{m.series_price_help()}</p>
                  </div>
                )}
              </form.Field>
            </>
          )}
          <div className="directory-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => void cancel()}
            >
              <X size={16} aria-hidden="true" />
              {m.cancel()}
            </Button>
            <Button type="submit">
              <CalendarDays size={16} aria-hidden="true" />
              {m.series_preview()}
            </Button>
          </div>
        </form>
      )}
    </FormSurface>
  );
}
