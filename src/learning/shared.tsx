import { createContext, useContext, useState, type ReactNode } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { DirectoryError, directoryRequest } from "../community/client";
import type { Organization } from "../organization/contracts";
import type { Page } from "../community/contracts";
import { ErrorNotice } from "../activities/Activities";
import { Button } from "../components/ui/button";
import { m } from "../paraglide/messages.js";
const Context = createContext<null | {
  org: Organization;
  user: string;
  prefix: string[];
  base: string;
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
}>(null);
export function LearningScope({
  org,
  user,
  children,
}: {
  org: Organization;
  user: string;
  children: ReactNode;
}) {
  const cache = useQueryClient(),
    [denied, setDenied] = useState<unknown>(null);
  const prefix = ["organization", user, org.id, "learning", org.role],
    base = `/api/organizations/${org.id}/learning`;
  const api = async <T,>(path: string, init?: RequestInit) => {
    try {
      return await directoryRequest<T>(path, init);
    } catch (e) {
      if (
        e instanceof DirectoryError &&
        ["forbidden", "not_found", "sign_in", "verify_required"].includes(
          e.code,
        )
      ) {
        setDenied(e);
        const key = ["organization", user, org.id];
        const filter = {
          queryKey: key,
          predicate: (q: { queryKey: readonly unknown[] }) =>
            q.queryKey.length > 3,
        };
        void cache.cancelQueries(filter);
        cache.removeQueries(filter);
        const history = { queryKey: ["people", user, org.id, "learning"] };
        void cache.cancelQueries(history);
        cache.removeQueries(history);
      }
      throw e;
    }
  };
  if (!["owner", "admin"].includes(org.role))
    return <p role="alert">{m.people_denied()}</p>;
  if (denied)
    return <ErrorNotice error={denied} retry={() => setDenied(null)} />;
  return (
    <Context.Provider value={{ org, user, prefix, base, api }}>
      {children}
    </Context.Provider>
  );
}
export function useLearning() {
  const value = useContext(Context);
  if (!value) throw Error("Learning scope missing");
  return value;
}
export function useLearningPages<T extends { id: string }>(path: string) {
  const { prefix, api } = useLearning();
  const query = useInfiniteQuery({
    queryKey: [...prefix, path],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api<Page<T>>(
        path +
          (path.includes("?") ? "&" : "?") +
          (pageParam ? "cursor=" + encodeURIComponent(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    retry: false,
    staleTime: 0,
  });
  const seen = new Set<string>();
  return {
    ...query,
    items: (query.data?.pages.flatMap((p) => p.items) ?? []).filter(
      (p) => !seen.has(p.id) && !!seen.add(p.id),
    ),
  };
}
export function useLearningCommand(id: string) {
  const { base, api, prefix, org, user } = useLearning(),
    cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ id: string; version: number; publication: string | null }>(
        `${base}/${id}`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: prefix }),
        cache.invalidateQueries({
          queryKey: ["people", user, org.id, "learning"],
        }),
      ]);
    },
  });
  const uncertain =
    mutation.isError &&
    (!(mutation.error instanceof DirectoryError) ||
      ![
        "invalid_input",
        "conflict",
        "forbidden",
        "not_found",
        "verify_required",
        "sign_in",
      ].includes(mutation.error.code));
  return {
    ...mutation,
    uncertain,
    run: (body: Record<string, unknown>) =>
      mutation.mutateAsync({ key: crypto.randomUUID(), ...body }),
  };
}
export function CommandError({
  command,
}: {
  command: ReturnType<typeof useLearningCommand>;
}) {
  if (!command.isError) return null;
  if (
    command.error instanceof DirectoryError &&
    command.error.code === "conflict"
  )
    return (
      <div role="alert">
        <p>{m.learn_conflict()}</p>
        <Button variant="outline" onClick={() => location.reload()}>
          {m.learn_reload()}
        </Button>
      </div>
    );
  return (
    <div>
      <ErrorNotice
        error={command.error}
        retry={() => {
          if (command.uncertain && command.variables)
            command.mutate(command.variables);
          else command.reset();
        }}
        pending={command.isPending}
      />
      {command.uncertain && (
        <p className="activity-note">{m.learn_uncertain()}</p>
      )}
    </div>
  );
}
export function CopyLink({
  value,
  compact = false,
}: {
  value: string;
  compact?: boolean;
}) {
  const [state, setState] = useState<"ready" | "copied" | "error">("ready");
  return (
    <div className="learning-share-link" data-compact={compact}>
      {(!compact || state === "error") && (
        <input
          aria-label={m.learn_link()}
          readOnly
          value={value}
          onFocus={(e) => e.target.select()}
        />
      )}
      <Button
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setState("copied");
          } catch {
            setState("error");
          }
        }}
      >
        {state === "copied" ? m.learn_copied() : m.learn_copy()}
      </Button>
      {state === "error" && <p role="status">{m.learn_copy_help()}</p>}
    </div>
  );
}
