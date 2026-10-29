import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { Banknote, ArrowRight, X } from "lucide-react";
import { FormSurface } from "../components/shared/form-surface";
import { useConfirmation } from "../components/shared/confirmation";
import { ActionButton } from "../components/shared/action-button";
import { CollectionError } from "../components/shared/collection-error";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { directoryRequest, DirectoryError } from "../community/client";
import { priceFromText, sessionPrice } from "../activities/contracts";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import type { CashCharge } from "./contracts";

/** A single contact/amount is a simple sheet; split receipts retain the full page. */
export function QuickCash({
  bill: initial,
  user,
  org,
  activity,
  session,
  onClose,
  onAdvanced,
  onSaved,
  onDenied,
}: {
  bill: CashCharge;
  user: string;
  org: string;
  activity: string;
  session: string;
  onClose: () => void;
  onAdvanced: (bill: CashCharge) => void;
  onSaved: (name: string, amount: number) => void;
  onDenied?: (error: unknown) => void;
}) {
  const locale = useLocale()?.locale ?? "en",
    cache = useQueryClient(),
    confirm = useConfirmation();
  const [bill, setBill] = useState(initial),
    [amount, setAmount] = useState((initial.outstandingMinor / 100).toFixed(2));
  const [invalid, setInvalid] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [refreshError, setRefreshError] = useState<unknown>(null);
  const attempt = useRef<Record<string, unknown> | null>(null),
    approved = useRef(false);
  const path = `/api/organizations/${org}/activities/${activity}/sessions/${session}/cash`;
  const report = (error: unknown) => {
    if (
      error instanceof DirectoryError &&
      ["forbidden", "not_found", "sign_in", "verify_required"].includes(
        error.code,
      )
    )
      onDenied?.(error);
  };
  const operation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      directoryRequest(path, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => {
      const paid = Number(attempt.current?.amountMinor);
      attempt.current = null;
      approved.current = true;
      await cache.invalidateQueries({ queryKey: ["organization", user, org] });
      onSaved(bill.name, paid);
    },
    onError: (error) => {
      report(error);
      if (
        error instanceof DirectoryError &&
        !["service", "rate_limit"].includes(error.code)
      )
        attempt.current = null;
    },
  });
  const dirty =
    amount !== (initial.outstandingMinor / 100).toFixed(2) || !!attempt.current;
  const allowLeave = async () => {
    if (operation.isPending) return false;
    if (!dirty) return true;
    return confirm({
      title: m.directory_discard(),
      description: attempt.current
        ? m.cash_uncertain()
        : m.directory_discard_description(),
      confirmLabel: m.directory_discard(),
      destructive: true,
    });
  };
  useBlocker({
    shouldBlockFn: async () => !approved.current && !(await allowLeave()),
    enableBeforeUnload: () => !approved.current && dirty,
  });
  const leave = async (advanced = false) => {
    if (!(await allowLeave())) return;
    approved.current = true;
    advanced ? onAdvanced(bill) : onClose();
  };
  const refresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const result = await directoryRequest<{ item: CashCharge }>(
        path +
          (bill.status === "not_charged"
            ? "/participants/" + (bill.personId ?? bill.id)
            : "/charges/" + bill.id),
      );
      setBill(result.item);
      setAmount((result.item.outstandingMinor / 100).toFixed(2));
      setInvalid(false);
      operation.reset();
    } catch (error) {
      setRefreshError(error);
      report(error);
    } finally {
      setRefreshing(false);
    }
  };
  let minor = 0;
  try {
    minor = priceFromText(amount);
  } catch {}
  const eligible =
    !bill.reviewRequired &&
    !bill.registrationRequired &&
    bill.outstandingMinor > 0;
  const frozen = operation.isPending || !!attempt.current || refreshing;
  const money = (n: number) => sessionPrice(n, locale);
  return (
    <FormSurface
      title={m.quick_cash_title()}
      description={bill.name}
      onClose={() => void leave()}
    >
      <form
        className="directory-form quick-cash-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!attempt.current) {
            if (!eligible || minor < 1 || minor > bill.outstandingMinor) {
              setInvalid(true);
              return;
            }
            const allocation =
              bill.status === "not_charged"
                ? {
                    personId: bill.personId,
                    contactVersion: bill.contactVersion,
                    sessionVersion: bill.sessionVersion,
                    version: 0,
                    amountMinor: minor,
                  }
                : {
                    chargeId: bill.id,
                    version: bill.version,
                    amountMinor: minor,
                  };
            attempt.current = {
              key: crypto.randomUUID(),
              action: "record",
              amountMinor: minor,
              payerLabel: "",
              occurredAt: new Date().toISOString(),
              allocations: [allocation],
            };
            setInvalid(false);
          }
          await operation.mutateAsync(attempt.current).catch(() => {});
        }}
      >
        <div className="quick-cash-balance">
          <span>
            {bill.status === "not_charged"
              ? m.pricing_amount_short()
              : m.cash_outstanding()}
          </span>
          <strong>{money(bill.outstandingMinor)}</strong>
        </div>
        <div>
          <Label htmlFor="quick-cash-amount">{m.cash_received_amount()}</Label>
          <Input
            id="quick-cash-amount"
            inputMode="decimal"
            required
            value={amount}
            disabled={frozen || !eligible}
            aria-invalid={invalid}
            aria-describedby={invalid ? "quick-cash-error" : undefined}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <p className="quick-cash-remainder">
          {m.quick_cash_remaining({
            amount: money(Math.max(0, bill.outstandingMinor - minor)),
          })}
        </p>
        {bill.status === "not_charged" && (
          <p className="activity-note">
            {m.quick_cash_new_charge({ amount: money(bill.amountMinor) })}
          </p>
        )}
        {!eligible && (
          <p role="alert">
            {bill.registrationRequired
              ? m.billing_required_help()
              : m.directory_cash_closed()}
          </p>
        )}
        {invalid && (
          <p id="quick-cash-error" role="alert">
            {m.quick_cash_invalid({ amount: money(bill.outstandingMinor) })}
          </p>
        )}
        {operation.isError && <CollectionError error={operation.error} />}
        {!!attempt.current && operation.isError && (
          <p role="status">{m.cash_uncertain()}</p>
        )}
        {operation.isError && !attempt.current && (
          <ActionButton
            type="button"
            variant="outline"
            pending={refreshing}
            onClick={() => void refresh()}
          >
            {m.cash_refresh()}
          </ActionButton>
        )}
        {refreshError != null && <CollectionError error={refreshError} />}
        <div className="directory-actions">
          <Button
            type="button"
            variant="outline"
            disabled={operation.isPending}
            onClick={() => void leave()}
          >
            <X aria-hidden="true" />
            {m.cancel()}
          </Button>
          <ActionButton
            type="submit"
            pending={operation.isPending}
            disabled={refreshing || !eligible}
          >
            <Banknote aria-hidden="true" />
            {attempt.current
              ? m.try_again()
              : m.quick_cash_submit({ amount: money(minor) })}
          </ActionButton>
        </div>
        <Button
          type="button"
          variant="link"
          className="quick-cash-advanced"
          disabled={frozen}
          onClick={() => void leave(true)}
        >
          {m.quick_cash_advanced()}
          <ArrowRight aria-hidden="true" />
        </Button>
      </form>
    </FormSurface>
  );
}
