import { useRef, useState, useEffect } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { Save, X } from "lucide-react";
import { m } from "../paraglide/messages.js";
import {
  directoryRequest,
  DirectoryError,
  directoryMessage,
} from "../community/client";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { ActionButton } from "../components/shared/action-button";
import { useConfirmation } from "../components/shared/confirmation";
import { statusLabel } from "./Attendance";
import {
  attendanceStatuses,
  type AttendancePerson,
  type AttendanceResult,
  type AttendanceInput,
  type AttendanceStatus,
} from "./contracts";
export function AttendanceEditor({
  records,
  ruleAmount = 0,
  path,
  onClose,
  onSaved,
}: {
  records: AttendancePerson[];
  ruleAmount?: number;
  path: string;
  onClose: () => void;
  onSaved: (result: AttendanceResult) => Promise<void>;
}) {
  const confirm = useConfirmation(),
    request = useRef<AttendanceInput | null>(null);
  const [review, setReview] = useState<{
    input: AttendanceInput;
    result: AttendanceResult;
  } | null>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (review) previewHeading.current?.focus();
  }, [review]);
  const preview = useMutation({
    mutationFn: (input: AttendanceInput) =>
      directoryRequest<AttendanceResult>(path + "/preview", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
  const form = useForm({
    defaultValues: {
      status: (records.length === 1 && records[0]!.status !== "unmarked"
        ? records[0]!.status
        : "present") as AttendanceStatus,
      reason: "",
    },
    onSubmit: async ({ value }) => {
      if (!request.current && ruleAmount > 0 && !review) {
        const input: AttendanceInput = {
          key: crypto.randomUUID(),
          status: value.status,
          reason: value.reason.trim(),
          items: records.map((row) => ({
            personId: row.id,
            version: row.version,
          })),
        };
        const result = await preview.mutateAsync(input).catch(() => null);
        if (result) setReview({ input, result });
        return;
      }
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
      request.current ??= review
        ? { ...review.input, confirmPoints: true }
        : {
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
    shouldBlockFn: async () =>
      submit.isPending || preview.isPending || !(await canLeave()),
    enableBeforeUnload: !!request.current || dirty,
  });
  const close = async () => {
    if (!submit.isPending && !preview.isPending && (await canLeave()))
      onClose();
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
        {preview.isError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {directoryMessage(preview.error)}
            </AlertDescription>
          </Alert>
        )}
        {review && (
          <section className="earning-preview" aria-label={m.earning_preview()}>
            <h3 ref={previewHeading} tabIndex={-1}>
              {m.earning_preview()}
            </h3>
            <p>{m.earning_preview_help()}</p>
            <ul>
              {review.result.items.map((item) => (
                <li key={item.personId}>
                  <strong>
                    {records.find((row) => row.id === item.personId)?.name ??
                      m.directory_members()}
                  </strong>
                  <span>
                    {item.outcome === "saved"
                      ? m.earning_will_save()
                      : item.outcome === "unchanged"
                        ? m.earning_unchanged()
                        : item.outcome === "conflict"
                          ? m.attendance_conflict()
                          : item.outcome === "ineligible"
                            ? m.attendance_ineligible()
                            : m.attendance_reason_required()}
                  </span>
                  <span>
                    {(item.pointsDelta ?? 0) !== 0
                      ? m.earning_change({
                          amount:
                            (item.pointsDelta! > 0 ? "+" : "") +
                            String(item.pointsDelta),
                        })
                      : m.earning_no_change()}
                  </span>
                </li>
              ))}
            </ul>
          </section>
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
                  disabled={
                    submit.isPending || preview.isPending || !!request.current
                  }
                  onChange={(e) => {
                    setReview(null);
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
                  disabled={
                    submit.isPending || preview.isPending || !!request.current
                  }
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => {
                    setReview(null);
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
              disabled={submit.isPending || preview.isPending}
              onClick={() => void close()}
            >
              <X size={16} aria-hidden="true" />
              {m.cancel()}
            </Button>
            <ActionButton
              type="submit"
              pending={submit.isPending || preview.isPending}
              disabled={
                !!review &&
                !review.result.items.some((item) =>
                  ["saved", "unchanged"].includes(item.outcome),
                )
              }
            >
              <Save size={16} aria-hidden="true" />
              {submit.isError
                ? m.try_again()
                : ruleAmount > 0
                  ? review
                    ? m.earning_confirm()
                    : m.earning_preview()
                  : m.attendance_save()}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
