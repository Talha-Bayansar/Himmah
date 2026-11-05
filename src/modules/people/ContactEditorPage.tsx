import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { PeopleShell } from "./PeopleShell";
import { Editor } from "./Contacts";
import { request } from "./client";
import { peopleBase, ErrorNotice } from "./shared";
import { ListSkeleton } from "../../components/shared/infinite-list";
import type { Contact } from "./contracts";
export default function ContactEditorPage({
  org,
  id,
}: {
  org: string;
  id?: string | undefined;
}) {
  return (
    <PeopleShell organizationId={org} section="contacts" tabs={false}>
      {(user) => <Page org={org} user={user} id={id} />}
    </PeopleShell>
  );
}
function Page({
  org,
  user,
  id,
}: {
  org: string;
  user: string;
  id?: string | undefined;
}) {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["people", user, org, "contact", id],
    queryFn: ({ signal }) =>
      request<Contact>(peopleBase(org) + "/contacts/" + id, { signal }),
    enabled: !!id,
    retry: false,
  });
  if (id && query.isPending) return <ListSkeleton />;
  if (id && query.isError)
    return <ErrorNotice error={query.error} retry={query.refetch} />;
  return (
    <Editor
      key={id ?? "new"}
      page
      org={org}
      user={user}
      {...(id && query.data ? { contact: query.data } : {})}
      onClose={() =>
        void (id
          ? navigate({
              to: "/workspace/$organizationId/people/contacts/$contactId",
              params: { organizationId: org, contactId: id },
            })
          : navigate({
              to: "/workspace/$organizationId/people/contacts",
              params: { organizationId: org },
            }))
      }
    />
  );
}
