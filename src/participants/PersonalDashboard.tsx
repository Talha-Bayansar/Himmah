import { Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { ClaimDialog } from "../coupons/ClaimDialog";
import { Button } from "../components/ui/button";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Gift, Coins, Ticket } from "lucide-react";
import { Input } from "../components/ui/input";
import {
  ListSkeleton,
  InfiniteFooter,
} from "../components/shared/infinite-list";
import {
  directoryRequest,
  useDirectoryPages,
  DirectoryError,
} from "../community/client";
import { PointsError } from "../points/PointsShared";
import { WalletValues, pointsNumber } from "../rewards/RewardWallet";
import { useLocale } from "../localization/locale";
import { getLocale } from "../paraglide/runtime.js";
import { m } from "../paraglide/messages.js";
import type { Organization } from "../organization/contracts";
import type {
  ParticipantSummary,
  PersonalPoints,
  PersonalReward,
  PersonalRedemption,
} from "./contracts";
const blocked = (q: { isError: boolean; error: unknown }) =>
  q.isError &&
  q.error instanceof DirectoryError &&
  ["forbidden", "not_found", "sign_in"].includes(q.error.code);
export default function PersonalDashboard({
  organization,
  userId,
  view = "home",
}: {
  organization: Organization;
  userId: string;
  view?: "home" | "rewards" | "redemptions";
}) {
  useLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  const [claim, setClaim] = useState<PersonalReward | null>(null);
  const [search, setSearch] = useState(""),
    [q, setQ] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const scope = ["organization", userId, organization.id, "personal"],
    base = "/api/organizations/" + organization.id + "/me";
  const summary = useQuery({
    queryKey: [...scope, "summary"],
    queryFn: ({ signal }) =>
      directoryRequest<{ item: ParticipantSummary }>(base, { signal }),
  });
  const points = useDirectoryPages<PersonalPoints>(
    [...scope, "points"],
    base + "/points",
    { enabled: summary.isSuccess && view === "home" },
  );
  const rewards = useDirectoryPages<PersonalReward>(
    [...scope, "rewards", q],
    base + "/rewards?q=" + encodeURIComponent(q),
    { enabled: summary.isSuccess && view === "rewards" },
  );
  const history = useDirectoryPages<PersonalRedemption>(
    [...scope, "redemptions", q],
    base + "/redemptions?q=" + encodeURIComponent(q),
    { enabled: summary.isSuccess && view === "redemptions" },
  );
  useEffect(() => {
    if (summary.isSuccess) heading.current?.focus({ preventScroll: true });
  }, [view, organization.id, summary.isSuccess]);
  const resource =
    view === "home" ? points : view === "rewards" ? rewards : history;
  const stamp = (value: string) =>
    new Intl.DateTimeFormat(getLocale(), {
      dateStyle: "medium",
      timeZone: organization.timezone,
    }).format(new Date(value));
  if (summary.isPending) return <ListSkeleton />;
  if (summary.isError || blocked(resource))
    return (
      <PointsError
        error={summary.error ?? resource.error}
        pending={summary.isFetching || resource.isFetching}
        retry={() => {
          void summary.refetch();
          void resource.refetch();
        }}
      />
    );
  return (
    <section className="directory personal-dashboard">
      <Button variant="outline" asChild>
        <Link
          reloadDocument
          to="/futsal/$organizationId"
          params={{ organizationId: organization.id }}
        >
          <Trophy aria-hidden="true" />
          {m.futsal_title()}
        </Link>
      </Button>
      <div className="directory-heading">
        <div>
          <h1 ref={heading} tabIndex={-1} data-page-heading>
            {view === "home"
              ? m.participant_home()
              : view === "rewards"
                ? m.rewards_title()
                : m.rewards_history()}
          </h1>
          <p>
            {view === "home"
              ? m.participant_welcome({ organization: organization.name })
              : view === "rewards"
                ? m.participant_rewards_help()
                : m.participant_history_help()}
          </p>
        </div>
      </div>
      {view === "home" && (
        <section className="reward-wallet-panel">
          <h2>{summary.data.item.name}</h2>
          <WalletValues wallet={summary.data.item} />
          <p className="reward-help">{m.participant_points_help()}</p>
        </section>
      )}
      {view !== "home" && (
        <div className="directory-toolbar">
          <label>
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">{m.directory_search()}</span>
            <Input
              type="search"
              maxLength={80}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={m.directory_search()}
            />
          </label>
        </div>
      )}
      {view === "home" && (
        <h2 className="points-history-heading">{m.points_history()}</h2>
      )}
      {resource.isPending ? (
        <ListSkeleton />
      ) : resource.isError && !resource.isFetchNextPageError ? (
        <PointsError
          error={resource.error}
          pending={resource.isFetching}
          retry={() => void resource.refetch()}
        />
      ) : (
        <>
          <ul className="directory-list personal-list">
            {view === "home"
              ? points.data?.pages
                  .flatMap((page) => page.items)
                  .map((entry) => (
                    <li key={entry.id}>
                      <div className="personal-record-heading">
                        <Coins aria-hidden="true" />
                        <strong>
                          {entry.isAdjustment
                            ? m.points_adjustment()
                            : entry.source === "challenge"
                              ? m.challenge_points()
                              : entry.source === "attendance"
                                ? m.earning_source()
                                : m.participant_points_manual()}
                        </strong>
                        <span className="personal-amount">
                          {entry.amount > 0 ? "+" : ""}
                          {pointsNumber(entry.amount)}
                        </span>
                      </div>
                      <p>{stamp(entry.occurredAt)}</p>
                      {!entry.isAdjustment &&
                        entry.currentAmount !== entry.amount && (
                          <p>
                            {m.points_current({ amount: entry.currentAmount })}
                          </p>
                        )}
                    </li>
                  ))
              : view === "rewards"
                ? rewards.data?.pages
                    .flatMap((page) => page.items)
                    .map((reward) => (
                      <li key={reward.id}>
                        <div className="personal-record-heading">
                          <Gift aria-hidden="true" />
                          <strong>{reward.name}</strong>
                        </div>
                        <p className="personal-price">
                          {m.rewards_points({
                            amount: pointsNumber(reward.cost),
                          })}
                        </p>
                        {reward.description && (
                          <p className="reward-description">
                            {reward.description}
                          </p>
                        )}
                        <span className="badge">
                          {!reward.inStock
                            ? m.participant_out_stock()
                            : reward.eligible
                              ? m.participant_afford()
                              : m.participant_not_enough()}
                        </span>
                        <Button
                          className="coupon-redeem-button"
                          disabled={!reward.eligible || !reward.inStock}
                          onClick={() => setClaim(reward)}
                        >
                          <Gift aria-hidden="true" />
                          {m.coupon_redeem()}
                        </Button>
                      </li>
                    ))
                : history.data?.pages
                    .flatMap((page) => page.items)
                    .map((item) => (
                      <li key={item.id}>
                        <div className="personal-record-heading">
                          <Ticket aria-hidden="true" />
                          <strong>{item.rewardName}</strong>
                        </div>
                        <p>
                          {m.rewards_points({
                            amount: pointsNumber(item.cost),
                          })}{" "}
                          · {stamp(item.createdAt)}
                        </p>
                        <span className="badge">
                          {m[`rewards_${item.status}`]()}
                        </span>
                        {item.fulfilledAt && <p>{stamp(item.fulfilledAt)}</p>}
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
      {claim && (
        <ClaimDialog
          reward={claim}
          organizationId={organization.id}
          userId={userId}
          onClose={() => {
            setClaim(null);
            void rewards.refetch();
          }}
        />
      )}
    </section>
  );
}
