import {
  pgSchema,
  jsonb,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  unique,
  primaryKey,
  foreignKey,
  check,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
export const himmah = pgSchema("himmah");
const auditColumns = () => ({
  version: integer().notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
});
export const organizations = himmah.table(
  "organizations",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    ...auditColumns(),
  },
  (t) => [
    check("organization_name", sql`length(trim(${t.name})) between 1 and 100`),
  ],
);
export const memberships = himmah.table(
  "staff_memberships",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id").notNull(),
    role: text().notNull(),
    active: boolean().notNull().default(true),
    ...auditColumns(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId] }),
    check("staff_role", sql`${t.role} in ('owner','admin','volunteer')`),
  ],
);
export const contacts = himmah.table(
  "contacts",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    displayName: text("display_name").notNull(),
    givenName: text("given_name"),
    familyName: text("family_name"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: text("archived_by"),
    ...auditColumns(),
  },
  (t) => [
    unique("contact_scope").on(t.organizationId, t.id),
    check(
      "contact_name",
      sql`length(trim(${t.displayName})) between 1 and 120`,
    ),
    check(
      "contact_given_name",
      sql`${t.givenName} is null or length(trim(${t.givenName})) between 1 and 120`,
    ),
    check(
      "contact_family_name",
      sql`${t.familyName} is null or length(trim(${t.familyName})) between 1 and 120`,
    ),
    check("contact_version", sql`${t.version}>0`),
    check(
      "contact_archive_pair",
      sql`(${t.archivedAt} is null) = (${t.archivedBy} is null)`,
    ),
    index("contacts_page").on(
      t.organizationId,
      t.archivedAt,
      t.createdAt,
      t.id,
    ),
  ],
);
export const contactMethods = himmah.table(
  "contact_methods",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    contactId: uuid("contact_id").notNull(),
    kind: text().notNull(),
    value: text().notNull(),
    normalizedValue: text("normalized_value").notNull(),
    preferred: boolean().notNull().default(false),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    ...auditColumns(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.contactId],
      foreignColumns: [contacts.organizationId, contacts.id],
    }),
    check("method_kind", sql`${t.kind} in ('phone','email')`),
    check("method_length", sql`length(${t.value}) between 1 and 254`),
    uniqueIndex("method_active_value")
      .on(t.organizationId, t.contactId, t.kind, t.normalizedValue)
      .where(sql`${t.endedAt} is null`),
    uniqueIndex("method_active_preferred")
      .on(t.organizationId, t.contactId, t.kind)
      .where(sql`${t.endedAt} is null and ${t.preferred}`),
    check(
      "method_format",
      sql`(${t.kind}='email' and ${t.normalizedValue} ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') or (${t.kind}='phone' and ${t.normalizedValue} ~ '^[+][1-9][0-9]{6,14}$')`,
    ),
    index("methods_page").on(t.organizationId, t.contactId, t.createdAt, t.id),
  ],
);
export const events = himmah.table(
  "people_audit_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorId: text("actor_id").notNull(),
    contactId: uuid("contact_id").notNull(),
    action: text().notNull(),
    entityVersion: integer("entity_version").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    changedFields: text("changed_fields").array().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.contactId],
      foreignColumns: [contacts.organizationId, contacts.id],
    }),
    index("people_history_page").on(
      t.organizationId,
      t.contactId,
      t.occurredAt,
      t.id,
    ),
  ],
);
export const receipts = himmah.table(
  "operation_receipts",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorId: text("actor_id").notNull(),
    operation: text().notNull(),
    requestKey: uuid("request_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    contactId: uuid("contact_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      columns: [t.organizationId, t.actorId, t.operation, t.requestKey],
    }),
    foreignKey({
      columns: [t.organizationId, t.contactId],
      foreignColumns: [contacts.organizationId, contacts.id],
    }),
  ],
);

export const groups = himmah.table(
  "groups",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text().notNull(),
    description: text(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: text("archived_by"),
    ...auditColumns(),
  },
  (t) => [
    unique("group_scope").on(t.organizationId, t.id),
    check("group_name", sql`length(trim(${t.name})) between 1 and 100`),
    check(
      "group_description",
      sql`${t.description} is null or length(${t.description})<=500`,
    ),
    check(
      "group_archive_pair",
      sql`(${t.archivedAt} is null)=(${t.archivedBy} is null)`,
    ),
    check("group_version", sql`${t.version}>0`),
    uniqueIndex("group_active_name")
      .on(t.organizationId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    index("groups_page").on(t.organizationId, t.archivedAt, t.createdAt, t.id),
  ],
);
export const groupMemberships = himmah.table(
  "group_memberships",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    groupId: uuid("group_id").notNull(),
    contactId: uuid("contact_id").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    endReason: text("end_reason"),
    ...auditColumns(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.groupId],
      foreignColumns: [groups.organizationId, groups.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.contactId],
      foreignColumns: [contacts.organizationId, contacts.id],
    }),
    check(
      "membership_interval",
      sql`${t.validTo} is null or ${t.validTo}>${t.validFrom}`,
    ),
    check(
      "membership_reason",
      sql`${t.endReason} is null or length(trim(${t.endReason})) between 1 and 300`,
    ),
    uniqueIndex("membership_active_pair")
      .on(t.organizationId, t.groupId, t.contactId)
      .where(sql`${t.validTo} is null`),
    index("memberships_group_page").on(
      t.organizationId,
      t.groupId,
      t.createdAt,
      t.id,
    ),
    index("memberships_contact_page").on(
      t.organizationId,
      t.contactId,
      t.createdAt,
      t.id,
    ),
  ],
);
export const groupEvents = himmah.table(
  "group_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    groupId: uuid("group_id").notNull(),
    contactId: uuid("contact_id"),
    actorId: text("actor_id").notNull(),
    action: text().notNull(),
    reason: text(),
    entityVersion: integer("entity_version").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.groupId],
      foreignColumns: [groups.organizationId, groups.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.contactId],
      foreignColumns: [contacts.organizationId, contacts.id],
    }),
    index("group_events_page").on(
      t.organizationId,
      t.groupId,
      t.occurredAt,
      t.id,
    ),
  ],
);
export const groupRequests = himmah.table(
  "group_operation_requests",
  {
    organizationId: uuid("organization_id").notNull(),
    actorId: text("actor_id").notNull(),
    operation: text().notNull(),
    requestKey: uuid("request_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    groupId: uuid("group_id").notNull(),
    response: jsonb().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      columns: [t.organizationId, t.actorId, t.operation, t.requestKey],
    }),
    foreignKey({
      columns: [t.organizationId, t.groupId],
      foreignColumns: [groups.organizationId, groups.id],
    }),
  ],
);
export const relationshipTypes = himmah.table(
  "relationship_types",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    code: text().notNull(),
    symmetric: boolean().notNull(),
    category: text().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: text("archived_by"),
    ...auditColumns(),
  },
  (t) => [
    unique("relationship_type_scope").on(t.organizationId, t.id),
    unique("relationship_type_code").on(t.organizationId, t.code),
    check("relationship_code", sql`${t.code} ~ '^[a-z][a-z0-9_]{0,49}$'`),
    check("relationship_category", sql`${t.category} in ('family','other')`),
    check(
      "relationship_type_archive",
      sql`(${t.archivedAt} is null)=(${t.archivedBy} is null)`,
    ),
    index("relationship_types_page").on(
      t.organizationId,
      t.archivedAt,
      t.createdAt,
      t.id,
    ),
  ],
);
export const relationshipTypeVersions = himmah.table(
  "relationship_type_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    typeId: uuid("type_id").notNull(),
    revision: integer().notNull(),
    forwardLabels: jsonb("forward_labels").notNull(),
    inverseLabels: jsonb("inverse_labels").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("relationship_version_scope").on(t.organizationId, t.typeId, t.id),
    unique("relationship_revision").on(t.organizationId, t.typeId, t.revision),
    foreignKey({
      columns: [t.organizationId, t.typeId],
      foreignColumns: [relationshipTypes.organizationId, relationshipTypes.id],
    }),
    check("relationship_revision_positive", sql`${t.revision}>0`),
  ],
);
export const contactRelationships = himmah.table(
  "contact_relationships",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    sourceContactId: uuid("source_contact_id").notNull(),
    targetContactId: uuid("target_contact_id").notNull(),
    typeId: uuid("type_id").notNull(),
    typeVersionId: uuid("type_version_id").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    endReason: text("end_reason"),
    ...auditColumns(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.sourceContactId],
      foreignColumns: [contacts.organizationId, contacts.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.targetContactId],
      foreignColumns: [contacts.organizationId, contacts.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.typeId, t.typeVersionId],
      foreignColumns: [
        relationshipTypeVersions.organizationId,
        relationshipTypeVersions.typeId,
        relationshipTypeVersions.id,
      ],
    }),
    check(
      "relationship_not_self",
      sql`${t.sourceContactId}<>${t.targetContactId}`,
    ),
    check(
      "relationship_interval",
      sql`${t.validTo} is null or ${t.validTo}>${t.validFrom}`,
    ),
    check(
      "relationship_end_reason",
      sql`${t.endReason} is null or length(trim(${t.endReason})) between 1 and 300`,
    ),
    uniqueIndex("relationship_active_edge")
      .on(t.organizationId, t.typeId, t.sourceContactId, t.targetContactId)
      .where(sql`${t.validTo} is null`),
    index("relationship_source_page").on(
      t.organizationId,
      t.sourceContactId,
      t.createdAt,
      t.id,
    ),
    index("relationship_target_page").on(
      t.organizationId,
      t.targetContactId,
      t.createdAt,
      t.id,
    ),
  ],
);
export const typeRequests = himmah.table(
  "relationship_type_requests",
  {
    organizationId: uuid("organization_id").notNull(),
    actorId: text("actor_id").notNull(),
    operation: text().notNull(),
    requestKey: uuid("request_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    typeId: uuid("type_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      columns: [t.organizationId, t.actorId, t.operation, t.requestKey],
    }),
    foreignKey({
      columns: [t.organizationId, t.typeId],
      foreignColumns: [relationshipTypes.organizationId, relationshipTypes.id],
    }),
  ],
);
export const typeEvents = himmah.table(
  "relationship_type_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    typeId: uuid("type_id").notNull(),
    actorId: text("actor_id").notNull(),
    action: text().notNull(),
    entityVersion: integer("entity_version").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.typeId],
      foreignColumns: [relationshipTypes.organizationId, relationshipTypes.id],
    }),
    index("relationship_type_events_page").on(
      t.organizationId,
      t.typeId,
      t.occurredAt,
      t.id,
    ),
  ],
);

export const communicationAssignments = himmah.table(
  "communication_assignments",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    subjectContactId: uuid("subject_contact_id").notNull(),
    responsibleContactId: uuid("responsible_contact_id").notNull(),
    purpose: text().notNull(),
    priority: integer().notNull(),
    channel: text().notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    endReason: text("end_reason"),
    ...auditColumns(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.subjectContactId],
      foreignColumns: [contacts.organizationId, contacts.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.responsibleContactId],
      foreignColumns: [contacts.organizationId, contacts.id],
    }),
    check(
      "communication_not_self",
      sql`${t.subjectContactId}<>${t.responsibleContactId}`,
    ),
    check(
      "communication_purpose",
      sql`${t.purpose} in ('routine','emergency')`,
    ),
    check("communication_priority", sql`${t.priority} between 1 and 99`),
    check(
      "communication_channel",
      sql`${t.channel} in ('phone','email','any')`,
    ),
    check(
      "communication_interval",
      sql`${t.validTo} is null or ${t.validTo}>${t.validFrom}`,
    ),
    check(
      "communication_reason",
      sql`${t.endReason} is null or length(trim(${t.endReason})) between 1 and 300`,
    ),
    uniqueIndex("communication_active_pair")
      .on(
        t.organizationId,
        t.subjectContactId,
        t.responsibleContactId,
        t.purpose,
        t.channel,
      )
      .where(sql`${t.validTo} is null`),
    index("communication_routing").on(
      t.organizationId,
      t.subjectContactId,
      t.purpose,
      t.priority,
      t.id,
    ),
    index("communication_responsible").on(
      t.organizationId,
      t.responsibleContactId,
    ),
  ],
);
export const communicationPreferences = himmah.table(
  "contact_communication_preferences",
  {
    organizationId: uuid("organization_id").notNull(),
    contactId: uuid("contact_id").notNull(),
    routineDirectAllowed: boolean("routine_direct_allowed")
      .notNull()
      .default(true),
    emergencyDirectAllowed: boolean("emergency_direct_allowed")
      .notNull()
      .default(false),
    ...auditColumns(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.contactId] }),
    foreignKey({
      columns: [t.organizationId, t.contactId],
      foreignColumns: [contacts.organizationId, contacts.id],
    }),
  ],
);
