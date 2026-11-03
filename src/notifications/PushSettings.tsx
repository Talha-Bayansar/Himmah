import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
import { useLocale } from "../localization/locale";
import { getLocale } from "../paraglide/runtime.js";
import { m } from "../paraglide/messages.js";
import { ActionButton } from "../components/shared/action-button";
import { useConfirmation } from "../components/shared/confirmation";
import { Skeleton } from "../components/ui/skeleton";
import { ErrorFeedback } from "../components/shared/feedback";
import { ItemActions } from "../components/shared/item-actions";
import { DirectoryError, directoryRequest } from "../community/client";
import {
  currentSubscription,
  disablePush,
  enablePush,
  pushSupport,
} from "./push-client";
export function PushSettings({ userId }: { userId: string }) {
  useLocale();
  const locale = getLocale(),
    confirm = useConfirmation(),
    cache = useQueryClient();
  const key = ["push-settings", userId, locale];
  const settings = useQuery({
    queryKey: key,
    retry: false,
    queryFn: async () => {
      const support = pushSupport();
      if (!support.supported || support.ios)
        return { ...support, enabled: false, publicKey: null };
      const config = await directoryRequest<{ publicKey: string | null }>(
        "/api/notifications/push",
      );
      const subscription = await currentSubscription();
      const enabled = subscription
        ? (
            await directoryRequest<{ enabled: boolean }>(
              "/api/notifications/push/status",
              {
                method: "POST",
                body: JSON.stringify({ endpoint: subscription.endpoint }),
              },
            )
          ).enabled
        : false;
      if (enabled && subscription)
        await directoryRequest("/api/notifications/push", {
          method: "POST",
          body: JSON.stringify({ ...subscription.toJSON(), locale }),
        });
      return { ...support, ...config, enabled };
    },
  });
  const change = useMutation({
    mutationFn: async (mode: "enable" | "disable" | "all") => {
      if (mode === "enable")
        await enablePush(settings.data!.publicKey!, locale);
      else await disablePush(mode === "all");
    },
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ["push-settings", userId] }),
  });
  const disable = async (all = false) => {
    if (
      await confirm({
        title: m.push_disable_title(),
        description: all
          ? m.push_all_description()
          : m.push_disable_description(),
        confirmLabel: all ? m.push_all_disable() : m.push_disable(),
        destructive: true,
      })
    )
      change.mutate(all ? "all" : "disable");
  };
  const error = settings.error ?? change.error;
  const errorMessage =
    error instanceof DirectoryError && error.code === "push_denied"
      ? m.push_denied()
      : error instanceof DirectoryError && error.code === "push_conflict"
        ? m.push_conflict()
        : m.push_service();
  return (
    <section
      className="preferences-section push-settings"
      aria-labelledby="push-heading"
    >
      <div className="preferences-section-heading">
        <h2 id="push-heading">{m.push_title()}</h2>
        <ItemActions
          name={m.push_title()}
          pending={change.isPending && change.variables === "all"}
          disabled={change.isPending}
          actions={[
            {
              label: m.push_all_disable(),
              icon: BellOff,
              destructive: true,
              onSelect: () => disable(true),
            },
          ]}
        />
      </div>
      {settings.isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : settings.isError ? null : settings.data?.ios ? (
        <p>{m.push_ios()}</p>
      ) : !settings.data?.supported ? (
        <p>{m.push_unsupported()}</p>
      ) : (
        <>
          <p
            role="status"
            className="preferences-device-status"
            data-enabled={settings.data.enabled}
          >
            {settings.data.enabled ? m.push_enabled() : m.push_disabled()}
          </p>
          {!settings.data.publicKey && <p>{m.push_not_configured()}</p>}
          {"Notification" in window && Notification.permission === "denied" && (
            <p>{m.push_denied()}</p>
          )}
          <ActionButton
            className="push-device-action"
            pending={change.isPending && change.variables !== "all"}
            disabled={
              change.isPending ||
              (!settings.data.enabled &&
                (!settings.data.publicKey ||
                  Notification.permission === "denied"))
            }
            variant={settings.data.enabled ? "outline" : "default"}
            onClick={() =>
              settings.data.enabled ? void disable() : change.mutate("enable")
            }
          >
            {settings.data.enabled ? (
              <BellOff aria-hidden="true" />
            ) : (
              <Bell aria-hidden="true" />
            )}
            {settings.data.enabled ? m.push_disable() : m.push_enable()}
          </ActionButton>
        </>
      )}
      {error && (
        <ErrorFeedback
          message={errorMessage}
          retry={settings.isError ? () => void settings.refetch() : undefined}
          pending={settings.isFetching}
        />
      )}
      <details className="session-help preferences-help">
        <summary>{m.preferences_push_about()}</summary>
        <p>{m.push_help()}</p>
        <p>{m.push_device_hint()}</p>
      </details>
    </section>
  );
}
