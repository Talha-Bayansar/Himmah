import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../community/contracts.ts";
const actor = (user: string, org: string) =>
  sql`exists(select 1 from hub_memberships where organization_id=${org}::uuid and user_id=${user} and role in ('owner','admin'))`;
const projection = sql`id,name,start_date::text as "startDate",end_date::text as "endDate",timezone,version,closed_at::text as "closedAt",created_at::text as "createdAt"`;
const cursor = (p: PageInput, at: SQL, id: SQL) =>
  p.after
    ? sql`and (${at},${id})<(${p.after.at}::timestamptz,${p.after.id}::uuid)`
    : sql``;
const pattern = (q: string) => "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
const report = (user: string, org: string, id: string) =>
  sql`period as(select * from hub_engagement_periods where organization_id=${org}::uuid and id=${id}::uuid and ${actor(user, org)}), report as(select r.* from period p cross join lateral hub_period_live_members(${org}::uuid,p.start_date,p.end_date,p.timezone) r where p.closed_at is null union all select m.person_id,m.name,m.archived,m.person_created_at,m.points,m.present,m.absent,m.excused,m.unmarked,m.group_ids from hub_period_members m join period p on p.id=m.period_id and p.organization_id=m.organization_id where p.closed_at is not null), report_groups as(select g.id,g.name,g.archived,g.created_at from hub_groups g cross join period p where p.closed_at is null and g.organization_id=p.organization_id union all select g.group_id,g.name,g.archived,g.group_created_at from hub_period_groups g join period p on p.id=g.period_id and p.organization_id=g.organization_id where p.closed_at is not null)`;
const metrics = sql`count(*)::int as members,coalesce(sum(points),0)::text as points,coalesce(sum(present),0)::int as present,coalesce(sum(absent),0)::int as absent,coalesce(sum(excused),0)::int as excused,coalesce(sum(unmarked),0)::int as unmarked`;
export type PeriodStore = ReturnType<typeof createPeriodStore>;
export function createPeriodStore(
  url: string,
  execute?: (statement: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url)),
    rows = async (st: SQL) =>
      execute
        ? execute(st)
        : ((await db.execute(st)).rows as Record<string, unknown>[]);
  return {
    list(user: string, org: string, p: PageInput) {
      return rows(
        sql`select ${projection} from hub_engagement_periods where organization_id=${org}::uuid and ${actor(user, org)} and (closed_at is not null)=${p.archived} and name ilike ${pattern(p.query)} ${cursor(p, sql`created_at`, sql`id`)} order by created_at desc,id desc limit ${p.limit + 1}`,
      );
    },
    get(user: string, org: string, id: string) {
      return rows(
        sql`select ${projection} from hub_engagement_periods where organization_id=${org}::uuid and id=${id}::uuid and ${actor(user, org)}`,
      );
    },
    save(
      user: string,
      org: string,
      id: string | null,
      key: string | null,
      payload: Record<string, unknown>,
    ) {
      return rows(
        sql`select hub_save_period(${user},${org}::uuid,${id}::uuid,${key}::uuid,${JSON.stringify(payload)}::jsonb) as result`,
      );
    },
    summary(user: string, org: string, id: string, group?: string) {
      return rows(
        sql`with ${report(user, org, id)} select ${metrics} from report ${group ? sql`where ${group}::uuid=any(group_ids)` : sql``}`,
      );
    },
    members(user: string, org: string, id: string, p: PageInput) {
      return rows(
        sql`with ${report(user, org, id)} select person_id as id,name,archived,person_created_at::text as "createdAt",points::text,present,absent,excused,unmarked from report where name ilike ${pattern(p.query)} ${p.groupId ? sql`and ${p.groupId}::uuid=any(group_ids)` : sql``} ${cursor(p, sql`person_created_at`, sql`person_id`)} order by person_created_at desc,person_id desc limit ${p.limit + 1}`,
      );
    },
    groups(user: string, org: string, id: string, p: PageInput) {
      return rows(
        sql`with ${report(user, org, id)} select g.id,g.name,g.archived,g.created_at::text as "createdAt",(select ${sql`json_build_object('members',count(*)::int,'points',coalesce(sum(points),0)::text,'present',coalesce(sum(present),0)::int,'absent',coalesce(sum(absent),0)::int,'excused',coalesce(sum(excused),0)::int,'unmarked',coalesce(sum(unmarked),0)::int)`} from report r where g.id=any(r.group_ids)) as totals from report_groups g where g.name ilike ${pattern(p.query)} ${cursor(p, sql`g.created_at`, sql`g.id`)} order by g.created_at desc,g.id desc limit ${p.limit + 1}`,
      ).then((items) =>
        items.map(({ totals, ...item }) => ({
          ...item,
          ...(totals as object),
        })),
      );
    },
    group(user: string, org: string, id: string, group: string) {
      return rows(
        sql`with ${report(user, org, id)} select id,name,archived from report_groups where id=${group}::uuid`,
      );
    },
  };
}
