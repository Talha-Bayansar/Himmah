import { useRef, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { Coins, X, ArrowLeft, CalendarDays } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { ActionButton } from "../components/shared/action-button";
import { useConfirmation } from "../components/shared/confirmation";
import { directoryRequest, DirectoryError } from "../community/client";
import { localTime } from "../activities/contracts";
import type { Organization } from "../organization/contracts";
import { getLocale } from "../paraglide/runtime.js";
import { m } from "../paraglide/messages.js";
import { PointsOptions, type PointsOption } from "./PointsOptions";
import { PointsError } from "./PointsShared";
import type { PointsEntry, PointsResult } from "./contracts";
export function PointsEditor({
  organization,
  userId,
  member,
  groupId,
  correction,
  onClose,
  onSaved,
}: {
  organization: Organization;
  userId: string;
  member?: PointsOption;
  groupId?: string;
  correction?: PointsEntry;
  onClose: () => void;
  onSaved: (result: PointsResult) => Promise<void>;
}) {
  const confirm = useConfirmation();
  const [selected, setSelected] = useState(
    () => new Map(member ? [[member.id, member]] : []),
  );
  const [step, setStep] = useState(member ? "form" : "members");
  const [reference, setReference] = useState<"activity" | "session" | null>(
    null,
  );
  const [view, setView] = useState<"past" | "upcoming">("past");
  const attempt = useRef<Record<string, unknown> | null>(null);
  const base = "/api/organizations/" + organization.id;
  const scope = ["organization", userId, organization.id, "points"];
  const form = useForm({
    defaultValues: {
      amount: correction ? String(correction.currentAmount) : "",
      reason: "",
      occurredLocal: localTime(new Date().toISOString(), organization.timezone),
      activity: null as PointsOption | null,
      session: null as PointsOption | null,
    },
    onSubmit: async ({ value }) => {
      if (!attempt.current) {
        const accepted = await confirm({
          title: correction ? m.points_correct() : m.points_review(),
          description: correction
            ? m.points_correct_help()
            : m.points_review_help({
                amount: value.amount,
                count: selected.size,
                total: String(Number(value.amount) * selected.size),
              }),
          confirmLabel: correction ? m.points_correct() : m.points_award(),
          destructive: !!correction,
        });
        if (!accepted) return;
        attempt.current = {
          key: crypto.randomUUID(),
          kind: correction ? "correct" : "award",
          people: [...selected.keys()].sort(),
          amount: Number(value.amount),
          reason: value.reason.trim(),
          occurredLocal: value.occurredLocal,
          activityId: correction ? null : (value.activity?.id ?? null),
          sessionId: correction ? null : (value.session?.id ?? null),
          ...(correction
            ? { originalId: correction.id, version: correction.version }
            : {}),
        };
      }
      await submit.mutateAsync(attempt.current).catch(() => {});
    },
  });
  const submit = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      directoryRequest<PointsResult>(base + "/points", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: onSaved,
    onError: (error) => {
      // Known validation/authorization failures cannot have committed; uncertain responses retain the exact request.
      if (
        error instanceof DirectoryError &&
        [
          "points_amount",
          "points_reason",
          "points_date",
          "activity_time",
          "invalid_input",
          "not_found",
          "forbidden",
          "verify_required",
        ].includes(error.code)
      )
        attempt.current = null;
    },
  });
  const dirty = useStore(form.store, (state) => state.isDirty);
  const values = useStore(form.store, (state) => state.values);
  const frozen = submit.isPending || !!attempt.current;
  const canLeave = async () =>
    submit.isSuccess ||
    (!dirty && selected.size === (member ? 1 : 0) && !attempt.current) ||
    (await confirm({
      title: attempt.current ? m.points_leave() : m.directory_discard(),
      description: attempt.current
        ? m.points_leave_help()
        : m.directory_discard_description(),
      confirmLabel: attempt.current ? m.points_leave() : m.directory_discard(),
      destructive: true,
    }));
  useBlocker({
    shouldBlockFn: async () => submit.isPending || !(await canLeave()),
    enableBeforeUnload:
      dirty || selected.size > (member ? 1 : 0) || !!attempt.current,
  });
  const close = async () => {
    if (!submit.isPending && (await canLeave())) onClose();
  };
  const scopeFor = (key: string) => [...scope, "options", key];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {correction
              ? m.points_correct()
              : step === "members"
                ? m.points_recipients()
                : m.points_award()}
          </DialogTitle>
          <DialogDescription>
            {correction ? m.points_correct_help() : m.points_help()}
          </DialogDescription>
        </DialogHeader>
        {submit.isError && <PointsError error={submit.error} />}
        {attempt.current && submit.isError && (
          <p role="status">{m.points_leave_help()}</p>
        )}
        {step === "members" ? (
          <>
            <p role="status">
              {m.directory_selected_count({ count: selected.size })}
            </p>
            <PointsOptions
              path={
                base +
                (organization.role === "volunteer"
                  ? "/work/members"
                  : "/people") +
                (groupId ? "?group=" + groupId : "")
              }
              scope={scopeFor("people/" + (groupId ?? "all"))}
              selected={selected}
              multiple
              onToggle={(item) =>
                setSelected((previous) => {
                  const next = new Map(previous);
                  if (next.has(item.id)) next.delete(item.id);
                  else if (next.size < 50) next.set(item.id, item);
                  return next;
                })
              }
            />
            <div className="directory-actions">
              <Button
                variant="outline"
                onClick={() => {
                  void close();
                }}
              >
                <X aria-hidden="true" />
                {m.cancel()}
              </Button>
              <Button disabled={!selected.size} onClick={() => setStep("form")}>
                <Coins aria-hidden="true" />
                {m.points_continue({ count: selected.size })}
              </Button>
            </div>
          </>
        ) : (
          <form
            className="directory-form"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <div className="points-selected-summary">
              <strong>
                {member?.name ??
                  m.directory_selected_count({ count: selected.size })}
              </strong>
              {!member && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={frozen}
                  onClick={() => setStep("members")}
                >
                  <ArrowLeft aria-hidden="true" />
                  {m.points_change_members()}
                </Button>
              )}
            </div>
            <form.Field name="amount">
              {(field) => (
                <div>
                  <Label htmlFor="points-amount">
                    {correction ? m.points_new_amount() : m.points_amount()}
                  </Label>
                  <Input
                    id="points-amount"
                    type="number"
                    inputMode="numeric"
                    min={correction ? 0 : 1}
                    max={10000}
                    step={1}
                    required
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    disabled={frozen}
                    aria-describedby="points-amount-help"
                  />
                  <p id="points-amount-help">
                    {correction
                      ? m.points_current({ amount: correction.currentAmount })
                      : m.points_amount_help()}
                  </p>
                </div>
              )}
            </form.Field>
            <form.Field name="reason">
              {(field) => (
                <div>
                  <Label htmlFor="points-reason">{m.points_reason()}</Label>
                  <Textarea
                    id="points-reason"
                    required
                    maxLength={300}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    disabled={frozen}
                  />
                </div>
              )}
            </form.Field>
            {!correction && (
              <>
                <form.Field name="occurredLocal">
                  {(field) => (
                    <div>
                      <Label htmlFor="points-date">{m.points_occurred()}</Label>
                      <Input
                        id="points-date"
                        type="datetime-local"
                        required
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        disabled={frozen}
                      />
                      <p>
                        {m.activities_timezone({
                          timezone: organization.timezone,
                        })}
                      </p>
                    </div>
                  )}
                </form.Field>
                <div className="points-reference">
                  <span>{m.points_activity()}</span>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={frozen}
                    onClick={() =>
                      setReference(reference === "activity" ? null : "activity")
                    }
                  >
                    <CalendarDays aria-hidden="true" />
                    {values.activity?.name ?? m.points_choose_activity()}
                  </Button>
                  {values.activity && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={frozen}
                      onClick={() => {
                        form.setFieldValue("activity", null);
                        form.setFieldValue("session", null);
                        setReference(null);
                      }}
                    >
                      <X aria-hidden="true" />
                      {m.points_no_reference()}
                    </Button>
                  )}
                  {reference === "activity" && (
                    <PointsOptions
                      path={base + "/activities"}
                      disabled={frozen}
                      scope={scopeFor("activities")}
                      selected={
                        new Map(
                          values.activity
                            ? [[values.activity.id, values.activity]]
                            : [],
                        )
                      }
                      onToggle={(item) => {
                        form.setFieldValue("activity", item);
                        form.setFieldValue("session", null);
                        setReference(null);
                      }}
                    />
                  )}
                </div>
                {values.activity && (
                  <div className="points-reference">
                    <span>{m.points_session()}</span>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={frozen}
                      onClick={() =>
                        setReference(reference === "session" ? null : "session")
                      }
                    >
                      <CalendarDays aria-hidden="true" />
                      {values.session
                        ? sessionLabel(values.session, organization.timezone)
                        : m.points_choose_session()}
                    </Button>
                    {values.session && (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={frozen}
                        onClick={() => form.setFieldValue("session", null)}
                      >
                        <X aria-hidden="true" />
                        {m.points_no_reference()}
                      </Button>
                    )}
                    {reference === "session" && (
                      <>
                        <div className="directory-actions">
                          <Button
                            type="button"
                            variant={view === "past" ? "default" : "outline"}
                            onClick={() => setView("past")}
                          >
                            {m.sessions_past()}
                          </Button>
                          <Button
                            type="button"
                            variant={
                              view === "upcoming" ? "default" : "outline"
                            }
                            onClick={() => setView("upcoming")}
                          >
                            {m.sessions_upcoming()}
                          </Button>
                        </div>
                        <PointsOptions
                          path={
                            base +
                            "/activities/" +
                            values.activity.id +
                            "/sessions?view=" +
                            view
                          }
                          scope={scopeFor(
                            "sessions/" + values.activity.id + "/" + view,
                          )}
                          disabled={frozen}
                          searchable={false}
                          selected={
                            new Map(
                              values.session
                                ? [[values.session.id, values.session]]
                                : [],
                            )
                          }
                          format={(item) =>
                            sessionLabel(item, organization.timezone)
                          }
                          onToggle={(item) => {
                            form.setFieldValue("session", item);
                            setReference(null);
                          }}
                        />
                      </>
                    )}
                  </div>
                )}
              </>
            )}
            <div className="directory-actions">
              <Button
                type="button"
                variant="outline"
                disabled={submit.isPending}
                onClick={() => {
                  void close();
                }}
              >
                <X aria-hidden="true" />
                {m.cancel()}
              </Button>
              <ActionButton type="submit" pending={submit.isPending}>
                <Coins aria-hidden="true" />
                {submit.isError && attempt.current
                  ? m.try_again()
                  : correction
                    ? m.points_correct()
                    : m.points_award()}
              </ActionButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
function sessionLabel(item: PointsOption, timezone: string) {
  return (
    item.name +
    (item.startsAt
      ? " · " +
        new Intl.DateTimeFormat(getLocale(), {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: timezone,
        }).format(new Date(item.startsAt))
      : "")
  );
}
