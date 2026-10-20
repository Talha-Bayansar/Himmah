import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck, ArrowRight, Check } from "lucide-react";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { useLocale } from "../localization/locale";
import {
  DirectoryError,
  directoryRequest,
  useDirectoryPages,
} from "../community/client";
import { ActionButton } from "../components/shared/action-button";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { PointsError } from "../points/PointsShared";
import type { HubNotification, NotificationKind } from "./contracts";
const prefix = (user: string, org: string) => ["notifications", user, org];
export function useUnread(userId: string, organizationId: string) {
  return useQuery({
    queryKey: [...prefix(userId, organizationId), "unread"],
    queryFn: ({ signal }) =>
      directoryRequest<{ count: number }>(
        `/api/organizations/${organizationId}/notifications/unread`,
        { signal },
      ),
    refetchInterval: 30000,
    retry: false,
  });
}
export function NotificationBell({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  useLocale();
  const unread = useUnread(userId, organizationId),
    cache = useQueryClient();
  useEffect(() => {
    const update = (event: MessageEvent) => {
      if (event.data?.type === "himmah-notifications")
        void cache.invalidateQueries({
          queryKey: prefix(userId, organizationId),
        });
    };
    navigator.serviceWorker?.addEventListener("message", update);
    return () =>
      navigator.serviceWorker?.removeEventListener("message", update);
  }, [userId, organizationId, cache]);
  const count = unread.isError ? 0 : (unread.data?.count ?? 0);
  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="notification-shortcut"
    >
      <Link
        to="/workspace/$organizationId/$section"
        params={{ organizationId, section: "notifications" }}
        aria-label={m.notifications_bell({
          count: String(count >= 100 ? "99+" : count),
        })}
      >
        <Bell aria-hidden="true" size={22} />
        {unread.isPending ? (
          <Skeleton className="notification-count-skeleton" />
        ) : count > 0 ? (
          <span aria-hidden="true" className="notification-count">
            {count >= 100 ? "99+" : count}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
export function notificationText(kind: NotificationKind) {
  return (
    {
      points_awarded: m.notification_points_awarded,
      points_corrected: m.notification_points_corrected,
      challenge_pending: m.notification_challenge_pending,
      challenge_approved: m.notification_challenge_approved,
      challenge_feedback: m.notification_challenge_feedback,
      reward_pending: m.notification_reward_pending,
      reward_reserved: m.notification_reward_reserved,
      reward_collected: m.notification_reward_collected,
      reward_cancelled: m.notification_reward_cancelled,
    }[kind]?.() ?? m.notifications_open()
  );
}
export function Notifications({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  useLocale();
  const cache = useQueryClient(),
    heading = useRef<HTMLHeadingElement>(null),
    key = prefix(userId, organizationId),
    base = `/api/organizations/${organizationId}/notifications`;
  const list = useDirectoryPages<HubNotification>([...key, "list"], base),
    unread = useUnread(userId, organizationId);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  const read = useMutation({
    mutationFn: (id: string | null) =>
      directoryRequest(base + "/" + (id ?? "read"), {
        method: "POST",
        body: "{}",
      }),
    onSuccess: () => cache.invalidateQueries({ queryKey: key }),
  });
  const authorizationLost = [list.error, unread.error, read.error].some(
    (error) =>
      error instanceof DirectoryError &&
      ["forbidden", "not_found", "sign_in"].includes(error.code),
  );
  const fatal =
    authorizationLost ||
    (list.isError &&
      (!list.isFetchNextPageError ||
        (list.error instanceof DirectoryError &&
          ["forbidden", "not_found", "sign_in"].includes(list.error.code))));
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section className="directory notifications-page">
      <div className="directory-heading">
        <div>
          <h1 data-page-heading tabIndex={-1} ref={heading}>
            {m.notifications_title()}
          </h1>
          <p>{m.notifications_help()}</p>
        </div>
      </div>
      {!fatal && (
        <ActionButton
          className="notifications-mark-all"
          variant="outline"
          pending={read.isPending && read.variables === null}
          disabled={read.isPending || unread.isError || !unread.data?.count}
          onClick={() => read.mutate(null)}
        >
          <CheckCheck aria-hidden="true" />
          {m.notifications_mark_all()}
        </ActionButton>
      )}
      {read.isError && !fatal && (
        <PointsError
          error={read.error}
          retry={() => read.mutate(read.variables ?? null)}
          pending={read.isPending}
        />
      )}
      {list.isPending ? (
        <ListSkeleton />
      ) : fatal ? (
        <PointsError
          error={list.error ?? unread.error ?? read.error}
          retry={() => {
            read.reset();
            void cache.invalidateQueries({ queryKey: key });
          }}
          pending={list.isFetching || unread.isFetching}
        />
      ) : (
        <>
          <ul className="notification-list">
            {rows.map((item) => (
              <li
                key={item.id}
                className={item.readAt ? "is-read" : "is-unread"}
              >
                <Link
                  to={item.href}
                  onClick={() => {
                    if (!item.readAt && !read.isPending) read.mutate(item.id);
                  }}
                >
                  <span className="notification-indicator" aria-hidden="true" />
                  <div>
                    <span className="sr-only">
                      {!item.readAt ? m.notifications_unread() + ": " : ""}
                    </span>
                    <strong>{notificationText(item.kind)}</strong>
                    <time dateTime={new Date(item.createdAt).toISOString()}>
                      {new Intl.DateTimeFormat(getLocale(), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(item.createdAt))}
                    </time>
                  </div>
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
                {!item.readAt && (
                  <ActionButton
                    size="icon"
                    variant="ghost"
                    aria-label={m.notifications_read()}
                    pending={read.isPending && read.variables === item.id}
                    disabled={read.isPending}
                    onClick={() => read.mutate(item.id)}
                  >
                    <Check aria-hidden="true" />
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
          {!rows.length ? (
            <p className="directory-empty">{m.notifications_empty()}</p>
          ) : (
            <InfiniteFooter
              {...list}
              fetchNextPage={() => list.fetchNextPage({ cancelRefetch: false })}
            />
          )}
        </>
      )}
    </section>
  );
}
