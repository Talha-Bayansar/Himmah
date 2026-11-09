import { nameField, nameAfter, nameOrder } from "./name-order.ts";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PageInput } from "../community/contracts.ts";
const pattern = (q: string) => "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
const after = (p: PageInput, at: SQL, id: SQL) =>
  p.after
    ? sql`and (${at},${id})<(${p.after.at}::timestamptz,${p.after.id}::uuid)`
    : sql``;
const itemFields = sql`i.id,i.title,i.description,i.activity_id as "activityId",i.session_id as "sessionId",a.name as "activityName",s.topic as "sessionTopic",i.draft,(i.draft is distinct from (select lv.content from hub_learning_versions lv where lv.organization_id=i.organization_id and lv.id=i.current_publication)) as "hasDraftChanges",i.state,i.version,i.current_publication as "currentPublication",i.created_at::text as "createdAt"`;
export type LearningStore = ReturnType<typeof createLearningStore>;
export function createLearningStore(
  url: string,
  execute?: (s: SQL) => Promise<Record<string, unknown>[]>,
) {
  const db = drizzle(neon(url));
  const rows = async (s: SQL) =>
    execute
      ? execute(s)
      : ((await db.execute(s)).rows as Record<string, unknown>[]);
  return {
    command: (
      actor: string,
      org: string,
      item: string,
      key: string,
      p: Record<string, unknown>,
    ) =>
      rows(
        sql`select hub_learning_staff(${actor},${org}::uuid,${item}::uuid,${key}::uuid,${JSON.stringify(p)}::jsonb) as result`,
      ),
    public: (item: string, credential: string, resume: string) =>
      rows(
        sql`select hub_learning_public(${item}::uuid,${credential},${resume}) as result`,
      ),
    participate: (
      item: string,
      credential: string,
      resume: string,
      key: string,
      p: Record<string, unknown>,
    ) =>
      rows(
        sql`select hub_learning_participate(${item}::uuid,${credential},${resume},${key}::uuid,${JSON.stringify(p)}::jsonb) as result`,
      ),
    list: (
      actor: string,
      org: string,
      p: PageInput,
      activity: string | null,
      session: string | null,
    ) =>
      rows(
        sql`select i.id,i.title,i.description,i.state,i.created_at::text as "createdAt",a.name as "activityName",s.topic as "sessionTopic" from hub_learning_items i left join hub_activities a on a.organization_id=i.organization_id and a.id=i.activity_id left join hub_activity_sessions s on s.organization_id=i.organization_id and s.id=i.session_id where i.organization_id=${org}::uuid and hub_learning_admin(${actor},${org}::uuid) and i.title ilike ${pattern(p.query)} ${activity ? sql`and i.activity_id=${activity}::uuid` : sql``} ${session ? sql`and i.session_id=${session}::uuid` : sql``} ${after(p, sql`i.created_at`, sql`i.id`)} order by i.created_at desc,i.id desc limit ${p.limit + 1}`,
      ),
    detail: async (
      actor: string,
      org: string,
      id: string,
      publication: string | null,
    ) => {
      const items = await rows(
        sql`select ${itemFields} from hub_learning_items i left join hub_activities a on a.organization_id=i.organization_id and a.id=i.activity_id left join hub_activity_sessions s on s.organization_id=i.organization_id and s.id=i.session_id where i.organization_id=${org}::uuid and i.id=${id}::uuid and hub_learning_admin(${actor},${org}::uuid)`,
      );
      if (!items[0]) return null;
      const selected =
        publication ?? (items[0].currentPublication as string | null);
      const versions = await rows(
        sql`select v.id,v.number from hub_learning_versions v where v.organization_id=${org}::uuid and v.item_id=${id}::uuid and hub_learning_admin(${actor},${org}::uuid) order by v.number desc limit 50`,
      );
      const publications = selected
        ? await rows(
            sql`select v.id,v.number,v.released,(v.open_hash is not null) as "hasLink",v.content from hub_learning_versions v where v.organization_id=${org}::uuid and v.item_id=${id}::uuid and v.id=${selected}::uuid and hub_learning_admin(${actor},${org}::uuid)`,
          )
        : [];
      const counts = await rows(
        sql`select count(*)::int as assigned,count(*) filter(where exists(select 1 from hub_learning_attempts a where a.organization_id=r.organization_id and a.recipient_id=r.id))::int as started,count(*) filter(where exists(select 1 from hub_learning_attempts a where a.organization_id=r.organization_id and a.recipient_id=r.id and a.submitted_at is not null))::int as submitted from hub_learning_recipients r where r.organization_id=${org}::uuid and r.publication_id=${selected}::uuid and hub_learning_admin(${actor},${org}::uuid)`,
      );
      return {
        item: items[0],
        publication: publications[0] ?? null,
        versions,
        counts: counts[0],
      };
    },
    insights: async (
      actor: string,
      org: string,
      item: string,
      publication: string,
    ) => {
      // One snapshot, bounded output (50 questions / 6 choices). No participant data leaves SQL.
      const data = await rows(sql`with publication as materialized (
        select v.id,v.number,v.content,jsonb_array_length(v.content->'questions') as total
        from hub_learning_versions v
        where v.organization_id=${org}::uuid and v.item_id=${item}::uuid and v.id=${publication}::uuid
          and hub_learning_admin(${actor},${org}::uuid)
      ), participants as materialized (
        select r.id,r.revoked,latest.id as latest_id,latest.submitted_at as latest_submitted,
          submitted.id as submitted_id,submitted.score,submitted.answers
        from publication v join hub_learning_recipients r on r.publication_id=v.id and r.organization_id=${org}::uuid
        left join lateral (
          select a.id,a.submitted_at from hub_learning_attempts a
          where a.organization_id=r.organization_id and a.recipient_id=r.id order by a.sequence desc limit 1
        ) latest on true
        left join lateral (
          select a.id,a.score,a.answers from hub_learning_attempts a
          where a.organization_id=r.organization_id and a.recipient_id=r.id and a.submitted_at is not null
          order by a.sequence desc limit 1
        ) submitted on true
      ), totals as (
        select count(*)::int as participants,count(submitted_id)::int as completed,
          count(*) filter(where latest_id is not null and latest_submitted is null)::int as "inProgress",
          count(*) filter(where latest_id is null)::int as "notStarted",
          count(*) filter(where revoked)::int as revoked,avg(score)::float8 as "averageScore" from participants
      ), answer_counts as materialized (
        select a.key,a.value,count(*)::int as count
        from participants p cross join lateral jsonb_each_text(p.answers) a
        where p.submitted_id is not null group by a.key,a.value
      ), questions as (
        select (q.ordinality-1)::int as index,q.value as question,
          coalesce((select sum(a.count)::int from answer_counts a where a.key=(q.ordinality-1)::text and a.value=q.value->>'correct'),0) as correct,
          coalesce((select sum(a.count)::int from answer_counts a where a.key=(q.ordinality-1)::text and a.value<>q.value->>'correct'),0) as incorrect,
          (select completed from totals)-coalesce((select sum(a.count)::int from answer_counts a where a.key=(q.ordinality-1)::text),0) as unanswered,
          (select jsonb_agg(jsonb_build_object('text',c.value,'correct',(c.ordinality-1)=(q.value->>'correct')::int,
            'count',coalesce((select a.count from answer_counts a where a.key=(q.ordinality-1)::text and a.value=(c.ordinality-1)::text),0)) order by c.ordinality)
           from jsonb_array_elements_text(q.value->'choices') with ordinality c) as choices
        from publication v cross join lateral jsonb_array_elements(v.content->'questions') with ordinality q
      ) select v.id as "publicationId",v.number,v.content->>'mode' as mode,v.total as "questionCount",now()::text as "generatedAt",t.*,
        (select jsonb_agg(jsonb_build_object('score',n,'count',(select count(*)::int from participants p where p.submitted_id is not null and p.score=n)) order by n) from generate_series(0,v.total) n) as distribution,
        (select jsonb_agg(jsonb_build_object('index',q.index,'text',q.question->>'text','correct',q.correct,'incorrect',q.incorrect,'unanswered',q.unanswered,'choices',q.choices) order by q.index) from questions q) as questions
      from publication v cross join totals t`);
      return data[0] ?? null;
    },
    participants: (
      actor: string,
      org: string,
      id: string,
      pub: string,
      p: PageInput,
      results: boolean,
    ) =>
      rows(
        sql`select ${nameField(sql`r.name`)},r.id,r.name,r.contact_id as "contactId",r.revoked,r.allowance,r.revision,r.created_at::text as "createdAt",coalesce(a.sequence,0) as attempts,a.score,a.submitted_at as "submittedAt",case when a.id is null then 'invited' when a.submitted_at is null then 'started' else 'submitted' end as status from hub_learning_recipients r join hub_learning_versions v on v.organization_id=r.organization_id and v.id=r.publication_id left join lateral(select id,sequence,score,submitted_at from hub_learning_attempts where organization_id=r.organization_id and recipient_id=r.id order by sequence desc limit 1)a on true where r.organization_id=${org}::uuid and v.item_id=${id}::uuid and v.id=${pub}::uuid and hub_learning_admin(${actor},${org}::uuid) and r.name ilike ${pattern(p.query)} ${results ? sql`and exists(select 1 from hub_learning_attempts x where x.organization_id=r.organization_id and x.recipient_id=r.id and x.submitted_at is not null)` : sql``} ${nameAfter(p, sql`r.name`, sql`r.id`)} order by ${nameOrder(sql`r.name`, sql`r.id`)} limit ${p.limit + 1}`,
      ),
    result: (actor: string, org: string, id: string, recipient: string) =>
      rows(
        sql`select r.id,r.name,r.contact_id as "contactId",v.content->'questions' as questions,coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'sequence',a.sequence,'answers',a.answers,'score',a.score,'submittedAt',a.submitted_at) order by a.sequence desc) from hub_learning_attempts a where a.organization_id=r.organization_id and a.recipient_id=r.id),'[]') as attempts from hub_learning_recipients r join hub_learning_versions v on v.organization_id=r.organization_id and v.id=r.publication_id where r.organization_id=${org}::uuid and r.id=${recipient}::uuid and v.item_id=${id}::uuid and hub_learning_admin(${actor},${org}::uuid)`,
      ),
    contactHistory: async (
      actor: string,
      org: string,
      contact: string,
      p: PageInput,
    ) => {
      const allowed = await rows(
        sql`select c.id from himmah.contacts c where c.organization_id=${org}::uuid and c.id=${contact}::uuid and hub_learning_admin(${actor},${org}::uuid)`,
      );
      if (!allowed[0]) return null;
      // Filter contact and immutable title before bounded attempt lookups. No guest matching.
      const page = await rows(sql`with entries as materialized (
        select r.id,r.publication_id as "publicationId",r.revoked,r.created_at as "createdAt",
          v.item_id as "learningId",v.number as "publicationNumber",v.content->>'title' as title,
          v.released,jsonb_array_length(v.content->'questions') as "questionCount"
        from hub_learning_recipients r join hub_learning_versions v on v.organization_id=r.organization_id and v.id=r.publication_id
        where r.organization_id=${org}::uuid and r.contact_id=${contact}::uuid and hub_learning_admin(${actor},${org}::uuid)
          and v.content->>'title' ilike ${pattern(p.query)}
      ), page as (
        select e.*,coalesce(a.sequence,0) as attempts,
          case when a.id is null then 'invited' when a.submitted_at is null then 'started' else 'submitted' end as status,
          last.score,last.sequence as "submittedSequence",last.submitted_at as "submittedAt"
        from entries e
        left join lateral(select id,sequence,submitted_at from hub_learning_attempts where organization_id=${org}::uuid and recipient_id=e.id order by sequence desc limit 1)a on true
        left join lateral(select score,sequence,submitted_at from hub_learning_attempts where organization_id=${org}::uuid and recipient_id=e.id and submitted_at is not null order by sequence desc limit 1)last on true
        where true ${after(p, sql`e."createdAt"`, sql`e.id`)} order by e."createdAt" desc,e.id desc limit ${p.limit + 1}
      ) select (select count(*)::int from entries) as total,coalesce(jsonb_agg(to_jsonb(page) order by "createdAt" desc,id desc),'[]'::jsonb) as items from page`);
      return page[0] as {
        total: number;
        items: { id: string; createdAt: string }[];
      };
    },
    options: (actor: string, org: string, p: PageInput, kind: string) => {
      if (kind === "contacts")
        return rows(
          sql`select ${nameField(sql`c.display_name`)},c.id,c.display_name as name,c.created_at::text as "createdAt" from himmah.contacts c where c.organization_id=${org}::uuid and c.archived_at is null and hub_learning_admin(${actor},${org}::uuid) and c.display_name ilike ${pattern(p.query)} ${nameAfter(p, sql`c.display_name`, sql`c.id`)} order by ${nameOrder(sql`c.display_name`, sql`c.id`)} limit ${p.limit + 1}`,
        );
      if (kind === "sessions")
        return rows(
          sql`select s.id,coalesce(nullif(s.topic,''),s.name) as name,s.starts_at as "startsAt",s.activity_id as "activityId",s.starts_at::text as "createdAt" from hub_activity_sessions s join hub_activities a on a.organization_id=s.organization_id and a.id=s.activity_id where s.organization_id=${org}::uuid and not s.cancelled and not a.cancelled and hub_learning_admin(${actor},${org}::uuid) and (s.name||' '||s.topic) ilike ${pattern(p.query)} ${after(p, sql`s.starts_at`, sql`s.id`)} order by s.starts_at desc,s.id desc limit ${p.limit + 1}`,
        );
      return rows(
        sql`select ${nameField(sql`a.name`)},a.id,a.name,a.created_at::text as "createdAt" from hub_activities a where a.organization_id=${org}::uuid and not a.cancelled and hub_learning_admin(${actor},${org}::uuid) and a.name ilike ${pattern(p.query)} ${nameAfter(p, sql`a.name`, sql`a.id`)} order by ${nameOrder(sql`a.name`, sql`a.id`)} limit ${p.limit + 1}`,
      );
    },
  };
}
