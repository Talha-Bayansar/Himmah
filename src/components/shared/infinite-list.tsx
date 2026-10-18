import { useEffect, useRef } from "react";
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
        <Skeleton key={key} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}
export function InfiniteFooter({
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  fetchNextPage,
}: {
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => Promise<unknown>;
}) {
  useLocale();
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
      ) : (
        <p role="status">{m.directory_end()}</p>
      )}
    </div>
  );
}
