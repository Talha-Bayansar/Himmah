import { useEffect, useRef, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { Save, X, Search } from "lucide-react";
import { m } from "../paraglide/messages.js";
import type { Organization } from "../organization/contracts";
import type { Activity, Session } from "./contracts";
import { localTime } from "./contracts";
import type { Group } from "../community/contracts";
import { useDirectoryPages, DirectoryError } from "../community/client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Checkbox } from "../components/ui/checkbox";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { ActionButton } from "../components/shared/action-button";
import {
  ListSkeleton,
  InfiniteFooter,
} from "../components/shared/infinite-list";
import { useConfirmation } from "../components/shared/confirmation";
import { ErrorNotice, Audience } from "./Activities";
export function EntityEditor({
  kind,
  activity,
  session = null,
  organization,
  userId,
  onClose,
  onSave,
}: {
  kind: "activity" | "session" | "cancel";
  activity: Activity | null;
  session?: Session | null;
  organization: Organization;
  userId: string;
  onClose: () => void;
  onSave: (value: Record<string, unknown>, key: string) => Promise<void>;
}) {
  const confirm = useConfirmation(),
    key = useRef(crypto.randomUUID());
  const timezone =
    session?.timezone ?? activity?.timezone ?? organization.timezone;
  const submit = useMutation({
    mutationFn: async (value: Record<string, unknown>) => {
      if (
        kind === "activity" &&
        value.audienceMode === "groups" &&
        !(value.audienceGroupIds as string[]).length
      )
        throw new DirectoryError("activity_audience");
      if (
        kind === "cancel" &&
        !(await confirm({
          title: m.sessions_cancel(),
          description: m.sessions_cancel_help(),
          confirmLabel: m.sessions_cancel(),
          destructive: true,
        }))
      )
        return false;
      await onSave(value, key.current);
      return true;
    },
  });
  const form = useForm({
    defaultValues: {
      name: activity?.name ?? "",
      description: activity?.description ?? "",
      location: session?.location ?? activity?.location ?? "",
      startLocal: session ? localTime(session.startsAt, timezone) : "",
      endLocal: session ? localTime(session.endsAt, timezone) : "",
      reason: "",
      audienceMode: activity?.audienceGroupIds.length ? "groups" : "everyone",
      audienceGroupIds: activity?.audienceGroupIds ?? [],
    },
    onSubmit: async ({ value }) => {
      await submit.mutateAsync(value).catch(() => {});
    },
  });
  const dirty = useStore(form.store, (state) => state.isDirty);
  const canLeave = async () =>
    !dirty ||
    (submit.isSuccess && submit.data === true) ||
    (await confirm({
      title: m.directory_discard(),
      description: m.directory_discard_description(),
      confirmLabel: m.directory_discard(),
      destructive: true,
    }));
  useBlocker({
    shouldBlockFn: async () => submit.isPending || !(await canLeave()),
    enableBeforeUnload: dirty && !(submit.isSuccess && submit.data === true),
  });
  const close = async () => {
    if (!submit.isPending && (await canLeave())) onClose();
  };
  const fields =
    kind === "activity"
      ? ([
          ["name", m.activities_name(), "text", 80],
          ["description", m.activities_description(), "textarea", 2000],
          ["location", m.activities_location(), "text", 160],
        ] as const)
      : kind === "cancel"
        ? ([["reason", m.sessions_reason(), "textarea", 300]] as const)
        : ([
            ["startLocal", m.activities_start(), "datetime-local", undefined],
            ["endLocal", m.activities_end(), "datetime-local", undefined],
            ["location", m.activities_location(), "text", 160],
          ] as const);
  const title =
    kind === "activity"
      ? activity
        ? m.activities_edit()
        : m.activities_add()
      : kind === "cancel"
        ? m.sessions_cancel()
        : session
          ? m.sessions_edit()
          : m.sessions_add();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {kind === "activity"
              ? m.activities_form_help()
              : kind === "cancel"
                ? m.sessions_cancel_help()
                : session
                  ? m.sessions_edit_help()
                  : m.sessions_form_help()}
          </DialogDescription>
        </DialogHeader>
        {submit.isError && <ErrorNotice error={submit.error} />}
        <form
          className="directory-form activity-form"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          {kind === "session" && (
            <div className="session-form-context">
              <p id="activity-timezone">
                {m.activities_timezone({ timezone })}
              </p>
              <Audience groups={session?.groups ?? activity?.groups ?? []} />
            </div>
          )}
          {fields.map(([name, label, type, max]) => (
            <form.Field name={name} key={name}>
              {(field) => (
                <div>
                  <Label htmlFor={"activity-" + name}>{label}</Label>
                  {type === "textarea" ? (
                    <Textarea
                      id={"activity-" + name}
                      maxLength={max}
                      disabled={submit.isPending}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  ) : (
                    <Input
                      id={"activity-" + name}
                      type={type}
                      maxLength={max}
                      required={name !== "location"}
                      minLength={name === "name" ? 2 : undefined}
                      disabled={submit.isPending}
                      aria-describedby={
                        type === "datetime-local"
                          ? "activity-timezone"
                          : undefined
                      }
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  )}
                </div>
              )}
            </form.Field>
          ))}
          {kind === "activity" && (
            <form.Field name="audienceMode">
              {(mode) => (
                <div>
                  <Label htmlFor="activity-audience">
                    {m.activities_audience()}
                  </Label>
                  <NativeSelect
                    id="activity-audience"
                    value={mode.state.value}
                    disabled={submit.isPending}
                    onChange={(e) => {
                      mode.handleChange(e.target.value);
                      if (e.target.value === "everyone")
                        form.setFieldValue("audienceGroupIds", []);
                    }}
                  >
                    <NativeSelectOption value="everyone">
                      {m.activities_everyone()}
                    </NativeSelectOption>
                    <NativeSelectOption value="groups">
                      {m.activities_selected_groups()}
                    </NativeSelectOption>
                  </NativeSelect>
                  {mode.state.value === "groups" && (
                    <form.Field name="audienceGroupIds">
                      {(field) => (
                        <GroupChoices
                          initialGroups={activity?.groups ?? []}
                          organizationId={organization.id}
                          userId={userId}
                          value={field.state.value}
                          onChange={field.handleChange}
                          disabled={submit.isPending}
                        />
                      )}
                    </form.Field>
                  )}
                </div>
              )}
            </form.Field>
          )}
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
            <ActionButton
              type="submit"
              variant={kind === "cancel" ? "destructive" : "default"}
              pending={submit.isPending}
            >
              <Save size={16} aria-hidden="true" />
              {kind === "cancel" ? m.sessions_cancel() : m.directory_save()}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function GroupChoices({
  initialGroups,
  organizationId,
  userId,
  value,
  onChange,
  disabled,
}: {
  initialGroups: { id: string; name: string; archived: boolean }[];
  organizationId: string;
  userId: string;
  value: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const query = useDirectoryPages<Group>(
    [
      "organization",
      userId,
      organizationId,
      "directory",
      "activity-group-options",
      search,
    ],
    `/api/organizations/${organizationId}/groups?q=${encodeURIComponent(search)}`,
    { staleTime: 0, refetchOnMount: "always" },
  );
  const [known, setKnown] = useState(initialGroups);
  useEffect(() => {
    const loaded = query.data?.pages.flatMap((page) => page.items) ?? [];
    if (loaded.length)
      setKnown((previous) => [
        ...new Map(
          [...previous, ...loaded].map((group) => [group.id, group]),
        ).values(),
      ]);
  }, [query.data]);
  return (
    <div className="activity-group-picker">
      <p>{m.activities_audience_help()}</p>
      {!!value.length && (
        <div className="activity-selected-groups">
          {value.map((id) => {
            const group = known.find((group) => group.id === id);
            return (
              <Button
                key={id}
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  onChange(value.filter((selected) => selected !== id))
                }
              >
                <X size={14} aria-hidden="true" />
                {group
                  ? group.archived
                    ? m.activities_group_archived({ name: group.name })
                    : group.name
                  : m.activities_selected_groups()}
              </Button>
            );
          })}
        </div>
      )}
      <p role="status">
        {m.activities_selected_count({ count: String(value.length) })}
      </p>
      <label className="activity-group-search">
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">{m.directory_search()}</span>
        <Input
          type="search"
          maxLength={80}
          value={search}
          placeholder={m.directory_search()}
          onChange={(e) => setSearch(e.target.value)}
          disabled={disabled}
        />
      </label>
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
          <div className="activity-group-options">
            {query.data?.pages
              .flatMap((page) => page.items)
              .map((group) => (
                <label key={group.id}>
                  <Checkbox
                    checked={value.includes(group.id)}
                    disabled={
                      disabled ||
                      (!value.includes(group.id) && value.length >= 20)
                    }
                    onCheckedChange={(checked) =>
                      onChange(
                        checked
                          ? [...value, group.id]
                          : value.filter((id) => id !== group.id),
                      )
                    }
                  />
                  <span>{group.name}</span>
                </label>
              ))}
          </div>
          {!query.data?.pages.some((page) => page.items.length) && (
            <p>{m.directory_empty()}</p>
          )}
          <InfiniteFooter {...query} />
        </>
      )}
    </div>
  );
}
