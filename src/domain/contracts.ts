/** Initial contracts, not an implemented simulation or finalized balancing rules. */
export type CompetitionMode = "club_manager" | "team_league";
export type SeasonStatus =
  "draft" | "registration" | "active" | "completed" | "archived" | "cancelled";
export type Tactic = "balanced" | "possession" | "pressing" | "counterattack";
export interface PlayerAttributes {
  attack: number;
  defence: number;
  passing: number;
  goalkeeping: number;
}
export interface RandomSource {
  /** Deterministic implementation required; returns a value in [0, 1). */
  next(): number;
}
export interface SimulationMetadata {
  fixtureId: string;
  engineVersion: string;
  rulesVersion: string;
  seed: string;
}

/** Format is independent of the participant's mode; neither implies the other. */
export type CompetitionFormat = "league" | "tournament";
/** Scope contract only; runtime authorization and setting validation are not implemented. */
export interface SeasonIdentity {
  organizationId: string;
  seasonId: string;
  mode: CompetitionMode;
  format: CompetitionFormat;
  rulesVersion: string;
}
