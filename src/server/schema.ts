import {
  pgTable,
  boolean,
  integer,
  foreignKey,
  uniqueIndex,
  uuid,
  text,
  timestamp,
  primaryKey,
  unique,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
export const organizations = pgTable(
  "hub_organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    timezone: text("timezone").notNull(),
    createdBy: text("created_by").notNull(),
    creationKey: uuid("creation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_organization_creation").on(t.createdBy, t.creationKey),
    check(
      "hub_organization_name_length",
      sql`length(${t.name}) between 2 and 100`,
    ),
    check(
      "hub_organization_slug",
      sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(${t.slug}) between 3 and 48`,
    ),
  ],
);
export const memberships = pgTable(
  "hub_memberships",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id").notNull(),
    displayName: text("display_name"),
    role: text("role", { enum: ["owner", "admin", "volunteer"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId] }),
    index("hub_membership_user").on(t.userId),
    check(
      "hub_membership_role",
      sql`${t.role} in ('owner','admin','volunteer')`,
    ),
  ],
);

// Participant records are private roster entries; they do not grant account access.
export const people = pgTable(
  "hub_people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    archived: boolean("archived").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    creationKey: uuid("creation_key").notNull(),
    consentRecordedBy: text("consent_recorded_by").notNull(),
    consentRecordedAt: timestamp("consent_recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_person_scope").on(t.organizationId, t.id),
    unique("hub_person_creation").on(t.organizationId, t.creationKey),
    index("hub_people_page").on(
      t.organizationId,
      t.archived,
      t.createdAt,
      t.id,
    ),
    check("hub_person_name", sql`length(trim(${t.name})) between 2 and 80`),
  ],
);
export const groups = pgTable(
  "hub_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    archived: boolean("archived").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    creationKey: uuid("creation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_group_scope").on(t.organizationId, t.id),
    unique("hub_group_creation").on(t.organizationId, t.creationKey),
    uniqueIndex("hub_group_name").on(t.organizationId, sql`lower(${t.name})`),
    index("hub_groups_page").on(
      t.organizationId,
      t.archived,
      t.createdAt,
      t.id,
    ),
    check(
      "hub_group_name_length",
      sql`length(trim(${t.name})) between 2 and 80`,
    ),
  ],
);
export const groupPeople = pgTable(
  "hub_group_people",
  {
    organizationId: uuid("organization_id").notNull(),
    groupId: uuid("group_id").notNull(),
    personId: uuid("person_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.groupId, t.personId] }),
    foreignKey({
      columns: [t.organizationId, t.groupId],
      foreignColumns: [groups.organizationId, groups.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.personId],
      foreignColumns: [people.organizationId, people.id],
    }),
    index("hub_group_people_person").on(t.organizationId, t.personId),
  ],
);
export const invitations = pgTable(
  "hub_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    email: text("email").notNull(),
    role: text("role", { enum: ["admin", "volunteer"] }).notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    creationKey: uuid("creation_key").notNull(),
    createdBy: text("created_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revoked: boolean("revoked").notNull().default(false),
    acceptedBy: text("accepted_by"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_invitation_creation").on(t.organizationId, t.creationKey),
    index("hub_invitation_page").on(t.organizationId, t.createdAt, t.id),
    check("hub_invitation_role", sql`${t.role} in ('admin','volunteer')`),
  ],
);
export const audit = pgTable(
  "hub_directory_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    entityId: text("entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("hub_directory_audit_org").on(t.organizationId, t.createdAt)],
);
