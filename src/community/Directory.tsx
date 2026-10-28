import {
  DirectoryHeader,
  DirectoryToolbar,
  DirectoryList,
  DirectoryItem,
  DirectoryRecord,
} from "../components/shared/directory-layout";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Mail, UserPlus, ShieldCheck, UserMinus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionButton } from "../components/shared/action-button";
import { CollectionError } from "../components/shared/collection-error";
import { useConfirmation } from "../components/shared/confirmation";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { ItemActions } from "../components/shared/item-actions";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { useLocale } from "../localization/locale";
import { PeopleForm, useSearch } from "../modules/people/shared";
import type { Organization } from "../organization/contracts";
import { m } from "../paraglide/messages.js";
import { DirectoryError, directoryRequest, useDirectoryPages } from "./client";
import { newToken, type Invitation, type Staff } from "./contracts";
export default function Directory({
  organization,
  userId,
  section,
}: {
  organization: Organization;
  userId: string;
  section: "staff" | "invitations";
}) {
  useLocale();
  const [q, setQ] = useState(""),
    search = useSearch(q),
    [adding, setAdding] = useState(false),
    [link, setLink] = useState<string | null>(null),
    client = useQueryClient(),
    confirm = useConfirmation();
  const key = ["organization", userId, organization.id, "directory", section],
    base = `/api/organizations/${organization.id}`;
  const pages = useDirectoryPages<Staff | Invitation>(
    [...key, search],
    base + "/" + section + "?q=" + encodeURIComponent(search),
  );
  const mutation = useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string;
      method: string;
      body: Record<string, unknown>;
    }) => directoryRequest(base + path, { method, body: JSON.stringify(body) }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  const scope = userId + organization.id;
  const [denied, setDenied] = useState<{
    scope: string;
    error: unknown;
  } | null>(null);
  const accessError = [pages.error, mutation.error].find(
    (e) =>
      e instanceof DirectoryError &&
      [
        "forbidden",
        "not_found",
        "not_found_or_forbidden",
        "sign_in",
        "verify_required",
      ].includes(e.code),
  );
  useEffect(() => {
    if (accessError) {
      setDenied({ scope, error: accessError });
      void client.cancelQueries({ queryKey: key });
      client.removeQueries({ queryKey: key });
    }
  }, [accessError, scope, client]);
  if (accessError || denied?.scope === scope)
    return <CollectionError error={accessError ?? denied?.error} />;
  async function changeStaff(s: Staff, role: "admin" | "volunteer" | null) {
    if (
      await confirm({
        title: role ? m.directory_change_role() : m.directory_remove_staff(),
        description: s.name?.trim() || m.staff_unnamed(),
        destructive: true,
      })
    )
      mutation.mutate({
        path: "/staff/" + encodeURIComponent(s.id),
        method: role ? "PATCH" : "DELETE",
        body: { previous: s.role, ...(role ? { role } : {}) },
      });
  }
  async function revoke(i: Invitation) {
    if (
      await confirm({
        title: m.directory_revoke(),
        description: i.email,
        destructive: true,
      })
    )
      mutation.mutate({
        path: "/invitations/" + i.id,
        method: "DELETE",
        body: {},
      });
  }
  return (
    <section className="directory">
      <DirectoryHeader
        title={
          section === "staff" ? m.directory_staff() : m.directory_invitations()
        }
        description={
          section === "staff"
            ? m.directory_staff_help()
            : m.directory_invite_help()
        }
        action={
          section === "invitations" ? (
            <Button onClick={() => setAdding(true)}>
              <UserPlus aria-hidden="true" />
              {m.directory_invite()}
            </Button>
          ) : undefined
        }
      />
      <DirectoryToolbar
        id="staff-search"
        label={m.directory_search()}
        value={q}
        onChange={setQ}
      />
      {mutation.isError && <CollectionError error={mutation.error} />}
      {pages.isPending ? (
        <ListSkeleton />
      ) : pages.isError && !pages.data ? (
        <CollectionError
          error={pages.error}
          retry={() => void pages.refetch()}
        />
      ) : (
        <>
          <DirectoryList
            label={
              section === "staff"
                ? m.directory_staff()
                : m.directory_invitations()
            }
            busy={pages.isFetchingNextPage}
          >
            {pages.data?.pages
              .flatMap((p) => p.items)
              .map((item) => {
                const staff = section === "staff" ? (item as Staff) : null,
                  invite =
                    section === "invitations" ? (item as Invitation) : null;
                return (
                  <DirectoryItem key={item.id}>
                    <DirectoryRecord
                      name={
                        staff
                          ? staff.name?.trim() || m.staff_unnamed()
                          : invite!.email
                      }
                      {...(invite
                        ? { icon: <Mail aria-hidden="true" size={19} /> }
                        : {})}
                      detail={
                        <>
                          {m[`role_${item.role}`]()}{" "}
                          {invite &&
                            (invite.accepted
                              ? " · " + m.directory_accepted()
                              : invite.revoked
                                ? " · " + m.directory_revoked()
                                : "")}
                        </>
                      }
                    />
                    <ItemActions
                      name={
                        staff?.name?.trim() ||
                        invite?.email ||
                        m.staff_unnamed()
                      }
                      pending={mutation.isPending}
                      actions={
                        staff && staff.role !== "owner" && staff.id !== userId
                          ? [
                              ...(organization.role === "owner"
                                ? [
                                    {
                                      label: m.directory_change_role(),
                                      icon: ShieldCheck,
                                      onSelect: () =>
                                        void changeStaff(
                                          staff,
                                          staff.role === "admin"
                                            ? "volunteer"
                                            : "admin",
                                        ),
                                    },
                                  ]
                                : []),
                              {
                                label: m.directory_remove_staff(),
                                icon: UserMinus,
                                onSelect: () => void changeStaff(staff, null),
                              },
                            ]
                          : invite && !invite.accepted && !invite.revoked
                            ? [
                                {
                                  label: m.directory_revoke(),
                                  icon: UserMinus,
                                  onSelect: () => void revoke(invite),
                                },
                              ]
                            : []
                      }
                    />
                  </DirectoryItem>
                );
              })}
          </DirectoryList>
          {!pages.data?.pages.some((p) => p.items.length) && (
            <p className="directory-empty">{m.directory_empty()}</p>
          )}
          <InfiniteFooter {...pages} />
        </>
      )}
      {adding && (
        <InviteEditor
          organization={organization}
          userId={userId}
          onClose={() => setAdding(false)}
          onSaved={(url) => {
            setAdding(false);
            setLink(url);
            void client.invalidateQueries({ queryKey: key });
          }}
        />
      )}
      {link && <ShareInvite link={link} onClose={() => setLink(null)} />}
    </section>
  );
}
function InviteEditor({
  organization,
  userId,
  onClose,
  onSaved,
}: {
  organization: Organization;
  userId: string;
  onClose: () => void;
  onSaved: (link: string) => void;
}) {
  const key = useRef(crypto.randomUUID()),
    token = useRef(newToken()),
    mutation = useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        directoryRequest(`/api/organizations/${organization.id}/invitations`, {
          method: "POST",
          body: JSON.stringify({
            ...body,
            key: key.current,
            token: token.current,
          }),
        }),
    });
  const form = useForm({
    defaultValues: { email: "", role: "volunteer" },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(value);
        onSaved(location.origin + "/join#" + token.current);
      } catch {
        /* Keep draft and exact request token. */
      }
    },
  });
  return (
    <PeopleForm
      title={m.directory_invite()}
      description={m.directory_invite_help()}
      onClose={onClose}
      onSubmit={() => void form.handleSubmit()}
      dirty={() => form.state.isDirty}
      pending={mutation.isPending}
      error={mutation.error}
    >
      <form.Field name="email">
        {(f) => (
          <div className="space-y-2">
            <Label htmlFor="invite-email">{m.email_address()}</Label>
            <Input
              id="invite-email"
              type="email"
              required
              maxLength={254}
              value={f.state.value}
              onChange={(e) => f.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>
      <form.Field name="role">
        {(f) => (
          <div className="space-y-2">
            <Label htmlFor="invite-role">{m.your_role()}</Label>
            <NativeSelect
              id="invite-role"
              value={f.state.value}
              onChange={(e) => f.handleChange(e.target.value)}
            >
              <NativeSelectOption value="volunteer">
                {m.role_volunteer()}
              </NativeSelectOption>
              {organization.role === "owner" && (
                <NativeSelectOption value="admin">
                  {m.role_admin()}
                </NativeSelectOption>
              )}
            </NativeSelect>
          </div>
        )}
      </form.Field>
    </PeopleForm>
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
