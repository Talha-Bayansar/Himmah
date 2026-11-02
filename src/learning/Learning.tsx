import { MetricSummary } from "../components/shared/metric-summary";
import LearningInsights from "./LearningInsights";
import LiveHost from "../live/LiveHost";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Plus,
  Pencil,
  Send,
  LockOpen,
  LockKeyhole,
  Link2,
  UserPlus,
  Trash2,
  RotateCcw,
} from "lucide-react";
import {
  DirectoryHeader,
  DirectoryToolbar,
  DirectoryList,
  DirectoryItem,
  DirectoryRecord,
} from "../components/shared/directory-layout";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { ItemActions } from "../components/shared/item-actions";
import { FormSurface } from "../components/shared/form-surface";
import { useConfirmation } from "../components/shared/confirmation";
import { ActionButton } from "../components/shared/action-button";
import { Button } from "../components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { Label } from "../components/ui/label";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import { ErrorNotice } from "../activities/Activities";
import type { Organization } from "../organization/contracts";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import {
  secretToken,
  type LearningDetail,
  type LearningItem,
  type Recipient,
  type Question,
} from "./contracts";
import {
  CommandError,
  CopyLink,
  LearningScope,
  useLearning,
  useLearningCommand,
  useLearningPages,
} from "./shared";
import LearningEditor from "./LearningEditor";
import LearningAssign from "./LearningAssign";
export default function Learning({
  organization,
  userId,
  id,
  mode = "view",
}: {
  organization: Organization;
  userId: string;
  id?: string | undefined;
  mode?: "view" | "edit" | "assign" | "live" | undefined;
}) {
  return (
    <LearningScope org={organization} user={userId}>
      <LearningBody id={id} mode={mode} />
    </LearningScope>
  );
}
function LearningBody({
  id,
  mode,
}: {
  id?: string | undefined;
  mode: "view" | "edit" | "assign" | "live";
}) {
  const { base, prefix, api } = useLearning();
  const raw = useRouterState({
    select: (s) =>
      s.location.search as {
        q?: string;
        activity?: string;
        session?: string;
        publication?: string;
        tab?: string;
      },
  });
  const detail = useQuery({
    queryKey: [...prefix, "detail", id, raw.publication ?? ""],
    queryFn: ({ signal }) =>
      api<LearningDetail>(
        `${base}/${id}?publication=${raw.publication ?? ""}`,
        { signal },
      ),
    enabled: !!id && id !== "new",
    retry: false,
  });
  if (!id) return <LearningList />;
  if (id === "new")
    return (
      <LearningEditor
        activity={raw.activity ?? ""}
        session={raw.session ?? ""}
      />
    );
  if (detail.isPending) return <ListSkeleton />;
  if (detail.isError)
    return (
      <ErrorNotice error={detail.error} retry={() => void detail.refetch()} />
    );
  if (mode === "live") return <LiveHost detail={detail.data} />;
  if (mode === "edit")
    return <LearningEditor key={id} item={detail.data.item} />;
  if (mode === "assign")
    return detail.data.publication?.content.mode === "assigned" &&
      detail.data.item.currentPublication === detail.data.publication.id &&
      detail.data.item.state === "published" ? (
      <LearningAssign detail={detail.data} />
    ) : (
      <p role="alert">{m.learn_not_available()}</p>
    );
  return <LearningDetailView detail={detail.data} />;
}
function LearningList() {
  const { org, base } = useLearning(),
    navigate = useNavigate();
  const raw = useRouterState({
      select: (s) =>
        s.location.search as {
          q?: string;
          activity?: string;
          session?: string;
        },
    }),
    q = raw.q ?? "",
    activity = raw.activity ?? "",
    session = raw.session ?? "";
  const query = useLearningPages<LearningItem>(
    `${base}?q=${encodeURIComponent(q)}&activity=${activity}&session=${session}`,
  );
  return (
    <section className="directory">
      <Button asChild variant="link" className="settings-back">
        <Link
          to="/workspace/$organizationId/$section"
          params={{ organizationId: org.id, section: "dashboard" }}
        >
          <ArrowLeft />
          {m.dashboard_title()}
        </Link>
      </Button>
      <DirectoryHeader
        title={m.learn_title()}
        description={m.learn_intro()}
        autoFocus={false}
        action={
          <Button
            asChild
            className="people-section-add"
            aria-label={m.learn_create()}
          >
            <Link
              to="/workspace/$organizationId/learning/$learningId"
              params={{ organizationId: org.id, learningId: "new" }}
              search={{
                activity,
                session,
                publication: "",
                tab: "participants",
                q: "",
              }}
            >
              <Plus />
              <span>{m.learn_create()}</span>
            </Link>
          </Button>
        }
      />
      {(activity || session) && (
        <p className="activity-note">
          {session ? m.learn_session_filter() : m.learn_activity_filter()}{" "}
          <Button asChild variant="link" size="sm">
            <Link
              to="/workspace/$organizationId/learning"
              params={{ organizationId: org.id }}
              search={{ q, activity: "", session: "" }}
            >
              {m.insights_all()}
            </Link>
          </Button>
        </p>
      )}
      <DirectoryToolbar
        id="learning-search"
        label={m.directory_search()}
        value={q}
        onChange={(q) =>
          void navigate({
            to: "/workspace/$organizationId/learning",
            params: { organizationId: org.id },
            search: { q, activity, session },
            replace: true,
          })
        }
      />
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <DirectoryList label={m.learn_title()}>
            {query.items.map((item) => (
              <DirectoryItem linked key={item.id}>
                <Link
                  className="directory-item-link"
                  to="/workspace/$organizationId/learning/$learningId"
                  params={{ organizationId: org.id, learningId: item.id }}
                  search={{
                    publication: "",
                    tab: "participants",
                    q: "",
                    activity: "",
                    session: "",
                  }}
                >
                  <DirectoryRecord
                    name={item.title}
                    icon={<BookOpen size={20} />}
                    detail={
                      <>
                        {stateLabel(item.state)}
                        {item.activityName && ` · ${item.activityName}`}
                        {item.sessionTopic && ` · ${item.sessionTopic}`}
                      </>
                    }
                  />
                  <ArrowRight aria-hidden="true" />
                </Link>
              </DirectoryItem>
            ))}
          </DirectoryList>
          {!query.items.length && (
            <p className="directory-empty">
              {q ? m.directory_no_matches() : m.learn_empty()}
            </p>
          )}
          <InfiniteFooter {...query} />
        </>
      )}
    </section>
  );
}
const stateLabel = (s: string) =>
  s === "published"
    ? m.learn_published()
    : s === "closed"
      ? m.learn_closed()
      : m.learn_draft();
function LearningDetailView({ detail }: { detail: LearningDetail }) {
  const { org } = useLearning(),
    navigate = useNavigate(),
    confirm = useConfirmation(),
    locale = useLocale()?.locale ?? "en";
  const raw = useRouterState({
      select: (s) =>
        s.location.search as { publication?: string; tab?: string; q?: string },
    }),
    tab =
      raw.tab === "questions"
        ? "questions"
        : raw.tab === "results"
          ? "results"
          : "participants";
  const { item, publication: pub } = detail,
    command = useLearningCommand(item.id);
  const [share, setShare] = useState<string | null>(null),
    [qr, setQr] = useState("");
  useEffect(() => {
    let active = true;
    setQr("");
    if (share)
      void import("qrcode")
        .then((q) =>
          q.toDataURL(share, {
            width: 240,
            margin: 2,
            errorCorrectionLevel: "M",
          }),
        )
        .then(
          (v) => {
            if (active) setQr(v);
          },
          () => {},
        );
    return () => {
      active = false;
    };
  }, [share]);
  const current = pub?.id === item.currentPublication;
  const hasDraftChanges =
    item.hasDraftChanges ??
    (!!pub && JSON.stringify(item.draft) !== JSON.stringify(pub.content));
  const apply = (next: Record<string, string>) =>
    void navigate({
      to: "/workspace/$organizationId/learning/$learningId",
      params: { organizationId: org.id, learningId: item.id },
      search: {
        publication: raw.publication ?? "",
        tab,
        q: raw.q ?? "",
        activity: "",
        session: "",
        ...next,
      },
      replace: true,
    });
  const run = async (action: string, extra: Record<string, unknown> = {}) => {
    try {
      await command.run({
        action,
        version: item.version,
        publication: pub?.id,
        ...extra,
      });
    } catch {}
  };
  const publish = async () => {
    if (
      await confirm({
        title: m.learn_publish(),
        description: m.learn_publish_warning(),
        confirmLabel: m.learn_publish(),
      })
    )
      await run("publish");
  };
  const generate = async () => {
    if (
      pub?.hasLink &&
      !(await confirm({
        title: m.learn_generate_link(),
        description: m.learn_rotate_warning(),
        confirmLabel: m.learn_generate_link(),
      }))
    )
      return;
    const token = secretToken();
    setShare(`${location.origin}/learn/${item.id}#${token}`);
    await run("open-link", { token });
  };
  const date = (s: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: org.timezone,
    }).format(new Date(s));
  return (
    <section className="directory learning-detail">
      <Button asChild variant="link" className="settings-back">
        <Link
          to="/workspace/$organizationId/learning"
          params={{ organizationId: org.id }}
          search={{ q: "", activity: "", session: "" }}
        >
          <ArrowLeft />
          {m.learn_title()}
        </Link>
      </Button>
      <div className="section-action-group">
        <DirectoryHeader
          title={item.title}
          description={!pub ? stateLabel(item.state) : ""}
          autoFocus={false}
          action={
            <ItemActions
              name={item.title}
              pending={command.isPending}
              disabled={command.uncertain}
              actions={[
                {
                  label: m.live_host(),
                  icon: BookOpen,
                  onSelect: () =>
                    void navigate({
                      to: "/workspace/$organizationId/learning/$learningId/live",
                      params: { organizationId: org.id, learningId: item.id },
                      search: {
                        q: "",
                        tab: "participants",
                        publication: "",
                        activity: "",
                        session: "",
                      },
                    }),
                },

                ...(!pub || tab !== "questions"
                  ? [
                      {
                        label: m.learn_edit(),
                        icon: Pencil,
                        onSelect: () =>
                          void navigate({
                            to: "/workspace/$organizationId/learning/$learningId/edit",
                            params: {
                              organizationId: org.id,
                              learningId: item.id,
                            },
                            search: {
                              q: "",
                              tab: "participants",
                              publication: "",
                              activity: "",
                              session: "",
                            },
                          }),
                      },
                    ]
                  : []),
                ...(pub && !current && hasDraftChanges
                  ? [
                      {
                        label: m.learn_publish_revision(),
                        icon: Send,
                        onSelect: publish,
                      },
                    ]
                  : []),
                ...(item.currentPublication && current
                  ? [
                      {
                        label:
                          item.state === "closed"
                            ? m.learn_reopen()
                            : m.learn_close(),
                        icon: LockKeyhole,
                        onSelect: async () => {
                          if (
                            await confirm({
                              title:
                                item.state === "closed"
                                  ? m.learn_reopen()
                                  : m.learn_close(),
                              description: m.learn_close_warning(),
                              confirmLabel:
                                item.state === "closed"
                                  ? m.learn_reopen()
                                  : m.learn_close(),
                            })
                          )
                            await run(
                              item.state === "closed" ? "reopen" : "close",
                            );
                        },
                      },
                    ]
                  : []),
                ...(pub && !pub.released
                  ? [
                      {
                        label: m.learn_release(),
                        icon: LockOpen,
                        onSelect: async () => {
                          if (
                            await confirm({
                              title: m.learn_release(),
                              description: m.learn_release_warning(),
                              confirmLabel: m.learn_release(),
                            })
                          )
                            await run("release");
                        },
                      },
                    ]
                  : []),
              ]}
            />
          }
        />
      </div>
      {!pub ? (
        <ActionButton
          pending={command.isPending}
          disabled={command.uncertain}
          onClick={() => void publish()}
        >
          <Send />
          {m.learn_publish()}
        </ActionButton>
      ) : (
        <>
          <div className="learning-context">
            <span className="activity-note">{stateLabel(item.state)}</span>
            <div className="learning-publication-select">
              {detail.versions.length > 1 ? (
                <>
                  <Label htmlFor="learning-publication" className="sr-only">
                    {m.learn_version()}
                  </Label>
                  <NativeSelect
                    id="learning-publication"
                    value={pub.id}
                    onChange={(e) =>
                      apply({ publication: e.target.value, q: "" })
                    }
                  >
                    {detail.versions.map((v) => (
                      <NativeSelectOption key={v.id} value={v.id}>
                        {m.learn_version_number({ number: String(v.number) })}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </>
              ) : (
                <span className="activity-note" aria-label={m.learn_version()}>
                  {m.learn_version_number({ number: String(pub.number) })}
                </span>
              )}
            </div>
            <span className="learning-release-state activity-note">
              {pub.released ? m.learn_released() : m.learn_staff_results_held()}
            </span>
          </div>
          {current && hasDraftChanges && (
            <>
              <p className="directory-notice">
                {m.learn_unpublished_changes()}
              </p>
              <p className="activity-note">
                {m.learn_published_title({ title: pub.content.title })}
              </p>
              <ActionButton
                pending={command.isPending}
                disabled={command.uncertain}
                onClick={() => void publish()}
              >
                {m.learn_publish_revision()}
              </ActionButton>
            </>
          )}
          <Tabs value={tab} onValueChange={(tab) => apply({ tab, q: "" })}>
            <TabsList className="learning-tabs" aria-label={m.learn_title()}>
              {(["questions", "participants", "results"] as const).map((v) => (
                <TabsTrigger key={v} value={v}>
                  {v === "questions"
                    ? m.learn_questions()
                    : v === "participants"
                      ? m.learn_participants()
                      : m.learn_results()}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="questions">
              {!command.uncertain && !command.isPending && (
                <Button
                  variant="outline"
                  asChild
                  className="contextual-secondary-action"
                >
                  <Link
                    to="/workspace/$organizationId/learning/$learningId/edit"
                    params={{ organizationId: org.id, learningId: item.id }}
                    search={{
                      q: "",
                      tab: "questions",
                      publication: pub.id,
                      activity: "",
                      session: "",
                    }}
                  >
                    <Pencil aria-hidden="true" />
                    {m.learn_edit()}
                  </Link>
                </Button>
              )}

              <ol className="learning-question-preview">
                {pub.content.questions.map((q, i) => (
                  <li key={i}>
                    <strong>{q.text}</strong>
                    <ul>
                      {q.choices.map((c, n) => (
                        <li key={n}>
                          {c}
                          {n === q.correct && (
                            <span> · {m.learn_correct()}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {q.explanation && <p>{q.explanation}</p>}
                  </li>
                ))}
              </ol>
            </TabsContent>
            <TabsContent value="participants">
              {tab === "participants" && (
                <>
                  {current &&
                    !hasDraftChanges &&
                    item.state === "published" &&
                    (pub.content.mode === "assigned" ? (
                      <Button asChild>
                        <Link
                          to="/workspace/$organizationId/learning/$learningId/assign"
                          params={{
                            organizationId: org.id,
                            learningId: item.id,
                          }}
                          search={{
                            q: "",
                            tab: "participants",
                            publication: "",
                            activity: "",
                            session: "",
                          }}
                        >
                          <UserPlus />
                          {m.learn_assign()}
                        </Link>
                      </Button>
                    ) : (
                      <ActionButton
                        pending={command.isPending}
                        disabled={command.uncertain}
                        onClick={() => void generate()}
                      >
                        <Link2 />
                        {pub.hasLink
                          ? m.learn_generate_link()
                          : m.learn_share()}
                      </ActionButton>
                    ))}
                  <MetricSummary
                    compact
                    className="learning-counts"
                    items={[
                      {
                        label: m.learn_participants(),
                        value: detail.counts.assigned.toLocaleString(locale),
                      },
                      {
                        label: m.learn_started(),
                        value: detail.counts.started.toLocaleString(locale),
                      },
                      {
                        label: m.learn_submitted(),
                        value: detail.counts.submitted.toLocaleString(locale),
                      },
                    ]}
                  />

                  <Participants detail={detail} command={command} />
                </>
              )}
            </TabsContent>
            <TabsContent value="results">
              {tab === "results" && (
                <div className="learning-results">
                  <LearningInsights
                    key={pub.id}
                    item={item.id}
                    publication={pub.id}
                  />
                  <section
                    className="learning-individual-results"
                    aria-labelledby="learning-individual-heading"
                  >
                    <h2 id="learning-individual-heading">
                      {m.learn_insights_individual()}
                    </h2>
                    <Participants detail={detail} command={command} results />
                  </section>
                </div>
              )}
            </TabsContent>
          </Tabs>
          <details className="session-help">
            <summary>{m.learn_settings()}</summary>
            {item.description && <p>{item.description}</p>}
            {(item.activityName || item.sessionTopic) && (
              <p className="activity-note">
                {[item.activityName, item.sessionTopic]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}

            <p>
              {pub.content.mode === "assigned"
                ? m.learn_assignment_warning()
                : m.learn_guest_warning()}
            </p>
            <p>{m.learn_one_attempt()}</p>
            <p>
              {pub.content.opensAt
                ? `${m.learn_opens()}: ${date(pub.content.opensAt)}`
                : m.learn_no_opening()}
            </p>
            <p>
              {pub.content.closesAt
                ? `${m.learn_closes()}: ${date(pub.content.closesAt)}`
                : m.learn_no_deadline()}
            </p>
            <p>{org.timezone}</p>
            <p>{m.learn_independent()}</p>
          </details>
        </>
      )}
      {!pub && (item.description || item.activityName || item.sessionTopic) && (
        <details className="session-help">
          <summary>{m.learn_wizard_details()}</summary>
          {item.description && <p>{item.description}</p>}
          {(item.activityName || item.sessionTopic) && (
            <p className="activity-note">
              {[item.activityName, item.sessionTopic]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </details>
      )}
      <CommandError command={command} />
      {share &&
        command.isSuccess &&
        command.variables?.action === "open-link" && (
          <FormSurface
            title={m.learn_share()}
            description={m.learn_guest_warning()}
            onClose={() => setShare(null)}
          >
            <CopyLink value={share} />
            {qr && <img className="learning-qr" src={qr} alt={m.learn_qr()} />}
            <Button variant="outline" onClick={() => setShare(null)}>
              {m.close()}
            </Button>
          </FormSurface>
        )}
    </section>
  );
}
function Participants({
  detail,
  command,
  results = false,
}: {
  detail: LearningDetail;
  command: ReturnType<typeof useLearningCommand>;
  results?: boolean;
}) {
  const { org, base } = useLearning(),
    navigate = useNavigate(),
    confirm = useConfirmation();
  const raw = useRouterState({
      select: (s) =>
        s.location.search as {
          publication?: string;
          tab?: string;
          q?: string;
          recipient?: string;
          activity?: string;
          session?: string;
        },
    }),
    q = raw.q ?? "",
    pub = detail.publication!;
  const query = useLearningPages<Recipient>(
    `${base}/${detail.item.id}/${results ? "results" : "participants"}?publication=${pub.id}&q=${encodeURIComponent(q)}`,
  );
  const [recipient, setRecipient] = useState<string | null>(
    raw.recipient ?? null,
  );
  useEffect(() => {
    setRecipient(raw.recipient ?? null);
  }, [raw.recipient]);
  const closeResult = () => {
    setRecipient(null);
    if (raw.recipient)
      void navigate({
        to: "/workspace/$organizationId/learning/$learningId",
        params: { organizationId: org.id, learningId: detail.item.id },
        search: {
          q,
          publication: pub.id,
          tab: results ? "results" : "participants",
          activity: raw.activity ?? "",
          session: raw.session ?? "",
        },
        replace: true,
        resetScroll: false,
      });
  };
  const action = async (r: Recipient, kind: "allow" | "revoke") => {
    if (
      !(await confirm({
        title: kind === "allow" ? m.learn_allow_retry() : m.learn_revoke(),
        description:
          kind === "allow" ? m.learn_allow_warning() : m.learn_revoke_warning(),
        destructive: kind === "revoke",
        confirmLabel:
          kind === "allow" ? m.learn_allow_retry() : m.learn_revoke(),
      }))
    )
      return;
    try {
      await command.run({
        action: kind,
        version: detail.item.version,
        publication: pub.id,
        recipient: r.id,
        recipientRevision: r.revision,
      });
    } catch {}
  };
  return (
    <>
      <DirectoryToolbar
        id="learning-participant-search"
        label={m.directory_search()}
        value={q}
        onChange={(q) =>
          void navigate({
            to: "/workspace/$organizationId/learning/$learningId",
            params: { organizationId: org.id, learningId: detail.item.id },
            search: {
              publication: raw.publication ?? "",
              tab: results ? "results" : "participants",
              q,
              activity: "",
              session: "",
            },
            replace: true,
          })
        }
      />
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <DirectoryList
            label={results ? m.learn_results() : m.learn_participants()}
          >
            {query.items.map((r) => (
              <DirectoryItem key={r.id}>
                <div className="learning-participant-row">
                  <Button
                    variant="ghost"
                    className="learning-participant-open"
                    onClick={() => setRecipient(r.id)}
                  >
                    <DirectoryRecord
                      name={r.name}
                      detail={
                        <>
                          <span>
                            {r.contactId
                              ? m.learn_assignment_identity()
                              : m.learn_guest_identity()}
                          </span>
                          <span>
                            {r.revoked
                              ? m.learn_revoked()
                              : r.status === "submitted"
                                ? m.learn_submitted()
                                : r.status === "started"
                                  ? m.learn_started()
                                  : m.learn_invited()}
                            {r.score != null
                              ? ` · ${r.score}/${pub.content.questions.length}`
                              : ""}
                          </span>
                        </>
                      }
                    />
                  </Button>
                  <ItemActions
                    name={r.name}
                    pending={command.isPending}
                    disabled={command.uncertain}
                    actions={[
                      {
                        label: m.learn_results(),
                        icon: BookOpen,
                        onSelect: () => setRecipient(r.id),
                      },
                      ...(r.attempts >= r.allowance &&
                      r.allowance < 5 &&
                      !r.revoked &&
                      r.status !== "started" &&
                      pub.id === detail.item.currentPublication
                        ? [
                            {
                              label: m.learn_allow_retry(),
                              icon: RotateCcw,
                              onSelect: () => action(r, "allow"),
                            },
                          ]
                        : []),
                      ...(!r.revoked
                        ? [
                            {
                              label: m.learn_revoke(),
                              icon: Trash2,
                              destructive: true,
                              onSelect: () => action(r, "revoke"),
                            },
                          ]
                        : []),
                    ]}
                  />
                </div>
              </DirectoryItem>
            ))}
          </DirectoryList>
          {!query.items.length && (
            <p className="directory-empty">{m.learn_no_participants()}</p>
          )}
          <InfiniteFooter {...query} />
        </>
      )}
      {recipient && (
        <ParticipantResult
          item={detail.item.id}
          recipient={recipient}
          onClose={closeResult}
        />
      )}
    </>
  );
}
function ParticipantResult({
  item,
  recipient,
  onClose,
}: {
  item: string;
  recipient: string;
  onClose: () => void;
}) {
  const { base, prefix, api } = useLearning();
  const query = useQuery({
    queryKey: [...prefix, "result", item, recipient],
    queryFn: ({ signal }) =>
      api<{
        name: string;
        questions: Question[];
        attempts: {
          id: string;
          sequence: number;
          answers: Record<string, number>;
          score: number | null;
          submittedAt: string | null;
        }[];
      }>(`${base}/${item}/results/${recipient}`, { signal }),
    retry: false,
  });
  return (
    <FormSurface
      title={query.data?.name ?? m.learn_results()}
      description={m.learn_attempt_history()}
      onClose={onClose}
    >
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          {!query.data.attempts.length && <p>{m.learn_invited()}</p>}
          {query.data.attempts.map((a) => (
            <details key={a.id} className="session-help">
              <summary>
                {m.learn_attempt_number({ number: String(a.sequence) })} ·{" "}
                {a.submittedAt
                  ? `${a.score}/${query.data.questions.length}`
                  : m.learn_started()}
              </summary>
              <ol className="learning-question-preview">
                {query.data.questions.map((q, i) => (
                  <li key={i}>
                    <strong>{q.text}</strong>
                    <p>
                      {a.answers[i] === undefined
                        ? m.learn_unanswered()
                        : q.choices[a.answers[i]!]}
                    </p>
                    <p>
                      {m.learn_correct()}: {q.choices[q.correct]}
                    </p>
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </>
      )}
      <Button variant="outline" onClick={onClose}>
        {m.close()}
      </Button>
    </FormSurface>
  );
}
