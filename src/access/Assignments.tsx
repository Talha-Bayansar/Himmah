import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Plus,
  Search,
  Pencil,
  UserMinus,
  History,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { ItemActions } from "../components/shared/item-actions";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { useConfirmation } from "../components/shared/confirmation";
import {
  directoryRequest,
  useDirectoryPages,
  DirectoryError,
} from "../community/client";
import { PointsError } from "../points/PointsShared";
import { useLocale } from "../localization/locale";
import { getLocale } from "../paraglide/runtime.js";
import { m } from "../paraglide/messages.js";
import type { Organization } from "../organization/contracts";
import type { AccessAssignment } from "./contracts";
import { AccessEditor } from "./AccessEditor";
export default function Assignments({
  organization,
  userId,
}: {
  organization: Organization;
  userId: string;
}) {
  useLocale();
  const client = useQueryClient(),
    confirm = useConfirmation(),
    base = "/api/organizations/" + organization.id,
    scope = ["organization", userId, organization.id, "access"];
  const [search, setSearch] = useState(""),
    [q, setQ] = useState(""),
    [revoked, setRevoked] = useState(false),
    [edit, setEdit] = useState<AccessAssignment | "new" | null>(null),
    [history, setHistory] = useState<AccessAssignment | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const pages = useDirectoryPages<AccessAssignment>(
    [...scope, q, revoked],
    base + "/access?q=" + encodeURIComponent(q) + "&archived=" + revoked,
  );
  const refresh = () =>
    client.invalidateQueries({
      queryKey: ["organization", userId, organization.id],
    });
  const revoke = useMutation({
    mutationFn: (item: AccessAssignment) =>
      directoryRequest(base + "/access/" + item.id, {
        method: "DELETE",
        body: JSON.stringify({ version: item.version }),
      }),
    onSettled: refresh,
  });
  const blocked =
    pages.isError &&
    (!pages.isFetchNextPageError ||
      (pages.error instanceof DirectoryError &&
        ["forbidden", "not_found", "sign_in"].includes(pages.error.code)));
  return (
    <section className="directory">
      <Button variant="link" asChild className="settings-back">
        <Link
          to="/workspace/$organizationId/$section"
          params={{ organizationId: organization.id, section: "settings" }}
        >
          <ArrowLeft aria-hidden="true" />
          {m.back_to_settings()}
        </Link>
      </Button>
      <div className="directory-heading">
        <div>
          <h1 tabIndex={-1} data-page-heading>
            {m.access_title()}
          </h1>
          <p>{m.access_help()}</p>
        </div>
        <Button onClick={() => setEdit("new")}>
          <Plus aria-hidden="true" />
          {m.access_create()}
        </Button>
      </div>
      <div className="directory-toolbar">
        <label>
          <Search aria-hidden="true" size={17} />
          <span className="sr-only">{m.directory_search()}</span>
          <Input
            type="search"
            maxLength={80}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={m.directory_search()}
          />
        </label>
        <label className="directory-archived">
          <Checkbox
            checked={revoked}
            onCheckedChange={(v) => setRevoked(v === true)}
          />
          {m.access_show_revoked()}
        </label>
      </div>
      {revoke.isError && <PointsError error={revoke.error} />}
      {pages.isPending ? (
        <ListSkeleton />
      ) : blocked ? (
        <PointsError
          error={pages.error}
          pending={pages.isFetching}
          retry={() => {
            void pages.refetch();
          }}
        />
      ) : (
        <>
          <ul className="directory-list">
            {pages.data?.pages
              .flatMap((p) => p.items)
              .map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.staffName || m.role_volunteer()}</strong>
                    <p>{item.scopeName}</p>
                    <small>
                      {item.revokedAt
                        ? m.access_revoked()
                        : item.effective === false
                          ? m.access_inactive()
                          : m.access_active()}
                    </small>
                    <p>
                      {[
                        item.canAttend ? m.access_attend() : null,
                        item.canAward ? m.access_award() : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <ItemActions
                    name={item.staffName || m.role_volunteer()}
                    pending={
                      revoke.isPending && revoke.variables?.id === item.id
                    }
                    disabled={revoke.isPending}
                    actions={[
                      ...(!item.revokedAt
                        ? [
                            {
                              label: m.access_edit(),
                              icon: Pencil,
                              onSelect: () => setEdit(item),
                            },
                            {
                              label: m.access_revoke(),
                              icon: UserMinus,
                              destructive: true,
                              onSelect: async () => {
                                if (
                                  await confirm({
                                    title: m.access_revoke(),
                                    description: m.access_revoke_help(),
                                    confirmLabel: m.access_revoke(),
                                    destructive: true,
                                  })
                                )
                                  revoke.mutate(item);
                              },
                            },
                          ]
                        : []),
                      {
                        label: m.access_history(),
                        icon: History,
                        onSelect: () => setHistory(item),
                      },
                    ]}
                  />
                </li>
              ))}
          </ul>
          {pages.data?.pages[0]?.items.length === 0 ? (
            <p className="directory-empty">{m.directory_empty()}</p>
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
      {edit && (
        <AccessEditor
          base={base}
          scope={scope}
          {...(edit === "new" ? {} : { assignment: edit })}
          onClose={() => {
            setEdit(null);
            void refresh();
          }}
          onSaved={async () => {
            setEdit(null);
            await refresh();
          }}
        />
      )}
      {history && (
        <AccessHistory
          item={history}
          path={base + "/access/" + history.id + "/history"}
          scope={[...scope, "history", history.id]}
          timezone={organization.timezone}
          onClose={() => setHistory(null)}
        />
      )}
    </section>
  );
}
function AccessHistory({
  item,
  path,
  scope,
  timezone,
  onClose,
}: {
  item: AccessAssignment;
  path: string;
  scope: readonly unknown[];
  timezone: string;
  onClose: () => void;
}) {
  const pages = useDirectoryPages<{
    id: string;
    createdAt: string;
    action: string;
    actorName: string | null;
    after: { can_attend: boolean; can_award: boolean };
  }>(scope, path);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{m.access_history()}</DialogTitle>
          <DialogDescription>
            {item.staffName || m.role_volunteer()} · {item.scopeName}
          </DialogDescription>
        </DialogHeader>
        <div className="directory-picker">
          {pages.isPending ? (
            <ListSkeleton />
          ) : pages.isError &&
            (!pages.isFetchNextPageError ||
              (pages.error instanceof DirectoryError &&
                ["forbidden", "not_found", "sign_in"].includes(
                  pages.error.code,
                ))) ? (
            <PointsError
              error={pages.error}
              pending={pages.isFetching}
              retry={() => {
                void pages.refetch();
              }}
            />
          ) : (
            <>
              <ul className="directory-list">
                {pages.data?.pages
                  .flatMap((p) => p.items)
                  .map((row) => (
                    <li key={row.id}>
                      <div>
                        <strong>
                          {row.action === "grant"
                            ? m.access_grant()
                            : row.action === "edit"
                              ? m.access_change()
                              : row.action === "staff_change"
                                ? m.access_staff_change()
                                : m.access_revoked()}
                        </strong>
                        <p>
                          {row.actorName ??
                            (row.action === "staff_change"
                              ? m.access_system()
                              : m.points_actor())}{" "}
                          ·{" "}
                          {new Intl.DateTimeFormat(getLocale(), {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: timezone,
                          }).format(new Date(row.createdAt))}
                        </p>
                        <small>
                          {[
                            row.after.can_attend ? m.access_attend() : null,
                            row.after.can_award ? m.access_award() : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </div>
                    </li>
                  ))}
              </ul>
              <InfiniteFooter
                {...pages}
                fetchNextPage={() =>
                  pages.fetchNextPage({ cancelRefetch: false })
                }
              />
            </>
          )}
        </div>
        <Button variant="outline" onClick={onClose}>
          {m.close()}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
