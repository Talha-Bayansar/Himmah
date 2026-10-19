import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Flag,
  Plus,
  Search,
  Pencil,
  Archive,
  Send,
  Check,
  X,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import {
  ItemActions,
  type ItemAction,
} from "../components/shared/item-actions";
import { RouteTabs } from "../components/shared/route-tabs";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import {
  useDirectoryPages,
  directoryRequest,
  DirectoryError,
} from "../community/client";
import { PointsError } from "../points/PointsShared";
import { useLocale } from "../localization/locale";
import { getLocale } from "../paraglide/runtime.js";
import { m } from "../paraglide/messages.js";
import type { Organization } from "../organization/contracts";
import type { Challenge, Submission } from "./contracts";
import {
  ChallengeEditor,
  ChallengeActionDialog,
  type ChallengeAction,
} from "./ChallengeDialogs";
export function EngagementTabs({
  organizationId,
  current,
}: {
  organizationId: string;
  current: "activities" | "challenges";
}) {
  return (
    <RouteTabs aria-label={m.challenge_engagement()}>
      {(["activities", "challenges"] as const).map((section) => (
        <Link
          key={section}
          to="/workspace/$organizationId/$section"
          params={{ organizationId, section }}
          aria-current={current === section ? "page" : undefined}
        >
          {section === "activities"
            ? m.activities_title()
            : m.challenges_title()}
        </Link>
      ))}
    </RouteTabs>
  );
}
const failed = (r: {
  isError: boolean;
  isFetchNextPageError?: boolean;
  error: unknown;
}) =>
  r.isError &&
  (!r.isFetchNextPageError ||
    (r.error instanceof DirectoryError &&
      ["forbidden", "not_found", "sign_in"].includes(r.error.code)));
export default function Challenges({
  organization,
  userId,
  challengeId = null,
  submissionId = null,
  view,
}: {
  organization: Organization;
  userId: string;
  challengeId?: string | null;
  submissionId?: string | null;
  view?: string | undefined;
}) {
  useLocale();
  const self = organization.role === "participant",
    base = `/api/organizations/${organization.id}/${self ? "me/" : ""}challenges`,
    scope = ["organization", userId, organization.id, "challenges", self],
    navigate = useNavigate(),
    heading = useRef<HTMLHeadingElement>(null);
  const [search, setSearch] = useState(""),
    [q, setQ] = useState(""),
    [status, setStatus] = useState("pending"),
    [editor, setEditor] = useState(false),
    [action, setAction] = useState<ChallengeAction | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const tab = self
    ? view === "history"
      ? "history"
      : "available"
    : view === "draft" || view === "archived"
      ? view
      : "published";
  const list = useDirectoryPages<Challenge>(
    [...scope, "list", tab, q],
    `${base}?view=${tab}&q=${encodeURIComponent(q)}`,
    { enabled: !challengeId },
  );
  const detail = useQuery({
    queryKey: [...scope, "detail", challengeId],
    queryFn: ({ signal }) =>
      directoryRequest<{ item: Challenge }>(base + "/" + challengeId, {
        signal,
      }),
    enabled: !!challengeId,
  });
  const records = useDirectoryPages<Submission>(
    [...scope, "submissions", challengeId, status, q],
    `${base}/${challengeId}/submissions?status=${status}&q=${encodeURIComponent(q)}`,
    { enabled: !!challengeId && !self && !submissionId && detail.isSuccess },
  );
  const record = useQuery({
    queryKey: [...scope, "submission", submissionId],
    queryFn: ({ signal }) =>
      directoryRequest<{ item: Submission }>(
        `${base}/${challengeId}/submissions/${submissionId}`,
        { signal },
      ),
    enabled: !!submissionId && !self && detail.isSuccess,
  });
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [challengeId, submissionId, tab, detail.isSuccess]);
  const row = detail.data?.item,
    submission = self
      ? row?.submission
      : record.isError
        ? undefined
        : record.data?.item;
  const stamp = (date: string) =>
    new Intl.DateTimeFormat(getLocale(), {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: organization.timezone,
    }).format(new Date(date));
  const badge = (s: string) =>
    ({
      draft: m.challenge_draft(),
      published: m.challenge_published(),
      archived: m.challenge_archived(),
      pending: m.challenge_pending(),
      approved: m.challenge_approved(),
      rejected: m.challenge_rejected(),
      withdrawn: m.challenge_withdrawn(),
    })[s];
  const field = (c: Challenge) => (
    <>
      <p className="challenge-description">{c.description}</p>
      <p>
        {m.rewards_points({
          amount: new Intl.NumberFormat(getLocale()).format(c.points),
        })}{" "}
        · <span className="badge">{badge(c.status)}</span>
      </p>
      {c.startsAt && (
        <p>
          {m.challenge_starts()} {stamp(c.startsAt)}
        </p>
      )}
      {c.endsAt && (
        <p>
          {m.challenge_ends()} {stamp(c.endsAt)}
        </p>
      )}
    </>
  );
  const menu = (c: Challenge): ItemAction[] => [
    ...(c.status === "draft"
      ? [
          {
            label: m.challenge_edit(),
            icon: Pencil,
            onSelect: () => setEditor(true),
          },
          {
            label: m.challenge_publish(),
            icon: Send,
            onSelect: () => setAction("publish"),
          },
        ]
      : []),
    ...(c.status !== "archived"
      ? [
          {
            label: m.challenge_archive(),
            icon: Archive,
            destructive: true,
            onSelect: () => setAction("archive"),
          },
        ]
      : []),
  ];
  const back = (
    <Button variant="link" className="settings-back" asChild>
      <Link
        to={
          submissionId
            ? "/workspace/$organizationId/challenges/$challengeId"
            : "/workspace/$organizationId/$section"
        }
        params={
          submissionId
            ? { organizationId: organization.id, challengeId: challengeId! }
            : { organizationId: organization.id, section: "challenges" }
        }
      >
        <ArrowLeft aria-hidden="true" />
        {submissionId ? row?.name : m.challenges_title()}
      </Link>
    </Button>
  );
  if (challengeId && (detail.isPending || detail.isError))
    return (
      <section className="directory">
        {back}
        {detail.isPending ? (
          <ListSkeleton />
        ) : (
          <PointsError
            error={detail.error}
            retry={() => void detail.refetch()}
            pending={detail.isFetching}
          />
        )}
      </section>
    );
  return (
    <section className="directory challenges-page">
      {!challengeId && !self && (
        <EngagementTabs organizationId={organization.id} current="challenges" />
      )}
      {challengeId && back}
      <div className="directory-heading">
        <div>
          <h1 ref={heading} tabIndex={-1} data-page-heading>
            {submissionId
              ? (submission?.personName ?? m.challenge_review())
              : (row?.name ?? m.challenges_title())}
          </h1>
          {!challengeId && (
            <p>
              {self ? m.challenge_personal_help() : m.challenge_manage_help()}
            </p>
          )}
        </div>
        {!self &&
          (!challengeId ? (
            <Button onClick={() => setEditor(true)}>
              <Plus aria-hidden="true" />
              {m.challenge_create()}
            </Button>
          ) : !submissionId && row ? (
            <ItemActions name={row.name} actions={menu(row)} />
          ) : null)}
      </div>
      {!challengeId ? (
        <>
          <RouteTabs aria-label={m.challenges_title()}>
            {(self
              ? ["available", "history"]
              : ["published", "draft", "archived"]
            ).map((value) => (
              <Link
                key={value}
                to="/workspace/$organizationId/challenges"
                params={{ organizationId: organization.id }}
                search={{
                  view: value as
                    | "available"
                    | "history"
                    | "published"
                    | "draft"
                    | "archived",
                }}
                aria-current={tab === value ? "page" : undefined}
              >
                {
                  {
                    available: m.challenge_available(),
                    history: m.challenge_history(),
                    published: m.challenge_published(),
                    draft: m.challenge_draft(),
                    archived: m.challenge_archived(),
                  }[value]
                }
              </Link>
            ))}
          </RouteTabs>
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
          </div>
          {list.isPending ? (
            <ListSkeleton />
          ) : failed(list) ? (
            <PointsError
              error={list.error}
              retry={() => void list.refetch()}
              pending={list.isFetching}
            />
          ) : (
            <>
              <ul className="directory-list challenge-list">
                {list.data?.pages
                  .flatMap((p) => p.items)
                  .map((c) => (
                    <li key={c.id}>
                      <div>
                        <strong>{c.name}</strong>
                        <p>
                          {m.rewards_points({ amount: String(c.points) })}
                          {self && c.submission
                            ? " · " + badge(c.submission.status)
                            : ""}
                        </p>
                        {c.endsAt && <small>{stamp(c.endsAt)}</small>}
                      </div>
                      <Button variant="outline" asChild>
                        <Link
                          to="/workspace/$organizationId/challenges/$challengeId"
                          params={{
                            organizationId: organization.id,
                            challengeId: c.id,
                          }}
                        >
                          <Flag aria-hidden="true" />
                          {m.challenge_view()}
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      </Button>
                    </li>
                  ))}
              </ul>
              {!list.data?.pages[0]?.items.length ? (
                <p className="directory-empty">{m.challenge_empty()}</p>
              ) : (
                <InfiniteFooter
                  {...list}
                  fetchNextPage={() =>
                    list.fetchNextPage({ cancelRefetch: false })
                  }
                />
              )}
            </>
          )}
        </>
      ) : (
        row && (
          <>
            {!submissionId && (
              <section className="settings-panel">
                {field(row)}
                {!self && (
                  <p>
                    {row.groups.length
                      ? row.groups.map((g) => g.name).join(", ")
                      : m.activities_everyone()}
                  </p>
                )}
                {self && !row.open && <p>{m.challenge_not_open()}</p>}
                {self && !row.eligible && <p>{m.challenge_not_eligible()}</p>}
                {self &&
                  row.open &&
                  row.eligible &&
                  (!submission ||
                    ["rejected", "withdrawn"].includes(submission.status)) && (
                    <Button onClick={() => setAction("submit")}>
                      <Send aria-hidden="true" />
                      {m.challenge_submit()}
                    </Button>
                  )}
                {!self && row.open && (
                  <Button onClick={() => setAction("record")}>
                    <Check aria-hidden="true" />
                    {m.challenge_record()}
                  </Button>
                )}
              </section>
            )}
            {self || submissionId ? (
              <>
                {record.isPending && submissionId ? (
                  <ListSkeleton />
                ) : record.isError && submissionId ? (
                  <PointsError
                    error={record.error}
                    retry={() => void record.refetch()}
                  />
                ) : (
                  submission && (
                    <section className="settings-panel">
                      <h2>
                        {self
                          ? m.challenge_your_submission()
                          : submission.challengeName}
                      </h2>
                      <span className="badge">{badge(submission.status)}</span>
                      <p>
                        {stamp(submission.submittedAt)} ·{" "}
                        {m.rewards_points({
                          amount: String(
                            submission.currentPoints ?? submission.points,
                          ),
                        })}
                      </p>
                      {submission.status === "approved" &&
                        submission.currentPoints !== undefined &&
                        submission.currentPoints !== submission.points && (
                          <p>
                            {m.challenge_points_corrected({
                              points: submission.points,
                            })}
                          </p>
                        )}
                      {submission.note && (
                        <p className="challenge-description">
                          {submission.note}
                        </p>
                      )}
                      {submission.feedback && (
                        <p className="challenge-description">
                          {submission.feedback}
                        </p>
                      )}
                      {submission.reviewedAt && (
                        <p>{stamp(submission.reviewedAt)}</p>
                      )}
                      {self && submission.status === "pending" && (
                        <Button
                          variant="outline"
                          onClick={() => setAction("withdraw")}
                        >
                          <X aria-hidden="true" />
                          {m.challenge_withdraw()}
                        </Button>
                      )}
                      {!self && submission.canReview && (
                        <div className="directory-actions">
                          <Button onClick={() => setAction("approve")}>
                            <Check aria-hidden="true" />
                            {m.challenge_approve()}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setAction("reject")}
                          >
                            <X aria-hidden="true" />
                            {m.challenge_reject()}
                          </Button>
                        </div>
                      )}
                      {!self &&
                        submission.status === "pending" &&
                        !submission.canReview && (
                          <p>{m.challenge_other_reviewer()}</p>
                        )}
                      {!self &&
                        submission.status === "approved" &&
                        submission.personId && (
                          <Button variant="outline" asChild>
                            <Link
                              to="/workspace/$organizationId/members/$memberId"
                              params={{
                                organizationId: organization.id,
                                memberId: submission.personId,
                              }}
                            >
                              <ArrowRight aria-hidden="true" />
                              {m.challenge_points_history()}
                            </Link>
                          </Button>
                        )}
                    </section>
                  )
                )}
              </>
            ) : (
              <>
                <h2>{m.challenge_submissions()}</h2>
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
                  <label>
                    <span className="sr-only">
                      {m.challenge_status_filter()}
                    </span>
                    <NativeSelect
                      aria-label={m.challenge_status_filter()}
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <NativeSelectOption value="pending">
                        {m.challenge_pending()}
                      </NativeSelectOption>
                      <NativeSelectOption value="all">
                        {m.rewards_all()}
                      </NativeSelectOption>
                    </NativeSelect>
                  </label>
                </div>
                {records.isPending ? (
                  <ListSkeleton />
                ) : failed(records) ? (
                  <PointsError
                    error={records.error}
                    retry={() => void records.refetch()}
                    pending={records.isFetching}
                  />
                ) : (
                  <>
                    <ul className="directory-list">
                      {records.data?.pages
                        .flatMap((p) => p.items)
                        .map((s) => (
                          <li key={s.id}>
                            <div>
                              <strong>{s.personName}</strong>
                              <p>
                                {badge(s.status)} · {stamp(s.submittedAt)}
                              </p>
                            </div>
                            <Button variant="outline" asChild>
                              <Link
                                to="/workspace/$organizationId/challenges/$challengeId/submissions/$submissionId"
                                params={{
                                  organizationId: organization.id,
                                  challengeId: row.id,
                                  submissionId: s.id,
                                }}
                              >
                                <ArrowRight aria-hidden="true" />
                                {m.challenge_review()}
                              </Link>
                            </Button>
                          </li>
                        ))}
                    </ul>
                    {!records.data?.pages[0]?.items.length ? (
                      <p className="directory-empty">
                        {m.challenge_empty_submissions()}
                      </p>
                    ) : (
                      <InfiniteFooter
                        {...records}
                        fetchNextPage={() =>
                          records.fetchNextPage({ cancelRefetch: false })
                        }
                      />
                    )}
                  </>
                )}
              </>
            )}
          </>
        )
      )}
      {editor && (
        <ChallengeEditor
          organization={organization}
          userId={userId}
          challenge={row}
          onClose={() => setEditor(false)}
          onSaved={(id) => {
            setEditor(false);
            if (!challengeId)
              void navigate({
                to: "/workspace/$organizationId/challenges/$challengeId",
                params: { organizationId: organization.id, challengeId: id },
              });
          }}
        />
      )}
      {action && row && (
        <ChallengeActionDialog
          action={action}
          organization={organization}
          userId={userId}
          challenge={row}
          submission={submission}
          onClose={() => setAction(null)}
          onSaved={(id) => {
            setAction(null);
            if (action === "record")
              void navigate({
                to: "/workspace/$organizationId/challenges/$challengeId/submissions/$submissionId",
                params: {
                  organizationId: organization.id,
                  challengeId: row.id,
                  submissionId: id,
                },
              });
          }}
        />
      )}
    </section>
  );
}
