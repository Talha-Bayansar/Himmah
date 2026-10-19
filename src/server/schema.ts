import {
  pgTable,
  date,
  bigint,
  jsonb,
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

// Activity defaults. Legacy dates are retained for migration compatibility only.
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
    attendancePoints: integer("attendance_points").notNull().default(0),
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
    check(
      "hub_activity_attendance_points",
      sql`${t.attendancePoints} between 0 and 10000`,
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
    attendancePoints: integer("attendance_points").notNull().default(0),
    earningRuleVersion: integer("earning_rule_version").notNull().default(0),
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
    check(
      "hub_session_attendance_points",
      sql`${t.attendancePoints} between 0 and 10000 and ${t.earningRuleVersion}>=0`,
    ),
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

export const pointsRequests = pgTable(
  "hub_points_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    requestKey: uuid("request_key").notNull(),
    actorId: text("actor_id").notNull(),
    payload: jsonb("payload").notNull(),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_points_request_key").on(t.organizationId, t.requestKey),
    unique("hub_points_request_scope").on(t.organizationId, t.id),
  ],
);
export const pointsEntries = pgTable(
  "hub_points_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    personId: uuid("person_id").notNull(),
    requestId: uuid("request_id").notNull(),
    actorId: text("actor_id").notNull(),
    source: text("source").notNull().default("manual"),
    ruleVersion: integer("rule_version"),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    originalId: uuid("original_id"),
    activityId: uuid("activity_id"),
    sessionId: uuid("session_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_points_entry_scope").on(t.organizationId, t.personId, t.id),
    unique("hub_points_entry_recipient").on(t.requestId, t.personId),
    foreignKey({
      columns: [t.organizationId, t.personId],
      foreignColumns: [people.organizationId, people.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.requestId],
      foreignColumns: [pointsRequests.organizationId, pointsRequests.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.activityId],
      foreignColumns: [activities.organizationId, activities.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.activityId, t.sessionId],
      foreignColumns: [
        activitySessions.organizationId,
        activitySessions.activityId,
        activitySessions.id,
      ],
    }),
    foreignKey({
      columns: [t.organizationId, t.personId, t.originalId],
      foreignColumns: [t.organizationId, t.personId, t.id],
    }),
    index("hub_points_member_page").on(
      t.organizationId,
      t.personId,
      t.createdAt,
      t.id,
    ),
    index("hub_points_original").on(t.organizationId, t.personId, t.originalId),
    check(
      "hub_points_source",
      sql`${t.source} in ('manual','attendance','challenge') and (${t.source}='manual' or (${t.ruleVersion} is not null and ${t.ruleVersion}>0)) and (${t.source}<>'attendance' or ${t.sessionId} is not null)`,
    ),
    check(
      "hub_points_amount",
      sql`${t.amount} between -10000 and 10000 and ${t.amount}<>0 and (${t.originalId} is not null or ${t.amount}>0)`,
    ),
    check(
      "hub_points_reason",
      sql`length(trim(${t.reason})) between 1 and 300`,
    ),
    check(
      "hub_points_reference",
      sql`${t.sessionId} is null or ${t.activityId} is not null`,
    ),
  ],
);

export const engagementPeriods = pgTable(
  "hub_engagement_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    timezone: text("timezone").notNull(),
    version: integer("version").notNull().default(1),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: text("closed_by"),
    createdBy: text("created_by").notNull(),
    creationKey: uuid("creation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_period_scope").on(t.organizationId, t.id),
    unique("hub_period_creation").on(t.organizationId, t.creationKey),
    index("hub_period_page").on(t.organizationId, t.createdAt, t.id),
    check(
      "hub_period_dates",
      sql`${t.startDate}>='2000-01-01' and ${t.endDate}<='2100-12-31' and ${t.endDate}>=${t.startDate}`,
    ),
    check("hub_period_name", sql`length(trim(${t.name})) between 2 and 80`),
    check("hub_period_version", sql`${t.version}>0`),
    check(
      "hub_period_closed",
      sql`(${t.closedAt} is null)=(${t.closedBy} is null)`,
    ),
  ],
);
export const periodMembers = pgTable(
  "hub_period_members",
  {
    organizationId: uuid("organization_id").notNull(),
    periodId: uuid("period_id").notNull(),
    personId: uuid("person_id").notNull(),
    name: text("name").notNull(),
    archived: boolean("archived").notNull(),
    personCreatedAt: timestamp("person_created_at", {
      withTimezone: true,
    }).notNull(),
    points: bigint("points", { mode: "bigint" }).notNull(),
    present: integer("present").notNull(),
    absent: integer("absent").notNull(),
    excused: integer("excused").notNull(),
    unmarked: integer("unmarked").notNull(),
    groupIds: uuid("group_ids").array().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.periodId, t.personId] }),
    foreignKey({
      columns: [t.organizationId, t.periodId],
      foreignColumns: [engagementPeriods.organizationId, engagementPeriods.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.personId],
      foreignColumns: [people.organizationId, people.id],
    }),
    index("hub_period_member_page").on(
      t.organizationId,
      t.periodId,
      t.personCreatedAt,
      t.personId,
    ),
  ],
);
export const periodGroups = pgTable(
  "hub_period_groups",
  {
    organizationId: uuid("organization_id").notNull(),
    periodId: uuid("period_id").notNull(),
    groupId: uuid("group_id").notNull(),
    name: text("name").notNull(),
    archived: boolean("archived").notNull(),
    groupCreatedAt: timestamp("group_created_at", {
      withTimezone: true,
    }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.periodId, t.groupId] }),
    foreignKey({
      columns: [t.organizationId, t.periodId],
      foreignColumns: [engagementPeriods.organizationId, engagementPeriods.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.groupId],
      foreignColumns: [groups.organizationId, groups.id],
    }),
  ],
);

export const attendanceAwards = pgTable(
  "hub_attendance_awards",
  {
    organizationId: uuid("organization_id").notNull(),
    activityId: uuid("activity_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    personId: uuid("person_id").notNull(),
    originalId: uuid("original_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.sessionId, t.personId] }),
    foreignKey({
      columns: [t.organizationId, t.sessionId, t.personId],
      foreignColumns: [
        attendance.organizationId,
        attendance.sessionId,
        attendance.personId,
      ],
    }),
    foreignKey({
      columns: [t.organizationId, t.activityId, t.sessionId],
      foreignColumns: [
        activitySessions.organizationId,
        activitySessions.activityId,
        activitySessions.id,
      ],
    }),
    foreignKey({
      columns: [t.organizationId, t.personId, t.originalId],
      foreignColumns: [
        pointsEntries.organizationId,
        pointsEntries.personId,
        pointsEntries.id,
      ],
    }),
    unique("hub_attendance_award_root").on(t.organizationId, t.originalId),
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
    canAward: boolean("can_award").notNull(),
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
    check(
      "hub_volunteer_assignment_capabilities",
      sql`${t.canAttend} or ${t.canAward}`,
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

export const rewards = pgTable(
  "hub_rewards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description").notNull(),
    cost: integer("cost").notNull(),
    stock: integer("stock"),
    archived: boolean("archived").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    creationKey: uuid("creation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_reward_scope").on(t.organizationId, t.id),
    unique("hub_reward_creation").on(t.organizationId, t.creationKey),
    check(
      "hub_reward_fields",
      sql`length(${t.name}) between 2 and 80 and length(${t.description})<=1000 and ${t.cost} between 1 and 1000000 and (${t.stock} is null or ${t.stock} between 0 and 1000000) and ${t.version}>0`,
    ),
    index("hub_reward_page").on(t.organizationId, t.createdAt, t.id),
  ],
);
export const redemptions = pgTable(
  "hub_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    rewardId: uuid("reward_id").notNull(),
    personId: uuid("person_id").notNull(),
    rewardName: text("reward_name").notNull(),
    personName: text("person_name").notNull(),
    cost: integer("cost").notNull(),
    status: text("status").notNull().default("pending"),
    version: integer("version").notNull().default(1),
    request: jsonb("request").notNull(),
    createdBy: text("created_by").notNull(),
    createdByName: text("created_by_name").notNull(),
    creationKey: uuid("creation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    fulfilledBy: text("fulfilled_by"),
    fulfilledByName: text("fulfilled_by_name"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by"),
    cancelledByName: text("cancelled_by_name"),
    cancelReason: text("cancel_reason"),
  },
  (t) => [
    unique("hub_redemption_scope").on(t.organizationId, t.id),
    unique("hub_redemption_creation").on(t.organizationId, t.creationKey),
    foreignKey({
      columns: [t.organizationId, t.rewardId],
      foreignColumns: [rewards.organizationId, rewards.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.personId],
      foreignColumns: [people.organizationId, people.id],
    }),
    check(
      "hub_redemption_fields",
      sql`${t.cost} between 1 and 1000000 and ${t.version}>0 and ((${t.status}='pending' and ${t.fulfilledAt} is null and ${t.cancelledAt} is null) or (${t.status}='fulfilled' and ${t.fulfilledAt} is not null and ${t.fulfilledBy} is not null and ${t.cancelledAt} is null) or (${t.status}='cancelled' and ${t.cancelledAt} is not null and ${t.cancelledBy} is not null and length(${t.cancelReason}) between 1 and 300 and ${t.fulfilledAt} is null))`,
    ),
    index("hub_redemption_reward_page").on(
      t.organizationId,
      t.rewardId,
      t.createdAt,
      t.id,
    ),
    index("hub_redemption_person").on(t.organizationId, t.personId, t.status),
  ],
);
export const rewardChanges = pgTable(
  "hub_reward_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    rewardId: uuid("reward_id").notNull(),
    redemptionId: uuid("redemption_id"),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.rewardId],
      foreignColumns: [rewards.organizationId, rewards.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.redemptionId],
      foreignColumns: [redemptions.organizationId, redemptions.id],
    }),
    index("hub_reward_audit_page").on(
      t.organizationId,
      t.rewardId,
      t.createdAt,
      t.id,
    ),
  ],
);

export const participantInvitations = pgTable(
  "hub_participant_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    personId: uuid("person_id").notNull(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: text("created_by").notNull(),
    creationKey: uuid("creation_key").notNull(),
    consentAttestedAt: timestamp("consent_attested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    acceptedBy: text("accepted_by"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (t) => [
    unique("hub_participant_invitation_scope").on(t.organizationId, t.id),
    unique("hub_participant_invitation_creation").on(
      t.organizationId,
      t.creationKey,
    ),
    foreignKey({
      columns: [t.organizationId, t.personId],
      foreignColumns: [people.organizationId, people.id],
    }),
    check(
      "hub_participant_invitation_fields",
      sql`length(${t.email}) between 3 and 254 and ${t.tokenHash} ~ '^[0-9a-f]{64}$' and ${t.expiresAt}>${t.createdAt} and ((${t.acceptedBy} is null)=(${t.acceptedAt} is null))`,
    ),
    index("hub_participant_invitation_page").on(
      t.organizationId,
      t.personId,
      t.createdAt,
      t.id,
    ),
  ],
);
export const participantLinks = pgTable(
  "hub_participant_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    personId: uuid("person_id").notNull(),
    userId: text("user_id").notNull(),
    invitationId: uuid("invitation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by"),
    revokeReason: text("revoke_reason"),
  },
  (t) => [
    unique("hub_participant_link_scope").on(t.organizationId, t.id),
    unique("hub_participant_link_invitation").on(t.invitationId),
    foreignKey({
      columns: [t.organizationId, t.personId],
      foreignColumns: [people.organizationId, people.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.invitationId],
      foreignColumns: [
        participantInvitations.organizationId,
        participantInvitations.id,
      ],
    }),
    uniqueIndex("hub_participant_active_person")
      .on(t.organizationId, t.personId)
      .where(sql`${t.revokedAt} is null`),
    uniqueIndex("hub_participant_active_user")
      .on(t.organizationId, t.userId)
      .where(sql`${t.revokedAt} is null`),
    index("hub_participant_user").on(t.userId, t.organizationId),
  ],
);
export const participantEvents = pgTable(
  "hub_participant_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    personId: uuid("person_id").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityId: uuid("entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.personId],
      foreignColumns: [people.organizationId, people.id],
    }),
    index("hub_participant_event_page").on(
      t.organizationId,
      t.personId,
      t.createdAt,
      t.id,
    ),
  ],
);

export const rewardCoupons = pgTable(
  "hub_reward_coupons",
  {
    redemptionId: uuid("redemption_id").primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    code: text("code")
      .notNull()
      .unique()
      .default(
        sql`replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')`,
      ),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.redemptionId],
      foreignColumns: [redemptions.organizationId, redemptions.id],
    }),
    check("hub_coupon_code", sql`${t.code} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const challenges = pgTable(
  "hub_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description").notNull(),
    points: integer("points").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    status: text("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("hub_challenge_scope").on(t.organizationId, t.id),
    index("hub_challenge_page").on(
      t.organizationId,
      t.status,
      t.createdAt,
      t.id,
    ),
    check(
      "hub_challenge_fields",
      sql`length(trim(${t.name})) between 2 and 80 and length(trim(${t.description})) between 1 and 2000 and ${t.points} between 1 and 10000 and ${t.version}>0 and ${t.status} in ('draft','published','archived')`,
    ),
    check(
      "hub_challenge_dates",
      sql`(${t.startsAt} is null or ${t.startsAt} between '2000-01-01' and '2101-01-01') and (${t.endsAt} is null or ${t.endsAt} between '2000-01-01' and '2101-01-01') and (${t.startsAt} is null or ${t.endsAt} is null or ${t.endsAt}>${t.startsAt})`,
    ),
  ],
);
export const challengeGroups = pgTable(
  "hub_challenge_groups",
  {
    organizationId: uuid("organization_id").notNull(),
    challengeId: uuid("challenge_id").notNull(),
    groupId: uuid("group_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.challengeId, t.groupId] }),
    foreignKey({
      columns: [t.organizationId, t.challengeId],
      foreignColumns: [challenges.organizationId, challenges.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.groupId],
      foreignColumns: [groups.organizationId, groups.id],
    }),
  ],
);
export const challengeSubmissions = pgTable(
  "hub_challenge_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    challengeId: uuid("challenge_id").notNull(),
    personId: uuid("person_id").notNull(),
    challengeName: text("challenge_name").notNull(),
    personName: text("person_name").notNull(),
    points: integer("points").notNull(),
    challengeVersion: integer("challenge_version").notNull(),
    note: text("note").notNull().default(""),
    status: text("status").notNull().default("pending"),
    version: integer("version").notNull().default(1),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedBy: text("submitted_by").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    feedback: text("feedback").notNull().default(""),
    entryId: uuid("entry_id"),
  },
  (t) => [
    unique("hub_challenge_submission_scope").on(
      t.organizationId,
      t.challengeId,
      t.id,
    ),
    unique("hub_challenge_once").on(
      t.organizationId,
      t.challengeId,
      t.personId,
    ),
    foreignKey({
      columns: [t.organizationId, t.challengeId],
      foreignColumns: [challenges.organizationId, challenges.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.personId],
      foreignColumns: [people.organizationId, people.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.personId, t.entryId],
      foreignColumns: [
        pointsEntries.organizationId,
        pointsEntries.personId,
        pointsEntries.id,
      ],
    }),
    index("hub_challenge_submission_page").on(
      t.organizationId,
      t.challengeId,
      t.createdAt,
      t.id,
    ),
    index("hub_challenge_person_page").on(
      t.organizationId,
      t.personId,
      t.createdAt,
      t.id,
    ),
    check(
      "hub_challenge_submission_fields",
      sql`${t.status} in ('pending','approved','rejected','withdrawn') and ${t.version}>0 and ${t.points} between 1 and 10000 and ${t.challengeVersion}>0 and length(${t.note})<=500 and length(${t.feedback})<=300 and (${t.status}='approved')=(${t.entryId} is not null) and (${t.status} in ('approved','rejected'))=(${t.reviewedAt} is not null and ${t.reviewedBy} is not null)`,
    ),
  ],
);
export const challengeRequests = pgTable(
  "hub_challenge_requests",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    key: uuid("request_key").notNull(),
    actorId: text("actor_id").notNull(),
    payload: jsonb("payload").notNull(),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.key] })],
);
export const challengeEvents = pgTable(
  "hub_challenge_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    challengeId: uuid("challenge_id").notNull(),
    submissionId: uuid("submission_id"),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.challengeId],
      foreignColumns: [challenges.organizationId, challenges.id],
    }),
    foreignKey({
      columns: [t.organizationId, t.challengeId, t.submissionId],
      foreignColumns: [
        challengeSubmissions.organizationId,
        challengeSubmissions.challengeId,
        challengeSubmissions.id,
      ],
    }),
  ],
);
