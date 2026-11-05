import { Check, Plus, Undo2, Users } from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { directoryRequest } from "../community/client";
import { ErrorNotice, Schedule } from "../activities/Activities";
import { sessionTitle, type Session } from "../activities/contracts";
import { DirectoryHeader } from "../components/shared/directory-layout";
import { SearchField } from "../components/shared/search-field";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { ActionButton } from "../components/shared/action-button";
import { Button } from "../components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import { m } from "../paraglide/messages.js";
import type { AttendancePerson, AttendanceSummary } from "./contracts";
import type { useAttendanceMembership } from "./use-attendance-membership";

export function QuickCheckIn({
  path,
  queryKey,
  session,
  membership,
  source,
  search,
  onFiltersChange,
  onMultiple,
}: {
  path: string;
  queryKey: string[];
  session: Session;
  membership: ReturnType<typeof useAttendanceMembership>;
  source: "suggested" | "all";
  search: string;
  onFiltersChange: (source: "suggested" | "all", search: string) => void;
  onMultiple: () => void;
}) {
  const people = useInfiniteQuery({
    queryKey: [...queryKey, "quick-check-in", source, search],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      directoryRequest<{
        items: AttendancePerson[];
        nextCursor: string | null;
        summary: AttendanceSummary;
      }>(
        path +
          "?roster=" +
          (source === "suggested" ? "suggested" : "picker") +
          "&q=" +
          encodeURIComponent(search) +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = people.data?.pages.flatMap((page) => page.items) ?? [];
  const summary = people.data?.pages[0]?.summary;
  const canEdit = summary?.canEdit === true && !people.isError;
  const pendingPerson = membership.pendingPersonId;
  return (
    <section className="attendance-page check-in-page">
      <DirectoryHeader
        title={m.checkin_title()}
        autoFocus={false}
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={!canEdit || membership.blocked}
            onClick={onMultiple}
          >
            <Users aria-hidden="true" />
            {m.checkin_multiple()}
          </Button>
        }
      />
      <div className="attendance-context">
        <h2>{sessionTitle(session)}</h2>
        {session.topic && <p className="activity-note">{session.name}</p>}
        <Schedule {...session} compact />
        {summary && (
          <p className="check-in-total">
            {m.checkin_present_count({ count: String(summary.present) })}
          </p>
        )}
      </div>
      {membership.notice}
      {membership.lastAdded.length > 0 && (
        <div className="check-in-undo">
          <p>
            {membership.lastAdded.length === 1
              ? membership.lastAdded[0]!.name
              : m.checkin_added_count({
                  count: String(membership.lastAdded.length),
                })}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={!canEdit || membership.blocked}
            onClick={() =>
              void membership.change(membership.lastAdded, "remove")
            }
          >
            <Undo2 aria-hidden="true" />
            {m.checkin_undo()}
          </Button>
        </div>
      )}
      {summary && !summary.canEdit && (
        <p role="status" className="attendance-notice">
          {summary.cancelled
            ? m.attendance_cancelled()
            : m.attendance_not_started()}
        </p>
      )}
      <SearchField
        id="check-in-search"
        label={m.checkin_search()}
        value={search}
        onChange={(event) => onFiltersChange(source, event.target.value)}
      />
      <Tabs
        value={source}
        onValueChange={(value) =>
          onFiltersChange(value as "suggested" | "all", search)
        }
      >
        <TabsList aria-label={m.checkin_contacts()}>
          <TabsTrigger value="suggested">{m.checkin_suggested()}</TabsTrigger>
          <TabsTrigger value="all">{m.checkin_all()}</TabsTrigger>
        </TabsList>
        <p className="activity-note">{m.checkin_tap_help()}</p>
        <TabsContent value={source}>
          {people.isPending ? (
            <ListSkeleton />
          ) : people.isError ? (
            <ErrorNotice
              error={people.error}
              pending={people.isFetching}
              retry={() => void people.refetch()}
            />
          ) : (
            <>
              <div className="check-in-list">
                {rows.map((person) => {
                  const present = person.status === "present";
                  return (
                    <div
                      className="check-in-row"
                      key={person.id}
                      data-present={present}
                    >
                      <div>
                        <strong>{person.name}</strong>
                        {present && (
                          <p className="activity-note">
                            {m.attendance_added()}
                          </p>
                        )}
                      </div>
                      <ActionButton
                        variant="outline"
                        pending={pendingPerson === person.id}
                        disabled={
                          !canEdit ||
                          membership.blocked ||
                          present ||
                          !person.eligible ||
                          person.archived
                        }
                        aria-label={
                          present
                            ? m.checkin_already({ name: person.name })
                            : m.checkin_person({ name: person.name })
                        }
                        onClick={() => void membership.change(person, "add")}
                      >
                        {pendingPerson !== person.id &&
                          (present ? (
                            <Check aria-hidden="true" />
                          ) : (
                            <Plus aria-hidden="true" />
                          ))}
                        <span>
                          {present
                            ? m.attendance_present()
                            : m.checkin_action()}
                        </span>
                      </ActionButton>
                    </div>
                  );
                })}
              </div>
              {!rows.length && (
                <div className="check-in-empty">
                  <p>
                    {search
                      ? m.attendance_empty()
                      : source === "suggested"
                        ? m.checkin_no_suggestions()
                        : m.attendance_empty()}
                  </p>
                  {source === "suggested" && (
                    <Button
                      variant="outline"
                      onClick={() => onFiltersChange("all", search)}
                    >
                      {m.checkin_all()}
                    </Button>
                  )}
                </div>
              )}
              <InfiniteFooter {...people} />
            </>
          )}
        </TabsContent>
      </Tabs>
      <details className="session-help">
        <summary>{m.checkin_about()}</summary>
        <p>{m.checkin_suggested_help()}</p>
        <p>{m.checkin_help()}</p>
      </details>
    </section>
  );
}
