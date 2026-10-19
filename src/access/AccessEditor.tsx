import { useRef, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { Save, X, Users, CalendarDays, UserCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Label } from "../components/ui/label";
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
import { PointsError } from "../points/PointsShared";
import { PointsOptions, type PointsOption } from "../points/PointsOptions";
import { m } from "../paraglide/messages.js";
import type { AccessAssignment } from "./contracts";
export function AccessEditor({
  base,
  scope,
  assignment,
  onClose,
  onSaved,
}: {
  base: string;
  scope: readonly unknown[];
  assignment?: AccessAssignment;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const confirm = useConfirmation(),
    attempt = useRef<Record<string, unknown> | null>(null),
    [picker, setPicker] = useState<"staff" | "groups" | "activities" | null>(
      null,
    ),
    [mode, setMode] = useState<"groups" | "activities">("groups");
  const form = useForm({
    defaultValues: {
      volunteer: null as PointsOption | null,
      target: null as PointsOption | null,
      canAttend: assignment?.canAttend ?? false,
      canAward: assignment?.canAward ?? false,
    },
    onSubmit: async ({ value }) => {
      if (!attempt.current) {
        if (!value.canAttend && !value.canAward) {
          submit.reset();
          throw new DirectoryError("access_capabilities");
        }
        if (!assignment && (!value.volunteer || !value.target)) return;
        if (
          assignment &&
          ((assignment.canAttend && !value.canAttend) ||
            (assignment.canAward && !value.canAward)) &&
          !(await confirm({
            title: m.access_edit(),
            description: m.access_reduce_help(),
            confirmLabel: m.access_edit(),
            destructive: true,
          }))
        )
          return;
        attempt.current = assignment
          ? {
              canAttend: value.canAttend,
              canAward: value.canAward,
              version: assignment.version,
            }
          : {
              userId: value.volunteer!.id,
              groupId: mode === "groups" ? value.target!.id : null,
              activityId: mode === "activities" ? value.target!.id : null,
              canAttend: value.canAttend,
              canAward: value.canAward,
              key: crypto.randomUUID(),
            };
      }
      await submit.mutateAsync(attempt.current).catch(() => {});
    },
  });
  const submit = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      directoryRequest(
        base + "/access" + (assignment ? "/" + assignment.id : ""),
        { method: assignment ? "PATCH" : "POST", body: JSON.stringify(body) },
      ),
    onSuccess: onSaved,
    onError: (error) => {
      if (
        error instanceof DirectoryError &&
        [
          "invalid_input",
          "access_capabilities",
          "access_duplicate",
          "access_volunteer",
          "forbidden",
          "not_found",
          "conflict",
          "verify_required",
        ].includes(error.code)
      )
        attempt.current = null;
    },
  });
  const dirty = useStore(form.store, (s) => s.isDirty),
    values = useStore(form.store, (s) => s.values),
    frozen = submit.isPending || !!attempt.current;
  const leave = async () =>
    submit.isSuccess ||
    (!dirty && !attempt.current) ||
    (await confirm({
      title: attempt.current ? m.access_leave() : m.directory_discard(),
      description: attempt.current
        ? m.access_leave_help()
        : m.directory_discard_description(),
      confirmLabel: attempt.current ? m.access_leave() : m.directory_discard(),
      destructive: true,
    }));
  useBlocker({
    shouldBlockFn: async () => submit.isPending || !(await leave()),
    enableBeforeUnload: dirty || !!attempt.current,
  });
  const close = async () => {
    if (!submit.isPending && (await leave())) onClose();
  };
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
            {assignment ? m.access_edit() : m.access_create()}
          </DialogTitle>
          <DialogDescription>{m.access_scope_help()}</DialogDescription>
        </DialogHeader>
        {submit.isError && <PointsError error={submit.error} />}
        <form
          className="directory-form"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit().catch(() => {});
          }}
        >
          {assignment ? (
            <p>
              <strong>{assignment.staffName || m.role_volunteer()}</strong> ·{" "}
              {assignment.scopeName}
            </p>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={frozen}
                onClick={() => setPicker(picker === "staff" ? null : "staff")}
              >
                <UserCheck aria-hidden="true" />
                {values.volunteer?.name || m.access_volunteer()}
              </Button>
              {picker === "staff" && (
                <PointsOptions
                  path={base + "/access/staff"}
                  scope={[...scope, "staff-options"]}
                  selected={
                    new Map(
                      values.volunteer
                        ? [[values.volunteer.id, values.volunteer]]
                        : [],
                    )
                  }
                  disabled={frozen}
                  format={(item) => item.name || m.role_volunteer()}
                  onToggle={(item) => {
                    form.setFieldValue("volunteer", item);
                    setPicker(null);
                  }}
                />
              )}
              <div className="access-scope-buttons">
                <Button
                  type="button"
                  variant={mode === "groups" ? "default" : "outline"}
                  disabled={frozen}
                  onClick={() => {
                    setMode("groups");
                    form.setFieldValue("target", null);
                    setPicker("groups");
                  }}
                >
                  <Users aria-hidden="true" />
                  {m.directory_groups()}
                </Button>
                <Button
                  type="button"
                  variant={mode === "activities" ? "default" : "outline"}
                  disabled={frozen}
                  onClick={() => {
                    setMode("activities");
                    form.setFieldValue("target", null);
                    setPicker("activities");
                  }}
                >
                  <CalendarDays aria-hidden="true" />
                  {m.activities_title()}
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={frozen}
                onClick={() => setPicker(picker === mode ? null : mode)}
              >
                {mode === "groups" ? (
                  <Users aria-hidden="true" />
                ) : (
                  <CalendarDays aria-hidden="true" />
                )}
                {values.target?.name ??
                  (mode === "groups" ? m.access_group() : m.access_activity())}
              </Button>
              {picker === mode && (
                <PointsOptions
                  key={mode}
                  path={base + "/" + mode}
                  scope={[...scope, mode + "-options"]}
                  selected={
                    new Map(
                      values.target ? [[values.target.id, values.target]] : [],
                    )
                  }
                  disabled={frozen}
                  onToggle={(item) => {
                    form.setFieldValue("target", item);
                    setPicker(null);
                  }}
                />
              )}
            </>
          )}
          {(["canAttend", "canAward"] as const).map((name) => (
            <form.Field key={name} name={name}>
              {(field) => (
                <div>
                  <Label className="directory-check">
                    <Checkbox
                      checked={field.state.value}
                      disabled={frozen}
                      onCheckedChange={(checked) =>
                        field.handleChange(checked === true)
                      }
                    />
                    <span>
                      {name === "canAttend"
                        ? m.access_attend()
                        : m.access_award()}
                    </span>
                  </Label>
                  <p className="access-permission-help">
                    {name === "canAttend"
                      ? m.access_attend_help()
                      : m.access_award_help()}
                  </p>
                </div>
              )}
            </form.Field>
          ))}
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
            <ActionButton
              type="submit"
              pending={submit.isPending}
              disabled={
                (!assignment && (!values.volunteer || !values.target)) ||
                (!values.canAttend && !values.canAward)
              }
            >
              <Save aria-hidden="true" />
              {submit.isError && attempt.current
                ? m.try_again()
                : m.directory_save()}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
