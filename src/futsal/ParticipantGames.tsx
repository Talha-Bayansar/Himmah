import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Trophy } from "lucide-react";
import { Button } from "../components/ui/button";
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
import { directoryRequest, useDirectoryPages } from "../community/client";
import { PointsError } from "../points/PointsShared";
import { futsalKey, isDenied, useFutsalPrivacyGuard } from "./client";
import { gameStandings, type GameState } from "../domain/futsal-game";
import type { FutsalSettings } from "../domain/futsal-setup";
import { m } from "../paraglide/messages.js";
export function ParticipantGames({
  userId,
  organizationId,
  seasonId,
}: {
  userId: string;
  organizationId: string;
  seasonId?: string | undefined;
}) {
  const path = `/api/organizations/${organizationId}/futsal/play`;
  const list = useDirectoryPages<{
    id: string;
    name: string;
    createdAt: string;
    status: string;
  }>([...futsalKey(userId, organizationId), "play-list"], path, {
    enabled: !seasonId,
  });
  const detail = useQuery({
    queryKey: [...futsalKey(userId, organizationId), "play", seasonId],
    queryFn: ({ signal }) =>
      directoryRequest<{
        item: {
          id: string;
          name: string;
          settings: FutsalSettings;
          state: GameState;
        };
      }>(path + "/" + seasonId, { signal }),
    enabled: !!seasonId,
    refetchInterval: 30000,
  });
  useFutsalPrivacyGuard(list.error);
  useFutsalPrivacyGuard(detail.error);
  const q = seasonId ? detail : list,
    item = detail.data?.item;
  return (
    <section className="directory futsal-game">
      {seasonId && (
        <Button variant="link" className="settings-back" asChild>
          <Link to="/futsal/$organizationId" params={{ organizationId }}>
            <ArrowLeft aria-hidden="true" />
            {m.futsal_seasons()}
          </Link>
        </Button>
      )}
      <h1 data-page-heading tabIndex={-1}>
        {item?.name ?? m.futsal_title()}
      </h1>
      {q.isPending ? (
        <ListSkeleton />
      ) : q.isError &&
        (!("isFetchNextPageError" in q && q.isFetchNextPageError) ||
          isDenied(q.error)) ? (
        <PointsError error={q.error} retry={() => void q.refetch()} />
      ) : item ? (
        <>
          <p>
            {item.state.status === "completed"
              ? m.game_completed()
              : m.game_active()}
          </p>
          <p>
            {m.game_conversion({
              step: item.settings.pointsPerStep,
              chance: item.settings.chanceStep,
              cap: item.settings.chanceCap,
            })}
          </p>
          {item.settings.format === "league" && (
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
                  {gameStandings(item.state, item.settings).map((r) => (
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
          <ul className="game-matches">
            {item.state.results.map((r) => (
              <li key={r.id}>
                <span>
                  {item.state.entries.find((e) => e.id === r.home)?.name}
                </span>
                <strong>
                  {r.away ? `${r.homeGoals}–${r.awayGoals}` : m.game_bye()}
                </strong>
                <span>
                  {item.state.entries.find((e) => e.id === r.away)?.name}
                </span>
                {r.penalties && (
                  <small>
                    {m.game_penalties({
                      team: item.state.entries.find((e) => e.id === r.winner)!
                        .name,
                    })}
                  </small>
                )}
              </li>
            ))}
          </ul>
          {item.state.status === "completed" &&
            item.settings.format === "tournament" && (
              <p>
                <Trophy aria-hidden="true" />
                {
                  item.state.entries.find(
                    (e) => e.id === item.state.results.at(-1)?.winner,
                  )?.name
                }
              </p>
            )}
          <h2>{m.game_squads()}</h2>
          <Accordion type="multiple">
            {item.state.entries.map((e) => (
              <AccordionItem key={e.id} value={e.id}>
                <AccordionTrigger>{e.name}</AccordionTrigger>
                <AccordionContent>
                  <ul className="game-players">
                    {e.players.map((p, i) => (
                      <li key={p.id}>
                        <strong>
                          {item.settings.mode === "team_league" &&
                          i < item.settings.playersPerTeam
                            ? p.name
                            : m.game_virtual_player({ number: i + 1 })}
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
        </>
      ) : (
        <>
          <ul className="directory-list">
            {list.data?.pages
              .flatMap((p) => p.items)
              .map((s) => (
                <li key={s.id}>
                  <h2>{s.name}</h2>
                  <p>
                    {s.status === "completed"
                      ? m.game_completed()
                      : m.game_active()}
                  </p>
                  <Button asChild>
                    <Link
                      to="/futsal/$organizationId/seasons/$seasonId/game"
                      params={{ organizationId, seasonId: s.id }}
                    >
                      <ArrowRight aria-hidden="true" />
                      {m.game_title()}
                    </Link>
                  </Button>
                </li>
              ))}
          </ul>
          <InfiniteFooter {...list} />
        </>
      )}
    </section>
  );
}
