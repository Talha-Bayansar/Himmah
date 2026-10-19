import { useRef } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { Save, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ActionButton } from "../components/shared/action-button";
import { useConfirmation } from "../components/shared/confirmation";
import { PointsError } from "../points/PointsShared";
import { directoryRequest, DirectoryError } from "../community/client";
import { localTime } from "../activities/contracts";
import { m } from "../paraglide/messages.js";
import type { EngagementPeriod } from "./contracts";
export function PeriodEditor({
  path,
  timezone,
  period,
  onClose,
  onSaved,
}: {
  path: string;
  timezone: string;
  period?: EngagementPeriod;
  onClose: () => void;
  onSaved: (period: EngagementPeriod) => Promise<void>;
}) {
  const saved = useRef(false);
  const confirm = useConfirmation(),
    attempt = useRef<Record<string, unknown> | null>(null);
  const today = localTime(new Date().toISOString(), timezone).slice(0, 10);
  const form = useForm({
    defaultValues: {
      name: period?.name ?? "",
      startDate: period?.startDate ?? today,
      endDate: period?.endDate ?? today,
    },
    onSubmit: async ({ value }) => {
      attempt.current ??= {
        ...value,
        ...(period
          ? { version: period.version }
          : { key: crypto.randomUUID() }),
      };
      await submit.mutateAsync(attempt.current).catch(() => {});
    },
  });
  const submit = useMutation({
    mutationFn: (value: Record<string, unknown>) =>
      directoryRequest<{ item: EngagementPeriod }>(
        path + (period ? "/" + period.id : ""),
        { method: period ? "PATCH" : "POST", body: JSON.stringify(value) },
      ),
    onSuccess: (result) => {
      saved.current = true;
      return onSaved(result.item);
    },
    onError: (error) => {
      if (
        error instanceof DirectoryError &&
        [
          "invalid_input",
          "invalid_name",
          "period_dates",
          "period_closed",
          "conflict",
          "forbidden",
          "not_found",
          "verify_required",
        ].includes(error.code)
      )
        attempt.current = null;
    },
  });
  const dirty = useStore(form.store, (state) => state.isDirty),
    frozen = submit.isPending || !!attempt.current;
  const canLeave = async () =>
    saved.current ||
    submit.isSuccess ||
    (!dirty && !attempt.current) ||
    (await confirm({
      title: attempt.current ? m.periods_leave() : m.directory_discard(),
      description: attempt.current
        ? m.periods_leave_help()
        : m.directory_discard_description(),
      confirmLabel: attempt.current ? m.periods_leave() : m.directory_discard(),
      destructive: true,
    }));
  useBlocker({
    shouldBlockFn: async () =>
      !saved.current && (submit.isPending || !(await canLeave())),
    enableBeforeUnload: !saved.current && (dirty || !!attempt.current),
  });
  const close = async () => {
    if (!submit.isPending && (await canLeave())) onClose();
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
            {period ? m.periods_edit() : m.periods_create()}
          </DialogTitle>
          <DialogDescription>{m.periods_form_help()}</DialogDescription>
        </DialogHeader>
        <p>{m.activities_timezone({ timezone })}</p>
        {submit.isError && <PointsError error={submit.error} />}
        {submit.isError && attempt.current && (
          <p role="status">{m.periods_leave_help()}</p>
        )}
        <form
          className="directory-form"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="name">
            {(field) => (
              <div>
                <Label htmlFor="period-name">{m.periods_name()}</Label>
                <Input
                  id="period-name"
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="off"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  disabled={frozen}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="startDate">
            {(field) => (
              <div>
                <Label htmlFor="period-start">{m.periods_start()}</Label>
                <Input
                  id="period-start"
                  type="date"
                  required
                  min="2000-01-01"
                  max="2100-12-31"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  disabled={frozen}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="endDate">
            {(field) => (
              <div>
                <Label htmlFor="period-end">{m.periods_end()}</Label>
                <Input
                  id="period-end"
                  type="date"
                  required
                  min="2000-01-01"
                  max="2100-12-31"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  disabled={frozen}
                />
              </div>
            )}
          </form.Field>
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
