import { RewardWallet } from "../rewards/RewardWallet";
import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Coins, Pencil, ClipboardCheck, Link2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { ItemActions } from "../components/shared/item-actions";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import {
  directoryRequest,
  useDirectoryPages,
  DirectoryError,
} from "../community/client";
import type { Person } from "../community/contracts";
import type { Organization } from "../organization/contracts";
import { useLocale } from "../localization/locale";
import { getLocale } from "../paraglide/runtime.js";
import { m } from "../paraglide/messages.js";
import { PointsEditor } from "./PointsEditor";
import { PointsError, PointsResults } from "./PointsShared";
import type { PointsEntry, PointsResult } from "./contracts";
export default function MemberPage({
  organization,
  userId,
  memberId,
}: {
  organization: Organization;
  userId: string;
  memberId: string;
}) {
  useLocale();
  const navigate = useNavigate();
  const client = useQueryClient();
  const scope = ["organization", userId, organization.id, "points"];
  const base = "/api/organizations/" + organization.id + "/members/" + memberId;
  const member = useQuery({
    queryKey: [...scope, "member", memberId],
    queryFn: async ({ signal }) =>
      (
        await directoryRequest<{
          item: Person & { balance: string; canAward?: boolean };
        }>(base, {
          signal,
        })
      ).item,
  });
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [member.data?.id]);
  const history = useDirectoryPages<PointsEntry>(
    [...scope, "history", memberId],
    base + "/points",
    { enabled: !!member.data && !member.isError },
  );
  const [edit, setEdit] = useState<PointsEntry | "award" | null>(null),
    [result, setResult] = useState<PointsResult | null>(null);
  const stamp = (value: string) =>
    new Intl.DateTimeFormat(getLocale(), {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: organization.timezone,
    }).format(new Date(value));
  const blocked =
    history.isError &&
    (!history.isFetchNextPageError ||
      (history.error instanceof DirectoryError &&
        ["forbidden", "not_found", "sign_in"].includes(history.error.code)));
  return (
    <section className="directory points-member">
      <Button variant="link" asChild className="settings-back">
        <Link
          to="/workspace/$organizationId/$section"
          params={{ organizationId: organization.id, section: "members" }}
        >
          <ArrowLeft aria-hidden="true" />
          {m.directory_members()}
        </Link>
      </Button>
      {member.isPending ? (
        <ListSkeleton />
      ) : member.isError ? (
        <PointsError
          error={member.error}
          pending={member.isFetching}
          retry={() => {
            void member.refetch();
          }}
        />
      ) : (
        <>
          <div className="directory-heading">
            <div>
              <h1 ref={heading} tabIndex={-1} data-page-heading>
                {member.data.name}
              </h1>
              <p>
                {member.data.archived
                  ? m.activities_cancelled()
                  : m.points_help()}
              </p>
            </div>
            <div className="directory-actions member-header-actions">
              {!member.data.archived && member.data.canAward !== false && (
                <Button onClick={() => setEdit("award")}>
                  <Coins aria-hidden="true" />
                  {m.points_award()}
                </Button>
              )}
              {["owner", "admin"].includes(organization.role) && (
                <ItemActions
                  name={member.data.name}
                  actions={[
                    {
                      label: m.participant_access(),
                      icon: Link2,
                      onSelect: () =>
                        navigate({
                          to: "/workspace/$organizationId/members/$memberId/account",
                          params: { organizationId: organization.id, memberId },
                          search: { view: "invitations" },
                        }),
                    },
                  ]}
                />
              )}
            </div>
          </div>
          {organization.role === "volunteer" && (
            <p className="period-report-help">{m.access_work_help()}</p>
          )}
          <div className="points-balance">
            <span>
              {organization.role === "volunteer"
                ? m.access_visible_points()
                : m.points_balance()}
            </span>
            <strong>
              {new Intl.NumberFormat(getLocale()).format(
                BigInt(member.data.balance),
              )}
            </strong>
          </div>
          {organization.role !== "volunteer" && (
            <RewardWallet
              organizationId={organization.id}
              userId={userId}
              memberId={memberId}
            />
          )}
          {result && <PointsResults result={result} />}
          <h2 className="points-history-heading">{m.points_history()}</h2>
          {history.isPending ? (
            <ListSkeleton />
          ) : blocked ? (
            <PointsError
              error={history.error}
              pending={history.isFetching}
              retry={() => {
                void history.refetch();
              }}
            />
          ) : (
            <>
              <ul className="directory-list points-history">
                {history.data?.pages
                  .flatMap((p) => p.items)
                  .map((entry) => (
                    <li key={entry.id} id={"points-entry-" + entry.id}>
                      <div className="points-entry-heading">
                        <strong>
                          {entry.originalId
                            ? m.points_adjustment()
                            : entry.source === "attendance"
                              ? m.earning_source()
                              : m.points_award()}
                        </strong>
                        <span className="points-entry-amount">
                          {entry.amount > 0 ? "+" : ""}
                          {new Intl.NumberFormat(getLocale()).format(
                            entry.amount,
                          )}
                        </span>
                        {!entry.originalId &&
                          entry.source !== "attendance" &&
                          entry.canCorrect !== false &&
                          organization.role !== "volunteer" && (
                            <ItemActions
                              name={entry.reason}
                              actions={[
                                {
                                  label: m.points_correct(),
                                  icon: Pencil,
                                  onSelect: () => setEdit(entry),
                                },
                              ]}
                            />
                          )}
                      </div>
                      <p className="points-entry-reason">{entry.reason}</p>
                      {!entry.originalId && entry.version > 1 && (
                        <p>
                          {m.points_current({ amount: entry.currentAmount })}
                        </p>
                      )}
                      {entry.originalId && (
                        <p>
                          {m.points_linked_original()}
                          {entry.originalReason
                            ? " · " + entry.originalReason
                            : ""}
                        </p>
                      )}
                      {(entry.sessionName || entry.activityName) && (
                        <p>
                          {entry.activityName}
                          {entry.sessionName ? " · " + entry.sessionName : ""}
                        </p>
                      )}
                      {entry.source === "attendance" &&
                        entry.activityId &&
                        entry.sessionId && (
                          <Button variant="link" asChild>
                            <Link
                              to="/workspace/$organizationId/activities/$activityId/sessions/$sessionId/attendance"
                              params={{
                                organizationId: organization.id,
                                activityId: entry.activityId,
                                sessionId: entry.sessionId,
                              }}
                            >
                              <ClipboardCheck size={16} aria-hidden="true" />
                              {m.earning_manage()}
                            </Link>
                          </Button>
                        )}
                      <div className="points-entry-meta">
                        <span>
                          {m.points_contribution_date({
                            date: stamp(entry.occurredAt),
                          })}
                        </span>
                        <span>
                          {m.points_recorded({ date: stamp(entry.createdAt) })}
                        </span>
                        <span>
                          {m.points_by({
                            name: entry.actorName ?? m.points_actor(),
                          })}
                        </span>
                      </div>
                    </li>
                  ))}
              </ul>
              {history.data?.pages[0]?.items.length === 0 ? (
                <p className="directory-empty">{m.points_empty()}</p>
              ) : (
                <InfiniteFooter
                  {...history}
                  fetchNextPage={() =>
                    history.fetchNextPage({ cancelRefetch: false })
                  }
                />
              )}
            </>
          )}
          {edit && (
            <PointsEditor
              organization={organization}
              userId={userId}
              member={member.data}
              {...(edit === "award" ? {} : { correction: edit })}
              onClose={() => setEdit(null)}
              onSaved={async (saved) => {
                setEdit(null);
                setResult(saved);
                await client.invalidateQueries({ queryKey: scope });
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
