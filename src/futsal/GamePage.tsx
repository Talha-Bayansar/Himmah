import { Link } from "@tanstack/react-router";
import { Button } from "../components/ui/button";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play, FastForward, Trophy } from "lucide-react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
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
import { ActionButton } from "../components/shared/action-button";
import { useConfirmation } from "../components/shared/confirmation";
import { PointsError } from "../points/PointsShared";
import { directoryRequest, useDirectoryPages } from "../community/client";
import {
  futsalKey,
  useFutsalPrivacyGuard,
  useFutsalWrite,
  isDenied,
} from "./client";
import {
  gameStandings,
  type GameState,
  type GameSlot,
} from "../domain/futsal-game";
import type { FutsalSeason } from "./contracts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
type GameView = {
  item: { state: GameState; version: number; now: string } | null;
  next: GameSlot | null;
  cancelled: boolean;
};
export function GamePage({
  userId,
  organizationId,
  season,
}: {
  userId: string;
  organizationId: string;
  season: FutsalSeason;
}) {
  const path = `/api/organizations/${organizationId}/futsal/seasons/${season.id}/game`,
    confirm = useConfirmation(),
    dirty = useRef(false),
    [operation, setOperation] = useState<"activate" | "advance">("activate"),
    [pendingBody, setPendingBody] = useState<Record<string, unknown> | null>(
      null,
    );
  const game = useQuery({
    queryKey: [...futsalKey(userId, organizationId), "game", season.id],
    queryFn: ({ signal }) => directoryRequest<GameView>(path, { signal }),
    refetchInterval: 30000,
  });
  useFutsalPrivacyGuard(game.error);
  const write = useFutsalWrite({
    path: path + "/" + operation,
    userId,
    organizationId,
    dirty,
    onSaved: () => {},
    onClose: () => {},
  });
  useEffect(() => {
    if (pendingBody) {
      write.mutation.mutate(pendingBody);
      setPendingBody(null);
    }
  }, [pendingBody, write.mutation.mutate]);
  const stamp = (value: string) =>
    new Intl.DateTimeFormat(getLocale(), {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: season.settings.timezone,
    }).format(new Date(value));
  const item = game.data?.item,
    state = item?.state,
    next = game.data?.next;
  if (game.isPending) return <ListSkeleton />;
  if (game.isError)
    return (
      <PointsError
        error={game.error}
        retry={() => void game.refetch()}
        pending={game.isFetching}
      />
    );
  const canRun =
    season.status === "prepared" &&
    (!state ||
      (state.status === "active" &&
        next &&
        Date.parse(next.at) <= Date.parse(item!.now)));
  const run = async () => {
    if (write.uncertain) {
      write.mutation.mutate({});
      return;
    }
    if (
      !(await confirm({
        title: state ? m.game_advance() : m.game_activate(),
        description: state ? m.game_advance_help() : m.game_activate_help(),
        confirmLabel: state ? m.game_advance() : m.game_activate(),
      }))
    )
      return;
    // The request path is selected on a separate render before submission.
    setOperation(state ? "advance" : "activate");
    setPendingBody({ version: item?.version ?? 0 });
  };

  // Keep hooks unconditional; submission is performed by the command component below.
  return (
    <section className="futsal-game">
      <h1 data-page-heading tabIndex={-1}>
        {m.game_title()}
      </h1>
      <Button variant="outline" asChild>
        <Link
          to="/futsal/$organizationId/seasons/$seasonId/clubhouse"
          params={{ organizationId, seasonId: season.id }}
        >
          <Trophy aria-hidden="true" />
          {m.arena_enter()}
        </Link>
      </Button>
      <p>
        {season.name} ·{" "}
        {state?.status === "completed"
          ? m.game_completed()
          : state
            ? m.game_active()
            : m.game_not_started()}
      </p>
      {season.status !== "prepared" && (
        <p>
          {season.status === "cancelled"
            ? m.futsal_cancelled()
            : m.game_lock_first()}
        </p>
      )}
      {next && (
        <p>
          {m.game_next({
            kind:
              next.kind === "training" ? m.futsal_training() : m.game_round(),
            at: stamp(next.at),
          })}
        </p>
      )}
      {write.mutation.isError && <PointsError error={write.mutation.error} />}
      {write.uncertain && <p>{m.futsal_uncertain()}</p>}
      {canRun || write.uncertain ? (
        <ActionButton
          pending={write.mutation.isPending}
          onClick={() => void run()}
        >
          {state ? (
            <FastForward aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
          {write.uncertain
            ? m.try_again()
            : state
              ? m.game_advance()
              : m.game_activate()}
        </ActionButton>
      ) : state?.status === "active" && season.status === "prepared" ? (
        <p>{m.game_wait()}</p>
      ) : null}
      {state && (
        <>
          {state.status === "completed" && (
            <section className="settings-panel">
              <Trophy aria-hidden="true" />
              <h2>{m.game_completed()}</h2>
              <p>
                {season.settings.format === "league"
                  ? gameStandings(state, season.settings)
                      .filter((r) => r.rank === 1)
                      .map((r) => r.name)
                      .join(" · ")
                  : state.entries.find(
                      (e) => e.id === state.results.at(-1)?.winner,
                    )?.name}
              </p>
            </section>
          )}
          <Tabs defaultValue="table">
            <TabsList className="game-tabs">
              <TabsTrigger value="table">
                {season.settings.format === "league"
                  ? m.game_table()
                  : m.game_results()}
              </TabsTrigger>
              <TabsTrigger value="squads">{m.game_squads()}</TabsTrigger>
              <TabsTrigger value="history">{m.game_history()}</TabsTrigger>
            </TabsList>
            <TabsContent value="table">
              {season.settings.format === "league" && (
                <div className="game-table-scroll">
                  <table className="game-table">
                    <caption>{m.game_table()}</caption>
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
                      {gameStandings(state, season.settings).map((r) => (
                        <tr key={r.id}>
                          <td>{r.rank}</td>
                          <th scope="row">{r.name}</th>
                          <td>{r.played}</td>
                          <td>
                            {r.goalsFor}–{r.goalsAgainst}
                          </td>
                          <td>{r.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <h2>{m.game_results()}</h2>
              <Accordion type="multiple">
                {season.snapshot!.plan.rounds.map((round, i) => (
                  <AccordionItem key={i} value={String(i)}>
                    <AccordionTrigger>
                      {m.game_round_number({ number: i + 1 })} ·{" "}
                      {stamp(round.at)}
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="game-matches">
                        {round.matches.map((match) => {
                          const result = state.results.find(
                              (r) => r.id === match.id,
                            ),
                            name = (id: string) =>
                              state.entries.find((e) => e.id === id)?.name ??
                              id,
                            op = (v: typeof match.home) =>
                              "entryId" in v
                                ? name(v.entryId)
                                : m.game_winner_of({ match: v.winnerOf });
                          return (
                            <li key={match.id}>
                              <span>
                                {result ? name(result.home) : op(match.home)}
                              </span>
                              <strong>
                                {result
                                  ? result.away
                                    ? `${result.homeGoals}–${result.awayGoals}`
                                    : m.game_bye()
                                  : "—"}
                              </strong>
                              <span>
                                {result?.away
                                  ? name(result.away)
                                  : match.away
                                    ? op(match.away)
                                    : m.game_bye()}
                              </span>
                              {result?.penalties && (
                                <small>
                                  {m.game_penalties({
                                    team: name(result.winner!),
                                  })}
                                </small>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </TabsContent>
            <TabsContent value="squads">
              <p>{m.game_lineup_help()}</p>
              <Accordion type="multiple">
                {state.entries.map((entry) => (
                  <AccordionItem key={entry.id} value={entry.id}>
                    <AccordionTrigger>{entry.name}</AccordionTrigger>
                    <AccordionContent>
                      <ul className="game-players">
                        {entry.players.map((p, i) => (
                          <li key={p.id}>
                            <strong>
                              {p.personId
                                ? p.name
                                : m.game_virtual_player({ number: i + 1 })}
                              {i >= 5 ? ` · ${m.game_reserve()}` : ""}
                            </strong>
                            <span>
                              {m.game_attributes({
                                attack: p.attack,
                                defence: p.defence,
                                control: p.control,
                              })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </TabsContent>
            <TabsContent value="history">
              <GameHistory
                userId={userId}
                organizationId={organizationId}
                season={season}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </section>
  );
}
function GameHistory({
  userId,
  organizationId,
  season,
}: {
  userId: string;
  organizationId: string;
  season: FutsalSeason;
}) {
  type Event = {
    id: string;
    version: number;
    createdAt: string;
    event: {
      kind: string;
      at: string | null;
      growth?: {
        personId: string;
        points: number;
        chance: number;
        bonus: boolean;
        before: number;
        after: number;
      }[];
      results?: unknown[];
    };
  };
  const events = useDirectoryPages<Event>(
    [...futsalKey(userId, organizationId), "game-events", season.id],
    `/api/organizations/${organizationId}/futsal/seasons/${season.id}/game/events`,
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
  const names = new Map(
    season.snapshot!.entries.flatMap((e) =>
      e.members.map((p) => [p.id, p.name] as const),
    ),
  );
  return (
    <>
      <p>{m.game_cutoff_help()}</p>
      <ul className="directory-list game-history">
        {events.data?.pages
          .flatMap((p) => p.items)
          .map((row) => (
            <li key={row.id}>
              <h3>
                {row.event.kind === "activation"
                  ? m.game_activate()
                  : row.event.kind === "training"
                    ? m.futsal_training()
                    : m.game_round()}
              </h3>
              <p>
                {new Intl.DateTimeFormat(getLocale(), {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: season.settings.timezone,
                }).format(new Date(row.event.at ?? row.createdAt))}
              </p>
              {row.event.growth?.map((g) => (
                <p key={g.personId}>
                  {m.game_training_result({
                    name: names.get(g.personId) ?? "",
                    points: g.points,
                    chance: g.chance,
                    growth: g.after - g.before,
                  })}
                </p>
              ))}
            </li>
          ))}
      </ul>
      <InfiniteFooter {...events} />
    </>
  );
}
