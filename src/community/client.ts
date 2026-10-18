import { useInfiniteQuery } from "@tanstack/react-query";
import type { Page } from "./contracts";
import { m } from "../paraglide/messages.js";
export class DirectoryError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export async function directoryRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const value = await response.json();
  if (!response.ok)
    throw new DirectoryError(
      value.code ?? (response.status === 401 ? "sign_in" : "service"),
    );
  return value as T;
}
export function directoryMessage(error: unknown) {
  const key =
    error instanceof DirectoryError
      ? "directory_" + error.code
      : "directory_service";
  const messages = m as unknown as Record<string, () => string>;
  return messages[key]?.() ?? m.error_service();
}
export function useDirectoryPages<T>(key: readonly unknown[], path: string) {
  return useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      directoryRequest<Page<T>>(
        path +
          (path.includes("?") ? "&" : "?") +
          (pageParam ? "cursor=" + encodeURIComponent(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
