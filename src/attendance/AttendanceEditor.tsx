import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { Save, X } from "lucide-react";
import { useRef } from "react";
import {
  DirectoryError,
  directoryMessage,
  directoryRequest,
} from "../community/client";
import { ActionButton } from "../components/shared/action-button";
import { useConfirmation } from "../components/shared/confirmation";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { m } from "../paraglide/messages.js";
import { statusLabel } from "./Attendance";
import {
  attendanceStatuses,
  type AttendanceInput,
  type AttendancePerson,
  type AttendanceResult,
  type AttendanceStatus,
} from "./contracts";
export function AttendanceEditor({
  records,
  path,
  onClose,
  onSaved,
}: {
  records: AttendancePerson[];
  path: string;
  onClose: () => void;
  onSaved: (result: AttendanceResult) => Promise<void>;
}) {
  const confirm = useConfirmation(),
    request = useRef<AttendanceInput | null>(null);
  const form = useForm({
    defaultValues: {
      status: (records.length === 1 && records[0]!.status !== "unmarked"
        ? records[0]!.status
        : "present") as AttendanceStatus,
      reason: "",
    },
    onSubmit: async ({ value }) => {
      const corrections = records.some(
        (row) => row.version > 0 && row.status !== value.status,
      );
      if (
        !request.current &&
        corrections &&
        !(await confirm({
          title: m.attendance_correct(),
          description: m.attendance_correct_help(),
          confirmLabel: m.attendance_correct(),
          destructive: true,
        }))
      )
        return;
      request.current ??= {
        key: crypto.randomUUID(),
        status: value.status,
        reason: value.reason.trim(),
        items: records.map((row) => ({
          personId: row.id,
          version: row.version,
        })),
      };
      await submit.mutateAsync(request.current).catch(() => {});
    },
  });
  const submit = useMutation({
    mutationFn: (input: AttendanceInput) =>
      directoryRequest<AttendanceResult>(path, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: onSaved,
  });
  const dirty = useStore(form.store, (state) => state.isDirty),
    status = useStore(form.store, (state) => state.values.status);
  const corrections = records.some(
    (row) => row.version > 0 && row.status !== status,
  );
  const canLeave = async () =>
    submit.isSuccess ||
    (!request.current && !dirty) ||
    (await confirm({
      title: request.current ? m.attendance_leave() : m.directory_discard(),
      description: request.current
        ? m.attendance_leave_help()
        : m.directory_discard_description(),
      confirmLabel: request.current
        ? m.attendance_leave()
        : m.directory_discard(),
      destructive: true,
    }));
  useBlocker({
    shouldBlockFn: async () => submit.isPending || !(await canLeave()),
    enableBeforeUnload: !!request.current || dirty,
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
            {records.length === 1 ? records[0]!.name : m.attendance_bulk()}
          </DialogTitle>
          <DialogDescription>
            {m.attendance_selected({ count: String(records.length) })}
          </DialogDescription>
        </DialogHeader>
        {submit.isError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {submit.error instanceof DirectoryError &&
              submit.error.code !== "service"
                ? directoryMessage(submit.error)
                : m.attendance_uncertain()}
            </AlertDescription>
          </Alert>
        )}
        <form
          className="directory-form attendance-form"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="status">
            {(field) => (
              <div>
                <Label htmlFor="attendance-status">
                  {m.attendance_status()}
                </Label>
                <NativeSelect
                  id="attendance-status"
                  value={field.state.value}
                  disabled={submit.isPending || !!request.current}
                  onChange={(e) => {
                    field.handleChange(e.target.value as AttendanceStatus);
                  }}
                >
                  {attendanceStatuses.map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {statusLabel(value)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
          </form.Field>
          <form.Field name="reason">
            {(field) => (
              <div>
                <Label htmlFor="attendance-reason">
                  {m.attendance_reason()}
                </Label>
                <Input
                  id="attendance-reason"
                  maxLength={300}
                  required={corrections}
                  pattern={corrections ? ".*\\S.*" : undefined}
                  aria-describedby="attendance-reason-help"
                  disabled={submit.isPending || !!request.current}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                  }}
                />
                <p
                  id="attendance-reason-help"
                  className="attendance-reason-help"
                >
                  {m.attendance_reason_help()}
                </p>
              </div>
            )}
          </form.Field>
          <div className="directory-actions">
            <Button
              type="button"
              variant="outline"
              disabled={submit.isPending}
              onClick={() => void close()}
            >
              <X size={16} aria-hidden="true" />
              {m.cancel()}
            </Button>
            <ActionButton type="submit" pending={submit.isPending}>
              <Save size={16} aria-hidden="true" />
              {submit.isError ? m.try_again() : m.attendance_save()}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
