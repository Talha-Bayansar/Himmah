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
    if (target.quietEnabled !== false) {
      const start = Number.isInteger(target.quietStart)
        ? Number(target.quietStart)
        : 1320;
      const end = Number.isInteger(target.quietEnd)
        ? Number(target.quietEnd)
        : 480;
      const format = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: typeof target.timezone === "string" ? target.timezone : "UTC",
      });
      const localMinute = (at: number) => {
        const parts = format.formatToParts(at);
        return (
          Number(parts.find((p) => p.type === "hour")?.value) * 60 +
          Number(parts.find((p) => p.type === "minute")?.value)
        );
      };
      const quiet = (minute: number) =>
        start < end
          ? minute >= start && minute < end
          : minute >= start || minute < end;
      if (quiet(localMinute(now))) {
        let endAt: number | null = null;
        for (
          let at = Math.floor(now / 60000) * 60000 + 60000;
          at <= now + 48 * 3600000;
          at += 60000
        ) {
          if (!quiet(localMinute(at))) {
            endAt = at;
            break;
          }
        }
        if (endAt === null) return { action: "skip", delay: 0 };
        delay = Math.max(delay, Math.ceil((endAt - now) / 1000));
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
