import test from "node:test";
import assert from "node:assert/strict";
import { exportsFixture } from "./exports-fixture.ts";
import {
  fieldInput,
  valuesValid,
} from "../src/modules/people/custom-field-contracts.ts";
test("custom fields validate bounded definitions and honest false/zero values", () => {
  assert.throws(() =>
    fieldInput({
      label: "Choice",
      kind: "choice",
      required: false,
      options: ["a", "a"],
    }),
  );
  assert.equal(
    valuesValid(
      [
        {
          id: "x",
          label: "Bool",
          kind: "boolean",
          required: true,
          options: [],
          archivedAt: null,
          version: 1,
        },
      ],
      { x: false },
    ),
    true,
  );
  assert.equal(
    valuesValid(
      [
        {
          id: "x",
          label: "Date",
          kind: "date",
          required: true,
          options: [],
          archivedAt: null,
          version: 1,
        },
      ],
      { x: "2026-02-30" },
    ),
    false,
  );
});
test("custom field SQL enforces tenant/version/replay, required types and preserved archived values", async () => {
  const f = await exportsFixture();
  const db = f.db;
  const org = f.org;
  try {
    const cmd = async (
      body: object,
      key = crypto.randomUUID(),
      actor = "owner",
    ) =>
      (
        await db.query<{ r: any }>(
          "select himmah.custom_field_command($1,$2,$3,$4::jsonb) r",
          [actor, org, key, JSON.stringify(body)],
        )
      ).rows[0]!.r;
    const key = crypto.randomUUID(),
      body = {
        operation: "create",
        label: "Language",
        kind: "choice",
        required: true,
        options: ["Dutch", "Turkish"],
      };
    const created = await cmd(body, key);
    assert.ok(created.id);
    assert.equal((await cmd(body, key)).replayed, true);
    assert.equal(
      (await cmd({ ...body, label: "Changed" }, key)).code,
      "request_key_conflict",
    );
    assert.equal(
      (await cmd(body, crypto.randomUUID(), "intruder")).code,
      "not_found_or_forbidden",
    );
    let config = (
      await db.query<{ c: any }>("select himmah.custom_field_config($1) c", [
        org,
      ])
    ).rows[0]!.c;
    const contactKey = crypto.randomUUID();
    const create = async (values: object, snapshot = config.snapshot) =>
      (
        await db.query<{ r: any }>(
          "select himmah.contact_command('owner',$1,'create',$2,$3::jsonb) r",
          [
            org,
            contactKey,
            JSON.stringify({
              displayName: "Example",
              customValues: values,
              customFieldsSnapshot: snapshot,
            }),
          ],
        )
      ).rows[0]!.r;
    assert.equal((await create({})).code, "invalid_input");
    assert.equal(
      (await create({ [created.id]: "French" })).code,
      "invalid_input",
    );
    const contact = await create({ [created.id]: "Turkish" });
    assert.ok(contact.id);
    assert.equal((await create({ [created.id]: "Turkish" })).replayed, true);
    assert.equal(
      (
        await cmd({
          ...body,
          operation: "update",
          id: created.id,
          version: 1,
          kind: "text",
          options: [],
        })
      ).code,
      "invalid_input",
    );
    assert.ok(
      (await cmd({ operation: "archive", id: created.id, version: 1 })).id,
    );
    assert.equal(
      (await cmd({ operation: "restore", id: created.id, version: 1 })).code,
      "version_conflict",
    );
    assert.equal((await create({ [created.id]: "Turkish" })).replayed, true);
    const latest = (await f.people.fields("owner", org))!;
    const updated = await f.people.command(
      "owner",
      org,
      "update",
      crypto.randomUUID(),
      {
        contactId: contact.id,
        version: 1,
        displayName: "Example",
        givenName: null,
        familyName: null,
        customValues: {},
        customFieldsSnapshot: latest.snapshot,
      },
    );
    assert.equal(
      updated.id,
      contact.id,
      "Saving active values retains the archived value",
    );
    const values = (
      await db.query<{ values: object }>(
        "select values from himmah.contact_custom_values where contact_id=$1",
        [contact.id],
      )
    ).rows[0]!.values;
    assert.deepEqual(values, { [created.id]: "Turkish" });
    await db.query(
      "update himmah.staff_memberships set active=false where organization_id=$1 and user_id='owner'",
      [org],
    );
    assert.equal(
      (await cmd(body, key)).code,
      "not_found_or_forbidden",
      "Current access precedes receipt replay",
    );
  } finally {
    await db.close();
  }
});

test("all field types round-trip through CSV review/import/export and stale definitions cannot commit", async () => {
  const f = await exportsFixture();
  try {
    const defs = [] as { id: string; kind: string }[];
    for (const kind of ["text", "number", "date", "boolean", "choice"]) {
      const r = (
        await f.db.query<{ r: any }>(
          "select himmah.custom_field_command('owner',$1,$2,$3::jsonb) r",
          [
            f.org,
            crypto.randomUUID(),
            JSON.stringify({
              operation: "create",
              label: kind,
              kind,
              required: true,
              options: kind === "choice" ? ["One", "Two"] : [],
            }),
          ],
        )
      ).rows[0]!.r;
      assert.ok(r.id);
      defs.push({ id: r.id, kind });
    }
    const config = (await f.people.fields("owner", f.org))!;
    const { parseContactCsv, mapContactCsv } =
      await import("../src/modules/people/import-csv.ts");
    const data = parseContactCsv(
      "Name,Text,Number,Date,Bool,Choice\nNew,=example,0,2026-11-05,Nee,One\n",
    );
    const mapping: any = {
      displayName: 0,
      givenName: -1,
      familyName: -1,
      email: -1,
      phone: -1,
    };
    defs.forEach((d, i) => (mapping["custom:" + d.id] = i + 1));
    const rows = mapContactCsv(data, mapping, config.fields);
    assert.equal(rows[0]!.error, false);
    assert.equal(rows[0]!.value!.customValues![defs[3]!.id], false);
    const validRows = [rows[0]!.value!];
    const review = await f.people.reviewImport("owner", f.org, validRows);
    assert.ok(review?.snapshot);
    const created = await f.people.importContacts("owner", f.org, {
      key: crypto.randomUUID(),
      rows: validRows,
      selected: [2],
      snapshot: String(review!.snapshot),
    });
    assert.equal(created?.created, 1);
    const { exportFilters } = await import("../src/exports/contracts.ts");
    const { exportCsv } = await import("../src/exports/csv.ts");
    const filters = exportFilters(
      { kind: "contacts", locale: "nl", q: "New" },
      "Europe/Brussels",
    );
    const snapshot = (await f.exports.data("owner", f.org, filters))!;
    const file = exportCsv(snapshot, filters);
    assert.ok(file.csv.includes("'=example"));
    assert.ok(file.csv.includes('"Nee"'));
    assert.ok(file.csv.includes('"0"'));
    assert.ok(file.csv.includes("2026-11-05"));
    await f.db.query(
      "select himmah.custom_field_command('owner',$1,$2,$3::jsonb)",
      [
        f.org,
        crypto.randomUUID(),
        JSON.stringify({
          operation: "update",
          id: defs[0]!.id,
          version: 1,
          label: "Renamed",
          kind: "text",
          options: [],
          required: true,
        }),
      ],
    );
    const stale = await f.people.importContacts("owner", f.org, {
      key: crypto.randomUUID(),
      rows: validRows,
      selected: [2],
      snapshot: String(review!.snapshot),
    });
    assert.equal(stale?.code, "version_conflict");
    assert.equal(await f.people.fields("intruder", f.org), undefined);
  } finally {
    await f.db.close();
  }
});
