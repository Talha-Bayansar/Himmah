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
    priceMinor: integer("price_minor").notNull().default(0),
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
    check("hub_activity_price", sql`${t.priceMinor} between 0 and 100000000`),
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
    priceMinor: integer("price_minor").notNull().default(0),
    name: text("name").notNull(),
    topic: text("topic").notNull().default(""),
    seriesId: uuid("series_id"),
    seriesPosition: integer("series_position"),
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
    check("hub_session_price", sql`${t.priceMinor} between 0 and 100000000`),
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
    index("hub_session_reminder_window")
      .on(t.startsAt, t.id)
      .where(sql`not ${t.cancelled}`),
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
    unique("hub_session_series_position").on(
      t.organizationId,
      t.activityId,
      t.seriesId,
      t.seriesPosition,
    ),
    check(
      "hub_session_series_pair",
      sql`(${t.seriesId} is null and ${t.seriesPosition} is null) or (${t.seriesId} is not null and ${t.seriesPosition} is not null and ${t.seriesPosition} between 0 and 51)`,
    ),
    check("hub_session_topic", sql`length(${t.topic}) <= 160`),
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
    canCollect: boolean("can_collect").notNull().default(false),
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

export const sessionFollows = pgTable(
  "hub_session_follows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    userId: text("user_id").notNull(),
    activityId: uuid("activity_id").notNull(),
    sessionId: uuid("session_id"),
    enabled: boolean("enabled").notNull(),
    reminderMinutes: integer("reminder_minutes").notNull().default(60),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_follow_scope").on(t.organizationId, t.id),
    uniqueIndex("hub_follow_activity")
      .on(t.organizationId, t.userId, t.activityId)
      .where(sql`${t.sessionId} is null`),
    uniqueIndex("hub_follow_session")
      .on(t.organizationId, t.userId, t.activityId, t.sessionId)
      .where(sql`${t.sessionId} is not null`),
    index("hub_follow_lookup")
      .on(t.organizationId, t.activityId, t.sessionId)
      .where(sql`${t.enabled}`),
    foreignKey({
      columns: [t.organizationId, t.userId],
      foreignColumns: [memberships.organizationId, memberships.userId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.activityId],
      foreignColumns: [activities.organizationId, activities.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.activityId, t.sessionId],
      foreignColumns: [
        activitySessions.organizationId,
        activitySessions.activityId,
        activitySessions.id,
      ],
    }).onDelete("cascade"),
    check(
      "hub_follow_settings",
      sql`${t.reminderMinutes} in (0,60) and ${t.version}>0`,
    ),
  ],
);
export const followRequests = pgTable(
  "hub_follow_requests",
  {
    organizationId: uuid("organization_id").notNull(),
    userId: text("user_id").notNull(),
    requestKey: uuid("request_key").notNull(),
    activityId: uuid("activity_id").notNull(),
    sessionId: uuid("session_id"),
    payload: jsonb("payload").notNull(),
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId, t.requestKey] }),
    foreignKey({
      columns: [t.organizationId, t.userId],
      foreignColumns: [memberships.organizationId, memberships.userId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.activityId],
      foreignColumns: [activities.organizationId, activities.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.activityId, t.sessionId],
      foreignColumns: [
        activitySessions.organizationId,
        activitySessions.activityId,
        activitySessions.id,
      ],
    }).onDelete("cascade"),
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
    activityId: uuid("activity_id"),
    sessionId: uuid("session_id"),
    followId: uuid("follow_id"),
    followVersion: integer("follow_version"),
    plannedAt: timestamp("planned_at", { withTimezone: true }),
    sessionFingerprint: text("session_fingerprint"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.followId],
      foreignColumns: [sessionFollows.organizationId, sessionFollows.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.organizationId, t.activityId, t.sessionId],
      foreignColumns: [
        activitySessions.organizationId,
        activitySessions.activityId,
        activitySessions.id,
      ],
    }).onDelete("cascade"),
    uniqueIndex("hub_reminder_once")
      .on(t.organizationId, t.userId, t.sessionId, t.plannedAt)
      .where(sql`${t.kind}='session_reminder'`),
    check(
      "hub_session_notification_fields",
      sql`${t.kind}='staff_notice' or (${t.kind} in ('session_reminder','session_changed','session_cancelled') and ${t.activityId} is not null and ${t.sessionId} is not null and ${t.followId} is not null and ${t.followVersion} is not null and ${t.followVersion}>0 and ${t.plannedAt} is not null and ${t.sessionFingerprint} is not null)`,
    ),
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
    unique("hub_registration_scope").on(t.organizationId, t.id),
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

export const registrationCharges = pgTable(
  "hub_registration_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    registrationId: uuid("registration_id"),
    activityId: uuid("activity_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    personId: uuid("person_id").notNull(),
    source: text("source").notNull().default("registration"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("EUR"),
    createdBy: text("created_by").notNull(),
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
    foreignKey({
      columns: [t.organizationId, t.personId],
      foreignColumns: [people.organizationId, people.id],
    }),
    unique("hub_charge_session_person").on(
      t.organizationId,
      t.sessionId,
      t.personId,
    ),
    check(
      "hub_charge_source",
      sql`(${t.source}='registration' and ${t.registrationId} is not null) or (${t.source}='walk_in' and ${t.registrationId} is null)`,
    ),
    foreignKey({
      columns: [t.organizationId, t.registrationId],
      foreignColumns: [registrations.organizationId, registrations.id],
    }),
    unique("hub_charge_scope").on(t.organizationId, t.id),
    unique("hub_charge_registration").on(t.organizationId, t.registrationId),
    check("hub_charge_amount", sql`${t.amountMinor} between 1 and 100000000`),
    check("hub_charge_currency", sql`${t.currency}='EUR'`),
  ],
);

export const cashReceipts = pgTable(
  "hub_cash_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    activityId: uuid("activity_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("EUR"),
    payerLabel: text("payer_label").notNull().default(""),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_cash_receipt_scope").on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.activityId, t.sessionId],
      foreignColumns: [
        activitySessions.organizationId,
        activitySessions.activityId,
        activitySessions.id,
      ],
    }),
    check(
      "hub_cash_receipt_amount",
      sql`${t.amountMinor} between 1 and 100000000`,
    ),
    check("hub_cash_receipt_currency", sql`${t.currency}='EUR'`),
    check("hub_cash_payer_bound", sql`length(${t.payerLabel})<=100`),
    index("hub_cash_receipt_page").on(
      t.organizationId,
      t.sessionId,
      t.createdAt,
      t.id,
    ),
  ],
);
export const cashAllocations = pgTable(
  "hub_cash_allocations",
  {
    organizationId: uuid("organization_id").notNull(),
    receiptId: uuid("receipt_id").notNull(),
    chargeId: uuid("charge_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.receiptId, t.chargeId] }),
    foreignKey({
      columns: [t.organizationId, t.receiptId],
      foreignColumns: [cashReceipts.organizationId, cashReceipts.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.chargeId],
      foreignColumns: [
        registrationCharges.organizationId,
        registrationCharges.id,
      ],
    }),
    check(
      "hub_cash_allocation_amount",
      sql`${t.amountMinor} between 1 and 100000000`,
    ),
    index("hub_cash_allocation_charge").on(t.organizationId, t.chargeId),
  ],
);
export const cashReversals = pgTable(
  "hub_cash_reversals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    receiptId: uuid("receipt_id").notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_cash_reversal_receipt").on(t.organizationId, t.receiptId),
    foreignKey({
      columns: [t.organizationId, t.receiptId],
      foreignColumns: [cashReceipts.organizationId, cashReceipts.id],
    }),
    check(
      "hub_cash_reversal_reason",
      sql`length(trim(${t.reason})) between 1 and 300`,
    ),
  ],
);
export const cashRequests = pgTable(
  "hub_cash_requests",
  {
    organizationId: uuid("organization_id").notNull(),
    requestKey: uuid("request_key").notNull(),
    activityId: uuid("activity_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    actorId: text("actor_id").notNull(),
    payload: jsonb("payload").notNull(),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.requestKey] }),
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

export const billingRequests = pgTable(
  "hub_billing_requests",
  {
    organizationId: uuid("organization_id").notNull(),
    requestKey: uuid("request_key").notNull(),
    activityId: uuid("activity_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    actorId: text("actor_id").notNull(),
    payload: jsonb("payload").notNull(),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.requestKey] }),
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

// Append-only, contact-specific payment corrections; sibling allocations remain intact.
export const cashAllocationCorrections = pgTable(
  "hub_cash_allocation_corrections",
  {
    organizationId: uuid("organization_id").notNull(),
    receiptId: uuid("receipt_id").notNull(),
    chargeId: uuid("charge_id").notNull(),
    requestKey: uuid("request_key").notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      name: "hub_cash_correction_pk",
      columns: [t.organizationId, t.receiptId, t.chargeId],
    }),
    foreignKey({
      name: "hub_cash_correction_allocation_fk",
      columns: [t.organizationId, t.receiptId, t.chargeId],
      foreignColumns: [
        cashAllocations.organizationId,
        cashAllocations.receiptId,
        cashAllocations.chargeId,
      ],
    }),
    index("hub_cash_correction_charge").on(t.organizationId, t.chargeId),
  ],
);
export const sessionOperations = pgTable(
  "hub_session_operations",
  {
    organizationId: uuid("organization_id").notNull(),
    requestKey: uuid("request_key").notNull(),
    activityId: uuid("activity_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    actorId: text("actor_id").notNull(),
    payload: jsonb("payload").notNull(),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.requestKey] }),
    foreignKey({
      name: "hub_session_operation_session_fk",
      columns: [t.organizationId, t.activityId, t.sessionId],
      foreignColumns: [
        activitySessions.organizationId,
        activitySessions.activityId,
        activitySessions.id,
      ],
    }),
  ],
);

// Learning is organization-owned; activity and session links provide optional context.
export const learningItems = pgTable(
  "hub_learning_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    title: text().notNull(),
    description: text().notNull().default(""),
    activityId: uuid("activity_id"),
    sessionId: uuid("session_id"),
    draft: jsonb().notNull(),
    state: text().notNull().default("draft"),
    version: integer().notNull().default(1),
    currentPublication: uuid("current_publication"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").notNull(),
  },
  (t) => [
    unique("hub_learning_item_scope").on(t.organizationId, t.id),
    index("hub_learning_directory").on(t.organizationId, t.createdAt, t.id),
    check(
      "hub_learning_title",
      sql`length(trim(${t.title})) between 2 and 160`,
    ),
    check(
      "hub_learning_state",
      sql`${t.state} in ('draft','published','closed')`,
    ),
    check("hub_learning_revision", sql`${t.version}>0`),
    check(
      "hub_learning_session_context",
      sql`${t.sessionId} is null or ${t.activityId} is not null`,
    ),
    foreignKey({
      name: "hub_learning_activity",
      columns: [t.organizationId, t.activityId],
      foreignColumns: [activities.organizationId, activities.id],
    }).onDelete("set null"),
    foreignKey({
      name: "hub_learning_session",
      columns: [t.organizationId, t.activityId, t.sessionId],
      foreignColumns: [
        activitySessions.organizationId,
        activitySessions.activityId,
        activitySessions.id,
      ],
    }).onDelete("set null"),
  ],
);
export const learningVersions = pgTable(
  "hub_learning_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    itemId: uuid("item_id").notNull(),
    number: integer().notNull(),
    content: jsonb().notNull(),
    openHash: text("open_hash"),
    released: boolean().notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_learning_version_scope").on(t.organizationId, t.id),
    unique("hub_learning_version_number").on(
      t.organizationId,
      t.itemId,
      t.number,
    ),
    foreignKey({
      columns: [t.organizationId, t.itemId],
      foreignColumns: [learningItems.organizationId, learningItems.id],
    }),
    uniqueIndex("hub_learning_open_hash").on(t.openHash),
  ],
);
export const learningRecipients = pgTable(
  "hub_learning_recipients",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    publicationId: uuid("publication_id").notNull(),
    contactId: uuid("contact_id"),
    name: text().notNull(),
    linkHash: text("link_hash"),
    guestHash: text("guest_hash"),
    revoked: boolean().notNull().default(false),
    allowance: integer().notNull().default(1),
    revision: integer().notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_learning_recipient_scope").on(t.organizationId, t.id),
    unique("hub_learning_assignment").on(
      t.organizationId,
      t.publicationId,
      t.contactId,
    ),
    uniqueIndex("hub_learning_link_hash").on(t.linkHash),
    uniqueIndex("hub_learning_guest_hash").on(t.guestHash),
    index("hub_learning_recipient_directory").on(
      t.organizationId,
      t.publicationId,
      t.createdAt,
      t.id,
    ),
    foreignKey({
      columns: [t.organizationId, t.publicationId],
      foreignColumns: [learningVersions.organizationId, learningVersions.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.contactId],
      foreignColumns: [people.organizationId, people.id],
    }),
    check("hub_learning_allowance", sql`${t.allowance} between 1 and 5`),
    check(
      "hub_learning_identity",
      sql`(${t.contactId} is not null and ${t.guestHash} is null) or (${t.contactId} is null and ${t.guestHash} is not null)`,
    ),
  ],
);
export const learningAttempts = pgTable(
  "hub_learning_attempts",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    recipientId: uuid("recipient_id").notNull(),
    sequence: integer().notNull(),
    answers: jsonb().notNull().default({}),
    revision: integer().notNull().default(1),
    score: integer(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_learning_attempt_scope").on(t.organizationId, t.id),
    unique("hub_learning_attempt_sequence").on(
      t.organizationId,
      t.recipientId,
      t.sequence,
    ),
    foreignKey({
      columns: [t.organizationId, t.recipientId],
      foreignColumns: [
        learningRecipients.organizationId,
        learningRecipients.id,
      ],
    }),
    check(
      "hub_learning_attempt_state",
      sql`(${t.submittedAt} is null and ${t.score} is null) or (${t.submittedAt} is not null and ${t.score}>=0)`,
    ),
  ],
);
export const learningOperations = pgTable(
  "hub_learning_operations",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorId: text("actor_id").notNull(),
    requestKey: uuid("request_key").notNull(),
    payload: jsonb().notNull(),
    response: jsonb().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_learning_operation_key").on(
      t.organizationId,
      t.actorId,
      t.requestKey,
    ),
  ],
);

// Live quizzes reuse immutable learning publications; guests never become contacts.
export const liveRooms = pgTable(
  "hub_live_rooms",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    itemId: uuid("item_id").notNull(),
    publicationId: uuid("publication_id").notNull(),
    code: text("code").notNull().unique(),
    state: text("state").notNull().default("lobby"),
    questionIndex: integer("question_index").notNull().default(-1),
    version: integer("version").notNull().default(1),
    nextNumber: integer("next_number").notNull().default(0),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    unique("hub_live_room_scope").on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.itemId],
      foreignColumns: [learningItems.organizationId, learningItems.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.publicationId],
      foreignColumns: [learningVersions.organizationId, learningVersions.id],
    }),
    index("hub_live_room_directory").on(
      t.organizationId,
      t.itemId,
      t.createdAt,
      t.id,
    ),
    check(
      "hub_live_room_state",
      sql`${t.state} in ('lobby','question','locked','revealed','finished')`,
    ),
    check(
      "hub_live_room_bounds",
      sql`${t.questionIndex} between -1 and 49 and ${t.version}>0 and ${t.nextNumber} between 0 and 200 and ${t.expiresAt}>${t.createdAt}`,
    ),
    check("hub_live_code", sql`${t.code} ~ '^[A-F0-9]{10}$'`),
  ],
);
export const livePlayers = pgTable(
  "hub_live_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    roomId: uuid("room_id").notNull(),
    credentialHash: text("credential_hash").notNull(),
    nickname: text("nickname"),
    number: integer("number").notNull(),
    revision: integer("revision").notNull().default(1),
    revoked: boolean("revoked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_live_player_scope").on(t.organizationId, t.roomId, t.id),
    unique("hub_live_player_credential").on(t.roomId, t.credentialHash),
    unique("hub_live_player_number").on(t.roomId, t.number),
    foreignKey({
      columns: [t.organizationId, t.roomId],
      foreignColumns: [liveRooms.organizationId, liveRooms.id],
    }),
    index("hub_live_player_directory").on(
      t.organizationId,
      t.roomId,
      t.createdAt,
      t.id,
    ),
    check(
      "hub_live_player_bounds",
      sql`${t.number} between 1 and 200 and ${t.revision}>0 and (${t.nickname} is null or length(trim(${t.nickname})) between 1 and 40) and ${t.credentialHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);
export const liveAnswers = pgTable(
  "hub_live_answers",
  {
    organizationId: uuid("organization_id").notNull(),
    roomId: uuid("room_id").notNull(),
    playerId: uuid("player_id").notNull(),
    questionIndex: integer("question_index").notNull(),
    choice: integer("choice").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.roomId, t.playerId, t.questionIndex] }),
    foreignKey({
      columns: [t.organizationId, t.roomId, t.playerId],
      foreignColumns: [
        livePlayers.organizationId,
        livePlayers.roomId,
        livePlayers.id,
      ],
    }),
    index("hub_live_answer_counts").on(t.roomId, t.questionIndex),
    check(
      "hub_live_answer_bounds",
      sql`${t.questionIndex} between 0 and 49 and ${t.choice} between 0 and 5`,
    ),
  ],
);
export const liveOperations = pgTable(
  "hub_live_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    roomId: uuid("room_id").notNull(),
    actor: text("actor").notNull(),
    requestKey: uuid("request_key").notNull(),
    payload: jsonb("payload").notNull(),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_live_operation_key").on(
      t.organizationId,
      t.actor,
      t.requestKey,
    ),
    foreignKey({
      columns: [t.organizationId, t.roomId],
      foreignColumns: [liveRooms.organizationId, liveRooms.id],
    }),
  ],
);
