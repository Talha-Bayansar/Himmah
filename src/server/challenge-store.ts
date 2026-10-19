import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../community/contracts.ts";
const pattern = (s: string) => "%" + s.replace(/[\\%_]/g, "\\$&") + "%";
const cursor = (p: PageInput, alias: string) =>
  p.after
    ? sql`and (${sql.raw(alias)}.created_at,${sql.raw(alias)}.id)<(${p.after.at}::timestamptz,${p.after.id}::uuid)`
    : sql``;
const fields = sql`c.id,c.name,c.description,c.points,c.status,c.version,c.starts_at::text as "startsAt",c.ends_at::text as "endsAt",c.created_at::text as "createdAt"`;
const submission = sql`s.id,s.challenge_id as "challengeId",s.challenge_name as "challengeName",s.points,s.challenge_version as "challengeVersion",s.note,s.status,s.version,s.created_at::text as "createdAt",s.submitted_at::text as "submittedAt",s.reviewed_at::text as "reviewedAt",s.feedback,coalesce((select sum(e.amount) from hub_points_entries e where e.organization_id=s.organization_id and e.person_id=s.person_id and (e.id=s.entry_id or e.original_id=s.entry_id)),s.points)::int as "currentPoints"`;
export type ChallengeStore = ReturnType<typeof createChallengeStore>;
export function createChallengeStore(
  url: string,
  execute?: (s: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url)),
    rows = (s: SQL) =>
      execute
        ? execute(s)
        : db.execute(s).then((r) => r.rows as Record<string, unknown>[]);
  const visibility = (user: string, org: string, self: boolean) =>
    self
      ? sql`(c.status='published' and hub_challenge_eligible(${org}::uuid,c.id,hub_participant_person(${user},${org}::uuid)) or exists(select 1 from hub_challenge_submissions mine where mine.organization_id=c.organization_id and mine.challenge_id=c.id and mine.person_id=hub_participant_person(${user},${org}::uuid)))`
      : sql`hub_is_admin(${user},${org}::uuid)`;
  const projection = (user: string, org: string, self: boolean) =>
    sql`${fields},(c.status='published' and (c.starts_at is null or c.starts_at<=now()) and (c.ends_at is null or c.ends_at>now())) as open,${self ? sql`hub_challenge_eligible(${org}::uuid,c.id,hub_participant_person(${user},${org}::uuid))` : sql`true`} as eligible,${self ? sql`'[]'::jsonb` : sql`coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'archived',g.archived) order by g.name) from hub_challenge_groups cg join hub_groups g on g.organization_id=cg.organization_id and g.id=cg.group_id where cg.organization_id=c.organization_id and cg.challenge_id=c.id),'[]'::jsonb)`} as groups,${self ? sql`(select jsonb_build_object('id',s.id,'challengeId',s.challenge_id,'challengeName',s.challenge_name,'points',s.points,'challengeVersion',s.challenge_version,'status',s.status,'version',s.version,'note',s.note,'feedback',s.feedback,'createdAt',s.created_at,'submittedAt',s.submitted_at,'reviewedAt',s.reviewed_at,'currentPoints',coalesce((select sum(e.amount) from hub_points_entries e where e.organization_id=s.organization_id and e.person_id=s.person_id and (e.id=s.entry_id or e.original_id=s.entry_id)),s.points)) from hub_challenge_submissions s where s.organization_id=c.organization_id and s.challenge_id=c.id and s.person_id=hub_participant_person(${user},${org}::uuid))` : sql`null::jsonb`} as submission`;
  return {
    access(user: string, org: string) {
      return rows(
        sql`select 1 where hub_participant_person(${user},${org}::uuid) is not null`,
      );
    },
    list(user: string, org: string, p: PageInput, self: boolean, view: string) {
      return rows(
        sql`select ${projection(user, org, self)} from hub_challenges c where c.organization_id=${org}::uuid and ${visibility(user, org, self)} and c.name ilike ${pattern(p.query)} ${self ? (view === "history" ? sql`and exists(select 1 from hub_challenge_submissions mine where mine.organization_id=c.organization_id and mine.challenge_id=c.id and mine.person_id=hub_participant_person(${user},${org}::uuid))` : sql`and c.status='published' and hub_challenge_eligible(${org}::uuid,c.id,hub_participant_person(${user},${org}::uuid))`) : sql`and c.status=${view}`} ${cursor(p, "c")} order by c.created_at desc,c.id desc limit ${p.limit + 1}`,
      );
    },
    get(user: string, org: string, id: string, self: boolean) {
      return rows(
        sql`select ${projection(user, org, self)} from hub_challenges c where c.organization_id=${org}::uuid and c.id=${id}::uuid and ${visibility(user, org, self)}`,
      );
    },
    submissions(
      user: string,
      org: string,
      id: string,
      p: PageInput,
      status: string,
    ) {
      return rows(
        sql`select ${submission},s.person_name as "personName",s.person_id as "personId",s.entry_id as "entryId",(s.status='pending' and not hub_participant_is_self(${user},${org}::uuid,s.person_id)) as "canReview" from hub_challenge_submissions s where s.organization_id=${org}::uuid and s.challenge_id=${id}::uuid and hub_is_admin(${user},${org}::uuid) and s.person_name ilike ${pattern(p.query)} ${status === "pending" ? sql`and s.status='pending'` : sql``} ${cursor(p, "s")} order by s.created_at desc,s.id desc limit ${p.limit + 1}`,
      );
    },
    submission(user: string, org: string, id: string, sid: string) {
      return rows(
        sql`select ${submission},s.person_name as "personName",s.person_id as "personId",s.entry_id as "entryId",(s.status='pending' and not hub_participant_is_self(${user},${org}::uuid,s.person_id)) as "canReview" from hub_challenge_submissions s where s.organization_id=${org}::uuid and s.challenge_id=${id}::uuid and s.id=${sid}::uuid and hub_is_admin(${user},${org}::uuid)`,
      );
    },
    candidates(user: string, org: string, id: string, p: PageInput) {
      return rows(
        sql`select p.id,p.name,p.created_at::text as "createdAt",s.version as "submissionVersion" from hub_people p left join hub_challenge_submissions s on s.organization_id=p.organization_id and s.person_id=p.id and s.challenge_id=${id}::uuid where p.organization_id=${org}::uuid and hub_is_admin(${user},${org}::uuid) and hub_challenge_eligible(${org}::uuid,${id}::uuid,p.id) and not hub_participant_is_self(${user},${org}::uuid,p.id) and (s.id is null or s.status in ('rejected','withdrawn')) and p.name ilike ${pattern(p.query)} ${cursor(p, "p")} order by p.created_at desc,p.id desc limit ${p.limit + 1}`,
      );
    },
    save(
      user: string,
      org: string,
      id: string | null,
      key: string,
      body: unknown,
    ) {
      return rows(
        sql`select hub_save_challenge(${user},${org}::uuid,${id}::uuid,${key}::uuid,${JSON.stringify(body)}::jsonb) as result`,
      );
    },
    submit(user: string, org: string, id: string, key: string, body: unknown) {
      return rows(
        sql`select hub_submit_challenge(${user},${org}::uuid,${id}::uuid,${key}::uuid,${JSON.stringify(body)}::jsonb) as result`,
      );
    },
    review(
      user: string,
      org: string,
      id: string,
      sid: string | null,
      key: string,
      body: unknown,
    ) {
      return rows(
        sql`select hub_review_challenge(${user},${org}::uuid,${id}::uuid,${sid}::uuid,${key}::uuid,${JSON.stringify(body)}::jsonb) as result`,
      );
    },
  };
}
