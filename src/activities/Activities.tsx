import { useEffect, useRef, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker } from "@tanstack/react-router";
import {
  CalendarDays,
  Plus,
  Search,
  Pencil,
  Ban,
  ArrowLeft,
  ArrowRight,
  MapPin,
  Save,
  X,
} from "lucide-react";
import { m } from "../paraglide/messages.js";
import { useLocale } from "../localization/locale";
import type { Organization } from "../organization/contracts";
import {
  directoryRequest,
  directoryMessage,
  useDirectoryPages,
} from "../community/client";
import { type Activity, type ActivityFields, localTime } from "./contracts";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Checkbox } from "../components/ui/checkbox";
import { Alert, AlertDescription } from "../components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { ActionButton } from "../components/shared/action-button";
import { ItemActions } from "../components/shared/item-actions";
import {
  ListSkeleton,
  InfiniteFooter,
} from "../components/shared/infinite-list";
import { useConfirmation } from "../components/shared/confirmation";
export default function Activities({
  organization,
  userId,
  activityId = null,
}: {
  organization: Organization;
  userId: string;
  activityId?: string | null;
}) {
  const locale = useLocale();
  const cache = useQueryClient(),
    confirm = useConfirmation();
  const [search, setSearch] = useState(""),
    [cancelled, setCancelled] = useState(false),
    [editor, setEditor] = useState<Activity | "new" | null>(null);
  const key = ["organization", userId, organization.id, "activities"] as const;
  const base = `/api/organizations/${organization.id}/activities`;
  const canManage =
    organization.role === "owner" || organization.role === "admin";
  const query = useDirectoryPages<Activity>(
    [...key, "list", search, cancelled],
    base + "?q=" + encodeURIComponent(search) + "&archived=" + cancelled,
    { enabled: !activityId },
  );
  const detail = useQuery({
    queryKey: [...key, "detail", activityId],
    enabled: !!activityId,
    queryFn: ({ signal }) =>
      directoryRequest<{ item: Activity }>(base + "/" + activityId, { signal }),
  });
  const refresh = () => cache.invalidateQueries({ queryKey: key });
  const cancel = useMutation({
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
  const date = (value: string, timezone: string) =>
    new Intl.DateTimeFormat(locale?.locale ?? "en", {
      dateStyle: "medium",
      timeZone: timezone,
    }).format(new Date(value));
  const time = (value: string, timezone: string) =>
    new Intl.DateTimeFormat(locale?.locale ?? "en", {
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  const actions = (item: Activity) =>
    canManage && !item.cancelled
      ? [
          {
            label: m.activities_edit(),
            icon: Pencil,
            onSelect: () => {
              setEditor(item);
            },
          },
          {
            label: m.activities_cancel(),
            icon: Ban,
            destructive: true,
            onSelect: async () => {
              if (
                await confirm({
                  title: m.activities_cancel(),
                  description: m.activities_cancel_help({ name: item.name }),
                  confirmLabel: m.activities_cancel(),
                  destructive: true,
                })
              )
                cancel.mutate(item);
            },
          },
        ]
      : [];
  const row = (item: Activity, full = false) => (
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
            <h2 className="activity-card-title">{item.name}</h2>
          )}
          {item.cancelled && (
            <p className="activity-status">{m.activities_cancelled()}</p>
          )}
        </div>
        {canManage && (
          <ItemActions
            name={item.name}
            actions={actions(item)}
            pending={cancel.isPending && cancel.variables.id === item.id}
          />
        )}
      </div>
      <div className="activity-schedule">
        <dl className="activity-details">
          <div>
            <dt>{m.activities_start()}</dt>
            <dd>
              <time dateTime={item.startsAt}>
                <span>{date(item.startsAt, item.timezone)}</span>
                <span className="activity-clock">
                  {time(item.startsAt, item.timezone)}
                </span>
              </time>
            </dd>
          </div>
          <div>
            <dt>{m.activities_end()}</dt>
            <dd>
              <time dateTime={item.endsAt}>
                <span>{date(item.endsAt, item.timezone)}</span>
                <span className="activity-clock">
                  {time(item.endsAt, item.timezone)}
                </span>
              </time>
            </dd>
          </div>
        </dl>
        <p className="activity-timezone">
          {m.activities_timezone({ timezone: item.timezone })}
        </p>
      </div>
      {item.location && (
        <p className="activity-location">
          <MapPin size={16} aria-hidden="true" />
          <span>{item.location}</span>
        </p>
      )}
      {full && item.description && (
        <p className="activity-description">{item.description}</p>
      )}
      {!full && (
        <Button variant="outline" asChild className="activity-card-primary">
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
          </Button>
          {detail.isPending ? (
            <ListSkeleton />
          ) : detail.isError ? (
            <ErrorNotice
              error={detail.error}
              retry={() => void detail.refetch()}
              pending={detail.isFetching}
            />
          ) : (
            row(detail.data.item, true)
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
                checked={cancelled}
                onCheckedChange={(value) => setCancelled(value === true)}
              />
              {m.activities_show_cancelled()}
            </label>
          </div>
          {query.isPending ? (
            <ListSkeleton />
          ) : query.isError && !query.data ? (
            <ErrorNotice
              error={query.error}
              retry={() => void query.refetch()}
              pending={query.isFetching}
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
      {cancel.isError && <ErrorNotice error={cancel.error} />}
      {editor && (
        <ActivityEditor
          item={editor === "new" ? null : editor}
          timezone={editor === "new" ? organization.timezone : editor.timezone}
          onClose={() => setEditor(null)}
          onSave={async (value, key) => {
            const result = await directoryRequest<{ item: Activity }>(
              base + (editor === "new" ? "" : "/" + editor.id),
              {
                method: editor === "new" ? "POST" : "PATCH",
                body: JSON.stringify({
                  ...value,
                  ...(editor === "new" ? { key } : { version: editor.version }),
                }),
              },
            );
            cache.setQueryData(
              [...keyScope(userId, organization.id), "detail", result.item.id],
              result,
            );
            await refresh();
            setEditor(null);
          }}
        />
      )}
    </section>
  );
}
const keyScope = (user: string, org: string) => [
  "organization",
  user,
  org,
  "activities",
];
function ErrorNotice({
  error,
  retry,
  pending,
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
          variant="outline"
          pending={pending ?? false}
          onClick={retry}
        >
          {m.try_again()}
        </ActionButton>
      )}
    </div>
  );
}
function ActivityEditor({
  item,
  timezone,
  onClose,
  onSave,
}: {
  item: Activity | null;
  timezone: string;
  onClose: () => void;
  onSave: (value: ActivityFields, key: string) => Promise<void>;
}) {
  const confirm = useConfirmation(),
    key = useRef(crypto.randomUUID());
  const submit = useMutation({
    mutationFn: (value: ActivityFields) => onSave(value, key.current),
  });
  const form = useForm({
    defaultValues: {
      name: item?.name ?? "",
      description: item?.description ?? "",
      location: item?.location ?? "",
      startLocal: item ? localTime(item.startsAt, timezone) : "",
      endLocal: item ? localTime(item.endsAt, timezone) : "",
    },
    onSubmit: async ({ value }) => {
      await submit.mutateAsync(value).catch(() => {});
    },
  });
  const dirty = useStore(form.store, (state) => state.isDirty);
  const canLeave = async () =>
    !dirty ||
    submit.isSuccess ||
    (await confirm({
      title: m.directory_discard(),
      description: m.directory_discard_description(),
      confirmLabel: m.directory_discard(),
      destructive: true,
    }));
  useBlocker({
    shouldBlockFn: async () => submit.isPending || !(await canLeave()),
    enableBeforeUnload: dirty && !submit.isSuccess,
  });
  const close = async () => {
    if (!submit.isPending && (await canLeave())) onClose();
  };
  const fields = [
    ["name", m.activities_name(), "text", 80],
    ["description", m.activities_description(), "textarea", 2000],
    ["location", m.activities_location(), "text", 160],
    ["startLocal", m.activities_start(), "datetime-local", undefined],
    ["endLocal", m.activities_end(), "datetime-local", undefined],
  ] as const;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {item ? m.activities_edit() : m.activities_add()}
          </DialogTitle>
          <DialogDescription>{m.activities_form_help()}</DialogDescription>
        </DialogHeader>
        {submit.isError && <ErrorNotice error={submit.error} />}
        <form
          className="directory-form activity-form"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <p id="activity-timezone">{m.activities_timezone({ timezone })}</p>
          {fields.map(([name, label, type, max]) => (
            <form.Field name={name} key={name}>
              {(field) => (
                <div>
                  <Label htmlFor={"activity-" + name}>{label}</Label>
                  {type === "textarea" ? (
                    <Textarea
                      id={"activity-" + name}
                      maxLength={max}
                      value={field.state.value}
                      disabled={submit.isPending}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                  ) : (
                    <Input
                      id={"activity-" + name}
                      type={type}
                      maxLength={max}
                      required={name !== "location"}
                      minLength={name === "name" ? 2 : undefined}
                      aria-describedby={
                        type === "datetime-local"
                          ? "activity-timezone"
                          : undefined
                      }
                      value={field.state.value}
                      disabled={submit.isPending}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                  )}
                </div>
              )}
            </form.Field>
          ))}
          <div className="directory-actions">
            <Button
              type="button"
              variant="outline"
              disabled={submit.isPending}
              onClick={() => void close()}
            >
              <X size={16} aria-hidden="true" />
              {m.cancel()}
            </Button>
            <ActionButton type="submit" pending={submit.isPending}>
              <Save size={16} aria-hidden="true" />
              {m.directory_save()}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
