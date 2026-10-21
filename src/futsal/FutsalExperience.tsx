import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Home,
  Users,
  Trophy,
  Dumbbell,
  ArrowLeft,
  ArrowRight,
  Settings2,
  Shield,
  Leaf,
  Play,
  RotateCcw,
} from "lucide-react";
import { Button } from "../components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { Label } from "../components/ui/label";
import { Progress } from "../components/ui/progress";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "../components/ui/accordion";
import {
  ListSkeleton,
  InfiniteFooter,
} from "../components/shared/infinite-list";
import { InstallApp } from "../pwa/install";
import { PointsError } from "../points/PointsShared";
import { directoryRequest, useDirectoryPages } from "../community/client";
import { futsalKey, isDenied, useFutsalPrivacyGuard } from "./client";
import {
  gameSlots,
  gameStandings,
  type GameEntry,
  type GamePlayer,
  type GameState,
  type GameSnapshot,
} from "../domain/futsal-game";
import type { GameSlot } from "../domain/futsal-game";
import type { FutsalSeason } from "./contracts";
import type { Organization } from "../organization/contracts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
export const arenaPaths = {
  clubhouse: "/futsal/$organizationId/seasons/$seasonId/clubhouse",
  squad: "/futsal/$organizationId/seasons/$seasonId/squad",
  competition: "/futsal/$organizationId/seasons/$seasonId/competition",
  training: "/futsal/$organizationId/seasons/$seasonId/training",
  matchday: "/futsal/$organizationId/seasons/$seasonId/matchday",
} as const;
export type ArenaPage = keyof typeof arenaPaths;
const date = (value: string, zone: string) =>
  new Intl.DateTimeFormat(getLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: zone,
  }).format(new Date(value));
const rating = (p: GamePlayer) =>
  Math.round((p.attack + p.defence + p.control) / 3);
export function ClubBadge({
  name,
  index = 0,
}: {
  name: string;
  index?: number;
}) {
  return (
    <span className={`arena-badge arena-badge-${index % 4}`} aria-hidden="true">
      <Shield />
      <b>
        {name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((x) => x[0])
          .join("")
          .toLocaleUpperCase()}
      </b>
      <Leaf className="arena-badge-leaf" />
    </span>
  );
}
export function ArenaNavigation({
  organizationId,
  seasonId,
  page,
  clubId,
}: {
  organizationId: string;
  seasonId: string;
  page: string;
  clubId?: string | undefined;
}) {
  const items = [
    { key: "clubhouse", label: m.arena_clubhouse(), Icon: Home },
    { key: "squad", label: m.game_squads(), Icon: Users },
    { key: "competition", label: m.arena_competition(), Icon: Trophy },
    { key: "training", label: m.arena_training(), Icon: Dumbbell },
  ] as const;
  return (
    <nav
      className="workspace-navigation arena-navigation"
      aria-label={m.futsal_title()}
    >
      {items.map((item) => (
        <Link
          key={item.key}
          to={arenaPaths[item.key]}
          params={{ organizationId, seasonId }}
          search={clubId ? { club: clubId } : {}}
          activeOptions={{ exact: true }}
          aria-current={
            page === item.key ||
            (page === "matchday" && item.key === "competition")
              ? "page"
              : undefined
          }
        >
          <item.Icon aria-hidden="true" />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
export function ArenaLobby({
  userId,
  organization,
}: {
  userId: string;
  organization: Organization;
}) {
  const list = useDirectoryPages<{
    id: string;
    name: string;
    status: string;
    createdAt: string;
  }>(
    [...futsalKey(userId, organization.id), "play-list"],
    `/api/organizations/${organization.id}/futsal/play`,
  );
  useFutsalPrivacyGuard(list.error);
  return (
    <section className="directory arena-lobby">
      <header className="arena-hero">
        <div className="arena-kicker">
          <Leaf aria-hidden="true" />
          {m.futsal_title()}
        </div>
        <h1 data-page-heading tabIndex={-1}>
          {m.arena_your_game()}
        </h1>
        <p>{m.arena_description()}</p>
      </header>
      <div className="arena-section-heading">
        <h2>{m.arena_competitions()}</h2>
        <InstallApp futsal />
      </div>
      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError &&
        (!list.isFetchNextPageError || isDenied(list.error)) ? (
        <PointsError error={list.error} retry={() => void list.refetch()} />
      ) : (
        <>
          <ul className="arena-season-grid">
            {list.data?.pages
              .flatMap((p) => p.items)
              .map((s, i) => (
                <li key={s.id}>
                  <ClubBadge name={s.name} index={i} />
                  <div>
                    <span className="arena-kicker">
                      {s.status === "completed"
                        ? m.game_completed()
                        : m.game_active()}
                    </span>
                    <h2>{s.name}</h2>
                  </div>
                  <Button asChild>
                    <Link
                      to={arenaPaths.clubhouse}
                      params={{
                        organizationId: organization.id,
                        seasonId: s.id,
                      }}
                    >
                      <ArrowRight aria-hidden="true" />
                      {m.arena_enter()}
                    </Link>
                  </Button>
                </li>
              ))}
          </ul>
          {!list.data?.pages[0]?.items.length && (
            <div className="arena-empty">
              <Shield aria-hidden="true" />
              <h2>{m.arena_no_competition()}</h2>
              <p>{m.arena_no_competition_help()}</p>
            </div>
          )}
          <InfiniteFooter {...list} />
        </>
      )}
    </section>
  );
}
type PlayDetail = {
  id: string;
  name: string;
  settings: GameSnapshot["settings"];
  plan?: GameSnapshot["plan"];
  ownEntryId?: string | null;
  state: GameState;
};
export function FutsalExperience({
  userId,
  organization,
  seasonId,
  page,
  clubId,
}: {
  userId: string;
  organization: Organization;
  seasonId: string;
  page: string;
  clubId?: string | undefined;
}) {
  const admin = ["owner", "admin"].includes(organization.role),
    navigate = useNavigate(),
    params = { organizationId: organization.id, seasonId },
    heading = useRef<HTMLHeadingElement>(null);
  const season = useQuery({
    queryKey: [...futsalKey(userId, organization.id), "season", seasonId],
    queryFn: ({ signal }) =>
      directoryRequest<{ item: FutsalSeason }>(
        `/api/organizations/${organization.id}/futsal/seasons/${seasonId}`,
        { signal },
      ),
    enabled: admin,
    retry: false,
  });
  const game = useQuery({
    queryKey: [...futsalKey(userId, organization.id), "game", seasonId],
    queryFn: ({ signal }) =>
      directoryRequest<{
        item: { state: GameState; version: number; now: string } | null;
        next: GameSlot | null;
        cancelled: boolean;
      }>(
        `/api/organizations/${organization.id}/futsal/seasons/${seasonId}/game`,
        { signal },
      ),
    enabled: admin,
    retry: false,
    refetchInterval: 30000,
  });
  const play = useQuery({
    queryKey: [...futsalKey(userId, organization.id), "play", seasonId],
    queryFn: ({ signal }) =>
      directoryRequest<{ item: PlayDetail }>(
        `/api/organizations/${organization.id}/futsal/play/${seasonId}`,
        { signal },
      ),
    enabled: !admin,
    retry: false,
    refetchInterval: 30000,
  });
  useFutsalPrivacyGuard(season.error);
  useFutsalPrivacyGuard(game.error);
  useFutsalPrivacyGuard(play.error);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [page, seasonId, season.isPending, play.isPending]);
  const waiting = admin ? season.isPending || game.isPending : play.isPending,
    error = admin ? (season.error ?? game.error) : play.error;
  const state = admin ? game.data?.item?.state : play.data?.item.state,
    settings = admin ? season.data?.item.settings : play.data?.item.settings,
    plan = admin ? season.data?.item.snapshot?.plan : play.data?.item.plan,
    name = admin ? season.data?.item.name : play.data?.item.name;
  const label =
    page === "squad"
      ? m.game_squads()
      : page === "competition"
        ? m.arena_competition()
        : page === "training"
          ? m.arena_training()
          : page === "matchday"
            ? m.arena_matchday()
            : m.arena_clubhouse();
  if (waiting) return <ListSkeleton />;
  if (error)
    return (
      <PointsError
        error={error}
        retry={() =>
          void (admin
            ? Promise.all([season.refetch(), game.refetch()])
            : play.refetch())
        }
      />
    );
  const entry =
      state?.entries.find((e) => e.id === clubId) ??
      state?.entries.find((e) => e.id === play.data?.item.ownEntryId) ??
      state?.entries[0],
    entryIndex = state?.entries.findIndex((e) => e.id === entry?.id) ?? 0;
  const cancelled =
    admin &&
    (season.data?.item.status === "cancelled" || game.data?.cancelled === true);
  const next =
    !cancelled && state && plan && settings
      ? gameSlots({ settings, plan, entries: [] })[state.step]
      : null;
  return (
    <section className="arena-experience">
      <div className="arena-toolbar">
        <Button variant="link" className="settings-back" asChild>
          <Link
            to="/futsal/$organizationId"
            params={{ organizationId: organization.id }}
          >
            <ArrowLeft aria-hidden="true" />
            {m.futsal_seasons()}
          </Link>
        </Button>
        {admin && (
          <Button variant="ghost" asChild>
            <Link
              to="/futsal/$organizationId/seasons/$seasonId"
              params={params}
            >
              <Settings2 aria-hidden="true" />
              {m.arena_manage()}
            </Link>
          </Button>
        )}
      </div>
      <div className="arena-section-heading">
        <div>
          <p className="arena-kicker">{name}</p>
          <h1 ref={heading} data-page-heading tabIndex={-1}>
            {label}
          </h1>
        </div>
        {page === "clubhouse" && <InstallApp futsal />}
      </div>
      {cancelled && (
        <div className="arena-next" role="status">
          <h2>{m.futsal_cancelled()}</h2>
          <p>{m.arena_cancelled_help()}</p>
        </div>
      )}
      {!state || !settings ? (
        <div className="arena-hero arena-pitch">
          <Shield aria-hidden="true" />
          <h2>{cancelled ? m.futsal_cancelled() : m.arena_preparing()}</h2>
          {!cancelled && <p>{m.arena_preparing_help()}</p>}
        </div>
      ) : (
        <>
          {state.entries.length > 1 && (admin || page !== "training") && (
            <div className="arena-team-select">
              <Label htmlFor="arena-team">
                {admin ? m.game_team() : m.arena_view_club()}
              </Label>
              <NativeSelect
                id="arena-team"
                value={entry!.id}
                onChange={(e) =>
                  void navigate({
                    to: arenaPaths[page as ArenaPage],
                    params,
                    search: { club: e.target.value },
                    replace: true,
                  })
                }
              >
                {state.entries.map((e) => (
                  <NativeSelectOption key={e.id} value={e.id}>
                    {e.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}
          {page === "clubhouse" && entry && (
            <>
              <header className="arena-hero arena-pitch">
                <div className="arena-kicker">
                  <Leaf aria-hidden="true" />
                  {m.futsal_title()} ·{" "}
                  {settings.mode === "club_manager"
                    ? m.futsal_manager()
                    : m.futsal_team()}
                </div>
                <ClubBadge name={entry.name} index={entryIndex} />
                <h2>{entry.name}</h2>
                <p>
                  {cancelled
                    ? m.futsal_cancelled()
                    : state.status === "completed"
                      ? m.game_completed()
                      : m.arena_together()}
                </p>
                <div className="arena-stats">
                  <div>
                    <strong>
                      {Math.round(
                        entry.players
                          .slice(0, 5)
                          .reduce((n, p) => n + rating(p), 0) / 5,
                      )}
                    </strong>
                    <span>{m.arena_team_rating()}</span>
                  </div>
                  <div>
                    <strong>
                      {
                        state.results.filter(
                          (r) =>
                            r.away &&
                            (r.home === entry.id || r.away === entry.id),
                        ).length
                      }
                    </strong>
                    <span>{m.game_played()}</span>
                  </div>
                  <div>
                    <strong>
                      {settings.format === "league"
                        ? gameStandings(state, settings).find(
                            (e) => e.id === entry.id,
                          )?.rank
                        : "—"}
                    </strong>
                    <span>
                      {settings.format === "league"
                        ? m.arena_position()
                        : m.futsal_tournament()}
                    </span>
                  </div>
                </div>
              </header>
              {!cancelled && (
                <div className="arena-next">
                  <div className="arena-section-heading">
                    <h2>{next ? m.arena_up_next() : m.game_completed()}</h2>
                    {next?.kind === "training" ? (
                      <Dumbbell aria-hidden="true" />
                    ) : (
                      <Trophy aria-hidden="true" />
                    )}
                  </div>
                  <p>
                    {next
                      ? m.game_next({
                          kind:
                            next.kind === "training"
                              ? m.arena_training()
                              : m.game_round(),
                          at: date(next.at, settings.timezone),
                        })
                      : m.arena_final_whistle()}
                  </p>
                  <Button asChild>
                    <Link
                      to={
                        next?.kind === "training"
                          ? arenaPaths.training
                          : arenaPaths.competition
                      }
                      params={params}
                      search={{ club: entry.id }}
                    >
                      <ArrowRight aria-hidden="true" />
                      {next?.kind === "training"
                        ? m.arena_training()
                        : m.arena_competition()}
                    </Link>
                  </Button>
                </div>
              )}
              <MatchCards
                state={state}
                entry={entry}
                organizationId={organization.id}
                seasonId={seasonId}
                latestOnly
              />
              <div className="arena-section-heading">
                <h2>{m.arena_first_five()}</h2>
                <Button variant="link" asChild>
                  <Link
                    to={arenaPaths.squad}
                    params={params}
                    search={{ club: entry.id }}
                  >
                    {m.arena_full_squad()}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>
              <div className="arena-player-grid">
                {entry.players.slice(0, 5).map((p, i) => (
                  <PlayerCard
                    key={p.id}
                    player={p}
                    index={i}
                    entry={entry}
                    settings={settings}
                  />
                ))}
              </div>
            </>
          )}
          {page === "squad" && entry && (
            <>
              <p>{m.game_lineup_help()}</p>
              <div className="arena-player-grid">
                {entry.players.map((p, i) => (
                  <PlayerCard
                    key={p.id}
                    player={p}
                    index={i}
                    entry={entry}
                    settings={settings}
                  />
                ))}
              </div>
            </>
          )}
          {page === "competition" && (
            <>
              <div className="arena-competition-banner">
                <Trophy aria-hidden="true" />
                <div>
                  <h2>
                    {settings.format === "league"
                      ? m.game_table()
                      : m.futsal_tournament()}
                  </h2>
                  <p>
                    {cancelled
                      ? m.futsal_cancelled()
                      : state.status === "completed"
                        ? m.game_completed()
                        : m.game_active()}
                  </p>
                </div>
              </div>
              {settings.format === "league" && (
                <div className="game-table-scroll arena-table">
                  <table className="game-table">
                    <caption>{name}</caption>
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">{m.game_team()}</th>
                        <th scope="col">{m.game_played()}</th>
                        <th scope="col">{m.game_goals()}</th>
                        <th scope="col">{m.game_points()}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gameStandings(state, settings).map((row) => (
                        <tr key={row.id} data-own={row.id === entry?.id}>
                          <td>{row.rank}</td>
                          <th scope="row">{row.name}</th>
                          <td>{row.played}</td>
                          <td>
                            {row.goalsFor}–{row.goalsAgainst}
                          </td>
                          <td>
                            <strong>{row.points}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {plan && (
                <Accordion type="multiple">
                  {plan.rounds.map((round) => (
                    <AccordionItem
                      key={round.number}
                      value={String(round.number)}
                    >
                      <AccordionTrigger>
                        {m.game_round_number({ number: round.number })} ·{" "}
                        {date(round.at, settings.timezone)}
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="game-matches">
                          {round.matches.map((match) => {
                            const result = state.results.find(
                                (r) => r.id === match.id,
                              ),
                              resolve = (op: typeof match.home) =>
                                "entryId" in op
                                  ? state.entries.find(
                                      (e) => e.id === op.entryId,
                                    )?.name
                                  : m.game_winner_of({ match: op.winnerOf });
                            return (
                              <li key={match.id}>
                                <span>{resolve(match.home)}</span>
                                <strong>
                                  {result
                                    ? result.away
                                      ? `${result.homeGoals}–${result.awayGoals}`
                                      : m.game_bye()
                                    : "—"}
                                </strong>
                                <span>
                                  {match.away
                                    ? resolve(match.away)
                                    : m.game_bye()}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
              <MatchCards
                state={state}
                entry={entry}
                organizationId={organization.id}
                seasonId={seasonId}
              />
            </>
          )}
          {page === "training" && (
            <>
              <section className="arena-training-card">
                <Dumbbell aria-hidden="true" />
                <h2>{m.arena_small_steps()}</h2>
                <p>
                  {m.game_conversion({
                    step: settings.pointsPerStep,
                    chance: settings.chanceStep,
                    cap: settings.chanceCap,
                  })}
                </p>
                <p>
                  {m.arena_growth_rule({
                    base: settings.baseGrowth,
                    cap: settings.maxGrowth,
                  })}
                </p>
                <p>{m.game_cutoff_help()}</p>
              </section>
              <PersonalTraining
                userId={userId}
                organizationId={organization.id}
                seasonId={seasonId}
                admin={admin}
                timezone={settings.timezone}
              />
            </>
          )}
          {page === "matchday" && <MatchReveal state={state} entry={entry} />}
        </>
      )}
    </section>
  );
}
function PlayerCard({
  player,
  index,
  entry,
  settings,
}: {
  player: GamePlayer;
  index: number;
  entry: GameEntry;
  settings: GameSnapshot["settings"];
}) {
  const human =
    settings.mode === "team_league" && index < settings.playersPerTeam;
  return (
    <article className="arena-player-card">
      <div className="arena-card-top">
        <strong>{rating(player)}</strong>
        <Leaf aria-hidden="true" />
      </div>
      <div className="arena-jersey" aria-hidden="true">
        <span>{index + 1}</span>
      </div>
      <p className="arena-player-club">{entry.name}</p>
      <h3>
        {human ? player.name : m.game_virtual_player({ number: index + 1 })}
      </h3>
      <span className="arena-player-role">
        {index >= 5 ? m.game_reserve() : m.arena_first_five()}
      </span>
      <dl>
        <div>
          <dt>{m.arena_attack()}</dt>
          <dd>{player.attack}</dd>
        </div>
        <div>
          <dt>{m.arena_defence()}</dt>
          <dd>{player.defence}</dd>
        </div>
        <div>
          <dt>{m.arena_control()}</dt>
          <dd>{player.control}</dd>
        </div>
      </dl>
    </article>
  );
}
function MatchCards({
  state,
  entry,
  organizationId,
  seasonId,
  latestOnly = false,
}: {
  state: GameState;
  entry: GameEntry | undefined;
  organizationId: string;
  seasonId: string;
  latestOnly?: boolean;
}) {
  const matches = state.results.filter(
      (r) => r.away && (!entry || r.home === entry.id || r.away === entry.id),
    ),
    rows = latestOnly ? matches.slice(-1) : matches;
  if (!rows.length) return <p className="arena-note">{m.arena_no_results()}</p>;
  return (
    <section>
      <h2>{m.arena_matchday()}</h2>
      <ul className="arena-match-list">
        {rows.map((r) => (
          <li key={r.id}>
            <span>{state.entries.find((e) => e.id === r.home)?.name}</span>
            <strong>
              {r.homeGoals}–{r.awayGoals}
            </strong>
            <span>{state.entries.find((e) => e.id === r.away)?.name}</span>
            {r.penalties && (
              <small>
                {m.game_penalties({
                  team: state.entries.find((e) => e.id === r.winner)!.name,
                })}
              </small>
            )}
          </li>
        ))}
      </ul>
      {latestOnly && (
        <Button variant="outline" asChild>
          <Link
            to={arenaPaths.matchday}
            params={{ organizationId, seasonId }}
            search={entry ? { club: entry.id } : {}}
          >
            <Play aria-hidden="true" />
            {m.arena_watch()}
          </Link>
        </Button>
      )}
    </section>
  );
}
function MatchReveal({
  state,
  entry,
}: {
  state: GameState;
  entry: GameEntry | undefined;
}) {
  const match = state.results
      .filter(
        (r) => r.away && (!entry || r.home === entry.id || r.away === entry.id),
      )
      .at(-1),
    [revealed, setRevealed] = useState(false);
  useEffect(() => setRevealed(false), [match?.id, entry?.id]);
  if (!match)
    return (
      <div className="arena-empty">
        <Trophy aria-hidden="true" />
        <h2>{m.arena_no_results()}</h2>
      </div>
    );
  return (
    <section
      className={`arena-hero arena-reveal${revealed ? " is-revealed" : ""}`}
    >
      <p className="arena-kicker">{m.arena_saved_match()}</p>
      <div className="arena-scoreboard">
        <div>
          <ClubBadge
            name={state.entries.find((e) => e.id === match.home)!.name}
          />
          <h2>{state.entries.find((e) => e.id === match.home)?.name}</h2>
        </div>
        <strong aria-live="polite">
          {revealed ? `${match.homeGoals}–${match.awayGoals}` : "–"}
        </strong>
        <div>
          <ClubBadge
            name={state.entries.find((e) => e.id === match.away)!.name}
            index={1}
          />
          <h2>{state.entries.find((e) => e.id === match.away)?.name}</h2>
        </div>
      </div>
      {revealed && match.penalties && (
        <p>
          {m.game_penalties({
            team: state.entries.find((e) => e.id === match.winner)!.name,
          })}
        </p>
      )}
      <Button variant="secondary" onClick={() => setRevealed((v) => !v)}>
        {revealed ? (
          <RotateCcw aria-hidden="true" />
        ) : (
          <Play aria-hidden="true" />
        )}
        {revealed ? m.arena_replay() : m.arena_reveal()}
      </Button>
      <p>{m.arena_reveal_help()}</p>
    </section>
  );
}
function PersonalTraining({
  userId,
  organizationId,
  seasonId,
  admin,
  timezone,
}: {
  userId: string;
  organizationId: string;
  seasonId: string;
  admin: boolean;
  timezone: string;
}) {
  const events = useDirectoryPages<{
    id: string;
    createdAt: string;
    event: {
      kind?: string;
      at: string | null;
      growth?: {
        playerId: string;
        attribute: string;
        before: number;
        after: number;
        chance: number;
        points: number;
      }[];
    };
  }>(
    [
      ...futsalKey(userId, organizationId),
      "arena-training",
      admin ? "staff" : "self",
      seasonId,
    ],
    `/api/organizations/${organizationId}/futsal/${admin ? `seasons/${seasonId}/game/events` : `play/${seasonId}/training`}`,
  );
  useFutsalPrivacyGuard(events.error);
  if (events.isPending) return <ListSkeleton />;
  if (
    events.isError &&
    (!events.isFetchNextPageError || isDenied(events.error))
  )
    return (
      <PointsError error={events.error} retry={() => void events.refetch()} />
    );
  const rows =
    events.data?.pages
      .flatMap((p) => p.items)
      .filter((e) => e.event.growth?.length) ?? [];
  return (
    <section>
      <h2>{admin ? m.game_history() : m.arena_your_training()}</h2>
      {!rows.length && <p>{m.arena_no_training()}</p>}
      <ul className="arena-training-list">
        {rows.map((row) => (
          <li key={row.id}>
            <p className="arena-kicker">
              {date(row.event.at ?? row.createdAt, timezone)}
            </p>
            {row.event.growth?.map((g) => (
              <div key={g.playerId} className="arena-growth">
                <span>
                  <strong>+{g.after - g.before}</strong>{" "}
                  {g.attribute === "attack"
                    ? m.arena_attack()
                    : g.attribute === "defence"
                      ? m.arena_defence()
                      : m.arena_control()}
                </span>
                <span>
                  {g.before} → {g.after}
                </span>
                <Progress
                  value={g.after}
                  aria-label={m.arena_attribute_progress()}
                />
              </div>
            ))}
          </li>
        ))}
      </ul>
      <InfiniteFooter {...events} />
    </section>
  );
}
