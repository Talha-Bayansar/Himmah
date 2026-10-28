import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { groups, contacts as people } from "../modules/people/schema";
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

// Activity defaults and immutable session snapshots.
export const activities = pgTable(
  "hub_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    location: text("location").notNull().default(""),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    audienceGroupIds: uuid("audience_group_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    timezone: text("timezone").notNull(),
    cancelled: boolean("cancelled").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    creationKey: uuid("creation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_activity_scope").on(t.organizationId, t.id),
    unique("hub_activity_creation").on(t.organizationId, t.creationKey),
    index("hub_activity_page").on(
      t.organizationId,
      t.cancelled,
      t.createdAt,
      t.id,
    ),
    check("hub_activity_name", sql`length(trim(${t.name})) between 2 and 80`),
    check("hub_activity_description", sql`length(${t.description}) <= 2000`),
    check("hub_activity_location", sql`length(${t.location}) <= 160`),
    check(
      "hub_activity_time",
      sql`${t.endsAt} > ${t.startsAt} and ${t.endsAt} <= ${t.startsAt} + interval '7 days'`,
    ),
    check(
      "hub_activity_audience_bound",
      sql`cardinality(${t.audienceGroupIds}) <= 20`,
    ),
    check("hub_activity_version", sql`${t.version} > 0`),
  ],
);

export const activitySessions = pgTable(
  "hub_activity_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    activityId: uuid("activity_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    location: text("location").notNull(),
    timezone: text("timezone").notNull(),
    audienceGroupIds: uuid("audience_group_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    cancelled: boolean("cancelled").notNull().default(false),
    cancellationReason: text("cancellation_reason").notNull().default(""),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    creationKey: uuid("creation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.activityId],
      foreignColumns: [activities.organizationId, activities.id],
    }),
    unique("hub_session_scope").on(t.organizationId, t.activityId, t.id),
    unique("hub_session_creation").on(
      t.organizationId,
      t.activityId,
      t.creationKey,
    ),
    index("hub_session_schedule").on(
      t.organizationId,
      t.activityId,
      t.startsAt,
      t.id,
    ),
    check(
      "hub_session_time",
      sql`${t.endsAt} > ${t.startsAt} and ${t.endsAt} <= ${t.startsAt} + interval '7 days'`,
    ),
    check(
      "hub_session_audience_bound",
      sql`cardinality(${t.audienceGroupIds}) <= 20`,
    ),
    check("hub_session_reason", sql`length(${t.cancellationReason}) <= 300`),
    check("hub_session_location", sql`length(${t.location}) <= 160`),
    check("hub_session_version", sql`${t.version}>0`),
  ],
);

export const attendanceRequests = pgTable(
  "hub_attendance_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    activityId: uuid("activity_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    requestKey: uuid("request_key").notNull(),
    actorId: text("actor_id").notNull(),
    payload: jsonb("payload").notNull(),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.activityId, t.sessionId],
      foreignColumns: [
        activitySessions.organizationId,
        activitySessions.activityId,
        activitySessions.id,
      ],
    }),
    unique("hub_attendance_request_key").on(
      t.organizationId,
      t.sessionId,
      t.requestKey,
    ),
    unique("hub_attendance_request_scope").on(
      t.organizationId,
      t.sessionId,
      t.id,
    ),
  ],
);
export const attendance = pgTable(
  "hub_attendance",
  {
    organizationId: uuid("organization_id").notNull(),
    activityId: uuid("activity_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    personId: uuid("person_id").notNull(),
    status: text("status").notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.sessionId, t.personId] }),
    foreignKey({
      columns: [t.organizationId, t.activityId, t.sessionId],
      foreignColumns: [
        activitySessions.organizationId,
        activitySessions.activityId,
        activitySessions.id,
      ],
    }),
    foreignKey({
      columns: [t.organizationId, t.personId],
      foreignColumns: [people.organizationId, people.id],
    }),
    check(
      "hub_attendance_status",
      sql`${t.status} in ('unmarked','present','absent','excused')`,
    ),
    check("hub_attendance_version", sql`${t.version}>0`),
  ],
);
export const attendanceChanges = pgTable(
  "hub_attendance_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    personId: uuid("person_id").notNull(),
    requestId: uuid("request_id").notNull(),
    actorId: text("actor_id").notNull(),
    beforeStatus: text("before_status").notNull(),
    afterStatus: text("after_status").notNull(),
    reason: text("reason").notNull(),
    version: integer("version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.sessionId, t.personId],
      foreignColumns: [
        attendance.organizationId,
        attendance.sessionId,
        attendance.personId,
      ],
    }),
    foreignKey({
      columns: [t.organizationId, t.sessionId, t.requestId],
      foreignColumns: [
        attendanceRequests.organizationId,
        attendanceRequests.sessionId,
        attendanceRequests.id,
      ],
    }),
    unique("hub_attendance_change_version").on(
      t.organizationId,
      t.sessionId,
      t.personId,
      t.version,
    ),
    index("hub_attendance_history_page").on(
      t.organizationId,
      t.sessionId,
      t.personId,
      t.createdAt,
      t.id,
    ),
    check(
      "hub_attendance_change_states",
      sql`${t.beforeStatus} in ('unmarked','present','absent','excused') and ${t.afterStatus} in ('unmarked','present','absent','excused')`,
    ),
    check(
      "hub_attendance_change_reason",
      sql`length(${t.reason})<=300 and (${t.version}=1 or length(trim(${t.reason}))>0)`,
    ),
  ],
);

export const volunteerAssignments = pgTable(
  "hub_volunteer_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id").notNull(),
    staffName: text("staff_name").notNull(),
    groupId: uuid("group_id"),
    activityId: uuid("activity_id"),
    scopeName: text("scope_name").notNull(),
    canAttend: boolean("can_attend").notNull(),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    creationKey: uuid("creation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by"),
    revokeReason: text("revoke_reason"),
  },
  (t) => [
    unique("hub_volunteer_assignment_scope").on(t.organizationId, t.id),
    unique("hub_volunteer_assignment_creation").on(
      t.organizationId,
      t.creationKey,
    ),
    foreignKey({
      columns: [t.organizationId, t.groupId],
      foreignColumns: [groups.organizationId, groups.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.activityId],
      foreignColumns: [activities.organizationId, activities.id],
    }),
    check(
      "hub_volunteer_assignment_target",
      sql`(${t.groupId} is null) <> (${t.activityId} is null)`,
    ),
    check("hub_volunteer_assignment_version", sql`${t.version}>0`),
    uniqueIndex("hub_volunteer_active_group")
      .on(t.organizationId, t.userId, t.groupId)
      .where(sql`${t.revokedAt} is null and ${t.groupId} is not null`),
    uniqueIndex("hub_volunteer_active_activity")
      .on(t.organizationId, t.userId, t.activityId)
      .where(sql`${t.revokedAt} is null and ${t.activityId} is not null`),
    index("hub_volunteer_assignment_page").on(
      t.organizationId,
      t.createdAt,
      t.id,
    ),
  ],
);
export const volunteerAssignmentChanges = pgTable(
  "hub_volunteer_assignment_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    assignmentId: uuid("assignment_id").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.assignmentId],
      foreignColumns: [
        volunteerAssignments.organizationId,
        volunteerAssignments.id,
      ],
    }),
    index("hub_volunteer_assignment_history").on(
      t.organizationId,
      t.assignmentId,
      t.createdAt,
      t.id,
    ),
  ],
);

export const notifications = pgTable(
  "hub_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id").notNull(),
    eventId: uuid("event_id").notNull(),
    kind: text("kind").notNull(),
    href: text("href").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_notification_event").on(
      t.organizationId,
      t.userId,
      t.eventId,
      t.kind,
    ),
    index("hub_notification_page").on(
      t.userId,
      t.organizationId,
      t.createdAt,
      t.id,
    ),
  ],
);
export const pushDevices = pgTable(
  "hub_push_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    locale: text("locale").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("hub_push_user").on(t.userId),
    check("hub_push_locale", sql`${t.locale} in ('en','nl','tr')`),
  ],
);
export const pushDeliveries = pgTable(
  "hub_push_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => pushDevices.id, { onDelete: "cascade" }),
    state: text("state").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAt: timestamp("next_at", { withTimezone: true }).notNull().defaultNow(),
    lease: uuid("lease"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_push_delivery").on(t.notificationId, t.deviceId),
    index("hub_push_due").on(t.state, t.nextAt),
    check(
      "hub_push_state",
      sql`${t.state} in ('pending','sending','sent','dead') and ${t.attempts} between 0 and 5`,
    ),
  ],
);

// Session reservations and frozen expected rosters are independent of attendance.
export const registrationSettings = pgTable(
  "hub_session_registration_settings",
  {
    organizationId: uuid("organization_id").notNull(),
    activityId: uuid("activity_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    mode: text("mode").notNull().default("open"),
    capacity: integer("capacity"),
    version: integer("version").notNull().default(1),
    frozenAt: timestamp("frozen_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.sessionId] }),
    foreignKey({
      columns: [t.organizationId, t.activityId, t.sessionId],
      foreignColumns: [
        activitySessions.organizationId,
        activitySessions.activityId,
        activitySessions.id,
      ],
    }),
    check("hub_registration_mode", sql`${t.mode} in ('open','required')`),
    check(
      "hub_registration_capacity",
      sql`${t.capacity} is null or ${t.capacity} between 1 and 100000`,
    ),
    check("hub_registration_policy_version", sql`${t.version}>0`),
  ],
);
export const registrations = pgTable(
  "hub_session_registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    activityId: uuid("activity_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    personId: uuid("person_id").notNull(),
    status: text("status").notNull(),
    source: text("source").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.activityId, t.sessionId],
      foreignColumns: [
        activitySessions.organizationId,
        activitySessions.activityId,
        activitySessions.id,
      ],
    }),
    foreignKey({
      columns: [t.organizationId, t.personId],
      foreignColumns: [people.organizationId, people.id],
    }),
    unique("hub_registration_contact").on(
      t.organizationId,
      t.sessionId,
      t.personId,
    ),
    index("hub_registration_page").on(
      t.organizationId,
      t.sessionId,
      t.status,
      t.createdAt,
      t.id,
    ),
    check(
      "hub_registration_status",
      sql`${t.status} in ('confirmed','cancelled')`,
    ),
    check("hub_registration_source", sql`${t.source} in ('advance','walk_in')`),
    check("hub_registration_version", sql`${t.version}>0`),
  ],
);
export const expectedContacts = pgTable(
  "hub_session_expected_contacts",
  {
    organizationId: uuid("organization_id").notNull(),
    activityId: uuid("activity_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    personId: uuid("person_id").notNull(),
    initial: boolean("initial").notNull(),
    included: boolean("included").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.sessionId, t.personId] }),
    foreignKey({
      columns: [t.organizationId, t.activityId, t.sessionId],
      foreignColumns: [
        activitySessions.organizationId,
        activitySessions.activityId,
        activitySessions.id,
      ],
    }),
    foreignKey({
      columns: [t.organizationId, t.personId],
      foreignColumns: [people.organizationId, people.id],
    }),
    index("hub_expected_page").on(
      t.organizationId,
      t.sessionId,
      t.createdAt,
      t.personId,
    ),
  ],
);
export const registrationEvents = pgTable(
  "hub_session_registration_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    activityId: uuid("activity_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    personId: uuid("person_id"),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    reason: text("reason").notNull().default(""),
    before: jsonb("before"),
    after: jsonb("after").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.activityId, t.sessionId],
      foreignColumns: [
        activitySessions.organizationId,
        activitySessions.activityId,
        activitySessions.id,
      ],
    }),
    foreignKey({
      columns: [t.organizationId, t.personId],
      foreignColumns: [people.organizationId, people.id],
    }),
    index("hub_registration_event_page").on(
      t.organizationId,
      t.sessionId,
      t.createdAt,
      t.id,
    ),
    check(
      "hub_registration_event_action",
      sql`${t.action} in ('configure','register','cancel','freeze')`,
    ),
    check("hub_registration_event_reason", sql`length(${t.reason})<=300`),
  ],
);
export const registrationRequests = pgTable(
  "hub_session_registration_requests",
  {
    organizationId: uuid("organization_id").notNull(),
    activityId: uuid("activity_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    requestKey: uuid("request_key").notNull(),
    actorId: text("actor_id").notNull(),
    payload: jsonb("payload").notNull(),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.sessionId, t.requestKey] }),
    foreignKey({
      columns: [t.organizationId, t.activityId, t.sessionId],
      foreignColumns: [
        activitySessions.organizationId,
        activitySessions.activityId,
        activitySessions.id,
      ],
    }),
  ],
);
