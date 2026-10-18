import Attendance from "../attendance/Attendance";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  Plus,
  Search,
  Pencil,
  Archive,
  ArrowLeft,
  ArrowRight,
  MapPin,
  Users,
} from "lucide-react";
import { m } from "../paraglide/messages.js";
import { useLocale } from "../localization/locale";
import type { Organization } from "../organization/contracts";
import {
  directoryRequest,
  directoryMessage,
  useDirectoryPages,
} from "../community/client";
import type { Activity, AudienceGroup } from "./contracts";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import { Alert, AlertDescription } from "../components/ui/alert";
import { ActionButton } from "../components/shared/action-button";
import { ItemActions } from "../components/shared/item-actions";
import {
  ListSkeleton,
  InfiniteFooter,
} from "../components/shared/infinite-list";
import { useConfirmation } from "../components/shared/confirmation";
import { EntityEditor } from "./EntityEditor";
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
}: {
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
  useLocale();
  const cache = useQueryClient(),
    confirm = useConfirmation();
  const [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    [editor, setEditor] = useState<Activity | "new" | null>(null);
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
        {canManage && !item.cancelled && (
          <ItemActions
            name={item.name}
            pending={archive.isPending && archive.variables.id === item.id}
            actions={[
              {
                label: m.activities_edit(),
                icon: Pencil,
                onSelect: () => setEditor(item),
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
            ]}
          />
        )}
      </div>
      {!full &&
        (item.nextSession ? (
          <Schedule {...item.nextSession} />
        ) : (
          <p className="activity-note">{m.sessions_none_scheduled()}</p>
        ))}
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
        <Button variant="outline" className="activity-card-primary" asChild>
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
              <Button onClick={() => setEditor("new")}>
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
                <p className="directory-empty">{m.activities_empty()}</p>
              )}
              <InfiniteFooter {...query} />
            </>
          )}
        </>
      )}
      {archive.isError && <ErrorNotice error={archive.error} />}
      {editor && (
        <EntityEditor
          key={editor === "new" ? "new" : editor.id}
          kind="activity"
          activity={editor === "new" ? null : editor}
          organization={organization}
          userId={userId}
          onClose={() => setEditor(null)}
          onSave={async (value, creationKey) => {
            let result: { item: Activity };
            try {
              result = await directoryRequest<{ item: Activity }>(
                base + (editor === "new" ? "" : "/" + editor.id),
                {
                  method: editor === "new" ? "POST" : "PATCH",
                  body: JSON.stringify({
                    ...value,
                    ...(editor === "new"
                      ? { key: creationKey }
                      : { version: editor.version }),
                  }),
                },
              );
            } catch (error) {
              await refresh();
              throw error;
            }
            cache.setQueryData([...key, "detail", result.item.id], result);
            await refresh();
            setEditor(null);
          }}
        />
      )}
    </section>
  );
}
