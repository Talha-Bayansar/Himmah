import { sessionPrice } from "./contracts";
import { useFormNavigation } from "../components/shared/form-navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  MapPin,
  Pencil,
  Plus,
  Search,
  Users,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Attendance from "../attendance/Attendance";
import {
  DirectoryError,
  directoryMessage,
  directoryRequest,
  useDirectoryPages,
} from "../community/client";
import { ActionButton } from "../components/shared/action-button";
import { useConfirmation } from "../components/shared/confirmation";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { ItemActions } from "../components/shared/item-actions";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import { useLocale } from "../localization/locale";
import type { Organization } from "../organization/contracts";
import { m } from "../paraglide/messages.js";
import type { Activity, AudienceGroup } from "./contracts";
import Sessions from "./Sessions";
export const activityKey = (user: string, org: string) => [
  "organization",
  user,
  org,
  "activities",
];
export function ErrorNotice({
  error,
  retry,
  pending = false,
}: {
  error: unknown;
  retry?: () => void;
  pending?: boolean;
}) {
  return (
    <div className="space-y-3">
      <Alert variant="destructive" role="alert">
        <AlertDescription>{directoryMessage(error)}</AlertDescription>
      </Alert>
      {retry && (
        <ActionButton
          type="button"
          variant="outline"
          pending={pending}
          onClick={retry}
        >
          {m.try_again()}
        </ActionButton>
      )}
    </div>
  );
}
export function Audience({ groups }: { groups: AudienceGroup[] }) {
  return (
    <div className="activity-audience">
      <Users size={16} aria-hidden="true" />
      <div>
        <span className="activity-meta-label">{m.activities_audience()}</span>
        <p>
          {groups.length
            ? groups
                .map((group) =>
                  group.archived
                    ? m.activities_group_archived({ name: group.name })
                    : group.name,
                )
                .join(", ")
            : m.activities_everyone()}
        </p>
      </div>
    </div>
  );
}
export function Schedule({
  startsAt,
  endsAt,
  timezone,
  compact = false,
}: {
  compact?: boolean;
  startsAt: string;
  endsAt: string;
  timezone: string;
}) {
  const locale = useLocale()?.locale ?? "en";
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: timezone,
    }).format(new Date(value));
  const time = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  if (compact)
    return (
      <p className="compact-schedule">
        <time dateTime={startsAt}>
          {date(startsAt)} · {time(startsAt)}
        </time>
        <span aria-hidden="true"> – </span>
        <time dateTime={endsAt}>
          {date(startsAt) !== date(endsAt) ? date(endsAt) + " · " : ""}
          {time(endsAt)}
        </time>
        <span className="sr-only">
          {" "}
          · {m.activities_timezone({ timezone })}
        </span>
      </p>
    );
  return (
    <div className="activity-schedule">
      <dl className="activity-details">
        {[
          [m.activities_start(), startsAt],
          [m.activities_end(), endsAt],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <time dateTime={value}>
                <span>{date(value!)}</span>
                <span className="activity-clock">{time(value!)}</span>
              </time>
            </dd>
          </div>
        ))}
      </dl>
      <p className="activity-timezone">{m.activities_timezone({ timezone })}</p>
    </div>
  );
}
export default function Activities({
  organization,
  userId,
  activityId = null,
  sessionId = null,
  attendance = false,
}: {
  organization: Organization;
  userId: string;
  activityId?: string | null;
  sessionId?: string | null;
  attendance?: boolean;
}) {
  const locale = useLocale()?.locale ?? "en";
  const openForm = useFormNavigation(organization.id);
  const cache = useQueryClient(),
    confirm = useConfirmation();
  const [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false);
  const key = activityKey(userId, organization.id),
    base = `/api/organizations/${organization.id}/activities`,
    canManage = ["owner", "admin"].includes(organization.role);
  const query = useDirectoryPages<Activity>(
    [...key, "list", search, archived],
    base + "?q=" + encodeURIComponent(search) + "&archived=" + archived,
    { enabled: !activityId },
  );
  const detail = useQuery({
    queryKey: [...key, "detail", activityId],
    enabled: !!activityId,
    queryFn: ({ signal }) =>
      directoryRequest<{ item: Activity }>(base + "/" + activityId, { signal }),
  });
  const refresh = () => cache.invalidateQueries({ queryKey: key });
  const navigate = useNavigate();
  const deletionRequests = useRef(
    new Map<string, { key: string; snapshot: string }>(),
  );
  const permanentDelete = useMutation({
    mutationFn: async (item: Activity) => {
      let request = deletionRequests.current.get(item.id);
      if (!request) {
        const preview = await directoryRequest<{
          name: string;
          snapshot: string;
          sessions: number;
          attendance: number;
          charges: number;
          receipts: number;
        }>(base + "/" + item.id + "?deletionPreview=true");
        if (
          !(await confirm({
            title: m.activities_delete(),
            description: m.activities_delete_help({
              name: preview.name,
              sessions: preview.sessions.toLocaleString(locale),
              attendance: preview.attendance.toLocaleString(locale),
              charges: preview.charges.toLocaleString(locale),
              receipts: preview.receipts.toLocaleString(locale),
            }),
            confirmLabel: m.activities_delete(),
            destructive: true,
          }))
        )
          return false;
        request = { key: crypto.randomUUID(), snapshot: preview.snapshot };
        deletionRequests.current.set(item.id, request);
      }
      await directoryRequest(base + "/" + item.id, {
        method: "DELETE",
        body: JSON.stringify(request),
      });
      return true;
    },
    onSuccess: async (deleted, item) => {
      if (!deleted) return;
      deletionRequests.current.delete(item.id);
      if (activityId)
        await navigate({
          to: "/workspace/$organizationId/$section",
          params: { organizationId: organization.id, section: "activities" },
        });
      const root = ["organization", userId, organization.id];
      await cache.cancelQueries({ queryKey: root });
      cache.removeQueries({
        predicate: (q) =>
          q.queryKey[0] === root[0] &&
          q.queryKey[1] === root[1] &&
          q.queryKey[2] === root[2] &&
          q.queryKey.length > 3 &&
          !(q.queryKey[3] === "activities" && q.queryKey[4] === "list"),
      });
      await cache.invalidateQueries({ queryKey: root });
    },
    onError: (error, item) => {
      if (
        error instanceof DirectoryError &&
        [
          "conflict",
          "forbidden",
          "not_found",
          "invalid_input",
          "verify_required",
          "sign_in",
        ].includes(error.code)
      ) {
        deletionRequests.current.delete(item.id);
        void cache.invalidateQueries({
          queryKey: ["organization", userId, organization.id],
        });
      }
    },
  });

  const archive = useMutation({
    mutationFn: (item: Activity) =>
      directoryRequest(base + "/" + item.id, {
        method: "PATCH",
        body: JSON.stringify({ version: item.version, cancelled: true }),
      }),
    onSuccess: refresh,
    onError: () => {
      void refresh();
    },
  });
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [detail.data?.item.id, activityId]);
  const row = (item: Activity, full = false) => (
    <article key={item.id} className="activity-card">
      <div className="activity-card-heading">
        <span className="activity-card-icon">
          <CalendarDays size={22} aria-hidden="true" />
        </span>
        <div className="activity-card-heading-copy">
          {full ? (
            <h1
              ref={heading}
              className="activity-card-title"
              tabIndex={-1}
              data-page-heading
            >
              {item.name}
            </h1>
          ) : (
            <h2 className="activity-card-title">{item.name}</h2>
          )}
          {item.cancelled && (
            <p className="activity-status">{m.activities_cancelled()}</p>
          )}
        </div>
        {canManage && (
          <ItemActions
            name={item.name}
            pending={
              (archive.isPending && archive.variables.id === item.id) ||
              (permanentDelete.isPending &&
                permanentDelete.variables.id === item.id)
            }
            actions={[
              ...(!item.cancelled
                ? [
                    {
                      label: m.activities_edit(),
                      icon: Pencil,
                      onSelect: () => openForm("activity", item.id),
                    },
                    {
                      label: m.activities_cancel(),
                      icon: Archive,
                      destructive: true,
                      onSelect: async () => {
                        if (
                          await confirm({
                            title: m.activities_cancel(),
                            description: m.activities_cancel_help({
                              name: item.name,
                            }),
                            confirmLabel: m.activities_cancel(),
                            destructive: true,
                          })
                        )
                          archive.mutate(item);
                      },
                    },
                  ]
                : []),
              {
                label: m.activities_delete(),
                icon: Trash2,
                destructive: true,
                onSelect: () => permanentDelete.mutate(item),
              },
            ]}
          />
        )}
      </div>
      {!full &&
        (item.nextSession ? (
          <>
            {item.nextSession.topic && (
              <p className="activity-note">{item.nextSession.topic}</p>
            )}
            <Schedule {...item.nextSession} />
          </>
        ) : (
          <p className="activity-note">{m.sessions_none_scheduled()}</p>
        ))}
      {(item.priceMinor ?? 0) > 0 && (
        <p className="activity-status">
          {m.pricing_per_session({
            price: sessionPrice(item.priceMinor!, locale),
          })}
        </p>
      )}
      <Audience groups={item.groups} />

      {full && item.location && (
        <p className="activity-location">
          <MapPin size={16} aria-hidden="true" />
          <span>
            {m.sessions_default_location()}: {item.location}
          </span>
        </p>
      )}
      {full && item.description && (
        <p className="activity-description">{item.description}</p>
      )}
      {!full && (
        <Button className="activity-card-primary" asChild>
          <Link
            to="/workspace/$organizationId/activities/$activityId"
            params={{ organizationId: organization.id, activityId: item.id }}
          >
            <ArrowRight size={16} aria-hidden="true" />
            {m.activities_view()}
          </Link>
        </Button>
      )}
    </article>
  );
  return (
    <section className="activity-page">
      {activityId ? (
        <>
          <Button variant="link" asChild className="settings-back">
            {attendance && sessionId ? (
              <Link
                to="/workspace/$organizationId/activities/$activityId/sessions/$sessionId"
                params={{
                  organizationId: organization.id,
                  activityId,
                  sessionId,
                }}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                {m.sessions_view()}
              </Link>
            ) : sessionId ? (
              <Link
                to="/workspace/$organizationId/activities/$activityId"
                params={{ organizationId: organization.id, activityId }}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                {detail.data?.item.name ?? m.activities_view()}
              </Link>
            ) : (
              <Link
                to="/workspace/$organizationId/$section"
                params={{
                  organizationId: organization.id,
                  section: "activities",
                }}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                {m.activities_title()}
              </Link>
            )}
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
            <>
              {!sessionId && row(detail.data.item, true)}
              {attendance && sessionId ? (
                <Attendance
                  organization={organization}
                  userId={userId}
                  activityId={activityId}
                  sessionId={sessionId}
                />
              ) : (
                <Sessions
                  organization={organization}
                  userId={userId}
                  activity={detail.data.item}
                  sessionId={sessionId}
                />
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div className="directory-heading">
            <div>
              <h1 tabIndex={-1} data-page-heading>
                {m.activities_title()}
              </h1>
              <p>{m.activities_help()}</p>
            </div>
            {canManage && (
              <Button onClick={() => openForm("activity", "new")}>
                <Plus size={16} aria-hidden="true" />
                {m.activities_add()}
              </Button>
            )}
          </div>
          <div className="directory-toolbar">
            <label>
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">{m.directory_search()}</span>
              <Input
                type="search"
                maxLength={80}
                placeholder={m.directory_search()}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="directory-archived">
              <Checkbox
                checked={archived}
                onCheckedChange={(value) => setArchived(value === true)}
              />
              {m.activities_show_cancelled()}
            </label>
          </div>
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
                <p className="directory-empty">{m.activities_empty()}</p>
              )}
              <InfiniteFooter {...query} />
            </>
          )}
        </>
      )}
      {archive.isError && <ErrorNotice error={archive.error} />}
      {permanentDelete.isError && (
        <ErrorNotice
          error={permanentDelete.error}
          pending={permanentDelete.isPending}
          retry={() =>
            permanentDelete.variables &&
            permanentDelete.mutate(permanentDelete.variables)
          }
        />
      )}
    </section>
  );
}
