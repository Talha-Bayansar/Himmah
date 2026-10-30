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
}: {
  items: DashboardSession[];
  organizationId: string;
  label: string;
}) {
  const locale = useLocale()?.locale ?? "en";
  return (
    <DirectoryList label={label}>
      {items.map((item) => (
        <DirectoryItem key={item.id} linked>
          <Link
            className="directory-item-link"
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
                  {item.topic && <span>{item.name}</span>}
                  <time dateTime={item.startsAt}>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: item.timezone,
                    }).formatRange(
                      new Date(item.startsAt),
                      new Date(item.endsAt),
                    )}
                  </time>
                  {item.location && <span>{item.location}</span>}
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
