import { RouteTabs } from "../components/shared/route-tabs";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, ArrowRight, Ticket, X, Copy, Search } from "lucide-react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { ActionButton } from "../components/shared/action-button";
import { useConfirmation } from "../components/shared/confirmation";
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
import { pointsNumber } from "../rewards/RewardWallet";
import { useLocale } from "../localization/locale";
import { getLocale } from "../paraglide/runtime.js";
import { m } from "../paraglide/messages.js";
import type { Organization } from "../organization/contracts";
import type { Coupon } from "./contracts";
const denied = (error: unknown) =>
  error instanceof DirectoryError &&
  ["forbidden", "not_found", "sign_in"].includes(error.code);
export default function MyCoupons({
  organization,
  userId,
  couponId,
  status = "pending",
}: {
  organization: Organization;
  userId: string;
  couponId?: string | null;
  status?: "pending" | "all";
}) {
  useLocale();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const client = useQueryClient(),
    confirm = useConfirmation(),
    heading = useRef<HTMLHeadingElement>(null);
  const [search, setSearch] = useState(""),
    [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const base = `/api/organizations/${organization.id}/me/coupons`,
    scope = ["organization", userId, organization.id, "coupons"];
  const list = useDirectoryPages<Coupon>(
    [...scope, "list", status, q],
    base + "?status=" + status + "&q=" + encodeURIComponent(q),
    { enabled: !couponId },
  );
  const detail = useQuery({
    queryKey: [...scope, "detail", couponId],
    queryFn: ({ signal }) =>
      directoryRequest<{ item: Coupon }>(base + "/" + couponId, { signal }),
    enabled: !!couponId,
  });
  const row = detail.data?.item;
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [couponId, status, detail.isSuccess]);
  const cancel = useMutation({
    mutationFn: (version: number) =>
      directoryRequest<{ item: Coupon }>(base + "/" + couponId, {
        method: "PATCH",
        body: JSON.stringify({ action: "cancelled", version }),
      }),
    onSuccess: async (data) => {
      client.setQueryData([...scope, "detail", couponId], data);
      await client.invalidateQueries({
        queryKey: ["organization", userId, organization.id],
      });
    },
    onError: () => {
      void detail.refetch();
    },
  });
  const copied = useMutation({
    mutationFn: (code: string) => navigator.clipboard.writeText(code),
  });
  const stamp = (value: string) =>
    new Intl.DateTimeFormat(getLocale(), {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: organization.timezone,
    }).format(new Date(value));
  if (couponId)
    return (
      <section className="directory coupon-page">
        <Button variant="link" className="settings-back" asChild>
          <Link
            to="/workspace/$organizationId/my-coupons"
            params={{ organizationId: organization.id }}
            search={{ status: "pending" }}
          >
            <ArrowLeft aria-hidden="true" />
            {m.coupons_title()}
          </Link>
        </Button>
        {detail.isPending ? (
          <ListSkeleton />
        ) : detail.isError || denied(cancel.error) ? (
          <PointsError
            error={detail.error ?? cancel.error}
            pending={detail.isFetching}
            retry={() => {
              cancel.reset();
              void detail.refetch();
            }}
          />
        ) : (
          row && (
            <>
              <div className="directory-heading">
                <div>
                  <h1 ref={heading} tabIndex={-1} data-page-heading>
                    {row.rewardName}
                  </h1>
                  <p>{m.rewards_points({ amount: pointsNumber(row.cost) })}</p>
                </div>
              </div>
              <section className="settings-panel coupon-detail">
                <span className="badge">{m[`rewards_${row.status}`]()}</span>
                <p>{m.coupon_reserved_on({ date: stamp(row.createdAt) })}</p>
                {row.status === "pending" && row.code ? (
                  <>
                    <div className="coupon-qr">
                      <QRCodeSVG
                        value={`${origin}/workspace/${organization.id}/collect#${row.code}`}
                        size={240}
                        marginSize={4}
                        level="M"
                        role="img"
                        title={m.coupon_qr_label()}
                      />
                    </div>
                    <p>{m.coupon_show_help()}</p>
                    <ActionButton
                      variant="outline"
                      pending={copied.isPending}
                      onClick={() =>
                        copied.mutate(
                          `${origin}/workspace/${organization.id}/collect#${row.code}`,
                        )
                      }
                    >
                      <Copy aria-hidden="true" />
                      {copied.isSuccess
                        ? m.directory_copied()
                        : m.coupon_copy()}
                    </ActionButton>
                    {copied.isError && (
                      <p role="alert">{m.directory_copy_manual()}</p>
                    )}
                    <label className="coupon-code-label">
                      {m.coupon_code()}
                      <Input
                        readOnly
                        value={row.code}
                        onFocus={(e) => e.target.select()}
                        autoComplete="off"
                      />
                    </label>
                    <ActionButton
                      variant="outline"
                      pending={cancel.isPending}
                      disabled={detail.isFetching}
                      onClick={async () => {
                        if (
                          await confirm({
                            title: m.coupon_cancel(),
                            description: m.coupon_cancel_help(),
                            confirmLabel: m.coupon_cancel(),
                            destructive: true,
                          })
                        )
                          cancel.mutate(row.version);
                      }}
                    >
                      <X aria-hidden="true" />
                      {m.coupon_cancel()}
                    </ActionButton>
                  </>
                ) : (
                  <p role="status">
                    {row.status === "fulfilled"
                      ? m.coupon_used()
                      : row.status === "cancelled"
                        ? m.coupon_cancelled()
                        : m.coupon_unavailable()}
                  </p>
                )}
                {row.fulfilledAt && <p>{stamp(row.fulfilledAt)}</p>}
                {row.cancelledAt && <p>{stamp(row.cancelledAt)}</p>}
              </section>
              {cancel.isError && !denied(cancel.error) && (
                <PointsError error={cancel.error} />
              )}
            </>
          )
        )}
      </section>
    );
  const failed =
    list.isError && (!list.isFetchNextPageError || denied(list.error));
  return (
    <section className="directory coupon-page">
      <div className="directory-heading">
        <div>
          <h1 ref={heading} tabIndex={-1} data-page-heading>
            {m.coupons_title()}
          </h1>
          <p>{m.coupons_intro()}</p>
        </div>
      </div>
      <RouteTabs aria-label={m.coupons_title()}>
        {(["pending", "all"] as const).map((tab) => (
          <Link
            key={tab}
            to="/workspace/$organizationId/my-coupons"
            params={{ organizationId: organization.id }}
            search={{ status: tab }}
            aria-current={status === tab ? "page" : undefined}
          >
            {tab === "pending" ? m.coupons_available() : m.coupons_history()}
          </Link>
        ))}
      </RouteTabs>
      <div className="directory-toolbar">
        <label>
          <Search aria-hidden="true" size={17} />
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
      {list.isPending ? (
        <ListSkeleton />
      ) : failed ? (
        <PointsError
          error={list.error}
          retry={() => void list.refetch()}
          pending={list.isFetching}
        />
      ) : (
        <>
          <ul className="directory-list coupon-list">
            {list.data?.pages
              .flatMap((p) => p.items)
              .map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.rewardName}</strong>
                    <p>
                      {m.rewards_points({ amount: pointsNumber(item.cost) })} ·{" "}
                      {m[`rewards_${item.status}`]()}
                    </p>
                    <small>{stamp(item.createdAt)}</small>
                  </div>
                  <Button variant="outline" asChild>
                    <Link
                      to="/workspace/$organizationId/my-coupons/$couponId"
                      params={{
                        organizationId: organization.id,
                        couponId: item.id,
                      }}
                    >
                      <Ticket aria-hidden="true" />
                      {m.coupon_view()}
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </li>
              ))}
          </ul>
          {list.data?.pages[0]?.items.length === 0 ? (
            <p className="directory-empty">
              {status === "pending" ? m.coupons_empty() : m.rewards_empty()}
            </p>
          ) : (
            <InfiniteFooter
              {...list}
              fetchNextPage={() => list.fetchNextPage({ cancelRefetch: false })}
            />
          )}
        </>
      )}
    </section>
  );
}
