import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { installDatabase } from "./database.ts";
import { createStore } from "../src/server/store.ts";
import { createPeopleStore } from "../src/modules/people/store.ts";
import { createInsightsStore } from "../src/server/insights-store.ts";
import { createExportStore } from "../src/server/export-store.ts";
export async function exportsFixture() {
  const db = new PGlite();
  await installDatabase(db);
  const dialect = new PgDialect();
  const run = async (s: SQL) => {
    const q = dialect.sqlToQuery(s);
    return (await db.query<Record<string, unknown>>(q.sql, q.params)).rows;
  };
  const org = "11111111-1111-4111-8111-111111111111",
    activity = "22222222-2222-4222-8222-222222222222",
    session = "33333333-3333-4333-8333-333333333333",
    group = "44444444-4444-4444-8444-444444444444";
  await db.query(
    "insert into hub_organizations(id,name,slug,timezone,created_by,creation_key)values($1,'Synthetic Community','export-visual','Europe/Brussels','owner',gen_random_uuid())",
    [org],
  );
  await db.query(
    "insert into hub_memberships(organization_id,user_id,role,display_name)values($1,'owner','owner','Synthetic Owner')",
    [org],
  );
  const people = [
    "Ayşe İrem van den Berg",
    "Mehmet Abdullah de Vries",
    "Archived Example",
    "=Synthetic formula",
  ];
  const contacts: string[] = [];
  for (const name of people) {
    const id = crypto.randomUUID();
    contacts.push(id);
    await db.query(
      "insert into himmah.contacts(id,organization_id,display_name,created_by,updated_by)values($1,$2,$3,'owner','owner')",
      [id, org, name],
    );
  }
  await db.query(
    "update himmah.contacts set archived_at=now(),archived_by='owner' where id=$1",
    [contacts[2]],
  );
  await db.query(
    "insert into himmah.contact_methods(organization_id,contact_id,kind,value,normalized_value,preferred,created_by,updated_by)values($1,$2,'email','ayse@example.test','ayse@example.test',true,'owner','owner'),($1,$2,'phone','+32470123456','+32470123456',false,'owner','owner')",
    [org, contacts[0]],
  );
  await db.query(
    "insert into himmah.groups(id,organization_id,name,created_by,updated_by)values($1,$2,'Historical study group','owner','owner')",
    [group, org],
  );
  await db.query(
    "insert into himmah.group_memberships(organization_id,group_id,contact_id,valid_from,valid_to,created_by,updated_by)values($1,$2,$3,'2019-01-01','2021-01-01','owner','owner'),($1,$2,$4,'2025-01-01',null,'owner','owner')",
    [org, group, contacts[0], contacts[1]],
  );
  await db.query(
    "insert into hub_activities(id,organization_id,name,description,location,timezone,created_by,creation_key)values($1,$2,'Samen leren','','','Europe/Brussels','owner',gen_random_uuid())",
    [activity, org],
  );
  await db.query(
    "insert into hub_activity_sessions(id,organization_id,activity_id,name,topic,description,location,timezone,starts_at,ends_at,price_minor,created_by,creation_key)values($1,$2,$3,'Samen leren','Samen leren en ontmoeten','','','Europe/Brussels','2020-03-30T16:00:00Z','2020-03-30T17:00:00Z',1000,'owner',gen_random_uuid())",
    [session, org, activity],
  );
  for (const id of contacts.slice(0, 2))
    await db.query(
      "insert into hub_attendance(organization_id,activity_id,session_id,person_id,status)values($1,$2,$3,$4,'present')",
      [org, activity, session, id],
    );
  const charge = crypto.randomUUID(),
    receipt = crypto.randomUUID();
  await db.query(
    "insert into hub_registration_charges(id,organization_id,activity_id,session_id,person_id,source,amount_minor,created_by)values($1,$2,$3,$4,$5,'walk_in',1000,'owner')",
    [charge, org, activity, session, contacts[0]],
  );
  await db.query(
    "insert into hub_cash_receipts(id,organization_id,activity_id,session_id,amount_minor,occurred_at,created_by)values($1,$2,$3,$4,700,'2020-03-31T12:00:00Z','owner')",
    [receipt, org, activity, session],
  );
  await db.query(
    "insert into hub_cash_allocations(organization_id,receipt_id,charge_id,amount_minor)values($1,$2,$3,500)",
    [org, receipt, charge],
  );
  const actual = createExportStore("", run);
  return {
    db,
    org,
    activity,
    session,
    group,
    contacts,
    organizations: createStore("", run),
    people: createPeopleStore("", run),
    insights: createInsightsStore("", run),
    exports: {
      context: actual.context,
      data: async (...args: Parameters<typeof actual.data>) => {
        const value = await actual.data(...args);
        return value
          ? { ...value, generatedAt: "2026-11-04T12:00:00.000Z" }
          : value;
      },
    },
  };
}
