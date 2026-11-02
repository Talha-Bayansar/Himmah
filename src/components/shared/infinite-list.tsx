import { useEffect, useRef, type CSSProperties } from "react";
import { Skeleton } from "../ui/skeleton";
import { ActionButton } from "./action-button";
import { m } from "../../paraglide/messages.js";
import { useLocale } from "../../localization/locale";
export function ListSkeleton() {
  useLocale();
  return (
    <div role="status" aria-label={m.directory_loading()} className="space-y-3">
      <span className="sr-only">{m.directory_loading()}</span>
      {[1, 2, 3].map((key) => (
        <div key={key} className="list-skeleton-row" aria-hidden="true">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
export function MetricSkeleton({
  count = 2,
  columns = Math.min(count, 2),
}: {
  count?: number;
  columns?: number;
}) {
  useLocale();
  return (
    <div
      role="status"
      aria-label={m.directory_loading()}
      className="metric-grid metric-skeleton"
      style={{ "--metric-columns": columns } as CSSProperties}
    >
      <span className="sr-only">{m.directory_loading()}</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden="true">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-7 w-1/2" />
        </div>
      ))}
    </div>
  );
}
export function InfiniteFooter({
  data,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  fetchNextPage,
}: {
  data?: { pages: unknown[] } | undefined;
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => Promise<unknown>;
}) {
  useLocale();
  const expanded = (data?.pages.length ?? 1) > 1;
  const sentinel = useRef<HTMLDivElement>(null);
  const running = useRef(false);
  useEffect(() => {
    if (
      !hasNextPage ||
      isFetchingNextPage ||
      isFetchNextPageError ||
      typeof IntersectionObserver === "undefined" ||
      !sentinel.current
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || running.current) return;
        running.current = true;
        void fetchNextPage()
          .catch(() => {})
          .finally(() => {
            running.current = false;
          });
      },
      { rootMargin: "240px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);
  if (!hasNextPage && !expanded && !isFetchNextPageError) return null;
  return (
    <div className="directory-more" ref={sentinel}>
      {isFetchNextPageError && <p role="alert">{m.directory_page_error()}</p>}
      {hasNextPage ? (
        <ActionButton
          type="button"
          variant="outline"
          pending={isFetchingNextPage}
          onClick={() => {
            void fetchNextPage().catch(() => {});
          }}
        >
          {isFetchNextPageError ? m.try_again() : m.directory_load_more()}
        </ActionButton>
      ) : expanded ? (
        <p role="status">{m.directory_end()}</p>
      ) : null}
    </div>
  );
}
