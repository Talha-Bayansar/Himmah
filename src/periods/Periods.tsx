import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Search,
  Pencil,
  Lock,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { ItemActions } from "../components/shared/item-actions";
import { useConfirmation } from "../components/shared/confirmation";
import {
  directoryRequest,
  useDirectoryPages,
  DirectoryError,
} from "../community/client";
import { PointsError } from "../points/PointsShared";
import { useLocale } from "../localization/locale";
import { getLocale } from "../paraglide/runtime.js";
import { m } from "../paraglide/messages.js";
import type { Organization } from "../organization/contracts";
import { PeriodEditor } from "./PeriodEditor";
import type {
  EngagementPeriod,
  PeriodMember,
  PeriodGroup,
  PeriodSummary,
} from "./contracts";
const failed = (q: {
  isError: boolean;
  isFetchNextPageError: boolean;
  error: unknown;
}) =>
  q.isError &&
  (!q.isFetchNextPageError ||
    (q.error instanceof DirectoryError &&
      ["forbidden", "not_found", "sign_in"].includes(q.error.code)));
export default function Periods({
  organization,
  userId,
  periodId = null,
  groupId = null,
  view = "members",
}: {
  organization: Organization;
  userId: string;
  periodId?: string | null;
  groupId?: string | null;
  view?: "members" | "groups";
}) {
  useLocale();
  const client = useQueryClient(),
    navigate = useNavigate(),
    confirm = useConfirmation();
  const base = "/api/organizations/" + organization.id + "/periods",
    scope = ["organization", userId, organization.id, "periods"];
  const [editor, setEditor] = useState<EngagementPeriod | "new" | null>(null),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [closed, setClosed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setSearch("");
    setQuery("");
  }, [view, groupId]);
  const detail = useQuery({
    queryKey: [...scope, "detail", periodId],
    enabled: !!periodId,
    queryFn: async ({ signal }) =>
      (
        await directoryRequest<{ item: EngagementPeriod }>(
          base + "/" + periodId,
          { signal },
        )
      ).item,
  });
  const period = detail.data;
  const summary = useQuery({
    queryKey: [...scope, periodId, period?.version, "summary", groupId],
    enabled: !!period && !detail.isError,
    queryFn: ({ signal }) =>
      directoryRequest<{
        item: PeriodSummary;
        group: { id: string; name: string } | null;
      }>(
        base +
          "/" +
          periodId +
          "/summary" +
          (groupId ? "?group=" + groupId : ""),
        { signal },
      ),
  });
  const list = useDirectoryPages<EngagementPeriod>(
    [...scope, "list", query, closed],
    base + "?q=" + encodeURIComponent(query) + "&archived=" + closed,
    { enabled: !periodId },
  );
  const report = useDirectoryPages<PeriodMember | PeriodGroup>(
    [...scope, periodId, period?.version, view, groupId, query],
    base +
      "/" +
      periodId +
      "/" +
      view +
      "?q=" +
      encodeURIComponent(query) +
      (groupId ? "&group=" + groupId : ""),
    { enabled: !!period && !detail.isError && (!groupId || !summary.isError) },
  );
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [period?.id, groupId, summary.data?.group?.id]);
  const close = useMutation({
    mutationFn: (item: EngagementPeriod) =>
      directoryRequest(base + "/" + item.id + "/close", {
        method: "POST",
        body: JSON.stringify({ version: item.version }),
      }),
    onSettled: () => client.invalidateQueries({ queryKey: scope }),
  });
  const closePeriod = async (item: EngagementPeriod) => {
    if (
      await confirm({
        title: m.periods_close(),
        description: m.periods_close_help(),
        confirmLabel: m.periods_close(),
        destructive: true,
      })
    )
      close.mutate(item);
  };
  const actions = (item: EngagementPeriod) =>
    item.closedAt
      ? []
      : [
          {
            label: m.periods_edit(),
            icon: Pencil,
            onSelect: () => setEditor(item),
          },
          {
            label: m.periods_close(),
            icon: Lock,
            destructive: true,
            onSelect: () => closePeriod(item),
          },
        ];
  const dates = (p: EngagementPeriod) => {
    const f = (d: string) =>
      new Intl.DateTimeFormat(getLocale(), {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(d + "T00:00Z"));
    return f(p.startDate) + " – " + f(p.endDate);
  };
  const searchBar = (
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
      {!periodId && (
        <label className="directory-archived">
          <Checkbox
            checked={closed}
            onCheckedChange={(v) => setClosed(v === true)}
          />
          {m.periods_show_closed()}
        </label>
      )}
    </div>
  );
  return (
    <section className="directory periods-page" key={periodId ?? "list"}>
      <Button variant="link" asChild className="settings-back">
        {periodId ? (
          groupId ? (
            <Link
              to="/workspace/$organizationId/periods/$periodId"
              params={{ organizationId: organization.id, periodId }}
              search={{ view: "groups" }}
            >
              <ArrowLeft aria-hidden="true" />
              {period?.name ?? m.periods_short()}
            </Link>
          ) : (
            <Link
              to="/workspace/$organizationId/$section"
              params={{ organizationId: organization.id, section: "periods" }}
            >
              <ArrowLeft aria-hidden="true" />
              {m.periods_short()}
            </Link>
          )
        ) : (
          <Link
            to="/workspace/$organizationId/$section"
            params={{ organizationId: organization.id, section: "manage" }}
          >
            <ArrowLeft aria-hidden="true" />
            {m.back_to_manage()}
          </Link>
        )}
      </Button>
      {close.isError && <PointsError error={close.error} />}
      {!periodId ? (
        <>
          <div className="directory-heading">
            <div>
              <h1 ref={heading} tabIndex={-1} data-page-heading>
                {m.periods_title()}
              </h1>
              <p>{m.periods_help()}</p>
            </div>
            <Button onClick={() => setEditor("new")}>
              <Plus aria-hidden="true" />
              {m.periods_create()}
            </Button>
          </div>
          {searchBar}
          {list.isPending ? (
            <ListSkeleton />
          ) : failed(list) ? (
            <PointsError
              error={list.error}
              pending={list.isFetching}
              retry={() => {
                void list.refetch();
              }}
            />
          ) : (
            <>
              <ul className="directory-list">
                {list.data?.pages
                  .flatMap((p) => p.items)
                  .map((item) => (
                    <li key={item.id}>
                      <div>
                        <Link
                          className="member-detail-link"
                          to="/workspace/$organizationId/periods/$periodId"
                          params={{
                            organizationId: organization.id,
                            periodId: item.id,
                          }}
                          search={{ view: "members" }}
                        >
                          <strong>{item.name}</strong>
                          <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                        <p>{dates(item)}</p>
                        <small>
                          {item.closedAt
                            ? m.periods_closed()
                            : m.periods_open()}
                        </small>
                      </div>
                      <ItemActions
                        name={item.name}
                        pending={
                          close.isPending && close.variables?.id === item.id
                        }
                        disabled={close.isPending}
                        actions={actions(item)}
                      />
                    </li>
                  ))}
              </ul>
              {list.data?.pages[0]?.items.length === 0 ? (
                <p className="directory-empty">{m.directory_empty()}</p>
              ) : (
                <InfiniteFooter
                  {...list}
                  fetchNextPage={() =>
                    list.fetchNextPage({ cancelRefetch: false })
                  }
                />
              )}
            </>
          )}
        </>
      ) : detail.isPending ? (
        <ListSkeleton />
      ) : detail.isError ? (
        <PointsError
          error={detail.error}
          pending={detail.isFetching}
          retry={() => {
            void detail.refetch();
          }}
        />
      ) : (
        period && (
          <>
            <div className="directory-heading">
              <div>
                <h1 ref={heading} tabIndex={-1} data-page-heading>
                  {groupId
                    ? (summary.data?.group?.name ?? m.periods_members())
                    : period.name}
                </h1>
                <p>
                  {groupId ? period.name + " · " : ""}
                  {dates(period)} · {period.timezone}
                </p>
              </div>
              <ItemActions
                name={period.name}
                pending={close.isPending}
                actions={actions(period)}
              />
            </div>
            <p className="period-report-help">
              {period.closedAt
                ? m.periods_closed_help()
                : m.periods_live_help()}
            </p>
            {period.closedAt && (
              <p className="period-report-help">
                {m.periods_closed_at({
                  date: new Intl.DateTimeFormat(getLocale(), {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: period.timezone,
                  }).format(new Date(period.closedAt)),
                })}
              </p>
            )}
            {summary.isPending ? (
              <ListSkeleton />
            ) : summary.isError ? (
              <PointsError
                error={summary.error}
                pending={summary.isFetching}
                retry={() => {
                  void summary.refetch();
                }}
              />
            ) : (
              <>
                <Metrics value={summary.data.item} />
                {!groupId && (
                  <nav className="period-tabs" aria-label={m.periods_title()}>
                    {(["members", "groups"] as const).map((tab) => (
                      <Button
                        key={tab}
                        variant={view === tab ? "default" : "outline"}
                        asChild
                      >
                        <Link
                          to="/workspace/$organizationId/periods/$periodId"
                          params={{ organizationId: organization.id, periodId }}
                          search={{ view: tab }}
                          aria-current={view === tab ? "page" : undefined}
                        >
                          {tab === "members"
                            ? m.periods_members()
                            : m.periods_groups()}
                        </Link>
                      </Button>
                    ))}
                  </nav>
                )}
                {view === "groups" && (
                  <p className="period-report-help">{m.periods_group_help()}</p>
                )}
                {searchBar}
                {report.isPending ? (
                  <ListSkeleton />
                ) : failed(report) ? (
                  <PointsError
                    error={report.error}
                    pending={report.isFetching}
                    retry={() => {
                      void report.refetch();
                    }}
                  />
                ) : (
                  <>
                    <ul className="directory-list period-report-list">
                      {report.data?.pages
                        .flatMap((p) => p.items)
                        .map((item) => (
                          <li key={item.id}>
                            <div className="period-report-heading">
                              <strong>{item.name}</strong>
                              {item.archived && (
                                <small>{m.periods_archived()}</small>
                              )}
                            </div>
                            <Metrics value={item} compact />
                            {view === "groups" && (
                              <Button variant="outline" asChild>
                                <Link
                                  to="/workspace/$organizationId/periods/$periodId"
                                  params={{
                                    organizationId: organization.id,
                                    periodId,
                                  }}
                                  search={{ view: "members", group: item.id }}
                                >
                                  <ArrowRight aria-hidden="true" />
                                  {m.directory_view_members()}
                                </Link>
                              </Button>
                            )}
                          </li>
                        ))}
                    </ul>
                    {report.data?.pages[0]?.items.length === 0 ? (
                      <p className="directory-empty">{m.directory_empty()}</p>
                    ) : (
                      <InfiniteFooter
                        {...report}
                        fetchNextPage={() =>
                          report.fetchNextPage({ cancelRefetch: false })
                        }
                      />
                    )}
                  </>
                )}
              </>
            )}
          </>
        )
      )}
      {editor && (
        <PeriodEditor
          path={base}
          timezone={editor === "new" ? organization.timezone : editor.timezone}
          {...(editor === "new" ? {} : { period: editor })}
          onClose={() => setEditor(null)}
          onSaved={async (item) => {
            setEditor(null);
            await client.invalidateQueries({ queryKey: scope });
            await navigate({
              to: "/workspace/$organizationId/periods/$periodId",
              params: { organizationId: organization.id, periodId: item.id },
              search: { view: "members" },
            });
          }}
        />
      )}
    </section>
  );
}
function Metrics({
  value,
  compact = false,
}: {
  value: Partial<PeriodSummary> & { points: string };
  compact?: boolean;
}) {
  const n = (amount: string | number) =>
    new Intl.NumberFormat(getLocale()).format(
      typeof amount === "string" ? BigInt(amount) : amount,
    );
  return (
    <dl className={compact ? "period-metrics compact" : "period-metrics"}>
      {value.members !== undefined && (
        <div>
          <dt>{m.directory_members()}</dt>
          <dd>{n(value.members)}</dd>
        </div>
      )}
      <div>
        <dt>{m.periods_points()}</dt>
        <dd>{n(value.points)}</dd>
      </div>
      {(["present", "absent", "excused", "unmarked"] as const).map((status) => (
        <div key={status}>
          <dt>{m[`attendance_${status}`]()}</dt>
          <dd>{n(value[status] ?? 0)}</dd>
        </div>
      ))}
    </dl>
  );
}
