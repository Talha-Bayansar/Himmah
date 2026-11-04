import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { SearchField } from "../components/shared/search-field";
import { directoryRequest, DirectoryError } from "../community/client";
import { FormSurface } from "../components/shared/form-surface";
import { Button } from "../components/ui/button";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { ErrorNotice } from "../activities/Activities";
import { useSearch } from "../modules/people/shared";
import { m } from "../paraglide/messages.js";
import type { InsightsOption } from "./contracts";
export function OptionPicker({
  kind,
  org,
  user,
  onSelect,
  onClose,
  onAccessError,
}: {
  kind: "activities" | "groups";
  org: string;
  user: string;
  onSelect: (id: string, name: string) => void;
  onClose: () => void;
  onAccessError?: (error: unknown) => void;
}) {
  const [q, setQ] = useState("");
  const search = useSearch(q);
  const query = useInfiniteQuery({
    queryKey: ["organization", user, org, "insights-options", kind, search],
    initialPageParam: null as string | null,
    retry: false,
    queryFn: ({ pageParam, signal }) =>
      directoryRequest<{ items: InsightsOption[]; nextCursor: string | null }>(
        `/api/organizations/${org}/insights/options?kind=${kind}&q=${encodeURIComponent(search)}` +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  });
  useEffect(() => {
    if (
      query.error instanceof DirectoryError &&
      ["forbidden", "not_found", "sign_in", "verify_required"].includes(
        query.error.code,
      )
    )
      onAccessError?.(query.error);
  }, [query.error, onAccessError]);
  return (
    <FormSurface
      title={kind === "activities" ? m.insights_activity() : m.insights_group()}
      description={m.insights_choose()}
      onClose={onClose}
    >
      <SearchField
        label={m.directory_search()}
        id="insights-option-search"
        maxLength={80}
        value={q}
        placeholder={m.directory_search()}
        onChange={(e) => setQ(e.target.value)}
      />
      <Button variant="ghost" onClick={() => onSelect("", "")}>
        {m.insights_all()}
      </Button>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError &&
        (!query.data ||
          (query.error instanceof DirectoryError &&
            ["forbidden", "not_found", "sign_in"].includes(
              query.error.code,
            ))) ? (
        <ErrorNotice
          error={query.error}
          pending={query.isFetching}
          retry={() => void query.refetch()}
        />
      ) : (
        <>
          <div className="insights-options">
            {query.data?.pages
              .flatMap((p) => p.items)
              .map((item) => (
                <Button
                  key={item.id}
                  variant="ghost"
                  onClick={() => onSelect(item.id, item.name)}
                >
                  {item.name}
                  {item.archived && (
                    <span className="activity-note">
                      {m.insights_archived()}
                    </span>
                  )}
                </Button>
              ))}
          </div>
          {!query.data?.pages.some((p) => p.items.length) && (
            <p className="directory-empty">{m.attendance_empty()}</p>
          )}
          <InfiniteFooter {...query} />
        </>
      )}
      <Button variant="outline" onClick={onClose}>
        {m.done()}
      </Button>
    </FormSurface>
  );
}
