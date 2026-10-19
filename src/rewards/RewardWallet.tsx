import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Gift } from "lucide-react";
import { Button } from "../components/ui/button";
import { ListSkeleton } from "../components/shared/infinite-list";
import { directoryRequest } from "../community/client";
import { PointsError } from "../points/PointsShared";
import { getLocale } from "../paraglide/runtime.js";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
export const pointsNumber = (value: string | number) =>
  new Intl.NumberFormat(getLocale()).format(BigInt(value));
export function WalletValues({
  wallet,
}: {
  wallet: {
    earned: string;
    reserved: string;
    spent: string;
    available: string;
  };
}) {
  return (
    <>
      <dl className="reward-wallet">
        {(["earned", "reserved", "spent", "available"] as const).map((key) => (
          <div key={key}>
            <dt>{m[`rewards_${key}`]()}</dt>
            <dd>{pointsNumber(wallet[key])}</dd>
          </div>
        ))}
      </dl>
      {BigInt(wallet.available) < 0 && (
        <p role="status" className="reward-help">
          {m.rewards_deficit()}
        </p>
      )}
    </>
  );
}
export function RewardWallet({
  organizationId,
  userId,
  memberId,
}: {
  organizationId: string;
  userId: string;
  memberId: string;
}) {
  useLocale();
  const query = useQuery({
    queryKey: [
      "organization",
      userId,
      organizationId,
      "rewards",
      "wallet",
      memberId,
    ],
    queryFn: ({ signal }) =>
      directoryRequest<{
        item: {
          earned: string;
          reserved: string;
          spent: string;
          available: string;
        };
      }>(
        "/api/organizations/" + organizationId + "/reward-wallet/" + memberId,
        { signal },
      ),
  });
  return (
    <section className="reward-wallet-panel">
      <h2>{m.rewards_title()}</h2>
      <p className="reward-help">{m.rewards_wallet_help()}</p>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <PointsError
          error={query.error}
          pending={query.isFetching}
          retry={() => void query.refetch()}
        />
      ) : (
        <WalletValues wallet={query.data.item} />
      )}
      <Button variant="outline" asChild>
        <Link
          to="/workspace/$organizationId/$section"
          params={{ organizationId, section: "rewards" }}
        >
          <Gift aria-hidden="true" />
          {m.rewards_title()}
        </Link>
      </Button>
    </section>
  );
}
