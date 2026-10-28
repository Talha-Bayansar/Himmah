import { useFormNavigation } from "../../components/shared/form-navigation";
import {
  DirectoryHeader,
  DirectoryToolbar,
  DirectoryList,
  DirectoryItem,
  DirectoryRecord,
} from "../../components/shared/directory-layout";
import { useState, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import {
  ChevronRight,
  Plus,
  ArrowLeft,
  Archive,
  ArchiveRestore,
  Pencil,
  UserMinus,
  Users,
} from "lucide-react";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { useLocale } from "../../localization/locale";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import { Checkbox } from "../../components/ui/checkbox";
import { Card, CardContent, CardFooter } from "../../components/ui/card";
import { ItemActions } from "../../components/shared/item-actions";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../../components/shared/infinite-list";
import { useConfirmation } from "../../components/shared/confirmation";
import { PeopleShell } from "./PeopleShell";
import { request, accessDenied } from "./client";
import {
  peopleBase,
  usePages,
  useSearch,
  SectionAdd,
  ErrorNotice,
  PeopleForm,
  Picker,
  usePeopleMutation,
  HistoryToggle,
  ReasonSheet,
} from "./shared";
import {
  groupInput,
  type PeopleGroup,
  type GroupMember,
  type Contact,
} from "./contracts";
export default function Groups({
  organizationId,
  groupId,
}: {
  organizationId: string;
  groupId?: string;
}) {
  useLocale();
  return (
    <PeopleShell
      organizationId={organizationId}
      section="groups"
      tabs={!groupId}
    >
      {(user) =>
        groupId ? (
          <GroupDetail org={organizationId} user={user} id={groupId} />
        ) : (
          <GroupList org={organizationId} user={user} />
        )
      }
    </PeopleShell>
  );
}
function GroupList({ org, user }: { org: string; user: string }) {
  const [search, setSearch] = useState(""),
    q = useSearch(search),
    [archived, setArchived] = useState(false),
    [adding, setAdding] = useState(false);
  const list = usePages<PeopleGroup>(
    ["people", user, org, "groups", q, archived],
    peopleBase(org) +
      "/groups?q=" +
      encodeURIComponent(q) +
      "&archived=" +
      archived,
  );
  if (accessDenied(list.error)) return <ErrorNotice error={list.error} />;
  return (
    <section className="directory">
      <DirectoryHeader
        title={m.people_groups()}
        description={m.directory_groups_help()}
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />
            {m.people_add_group()}
          </Button>
        }
      />
      <DirectoryToolbar
        id="groups-search"
        label={m.people_search_groups()}
        value={search}
        onChange={setSearch}
      >
        <Label className="directory-archived">
          <Checkbox
            checked={archived}
            onCheckedChange={(v) => setArchived(v === true)}
          />
          {m.people_archived_groups()}
        </Label>
      </DirectoryToolbar>
      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError && !list.data ? (
        <ErrorNotice error={list.error} retry={list.refetch} />
      ) : (
        <>
          {!list.data?.pages.some((p) => p.items.length) && (
            <p className="directory-empty">{m.people_no_groups()}</p>
          )}
          <DirectoryList
            label={m.people_groups()}
            busy={list.isFetchingNextPage}
          >
            {list.data?.pages
              .flatMap((p) => p.items)
              .map((group) => (
                <DirectoryItem key={group.id} linked>
                  <Link
                    className="directory-item-link"
                    to="/workspace/$organizationId/people/groups/$groupId"
                    params={{ organizationId: org, groupId: group.id }}
                  >
                    <DirectoryRecord
                      name={group.name}
                      icon={<Users aria-hidden="true" size={19} />}
                      detail={m.people_member_count({
                        count: group.memberCount,
                      })}
                    />
                    <ChevronRight aria-hidden="true" size={18} />
                  </Link>
                </DirectoryItem>
              ))}
          </DirectoryList>
          <InfiniteFooter {...list} />
        </>
      )}
      {adding && (
        <GroupEditor user={user} org={org} onClose={() => setAdding(false)} />
      )}
    </section>
  );
}
function GroupDetail({
  org,
  user,
  id,
}: {
  org: string;
  user: string;
  id: string;
}) {
  const openForm = useFormNavigation(org);
  const query = useQuery({
    queryKey: ["people", user, org, "group", id],
    queryFn: ({ signal }) =>
      request<PeopleGroup>(peopleBase(org) + "/groups/" + id, { signal }),
    staleTime: 60_000,
    retry: false,
  });
  const [history, setHistory] = useState(false),
    [search, setSearch] = useState(""),
    q = useSearch(search),
    [editing, setEditing] = useState(false),
    [ending, setEnding] = useState<GroupMember | null>(null);
  const members = usePages<GroupMember>(
    ["people", user, org, "group-members", id, q, history],
    peopleBase(org) +
      "/groups/" +
      id +
      "/members?history=" +
      history +
      "&q=" +
      encodeURIComponent(q),
    !!query.data && !query.isError,
  );
  const mutation = usePeopleMutation(user, org),
    confirm = useConfirmation();
  if (query.isError)
    return <ErrorNotice error={query.error} retry={query.refetch} />;
  if (accessDenied(members.error)) return <ErrorNotice error={members.error} />;
  if (!query.data) return <ListSkeleton />;
  const group = query.data;
  const archive = async () => {
    if (
      await confirm({
        title: group.archivedAt
          ? m.people_restore_group()
          : m.people_archive_group(),
        description: group.archivedAt
          ? m.people_group_restore_hint()
          : m.people_group_archive_hint({ count: group.memberCount }),
        confirmLabel: group.archivedAt
          ? m.people_restore_group()
          : m.people_archive_group(),
        destructive: !group.archivedAt,
      })
    )
      mutation.mutate({
        path: "/groups/" + id + (group.archivedAt ? "/restore" : "/archive"),
        body: { version: group.version },
      });
  };
  return (
    <>
      <Button asChild variant="link">
        <Link
          to="/workspace/$organizationId/people/groups"
          params={{ organizationId: org }}
        >
          <ArrowLeft aria-hidden="true" />
          {m.people_groups()}
        </Link>
      </Button>
      <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 break-words text-2xl font-semibold">
          {group.name}
        </h1>
        <ItemActions
          name={group.name}
          pending={mutation.isPending}
          actions={
            group.archivedAt
              ? [
                  {
                    label: m.people_restore_group(),
                    icon: ArchiveRestore,
                    onSelect: archive,
                  },
                ]
              : [
                  {
                    label: m.people_edit_group(),
                    icon: Pencil,
                    onSelect: () => setEditing(true),
                  },
                  {
                    label: m.people_archive_group(),
                    icon: Archive,
                    destructive: true,
                    onSelect: archive,
                  },
                ]
          }
        />
      </div>
      {mutation.isError && <ErrorNotice error={mutation.error} />}
      {group.archivedAt && <p>{m.people_archived_groups()}</p>}
      {group.description && (
        <Card density="compact">
          <CardContent className="whitespace-pre-wrap break-words">
            {group.description}
          </CardContent>
        </Card>
      )}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{m.people_members()}</h2>
          {!group.archivedAt && (
            <SectionAdd
              label={m.people_add_members()}
              onClick={() => openForm("group-members", id)}
            />
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {m.people_member_count({ count: group.memberCount })}
        </p>
        <Label htmlFor="member-search">{m.people_search_members()}</Label>
        <Input
          id="member-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={80}
        />
        <HistoryToggle checked={history} onChange={setHistory} />
        {members.isPending ? (
          <ListSkeleton />
        ) : members.isError && !members.data ? (
          <ErrorNotice error={members.error} retry={members.refetch} />
        ) : (
          <>
            {!members.data?.pages.some((p) => p.items.length) && (
              <p>{m.people_no_members()}</p>
            )}
            {members.data?.pages
              .flatMap((p) => p.items)
              .map((member) => (
                <Card density="compact" key={member.id}>
                  <CardContent className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1 break-words">
                      <Link
                        to="/workspace/$organizationId/people/contacts/$contactId"
                        params={{
                          organizationId: org,
                          contactId: member.contactId,
                        }}
                        className="font-semibold"
                      >
                        {member.displayName}
                      </Link>
                      {member.contactArchived && (
                        <p className="text-sm">{m.people_contact_archived()}</p>
                      )}
                      <MembershipDates
                        from={member.validFrom}
                        to={member.validTo}
                      />
                      {member.endReason && (
                        <p className="text-sm">
                          {endReasonLabel(member.endReason)}
                        </p>
                      )}
                    </div>
                    {!member.validTo && !group.archivedAt && (
                      <ItemActions
                        name={member.displayName}
                        actions={[
                          {
                            label: m.people_end_membership(),
                            icon: UserMinus,
                            destructive: true,
                            onSelect: () => setEnding(member),
                          },
                        ]}
                      />
                    )}
                  </CardContent>
                </Card>
              ))}
            <InfiniteFooter {...members} />
          </>
        )}
      </section>
      {editing && (
        <GroupEditor
          org={org}
          user={user}
          group={group}
          onClose={() => setEditing(false)}
        />
      )}
      {ending && (
        <ReasonSheet
          org={org}
          user={user}
          title={m.people_end_membership()}
          description={m.people_end_membership_hint()}
          path={"/groups/" + id + "/members/" + ending.id}
          method="DELETE"
          body={{ version: group.version, membershipVersion: ending.version }}
          onClose={() => setEnding(null)}
        />
      )}
    </>
  );
}
export function MembershipDates({
  from,
  to,
}: {
  from: string;
  to: string | null;
}) {
  return (
    <p className="text-sm text-muted-foreground">
      {m.people_membership_since({
        date: new Date(from).toLocaleDateString(getLocale()),
      })}
      {to &&
        " · " +
          m.people_membership_until({
            date: new Date(to).toLocaleDateString(getLocale()),
          })}
    </p>
  );
}
export function endReasonLabel(reason: string) {
  return reason === "group_archived"
    ? m.people_event_group_archived()
    : reason === "contact_archived"
      ? m.people_contact_archived()
      : reason;
}
function GroupEditor({
  org,
  user,
  group,
  onClose,
}: {
  org: string;
  user: string;
  group?: PeopleGroup;
  onClose: () => void;
}) {
  const committed = useRef(false);
  const [version] = useState(group?.version),
    [invalid, setInvalid] = useState(false),
    mutation = usePeopleMutation(user, org),
    navigate = useNavigate();
  const form = useForm({
    defaultValues: {
      name: group?.name ?? "",
      description: group?.description ?? "",
    },
    onSubmit: async ({ value }) => {
      try {
        const input = groupInput(value),
          result = await mutation.mutateAsync({
            path: "/groups" + (group ? "/" + group.id : ""),
            method: group ? "PATCH" : "POST",
            body: { ...input, ...(group ? { version } : {}) },
          });
        committed.current = true;
        onClose();
        if (!group && result.id)
          await navigate({
            to: "/workspace/$organizationId/people/groups/$groupId",
            params: { organizationId: org, groupId: result.id },
          });
      } catch {
        /* Render mutation error and preserve draft. */
      }
    },
  });
  return (
    <PeopleForm
      title={group ? m.people_edit_group() : m.people_add_group()}
      description={m.people_group_hint()}
      pending={mutation.isPending}
      error={mutation.error}
      canLeave={() => committed.current}
      dirty={() => form.state.isDirty && !mutation.isSuccess}
      onClose={onClose}
      onSubmit={() => {
        try {
          groupInput(form.state.values);
          setInvalid(false);
          void form.handleSubmit();
        } catch {
          setInvalid(true);
        }
      }}
    >
      <form.Field name="name">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="group-name">{m.people_group_name()}</Label>
            <Input
              id="group-name"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              maxLength={100}
              required
            />
          </div>
        )}
      </form.Field>
      <form.Field name="description">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="group-description">
              {m.people_group_description()}
            </Label>
            <Textarea
              id="group-description"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              maxLength={500}
            />
          </div>
        )}
      </form.Field>
      {invalid && <p role="alert">{m.people_form_invalid()}</p>}
    </PeopleForm>
  );
}
export function AddMembers({
  org,
  user,
  group,
  onClose,
}: {
  org: string;
  user: string;
  group: PeopleGroup;
  onClose: () => void;
}) {
  const committed = useRef(false);
  const [selected, setSelected] = useState<
      (Contact & { assigned?: boolean })[]
    >([]),
    [version, setVersion] = useState(group.version),
    [outcomes, setOutcomes] = useState<{ id: string; outcome: string }[]>([]),
    [invalid, setInvalid] = useState(false),
    mutation = usePeopleMutation(user, org);
  const form = useForm({
    defaultValues: {},
    onSubmit: async () => {
      if (!selected.length) {
        setInvalid(true);
        return;
      }
      try {
        const result = await mutation.mutateAsync({
          path: "/groups/" + group.id + "/assignments",
          body: {
            version,
            contacts: selected.map((c) => ({ id: c.id, version: c.version })),
          },
        });
        const failed =
          result.outcomes?.filter(
            (o) => !["saved", "already_member"].includes(o.outcome),
          ) ?? [];
        if (!failed.length) {
          committed.current = true;
          onClose();
          return;
        }
        setVersion(result.version!);
        setOutcomes(result.outcomes ?? []);
        setSelected(selected.filter((c) => failed.some((o) => o.id === c.id)));
      } catch {
        /* Preserve selections on failures. */
      }
    },
  });
  return (
    <PeopleForm
      page
      canLeave={() => committed.current}
      title={m.people_add_members()}
      description={group.name + " · " + m.people_add_members_hint()}
      pending={mutation.isPending}
      error={mutation.error}
      dirty={() => !!selected.length}
      onClose={onClose}
      onSubmit={() => {
        setInvalid(!selected.length);
        if (selected.length) void form.handleSubmit();
      }}
    >
      <Picker<Contact & { assigned?: boolean }>
        user={user}
        org={org}
        path={"/groups/" + group.id + "/member-options"}
        label={m.people_search_contacts()}
        selected={selected}
        onChange={setSelected}
        itemLabel={(c) => c.displayName}
        multiple
      />
      {invalid && <p role="alert">{m.people_choose_contact()}</p>}
      {!!outcomes.length && (
        <div role="status" className="space-y-2">
          <p>{m.people_assignment_partial()}</p>
          {selected.map((c) => (
            <p key={c.id}>
              {c.displayName}:{" "}
              {outcomes.find((o) => o.id === c.id)?.outcome ===
              "version_conflict"
                ? m.people_conflict()
                : m.people_denied()}
            </p>
          ))}
        </div>
      )}
    </PeopleForm>
  );
}
