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
import type { AttendancePerson, AttendanceResult } from "./contracts";

type Command = {
  key: string;
  action: "add" | "remove";
  personId: string;
  version: number;
};
export function useAttendanceMembership(path: string, queryKey: string[]) {
  const cache = useQueryClient(),
    confirm = useConfirmation();
  const attempt = useRef<Command | null>(null);
  const [message, setMessage] = useState("");
  const operation = useMutation({
    mutationFn: (command: Command) =>
      directoryRequest<AttendanceResult>(path, {
        method: "POST",
        body: JSON.stringify(command),
      }),
    onSuccess: async (result, command) => {
      attempt.current = null;
      const outcome = result.items.find(
        (item) => item.personId === command.personId,
      )?.outcome;
      setMessage(
        outcome === "saved" || outcome === "unchanged"
          ? command.action === "add"
            ? m.attendance_added_success()
            : m.attendance_removed_success()
          : outcome === "conflict"
            ? m.attendance_conflict()
            : m.attendance_ineligible(),
      );
      await cache.invalidateQueries({ queryKey });
    },
    onError: async (error) => {
      if (
        error instanceof DirectoryError &&
        !["service", "rate_limit"].includes(error.code)
      ) {
        attempt.current = null;
        await cache.invalidateQueries({ queryKey });
      }
    },
  });
  const blocked = operation.isPending || !!attempt.current;
  const allowClose = () => !blocked;
  useBlocker({
    shouldBlockFn: () => blocked,
    enableBeforeUnload: () => blocked,
  });
  const change = async (person: AttendancePerson, action: "add" | "remove") => {
    if (blocked || (action === "add" && person.status === "present")) return;
    if (
      action === "remove" &&
      !(await confirm({
        title: m.attendance_remove(),
        description: m.attendance_remove_help({ name: person.name }),
        confirmLabel: m.attendance_remove(),
        destructive: true,
      }))
    )
      return;
    // Recheck after asynchronous confirmation; never replace an uncertain request.
    if (attempt.current) return;
    setMessage("");
    attempt.current = {
      key: crypto.randomUUID(),
      action,
      personId: person.id,
      version: person.version,
    };
    await operation.mutateAsync(attempt.current).catch(() => {});
  };
  return {
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
