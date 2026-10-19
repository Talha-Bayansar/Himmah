import { useEffect, useState } from "react";
import { Search, Check } from "lucide-react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { DirectoryError, useDirectoryPages } from "../community/client";
import { PointsError } from "./PointsShared";
import { m } from "../paraglide/messages.js";
export type PointsOption = {
  id: string;
  name: string;
  startsAt?: string;
  createdAt: string;
};
export function PointsOptions({
  path,
  scope,
  selected,
  onToggle,
  multiple = false,
  disabled = false,
  format,
  searchable = true,
}: {
  path: string;
  scope: readonly unknown[];
  selected: Map<string, PointsOption>;
  onToggle: (item: PointsOption) => void;
  multiple?: boolean;
  disabled?: boolean;
  format?: (item: PointsOption) => string;
  searchable?: boolean;
}) {
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const pages = useDirectoryPages<PointsOption>(
    [...scope, query],
    path +
      (path.includes("?") ? "&" : "?") +
      (searchable ? "q=" + encodeURIComponent(query) : ""),
  );
  const items = pages.data?.pages.flatMap((p) => p.items) ?? [];
  const blocked =
    pages.isError &&
    (!pages.isFetchNextPageError ||
      (pages.error instanceof DirectoryError &&
        ["forbidden", "not_found", "sign_in"].includes(pages.error.code)));
  return (
    <div className="points-options">
      {searchable && (
        <div className="directory-toolbar">
          <label>
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">{m.directory_search()}</span>
            <Input
              type="search"
              maxLength={80}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={m.directory_search()}
              disabled={disabled}
            />
          </label>
        </div>
      )}
      <div className="points-option-list">
        {pages.isPending ? (
          <ListSkeleton />
        ) : blocked ? (
          <PointsError
            error={pages.error}
            pending={pages.isFetching}
            retry={() => {
              void pages.refetch();
            }}
          />
        ) : (
          <>
            <ul className="directory-list">
              {items.map((item) => (
                <li key={item.id}>
                  {multiple ? (
                    <label className="bulk-member-option">
                      <Checkbox
                        checked={selected.has(item.id)}
                        disabled={
                          disabled ||
                          (!selected.has(item.id) && selected.size >= 50)
                        }
                        onCheckedChange={() => onToggle(item)}
                      />
                      <span>{format?.(item) ?? item.name}</span>
                    </label>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => onToggle(item)}
                    >
                      {selected.has(item.id) && <Check aria-hidden="true" />}
                      {format?.(item) ?? item.name}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {items.length === 0 ? (
              <p>{m.directory_empty()}</p>
            ) : (
              <InfiniteFooter
                {...pages}
                fetchNextPage={() =>
                  pages.fetchNextPage({ cancelRefetch: false })
                }
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
