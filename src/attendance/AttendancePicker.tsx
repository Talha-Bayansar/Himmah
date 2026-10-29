import { useState, type ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Search, Plus } from "lucide-react";
import { directoryRequest } from "../community/client";
import { ErrorNotice } from "../activities/Activities";
import { FormSurface } from "../components/shared/form-surface";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { m } from "../paraglide/messages.js";
import type { AttendancePerson } from "./contracts";

/** Search the authorized audience, independently of the paginated session list. */
export function AttendancePicker({
  path,
  queryKey,
  onClose,
  onSelect,
  pending,
  notice,
}: {
  path: string;
  queryKey: string[];
  onClose: () => void;
  onSelect: (person: AttendancePerson) => void;
  pending: boolean;
  notice: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const people = useInfiniteQuery({
    queryKey: [...queryKey, "add-participant", search],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      directoryRequest<{
        items: AttendancePerson[];
        nextCursor: string | null;
      }>(
        path +
          "?roster=available&q=" +
          encodeURIComponent(search) +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = (people.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (person) => person.status !== "present",
  );
  return (
    <FormSurface
      title={m.attendance_add()}
      description={m.attendance_add_help()}
      onClose={onClose}
    >
      {notice}
      <label className="activity-group-search">
        <Search size={17} aria-hidden="true" />
        <span className="sr-only">{m.directory_search()}</span>
        <Input
          type="search"
          maxLength={80}
          value={search}
          placeholder={m.directory_search()}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {people.isPending ? (
        <ListSkeleton />
      ) : people.isError && !people.data ? (
        <ErrorNotice
          error={people.error}
          pending={people.isFetching}
          retry={() => void people.refetch()}
        />
      ) : (
        <>
          <div className="attendance-picker-list">
            {rows.map((person) => {
              return (
                <div className="attendance-picker-row" key={person.id}>
                  <div>
                    <strong>{person.name}</strong>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={pending || !person.eligible || person.archived}
                    aria-label={m.attendance_select({ name: person.name })}
                    onClick={() => onSelect(person)}
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </div>
              );
            })}
          </div>
          {!rows.length && (
            <p className="directory-empty">{m.attendance_empty()}</p>
          )}
          <InfiniteFooter {...people} />
        </>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={onClose}
      >
        {m.done()}
      </Button>
    </FormSurface>
  );
}
