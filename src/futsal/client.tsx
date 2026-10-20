import {
  createContext,
  useEffect,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type MutableRefObject,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { directoryRequest, DirectoryError } from "../community/client";
import { useConfirmation } from "../components/shared/confirmation";
import { PointsError } from "../points/PointsShared";
import { m } from "../paraglide/messages.js";
const Context = createContext<((error: DirectoryError) => void) | null>(null);
export const isDenied = (error: unknown) =>
  error instanceof DirectoryError &&
  ["forbidden", "not_found", "sign_in"].includes(error.code);
export function useFutsalPrivacyGuard(error: unknown) {
  const deny = useContext(Context);
  useEffect(() => {
    if (isDenied(error)) deny?.(error as DirectoryError);
  }, [error, deny]);
}
export const futsalKey = (user: string, org: string) => ["futsal", user, org];
export function FutsalPrivacy({ children }: { children: ReactNode }) {
  const [error, setError] = useState<DirectoryError | null>(null);
  return error ? (
    <PointsError error={error} />
  ) : (
    <Context.Provider value={setError}>{children}</Context.Provider>
  );
}
export function useFutsalWrite({
  path,
  method = "POST",
  userId,
  organizationId,
  dirty,
  onSaved,
  onClose,
}: {
  path: string;
  method?: "POST" | "PATCH" | "DELETE";
  userId: string;
  organizationId: string;
  dirty: MutableRefObject<boolean>;
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  const attempt = useRef<Record<string, unknown> | null>(null),
    saved = useRef(false),
    cache = useQueryClient(),
    confirm = useConfirmation(),
    deny = useContext(Context);
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      saved.current = false;
      attempt.current ??= { ...body, key: crypto.randomUUID() };
      return directoryRequest<{ item: { id: string } }>(path, {
        method,
        body: JSON.stringify(attempt.current),
      });
    },
    onSuccess: async (data) => {
      saved.current = true;
      attempt.current = null;
      await cache.invalidateQueries({
        queryKey: futsalKey(userId, organizationId),
      });
      onSaved(data.item.id);
    },
    onError: (error) => {
      if (
        error instanceof DirectoryError &&
        !["service", "rate_limit"].includes(error.code)
      ) {
        attempt.current = null;
        void cache.invalidateQueries({
          queryKey: futsalKey(userId, organizationId),
        });
        if (isDenied(error)) deny?.(error);
      }
    },
  });
  const leave = async () =>
    saved.current ||
    (!attempt.current && !dirty.current) ||
    (await confirm({
      title: attempt.current
        ? m.futsal_leave_uncertain()
        : m.directory_discard(),
      description: attempt.current
        ? m.futsal_uncertain()
        : m.directory_discard_description(),
      confirmLabel: m.directory_discard(),
      destructive: true,
    }));
  useBlocker({
    shouldBlockFn: async () =>
      !saved.current && (mutation.isPending || !(await leave())),
    enableBeforeUnload: () =>
      !saved.current && (dirty.current || !!attempt.current),
  });
  return {
    mutation,
    frozen: mutation.isPending || !!attempt.current,
    uncertain: mutation.isError && !!attempt.current,
    close: async () => {
      if (!mutation.isPending && (await leave())) {
        saved.current = true;
        onClose();
      }
    },
  };
}
