import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import {
  DirectoryError,
  directoryRequest,
  directoryMessage,
} from "../community/client";
import { useConfirmation } from "../components/shared/confirmation";
import { ActionButton } from "../components/shared/action-button";
import { m } from "../paraglide/messages.js";
import { sessionPrice } from "../activities/contracts";
import { useLocale } from "../localization/locale";
import type {
  ParticipantAction,
  ParticipantCommand,
  AttendancePerson,
  AttendanceResult,
} from "./contracts";

type Command = ParticipantCommand;
export function useAttendanceMembership(path: string, queryKey: string[]) {
  const cache = useQueryClient(),
    confirm = useConfirmation(),
    locale = useLocale()?.locale ?? "en";
  const attempt = useRef<Command | null>(null);
  const [message, setMessage] = useState("");
  const [completed, setCompleted] = useState(0);
  const operation = useMutation({
    mutationFn: (command: Command) =>
      directoryRequest<AttendanceResult>(path, {
        method: "POST",
        body: JSON.stringify(command),
      }),
    onSuccess: async (result, command) => {
      attempt.current = null;
      const outcome = result.items.every((item) =>
        ["saved", "unchanged"].includes(item.outcome),
      )
        ? "saved"
        : "conflict";
      setMessage(
        outcome === "saved"
          ? command.action === "add"
            ? m.attendance_added_success()
            : command.action === "remove"
              ? m.attendance_removed_success()
              : m.management_updated()
          : outcome === "conflict"
            ? m.attendance_conflict()
            : m.attendance_ineligible(),
      );
      setCompleted((value) => value + 1);
      await cache.invalidateQueries({ queryKey: queryKey.slice(0, 3) });
    },
    onError: async (error) => {
      if (
        error instanceof DirectoryError &&
        !["service", "rate_limit"].includes(error.code)
      ) {
        attempt.current = null;
        await cache.invalidateQueries({ queryKey: queryKey.slice(0, 3) });
      }
    },
  });
  const blocked = operation.isPending || !!attempt.current;
  const allowClose = () => !blocked;
  useBlocker({
    shouldBlockFn: () => blocked,
    enableBeforeUnload: () => blocked,
  });
  const change = async (
    people: AttendancePerson | AttendancePerson[],
    action: ParticipantAction,
  ) => {
    const records = Array.isArray(people) ? people : [people];
    if (
      blocked ||
      !records.length ||
      records.length > 50 ||
      (action === "add" && records.some((p) => p.status === "present"))
    )
      return false;
    const amount = records.reduce(
      (sum, p) => sum + (p.billing?.outstandingMinor ?? 0),
      0,
    );
    if (
      action !== "add" &&
      !(await confirm({
        title:
          action === "remove"
            ? m.attendance_remove()
            : action === "paid"
              ? m.management_mark_paid()
              : m.management_mark_unpaid(),
        description:
          action === "paid"
            ? m.management_pay_confirm({
                count: String(records.length),
                amount: sessionPrice(amount, locale),
              })
            : m.management_clear_confirm({ count: String(records.length) }),
        confirmLabel:
          action === "remove"
            ? m.attendance_remove()
            : action === "paid"
              ? m.management_mark_paid()
              : m.management_mark_unpaid(),
        destructive: action !== "paid",
      }))
    )
      return false;
    if (attempt.current) return false;
    setMessage("");
    attempt.current = {
      key: crypto.randomUUID(),
      action,
      items: records.map((person) => ({
        personId: person.id,
        version: person.version,
        ...(action !== "add" && person.billing
          ? {
              paymentVersion: person.billing.version,
              sessionVersion: person.billing.sessionVersion,
              ...(action === "paid"
                ? { amountMinor: person.billing.outstandingMinor }
                : {}),
            }
          : {}),
      })),
    };
    const result = await operation
      .mutateAsync(attempt.current)
      .catch(() => null);
    return (
      !!result &&
      result.items.every((item) =>
        ["saved", "unchanged"].includes(item.outcome),
      )
    );
  };
  return {
    completed,
    denied:
      operation.error instanceof DirectoryError &&
      ["forbidden", "not_found", "sign_in", "verify_required"].includes(
        operation.error.code,
      ),
    error: operation.error,
    reset: () => {
      operation.reset();
      setMessage("");
    },
    change,
    blocked,
    allowClose,
    pending: operation.isPending,
    notice: (
      <>
        {message && (
          <p className="directory-notice" role="status">
            {message}
          </p>
        )}
        {operation.isError && (
          <div role="alert" className="attendance-notice">
            <p>
              {attempt.current
                ? m.attendance_uncertain()
                : directoryMessage(operation.error)}
            </p>
            {attempt.current && (
              <ActionButton
                pending={operation.isPending}
                onClick={() =>
                  void operation.mutateAsync(attempt.current!).catch(() => {})
                }
              >
                {m.try_again()}
              </ActionButton>
            )}
          </div>
        )}
      </>
    ),
  };
}
