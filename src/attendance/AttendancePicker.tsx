import { useEffect, useState, type ReactNode } from "react";
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
import { Checkbox } from "../components/ui/checkbox";
import type { AttendancePerson as Person } from "./contracts";
import { m } from "../paraglide/messages.js";
import type { AttendancePerson } from "./contracts";

/** Search the authorized audience, independently of the paginated session list. */
export function AttendancePicker({
  path,
  queryKey,
  onClose,
  onSelect,
  pending,
  completed,
  notice,
}: {
  path: string;
  queryKey: string[];
  onClose: () => void;
  onSelect: (people: AttendancePerson[]) => Promise<boolean>;
  pending: boolean;
  completed: number;
  notice: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Map<string, Person>>(new Map());
  useEffect(() => setSelected(new Map()), [completed]);
  const people = useInfiniteQuery({
    queryKey: [...queryKey, "add-participant", search],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      directoryRequest<{
        items: AttendancePerson[];
        nextCursor: string | null;
      }>(
        path +
          "?roster=picker&q=" +
          encodeURIComponent(search) +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = people.data?.pages.flatMap((page) => page.items) ?? [];
  useEffect(() => {
    const current = new Map(
      people.data?.pages
        .flatMap((page) => page.items)
        .map((person) => [person.id, person]) ?? [],
    );
    setSelected((previous) => {
      const next = new Map(
        [...previous].filter(([id]) => {
          const person = current.get(id);
          return (
            !person ||
            (person.status !== "present" && person.eligible && !person.archived)
          );
        }),
      );
      return next.size === previous.size ? previous : next;
    });
  }, [people.data]);
  const add = async () => {
    const current = new Map(rows.map((p) => [p.id, p]));
    const records = [...selected.values()].map((p) => current.get(p.id) ?? p);
    if (await onSelect(records)) setSelected(new Map());
  };
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
                <label
                  className={
                    "attendance-picker-row" +
                    (person.status === "present" ? " is-present" : "")
                  }
                  key={person.id}
                >
                  <div>
                    <strong>{person.name}</strong>
                    {person.status === "present" && (
                      <p className="activity-note">{m.attendance_added()}</p>
                    )}
                  </div>
                  <Checkbox
                    aria-label={m.attendance_select({ name: person.name })}
                    checked={
                      person.status === "present" || selected.has(person.id)
                    }
                    disabled={
                      pending ||
                      person.status === "present" ||
                      !person.eligible ||
                      person.archived ||
                      (!selected.has(person.id) && selected.size >= 50)
                    }
                    onCheckedChange={(checked) =>
                      setSelected((previous) => {
                        const next = new Map(previous);
                        if (checked) next.set(person.id, person);
                        else next.delete(person.id);
                        return next;
                      })
                    }
                  />
                </label>
              );
            })}
          </div>
          {!rows.length && (
            <p className="directory-empty">{m.attendance_empty()}</p>
          )}
          <InfiniteFooter {...people} />
        </>
      )}
      <div className="directory-actions">
        <Button disabled={pending || !selected.size} onClick={() => void add()}>
          <Plus aria-hidden="true" />
          {m.management_add_selected({ count: String(selected.size) })}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onClose}
        >
          {m.done()}
        </Button>
      </div>
    </FormSurface>
  );
}
