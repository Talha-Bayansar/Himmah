import { useLocale } from "../localization/locale";
import { useRef } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { Save, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ActionButton } from "../components/shared/action-button";
import { useConfirmation } from "../components/shared/confirmation";
import { PointsError } from "../points/PointsShared";
import { directoryRequest, DirectoryError } from "../community/client";
import { Textarea } from "../components/ui/textarea";
import { m } from "../paraglide/messages.js";
import type { Reward } from "./contracts";
export function RewardEditor({
  path,
  reward,
  onClose,
  onSaved,
}: {
  path: string;
  reward?: Reward;
  onClose: () => void;
  onSaved: (reward: Reward) => Promise<void>;
}) {
  useLocale();
  const saved = useRef(false);
  const confirm = useConfirmation(),
    attempt = useRef<Record<string, unknown> | null>(null);
  const form = useForm({
    defaultValues: {
      name: reward?.name ?? "",
      description: reward?.description ?? "",
      cost: reward ? String(reward.cost) : "",
      stock: reward?.stock == null ? "" : String(reward.stock),
    },
    onSubmit: async ({ value }) => {
      attempt.current ??= {
        ...value,
        cost: Number(value.cost),
        stock: value.stock.trim() === "" ? null : Number(value.stock),
        ...(reward
          ? { version: reward.version }
          : { key: crypto.randomUUID() }),
      };
      await submit.mutateAsync(attempt.current).catch(() => {});
    },
  });
  const submit = useMutation({
    mutationFn: (value: Record<string, unknown>) =>
      directoryRequest<{ item: Reward }>(
        path + (reward ? "/" + reward.id : ""),
        { method: reward ? "PATCH" : "POST", body: JSON.stringify(value) },
      ),
    onSuccess: (result) => {
      saved.current = true;
      return onSaved(result.item);
    },
    onError: (error) => {
      if (
        error instanceof DirectoryError &&
        [
          "invalid_input",
          "invalid_name",
          "reward_cost",
          "reward_stock",
          "reward_stock_used",
          "conflict",
          "forbidden",
          "not_found",
          "verify_required",
        ].includes(error.code)
      )
        attempt.current = null;
    },
  });
  const dirty = useStore(form.store, (state) => state.isDirty),
    frozen = submit.isPending || !!attempt.current;
  const canLeave = async () =>
    saved.current ||
    submit.isSuccess ||
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
      !saved.current && (submit.isPending || !(await canLeave())),
    enableBeforeUnload: !saved.current && (dirty || !!attempt.current),
  });
  const close = async () => {
    if (!submit.isPending && (await canLeave())) onClose();
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
          <DialogTitle>
            {reward ? m.rewards_edit() : m.rewards_create()}
          </DialogTitle>
          <DialogDescription>{m.rewards_form_help()}</DialogDescription>
        </DialogHeader>
        {submit.isError && <PointsError error={submit.error} />}
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
          <form.Field name="name">
            {(field) => (
              <div>
                <Label htmlFor="reward-name">{m.rewards_name()}</Label>
                <Input
                  id="reward-name"
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="off"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  disabled={frozen}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="description">
            {(field) => (
              <div>
                <Label htmlFor="reward-description">
                  {m.rewards_description()}
                </Label>
                <Textarea
                  id="reward-description"
                  maxLength={1000}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  disabled={frozen}
                />
              </div>
            )}
          </form.Field>
          {(["cost", "stock"] as const).map((name) => (
            <form.Field key={name} name={name}>
              {(field) => (
                <div>
                  <Label htmlFor={"reward-" + name}>
                    {name === "cost" ? m.rewards_cost() : m.rewards_stock()}
                  </Label>
                  <Input
                    id={"reward-" + name}
                    type="number"
                    inputMode="numeric"
                    min={name === "cost" ? 1 : 0}
                    max={1000000}
                    step={1}
                    required={name === "cost"}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    disabled={frozen}
                  />
                  {name === "stock" && (
                    <p className="reward-help">{m.rewards_stock_help()}</p>
                  )}
                </div>
              )}
            </form.Field>
          ))}
          <div className="directory-actions">
            <Button
              type="button"
              variant="outline"
              disabled={submit.isPending}
              onClick={() => {
                void close();
              }}
            >
              <X aria-hidden="true" />
              {m.cancel()}
            </Button>
            <ActionButton type="submit" pending={submit.isPending}>
              <Save aria-hidden="true" />
              {submit.isError && attempt.current
                ? m.try_again()
                : m.directory_save()}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
