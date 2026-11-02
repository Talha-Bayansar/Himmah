import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { installDatabase } from "./database.ts";
import { createLearningStore } from "../src/server/learning-store.ts";
import { createStore } from "../src/server/store.ts";
import type { Content } from "../src/learning/contracts.ts";

/** Disposable local SQL only; shared by regression and visual checks. */
export async function learningInsightsFixture() {
  const db = new PGlite();
  await installDatabase(db);
  const dialect = new PgDialect();
  const execute = async (s: SQL) => {
    const q = dialect.sqlToQuery(s);
    return (await db.query<Record<string, unknown>>(q.sql, q.params)).rows;
  };
  const url = "postgres://isolated:only@localhost/himmah";
  const store = createLearningStore(url, execute);
  const organizations = createStore(url, execute);
  const org = crypto.randomUUID(),
    foreign = crypto.randomUUID();
  for (const [id, user, slug] of [
    [org, "owner", "report-org"],
    [foreign, "outsider", "report-other"],
  ]) {
    await db.query(
      "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Synthetic Community',$2,'Europe/Brussels',$3,gen_random_uuid())",
      [id, slug, user],
    );
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role)values($1,$2,'owner')",
      [id, user],
    );
  }
  for (const [user, role] of [
    ["admin", "admin"],
    ["helper", "volunteer"],
  ])
    await db.query(
      "insert into hub_memberships(organization_id,user_id,role)values($1,$2,$3)",
      [org, user, role],
    );
  const content: Content = {
    title: "Samen ontdekken · Knowledge review",
    description: "",
    mode: "assigned",
    release: "manual",
    opensAt: "",
    closesAt: "",
    questions: [
      {
        text: "Welke keuze past bij deze vraag? Neem rustig de tijd om na te denken.",
        choices: ["Eerste antwoord met wat extra uitleg", "Tweede antwoord"],
        correct: 1,
        explanation: "",
      },
      {
        text: "Een tweede vraag om samen te bespreken",
        choices: ["Ja", "Nee"],
        correct: 0,
        explanation: "",
      },
    ],
  };
  const item = crypto.randomUUID();
  let version = 1;
  const command = async (
    action: string,
    extra: Record<string, unknown> = {},
  ) => {
    const r = (
      await store.command("owner", org, item, crypto.randomUUID(), {
        action,
        version,
        ...extra,
      })
    )[0]!.result as Record<string, any>;
    if (r.error) throw Error(String(r.error));
    version = r.version;
    return r;
  };
  await command("create", { content, activity: null, session: null });
  const publication = (await command("publish")).publication as string;
  const recipients: string[] = [];
  for (let i = 0; i < 4; i++) {
    const person = crypto.randomUUID(),
      recipient = crypto.randomUUID();
    recipients.push(recipient);
    await db.query(
      "insert into himmah.contacts(id,organization_id,display_name,created_by,updated_by)values($1,$2,$3,'owner','owner')",
      [person, org, `Person ${i}`],
    );
    await db.query(
      "insert into hub_learning_recipients(id,organization_id,publication_id,contact_id,name,allowance,revoked)values($1,$2,$3,$4,$5,5,$6)",
      [recipient, org, publication, person, `Person ${i}`, i === 1],
    );
  }
  const attempt = async (
    recipient: string,
    sequence: number,
    answers: Record<string, number>,
    score: number | null,
  ) => {
    await db.query(
      "insert into hub_learning_attempts(organization_id,recipient_id,sequence,answers,score,submitted_at)values($1,$2,$3,$4::jsonb,$5,$6::timestamptz)",
      [
        org,
        recipient,
        sequence,
        JSON.stringify(answers),
        score,
        score === null ? null : "2026-11-01T10:00:00Z",
      ],
    );
  };
  await attempt(recipients[0]!, 1, { 0: 1, 1: 0 }, 2);
  await attempt(recipients[0]!, 2, { 0: 1, 1: 1 }, 1);
  await attempt(recipients[0]!, 3, { 0: 0 }, null);
  await attempt(recipients[1]!, 1, {}, 0);
  await attempt(recipients[2]!, 1, { 0: 1, 1: 0 }, null);
  await command("save", {
    content: {
      ...content,
      title: "New draft",
      questions: [{ ...content.questions[0]!, correct: 0 }],
    },
    activity: null,
    session: null,
  });
  const emptyPublication = (await command("publish")).publication as string;
  await command("save", {
    content: { ...content, mode: "open" },
    activity: null,
    session: null,
  });
  const guestPublication = (await command("publish")).publication as string;
  const guest = crypto.randomUUID();
  await db.query(
    "insert into hub_learning_recipients(id,organization_id,publication_id,name,guest_hash)values($1,$2,$3,'Person 0',$4)",
    [guest, org, guestPublication, "a".repeat(64)],
  );
  await attempt(guest, 1, { 0: 0, 1: 1 }, 0);
  return {
    db,
    store,
    organizations,
    org,
    foreign,
    item,
    publication,
    emptyPublication,
    guestPublication,
    recipients,
    content,
    command,
  };
}
