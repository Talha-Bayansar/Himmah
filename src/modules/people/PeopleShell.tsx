import { useState, useCallback, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { m } from "../../paraglide/messages.js";
import { useLocale } from "../../localization/locale";
import { Button } from "../../components/ui/button";
import { RouteTabs } from "../../components/shared/route-tabs";
import { ListSkeleton } from "../../components/shared/infinite-list";
import { request } from "./client";
import { peopleBase, ErrorNotice, PeopleAccessFailure } from "./shared";
export function PeopleShell({
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
      <main className="mx-auto max-w-3xl p-4">
        <ListSkeleton />
      </main>
    );
  if (account.isError || !account.data?.user.emailVerified)
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <p>{m.people_signin()}</p>
        <Button asChild>
          <Link to="/start">{m.continue_action()}</Link>
        </Button>
      </main>
    );
  if (denied?.org === organizationId && denied.actor === account.data.user.id)
    return (
      <main className="mx-auto max-w-3xl p-4">
        <ErrorNotice error={denied.error} />
      </main>
    );
  if (context.isError || !context.data)
    return (
      <main className="mx-auto max-w-3xl p-4">
        <ErrorNotice error={context.error} retry={context.refetch} />
      </main>
    );
  return (
    <main
      className="mx-auto max-w-3xl space-y-6 p-4 pb-12"
      key={account.data.user.id + organizationId}
    >
      <header className="flex items-center justify-between gap-3">
        <span>{context.data.name}</span>
        <Button variant="ghost" asChild>
          <Link to="/settings">{m.people_profile()}</Link>
        </Button>
      </header>
      <Button variant="link" className="px-0" asChild>
        <Link
          to="/workspace/$organizationId/$section"
          params={{ organizationId, section: "manage" }}
        >
          {m.manage_title()}
        </Link>
      </Button>
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
    </main>
  );
}
