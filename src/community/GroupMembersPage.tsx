import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";
import { Alert, AlertDescription } from "../components/ui/alert";
import { ActionButton } from "../components/shared/action-button";
import { ListSkeleton } from "../components/shared/infinite-list";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import type { Organization } from "../organization/contracts";
import type { Group } from "./contracts";
import { directoryRequest, directoryMessage } from "./client";
import Directory from "./Directory";

export default function GroupMembersPage({
  organization,
  userId,
  groupId,
}: {
  organization: Organization;
  userId: string;
  groupId: string;
}) {
  useLocale();
  const page = useRef<HTMLDivElement>(null);
  const group = useQuery({
    queryKey: [
      "organization",
      userId,
      organization.id,
      "directory",
      "group",
      groupId,
    ],
    queryFn: async ({ signal }) =>
      (
        await directoryRequest<{ item: Group }>(
          `/api/organizations/${organization.id}/groups/${groupId}`,
          { signal },
        )
      ).item,
  });
  useEffect(() => {
    page.current
      ?.querySelector<HTMLElement>("[data-page-heading]")
      ?.focus({ preventScroll: true });
  }, [group.data?.id]);
  return (
    <div ref={page}>
      <Button variant="link" asChild className="settings-back">
        <Link
          to="/workspace/$organizationId/$section"
          params={{ organizationId: organization.id, section: "groups" }}
        >
          <ArrowLeft size={16} />
          {m.directory_groups()}
        </Link>
      </Button>
      {group.isPending ? (
        <ListSkeleton />
      ) : group.isError ? (
        <div className="space-y-3">
          <Alert variant="destructive" role="alert">
            <AlertDescription>{directoryMessage(group.error)}</AlertDescription>
          </Alert>
          <ActionButton
            variant="outline"
            pending={group.isFetching}
            onClick={() => {
              void group.refetch();
            }}
          >
            {m.try_again()}
          </ActionButton>
        </div>
      ) : (
        <Directory
          key={group.data.id}
          organization={organization}
          userId={userId}
          section="people"
          group={group.data}
        />
      )}
    </div>
  );
}
