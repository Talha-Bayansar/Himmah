import {
  CommunityError,
  uuid,
  versionInput,
  pageInput,
  pageResult,
} from "../community/contracts.ts";
import {
  activateGame,
  advanceGame,
  gameSlots,
  type GameState,
  type GamePoints,
} from "../domain/futsal-game.ts";
import type { FutsalSeason } from "../futsal/contracts.ts";
import type { OrganizationStore } from "./store.ts";
import type { FutsalStore } from "./futsal-store.ts";
import type { FutsalGameStore } from "./futsal-game-store.ts";
export async function futsalGameApi(
  request: Request,
  user: { id: string; emailVerified: boolean },
  organizations: OrganizationStore,
  seasons: FutsalStore,
  games: FutsalGameStore,
) {
  const url = new URL(request.url),
    match = url.pathname.match(
      /^\/api\/organizations\/([0-9a-f-]{36})\/futsal\/seasons\/([0-9a-f-]{36})\/game(?:\/(events|activate|advance))?$/i,
    );
  const play = url.pathname.match(
    /^\/api\/organizations\/([0-9a-f-]{36})\/futsal\/play(?:\/([0-9a-f-]{36}))?$/i,
  );
  if (play) return participantPlay(request, user, games, play);
  if (!match) return null;
  const respond = (v: unknown, status = 200) =>
    Response.json(v, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  try {
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    const org = uuid(match[1]),
      id = uuid(match[2]),
      part = match[3];
    const member = await organizations.get(user.id, org);
    if (!member) throw new CommunityError("not_found", 404);
    if (!["owner", "admin"].includes(member.role))
      throw new CommunityError("forbidden", 403);
    const season = (await seasons.get(user.id, org, id))[0] as
      FutsalSeason | undefined;
    if (!season) throw new CommunityError("not_found", 404);
    const game = (await games.get(user.id, org, id))[0] as
      { state: GameState; version: number; now: string } | undefined;
    if (request.method === "GET" && !part)
      return respond({
        item: game ?? null,
        next:
          game && season.snapshot
            ? (gameSlots(season.snapshot)[game.state.step] ?? null)
            : null,
        cancelled: season.status === "cancelled",
      });
    if (request.method === "GET" && part === "events") {
      const p = pageInput(url, `${user.id}:${org}/futsal/${id}/game/events`);
      if (p.query || p.archived || p.groupId)
        throw new CommunityError("invalid_input");
      return respond(
        pageResult(
          (await games.events(user.id, org, id, p)) as {
            id: string;
            createdAt: string;
          }[],
          p,
        ),
      );
    }
    if (
      request.method !== "POST" ||
      !["activate", "advance"].includes(part ?? "")
    )
      return respond({ code: "not_found" }, 404);
    const raw = await request.text();
    if (raw.length > 2000) throw new CommunityError("invalid_input");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
      if (!body || Array.isArray(body) || typeof body !== "object")
        throw Error();
    } catch {
      throw new CommunityError("invalid_input");
    }
    const key = uuid(body.key),
      version = part === "activate" ? 0 : versionInput(body),
      command = { operation: part, version };
    if (part === "activate" && body.version !== 0)
      throw new CommunityError("invalid_input");
    const receipt = (await games.receipt(user.id, org, key))[0];
    if (receipt) {
      if (
        receipt.seasonId !== id ||
        receipt.actorId !== user.id ||
        JSON.stringify(receipt.request) !== JSON.stringify(command)
      ) {
        // PostgreSQL jsonb key ordering is not JavaScript insertion ordering.
        const saved = receipt.request as typeof command;
        if (
          receipt.seasonId !== id ||
          receipt.actorId !== user.id ||
          saved.operation !== command.operation ||
          saved.version !== version
        )
          throw new CommunityError("conflict", 409);
      }
      return respond({ item: { id, version: receipt.version } });
    }
    if (season.status !== "prepared" || !season.snapshot)
      throw new CommunityError("futsal_locked", 409);
    if ((game?.version ?? 0) !== version)
      throw new CommunityError("conflict", 409);
    let state: GameState,
      event: unknown,
      points: GamePoints = {};
    if (part === "activate") {
      if (game) throw new CommunityError("conflict", 409);
      state = activateGame(season.snapshot);
      event = { kind: "activation", at: null };
    } else {
      if (!game || game.state.status !== "active")
        throw new CommunityError("conflict", 409);
      const slot = gameSlots(season.snapshot)[game.state.step];
      if (!slot) throw new CommunityError("conflict", 409);
      // The commit repeats this due-time check with the database clock. No browser clock or override is accepted.
      if (Date.parse(slot.at) > Date.parse(game.now))
        throw new CommunityError("game_not_due", 409);
      if (slot.kind === "training")
        points = (await games.points(user.id, org, id, slot.index))[0]
          ?.points as GamePoints;
      const result = advanceGame(
        season.snapshot,
        game.state,
        season.seed,
        points,
      );
      state = result.state;
      event = result.event;
    }
    const r = (
      await games.commit(
        user.id,
        org,
        id,
        key,
        command,
        game?.state ?? null,
        points,
        state,
        event,
      )
    )[0]?.result as
      { id?: string; version?: number; code?: string } | undefined;
    if (!r) throw new CommunityError("service", 503);
    if (r.code)
      throw new CommunityError(
        r.code,
        r.code === "forbidden" ? 403 : r.code === "not_found" ? 404 : 409,
      );
    return respond({ item: r });
  } catch (e) {
    return e instanceof CommunityError
      ? respond({ code: e.code }, e.status)
      : respond({ code: "service" }, 503);
  }
}

async function participantPlay(
  request: Request,
  user: { id: string; emailVerified: boolean },
  games: FutsalGameStore,
  match: RegExpMatchArray,
) {
  const respond = (data: unknown, status = 200) =>
    Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  try {
    if (!user.emailVerified) throw new CommunityError("verify_required", 403);
    if (request.method !== "GET") throw new CommunityError("forbidden", 403);
    const org = uuid(match[1]);
    if (match[2]) {
      const item = (
        await games.participantGet(user.id, org, uuid(match[2]))
      )[0];
      if (!item) throw new CommunityError("not_found", 404);
      const state = structuredClone(item.state) as GameState;
      // Peers may see football performance, never person identifiers or engagement allocations.
      state.entries.forEach((e) =>
        e.players.forEach((p) => {
          p.personId = null;
        }),
      );
      return respond({ item: { ...item, state } });
    }
    const p = pageInput(new URL(request.url), `${user.id}:${org}/futsal/play`);
    if (p.query || p.archived || p.groupId)
      throw new CommunityError("invalid_input");
    return respond(
      pageResult(
        (await games.participantList(user.id, org, p)) as {
          id: string;
          createdAt: string;
        }[],
        p,
      ),
    );
  } catch (e) {
    return e instanceof CommunityError
      ? respond({ code: e.code }, e.status)
      : respond({ code: "service" }, 503);
  }
}
