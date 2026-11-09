-- One useful operational reminder, only for opted-in followers who can record attendance.
CREATE FUNCTION hub_generate_session_starts() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE produced integer;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtext('himmah-session-starts')) THEN RETURN 0; END IF;
 INSERT INTO hub_notifications(organization_id,user_id,event_id,kind,href,activity_id,session_id,follow_id,follow_version,planned_at,session_fingerprint)
 SELECT s.organization_id,f.user_id,gen_random_uuid(),'session_started',hub_session_notice_href(f.user_id,s.organization_id,s.activity_id,s.id),s.activity_id,s.id,f.id,f.version,s.starts_at,hub_session_notice_fingerprint(s)
 FROM hub_activity_sessions s JOIN hub_activities a ON a.organization_id=s.organization_id AND a.id=s.activity_id
 CROSS JOIN LATERAL hub_effective_session_follows(s.organization_id,s.activity_id,s.id) f
 WHERE NOT s.cancelled AND NOT a.cancelled AND s.starts_at<=now() AND s.starts_at>now()-interval '15 minutes' AND s.ends_at>now()
 AND f.reminder_minutes=60 AND hub_can_attend_session(f.user_id,s.organization_id,s.activity_id,s.id)
 AND NOT EXISTS(SELECT 1 FROM hub_attendance done WHERE done.organization_id=s.organization_id AND done.session_id=s.id AND done.status='present' AND hub_can_attend_person(f.user_id,s.organization_id,s.activity_id,s.id,done.person_id))
 AND NOT EXISTS(SELECT 1 FROM hub_notifications n WHERE n.organization_id=s.organization_id AND n.user_id=f.user_id AND n.session_id=s.id AND n.planned_at=s.starts_at AND n.kind='session_started')
 ORDER BY s.starts_at,s.id,f.id LIMIT 100 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS produced=ROW_COUNT;
 RETURN produced;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION hub_notification_visible(n hub_notifications,p_user text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT n.user_id=p_user AND EXISTS(SELECT 1 FROM hub_memberships WHERE organization_id=n.organization_id AND user_id=p_user)
 AND (n.kind='staff_notice' OR (n.kind IN ('session_reminder','session_changed','session_cancelled','session_started') AND EXISTS(
 SELECT 1 FROM hub_activity_sessions s JOIN hub_activities a ON a.organization_id=s.organization_id AND a.id=s.activity_id
 JOIN hub_effective_session_follows(n.organization_id,n.activity_id,n.session_id) f ON f.id=n.follow_id AND f.user_id=p_user AND f.version=n.follow_version
 WHERE s.organization_id=n.organization_id AND s.activity_id=n.activity_id AND s.id=n.session_id AND NOT a.cancelled
 AND n.session_fingerprint=hub_session_notice_fingerprint(s)
 AND (n.kind<>'session_reminder' OR (NOT s.cancelled AND s.starts_at=n.planned_at AND s.starts_at>now()))
 AND (n.kind<>'session_started' OR (NOT s.cancelled AND f.reminder_minutes=60 AND hub_can_attend_session(p_user,s.organization_id,s.activity_id,s.id)
 AND s.starts_at=n.planned_at AND s.starts_at<=now() AND now()<least(s.ends_at,s.starts_at+interval '15 minutes')
 AND NOT EXISTS(SELECT 1 FROM hub_attendance done WHERE done.organization_id=s.organization_id AND done.session_id=s.id AND done.status='present' AND hub_can_attend_person(p_user,s.organization_id,s.activity_id,s.id,done.person_id)))))));
$$;
