import { useRef, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { Save, X } from "lucide-react";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "../components/ui/accordion";
import { Checkbox } from "../components/ui/checkbox";
import { ActionButton } from "../components/shared/action-button";
import { Button } from "../components/ui/button";
import { PointsError } from "../points/PointsShared";
import { DirectoryError } from "../community/client";
import { CommunityError } from "../community/contracts";
import { localTime } from "../activities/contracts";
import {
  trainingBenefit,
  type FutsalMode,
  type FutsalFormat,
  FutsalRuleError,
} from "../domain/futsal-setup";
import { m } from "../paraglide/messages.js";
import { useLocale } from "../localization/locale";
import type { Organization } from "../organization/contracts";
import { defaultSettings, seasonInput, type FutsalSeason } from "./contracts";
import { useFutsalWrite } from "./client";
const numericKeys = [
  "entryCount",
  "playersPerTeam",
  "squadSize",
  "startingRating",
  "ratingCeiling",
  "trainingEveryDays",
  "roundEveryDays",
  "baseGrowth",
  "bonusGrowth",
  "maxGrowth",
  "pointsPerStep",
  "chanceStep",
  "chanceCap",
  "legs",
  "winPoints",
  "drawPoints",
  "lossPoints",
] as const;
type NumericKey = (typeof numericKeys)[number];
type Fields = Record<NumericKey, string> & {
  name: string;
  description: string;
  prizeCriteria: string;
  mode: FutsalMode;
  format: FutsalFormat;
  drawPolicy: "entry_order" | "seeded_draw";
  trainingBetweenRounds: boolean;
  preparationLocal: string;
  startLocal: string;
  endLocal: string;
};
export const numericLabels = () => ({
  entryCount: m.futsal_entry_count(),
  playersPerTeam: m.futsal_team_size(),
  squadSize: m.futsal_squad_size(),
  startingRating: m.futsal_rating(),
  ratingCeiling: m.futsal_ceiling(),
  trainingEveryDays: m.futsal_training_days(),
  roundEveryDays: m.futsal_round_days(),
  baseGrowth: m.futsal_base_growth(),
  bonusGrowth: m.futsal_bonus_growth(),
  maxGrowth: m.futsal_growth_cap(),
  pointsPerStep: m.futsal_points_step(),
  chanceStep: m.futsal_chance_step(),
  chanceCap: m.futsal_chance_cap(),
  legs: m.futsal_legs(),
  winPoints: m.futsal_win(),
  drawPoints: m.futsal_draw(),
  lossPoints: m.futsal_loss(),
});
const limits: Record<NumericKey, [number, number]> = {
  entryCount: [2, 16],
  playersPerTeam: [2, 5],
  squadSize: [5, 7],
  startingRating: [30, 70],
  ratingCeiling: [31, 99],
  trainingEveryDays: [1, 14],
  roundEveryDays: [1, 14],
  baseGrowth: [1, 2],
  bonusGrowth: [1, 2],
  maxGrowth: [2, 3],
  pointsPerStep: [1, 1000],
  chanceStep: [1, 10],
  chanceCap: [5, 40],
  legs: [1, 2],
  winPoints: [1, 5],
  drawPoints: [0, 3],
  lossPoints: [0, 1],
};
export function SeasonEditor({
  organization,
  userId,
  season: initial,
}: {
  organization: Organization;
  userId: string;
  season?: FutsalSeason;
}) {
  useLocale();
  const navigate = useNavigate(),
    season = useRef(initial).current,
    s = useRef(
      season?.settings ?? defaultSettings(organization.timezone),
    ).current,
    dirty = useRef(false);
  const [validation, setValidation] = useState<DirectoryError | null>(null),
    [advanced, setAdvanced] = useState<string[]>([]);
  const back = () => {
    void navigate(
      season
        ? {
            to: "/futsal/$organizationId/seasons/$seasonId",
            params: { organizationId: organization.id, seasonId: season.id },
          }
        : {
            to: "/futsal/$organizationId",
            params: { organizationId: organization.id },
          },
    );
  };
  const write = useFutsalWrite({
    path: `/api/organizations/${organization.id}/futsal/seasons${season ? "/" + season.id : ""}`,
    method: season ? "PATCH" : "POST",
    userId,
    organizationId: organization.id,
    dirty,
    onSaved: (id) => {
      void navigate({
        to: "/futsal/$organizationId/seasons/$seasonId",
        params: { organizationId: organization.id, seasonId: id },
      });
    },
    onClose: back,
  });
  const defaults: Fields = {
    ...(Object.fromEntries(numericKeys.map((k) => [k, String(s[k])])) as Record<
      NumericKey,
      string
    >),
    name: season?.name ?? "",
    description: season?.description ?? "",
    prizeCriteria: season?.prizeCriteria ?? "",
    mode: s.mode,
    format: s.format,
    drawPolicy: s.drawPolicy,
    trainingBetweenRounds: s.trainingBetweenRounds,
    preparationLocal: localTime(s.preparationStartsAt, s.timezone),
    startLocal: localTime(s.startsAt, s.timezone),
    endLocal: localTime(s.endsAt, s.timezone),
  };
  const body = (v: Fields) => ({
    name: v.name,
    description: v.description,
    prizeCriteria: v.prizeCriteria,
    settings: {
      schemaVersion: 1,
      ...Object.fromEntries(numericKeys.map((k) => [k, Number(v[k])])),
      mode: v.mode,
      format: v.format,
      drawPolicy: v.drawPolicy,
      trainingBetweenRounds: v.trainingBetweenRounds,
      preparationLocal: v.preparationLocal,
      startLocal: v.startLocal,
      endLocal: v.endLocal,
    },
    ...(season ? { version: season.version } : {}),
  });
  const form = useForm({
    defaultValues: defaults,
    onSubmit: ({ value }) => {
      try {
        seasonInput(body(value), s.timezone);
        setValidation(null);
        write.mutation.mutate(body(value));
      } catch (e) {
        setAdvanced(["training", "football", "prizes"]);
        setValidation(
          new DirectoryError(
            e instanceof CommunityError || e instanceof FutsalRuleError
              ? e.code
              : "invalid_input",
          ),
        );
      }
    },
  });
  const values = useStore(form.store, (state) => state.values);
  dirty.current = useStore(form.store, (state) => state.isDirty);
  const numbers = (names: NumericKey[]) =>
    names.map((name) => (
      <form.Field key={name} name={name}>
        {(field) => (
          <div className="futsal-field">
            <Label htmlFor={"futsal-" + name}>{numericLabels()[name]}</Label>
            {name === "squadSize" ? (
              <NativeSelect
                id={"futsal-" + name}
                disabled={write.frozen}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              >
                {[5, 7].map((n) => (
                  <NativeSelectOption key={n} value={n}>
                    {n}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            ) : (
              <Input
                id={"futsal-" + name}
                type="number"
                inputMode="numeric"
                required
                min={limits[name][0]}
                max={limits[name][1]}
                step="1"
                value={field.state.value}
                disabled={write.frozen}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            )}
          </div>
        )}
      </form.Field>
    ));
  return (
    <form
      className="futsal-form"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <h1 data-page-heading tabIndex={-1}>
        {season ? m.futsal_edit() : m.futsal_create()}
      </h1>
      <p>{m.activities_timezone({ timezone: s.timezone })}</p>
      <section className="settings-panel">
        <h2>{m.futsal_structure()}</h2>
        <form.Field name="name">
          {(field) => (
            <div className="futsal-field">
              <Label htmlFor="season-name">{m.futsal_name()}</Label>
              <Input
                id="season-name"
                autoComplete="off"
                required
                minLength={2}
                maxLength={80}
                value={field.state.value}
                disabled={write.frozen}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <div className="futsal-field">
              <Label htmlFor="season-description">
                {m.futsal_description()}
              </Label>
              <Textarea
                id="season-description"
                maxLength={1000}
                value={field.state.value}
                disabled={write.frozen}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
        <div className="futsal-fields-grid">
          <form.Field name="mode">
            {(field) => (
              <div className="futsal-field">
                <Label htmlFor="season-mode">{m.futsal_mode()}</Label>
                <NativeSelect
                  id="season-mode"
                  value={field.state.value}
                  disabled={write.frozen}
                  onChange={(e) => {
                    const v = e.target.value as FutsalMode;
                    field.handleChange(v);
                    form.setFieldValue(
                      "playersPerTeam",
                      v === "club_manager" ? "1" : "3",
                    );
                    form.setFieldValue(
                      "squadSize",
                      v === "club_manager" ? "7" : "5",
                    );
                  }}
                >
                  <NativeSelectOption value="club_manager">
                    {m.futsal_manager()}
                  </NativeSelectOption>
                  <NativeSelectOption value="team_league">
                    {m.futsal_team()}
                  </NativeSelectOption>
                </NativeSelect>
              </div>
            )}
          </form.Field>
          <form.Field name="format">
            {(field) => (
              <div className="futsal-field">
                <Label htmlFor="season-format">{m.futsal_format()}</Label>
                <NativeSelect
                  id="season-format"
                  value={field.state.value}
                  disabled={write.frozen}
                  onChange={(e) =>
                    field.handleChange(e.target.value as FutsalFormat)
                  }
                >
                  <NativeSelectOption value="league">
                    {m.futsal_league()}
                  </NativeSelectOption>
                  <NativeSelectOption value="tournament">
                    {m.futsal_tournament()}
                  </NativeSelectOption>
                </NativeSelect>
              </div>
            )}
          </form.Field>
          {numbers([
            "entryCount",
            values.mode === "team_league" ? "playersPerTeam" : "squadSize",
          ])}
        </div>
        <p>{m.futsal_mode_help()}</p>
        {values.mode === "team_league" && <p>{m.futsal_fillers()}</p>}
      </section>
      <section className="settings-panel">
        <h2>{m.futsal_calendar_title()}</h2>
        <div className="futsal-fields-grid">
          {(["preparationLocal", "startLocal", "endLocal"] as const).map(
            (name) => (
              <form.Field key={name} name={name}>
                {(field) => (
                  <div className="futsal-field">
                    <Label htmlFor={"season-" + name}>
                      {
                        {
                          preparationLocal: m.futsal_preparation(),
                          startLocal: m.futsal_start(),
                          endLocal: m.futsal_end(),
                        }[name]
                      }
                    </Label>
                    <Input
                      id={"season-" + name}
                      type="datetime-local"
                      required
                      value={field.state.value}
                      disabled={write.frozen}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </form.Field>
            ),
          )}
          {numbers(["roundEveryDays", "trainingEveryDays"])}
        </div>
        <form.Field name="trainingBetweenRounds">
          {(field) => (
            <Label className="futsal-checkbox">
              <Checkbox
                checked={field.state.value}
                disabled={write.frozen}
                onCheckedChange={(v) => field.handleChange(v === true)}
              />
              {m.futsal_between()}
            </Label>
          )}
        </form.Field>
        <p>{m.futsal_calendar_help()}</p>
      </section>
      <Accordion
        type="multiple"
        value={advanced}
        onValueChange={setAdvanced}
        className="futsal-advanced"
      >
        <AccordionItem value="training">
          <AccordionTrigger>{m.futsal_training()}</AccordionTrigger>
          <AccordionContent>
            <div className="futsal-fields-grid">
              {numbers([
                "startingRating",
                "ratingCeiling",
                "baseGrowth",
                "bonusGrowth",
                "maxGrowth",
                "pointsPerStep",
                "chanceStep",
                "chanceCap",
              ])}
            </div>
            <p>{m.futsal_points_help()}</p>
            <p>{m.futsal_growth_target()}</p>
            <ul>
              {[
                0,
                Number(values.pointsPerStep),
                Number(values.pointsPerStep) * 10,
              ].map((points, i) => (
                <li key={i}>
                  {m.futsal_benefit({
                    points: String(points),
                    chance: String(
                      trainingBenefit(Number.isFinite(points) ? points : 0, {
                        ...s,
                        pointsPerStep: Math.max(
                          1,
                          Number(values.pointsPerStep) || 1,
                        ),
                        chanceStep: Number(values.chanceStep) || 0,
                        chanceCap: Number(values.chanceCap) || 0,
                      }).bonusChance,
                    ),
                  })}
                </li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="football">
          <AccordionTrigger>{m.futsal_football()}</AccordionTrigger>
          <AccordionContent>
            {values.format === "league" ? (
              <>
                <div className="futsal-fields-grid">
                  {numbers(["legs", "winPoints", "drawPoints", "lossPoints"])}
                </div>
                <p>{m.futsal_tiebreak()}</p>
              </>
            ) : (
              <>
                <form.Field name="drawPolicy">
                  {(field) => (
                    <div className="futsal-field">
                      <Label htmlFor="season-draw">
                        {m.futsal_draw_policy()}
                      </Label>
                      <NativeSelect
                        id="season-draw"
                        disabled={write.frozen}
                        value={field.state.value}
                        onChange={(e) =>
                          field.handleChange(
                            e.target.value as Fields["drawPolicy"],
                          )
                        }
                      >
                        <NativeSelectOption value="entry_order">
                          {m.futsal_entry_order()}
                        </NativeSelectOption>
                        <NativeSelectOption value="seeded_draw">
                          {m.futsal_seeded()}
                        </NativeSelectOption>
                      </NativeSelect>
                    </div>
                  )}
                </form.Field>
                <p>{m.futsal_knockout_help()}</p>
              </>
            )}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="prizes">
          <AccordionTrigger>{m.futsal_prize()}</AccordionTrigger>
          <AccordionContent>
            <form.Field name="prizeCriteria">
              {(field) => (
                <div className="futsal-field">
                  <Label htmlFor="season-prize">{m.futsal_prize()}</Label>
                  <Textarea
                    id="season-prize"
                    maxLength={500}
                    value={field.state.value}
                    disabled={write.frozen}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>
            <p>{m.futsal_prize_help()}</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      {(validation || write.mutation.error) && (
        <div tabIndex={-1} role="alert">
          <PointsError error={validation ?? write.mutation.error} />
        </div>
      )}
      {write.uncertain && <p role="status">{m.futsal_uncertain()}</p>}
      <div className="directory-actions futsal-form-actions">
        <Button
          type="button"
          variant="outline"
          disabled={write.mutation.isPending}
          onClick={() => void write.close()}
        >
          <X aria-hidden="true" />
          {m.cancel()}
        </Button>
        <ActionButton type="submit" pending={write.mutation.isPending}>
          <Save aria-hidden="true" />
          {write.uncertain ? m.try_again() : m.futsal_save()}
        </ActionButton>
      </div>
    </form>
  );
}
