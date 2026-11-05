import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { exportsFixture } from "./exports-fixture.ts";
import { createOrganizationSettingsStore } from "../src/server/organization-settings-store.ts";
import { organizationSettingsApi } from "../src/server/organization-settings-api.ts";
import {
  settingsInput,
  timeMinute,
} from "../src/organization/settings-contracts.ts";
import { pushPolicy } from "../src/notifications/push-policy.ts";
const good = () => ({
  name: "Updated community",
  description: "A local organization",
  email: "info@example.test",
  phone: "+32 470 123 456",
  timezone: "Europe/Brussels",
  defaultLanguage: "nl",
  quietEnabled: true,
  quietStart: 1320,
  quietEnd: 480,
  version: 0,
  key: crypto.randomUUID(),
});
test("settings validation is bounded and quiet times have explicit off semantics", () => {
  assert.equal(settingsInput(good()).quietStart, 1320);
  assert.equal(timeMinute("09:37"), 577);
  assert.ok(Number.isNaN(timeMinute("24:00")));
  for (const patch of [
    { name: "x" },
    { timezone: "invalid" },
    { email: "invalid" },
    { phone: "0470123456" },
    { defaultLanguage: "de" },
    { quietStart: 1440 },
    { quietStart: 480 },
    { version: -1 },
  ])
    assert.throws(() => settingsInput({ ...good(), ...patch }));
  assert.equal(
    settingsInput({ ...good(), quietEnabled: false, quietStart: 480 })
      .quietEnabled,
    false,
  );
});
test("organization settings SQL/API are scoped, exact-retry safe, versioned and preserve session snapshots", async () => {
  const f = await exportsFixture();
  try {
    const dialect = new PgDialect();
    const store = createOrganizationSettingsStore("", async (s) => {
      const q = dialect.sqlToQuery(s);
      return (await f.db.query(q.sql, q.params)).rows as Record<
        string,
        unknown
      >[];
    });
    const initial = (await store.read("owner", f.org))!;
    assert.equal(initial.version, 0);
    assert.equal(initial.defaultLanguage, null);
    assert.equal(await store.read("intruder", f.org), undefined);
    const sessions = (
      await f.db.query(
        "select to_jsonb(s) snapshot from hub_activity_sessions s order by id",
      )
    ).rows;
    await f.db.query(
      "insert into hub_push_devices(user_id,endpoint,p256dh,auth,locale)values('owner','https://fcm.googleapis.com/settings','key','auth','en')",
    );
    for (let i = 0; i < 2; i++)
      await f.db.query(
        "insert into hub_notifications(organization_id,user_id,event_id,kind,href)values($1,'owner',gen_random_uuid(),'staff_notice','/hub')",
        [f.org],
      );
    const deliveries = (
      await f.db.query<{ id: string }>(
        "select id from hub_push_deliveries order by id",
      )
    ).rows;
    await f.db.query(
      "update hub_push_deliveries set next_at=now()+interval '8 hours'",
    );
    await f.db.query("update hub_push_deliveries set attempts=1 where id=$1", [
      deliveries[1]!.id,
    ]);
    const body = settingsInput({ ...good(), timezone: "Europe/Istanbul" });
    const first = await store.save("owner", f.org, body);
    assert.equal(first.version, 1);
    const deadlines = (
      await f.db.query<{ id: string; due: boolean }>(
        "select id,next_at<=now() as due from hub_push_deliveries order by id",
      )
    ).rows;
    assert.equal(
      deadlines[0]!.due,
      true,
      "Policy-only deferrals are re-evaluated after a settings change",
    );
    assert.equal(
      deadlines[1]!.due,
      false,
      "Provider retry backoff is preserved",
    );

    assert.equal((await store.save("owner", f.org, body)).replayed, true);
    assert.equal(
      (await store.save("owner", f.org, { ...body, name: "Other" })).code,
      "request_key_conflict",
    );
    assert.equal(
      (await store.save("owner", f.org, { ...body, key: crypto.randomUUID() }))
        .code,
      "version_conflict",
    );
    const saved = (await store.read("owner", f.org))!;
    assert.equal(saved.defaultLanguage, "nl");
    assert.equal(saved.timezone, "Europe/Istanbul");
    assert.equal(
      (await f.organizations.get("owner", f.org))!.defaultLanguage,
      "nl",
    );
    assert.equal(
      (
        await f.db.query<{ name: string }>(
          "select name from himmah.organizations where id=$1",
          [f.org],
        )
      ).rows[0]!.name,
      body.name,
    );
    assert.deepEqual(
      (
        await f.db.query(
          "select to_jsonb(s) snapshot from hub_activity_sessions s order by id",
        )
      ).rows,
      sessions,
    );
    const api = (actor = "owner", method = "GET", payload?: object) =>
      organizationSettingsApi(
        new Request(`https://himmah.test/api/organizations/${f.org}/settings`, {
          method,
          ...(payload ? { body: JSON.stringify(payload) } : {}),
        }),
        { id: actor, emailVerified: true },
        store,
      );
    assert.equal((await api("intruder")).status, 404);
    assert.equal(
      (await api()).headers.get("cache-control"),
      "private, no-store",
    );
    assert.equal(
      (
        await api("owner", "POST", {
          ...body,
          key: crypto.randomUUID(),
          version: 1,
          userId: "other",
        })
      ).status,
      400,
    );
    await f.db.exec(
      "create function fail_org_settings_audit() returns trigger language plpgsql as $$begin if NEW.action='organization.settings' then raise exception 'audit test';end if;return NEW;end$$;create trigger fail_org_settings_audit before insert on hub_directory_audit for each row execute function fail_org_settings_audit()",
    );
    await assert.rejects(() =>
      store.save("owner", f.org, {
        ...body,
        key: crypto.randomUUID(),
        version: 1,
        name: "Must roll back",
      }),
    );
    assert.equal((await store.read("owner", f.org))!.name, body.name);
    await f.db.query(
      "drop trigger fail_org_settings_audit on hub_directory_audit",
    );
    await f.db.query(
      "update hub_memberships set role='volunteer' where organization_id=$1 and user_id='owner'",
      [f.org],
    );
    assert.equal(
      (await store.save("owner", f.org, body)).code,
      "not_found_or_forbidden",
    );
  } finally {
    await f.db.close();
  }
});
test("custom quiet hours handle minutes, daytime windows, disable and DST without late reminders", () => {
  const at = Date.parse("2026-11-05T12:00:00Z"),
    base = {
      kind: "staff_notice",
      timezone: "Europe/Brussels",
      quietEnabled: true,
      quietStart: 12 * 60 + 30,
      quietEnd: 13 * 60 + 37,
    };
  assert.deepEqual(pushPolicy(base, at), { action: "defer", delay: 37 * 60 });
  assert.equal(pushPolicy({ ...base, quietEnabled: false }, at).action, "send");
  const spring = Date.parse("2026-03-29T00:30:00Z");
  const next = pushPolicy(
    { ...base, quietStart: 22 * 60, quietEnd: 2 * 60 + 30 },
    spring,
  );
  assert.equal(
    next.delay,
    30 * 60,
    "nonexistent quiet-end time resumes at first valid wall time",
  );
  const fall = Date.parse("2026-10-25T00:15:00Z");
  assert.equal(
    pushPolicy({ ...base, quietStart: 22 * 60, quietEnd: 2 * 60 + 30 }, fall)
      .delay,
    15 * 60,
  );
  assert.equal(
    pushPolicy(
      { ...base, kind: "session_reminder", plannedAt: "2026-11-05T12:30:00Z" },
      at,
    ).action,
    "skip",
  );
});
