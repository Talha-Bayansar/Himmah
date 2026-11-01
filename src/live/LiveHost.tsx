import { useEffect, useState } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronRight,
  Play,
  Lock,
  Lightbulb,
  ArrowRight,
  Flag,
  UserMinus,
  RefreshCw,
  Radio,
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
import { Button } from "../components/ui/button";
import { ActionButton } from "../components/shared/action-button";
import { ItemActions } from "../components/shared/item-actions";
import { useConfirmation } from "../components/shared/confirmation";
import { ErrorNotice } from "../activities/Activities";
import { useLearning, useLearningPages, CopyLink } from "../learning/shared";
import type { LearningDetail } from "../learning/contracts";
import type { Page } from "../community/contracts";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import {
  phaseLabel,
  playerName,
  useLiveCommand,
  LiveCommandNotice,
} from "./shared";
import type { LiveState, LiveRoom, LivePlayer } from "./contracts";
export default function LiveHost({ detail }: { detail: LearningDetail }) {
  const room = useRouterState({
    select: (s) => (s.location.search as { room?: string }).room,
  });
  return room ? (
    <HostRoom key={room} detail={detail} room={room} />
  ) : (
    <RoomDirectory detail={detail} />
  );
}
function RoomDirectory({ detail }: { detail: LearningDetail }) {
  const locale = useLocale()?.locale ?? "en";
  const { org, base, api } = useLearning(),
    navigate = useNavigate(),
    path = `${base}/${detail.item.id}/live`;
  const query = useLearningPages<LiveRoom>(path),
    command = useLiveCommand(path, api, async (data) => {
      await query.refetch();
      await navigate({
        to: "/workspace/$organizationId/learning/$learningId/live",
        params: { organizationId: org.id, learningId: detail.item.id },
        search: {
          q: "",
          tab: "participants",
          publication: "",
          activity: "",
          session: "",
          room: data.id,
        },
      });
    });
  const canCreate =
    detail.item.state === "published" &&
    detail.publication?.id === detail.item.currentPublication;
  return (
    <section className="directory learning-detail live-directory">
      <Button variant="link" asChild className="settings-back">
        <Link
          to="/workspace/$organizationId/learning/$learningId"
          params={{ organizationId: org.id, learningId: detail.item.id }}
          search={{
            q: "",
            tab: "participants",
            publication: "",
            activity: "",
            session: "",
          }}
        >
          <ArrowLeft aria-hidden="true" />
          {detail.item.title}
        </Link>
      </Button>
      <DirectoryHeader
        title={m.live_host()}
        description={m.live_host_intro()}
        autoFocus={false}
      />
      <div className="section-action-group">
        <ActionButton
          pending={command.isPending}
          disabled={!canCreate || command.isError}
          onClick={() =>
            command.mutate({
              key: crypto.randomUUID(),
              id: crypto.randomUUID(),
              action: "create",
              publication: detail.publication?.id,
            })
          }
        >
          <Radio aria-hidden="true" />
          {m.live_create()}
        </ActionButton>
      </div>
      {!canCreate && <p>{m.live_publish_first()}</p>}
      <LiveCommandNotice
        command={command}
        refresh={() => {
          command.reset();
          void query.refetch();
        }}
      />
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError && !query.data ? (
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <DirectoryList label={m.live_rooms()}>
            {query.items.map((r) => (
              <DirectoryItem linked key={r.id}>
                <Link
                  className="directory-item-link"
                  to="/workspace/$organizationId/learning/$learningId/live"
                  params={{
                    organizationId: org.id,
                    learningId: detail.item.id,
                  }}
                  search={{
                    q: "",
                    tab: "participants",
                    publication: "",
                    activity: "",
                    session: "",
                    room: r.id,
                  }}
                >
                  <DirectoryRecord
                    icon={<Radio />}
                    name={`${r.code.slice(0, 5)} ${r.code.slice(5)}`}
                    detail={
                      <span className="live-room-meta">
                        <span>
                          {new Date(r.expiresAt).getTime() <= Date.now()
                            ? m.live_expired()
                            : phaseLabel(r.state)}
                        </span>
                        <span>
                          {new Intl.DateTimeFormat(locale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: org.timezone,
                          }).format(new Date(r.createdAt))}
                        </span>
                      </span>
                    }
                  />
                  <ChevronRight aria-hidden="true" />
                </Link>
              </DirectoryItem>
            ))}
          </DirectoryList>
          {!query.items.length && (
            <p className="directory-empty">{m.live_no_rooms()}</p>
          )}
          <InfiniteFooter {...query} />
        </>
      )}
    </section>
  );
}
function HostRoom({ detail, room }: { detail: LearningDetail; room: string }) {
  const { org, base, prefix, api } = useLearning(),
    confirm = useConfirmation(),
    locale = useLocale()?.locale ?? "en",
    path = `${base}/${detail.item.id}/live/${room}`;
  const query = useQuery({
    queryKey: [...prefix, "live-state", room],
    queryFn: ({ signal }) => api<LiveState>(path, { signal }),
    retry: false,
    refetchInterval: (q) =>
      q.state.error ||
      q.state.data?.expired ||
      q.state.data?.state === "finished"
        ? false
        : 4000,
  });
  const [rosterOpen, setRosterOpen] = useState(false),
    [rosterSearch, setRosterSearch] = useState(""),
    [rosterQuery, setRosterQuery] = useState(""),
    [qr, setQr] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setRosterQuery(rosterSearch), 250);
    return () => clearTimeout(timer);
  }, [rosterSearch]);
  const roster = useInfiniteQuery({
    queryKey: [...prefix, "live-players", room, rosterQuery],
    enabled: rosterOpen && !!query.data && !query.isError,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api<Page<LivePlayer>>(
        `${path}/players?q=${encodeURIComponent(rosterQuery)}${pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""}`,
        { signal },
      ),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    retry: false,
    refetchInterval:
      rosterOpen && query.data?.state === "lobby" && !query.data.expired
        ? 15000
        : false,
  });
  const command = useLiveCommand(path, api, async (_data, variables) => {
    await query.refetch();
    if (rosterOpen && ["start", "remove"].includes(String(variables.action)))
      await roster.refetch();
  });
  const data = query.data,
    active = !!data && !data.expired && data.state !== "finished",
    locked = command.isPending || command.isError || query.isError;
  useEffect(() => {
    let current = true;
    setQr("");
    if (data?.state === "lobby" && !data.expired)
      void import("qrcode")
        .then((q) =>
          q.toDataURL(`${location.origin}/play/${data.code}`, {
            width: 240,
            margin: 2,
            errorCorrectionLevel: "M",
          }),
        )
        .then(
          (value) => {
            if (current) setQr(value);
          },
          () => {},
        );
    return () => {
      current = false;
    };
  }, [data?.code, data?.state, data?.expired]);
  const send = (action: string, extra: Record<string, unknown> = {}) =>
    data &&
    command.mutate({
      key: crypto.randomUUID(),
      action,
      version: data.version,
      ...extra,
    });
  const finishEarly = async () => {
    if (
      await confirm({
        title: m.live_end(),
        description: m.live_end_warning(),
        confirmLabel: m.live_end(),
        destructive: true,
      })
    )
      send("finish");
  };
  const primary = !data
    ? (["start", m.live_start(), Play] as const)
    : data.state === "lobby"
      ? (["start", m.live_start(), Play] as const)
      : data?.state === "question"
        ? (["lock", m.live_lock(), Lock] as const)
        : data?.state === "locked"
          ? (["reveal", m.live_reveal(), Lightbulb] as const)
          : data?.questionIndex === data.questionCount - 1
            ? (["finish", m.live_finish(), Flag] as const)
            : (["next", m.live_next(), ArrowRight] as const);
  const seen = new Set<string>(),
    players = (roster.data?.pages.flatMap((p) => p.items) ?? []).filter(
      (p) => !seen.has(p.id) && !!seen.add(p.id),
    );
  const primaryAction = active && data && (
    <ActionButton
      className="live-primary"
      pending={command.isPending}
      disabled={locked || (data.state === "lobby" && data.participants === 0)}
      onClick={() => send(primary[0])}
    >
      {(() => {
        const Icon = primary[2];
        return <Icon aria-hidden="true" />;
      })()}
      {primary[1]}
    </ActionButton>
  );
  return (
    <section className="directory learning-detail live-host">
      <div className="live-page-toolbar">
        <Button variant="link" asChild className="settings-back">
          <Link
            to="/workspace/$organizationId/learning/$learningId/live"
            params={{ organizationId: org.id, learningId: detail.item.id }}
            search={{
              q: "",
              tab: "participants",
              publication: "",
              activity: "",
              session: "",
            }}
          >
            <ArrowLeft aria-hidden="true" />
            {m.live_rooms()}
          </Link>
        </Button>
        {data && (
          <div className="live-toolbar-actions">
            <ActionButton
              variant="outline"
              size="icon"
              aria-label={m.live_refresh()}
              pending={query.isFetching}
              onClick={() => {
                void query.refetch();
                if (rosterOpen) void roster.refetch();
              }}
            >
              <RefreshCw aria-hidden="true" />
            </ActionButton>
            {active && (
              <ItemActions
                name={data.title}
                disabled={locked}
                actions={[
                  {
                    label: m.live_end(),
                    icon: Flag,
                    destructive: true,
                    onSelect: () => void finishEarly(),
                  },
                ]}
              />
            )}
          </div>
        )}
      </div>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError && !data ? (
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      ) : (
        data && (
          <>
            <DirectoryHeader
              title={data.title}
              description={
                data.expired ? m.live_expired() : phaseLabel(data.state)
              }
              autoFocus={false}
            />
            {query.isError && (
              <ErrorNotice
                error={query.error}
                retry={() => void query.refetch()}
              />
            )}
            <LiveCommandNotice
              command={command}
              refresh={() => {
                command.reset();
                void query.refetch();
              }}
            />
            <dl
              className="live-counts"
              data-single={
                data.questionIndex < 0 ||
                data.state === "finished" ||
                data.expired
              }
            >
              <div>
                <dt>{m.live_participants()}</dt>
                <dd>{data.participants}</dd>
              </div>
              {data.questionIndex >= 0 &&
                data.state !== "finished" &&
                !data.expired && (
                  <div>
                    <dt>{m.live_answer_count()}</dt>
                    <dd>
                      {data.answered ?? 0} / {data.participants}
                    </dd>
                  </div>
                )}
            </dl>
            {data.state === "lobby" && primaryAction}
            {data.state === "lobby" && !data.expired && (
              <section className="live-room-share">
                <h2>{m.live_invite()}</h2>
                <div className="live-share-content">
                  <div className="live-share-instructions">
                    <p>
                      {m.live_join_at({
                        url:
                          typeof location !== "undefined"
                            ? location.origin + "/play"
                            : "/play",
                      })}
                    </p>
                    <strong className="live-room-code">
                      <span>{data.code.slice(0, 5)}</span>
                      <span>{data.code.slice(5)}</span>
                    </strong>
                    <CopyLink
                      compact
                      value={
                        typeof location !== "undefined"
                          ? `${location.origin}/play/${data.code}`
                          : ""
                      }
                    />
                  </div>
                  {qr && (
                    <img
                      className="learning-qr"
                      src={qr}
                      alt={m.live_qr_alt()}
                    />
                  )}
                </div>
                <details className="session-help">
                  <summary>{m.live_room_details()}</summary>
                  <p className="activity-note">{m.live_room_rules()}</p>
                  <p className="activity-note">
                    {m.live_expires({
                      date: new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: org.timezone,
                      }).format(new Date(data.expiresAt)),
                    })}{" "}
                    · {org.timezone}
                  </p>
                </details>
              </section>
            )}

            {data.question && data.state !== "finished" && !data.expired && (
              <section className="participant-section live-host-section">
                <p className="activity-note">
                  {m.learn_progress({
                    current: String(data.questionIndex + 1),
                    total: String(data.questionCount),
                  })}
                </p>
                <h2>{data.question.text}</h2>
                {data.state === "revealed" && (
                  <>
                    <p className="live-answer-feedback">
                      <Lightbulb aria-hidden="true" />
                      {m.learn_correct()}:{" "}
                      {data.question.choices[data.question.correct!]}
                    </p>
                    {data.question.explanation && (
                      <p>{data.question.explanation}</p>
                    )}
                    <ol className="live-distribution">
                      {data.question.choices.map((choice, i) => (
                        <li key={i}>
                          <span>
                            {String.fromCharCode(65 + i)} · {choice}
                          </span>
                          <strong>
                            {data.distribution?.find((c) => c.choice === i)
                              ?.count ?? 0}
                          </strong>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </section>
            )}
            {data.state !== "lobby" && primaryAction}
            {(data.state === "finished" || data.expired) && (
              <section className="participant-section live-host-section">
                <h2>{m.live_group_summary()}</h2>
                {!data.played ? (
                  <p>{m.live_no_questions()}</p>
                ) : (
                  <ol className="live-summary">
                    {data.summary?.map((row) => (
                      <li key={row.index}>
                        <strong>
                          {row.index + 1}. {row.text}
                        </strong>
                        <span>
                          {m.live_summary_counts({
                            answered: String(row.answered),
                            correct: String(row.correct),
                            total: String(data.participants),
                          })}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}
            <details
              className="session-help"
              open={rosterOpen}
              onToggle={(e) => setRosterOpen(e.currentTarget.open)}
            >
              <summary>
                {m.live_participants()} · {data.participants}
              </summary>
              {rosterOpen && (
                <DirectoryToolbar
                  id="live-player-search"
                  label={m.live_search_players()}
                  value={rosterSearch}
                  onChange={setRosterSearch}
                />
              )}
              {rosterOpen &&
                (roster.isPending ? (
                  <ListSkeleton />
                ) : roster.isError && !roster.data ? (
                  <ErrorNotice
                    error={roster.error}
                    retry={() => void roster.refetch()}
                  />
                ) : (
                  <>
                    {!players.length && (
                      <p className="activity-note">{m.live_roster_empty()}</p>
                    )}
                    <DirectoryList label={m.live_participants()}>
                      {players.map((player) => (
                        <DirectoryItem key={player.id}>
                          <DirectoryRecord
                            name={playerName(player.nickname, player.number)}
                            detail={
                              player.revoked ? m.live_removed() : undefined
                            }
                          />
                          {active && !player.revoked && (
                            <ItemActions
                              name={playerName(player.nickname, player.number)}
                              disabled={locked}
                              actions={[
                                {
                                  label: m.live_remove(),
                                  icon: UserMinus,
                                  destructive: true,
                                  onSelect: async () => {
                                    if (
                                      await confirm({
                                        title: m.live_remove(),
                                        description: m.live_remove_warning(),
                                        confirmLabel: m.live_remove(),
                                        destructive: true,
                                      })
                                    )
                                      send("remove", { player: player.id });
                                  },
                                },
                              ]}
                            />
                          )}
                        </DirectoryItem>
                      ))}
                    </DirectoryList>
                    <InfiniteFooter {...roster} />
                  </>
                ))}
            </details>
          </>
        )
      )}
    </section>
  );
}
