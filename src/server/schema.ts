import {
  pgTable,
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
