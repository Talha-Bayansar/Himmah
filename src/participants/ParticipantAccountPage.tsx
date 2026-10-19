import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Mail,
  Link2,
  Unlink,
  History,
  Copy,
  X,
  UserX,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
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
import {
  directoryRequest,
  useDirectoryPages,
  DirectoryError,
} from "../community/client";
import { PointsError } from "../points/PointsShared";
import { getLocale } from "../paraglide/runtime.js";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import type { Organization } from "../organization/contracts";
import type { ParticipantAccount, ParticipantInvitation } from "./contracts";
import { ParticipantEditor } from "./ParticipantEditor";
const failed = (q: {
  isError: boolean;
  error: unknown;
  isFetchNextPageError?: boolean;
}) =>
  q.isError &&
  (!q.isFetchNextPageError ||
    (q.error instanceof DirectoryError &&
      ["forbidden", "not_found", "sign_in"].includes(q.error.code)));
const eventName = (action: string) =>
  (
    ({
      invite: m.participant_event_invite,
      accept: m.participant_event_accept,
      revoke_invitation: m.participant_event_revoke_invitation,
      revoke_link: m.participant_event_revoke_link,
      member_archived: m.participant_event_member_archived,
    }) as Record<string, () => string>
  )[action]?.() ?? m.participant_access_history();
export default function ParticipantAccountPage({
  organization,
  userId,
  memberId,
  view = "invitations",
}: {
  organization: Organization;
  userId: string;
  memberId: string;
  view?: "invitations" | "history";
}) {
  useLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  const client = useQueryClient(),
    confirm = useConfirmation(),
    scope = [
      "organization",
      userId,
      organization.id,
      "participant-access",
      memberId,
    ],
    base =
      "/api/organizations/" + organization.id + "/participants/" + memberId;
  const [editor, setEditor] = useState<"invite" | string | null>(null),
    [share, setShare] = useState<string | null>(null);
  const account = useQuery({
    queryKey: [...scope, "account"],
    queryFn: ({ signal }) =>
      directoryRequest<{ item: ParticipantAccount }>(base, { signal }),
  });
  useEffect(() => {
    if (account.isSuccess) heading.current?.focus({ preventScroll: true });
  }, [account.isSuccess, memberId, view]);
  const invitations = useDirectoryPages<ParticipantInvitation>(
    [...scope, "invitations"],
    base + "/invitations",
    { enabled: account.isSuccess && view === "invitations" },
  );
  const events = useDirectoryPages<{
    id: string;
    action: string;
    createdAt: string;
    actorName: string | null;
    reason: string | null;
  }>([...scope, "events"], base + "/events", {
    enabled: account.isSuccess && view === "history",
  });
  const refresh = () =>
    client.invalidateQueries({
      queryKey: ["organization", userId, organization.id],
    });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      directoryRequest(base + "/invitations/" + id, {
        method: "DELETE",
        body: "{}",
      }),
    onSettled: refresh,
  });
  const stamp = (date: string) =>
    new Intl.DateTimeFormat(getLocale(), {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: organization.timezone,
    }).format(new Date(date));
  const resource = view === "invitations" ? invitations : events;
  const accessLost =
    resource.isError &&
    resource.error instanceof DirectoryError &&
    ["forbidden", "not_found", "sign_in"].includes(resource.error.code);
  return (
    <section className="directory participant-access-page">
      <Button className="settings-back" variant="link" asChild>
        <Link
          to="/workspace/$organizationId/members/$memberId"
          params={{ organizationId: organization.id, memberId }}
        >
          <ArrowLeft aria-hidden="true" />
          {m.points_member()}
        </Link>
      </Button>
      {account.isPending ? (
        <ListSkeleton />
      ) : account.isError || accessLost ? (
        <PointsError
          error={account.error ?? resource.error}
          pending={account.isFetching || resource.isFetching}
          retry={() => {
            void account.refetch();
            void resource.refetch();
          }}
        />
      ) : (
        <>
          <div className="directory-heading">
            <div>
              <h1 ref={heading} tabIndex={-1} data-page-heading>
                {m.participant_access()}
              </h1>
              <p>{account.data.item.person.name}</p>
              <p>{m.participant_access_help()}</p>
            </div>
            {!account.data.item.person.archived &&
              !account.data.item.link &&
              !account.data.item.pending && (
                <Button onClick={() => setEditor("invite")}>
                  <Mail aria-hidden="true" />
                  {m.participant_invite()}
                </Button>
              )}
          </div>
          <div className="settings-panel participant-link-card">
            <div>
              <h2>
                {account.data.item.link
                  ? m.participant_linked()
                  : m.participant_unlinked()}
              </h2>
              {account.data.item.link ? (
                <>
                  <p>{account.data.item.link.email}</p>
                  <p>{stamp(account.data.item.link.createdAt)}</p>
                </>
              ) : account.data.item.pending ? (
                <p>{m.participant_pending()}</p>
              ) : null}
            </div>
            {account.data.item.link && (
              <ItemActions
                name={account.data.item.link.email}
                actions={[
                  {
                    label: m.participant_disconnect(),
                    icon: Unlink,
                    destructive: true,
                    onSelect: () => setEditor(account.data.item.link!.id),
                  },
                ]}
              />
            )}
          </div>
          <nav className="reward-tabs" aria-label={m.participant_access()}>
            {(["invitations", "history"] as const).map((tab) => (
              <Button
                key={tab}
                variant={view === tab ? "default" : "outline"}
                asChild
              >
                <Link
                  to="/workspace/$organizationId/members/$memberId/account"
                  params={{ organizationId: organization.id, memberId }}
                  search={{ view: tab }}
                  aria-current={view === tab ? "page" : undefined}
                >
                  {tab === "invitations" ? (
                    <Mail aria-hidden="true" />
                  ) : (
                    <History aria-hidden="true" />
                  )}
                  {tab === "invitations"
                    ? m.participant_invitation_history()
                    : m.participant_access_history()}
                </Link>
              </Button>
            ))}
          </nav>
          {revoke.isError && <PointsError error={revoke.error} />}
          {resource.isPending ? (
            <ListSkeleton />
          ) : failed(resource) ? (
            <PointsError
              error={resource.error}
              pending={resource.isFetching}
              retry={() => void resource.refetch()}
            />
          ) : (
            <>
              <ul className="directory-list">
                {view === "invitations"
                  ? invitations.data?.pages
                      .flatMap((page) => page.items)
                      .map((invite) => (
                        <li key={invite.id}>
                          <div>
                            <strong>{invite.email}</strong>
                            <p>
                              {invite.accepted
                                ? m.participant_accepted()
                                : invite.revokedAt
                                  ? m.participant_revoked()
                                  : Date.parse(invite.expiresAt) <= Date.now()
                                    ? m.participant_expired()
                                    : m.participant_pending()}
                            </p>
                            <p>
                              {m.directory_expires({
                                date: stamp(invite.expiresAt),
                              })}
                            </p>
                            <small>
                              {m.participant_consent_recorded({
                                date: stamp(invite.consentAttestedAt),
                              })}
                            </small>
                          </div>
                          {!invite.accepted && !invite.revokedAt && (
                            <ItemActions
                              name={invite.email}
                              disabled={revoke.isPending}
                              pending={
                                revoke.isPending &&
                                revoke.variables === invite.id
                              }
                              actions={[
                                {
                                  label: m.directory_revoke(),
                                  icon: UserX,
                                  destructive: true,
                                  onSelect: async () => {
                                    if (
                                      await confirm({
                                        title: m.directory_revoke(),
                                        description:
                                          m.participant_revoke_invite_help(),
                                        confirmLabel: m.directory_revoke(),
                                        destructive: true,
                                      })
                                    )
                                      await revoke
                                        .mutateAsync(invite.id)
                                        .catch(() => {});
                                  },
                                },
                              ]}
                            />
                          )}
                        </li>
                      ))
                  : events.data?.pages
                      .flatMap((page) => page.items)
                      .map((event) => (
                        <li key={event.id}>
                          <div>
                            <strong>{eventName(event.action)}</strong>
                            <p>
                              {event.actorName ?? m.access_system()} ·{" "}
                              {stamp(event.createdAt)}
                            </p>
                            {event.reason &&
                              event.reason !== "member_archived" && (
                                <p className="reward-reason">{event.reason}</p>
                              )}
                          </div>
                        </li>
                      ))}
              </ul>
              {resource.data?.pages[0]?.items.length === 0 ? (
                <p className="directory-empty">{m.rewards_empty()}</p>
              ) : (
                <InfiniteFooter
                  {...resource}
                  fetchNextPage={() =>
                    resource.fetchNextPage({ cancelRefetch: false })
                  }
                />
              )}
            </>
          )}
          {editor && (
            <ParticipantEditor
              path={base}
              personName={account.data.item.person.name}
              {...(editor === "invite" ? {} : { linkId: editor })}
              onClose={() => {
                setEditor(null);
                void refresh();
              }}
              onSaved={async (link) => {
                setEditor(null);
                if (link) setShare(link);
                await refresh();
              }}
            />
          )}
          {share && (
            <ShareParticipantLink link={share} onClose={() => setShare(null)} />
          )}
        </>
      )}
    </section>
  );
}
function ShareParticipantLink({
  link,
  onClose,
}: {
  link: string;
  onClose: () => void;
}) {
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
          <DialogDescription>{m.participant_share_help()}</DialogDescription>
        </DialogHeader>
        <Label htmlFor="participant-invitation-link">
          {m.directory_invite_link()}
        </Label>
        <Input
          id="participant-invitation-link"
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
        />
        {copied.isError && <p role="alert">{m.directory_copy_manual()}</p>}
        <ActionButton
          pending={copied.isPending}
          onClick={() => copied.mutate()}
        >
          <Copy aria-hidden="true" />
          {copied.isSuccess ? m.directory_copied() : m.directory_copy()}
        </ActionButton>
        <Button variant="outline" onClick={onClose}>
          <X aria-hidden="true" />
          {m.close()}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
