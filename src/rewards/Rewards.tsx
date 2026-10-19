import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Search,
  ScanLine,
  Gift,
  Pencil,
  Archive,
  ArchiveRestore,
  Check,
  Undo2,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { ItemActions } from "../components/shared/item-actions";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { useConfirmation } from "../components/shared/confirmation";
import {
  directoryRequest,
  useDirectoryPages,
  DirectoryError,
} from "../community/client";
import { PointsError } from "../points/PointsShared";
import { useLocale } from "../localization/locale";
import { getLocale } from "../paraglide/runtime.js";
import { m } from "../paraglide/messages.js";
import type { Organization } from "../organization/contracts";
import type { Reward, RewardMember, Redemption } from "./contracts";
import { RewardEditor } from "./RewardEditor";
import { RedemptionEditor } from "./RedemptionEditor";
import { pointsNumber } from "./RewardWallet";
const failed = (q: {
  isError: boolean;
  isFetchNextPageError?: boolean;
  error: unknown;
}) =>
  q.isError &&
  (!q.isFetchNextPageError ||
    (q.error instanceof DirectoryError &&
      ["forbidden", "not_found", "sign_in"].includes(q.error.code)));
export default function Rewards({
  organization,
  userId,
  rewardId = null,
  view = "members",
}: {
  organization: Organization;
  userId: string;
  rewardId?: string | null;
  view?: "members" | "redemptions";
}) {
  useLocale();
  const client = useQueryClient(),
    confirm = useConfirmation(),
    base = "/api/organizations/" + organization.id + "/rewards",
    scope = ["organization", userId, organization.id, "rewards"];
  const [search, setSearch] = useState(""),
    [q, setQ] = useState(""),
    [archived, setArchived] = useState(false),
    [eligible, setEligible] = useState(true),
    [status, setStatus] = useState("all"),
    [editor, setEditor] = useState<Reward | "new" | null>(null),
    [action, setAction] = useState<
      | { mode: "reserve"; person: RewardMember }
      | { mode: "fulfilled" | "cancelled"; redemption: Redemption }
      | null
    >(null);
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const detail = useQuery({
    queryKey: [...scope, "detail", rewardId],
    enabled: !!rewardId,
    queryFn: ({ signal }) =>
      directoryRequest<{ item: Reward }>(base + "/" + rewardId, { signal }),
  });
  const list = useDirectoryPages<Reward>(
    [...scope, "list", q, archived],
    base + "?q=" + encodeURIComponent(q) + "&archived=" + archived,
    { enabled: !rewardId },
  );
  const members = useDirectoryPages<RewardMember>(
    [...scope, "members", rewardId, q, eligible],
    base +
      "/" +
      rewardId +
      "/members?q=" +
      encodeURIComponent(q) +
      "&eligible=" +
      eligible,
    {
      enabled:
        !!rewardId && !!detail.data && !detail.isError && view === "members",
    },
  );
  const history = useDirectoryPages<Redemption>(
    [...scope, "redemptions", rewardId, q, status],
    base +
      "/" +
      rewardId +
      "/redemptions?q=" +
      encodeURIComponent(q) +
      "&status=" +
      status,
    {
      enabled:
        !!rewardId &&
        !!detail.data &&
        !detail.isError &&
        view === "redemptions",
    },
  );
  const refresh = () =>
    client.invalidateQueries({
      queryKey: ["organization", userId, organization.id],
    });
  const archive = useMutation({
    mutationFn: (reward: Reward) =>
      directoryRequest(base + "/" + reward.id, {
        method: "PATCH",
        body: JSON.stringify({
          action: "archive",
          archived: !reward.archived,
          version: reward.version,
        }),
      }),
    onSettled: refresh,
  });
  const menu = (reward: Reward) => [
    {
      label: m.rewards_edit(),
      icon: Pencil,
      onSelect: () => setEditor(reward),
    },
    {
      label: reward.archived ? m.directory_restore() : m.directory_archive(),
      icon: reward.archived ? ArchiveRestore : Archive,
      destructive: !reward.archived,
      onSelect: async () => {
        if (
          await confirm({
            title: reward.archived
              ? m.directory_restore()
              : m.directory_archive(),
            description: reward.archived
              ? m.rewards_restore_help()
              : m.rewards_archive_help(),
            confirmLabel: reward.archived
              ? m.directory_restore()
              : m.directory_archive(),
            destructive: !reward.archived,
          })
        )
          await archive.mutateAsync(reward).catch(() => {});
      },
    },
  ];
  const stock = (reward: Reward) =>
    reward.stock === null
      ? m.rewards_unlimited()
      : m.rewards_remaining({ count: Math.max(0, reward.stock - reward.used) });
  const stamp = (v: string) =>
    new Intl.DateTimeFormat(getLocale(), {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: organization.timezone,
    }).format(new Date(v));
  const resource = rewardId ? (view === "members" ? members : history) : list;
  return (
    <section className="directory rewards-page">
      {rewardId && (
        <Button variant="link" asChild className="settings-back">
          <Link
            to="/workspace/$organizationId/$section"
            params={{
              organizationId: organization.id,
              section: "rewards",
            }}
          >
            <ArrowLeft aria-hidden="true" />
            {m.rewards_title()}
          </Link>
        </Button>
      )}
      {rewardId ? (
        detail.isPending ? (
          <ListSkeleton />
        ) : detail.isError ? (
          <PointsError
            error={detail.error}
            pending={detail.isFetching}
            retry={() => void detail.refetch()}
          />
        ) : (
          <>
            <div className="directory-heading reward-detail-heading">
              <div>
                <h1 tabIndex={-1} data-page-heading>
                  {detail.data.item.name}
                </h1>
                <p>
                  {m.rewards_points({
                    amount: pointsNumber(detail.data.item.cost),
                  })}{" "}
                  · {stock(detail.data.item)}
                </p>
                {detail.data.item.archived && <p>{m.rewards_archived()}</p>}
              </div>
              <ItemActions
                name={detail.data.item.name}
                actions={menu(detail.data.item)}
                pending={archive.isPending}
              />
            </div>
            {detail.data.item.description && (
              <p className="reward-description">
                {detail.data.item.description}
              </p>
            )}
            <nav className="reward-tabs" aria-label={m.rewards_title()}>
              {(["members", "redemptions"] as const).map((tab) => (
                <Button
                  key={tab}
                  variant={view === tab ? "default" : "outline"}
                  asChild
                >
                  <Link
                    to="/workspace/$organizationId/rewards/$rewardId"
                    params={{ organizationId: organization.id, rewardId }}
                    search={{ view: tab }}
                    aria-current={view === tab ? "page" : undefined}
                  >
                    {tab === "members" ? (
                      <Gift aria-hidden="true" />
                    ) : (
                      <Check aria-hidden="true" />
                    )}
                    {tab === "members"
                      ? m.rewards_members()
                      : m.rewards_history()}
                  </Link>
                </Button>
              ))}
            </nav>
          </>
        )
      ) : (
        <div className="directory-heading">
          <div>
            <h1 tabIndex={-1} data-page-heading>
              {m.rewards_title()}
            </h1>
            <p>{m.rewards_help()}</p>
          </div>
          <Button onClick={() => setEditor("new")}>
            <Plus aria-hidden="true" />
            {m.rewards_create()}
          </Button>
        </div>
      )}
      {!rewardId && (
        <Button variant="outline" className="coupon-scan-link" asChild>
          <Link
            to="/workspace/$organizationId/$section"
            params={{ organizationId: organization.id, section: "collect" }}
          >
            <ScanLine aria-hidden="true" />
            {m.coupon_collect_title()}
          </Link>
        </Button>
      )}
      {archive.isError && <PointsError error={archive.error} />}
      {(!rewardId || (!!detail.data && !detail.isError)) && (
        <>
          <div className="directory-toolbar">
            <label>
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">{m.directory_search()}</span>
              <Input
                type="search"
                value={search}
                maxLength={80}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={m.directory_search()}
              />
            </label>
            {!rewardId ? (
              <label className="directory-archived">
                <Checkbox
                  checked={archived}
                  onCheckedChange={(v) => setArchived(v === true)}
                />
                <span>{m.directory_show_archived()}</span>
              </label>
            ) : view === "members" ? (
              <label className="directory-archived">
                <Checkbox
                  checked={eligible}
                  onCheckedChange={(v) => setEligible(v === true)}
                />
                <span>{m.rewards_eligible_only()}</span>
              </label>
            ) : (
              <label className="reward-status">
                <span className="sr-only">{m.rewards_status()}</span>
                <NativeSelect
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  aria-label={m.rewards_status()}
                >
                  {(["all", "pending", "fulfilled", "cancelled"] as const).map(
                    (s) => (
                      <NativeSelectOption key={s} value={s}>
                        {s === "all" ? m.rewards_all() : m[`rewards_${s}`]()}
                      </NativeSelectOption>
                    ),
                  )}
                </NativeSelect>
              </label>
            )}
          </div>
          {resource.isPending ? (
            <ListSkeleton />
          ) : failed(resource) ? (
            <PointsError
              error={resource.error}
              pending={resource.isFetching}
              retry={() => void resource.refetch()}
            />
          ) : (
            <>
              <ul className="directory-list reward-list">
                {!rewardId
                  ? list.data?.pages
                      .flatMap((p) => p.items)
                      .map((reward) => (
                        <li key={reward.id}>
                          <div className="reward-record">
                            <Gift aria-hidden="true" />
                            <div>
                              <strong>{reward.name}</strong>
                              <p>
                                {m.rewards_points({
                                  amount: pointsNumber(reward.cost),
                                })}{" "}
                                · {stock(reward)}
                              </p>
                            </div>
                          </div>
                          <div className="directory-actions">
                            <Button variant="outline" asChild>
                              <Link
                                to="/workspace/$organizationId/rewards/$rewardId"
                                params={{
                                  organizationId: organization.id,
                                  rewardId: reward.id,
                                }}
                                search={{ view: "members" }}
                              >
                                <ArrowRight aria-hidden="true" />
                                {m.rewards_view()}
                              </Link>
                            </Button>
                            <ItemActions
                              name={reward.name}
                              disabled={archive.isPending}
                              actions={menu(reward)}
                              pending={
                                archive.isPending &&
                                archive.variables?.id === reward.id
                              }
                            />
                          </div>
                        </li>
                      ))
                  : view === "members"
                    ? members.data?.pages
                        .flatMap((p) => p.items)
                        .map((person) => (
                          <li key={person.id}>
                            <div>
                              <strong>{person.name}</strong>
                              <p>
                                {m.rewards_available()}:{" "}
                                {pointsNumber(person.available)}
                              </p>
                              {!person.eligible && (
                                <small>{m.rewards_ineligible()}</small>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              disabled={!person.eligible}
                              onClick={() =>
                                setAction({ mode: "reserve", person })
                              }
                            >
                              <Gift aria-hidden="true" />
                              {m.rewards_reserve()}
                            </Button>
                          </li>
                        ))
                    : history.data?.pages
                        .flatMap((p) => p.items)
                        .map((row) => (
                          <li key={row.id} className="reward-redemption">
                            <div className="reward-redemption-heading">
                              <div>
                                <strong>{row.personName}</strong>
                                <p>
                                  {row.rewardName} ·{" "}
                                  {m.rewards_points({
                                    amount: pointsNumber(row.cost),
                                  })}
                                </p>
                              </div>
                              <span className="badge">
                                {m[`rewards_${row.status}`]()}
                              </span>
                            </div>
                            <p>
                              {m.rewards_by({
                                date: stamp(row.createdAt),
                                name: row.createdByName || m.points_actor(),
                              })}
                            </p>
                            {row.fulfilledAt && (
                              <p>
                                {m.rewards_fulfilled()} ·{" "}
                                {m.rewards_by({
                                  date: stamp(row.fulfilledAt),
                                  name: row.fulfilledByName || m.points_actor(),
                                })}
                              </p>
                            )}
                            {row.cancelledAt && (
                              <>
                                <p>
                                  {m.rewards_cancelled()} ·{" "}
                                  {m.rewards_by({
                                    date: stamp(row.cancelledAt),
                                    name:
                                      row.cancelledByName || m.points_actor(),
                                  })}
                                </p>
                                <p className="reward-reason">
                                  {row.cancelReason === "participant_cancelled"
                                    ? m.coupon_cancelled_by_holder()
                                    : row.cancelReason}
                                </p>
                              </>
                            )}
                            {row.status === "pending" && (
                              <div className="directory-actions">
                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    setAction({
                                      mode: "fulfilled",
                                      redemption: row,
                                    })
                                  }
                                >
                                  <Check aria-hidden="true" />
                                  {m.rewards_fulfil()}
                                </Button>
                                <ItemActions
                                  name={row.personName}
                                  actions={[
                                    {
                                      label: m.rewards_cancel(),
                                      icon: Undo2,
                                      destructive: true,
                                      onSelect: () =>
                                        setAction({
                                          mode: "cancelled",
                                          redemption: row,
                                        }),
                                    },
                                  ]}
                                />
                              </div>
                            )}
                          </li>
                        ))}
              </ul>
              {resource.data?.pages[0]?.items.length === 0 ? (
                <p className="directory-empty">{m.rewards_empty()}</p>
              ) : (
                <InfiniteFooter
                  {...resource}
                  fetchNextPage={() =>
                    resource.fetchNextPage({ cancelRefetch: false })
                  }
                />
              )}
            </>
          )}
        </>
      )}
      {editor && (
        <RewardEditor
          path={base}
          {...(editor === "new" ? {} : { reward: editor })}
          onClose={() => {
            setEditor(null);
            void refresh();
          }}
          onSaved={async () => {
            setEditor(null);
            await refresh();
          }}
        />
      )}
      {action && detail.data && !detail.isError && (
        <RedemptionEditor
          base={base}
          reward={detail.data.item}
          {...action}
          onClose={() => {
            setAction(null);
            void refresh();
          }}
          onSaved={async () => {
            setAction(null);
            await refresh();
          }}
        />
      )}
    </section>
  );
}
