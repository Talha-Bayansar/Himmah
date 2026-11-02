import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays } from "lucide-react";
import {
  DirectoryList,
  DirectoryItem,
  DirectoryRecord,
} from "../components/shared/directory-layout";
import { useLocale } from "../localization/locale";
import { sessionTitle } from "../activities/contracts";
import type { DashboardSession } from "./contracts";
/** One chronological session presentation for Home and the full planned-session list. */
export function SessionList({
  items,
  organizationId,
  label,
  compact = false,
}: {
  items: DashboardSession[];
  organizationId: string;
  label: string;
  compact?: boolean;
}) {
  const locale = useLocale()?.locale ?? "en";
  return (
    <DirectoryList label={label}>
      {items.map((item) => (
        <DirectoryItem key={item.id} linked>
          <Link
            className={
              compact
                ? "directory-item-link session-preview-link"
                : "directory-item-link"
            }
            to="/workspace/$organizationId/activities/$activityId/sessions/$sessionId"
            params={{
              organizationId,
              activityId: item.activityId,
              sessionId: item.id,
            }}
          >
            <DirectoryRecord
              name={sessionTitle(item)}
              detail={
                <>
                  {item.topic && !compact && <span>{item.name}</span>}
                  <time dateTime={item.startsAt}>
                    {compact && item.topic && `${item.name} · `}
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: item.timezone,
                    }).formatRange(
                      new Date(item.startsAt),
                      new Date(item.endsAt),
                    )}
                  </time>
                  {item.location && !compact && <span>{item.location}</span>}
                </>
              }
              icon={<CalendarDays aria-hidden="true" size={20} />}
            />
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </DirectoryItem>
      ))}
    </DirectoryList>
  );
}
