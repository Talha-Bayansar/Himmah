import { History, X } from "lucide-react";
import { m } from "../paraglide/messages.js";
import { useLocale } from "../localization/locale";
import { useDirectoryPages } from "../community/client";
import { ErrorNotice } from "../activities/Activities";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import {
  ListSkeleton,
  InfiniteFooter,
} from "../components/shared/infinite-list";
import { statusLabel } from "./Attendance";
import type { AttendancePerson, AttendanceChange } from "./contracts";
export function AttendanceHistory({
  person,
  path,
  queryKey,
  timezone,
  onClose,
}: {
  person: AttendancePerson;
  path: string;
  queryKey: readonly unknown[];
  timezone: string;
  onClose: () => void;
}) {
  const locale = useLocale()?.locale ?? "en";
  const query = useDirectoryPages<AttendanceChange>(
    [...queryKey, "history", person.id],
    path + "/" + person.id + "/history",
    { staleTime: 0, refetchOnMount: "always" },
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{m.attendance_history()}</DialogTitle>
          <DialogDescription>
            {m.attendance_history_for({ name: person.name })}
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError && !query.data ? (
          <ErrorNotice
            error={query.error}
            pending={query.isFetching}
            retry={() => void query.refetch()}
          />
        ) : (
          <>
            <div className="attendance-history">
              {query.data?.pages
                .flatMap((page) => page.items)
                .map((change) => (
                  <article key={change.id}>
                    <p className="attendance-history-change">
                      <History size={16} aria-hidden="true" />
                      {m.attendance_change({
                        before: statusLabel(change.beforeStatus),
                        after: statusLabel(change.afterStatus),
                      })}
                    </p>
                    <time dateTime={change.createdAt}>
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: timezone,
                      }).format(new Date(change.createdAt))}
                    </time>
                    <p>
                      {m.attendance_by({
                        name: change.actorName ?? m.attendance_staff(),
                      })}
                    </p>
                    {change.reason && <p>{change.reason}</p>}
                  </article>
                ))}
            </div>
            {!query.data?.pages.some((page) => page.items.length) && (
              <p>{m.attendance_history_empty()}</p>
            )}
            <InfiniteFooter {...query} />
          </>
        )}
        <Button type="button" variant="outline" onClick={onClose}>
          <X size={16} aria-hidden="true" />
          {m.close()}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
