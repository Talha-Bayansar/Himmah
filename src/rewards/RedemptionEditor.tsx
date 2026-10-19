import { useLocale } from "../localization/locale";
import { useRef } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { Gift, Check, X, Undo2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { ActionButton } from "../components/shared/action-button";
import { useConfirmation } from "../components/shared/confirmation";
import { directoryRequest, DirectoryError } from "../community/client";
import { PointsError } from "../points/PointsShared";
import { m } from "../paraglide/messages.js";
import type { Reward, RewardMember, Redemption } from "./contracts";
import { pointsNumber } from "./RewardWallet";
export function RedemptionEditor({
  base,
  reward,
  person,
  redemption,
  mode,
  onClose,
  onSaved,
}: {
  base: string;
  reward: Reward;
  person?: RewardMember;
  redemption?: Redemption;
  mode: "reserve" | "fulfilled" | "cancelled";
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  useLocale();
  const confirm = useConfirmation(),
    attempt = useRef<Record<string, unknown> | null>(null),
    saved = useRef(false);
  const title =
    mode === "reserve"
      ? m.rewards_reserve()
      : mode === "fulfilled"
        ? m.rewards_fulfil()
        : m.rewards_cancel();
  const form = useForm({
    defaultValues: { reason: "" },
    onSubmit: async ({ value }) => {
      if (!attempt.current) {
        if (
          mode === "cancelled" &&
          !(await confirm({
            title,
            description: m.rewards_cancel_help(),
            confirmLabel: title,
            destructive: true,
          }))
        )
          return;
        attempt.current =
          mode === "reserve"
            ? {
                personId: person!.id,
                rewardVersion: reward.version,
                key: crypto.randomUUID(),
              }
            : {
                action: mode,
                version: redemption!.version,
                ...(mode === "cancelled"
                  ? { reason: value.reason.trim() }
                  : {}),
              };
      }
      await submit.mutateAsync(attempt.current).catch(() => {});
    },
  });
  const submit = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      directoryRequest(
        base +
          "/" +
          reward.id +
          "/redemptions" +
          (redemption ? "/" + redemption.id : ""),
        { method: redemption ? "PATCH" : "POST", body: JSON.stringify(body) },
      ),
    onSuccess: async () => {
      saved.current = true;
      await onSaved();
    },
    onError: (error) => {
      if (
        error instanceof DirectoryError &&
        !["service", "rate_limit"].includes(error.code)
      )
        attempt.current = null;
    },
  });
  const dirty = useStore(form.store, (s) => s.isDirty),
    frozen = submit.isPending || !!attempt.current;
  const leave = async () =>
    saved.current ||
    (!dirty && !attempt.current) ||
    (await confirm({
      title: attempt.current ? m.rewards_leave() : m.directory_discard(),
      description: attempt.current
        ? m.rewards_leave_help()
        : m.directory_discard_description(),
      confirmLabel: attempt.current ? m.rewards_leave() : m.directory_discard(),
      destructive: true,
    }));
  useBlocker({
    shouldBlockFn: async () =>
      !saved.current && (submit.isPending || !(await leave())),
    enableBeforeUnload: !saved.current && (dirty || !!attempt.current),
  });
  const close = async () => {
    if (!submit.isPending && (await leave())) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "reserve"
              ? m.rewards_reserve_help({
                  name: person!.name,
                  amount: pointsNumber(reward.cost),
                })
              : mode === "fulfilled"
                ? m.rewards_fulfil_help({ name: redemption!.personName })
                : m.rewards_cancel_help()}
          </DialogDescription>
        </DialogHeader>
        <div className="reward-review">
          <strong>{redemption?.rewardName ?? reward.name}</strong>
          <span>
            {m.rewards_points({
              amount: pointsNumber(redemption?.cost ?? reward.cost),
            })}
          </span>
          {person && (
            <p>
              {m.rewards_available()}: {pointsNumber(person.available)}
            </p>
          )}
          {redemption && <p>{redemption.personName}</p>}
        </div>
        {submit.isError && <PointsError error={submit.error} />}{" "}
        {submit.isError && attempt.current && (
          <p role="status">{m.rewards_leave_help()}</p>
        )}
        <form
          className="directory-form"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          {mode === "cancelled" && (
            <form.Field name="reason">
              {(field) => (
                <div>
                  <Label htmlFor="redemption-reason">
                    {m.rewards_reason()}
                  </Label>
                  <Textarea
                    id="redemption-reason"
                    required
                    minLength={1}
                    maxLength={300}
                    value={field.state.value}
                    disabled={frozen}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>
          )}
          <div className="directory-actions">
            <Button
              type="button"
              variant="outline"
              disabled={submit.isPending}
              onClick={() => void close()}
            >
              <X aria-hidden="true" />
              {m.cancel()}
            </Button>
            <ActionButton
              type="submit"
              pending={submit.isPending}
              variant={mode === "cancelled" ? "destructive" : "default"}
            >
              {mode === "reserve" ? (
                <Gift aria-hidden="true" />
              ) : mode === "fulfilled" ? (
                <Check aria-hidden="true" />
              ) : (
                <Undo2 aria-hidden="true" />
              )}
              {submit.isError && attempt.current ? m.try_again() : title}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
