import { useState, useRef, useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { useLocation, useNavigate, useBlocker } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Search, Check, RefreshCcw, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { ActionButton } from "../components/shared/action-button";
import { ListSkeleton } from "../components/shared/infinite-list";
import { useConfirmation } from "../components/shared/confirmation";
import { directoryRequest, DirectoryError } from "../community/client";
import { CommunityError } from "../community/contracts";
import { PointsError } from "../points/PointsShared";
import { pointsNumber } from "../rewards/RewardWallet";
import { useLocale } from "../localization/locale";
import { getLocale } from "../paraglide/runtime.js";
import { m } from "../paraglide/messages.js";
import type { Organization } from "../organization/contracts";
import { couponCode, type Coupon } from "./contracts";
import CameraScanner from "./CameraScanner";
export default function Collection({
  organization,
  userId,
}: {
  organization: Organization;
  userId: string;
}) {
  useLocale();
  const heading = useRef<HTMLHeadingElement>(null),
    confirm = useConfirmation(),
    navigate = useNavigate(),
    client = useQueryClient();
  const hash = useLocation({ select: (location) => location.hash }).replace(
      /^#/,
      "",
    ),
    code = /^[0-9a-f]{64}$/.test(hash) ? hash : null;
  const [camera, setCamera] = useState(false),
    [inputError, setInputError] = useState<DirectoryError | null>(null),
    attempt = useRef<{ code: string; version: number } | null>(null);
  const base = `/api/organizations/${organization.id}/coupon-collection`,
    key = ["organization", userId, organization.id, "collection", code];
  const lookup = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      directoryRequest<{ item: Coupon }>(base, {
        method: "POST",
        body: JSON.stringify({ code }),
        signal,
      }),
    enabled: !!code,
    retry: false,
  });
  const collect = useMutation({
    mutationFn: (body: { code: string; version: number }) =>
      directoryRequest<{ item: Coupon }>(base, {
        method: "PATCH",
        body: JSON.stringify({ ...body, action: "fulfilled" }),
      }),
    onSuccess: async (data) => {
      attempt.current = null;
      client.setQueryData(key, data);
      await client.invalidateQueries({
        queryKey: ["organization", userId, organization.id],
      });
    },
    onError: (error) => {
      if (
        error instanceof DirectoryError &&
        !["service", "rate_limit"].includes(error.code)
      ) {
        attempt.current = null;
        void lookup.refetch();
      }
    },
  });
  const frozen = collect.isPending || !!attempt.current;
  const choose = async (value: string) => {
    try {
      const parsed = couponCode(value, organization.id, window.location.origin);
      setInputError(null);
      setCamera(false);
      collect.reset();
      if (parsed === code) await lookup.refetch();
      else
        await navigate({
          to: "/workspace/$organizationId/$section",
          params: { organizationId: organization.id, section: "collect" },
          hash: parsed,
          replace: true,
        });
    } catch (error) {
      setCamera(false);
      setInputError(
        new DirectoryError(
          error instanceof CommunityError ? error.code : "coupon_invalid",
        ),
      );
    }
  };
  const form = useForm({
    defaultValues: { value: "" },
    onSubmit: async ({ value }) => {
      if (!frozen) await choose(value.value);
    },
  });
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    form.setFieldValue("value", code ?? "");
    setCamera(false);
    if (hash && !code) setInputError(new DirectoryError("coupon_invalid"));
  }, [code, hash]);
  useBlocker({
    shouldBlockFn: async () =>
      collect.isPending ||
      (!!attempt.current &&
        !(await confirm({
          title: m.coupon_leave(),
          description: m.coupon_uncertain(),
          confirmLabel: m.coupon_leave(),
          destructive: true,
        }))),
    enableBeforeUnload: frozen,
  });
  const denied =
    collect.isError &&
    collect.error instanceof DirectoryError &&
    ["forbidden", "not_found", "sign_in"].includes(collect.error.code);
  const row = lookup.data?.item;
  return (
    <section className="directory collection-page">
      <Button variant="link" asChild className="settings-back">
        <Link
          to="/workspace/$organizationId/$section"
          params={{ organizationId: organization.id, section: "rewards" }}
        >
          <ArrowLeft aria-hidden="true" />
          {m.rewards_title()}
        </Link>
      </Button>
      <div className="directory-heading">
        <div>
          <h1 ref={heading} tabIndex={-1} data-page-heading>
            {m.coupon_collect_title()}
          </h1>
          <p>{m.coupon_collect_help()}</p>
        </div>
      </div>
      <section className="settings-panel">
        <Button
          disabled={frozen || camera}
          onClick={() => {
            setInputError(null);
            setCamera(true);
          }}
        >
          <Camera aria-hidden="true" />
          {m.coupon_start_camera()}
        </Button>
        {camera && (
          <CameraScanner
            onScan={(value) => void choose(value)}
            onClose={() => setCamera(false)}
          />
        )}
        <form
          className="directory-form"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="value">
            {(field) => (
              <div>
                <Label htmlFor="collection-code">{m.coupon_paste()}</Label>
                <Input
                  id="collection-code"
                  required
                  maxLength={512}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={field.state.value}
                  disabled={frozen}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>
          <ActionButton
            type="submit"
            pending={lookup.isFetching}
            disabled={frozen}
          >
            <Search aria-hidden="true" />
            {m.coupon_lookup()}
          </ActionButton>
        </form>
        {inputError && <PointsError error={inputError} />}
      </section>
      {code &&
        (lookup.isPending ? (
          <ListSkeleton />
        ) : lookup.isError || denied ? (
          <PointsError
            error={lookup.error ?? collect.error}
            pending={lookup.isFetching}
            retry={() => {
              collect.reset();
              void lookup.refetch();
            }}
          />
        ) : (
          row && (
            <section className="settings-panel coupon-review">
              <h2>{row.rewardName}</h2>
              <p>{row.personName}</p>
              <strong>
                {m.rewards_points({ amount: pointsNumber(row.cost) })}
              </strong>
              <span className="badge">{m[`rewards_${row.status}`]()}</span>
              {row.status === "pending" ? (
                row.canCollect ? (
                  <ActionButton
                    pending={collect.isPending}
                    disabled={lookup.isFetching || camera}
                    onClick={async () => {
                      if (!attempt.current) {
                        if (
                          !(await confirm({
                            title: m.coupon_collect(),
                            description: m.coupon_collect_review({
                              person: row.personName ?? "",
                              reward: row.rewardName,
                            }),
                            confirmLabel: m.coupon_collect(),
                            destructive: true,
                          }))
                        )
                          return;
                        attempt.current = { code, version: row.version };
                      }
                      collect.mutate(attempt.current);
                    }}
                  >
                    <Check aria-hidden="true" />
                    {attempt.current ? m.try_again() : m.coupon_collect()}
                  </ActionButton>
                ) : (
                  <p role="alert">{m.coupon_no_self_collect()}</p>
                )
              ) : (
                <p role="status">
                  {row.status === "fulfilled"
                    ? m.coupon_used()
                    : m.coupon_cancelled()}
                </p>
              )}
              {row.fulfilledAt && (
                <p>
                  {new Intl.DateTimeFormat(getLocale(), {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: organization.timezone,
                  }).format(new Date(row.fulfilledAt))}
                </p>
              )}
            </section>
          )
        ))}
      {collect.isError && !denied && <PointsError error={collect.error} />}{" "}
      {collect.isError && attempt.current && (
        <p role="status">{m.coupon_uncertain()}</p>
      )}
      {code && (
        <Button
          variant="outline"
          disabled={frozen}
          onClick={() => {
            collect.reset();
            setInputError(null);
            form.reset();
            void navigate({
              to: "/workspace/$organizationId/$section",
              params: { organizationId: organization.id, section: "collect" },
              hash: "",
              replace: true,
            });
          }}
        >
          <RefreshCcw aria-hidden="true" />
          {m.coupon_next()}
        </Button>
      )}
    </section>
  );
}
