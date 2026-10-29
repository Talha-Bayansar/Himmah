import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useBlocker,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { directoryRequest, DirectoryError } from "../community/client";
import { useConfirmation } from "../components/shared/confirmation";
import { CollectionError } from "../components/shared/collection-error";
import { ActionButton } from "../components/shared/action-button";
import { sessionPrice } from "../activities/contracts";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import type { CashCharge } from "./contracts";
export function useBillingActions(
  user: string,
  org: string,
  activity: string,
  session: string,
  onDenied?: (e: unknown) => void,
) {
  const cache = useQueryClient(),
    navigate = useNavigate(),
    confirm = useConfirmation(),
    locale = useLocale()?.locale ?? "en",
    returnTo = useRouterState({ select: (s) => s.location.href });
  const attempt = useRef<Record<string, unknown> | null>(null);
  const operation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      directoryRequest(
        `/api/organizations/${org}/activities/${activity}/sessions/${session}/cash`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: async () => {
      attempt.current = null;
      await cache.invalidateQueries({ queryKey: ["organization", user, org] });
    },
    onError: (e) => {
      if (e instanceof DirectoryError) {
        if (
          ["forbidden", "not_found", "sign_in", "verify_required"].includes(
            e.code,
          )
        )
          onDenied?.(e);
        if (!["service", "rate_limit"].includes(e.code)) attempt.current = null;
      }
      void cache.invalidateQueries({ queryKey: ["organization", user, org] });
    },
  });
  useBlocker({
    shouldBlockFn: async () =>
      operation.isPending ||
      (!!attempt.current &&
        !(await confirm({
          title: m.directory_discard(),
          description: m.billing_uncertain(),
          confirmLabel: m.directory_discard(),
          destructive: true,
        }))),
    enableBeforeUnload: () => !!attempt.current,
  });
  return {
    pending: operation.isPending,
    blocked: operation.isPending || !!attempt.current,
    personId: attempt.current?.personId,
    record: (bill: CashCharge) =>
      void navigate({
        to: "/workspace/$organizationId/activities/$activityId/sessions/$sessionId/record-cash",
        params: {
          organizationId: org,
          activityId: activity,
          sessionId: session,
        },
        search: {
          chargeId: bill.status === "not_charged" ? "" : bill.id,
          personId:
            bill.status === "not_charged" ? (bill.personId ?? bill.id) : "",
          returnTo,
        },
      }),
    charge: async (bill: CashCharge) => {
      if (attempt.current) return;
      if (
        !(await confirm({
          title: m.billing_add_charge(),
          description: m.billing_confirm_charge({
            name: bill.name,
            price: sessionPrice(bill.amountMinor, locale),
          }),
          confirmLabel: m.billing_add_charge(),
        }))
      )
        return;
      attempt.current = {
        key: crypto.randomUUID(),
        action: "charge",
        personId: bill.personId,
        contactVersion: bill.contactVersion,
        sessionVersion: bill.sessionVersion,
      };
      await operation.mutateAsync(attempt.current).catch(() => {});
    },
    notice: operation.isError ? (
      <div className="space-y-3">
        <CollectionError error={operation.error} />
        {attempt.current && (
          <>
            <p>{m.billing_uncertain()}</p>
            <ActionButton
              pending={operation.isPending}
              onClick={() =>
                void operation.mutateAsync(attempt.current!).catch(() => {})
              }
            >
              {m.try_again()}
            </ActionButton>
          </>
        )}
      </div>
    ) : null,
  };
}
