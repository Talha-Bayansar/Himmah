/** Native interruptions only: the private inbox remains complete. No device prompts. */
export function pushPolicy(
  target: Record<string, unknown>,
  now = Date.now(),
): { action: "send" | "skip" | "defer"; delay: number } {
  const send = { action: "send" as const, delay: 0 };
  if (typeof target.kind !== "string") return send;
  const planned = Date.parse(String(target.plannedAt)),
    created = Date.parse(String(target.createdAt));
  const imminent =
    target.kind === "session_cancelled" &&
    planned > now &&
    planned - now <= 2 * 3600000;
  if (
    target.kind !== "staff_notice" &&
    (!Number.isFinite(planned) || planned <= now)
  )
    return { action: "skip", delay: 0 };
  if (
    ["session_changed", "session_cancelled"].includes(target.kind) &&
    planned - now > 7 * 86400000
  )
    return { action: "skip", delay: 0 };
  if (target.kind === "session_reminder" && target.recentChange === true)
    return { action: "skip", delay: 0 };
  let delay = 0;
  if (target.kind === "session_changed" && Number.isFinite(created))
    delay = Math.max(delay, Math.ceil((created + 120000 - now) / 1000));
  if (!imminent) {
    const latest = Date.parse(String(target.latestPushAt));
    if (Number.isFinite(latest))
      delay = Math.max(delay, Math.ceil((latest + 300000 - now) / 1000));
    const format = new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: typeof target.timezone === "string" ? target.timezone : "UTC",
    });
    const hour = Number(format.format(now));
    if (hour >= 22 || hour < 8) {
      for (
        let at = Math.floor(now / 900000) * 900000 + 900000;
        at <= now + 14 * 3600000;
        at += 900000
      ) {
        const h = Number(format.format(at));
        if (h >= 8 && h < 22) {
          delay = Math.max(delay, Math.ceil((at - now) / 1000));
          break;
        }
      }
    }
  }
  if (
    delay > 0 &&
    target.kind !== "staff_notice" &&
    now + delay * 1000 >= planned
  )
    return { action: "skip", delay: 0 };
  return delay > 0 ? { action: "defer", delay } : send;
}
