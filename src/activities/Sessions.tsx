import { SessionStatsPreview } from "../attendance/SessionStats";
import { sessionPrice, sessionTitle } from "./contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Banknote,
  Ban,
  CalendarDays,
  ClipboardCheck,
  MapPin,
  Pencil,
  Plus,
  Repeat2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  DirectoryError,
  directoryRequest,
  useDirectoryPages,
} from "../community/client";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { ItemActions } from "../components/shared/item-actions";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useLocale } from "../localization/locale";
import type { Organization } from "../organization/contracts";
import { m } from "../paraglide/messages.js";
import { activityKey, Audience, ErrorNotice, Schedule } from "./Activities";
import type { Activity, Session } from "./contracts";
import { useFormNavigation } from "../components/shared/form-navigation";
import { EntityEditor } from "./EntityEditor";
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
  const navigate = useNavigate();
  const openForm = useFormNavigation(organization.id);
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
        queryKey: ["organization", userId, organization.id],
      });
      setEditor(null);
    },
    onError: () => {
      void cache.invalidateQueries({
        queryKey: ["organization", userId, organization.id],
      });
    },
  });
  const row = (item: Session, full = false) => {
    const past = Date.parse(item.startsAt) <= Date.now();
    const canOperate = canManage || item.canAttend === true;
    const canCash =
      (canManage || item.canCollect === true) && (item.priceMinor ?? 0) > 0;
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
                {sessionTitle(item)}
              </h1>
            ) : (
              <h3 className="activity-card-title">{item.topic || label}</h3>
            )}
            {item.seriesId && (
              <p className="activity-note">{m.series_member()}</p>
            )}
            {item.topic && <p className="activity-note">{item.name}</p>}
            {item.cancelled && (
              <p className="activity-status">{m.sessions_cancelled()}</p>
            )}
            {item.requiresCancellationReview && (
              <p className="activity-note">
                {full
                  ? m.cancellation_money_review()
                  : m.cancellation_review_needed()}
              </p>
            )}
          </div>
          {(canOperate ||
            canCash ||
            (canManage && !item.cancelled && !past)) && (
            <ItemActions
              name={item.topic ? `${item.topic} · ${label}` : label}
              actions={[
                ...(!canOperate && canCash && !full
                  ? [
                      {
                        label: m.management_open(),
                        icon: Banknote,
                        onSelect: () =>
                          navigate({
                            to: "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/attendance",
                            params: {
                              organizationId: organization.id,
                              activityId: activity.id,
                              sessionId: item.id,
                            },
                            search: { q: "" },
                          }),
                      },
                    ]
                  : []),
                ...(canOperate
                  ? [
                      {
                        label: m.registration_title(),
                        icon: Plus,
                        onSelect: () =>
                          navigate({
                            to: "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/registrations",
                            params: {
                              organizationId: organization.id,
                              activityId: activity.id,
                              sessionId: item.id,
                            },
                            search: { q: "", view: "confirmed" },
                          }),
                      },
                      ...(!full
                        ? [
                            {
                              label: m.management_open(),
                              icon: ClipboardCheck,
                              onSelect: () =>
                                navigate({
                                  to: "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/attendance",
                                  params: {
                                    organizationId: organization.id,
                                    activityId: activity.id,
                                    sessionId: item.id,
                                  },
                                }),
                            },
                          ]
                        : []),
                    ]
                  : []),
                ...(canManage && !activity.cancelled && !item.cancelled && !past
                  ? [
                      ...(!item.registrationLocked
                        ? [
                            {
                              label: m.series_change_schedule(),
                              icon: Repeat2,
                              onSelect: () =>
                                openForm(
                                  "session-schedule",
                                  activity.id,
                                  item.id,
                                ),
                            },
                            {
                              label: m.sessions_edit(),
                              icon: Pencil,
                              onSelect: () =>
                                setEditor({
                                  kind: "session",
                                  item,
                                  parent: activity,
                                }),
                            },
                          ]
                        : []),
                      {
                        label: m.sessions_cancel(),
                        icon: Ban,
                        destructive: true,
                        onSelect: () =>
                          openForm("session-cancel", activity.id, item.id),
                      },
                    ]
                  : []),
              ]}
            />
          )}
        </div>
        <Schedule {...item} compact={!full} />
        {(item.priceMinor ?? 0) > 0 && (
          <p className="activity-status">
            {m.pricing_per_session({
              price: sessionPrice(item.priceMinor!, locale),
            })}
          </p>
        )}
        {full && canOperate && (
          <SessionStatsPreview
            user={userId}
            org={organization.id}
            activity={activity.id}
            session={item.id}
            paidSession={(item.priceMinor ?? 0) > 0}
          />
        )}
        {canOperate && item.registration && (
          <div className="session-registration-summary">
            <p className="activity-status">
              {item.registration.mode === "required"
                ? m.registration_required()
                : m.registration_optional_short()}
            </p>
            <p>
              {m.registration_reserved({
                count: String(item.registration.confirmed),
              })}
            </p>
            {
              <p>
                {item.registration.remaining === null
                  ? m.registration_unlimited()
                  : item.registration.remaining === 0
                    ? m.sessions_full()
                    : m.registration_seats({
                        remaining: String(item.registration.remaining),
                        capacity: String(item.registration.capacity),
                      })}
              </p>
            }
            {!canManage && (
              <p className="activity-note">{m.registration_scoped()}</p>
            )}
            {(item.cancelled ||
              activity.cancelled ||
              Date.parse(item.endsAt) <= Date.now()) && (
              <p className="activity-note">
                {m.directory_registration_closed()}
              </p>
            )}
          </div>
        )}
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
            <details className="session-help">
              <summary>{m.sessions_details()}</summary>
              <p className="activity-note">{m.sessions_snapshot_help()}</p>
              {past && (
                <p className="activity-note">{m.sessions_past_help()}</p>
              )}
              {item.registrationLocked && (
                <p className="activity-note">
                  {m.registration_schedule_locked()}
                </p>
              )}
            </details>
          </>
        )}
        {full && canOperate && (
          <div className="session-actions session-actions-primary">
            <Button asChild>
              <Link
                to="/workspace/$organizationId/activities/$activityId/sessions/$sessionId/attendance"
                params={{
                  organizationId: organization.id,
                  activityId: activity.id,
                  sessionId: item.id,
                }}
              >
                <ClipboardCheck size={16} aria-hidden="true" />
                {m.management_open()}
              </Link>
            </Button>
          </div>
        )}
        {full && !canOperate && canCash && (
          <Button className="activity-card-primary" asChild>
            <Link
              to="/workspace/$organizationId/activities/$activityId/sessions/$sessionId/attendance"
              params={{
                organizationId: organization.id,
                activityId: activity.id,
                sessionId: item.id,
              }}
              search={{ q: "" }}
            >
              <Banknote aria-hidden="true" />
              {m.management_open()}
            </Link>
          </Button>
        )}
        {item.cancelled && item.cancellationReason && (
          <p className="activity-description">{item.cancellationReason}</p>
        )}
        {!full && (
          <Button className="activity-card-primary" asChild>
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
    <section
      className={
        sessionId
          ? "activity-sessions activity-session-detail"
          : "activity-sessions"
      }
      aria-label={m.sessions_title()}
    >
      {sessionId ? (
        <>
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
          {canManage && !activity.cancelled && (
            <Button
              variant="link"
              onClick={() => openForm("session-series", activity.id)}
            >
              <Repeat2 aria-hidden="true" size={16} />
              {m.series_plan()}
            </Button>
          )}
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
