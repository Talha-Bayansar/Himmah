import { CancelSessionsPage } from "../activities/CancelSessionsPage";
import { SchedulePage } from "../activities/SchedulePage";
import { PeopleScope } from "../modules/people/PeopleShell";
import { ErrorNotice as PeopleError } from "../modules/people/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import OrganizationPortal from "./OrganizationPortal";
import type { Organization } from "./contracts";
import {
  formReturn,
  type PageForm,
} from "../components/shared/form-navigation";
import { ListSkeleton } from "../components/shared/infinite-list";
import { CollectionError } from "../components/shared/collection-error";
import { directoryRequest } from "../community/client";
import { EntityEditor } from "../activities/EntityEditor";
import { AccessEditor } from "../access/AccessEditor";
import { TypeEditor } from "../modules/people/RelationshipTypes";
import { RelationshipEditor } from "../modules/people/ContactLinks";
import { AssignmentEditor } from "../modules/people/Communication";
import { AddMembers } from "../modules/people/Groups";
import type { Activity } from "../activities/contracts";
import type { AccessAssignment } from "../access/contracts";
import type {
  Contact,
  PeopleGroup,
  RelationshipType,
} from "../modules/people/contracts";
import { m } from "../paraglide/messages.js";

export default function WorkflowPage({
  organizationId,
  form,
  recordId,
}: {
  organizationId: string;
  form: PageForm;
  recordId: string;
}) {
  return (
    <OrganizationPortal
      initialMode="signin"
      workspaceId={organizationId}
      workspaceSection={
        form === "activity" ||
        form === "session-series" ||
        form === "session-schedule" ||
        form === "session-cancel"
          ? "activities"
          : form === "access" || form === "relationship-type"
            ? "manage"
            : "people"
      }
    >
      {(user, organization) =>
        ["owner", "admin"].includes(organization.role) ? (
          [
            "activity",
            "access",
            "session-series",
            "session-schedule",
            "session-cancel",
          ].includes(form) ? (
            <Workflow
              key={user + organizationId + form + recordId}
              user={user}
              organization={organization}
              form={form}
              recordId={recordId}
            />
          ) : (
            <PeopleScope
              organizationId={organizationId}
              section={form === "group-members" ? "groups" : "contacts"}
              tabs={false}
            >
              {(scopedUser) => (
                <Workflow
                  key={scopedUser + organizationId + form + recordId}
                  user={scopedUser}
                  organization={organization}
                  form={form}
                  recordId={recordId}
                />
              )}
            </PeopleScope>
          )
        ) : (
          <p role="alert">{m.people_denied()}</p>
        )
      }
    </OrganizationPortal>
  );
}
export function Workflow(props: {
  user: string;
  organization: Organization;
  form: PageForm;
  recordId: string;
}) {
  if (props.form === "session-cancel") return <CancelSessionsPage {...props} />;
  if (props.form === "session-series" || props.form === "session-schedule")
    return <SchedulePage {...props} />;
  return <RecordWorkflow {...props} />;
}
function RecordWorkflow({
  user,
  organization,
  form,
  recordId,
}: {
  user: string;
  organization: Organization;
  form: PageForm;
  recordId: string;
}) {
  const navigate = useNavigate(),
    cache = useQueryClient(),
    org = organization.id;
  const returnTo = useRouterState({
    select: (state) =>
      (state.location.search as { returnTo?: unknown }).returnTo,
  });
  const safeReturn = formReturn(returnTo, org);
  const base = `/api/organizations/${org}`;
  const people = base + "/people";
  const endpoint =
    form === "activity"
      ? base + "/activities"
      : form === "access"
        ? base + "/access"
        : form === "relationship-type"
          ? people + "/relationship-types"
          : form === "group-members"
            ? people + "/groups"
            : people + "/contacts";
  const detail = useQuery({
    queryKey: [
      form === "activity" || form === "access" ? "organization" : "people",
      user,
      org,
      "workflow",
      form,
      recordId,
    ],
    enabled: recordId !== "new",
    staleTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      directoryRequest<Record<string, unknown>>(endpoint + "/" + recordId, {
        signal,
      }),
  });
  // Allow the successful mutation state to reach form navigation guards before leaving.
  const close = () => {
    setTimeout(() => {
      if (safeReturn) {
        void navigate({ to: safeReturn, replace: true });
        return;
      }
      if (form === "activity")
        void navigate({
          to: "/workspace/$organizationId/$section",
          params: { organizationId: org, section: "activities" },
          replace: true,
        });
      else if (form === "access")
        void navigate({
          to: "/workspace/$organizationId/$section",
          params: { organizationId: org, section: "access" },
          replace: true,
        });
      else if (form === "relationship-type")
        void navigate({
          to: "/workspace/$organizationId/manage/relationship-types",
          params: { organizationId: org },
          replace: true,
        });
      else if (form === "group-members")
        void navigate({
          to: "/workspace/$organizationId/people/groups/$groupId",
          params: { organizationId: org, groupId: recordId },
          replace: true,
        });
      else
        void navigate({
          to: "/workspace/$organizationId/people/contacts/$contactId",
          params: { organizationId: org, contactId: recordId },
          replace: true,
        });
    }, 0);
  };
  if (recordId !== "new" && detail.isPending) return <ListSkeleton />;
  if (recordId !== "new" && detail.isError)
    return form === "activity" || form === "access" ? (
      <CollectionError
        error={detail.error}
        retry={() => void detail.refetch()}
      />
    ) : (
      <PeopleError error={detail.error} retry={() => void detail.refetch()} />
    );
  const record = detail.data;
  if (form === "activity")
    return (
      <EntityEditor
        kind="activity"
        activity={record ? (record.item as Activity) : null}
        organization={organization}
        userId={user}
        onClose={close}
        onSave={async (value, key) => {
          await directoryRequest(
            endpoint + (recordId === "new" ? "" : "/" + recordId),
            {
              method: recordId === "new" ? "POST" : "PATCH",
              body: JSON.stringify({
                ...value,
                ...(recordId === "new"
                  ? { key }
                  : { version: (record!.item as Activity).version }),
              }),
            },
          );
          await cache.invalidateQueries({
            queryKey: ["organization", user, org, "activities"],
          });
        }}
      />
    );
  if (form === "access")
    return (
      <AccessEditor
        base={base}
        scope={["organization", user, org, "access"]}
        {...(record ? { assignment: record.item as AccessAssignment } : {})}
        onClose={close}
        onSaved={async () => {
          await cache.invalidateQueries({
            queryKey: ["organization", user, org],
          });
          close();
        }}
      />
    );
  if (form === "relationship-type")
    return (
      <TypeEditor
        org={org}
        user={user}
        type={record as RelationshipType | undefined}
        onClose={close}
      />
    );
  if (form === "group-members")
    return (
      <AddMembers
        org={org}
        user={user}
        group={record as PeopleGroup}
        onClose={close}
      />
    );
  if (form === "relationship")
    return (
      <RelationshipEditor
        org={org}
        user={user}
        contact={record as Contact}
        onClose={close}
      />
    );
  return (
    <AssignmentEditor
      org={org}
      user={user}
      contact={record as Contact}
      onClose={close}
    />
  );
}
