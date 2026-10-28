import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useState, type ReactNode } from "react";
import { ListSkeleton } from "../../components/shared/infinite-list";
import { RouteTabs } from "../../components/shared/route-tabs";
import { Button } from "../../components/ui/button";
import { useLocale } from "../../localization/locale";
import OrganizationPortal from "../../organization/OrganizationPortal";
import { m } from "../../paraglide/messages.js";
import { request } from "./client";
import { ErrorNotice, PeopleAccessFailure, peopleBase } from "./shared";
function PeopleScope({
  organizationId,
  section,
  tabs = true,
  children,
}: {
  organizationId: string;
  section: "contacts" | "groups";
  tabs?: boolean;
  children: (user: string) => ReactNode;
}) {
  useLocale();
  const qc = useQueryClient();
  const [denied, setDenied] = useState<{
    org: string;
    actor: string;
    error: unknown;
  } | null>(null);
  const reportDenied = useCallback(
    (error: unknown) => {
      setDenied({
        org: organizationId,
        actor:
          qc.getQueryData<{ user: { id: string } }>(["people-account"])?.user
            .id ?? "",
        error,
      });
      void qc.cancelQueries({ queryKey: ["people"] });
      qc.removeQueries({ queryKey: ["people"] });
    },
    [qc, organizationId],
  );
  const account = useQuery({
    queryKey: ["people-account"],
    queryFn: ({ signal }) =>
      request<{ user: { id: string; emailVerified: boolean } }>(
        "/api/account",
        { signal },
      ),
    retry: false,
  });
  const context = useQuery({
    queryKey: ["people-context", account.data?.user.id, organizationId],
    enabled: !!account.data?.user.emailVerified,
    queryFn: ({ signal }) =>
      request<{ id: string; name: string }>(
        peopleBase(organizationId) + "/context",
        { signal },
      ),
    retry: false,
    staleTime: 60_000,
  });
  if (
    account.isPending ||
    (account.data?.user.emailVerified && context.isPending)
  )
    return (
      <section className="people-scope">
        <ListSkeleton />
      </section>
    );
  if (account.isError || !account.data?.user.emailVerified)
    return (
      <section className="people-scope">
        <p>{m.people_signin()}</p>
        <Button asChild>
          <Link to="/start">{m.continue_action()}</Link>
        </Button>
      </section>
    );
  if (denied?.org === organizationId && denied.actor === account.data.user.id)
    return (
      <section className="people-scope">
        <ErrorNotice error={denied.error} />
      </section>
    );
  if (context.isError || !context.data)
    return (
      <section className="people-scope">
        <ErrorNotice error={context.error} retry={context.refetch} />
      </section>
    );
  return (
    <section
      className="people-scope space-y-6"
      key={account.data.user.id + organizationId}
    >
      {tabs && (
        <RouteTabs aria-label={m.people_navigation()}>
          <Link
            to="/workspace/$organizationId/people/contacts"
            params={{ organizationId }}
            aria-current={section === "contacts" ? "page" : undefined}
          >
            {m.people_contacts()}
          </Link>
          <Link
            to="/workspace/$organizationId/people/groups"
            params={{ organizationId }}
            aria-current={section === "groups" ? "page" : undefined}
          >
            {m.people_groups()}
          </Link>
        </RouteTabs>
      )}
      <PeopleAccessFailure.Provider value={reportDenied}>
        {children(account.data.user.id)}
      </PeopleAccessFailure.Provider>
    </section>
  );
}

export function PeopleShell(props: Parameters<typeof PeopleScope>[0]) {
  return (
    <OrganizationPortal
      workspaceId={props.organizationId}
      workspaceSection="people"
    >
      {() => <PeopleScope {...props} />}
    </OrganizationPortal>
  );
}
