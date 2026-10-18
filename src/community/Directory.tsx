import { useEffect, useRef, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker } from "@tanstack/react-router";
import {
  Plus,
  Search,
  Users,
  Folder,
  Check,
  UserPlus,
  UserMinus,
  Pencil,
  Archive,
  ArchiveRestore,
  Ban,
  Save,
  X,
  Copy,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
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
import { Alert, AlertDescription } from "../components/ui/alert";
import { ActionButton } from "../components/shared/action-button";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { useConfirmation } from "../components/shared/confirmation";
import { useLocale } from "../localization/locale";
import { getLocale } from "../paraglide/runtime.js";
import { m } from "../paraglide/messages.js";
import {
  directoryRequest,
  directoryMessage,
  DirectoryError,
  useDirectoryPages,
} from "./client";
import {
  newToken,
  type Person,
  type Group,
  type GroupOption,
  type Staff,
  type Invitation,
} from "./contracts";
import type { Organization } from "../organization/contracts";

export type DirectoryKind = "people" | "groups" | "staff" | "invitations";
type EditorState = { kind: "people" | "groups" | "invitations"; item?: Person };
function ErrorNotice({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{directoryMessage(error)}</AlertDescription>
    </Alert>
  );
}
function useSearch(value: string) {
  const [result, set] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => set(value), 250);
    return () => clearTimeout(timer);
  }, [value]);
  return result;
}
export default function Directory({
  organization,
  userId,
  section = "people",
  group = null,
}: {
  organization: Organization;
  userId: string;
  section?: DirectoryKind;
  group?: Group | null;
}) {
  useLocale();
  const client = useQueryClient();
  const confirm = useConfirmation();
  const [search, setSearch] = useState("");
  const query = useSearch(search);
  const [archived, setArchived] = useState(false);
  const kind = group ? "people" : section;
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [assign, setAssign] = useState<Person | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const prefix = ["organization", userId, organization.id, "directory"];
  const base = "/api/organizations/" + organization.id;
  const params = new URLSearchParams({ q: query, archived: String(archived) });
  if (kind === "people" && group) params.set("group", group.id);
  const pages = useDirectoryPages<Person | Staff | Invitation>(
    [...prefix, kind, query, archived, kind === "people" ? group?.id : null],
    base + "/" + kind + "?" + params,
  );
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const [notice, setNotice] = useState("");
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: prefix });
  };
  const operation = useMutation({
    mutationFn: async ({
      path,
      method,
      body,
    }: {
      path: string;
      method: string;
      body?: unknown;
    }) =>
      directoryRequest(base + path, {
        method,
        body: JSON.stringify(body ?? {}),
      }),
    onSuccess: async () => {
      setNotice(m.directory_saved());
      await refresh();
    },
    onError: () => {
      void refresh();
    },
  });
  const busy = (id: string, method: string) =>
    operation.isPending &&
    operation.variables?.method === method &&
    operation.variables.path.split("/").includes(encodeURIComponent(id));
  const names = {
    people: m.directory_members(),
    groups: m.directory_groups(),
    staff: m.directory_staff(),
    invitations: m.directory_invitations(),
  };
  async function archive(item: Person) {
    if (
      await confirm({
        title: item.archived ? m.directory_restore() : m.directory_archive(),
        description: m.directory_archive_description({ name: item.name }),
        confirmLabel: item.archived
          ? m.directory_restore()
          : m.directory_archive(),
        destructive: !item.archived,
      })
    )
      operation.mutate({
        path: `/${kind}/${item.id}`,
        method: "PATCH",
        body: { version: item.version, archived: !item.archived },
      });
  }
  async function removeFromGroup(item: Person) {
    if (
      group &&
      (await confirm({
        title: m.directory_remove_group(),
        description: m.directory_remove_description({
          name: item.name,
          group: group.name,
        }),
        confirmLabel: m.directory_remove_group(),
        destructive: true,
      }))
    )
      operation.mutate({
        path: `/people/${item.id}/groups/${group.id}`,
        method: "DELETE",
      });
  }
  return (
    <section className="directory" aria-label={m.directory_title()}>
      <div className="directory-heading">
        <div>
          <h1 tabIndex={-1} data-page-heading>
            {group ? group.name : names[kind]}
          </h1>
          <p>
            {group
              ? m.directory_group_members_help()
              : kind === "people"
                ? m.directory_roster_help()
                : kind === "groups"
                  ? m.directory_groups_help()
                  : m.directory_staff_help()}
          </p>
        </div>
        {kind !== "staff" && !group && (
          <Button onClick={() => setEditor({ kind })}>
            <Plus size={16} />
            {kind === "people"
              ? m.directory_add_member()
              : kind === "groups"
                ? m.directory_add_group()
                : m.directory_invite()}
          </Button>
        )}
      </div>
      <div className="directory-toolbar">
        <label>
          <Search size={17} />
          <span className="sr-only">{m.directory_search()}</span>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={m.directory_search()}
          />
        </label>
        {(kind === "people" || kind === "groups") && (
          <label className="directory-archived">
            <Checkbox
              checked={archived}
              onCheckedChange={(v) => setArchived(v === true)}
            />
            {m.directory_show_archived()}
          </label>
        )}
      </div>
      {notice && (
        <p role="status" className="directory-notice">
          {notice}
        </p>
      )}
      {operation.isError && <ErrorNotice error={operation.error} />}
      {pages.isPending ? (
        <ListSkeleton />
      ) : pages.isError &&
        (!pages.data ||
          (pages.error instanceof DirectoryError &&
            ["forbidden", "not_found", "sign_in"].includes(
              pages.error.code,
            ))) ? (
        <div className="space-y-3">
          <ErrorNotice error={pages.error} />
          <ActionButton
            pending={pages.isFetching}
            onClick={() => {
              void pages.refetch();
            }}
          >
            {m.try_again()}
          </ActionButton>
        </div>
      ) : (
        <>
          {items.length === 0 ? (
            <div className="directory-empty">
              <Users size={28} />
              <h3>{m.directory_empty()}</h3>
              <p>
                {query
                  ? m.directory_no_matches()
                  : group
                    ? m.directory_group_members_help()
                    : m.directory_get_started()}
              </p>
            </div>
          ) : (
            <ul
              className="directory-list"
              aria-label={names[kind]}
              aria-busy={pages.isFetchingNextPage}
            >
              {items.map((item) => (
                <li key={item.id}>
                  {kind === "people" || kind === "groups"
                    ? (() => {
                        const record = item as Person;
                        return (
                          <>
                            <div className="directory-record">
                              <span className="avatar">
                                {kind === "groups" ? (
                                  <Folder size={19} />
                                ) : (
                                  record.name
                                    .slice(0, 1)
                                    .toLocaleUpperCase(getLocale())
                                )}
                              </span>
                              <strong>{record.name}</strong>
                            </div>
                            <div className="directory-actions">
                              {kind === "groups" && !record.archived && (
                                <Button variant="outline" asChild>
                                  <Link
                                    to="/workspace/$organizationId/groups/$groupId"
                                    params={{
                                      organizationId: organization.id,
                                      groupId: record.id,
                                    }}
                                  >
                                    <Users size={17} aria-hidden="true" />
                                    {m.directory_view_members()}
                                  </Link>
                                </Button>
                              )}
                              {kind === "people" &&
                                !record.archived &&
                                (group ? (
                                  <ActionButton
                                    variant="outline"
                                    pending={busy(item.id, "DELETE")}
                                    disabled={operation.isPending}
                                    onClick={() => removeFromGroup(record)}
                                  >
                                    <UserMinus size={17} aria-hidden="true" />
                                    {m.directory_remove_group()}
                                  </ActionButton>
                                ) : (
                                  <Button
                                    variant="outline"
                                    disabled={operation.isPending}
                                    onClick={() => setAssign(record)}
                                  >
                                    <UserPlus size={17} aria-hidden="true" />
                                    {m.directory_add_to_group()}
                                  </Button>
                                ))}
                              <Button
                                variant="outline"
                                disabled={operation.isPending}
                                onClick={() =>
                                  setEditor({
                                    kind: kind as "people" | "groups",
                                    item: record,
                                  })
                                }
                              >
                                <Pencil size={17} aria-hidden="true" />
                                {m.directory_rename()}
                              </Button>
                              <ActionButton
                                variant="outline"
                                pending={busy(item.id, "PATCH")}
                                disabled={operation.isPending}
                                onClick={() => archive(record)}
                              >
                                {record.archived ? (
                                  <ArchiveRestore
                                    size={17}
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Archive size={17} aria-hidden="true" />
                                )}
                                {record.archived
                                  ? m.directory_restore()
                                  : m.directory_archive()}
                              </ActionButton>
                            </div>
                          </>
                        );
                      })()
                    : kind === "staff"
                      ? (() => {
                          const staff = item as Staff;
                          const editable =
                            staff.role !== "owner" && staff.id !== userId;
                          return (
                            <>
                              <div>
                                <strong>
                                  {staff.name ?? m[`role_${staff.role}`]()}
                                </strong>
                                <p>
                                  {m[`role_${staff.role}`]()}
                                  {staff.id === userId
                                    ? " · " + m.directory_you()
                                    : ""}
                                </p>
                              </div>
                              <div className="directory-actions">
                                {editable && organization.role === "owner" && (
                                  <NativeSelect
                                    aria-label={m.directory_role_for({
                                      name:
                                        staff.name ?? m[`role_${staff.role}`](),
                                    })}
                                    value={staff.role}
                                    disabled={operation.isPending}
                                    onChange={async (e) => {
                                      const role = e.target.value;
                                      if (
                                        await confirm({
                                          title: m.directory_change_role(),
                                          description:
                                            m.directory_access_description(),
                                          confirmLabel:
                                            m.directory_change_role(),
                                        })
                                      )
                                        operation.mutate({
                                          path:
                                            "/staff/" +
                                            encodeURIComponent(staff.id),
                                          method: "PATCH",
                                          body: { previous: staff.role, role },
                                        });
                                    }}
                                  >
                                    <NativeSelectOption value="admin">
                                      {m.role_admin()}
                                    </NativeSelectOption>
                                    <NativeSelectOption value="volunteer">
                                      {m.role_volunteer()}
                                    </NativeSelectOption>
                                  </NativeSelect>
                                )}
                                {editable &&
                                  (organization.role === "owner" ||
                                    staff.role === "volunteer") && (
                                    <ActionButton
                                      variant="outline"
                                      pending={busy(item.id, "DELETE")}
                                      disabled={operation.isPending}
                                      onClick={async () => {
                                        if (
                                          await confirm({
                                            title: m.directory_remove_staff(),
                                            description:
                                              m.directory_access_description(),
                                            confirmLabel:
                                              m.directory_remove_staff(),
                                            destructive: true,
                                          })
                                        )
                                          operation.mutate({
                                            path:
                                              "/staff/" +
                                              encodeURIComponent(staff.id),
                                            method: "DELETE",
                                            body: { previous: staff.role },
                                          });
                                      }}
                                    >
                                      <UserMinus size={17} aria-hidden="true" />
                                      {m.directory_remove_staff()}
                                    </ActionButton>
                                  )}
                              </div>
                            </>
                          );
                        })()
                      : (() => {
                          const invite = item as Invitation;
                          const expired =
                            Date.parse(invite.expiresAt) < Date.now();
                          return (
                            <>
                              <div>
                                <strong>{invite.email}</strong>
                                <p>
                                  {m[`role_${invite.role}`]()} ·{" "}
                                  {invite.accepted
                                    ? m.directory_accepted()
                                    : invite.revoked
                                      ? m.directory_revoked()
                                      : expired
                                        ? m.directory_expired()
                                        : m.directory_pending()}
                                </p>
                                <small>
                                  {m.directory_expires({
                                    date: new Intl.DateTimeFormat(getLocale(), {
                                      dateStyle: "medium",
                                      timeZone: organization.timezone,
                                    }).format(new Date(invite.expiresAt)),
                                  })}
                                </small>
                              </div>
                              {!invite.accepted &&
                                !invite.revoked &&
                                !expired &&
                                (organization.role === "owner" ||
                                  invite.role === "volunteer") && (
                                  <ActionButton
                                    variant="outline"
                                    pending={busy(item.id, "DELETE")}
                                    disabled={operation.isPending}
                                    onClick={async () => {
                                      if (
                                        await confirm({
                                          title: m.directory_revoke(),
                                          description:
                                            m.directory_access_description(),
                                          confirmLabel: m.directory_revoke(),
                                          destructive: true,
                                        })
                                      )
                                        operation.mutate({
                                          path: "/invitations/" + invite.id,
                                          method: "DELETE",
                                        });
                                    }}
                                  >
                                    <Ban size={17} aria-hidden="true" />
                                    {m.directory_revoke()}
                                  </ActionButton>
                                )}
                            </>
                          );
                        })()}
                </li>
              ))}
            </ul>
          )}
          {items.length > 0 && (
            <InfiniteFooter
              {...pages}
              fetchNextPage={() =>
                pages.fetchNextPage({ cancelRefetch: false })
              }
            />
          )}
        </>
      )}
      {editor && (
        <Editor
          state={editor}
          owner={organization.role === "owner"}
          onClose={() => setEditor(null)}
          onSave={async (value, key, token) => {
            let invitationLink: string | null = null;
            if (editor.kind === "invitations") {
              await directoryRequest(base + "/invitations", {
                method: "POST",
                body: JSON.stringify({ ...value, key, token }),
              });
              invitationLink = window.location.origin + "/join#" + token;
            } else
              await directoryRequest(
                base +
                  "/" +
                  editor.kind +
                  (editor.item ? "/" + editor.item.id : ""),
                {
                  method: editor.item ? "PATCH" : "POST",
                  body: JSON.stringify({
                    ...value,
                    key,
                    ...(editor.item ? { version: editor.item.version } : {}),
                  }),
                },
              );
            await refresh();
            setEditor(null);
            if (invitationLink) setLink(invitationLink);
          }}
        />
      )}
      {assign && (
        <Picker
          title={m.directory_add_to_group()}
          path={base + `/people/${assign.id}/group-options`}
          scope={[...prefix, "group-picker", assign.id]}
          onClose={() => setAssign(null)}
          onPick={async (item) => {
            await directoryRequest(
              base + `/people/${assign.id}/groups/${item.id}`,
              { method: "PUT", body: "{}" },
            );
            setAssign(null);
            setNotice(m.directory_saved());
            await refresh();
          }}
        />
      )}
      {link && <ShareInvite link={link} onClose={() => setLink(null)} />}
    </section>
  );
}
function Editor({
  state,
  owner,
  onClose,
  onSave,
}: {
  state: EditorState;
  owner: boolean;
  onClose: () => void;
  onSave: (
    value: { name: string; email: string; role: string; consent: boolean },
    key: string,
    token: string,
  ) => Promise<void>;
}) {
  useLocale();
  const confirm = useConfirmation();
  const key = useRef("");
  const token = useRef("");
  const submission = useMutation({
    mutationFn: async (value: {
      name: string;
      email: string;
      role: string;
      consent: boolean;
    }) => {
      key.current ||= crypto.randomUUID();
      token.current ||= newToken();
      await onSave(value, key.current, token.current);
    },
  });
  const form = useForm({
    defaultValues: {
      name: state.item?.name ?? "",
      email: "",
      role: "volunteer",
      consent: false,
    },
    onSubmit: async ({ value }) => {
      await submission.mutateAsync(value).catch(() => {});
    },
  });
  const dirty = useStore(form.store, (s) => s.isDirty);
  const canLeave = async () =>
    !dirty ||
    submission.isSuccess ||
    (await confirm({
      title: m.directory_discard(),
      description: m.directory_discard_description(),
      confirmLabel: m.directory_discard(),
      destructive: true,
    }));
  useBlocker({
    shouldBlockFn: async () => !(await canLeave()),
    enableBeforeUnload: dirty && !submission.isSuccess,
  });
  return (
    <Dialog
      open
      onOpenChange={async (open) => {
        if (!open && !submission.isPending && (await canLeave())) onClose();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {state.item
              ? m.directory_rename()
              : state.kind === "people"
                ? m.directory_add_member()
                : state.kind === "groups"
                  ? m.directory_add_group()
                  : m.directory_invite()}
          </DialogTitle>
          <DialogDescription>
            {state.kind === "invitations"
              ? m.directory_invite_help()
              : state.kind === "groups"
                ? m.directory_groups_help()
                : m.directory_roster_help()}
          </DialogDescription>
        </DialogHeader>
        {submission.isError && <ErrorNotice error={submission.error} />}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="directory-form"
        >
          {state.kind === "invitations" ? (
            <>
              <form.Field name="email">
                {(field) => (
                  <div>
                    <Label htmlFor="invite-email">{m.email_address()}</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      enterKeyHint="next"
                      required
                      maxLength={254}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      disabled={submission.isPending}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="role">
                {(field) => (
                  <div>
                    <Label htmlFor="invite-role">{m.your_role()}</Label>
                    <NativeSelect
                      id="invite-role"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      disabled={submission.isPending}
                    >
                      <NativeSelectOption value="volunteer">
                        {m.role_volunteer()}
                      </NativeSelectOption>
                      {owner && (
                        <NativeSelectOption value="admin">
                          {m.role_admin()}
                        </NativeSelectOption>
                      )}
                    </NativeSelect>
                  </div>
                )}
              </form.Field>
            </>
          ) : (
            <form.Field name="name">
              {(field) => (
                <div>
                  <Label htmlFor="record-name">{m.directory_name()}</Label>
                  <Input
                    id="record-name"
                    autoComplete="off"
                    autoCapitalize="words"
                    enterKeyHint="done"
                    required
                    minLength={2}
                    maxLength={80}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    disabled={submission.isPending}
                  />
                </div>
              )}
            </form.Field>
          )}
          {state.kind === "people" && !state.item && (
            <form.Field name="consent">
              {(field) => (
                <Label className="directory-check">
                  <Checkbox
                    checked={field.state.value}
                    onCheckedChange={(v) => field.handleChange(v === true)}
                    disabled={submission.isPending}
                  />
                  {m.directory_consent()}
                </Label>
              )}
            </form.Field>
          )}
          <div className="directory-actions">
            <Button
              type="button"
              variant="outline"
              disabled={submission.isPending}
              onClick={async () => {
                if (await canLeave()) onClose();
              }}
            >
              <X size={17} aria-hidden="true" />
              {m.cancel()}
            </Button>
            <ActionButton type="submit" pending={submission.isPending}>
              <Save size={17} aria-hidden="true" />
              {m.directory_save()}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function Picker({
  title,
  path,
  scope,
  onClose,
  onPick,
}: {
  title: string;
  path: string;
  scope: readonly unknown[];
  onClose: () => void;
  onPick: (item: GroupOption) => Promise<void>;
}) {
  useLocale();
  const [search, setSearch] = useState("");
  const query = useSearch(search);
  const pages = useDirectoryPages<GroupOption>(
    [...scope, query],
    path + "?q=" + encodeURIComponent(query),
    { staleTime: 0, refetchOnMount: "always" },
  );
  const mutation = useMutation({
    mutationFn: async (item: GroupOption) => {
      if (!item.assigned) await onPick(item);
    },
  });
  const items = pages.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{m.directory_choose_group()}</DialogDescription>
        </DialogHeader>
        <Input
          aria-label={m.directory_search()}
          placeholder={m.directory_search()}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {mutation.isError && <ErrorNotice error={mutation.error} />}
        <div className="directory-picker">
          {pages.isPending ? (
            <ListSkeleton />
          ) : pages.isError &&
            (!pages.data ||
              !pages.isFetchNextPageError ||
              (pages.error instanceof DirectoryError &&
                ["forbidden", "not_found", "sign_in"].includes(
                  pages.error.code,
                ))) ? (
            <>
              <ErrorNotice error={pages.error} />
              <ActionButton
                pending={pages.isFetching}
                onClick={() => {
                  void pages.refetch();
                }}
              >
                {m.try_again()}
              </ActionButton>
            </>
          ) : (
            <>
              <ul className="directory-list">
                {items.map((item) => (
                  <li key={item.id}>
                    <ActionButton
                      variant="outline"
                      data-assigned={item.assigned || undefined}
                      disabled={
                        item.assigned ||
                        mutation.isPending ||
                        (pages.isFetching && !pages.isFetchingNextPage)
                      }
                      pending={
                        mutation.isPending &&
                        mutation.variables?.id === item.id &&
                        !item.assigned
                      }
                      onClick={() => {
                        if (!item.assigned && !mutation.isPending)
                          mutation.mutate(item);
                      }}
                    >
                      {item.assigned ? (
                        <Check size={18} aria-hidden="true" />
                      ) : (
                        <Plus size={18} aria-hidden="true" />
                      )}
                      <span className="group-option-label">
                        <strong>{item.name}</strong>{" "}
                        {item.assigned && (
                          <small>{m.directory_already_in_group()}</small>
                        )}
                      </span>
                    </ActionButton>
                  </li>
                ))}
              </ul>
              {items.length === 0 ? (
                <p>{m.directory_empty()}</p>
              ) : (
                <InfiniteFooter
                  {...pages}
                  fetchNextPage={() =>
                    pages.fetchNextPage({ cancelRefetch: false })
                  }
                />
              )}
            </>
          )}
        </div>
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onClick={onClose}
        >
          <X size={17} aria-hidden="true" />
          {m.close()}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
function ShareInvite({ link, onClose }: { link: string; onClose: () => void }) {
  useLocale();
  const copied = useMutation({
    mutationFn: () => navigator.clipboard.writeText(link),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{m.directory_share_title()}</DialogTitle>
          <DialogDescription>{m.directory_share_help()}</DialogDescription>
        </DialogHeader>
        <Label htmlFor="invite-link">{m.directory_invite_link()}</Label>
        <Input
          id="invite-link"
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
        />
        {copied.isError && <p role="alert">{m.directory_copy_manual()}</p>}
        <ActionButton
          pending={copied.isPending}
          onClick={() => copied.mutate()}
        >
          <Copy size={17} aria-hidden="true" />
          {copied.isSuccess ? m.directory_copied() : m.directory_copy()}
        </ActionButton>
        <Button variant="outline" onClick={onClose}>
          <X size={17} aria-hidden="true" />
          {m.close()}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
