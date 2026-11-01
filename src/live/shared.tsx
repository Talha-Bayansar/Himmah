import { useMutation } from "@tanstack/react-query";
import { DirectoryError } from "../community/client";
import { ErrorNotice } from "../activities/Activities";
import { ActionButton } from "../components/shared/action-button";
import { m } from "../paraglide/messages.js";
import type { LivePhase } from "./contracts";
export const phaseLabel = (phase: LivePhase) =>
  ({
    lobby: m.live_lobby,
    question: m.live_question_open,
    locked: m.live_locked,
    revealed: m.live_revealed,
    finished: m.live_finished,
  })[phase]();
export const playerName = (nickname: string | null, number: number) =>
  nickname
    ? `${nickname} · ${m.live_player({ number: String(number) })}`
    : m.live_player({ number: String(number) });
export function useLiveCommand(
  path: string | ((variables: Record<string, unknown>) => string),
  api: <T>(path: string, init?: RequestInit) => Promise<T>,
  onSaved: (
    data: { id: string; version?: number },
    variables: Record<string, unknown>,
  ) => Promise<unknown>,
) {
  const command = useMutation({
    gcTime: 0,
    mutationFn: (variables: Record<string, unknown>) =>
      api<{ id: string; version?: number }>(
        typeof path === "string" ? path : path(variables),
        { method: "POST", body: JSON.stringify(variables) },
      ),
    onSuccess: onSaved,
  });
  const uncertain =
    command.isError &&
    (!(command.error instanceof DirectoryError) ||
      ![
        "invalid_input",
        "conflict",
        "forbidden",
        "not_found",
        "live_revoked",
        "live_expired",
        "live_closed",
        "live_started",
        "live_locked",
        "live_full",
        "live_empty",
        "live_transition",
        "live_unavailable",
      ].includes(command.error.code));
  return { ...command, uncertain };
}
export function LiveCommandNotice({
  command,
  refresh,
}: {
  command: ReturnType<typeof useLiveCommand>;
  refresh: () => void;
}) {
  if (!command.isError) return null;
  return (
    <div className="participant-message">
      <ErrorNotice error={command.error} />
      {command.uncertain ? (
        <>
          <p>{m.learn_uncertain()}</p>
          <ActionButton
            variant="outline"
            pending={command.isPending}
            onClick={() =>
              command.variables && command.mutate(command.variables)
            }
          >
            {m.learn_retry_save()}
          </ActionButton>
        </>
      ) : (
        <ActionButton variant="outline" onClick={refresh}>
          {m.live_refresh()}
        </ActionButton>
      )}
    </div>
  );
}
