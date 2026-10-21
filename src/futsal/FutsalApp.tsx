import { InstallApp } from "../pwa/install";
import {
  FutsalExperience,
  ArenaLobby,
  ArenaNavigation,
} from "./FutsalExperience";
import { ParticipantGames } from "./ParticipantGames";
import { GamePage } from "./GamePage";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";
import {
  Trophy,
  LayoutGrid,
  Plus,
  Search,
  ArrowLeft,
  ArrowRight,
  Pencil,
  Trash2,
  LockKeyhole,
  Users,
} from "lucide-react";
import { Button } from "../components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "../components/ui/accordion";
import { RouteTabs } from "../components/shared/route-tabs";
import { ItemActions } from "../components/shared/item-actions";
import {
  ListSkeleton,
  InfiniteFooter,
} from "../components/shared/infinite-list";
import { PointsError } from "../points/PointsShared";
import {
  directoryRequest,
  useDirectoryPages,
  DirectoryError,
} from "../community/client";
import type { Organization } from "../organization/contracts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { useLocale } from "../localization/locale";
import type {
  FutsalPlan,
  FutsalSettings,
  Opponent,
} from "../domain/futsal-setup";
import { type FutsalSeason, type FutsalEntry } from "./contracts";
import { SeasonEditor, numericLabels } from "./SeasonEditor";
import { EntryEditor } from "./EntryEditor";
import { SeasonAction } from "./SeasonAction";
import {
  FutsalPrivacy,
  futsalKey,
  isDenied,
  useFutsalPrivacyGuard,
} from "./client";
export type FutsalLocation = {
  page:
    | "seasons"
    | "new"
    | "review"
    | "settings"
    | "entries"
    | "game"
    | "clubhouse"
    | "squad"
    | "competition"
    | "training"
    | "matchday";
  seasonId?: string;
  clubId?: string | undefined;
  status?: "all" | "draft" | "prepared" | "cancelled";
};
const statusText = (s: FutsalSeason["status"]) =>
  ({
    draft: m.futsal_draft,
    prepared: m.futsal_prepared,
    cancelled: m.futsal_cancelled,
  })[s]();
const modeText = (s: FutsalSettings) =>
  s.mode === "club_manager" ? m.futsal_manager() : m.futsal_team();
const formatText = (s: FutsalSettings) =>
  s.format === "league" ? m.futsal_league() : m.futsal_tournament();
const stamp = (s: string, zone: string) =>
  new Intl.DateTimeFormat(getLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: zone,
  }).format(new Date(s));
export function FutsalNavigation({
  organizationId,
  role,
  location,
}: {
  organizationId: string;
  role?: string | undefined;
  location?: FutsalLocation;
}) {
  useLocale();
  if (
    location?.seasonId &&
    ["clubhouse", "squad", "competition", "training", "matchday"].includes(
      location.page,
    )
  )
    return (
      <ArenaNavigation
        organizationId={organizationId}
        seasonId={location.seasonId}
        page={location.page}
        clubId={location.clubId}
      />
    );
  return (
    <nav
      className="workspace-navigation futsal-navigation"
      aria-label={m.futsal_title()}
    >
      <Link
        to="/futsal/$organizationId"
        params={{ organizationId }}
        aria-current="page"
      >
        <Trophy aria-hidden="true" />
        <span>{m.futsal_seasons()}</span>
      </Link>
      <Link
        to="/workspace/$organizationId/$section"
        params={{
          organizationId,
          section: role === "participant" ? "me" : "manage",
        }}
      >
        <LayoutGrid aria-hidden="true" />
        <span>{m.futsal_hub()}</span>
      </Link>
    </nav>
  );
}
export function ConnectedApps({
  organization,
}: {
  organization: Organization;
}) {
  useLocale();
  return (
    <section className="directory connected-apps">
      <Button variant="link" className="settings-back" asChild>
        <Link
          to="/workspace/$organizationId/$section"
          params={{ organizationId: organization.id, section: "manage" }}
        >
          <ArrowLeft aria-hidden="true" />
          {m.back_to_manage()}
        </Link>
      </Button>
      <div className="directory-heading">
        <div>
          <h1 data-page-heading tabIndex={-1}>
            {m.futsal_apps()}
          </h1>
          <p>{m.futsal_apps_help()}</p>
        </div>
      </div>
      {["owner", "admin"].includes(organization.role) ? (
        <section className="settings-panel">
          <h2>
            <Trophy aria-hidden="true" />
            {m.futsal_title()}
          </h2>
          <p>{m.futsal_app_help()}</p>
          <Button asChild>
            <Link
              reloadDocument
              to="/futsal/$organizationId"
              params={{ organizationId: organization.id }}
            >
              <ArrowRight aria-hidden="true" />
              {m.futsal_open()}
            </Link>
          </Button>
        </section>
      ) : (
        <PointsError error={new DirectoryError("forbidden")} />
      )}
    </section>
  );
}
export function FutsalApp(props: {
  organization: Organization;
  userId: string;
  location: FutsalLocation;
}) {
  useLocale();
  if (
    props.location.page === "seasons" &&
    props.organization.role === "participant"
  )
    return (
      <FutsalPrivacy key={props.userId + props.organization.id}>
        <ArenaLobby userId={props.userId} organization={props.organization} />
      </FutsalPrivacy>
    );
  if (
    props.location.seasonId &&
    ["clubhouse", "squad", "competition", "training", "matchday"].includes(
      props.location.page,
    ) &&
    ["owner", "admin", "participant"].includes(props.organization.role)
  )
    return (
      <FutsalPrivacy key={props.userId + props.organization.id}>
        <FutsalExperience
          userId={props.userId}
          organization={props.organization}
          seasonId={props.location.seasonId}
          page={props.location.page}
          clubId={props.location.clubId}
        />
      </FutsalPrivacy>
    );
  if (
    props.organization.role === "participant" &&
    !["seasons", "game"].includes(props.location.page)
  )
    return <PointsError error={new DirectoryError("forbidden")} />;
  if (
    props.organization.role === "participant" &&
    props.location.page === "game"
  )
    return (
      <Navigate
        to="/futsal/$organizationId/seasons/$seasonId/clubhouse"
        params={{
          organizationId: props.organization.id,
          seasonId: props.location.seasonId!,
        }}
        replace
      />
    );
  if (props.organization.role === "participant")
    return (
      <FutsalPrivacy key={props.userId + props.organization.id}>
        <ParticipantGames
          userId={props.userId}
          organizationId={props.organization.id}
          seasonId={props.location.seasonId}
        />
      </FutsalPrivacy>
    );
  if (!["owner", "admin"].includes(props.organization.role))
    return <PointsError error={new DirectoryError("forbidden")} />;
  return (
    <FutsalPrivacy key={props.userId + props.organization.id}>
      <FutsalContent {...props} />
    </FutsalPrivacy>
  );
}
function FutsalContent({
  organization,
  userId,
  location,
}: {
  organization: Organization;
  userId: string;
  location: FutsalLocation;
}) {
  const heading = useRef<HTMLDivElement>(null),
    id = location.seasonId;
  const detail = useQuery({
    queryKey: [...futsalKey(userId, organization.id), "season", id],
    queryFn: ({ signal }) =>
      directoryRequest<{ item: FutsalSeason }>(
        `/api/organizations/${organization.id}/futsal/seasons/${id}`,
        { signal },
      ),
    enabled: !!id,
    retry: false,
  });
  useEffect(() => {
    heading.current
      ?.querySelector<HTMLElement>("[data-page-heading]")
      ?.focus({ preventScroll: true });
  }, [location.page, id, detail.data?.item.id]);
  useFutsalPrivacyGuard(detail.error);
  const params = { organizationId: organization.id, seasonId: id! };
  if (location.page === "seasons")
    return (
      <FutsalList
        organization={organization}
        userId={userId}
        status={location.status ?? "all"}
      />
    );
  const back = (
    <Button variant="link" className="settings-back" asChild>
      {location.page === "new" || location.page === "review" ? (
        <Link
          to="/futsal/$organizationId"
          params={{ organizationId: organization.id }}
        >
          <ArrowLeft aria-hidden="true" />
          {m.futsal_seasons()}
        </Link>
      ) : (
        <Link to="/futsal/$organizationId/seasons/$seasonId" params={params}>
          <ArrowLeft aria-hidden="true" />
          {detail.data?.item.name ?? m.futsal_review()}
        </Link>
      )}
    </Button>
  );
  if (location.page === "new")
    return (
      <section className="directory futsal-page" ref={heading}>
        {back}
        <SeasonEditor organization={organization} userId={userId} />
      </section>
    );
  if (detail.isPending)
    return (
      <section className="directory futsal-page">
        {back}
        <ListSkeleton />
      </section>
    );
  if (detail.isError)
    return (
      <section className="directory futsal-page">
        {back}
        <PointsError
          error={detail.error}
          retry={() => void detail.refetch()}
          pending={detail.isFetching}
        />
      </section>
    );
  const season = detail.data.item;
  return (
    <section className="directory futsal-page" ref={heading}>
      {back}
      <RouteTabs aria-label={season.name}>
        <Link
          activeOptions={{ exact: true }}
          to="/futsal/$organizationId/seasons/$seasonId"
          params={params}
          aria-current={location.page === "review" ? "page" : undefined}
        >
          {m.futsal_review()}
        </Link>
        <Link
          activeOptions={{ exact: true }}
          to="/futsal/$organizationId/seasons/$seasonId/settings"
          params={params}
          aria-current={location.page === "settings" ? "page" : undefined}
        >
          {m.futsal_settings_tab()}
        </Link>
        <Link
          activeOptions={{ exact: true }}
          to="/futsal/$organizationId/seasons/$seasonId/entries"
          params={params}
          aria-current={location.page === "entries" ? "page" : undefined}
        >
          {m.futsal_entries_tab()}
        </Link>
        <Link
          activeOptions={{ exact: true }}
          to="/futsal/$organizationId/seasons/$seasonId/game"
          params={params}
          aria-current={location.page === "game" ? "page" : undefined}
        >
          {m.game_title()}
        </Link>
      </RouteTabs>
      {location.page === "game" ? (
        <GamePage
          userId={userId}
          organizationId={organization.id}
          season={season}
        />
      ) : location.page === "settings" ? (
        season.status === "draft" ? (
          <SeasonEditor
            key={season.id}
            organization={organization}
            userId={userId}
            season={season}
          />
        ) : (
          <>
            <h1 data-page-heading tabIndex={-1}>
              {m.futsal_settings_tab()}
            </h1>
            <SettingsSummary season={season} />
          </>
        )
      ) : location.page === "entries" ? (
        <Entries
          key={season.id}
          organization={organization}
          userId={userId}
          season={season}
        />
      ) : (
        <Review
          key={season.id}
          organization={organization}
          userId={userId}
          season={season}
        />
      )}
    </section>
  );
}
function FutsalList({
  organization,
  userId,
  status,
}: {
  organization: Organization;
  userId: string;
  status: string;
}) {
  const [search, setSearch] = useState(""),
    [action, setAction] = useState<FutsalSeason | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const list = useDirectoryPages<FutsalSeason>(
    [...futsalKey(userId, organization.id), "seasons", status, search],
    `/api/organizations/${organization.id}/futsal/seasons?status=${status}&q=${encodeURIComponent(search)}`,
  );
  useFutsalPrivacyGuard(list.error);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  const fatal =
      list.isError && (!list.isFetchNextPageError || isDenied(list.error)),
    rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section className="directory futsal-page">
      <div className="arena-lobby-brand">
        <span className="futsal-app-label">{m.futsal_title()}</span>
        <InstallApp futsal />
      </div>
      <div className="directory-heading">
        <div>
          <h1 ref={heading} tabIndex={-1} data-page-heading>
            {m.futsal_seasons()}
          </h1>
          <p>{m.futsal_intro()}</p>
        </div>
        <Button asChild>
          <Link
            to="/futsal/$organizationId/seasons/new"
            params={{ organizationId: organization.id }}
          >
            <Plus aria-hidden="true" />
            {m.futsal_create()}
          </Link>
        </Button>
      </div>
      <div className="directory-toolbar">
        <Label>
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">{m.directory_search()}</span>
          <Input
            type="search"
            value={search}
            maxLength={80}
            placeholder={m.directory_search()}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Label>
        <Label>
          <span className="sr-only">{m.futsal_all()}</span>
          <FutsalStatusSelect
            organizationId={organization.id}
            status={status}
          />
        </Label>
      </div>
      {list.isPending ? (
        <ListSkeleton />
      ) : fatal ? (
        <PointsError
          error={list.error}
          retry={() => void list.refetch()}
          pending={list.isFetching}
        />
      ) : (
        <>
          <ul className="directory-list futsal-season-list">
            {rows.map((season) => (
              <li key={season.id}>
                <div>
                  <h2>{season.name}</h2>
                  <p>
                    {modeText(season.settings)} · {formatText(season.settings)}
                  </p>
                  <span className="badge">
                    {season.status === "prepared" && season.gameStatus
                      ? season.gameStatus === "completed"
                        ? m.game_completed()
                        : m.game_active()
                      : statusText(season.status)}
                  </span>
                </div>
                <div className="directory-actions">
                  <Button variant="outline" asChild>
                    <Link
                      to={
                        season.gameStatus
                          ? "/futsal/$organizationId/seasons/$seasonId/clubhouse"
                          : "/futsal/$organizationId/seasons/$seasonId"
                      }
                      params={{
                        organizationId: organization.id,
                        seasonId: season.id,
                      }}
                    >
                      <ArrowRight aria-hidden="true" />
                      {season.gameStatus ? m.arena_enter() : m.futsal_view()}
                    </Link>
                  </Button>
                  {season.status !== "cancelled" && (
                    <ItemActions
                      name={season.name}
                      actions={[
                        {
                          label: m.futsal_cancel(),
                          icon: Trash2,
                          destructive: true,
                          onSelect: () => setAction(season),
                        },
                      ]}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!rows.length ? (
            <p className="directory-empty">{m.futsal_empty()}</p>
          ) : (
            <InfiniteFooter
              {...list}
              fetchNextPage={() => list.fetchNextPage({ cancelRefetch: false })}
            />
          )}
        </>
      )}
      {action && (
        <SeasonAction
          organizationId={organization.id}
          userId={userId}
          season={action}
          action="cancel"
          onClose={() => setAction(null)}
        />
      )}
    </section>
  );
}
import { useNavigate } from "@tanstack/react-router";
function FutsalStatusSelect({
  organizationId,
  status,
}: {
  organizationId: string;
  status: string;
}) {
  const navigate = useNavigate();
  return (
    <NativeSelect
      aria-label={m.futsal_all()}
      value={status}
      onChange={(e) =>
        void navigate({
          to: "/futsal/$organizationId",
          params: { organizationId },
          search: {
            status: e.target.value as NonNullable<FutsalLocation["status"]>,
          },
        })
      }
    >
      {(["all", "draft", "prepared", "cancelled"] as const).map((v) => (
        <NativeSelectOption key={v} value={v}>
          {v === "all" ? m.futsal_all() : statusText(v)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
function Entries({
  organization,
  userId,
  season,
}: {
  organization: Organization;
  userId: string;
  season: FutsalSeason;
}) {
  const [search, setSearch] = useState(""),
    [edit, setEdit] = useState<{
      season: FutsalSeason;
      entry?: FutsalEntry;
    } | null>(null),
    [remove, setRemove] = useState<{
      season: FutsalSeason;
      entry: FutsalEntry;
    } | null>(null);
  const list = useDirectoryPages<FutsalEntry>(
    [...futsalKey(userId, organization.id), "entries", season.id, search],
    `/api/organizations/${organization.id}/futsal/seasons/${season.id}/entries?q=${encodeURIComponent(search)}`,
  );
  useFutsalPrivacyGuard(list.error);
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [],
    fatal =
      list.isError && (!list.isFetchNextPageError || isDenied(list.error));
  return (
    <>
      <div className="directory-heading">
        <div>
          <h1 data-page-heading tabIndex={-1}>
            {m.futsal_entries_tab()}
          </h1>
          <p>
            {m.futsal_progress({
              count: String(season.entryCount),
              total: String(season.settings.entryCount),
            })}
          </p>
        </div>
        {season.status === "draft" && (
          <Button
            disabled={season.entryCount >= season.settings.entryCount}
            onClick={() => setEdit({ season })}
          >
            <Plus aria-hidden="true" />
            {m.futsal_add_entry()}
          </Button>
        )}
      </div>
      <div className="directory-toolbar">
        <Label>
          <Search aria-hidden="true" size={18} />
          <span className="sr-only">{m.directory_search()}</span>
          <Input
            type="search"
            placeholder={m.directory_search()}
            maxLength={80}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Label>
      </div>
      {list.isPending ? (
        <ListSkeleton />
      ) : fatal ? (
        <PointsError
          error={list.error}
          retry={() => void list.refetch()}
          pending={list.isFetching}
        />
      ) : (
        <>
          <ul className="directory-list futsal-entry-list">
            {rows.map((e) => (
              <li key={e.id}>
                <div>
                  <h2>{e.name}</h2>
                  <p>
                    <Users aria-hidden="true" size={16} />
                    {e.members
                      .map(
                        (p) =>
                          p.name +
                          (p.archived ? " · " + m.futsal_archived() : ""),
                      )
                      .join(", ")}
                  </p>
                </div>
                {season.status === "draft" && (
                  <div className="directory-actions">
                    <Button
                      variant="outline"
                      onClick={() => setEdit({ season, entry: e })}
                    >
                      <Pencil aria-hidden="true" />
                      {m.futsal_edit_entry()}
                    </Button>
                    <ItemActions
                      name={e.name}
                      actions={[
                        {
                          label: m.futsal_remove(),
                          icon: Trash2,
                          destructive: true,
                          onSelect: () => setRemove({ season, entry: e }),
                        },
                      ]}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!rows.length ? (
            <p className="directory-empty">{m.futsal_none_entries()}</p>
          ) : (
            <InfiniteFooter
              {...list}
              fetchNextPage={() => list.fetchNextPage({ cancelRefetch: false })}
            />
          )}
        </>
      )}
      {edit && (
        <EntryEditor
          organizationId={organization.id}
          userId={userId}
          {...edit}
          onClose={() => setEdit(null)}
        />
      )}
      {remove && (
        <SeasonAction
          organizationId={organization.id}
          userId={userId}
          {...remove}
          action="remove"
          onClose={() => setRemove(null)}
        />
      )}
    </>
  );
}
function SettingsSummary({ season }: { season: FutsalSeason }) {
  const s = season.settings,
    labels = numericLabels(),
    numeric = [
      "entryCount",
      s.mode === "team_league" ? "playersPerTeam" : "squadSize",
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
      ...(s.format === "league"
        ? ["legs", "winPoints", "drawPoints", "lossPoints"]
        : []),
    ] as (keyof ReturnType<typeof numericLabels>)[];
  return (
    <section className="settings-panel futsal-settings-summary">
      <h2>{m.futsal_settings_tab()}</h2>
      <dl className="settings-details">
        <div>
          <dt>{m.futsal_mode()}</dt>
          <dd>{modeText(s)}</dd>
        </div>
        <div>
          <dt>{m.futsal_format()}</dt>
          <dd>{formatText(s)}</dd>
        </div>
        {numeric.map((key) => (
          <div key={key}>
            <dt>{labels[key]}</dt>
            <dd>{s[key]}</dd>
          </div>
        ))}
        <div>
          <dt>{m.futsal_between()}</dt>
          <dd>{s.trainingBetweenRounds ? m.futsal_yes() : m.futsal_no()}</dd>
        </div>
        {s.format === "tournament" && (
          <div>
            <dt>{m.futsal_draw_policy()}</dt>
            <dd>
              {s.drawPolicy === "seeded_draw"
                ? m.futsal_seeded()
                : m.futsal_entry_order()}
            </dd>
          </div>
        )}
      </dl>
      <p>
        {s.format === "league" ? m.futsal_tiebreak() : m.futsal_knockout_help()}
      </p>
      <p>{m.futsal_points_help()}</p>
      <h3>{m.futsal_prize()}</h3>
      <p className="challenge-description">
        {season.prizeCriteria || m.futsal_no_prize()}
      </p>
    </section>
  );
}
function Review({
  organization,
  userId,
  season,
}: {
  organization: Organization;
  userId: string;
  season: FutsalSeason;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [action, setAction] = useState<{
    action: "prepare" | "cancel";
    season: FutsalSeason;
  } | null>(null);
  const preview = useQuery({
    queryKey: [
      ...futsalKey(userId, organization.id),
      "preview",
      season.id,
      season.version,
    ],
    queryFn: ({ signal }) =>
      directoryRequest<{
        plan: FutsalPlan;
        entries: FutsalEntry[];
        ready: boolean;
        problems: string[];
      }>(
        `/api/organizations/${organization.id}/futsal/seasons/${season.id}/preview`,
        { signal },
      ),
    retry: false,
  });
  useFutsalPrivacyGuard(preview.error);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [preview.data]);
  if (preview.isPending) return <ListSkeleton />;
  if (preview.isError)
    return (
      <PointsError
        error={preview.error}
        retry={() => void preview.refetch()}
        pending={preview.isFetching}
      />
    );
  const data = preview.data,
    zone = season.settings.timezone;
  const names = new Map(data.entries.map((e) => [e.id, e.name]));
  const opponent = (o: Opponent) =>
    "entryId" in o
      ? (names.get(o.entryId) ??
        m.futsal_slot({
          number: String(Number(o.entryId.replace("slot-", "")) + 1),
        }))
      : m.futsal_winner({ match: o.winnerOf });
  return (
    <>
      <div className="directory-heading futsal-detail-heading">
        <div>
          <h1 ref={titleRef} data-page-heading tabIndex={-1}>
            {season.name}
          </h1>
          <p>
            {modeText(season.settings)} · {formatText(season.settings)}
          </p>
          <span className="badge">
            {season.status === "prepared" && season.gameStatus
              ? season.gameStatus === "completed"
                ? m.game_completed()
                : m.game_active()
              : statusText(season.status)}
          </span>
        </div>
        {season.status !== "cancelled" && (
          <ItemActions
            name={season.name}
            actions={[
              {
                label: m.futsal_cancel(),
                icon: Trash2,
                destructive: true,
                onSelect: () => setAction({ action: "cancel", season }),
              },
            ]}
          />
        )}
      </div>
      <section className="settings-panel">
        <p>
          {season.status === "prepared"
            ? m.futsal_locked_help()
            : season.status === "draft"
              ? m.futsal_draft_help()
              : season.cancelReason}
        </p>
        {season.description && (
          <p className="challenge-description">{season.description}</p>
        )}
        <dl className="settings-details">
          {[
            [m.futsal_preparation(), season.settings.preparationStartsAt],
            [m.futsal_start(), season.settings.startsAt],
            [m.futsal_end(), season.settings.endsAt],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{stamp(value!, zone)}</dd>
            </div>
          ))}
        </dl>
        <p>{m.activities_timezone({ timezone: zone })}</p>
        <p>
          {m.futsal_progress({
            count: String(season.entryCount),
            total: String(season.settings.entryCount),
          })}
        </p>
        {season.status === "draft" && (
          <>
            {data.problems.map((code) => (
              <PointsError key={code} error={new DirectoryError(code)} />
            ))}
            <Button
              disabled={!data.ready}
              onClick={() => setAction({ action: "prepare", season })}
            >
              <LockKeyhole aria-hidden="true" />
              {m.futsal_lock()}
            </Button>
          </>
        )}
      </section>
      <Accordion type="multiple" className="futsal-review-accordion">
        <AccordionItem value="settings">
          <AccordionTrigger>{m.futsal_settings_tab()}</AccordionTrigger>
          <AccordionContent>
            <SettingsSummary season={season} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <section className="settings-panel futsal-plan">
        <h2>{m.futsal_plan()}</h2>
        <p>
          {m.futsal_schedule_counts({
            rounds: String(data.plan.rounds.length),
            matches: String(data.plan.matchCount),
            trainings: String(data.plan.trainingAt.length),
          })}
        </p>
        <Accordion type="multiple">
          {data.plan.rounds.map((round) => (
            <AccordionItem key={round.number} value={String(round.number)}>
              <AccordionTrigger>
                <span>
                  {m.futsal_round({ number: round.number })}
                  <small>{stamp(round.at, zone)}</small>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul>
                  {round.matches.map((match) => (
                    <li key={match.id}>
                      <span>{opponent(match.home)}</span>
                      <span>{match.away ? "–" : "·"}</span>
                      <span>
                        {match.away ? opponent(match.away) : m.futsal_bye()}
                      </span>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
          <AccordionItem value="training">
            <AccordionTrigger>{m.futsal_training_dates()}</AccordionTrigger>
            <AccordionContent>
              <ol>
                {data.plan.trainingAt.map((at) => (
                  <li key={at}>{stamp(at, zone)}</li>
                ))}
              </ol>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
      {action && (
        <SeasonAction
          organizationId={organization.id}
          userId={userId}
          {...action}
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}
