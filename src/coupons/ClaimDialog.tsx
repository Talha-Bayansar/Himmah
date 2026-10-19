import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useBlocker } from "@tanstack/react-router";
import { Gift, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { ActionButton } from "../components/shared/action-button";
import { useConfirmation } from "../components/shared/confirmation";
import { directoryRequest, DirectoryError } from "../community/client";
import { PointsError } from "../points/PointsShared";
import { pointsNumber } from "../rewards/RewardWallet";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import type { PersonalReward } from "../participants/contracts";
import type { Coupon } from "./contracts";
export function ClaimDialog({
  reward,
  organizationId,
  userId,
  onClose,
}: {
  reward: PersonalReward;
  organizationId: string;
  userId: string;
  onClose: () => void;
}) {
  useLocale();
  const confirm = useConfirmation(),
    client = useQueryClient(),
    navigate = useNavigate();
  const attempt = useRef<{
      key: string;
      rewardId: string;
      rewardVersion: number;
    } | null>(null),
    saved = useRef(false);
  const submit = useMutation({
    mutationFn: () => {
      attempt.current ??= {
        key: crypto.randomUUID(),
        rewardId: reward.id,
        rewardVersion: reward.version,
      };
      return directoryRequest<{ item: Coupon }>(
        `/api/organizations/${organizationId}/me/claims`,
        { method: "POST", body: JSON.stringify(attempt.current) },
      );
    },
    onSuccess: async ({ item }) => {
      saved.current = true;
      await client.invalidateQueries({
        queryKey: ["organization", userId, organizationId],
      });
      await navigate({
        to: "/workspace/$organizationId/my-coupons/$couponId",
        params: { organizationId, couponId: item.id },
      });
    },
    onError: (error) => {
      if (
        error instanceof DirectoryError &&
        !["service", "rate_limit"].includes(error.code)
      )
        attempt.current = null;
    },
  });
  const leave = async () =>
    !attempt.current ||
    saved.current ||
    (await confirm({
      title: m.coupon_leave(),
      description: m.coupon_uncertain(),
      confirmLabel: m.coupon_leave(),
      destructive: true,
    }));
  useBlocker({
    shouldBlockFn: async () =>
      !saved.current && (submit.isPending || !(await leave())),
    enableBeforeUnload:
      !saved.current && (submit.isPending || !!attempt.current),
  });
  const close = async () => {
    if (!submit.isPending && (await leave())) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) void close();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{m.coupon_redeem()}</DialogTitle>
          <DialogDescription>{m.coupon_claim_help()}</DialogDescription>
        </DialogHeader>
        <div className="coupon-review">
          <h2>{reward.name}</h2>
          <strong>
            {m.rewards_points({ amount: pointsNumber(reward.cost) })}
          </strong>
          {reward.description && <p>{reward.description}</p>}
        </div>
        {submit.isError && <PointsError error={submit.error} />}{" "}
        {submit.isError && attempt.current && (
          <p role="status">{m.coupon_uncertain()}</p>
        )}
        <div className="directory-actions">
          <Button
            variant="outline"
            disabled={submit.isPending}
            onClick={() => void close()}
          >
            <X aria-hidden="true" />
            {m.cancel()}
          </Button>
          <ActionButton
            pending={submit.isPending}
            onClick={() => submit.mutate()}
          >
            <Gift aria-hidden="true" />
            {submit.isError && attempt.current
              ? m.try_again()
              : m.coupon_redeem()}
          </ActionButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
