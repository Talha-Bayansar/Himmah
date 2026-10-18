import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Plus,
  CalendarDays,
  Pencil,
  Ban,
  ArrowLeft,
  ArrowRight,
  MapPin,
} from "lucide-react";
import { m } from "../paraglide/messages.js";
import { useLocale } from "../localization/locale";
import type { Organization } from "../organization/contracts";
import type { Activity, Session } from "./contracts";
import { directoryRequest, useDirectoryPages } from "../community/client";
import { activityKey, ErrorNotice, Audience, Schedule } from "./Activities";
import { EntityEditor } from "./EntityEditor";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ItemActions } from "../components/shared/item-actions";
import {
  ListSkeleton,
  InfiniteFooter,
} from "../components/shared/infinite-list";
export default function Sessions({
  organization,
  userId,
  activity,
  sessionId,
}: {
  organization: Organization;
  userId: string;
  activity: Activity;
  sessionId: string | null;
}) {
  const locale = useLocale()?.locale ?? "en",
    cache = useQueryClient(),
    [view, setView] = useState("upcoming"),
    [editor, setEditor] = useState<{
      kind: "session" | "cancel";
      parent: Activity;
      item: Session | null;
    } | null>(null);
  const base = `/api/organizations/${organization.id}/activities/${activity.id}/sessions`,
    key = [...activityKey(userId, organization.id), "sessions", activity.id];
  const canManage = ["owner", "admin"].includes(organization.role);
  const query = useDirectoryPages<Session>(
    [...key, "list", view],
    base + "?view=" + view,
    { enabled: !sessionId },
  );
  const detail = useQuery({
    queryKey: [...key, "detail", sessionId],
    enabled: !!sessionId,
    queryFn: ({ signal }) =>
      directoryRequest<{ item: Session }>(base + "/" + sessionId, { signal }),
  });
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [detail.data?.item.id]);
  const operation = useMutation({
    mutationFn: async ({
      value,
      creationKey,
      parentVersion,
      item,
      kind,
    }: {
      value: Record<string, unknown>;
      creationKey: string;
      parentVersion: number;
      item: Session | null;
      kind: "session" | "cancel";
    }) => {
      const result = await directoryRequest<{ item: Session }>(
        base + (item ? "/" + item.id : ""),
        {
          method: item ? "PATCH" : "POST",
          body: JSON.stringify(
            kind === "cancel"
              ? {
                  cancelled: true,
                  version: item!.version,
                  reason: value.reason,
                }
              : {
                  ...value,
                  version: item?.version ?? parentVersion,
                  ...(!item ? { key: creationKey } : {}),
                },
          ),
        },
      );
      cache.setQueryData([...key, "detail", result.item.id], result);
      await cache.invalidateQueries({
        queryKey: activityKey(userId, organization.id),
      });
      setEditor(null);
    },
    onError: () => {
      void cache.invalidateQueries({
        queryKey: activityKey(userId, organization.id),
      });
    },
  });
  const row = (item: Session, full = false) => {
    const past = Date.parse(item.startsAt) <= Date.now();
    const label = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: item.timezone,
    }).format(new Date(item.startsAt));
    return (
      <article key={item.id} className="activity-card">
        <div className="activity-card-heading">
          <span className="activity-card-icon">
            <CalendarDays size={22} aria-hidden="true" />
          </span>
          <div className="activity-card-heading-copy">
            {full ? (
              <h1
                className="activity-card-title"
                tabIndex={-1}
                data-page-heading
                ref={heading}
              >
                {item.name}
              </h1>
            ) : (
              <h3 className="activity-card-title">{label}</h3>
            )}
            {item.cancelled && (
              <p className="activity-status">{m.sessions_cancelled()}</p>
            )}
          </div>
          {canManage && !item.cancelled && !past && (
            <ItemActions
              name={label}
              actions={[
                {
                  label: m.sessions_edit(),
                  icon: Pencil,
                  onSelect: () =>
                    setEditor({ kind: "session", item, parent: activity }),
                },
                {
                  label: m.sessions_cancel(),
                  icon: Ban,
                  destructive: true,
                  onSelect: () =>
                    setEditor({ kind: "cancel", item, parent: activity }),
                },
              ]}
            />
          )}
        </div>
        <Schedule {...item} />
        {full && (
          <>
            <Audience groups={item.groups} />
            {item.location && (
              <p className="activity-location">
                <MapPin size={16} aria-hidden="true" />
                <span>{item.location}</span>
              </p>
            )}
            {item.description && (
              <p className="activity-description">{item.description}</p>
            )}
            <p className="activity-note">{m.sessions_snapshot_help()}</p>
            {past && <p className="activity-note">{m.sessions_past_help()}</p>}
          </>
        )}
        {item.cancelled && item.cancellationReason && (
          <p className="activity-description">{item.cancellationReason}</p>
        )}
        {!full && (
          <Button variant="outline" className="activity-card-primary" asChild>
            <Link
              to="/workspace/$organizationId/activities/$activityId/sessions/$sessionId"
              params={{
                organizationId: organization.id,
                activityId: activity.id,
                sessionId: item.id,
              }}
            >
              <ArrowRight size={16} aria-hidden="true" />
              {m.sessions_view()}
            </Link>
          </Button>
        )}
      </article>
    );
  };
  return (
    <section className="activity-sessions" aria-label={m.sessions_title()}>
      {sessionId ? (
        <>
          <Button variant="link" asChild className="settings-back">
            <Link
              to="/workspace/$organizationId/activities/$activityId"
              params={{
                organizationId: organization.id,
                activityId: activity.id,
              }}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {activity.name}
            </Link>
          </Button>
          {detail.isPending ? (
            <ListSkeleton />
          ) : detail.isError ? (
            <ErrorNotice
              error={detail.error}
              pending={detail.isFetching}
              retry={() => void detail.refetch()}
            />
          ) : (
            row(detail.data.item, true)
          )}
        </>
      ) : (
        <>
          <div className="session-heading">
            <h2>{m.sessions_title()}</h2>
            {canManage && !activity.cancelled && (
              <Button
                onClick={() =>
                  setEditor({ kind: "session", item: null, parent: activity })
                }
              >
                <Plus size={16} aria-hidden="true" />
                {m.sessions_add()}
              </Button>
            )}
          </div>
          <Tabs value={view} onValueChange={setView}>
            <TabsList aria-label={m.sessions_title()}>
              <TabsTrigger value="upcoming">
                {m.sessions_upcoming()}
              </TabsTrigger>
              <TabsTrigger value="past">{m.sessions_past()}</TabsTrigger>
            </TabsList>
          </Tabs>
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
              <div className="activity-list">
                {query.data?.pages
                  .flatMap((page) => page.items)
                  .map((item) => row(item))}
              </div>
              {!query.data?.pages.some((page) => page.items.length) && (
                <p className="directory-empty">{m.sessions_empty()}</p>
              )}
              <InfiniteFooter {...query} />
            </>
          )}
        </>
      )}
      {editor && (
        <EntityEditor
          kind={editor.kind}
          activity={editor.parent}
          session={editor.item}
          organization={organization}
          userId={userId}
          onClose={() => setEditor(null)}
          onSave={(value, creationKey) =>
            operation.mutateAsync({
              value,
              creationKey,
              parentVersion: editor.parent.version,
              item: editor.item,
              kind: editor.kind,
            })
          }
        />
      )}
    </section>
  );
}
