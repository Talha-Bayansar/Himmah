import { CommunityError } from "../community/contracts.ts";
export const notificationKinds = ["staff_notice"] as const;
export type NotificationKind = (typeof notificationKinds)[number];
export type HubNotification = {
  id: string;
  kind: NotificationKind;
  href: string;
  readAt: string | null;
  createdAt: string;
};
export function pushEndpoint(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048)
    throw new CommunityError("invalid_input");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CommunityError("invalid_input");
  }
  const host = url.hostname;
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !(
      host === "fcm.googleapis.com" ||
      host === "updates.push.services.mozilla.com" ||
      host.endsWith(".push.services.mozilla.com") ||
      host === "web.push.apple.com" ||
      host.endsWith(".notify.windows.com")
    )
  )
    throw new CommunityError("invalid_input");
  return url.href;
}
export function pushInput(value: Record<string, unknown>) {
  const endpoint = pushEndpoint(value.endpoint),
    keys = value.keys as Record<string, unknown> | undefined;
  const key = (v: unknown, length: number) => {
    if (typeof v !== "string" || !/^[A-Za-z0-9_-]+$/.test(v))
      throw new CommunityError("invalid_input");
    let b: string;
    try {
      b = atob(v.replace(/-/g, "+").replace(/_/g, "/"));
    } catch {
      throw new CommunityError("invalid_input");
    }
    if (b.length !== length || (length === 65 && b.charCodeAt(0) !== 4))
      throw new CommunityError("invalid_input");
    return v;
  };
  if (!["en", "nl", "tr"].includes(String(value.locale)))
    throw new CommunityError("invalid_input");
  return {
    endpoint,
    p256dh: key(keys?.p256dh, 65),
    auth: key(keys?.auth, 16),
    locale: String(value.locale),
  };
}
