import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search, ArrowRight, Coins } from "lucide-react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import {
  directoryRequest,
  useDirectoryPages,
  DirectoryError,
} from "../community/client";
import { PointsEditor } from "../points/PointsEditor";
import type { PointsResult } from "../points/contracts";
import { PointsResults, PointsError } from "../points/PointsShared";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import type { Organization } from "../organization/contracts";
import type { Person } from "../community/contracts";
export default function VolunteerMembers({
  organization,
  userId,
}: {
  organization: Organization;
  userId: string;
}) {
  useLocale();
  const client = useQueryClient();
  const [award, setAward] = useState(false);
  const [result, setResult] = useState<PointsResult | null>(null);
  const [search, setSearch] = useState(""),
    [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const scope = ["organization", userId, organization.id],
    base = "/api/organizations/" + organization.id;
  const access = useQuery({
    queryKey: [...scope, "my-access"],
    queryFn: ({ signal }) =>
      directoryRequest<{ item: { canAttend: boolean; canAward: boolean } }>(
        base + "/access/me",
        { signal },
      ),
  });
  const pages = useDirectoryPages<Person>(
    [...scope, "work-members", q],
    base + "/work/members?q=" + encodeURIComponent(q),
    { enabled: access.data?.item.canAward === true && !access.isError },
  );
  if (access.isPending) return <ListSkeleton />;
  if (access.isError)
    return (
      <PointsError
        error={access.error}
        pending={access.isFetching}
        retry={() => {
          void access.refetch();
        }}
      />
    );
  return (
    <section className="directory">
      <div className="directory-heading">
        <div>
          <h1 tabIndex={-1} data-page-heading>
            {m.directory_members()}
          </h1>
          <p>{m.access_work_help()}</p>
        </div>
        {access.data.item.canAward && (
          <Button onClick={() => setAward(true)}>
            <Coins aria-hidden="true" />
            {m.points_award()}
          </Button>
        )}
      </div>
      {result && <PointsResults result={result} />}
      {award && access.data.item.canAward && (
        <PointsEditor
          organization={organization}
          userId={userId}
          onClose={() => setAward(false)}
          onSaved={async (saved) => {
            setAward(false);
            setResult(saved);
            await client.invalidateQueries({ queryKey: scope });
          }}
        />
      )}
      {!access.data.item.canAward ? (
        <p className="directory-empty">{m.access_no_work()}</p>
      ) : (
        <>
          <div className="directory-toolbar">
            <label>
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">{m.directory_search()}</span>
              <Input
                type="search"
                maxLength={80}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={m.directory_search()}
              />
            </label>
          </div>
          {pages.isPending ? (
            <ListSkeleton />
          ) : pages.isError &&
            (!pages.isFetchNextPageError ||
              (pages.error instanceof DirectoryError &&
                ["forbidden", "not_found", "sign_in"].includes(
                  pages.error.code,
                ))) ? (
            <PointsError
              error={pages.error}
              pending={pages.isFetching}
              retry={() => {
                void pages.refetch();
              }}
            />
          ) : (
            <>
              <ul className="directory-list">
                {pages.data?.pages
                  .flatMap((p) => p.items)
                  .map((item) => (
                    <li key={item.id}>
                      <strong>{item.name}</strong>
                      <Button variant="outline" asChild>
                        <Link
                          to="/workspace/$organizationId/members/$memberId"
                          params={{
                            organizationId: organization.id,
                            memberId: item.id,
                          }}
                        >
                          <ArrowRight aria-hidden="true" />
                          {m.points_member()}
                        </Link>
                      </Button>
                    </li>
                  ))}
              </ul>
              {pages.data?.pages[0]?.items.length === 0 ? (
                <p className="directory-empty">{m.directory_empty()}</p>
              ) : (
                <InfiniteFooter
                  {...pages}
                  fetchNextPage={() =>
                    pages.fetchNextPage({ cancelRefetch: false })
                  }
                />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
