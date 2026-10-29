import { FormSurface } from "../components/shared/form-surface";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { CalendarDays, Save, UserCheck, Users, X } from "lucide-react";
import { useRef, useState } from "react";
import { DirectoryError, directoryRequest } from "../community/client";
import { ActionButton } from "../components/shared/action-button";
import { CollectionError } from "../components/shared/collection-error";
import { useConfirmation } from "../components/shared/confirmation";
import {
  RecordOptions,
  type RecordOption,
} from "../components/shared/record-options";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Label } from "../components/ui/label";
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
      volunteer: null as RecordOption | null,
      target: null as RecordOption | null,
      canAttend: assignment?.canAttend ?? false,
      canCollect: assignment?.canCollect ?? false,
    },
    onSubmit: async ({ value }) => {
      if (!attempt.current) {
        if (!value.canAttend && !value.canCollect) {
          submit.reset();
          throw new DirectoryError("access_capabilities");
        }
        if (!assignment && (!value.volunteer || !value.target)) return;
        if (
          assignment &&
          ((assignment.canAttend && !value.canAttend) ||
            (assignment.canCollect && !value.canCollect)) &&
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
              canCollect: value.canCollect,
              version: assignment.version,
            }
          : {
              userId: value.volunteer!.id,
              groupId: mode === "groups" ? value.target!.id : null,
              activityId: mode === "activities" ? value.target!.id : null,
              canAttend: value.canAttend,
              canCollect: value.canCollect,
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
    shouldBlockFn: async () =>
      !approved.current && (submit.isPending || !(await leave())),
    enableBeforeUnload: () =>
      !approved.current && !submit.isSuccess && (dirty || !!attempt.current),
  });
  const approved = useRef(false);
  const close = async () => {
    if (!submit.isPending && (await leave())) {
      approved.current = true;
      onClose();
    }
  };
  return (
    <FormSurface
      page
      title={assignment ? m.access_edit() : m.access_create()}
      description={m.access_scope_help()}
      onClose={() => void close()}
    >
      {submit.isError && <CollectionError error={submit.error} />}
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
              <RecordOptions
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
            <div
              className="access-scope-buttons segmented-choice"
              role="group"
              aria-label={m.access_scope()}
            >
              <Button
                type="button"
                variant="ghost"
                aria-pressed={mode === "groups"}
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
                variant="ghost"
                aria-pressed={mode === "activities"}
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
              <RecordOptions
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
        {(["canAttend", "canCollect"] as const).map((name) => (
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
                      : m.cash_collect_permission()}
                  </span>
                </Label>
                <p className="access-permission-help">
                  {name === "canAttend"
                    ? m.access_attend_help()
                    : m.cash_collect_permission_help()}
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
              (!values.canAttend && !values.canCollect)
            }
          >
            <Save aria-hidden="true" />
            {submit.isError && attempt.current
              ? m.try_again()
              : m.directory_save()}
          </ActionButton>
        </div>
      </form>
    </FormSurface>
  );
}
