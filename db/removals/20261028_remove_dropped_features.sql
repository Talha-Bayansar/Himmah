-- Owner-authorized removal. Apply only to verified Himmah development/onboarding.
-- All DDL/data changes execute in a single transaction; no CASCADE or provider-schema operations.
DO $guard$ BEGIN
 PERFORM pg_advisory_xact_lock(716442031);
 IF current_database()<>'himmah_futsal' OR current_user<>'himmah_owner' OR to_regnamespace('himmah') IS NULL OR to_regclass('himmah.feature_removal_receipts') IS NOT NULL THEN RAISE EXCEPTION 'Unexpected target or removal already applied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM himmah.installation_receipts WHERE digest='34a238dbb6cf28718c9e6dc5a470ed8020e67de444a6de171b505b91ce581ce7') THEN RAISE EXCEPTION 'Unexpected People baseline'; END IF;
END $guard$;
-- Preserve retained contact/group/attendance identities while removing the duplicate directory.
INSERT INTO himmah.contacts(id,organization_id,display_name,version,created_at,created_by,updated_by,archived_at,archived_by)
 SELECT id,organization_id,name,version,created_at,created_by,created_by,CASE WHEN archived THEN clock_timestamp() END,CASE WHEN archived THEN 'system:legacy-cutover' END FROM public.hub_people ON CONFLICT(id) DO NOTHING;
INSERT INTO himmah.groups(id,organization_id,name,version,created_at,created_by,updated_by,archived_at,archived_by)
 SELECT id,organization_id,name,version,created_at,created_by,created_by,CASE WHEN archived THEN clock_timestamp() END,CASE WHEN archived THEN 'system:legacy-cutover' END FROM public.hub_groups ON CONFLICT(id) DO NOTHING;
INSERT INTO himmah.group_memberships(organization_id,group_id,contact_id,valid_from,valid_to,end_reason,created_at,created_by,updated_by)
 SELECT gp.organization_id,gp.group_id,gp.person_id,gp.created_at,CASE WHEN c.archived_at IS NOT NULL OR g.archived_at IS NOT NULL THEN greatest(clock_timestamp(),gp.created_at+interval '1 microsecond') END,CASE WHEN c.archived_at IS NOT NULL THEN 'contact_archived' WHEN g.archived_at IS NOT NULL THEN 'group_archived' END,gp.created_at,c.created_by,c.created_by FROM public.hub_group_people gp JOIN himmah.contacts c ON c.organization_id=gp.organization_id AND c.id=gp.person_id JOIN himmah.groups g ON g.organization_id=gp.organization_id AND g.id=gp.group_id WHERE NOT EXISTS(SELECT 1 FROM himmah.group_memberships m WHERE m.organization_id=gp.organization_id AND m.group_id=gp.group_id AND m.contact_id=gp.person_id AND m.valid_to IS NULL);
DROP TRIGGER "hub_points_immutable" ON public."hub_points_entries";
DROP TRIGGER "hub_period_members_immutable" ON public."hub_period_members";
DROP TRIGGER "hub_period_groups_immutable" ON public."hub_period_groups";
DROP TRIGGER "hub_closed_period_guard" ON public."hub_engagement_periods";
DROP TRIGGER "hub_session_rule_guard" ON public."hub_activity_sessions";
DROP TRIGGER "hub_revoke_role_access" ON public."hub_memberships";
DROP TRIGGER "hub_access_history_immutable" ON public."hub_volunteer_assignment_changes";
DROP TRIGGER "hub_protect_redemption" ON public."hub_redemptions";
DROP TRIGGER "hub_reward_audit_immutable" ON public."hub_reward_changes";
DROP TRIGGER "hub_participant_staff_guard" ON public."hub_memberships";
DROP TRIGGER "hub_participant_link_guard" ON public."hub_participant_links";
DROP TRIGGER "hub_archive_participant" ON public."hub_people";
DROP TRIGGER "hub_participant_link_immutable" ON public."hub_participant_links";
DROP TRIGGER "hub_participant_event_immutable" ON public."hub_participant_events";
DROP TRIGGER "hub_issue_coupon" ON public."hub_redemptions";
DROP TRIGGER "hub_coupon_immutable" ON public."hub_reward_coupons";
DROP TRIGGER "hub_challenge_submission_guard" ON public."hub_challenge_submissions";
DROP TRIGGER "hub_challenge_events_immutable" ON public."hub_challenge_events";
DROP TRIGGER "hub_challenge_requests_immutable" ON public."hub_challenge_requests";
DROP TRIGGER "hub_challenge_guard" ON public."hub_challenges";
DROP TRIGGER "hub_challenge_group_guard" ON public."hub_challenge_groups";
DROP TRIGGER "hub_points_notify" ON public."hub_points_entries";
DROP TRIGGER "hub_challenge_notify" ON public."hub_challenge_events";
DROP TRIGGER "hub_reward_notify" ON public."hub_reward_changes";
DROP TRIGGER "hub_push_enqueue" ON public."hub_notifications";
DROP TRIGGER "futsal_seasons_guard" ON public."futsal_seasons";
DROP TRIGGER "futsal_entries_guard" ON public."futsal_entries";
DROP TRIGGER "futsal_members_guard" ON public."futsal_entry_members";
DROP TRIGGER "futsal_events_immutable" ON public."futsal_events";
DROP TRIGGER "futsal_requests_immutable" ON public."futsal_requests";
DROP TRIGGER "futsal_game_history_guard" ON public."futsal_game_events";
DROP TRIGGER "futsal_game_state_guard" ON public."futsal_games";
ALTER TABLE public.futsal_seasons DROP CONSTRAINT futsal_rules_check;
DROP FUNCTION public.hub_points_immutable(),
public.hub_period_live_members(uuid,date,date,text),
public.hub_preview_attendance(text,uuid,uuid,uuid,uuid,jsonb),
public.hub_session_rule_guard(),
public.hub_save_points(text,uuid,uuid,jsonb),
public.hub_is_admin(text,uuid),
public.hub_active_access(text,uuid),
public.hub_can_view_session(text,uuid,uuid,uuid),
public.hub_can_view_activity(text,uuid,uuid),
public.hub_participant_person(text,uuid),
public.hub_issue_coupon(),
public.hub_can_attend_session(text,uuid,uuid,uuid),
public.hub_notification_visible(hub_notifications,text),
public.hub_can_view_group(text,uuid,uuid,uuid),
public.hub_notify_person(uuid,uuid,uuid,text,text),
public.hub_save_period(text,uuid,uuid,uuid,jsonb),
public.hub_period_immutable(),
public.hub_closed_period_guard(),
public.hub_can_view_points(text,uuid,uuid),
public.hub_can_view_member(text,uuid,uuid),
public.hub_lock_access(text,uuid),
public.hub_save_access(text,uuid,uuid,uuid,jsonb),
public.hub_revoke_role_access(),
public.hub_attendance_operation(text,uuid,uuid,uuid,uuid,jsonb,boolean),
public.hub_save_attendance(text,uuid,uuid,uuid,uuid,jsonb),
public.hub_reward_wallet(uuid,uuid),
public.hub_save_reward(text,uuid,uuid,uuid,jsonb),
public.hub_save_redemption(text,uuid,uuid,uuid,uuid,jsonb),
public.hub_protect_redemption(),
public.hub_participant_role_guard(),
public.hub_invite_participant(text,uuid,uuid,uuid,text,text,boolean),
public.hub_accept_participant(text,text,text),
public.hub_revoke_participant(text,uuid,uuid,uuid,text,text),
public.hub_archive_participant(),
public.hub_participant_link_immutable(),
public.hub_participant_is_self(text,uuid,uuid),
public.hub_can_award(text,uuid,uuid),
public.hub_notify_admins(uuid,uuid,text,text,text),
public.hub_can_attend_person(text,uuid,uuid,uuid,uuid),
public.hub_claim_reward(text,uuid,uuid,uuid,integer),
public.hub_cancel_my_coupon(text,uuid,uuid,integer),
public.hub_collect_coupon(text,uuid,text,integer),
public.hub_challenge_eligible(uuid,uuid,uuid),
public.hub_challenge_receipt(text,uuid,uuid,jsonb),
public.hub_challenge_finish(text,uuid,uuid,jsonb,uuid),
public.hub_save_challenge(text,uuid,uuid,uuid,jsonb),
public.futsal_game_now(),
public.hub_submit_challenge(text,uuid,uuid,uuid,jsonb),
public.hub_review_challenge(text,uuid,uuid,uuid,uuid,jsonb),
public.hub_challenge_submission_guard(),
public.hub_challenge_guard(),
public.hub_challenge_group_guard(),
public.hub_notification_event(),
public.hub_enqueue_push(),
public.hub_register_push(text,text,text,text,text),
public.futsal_rules_valid(jsonb),
public.futsal_command(text,uuid,uuid,uuid,uuid,jsonb),
public.futsal_frozen_guard(),
public.futsal_audit_immutable(),
public.futsal_game_points(uuid,uuid,integer),
public.futsal_game_commit(text,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb),
public.futsal_game_immutable();
-- Remove dropped fields from surviving receipts/history before deleting columns.
DELETE FROM public.hub_notifications;
UPDATE public.hub_attendance_requests SET payload=payload-'confirmPoints',response=jsonb_set(response,'{items}',coalesce((SELECT jsonb_agg(item-'pointsDelta') FROM jsonb_array_elements(response->'items') item),'[]'::jsonb)) WHERE payload ? 'confirmPoints' OR response::text LIKE '%pointsDelta%';
UPDATE public.hub_volunteer_assignment_changes SET before=before-'can_award',after=after-'can_award';
UPDATE public.hub_volunteer_assignments SET revoked_at=clock_timestamp(),revoke_reason='capability_removed',version=version+1 WHERE NOT can_attend AND revoked_at IS NULL;
DELETE FROM public.hub_directory_audit WHERE action ~ '^(points|reward|redemption|coupon|participant|challenge|period|futsal)[.]';
ALTER TABLE public.hub_notifications DROP CONSTRAINT hub_notification_audience, DROP COLUMN participant_link_id, DROP COLUMN admin_only;
ALTER TABLE public.hub_activities DROP COLUMN attendance_points;
ALTER TABLE public.hub_activity_sessions DROP COLUMN attendance_points, DROP COLUMN earning_rule_version;
ALTER TABLE public.hub_volunteer_assignments DROP CONSTRAINT hub_volunteer_assignment_capabilities, DROP COLUMN can_award;
DO $scope$ DECLARE r record; BEGIN
 FOR r IN SELECT conrelid::regclass::text AS tab,conname FROM pg_constraint WHERE contype='f' AND confrelid='public.hub_people'::regclass AND conrelid='public.hub_attendance'::regclass LOOP EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tab,r.conname); END LOOP;
 FOR r IN SELECT conrelid::regclass::text AS tab,conname FROM pg_constraint WHERE contype='f' AND confrelid='public.hub_groups'::regclass AND conrelid='public.hub_volunteer_assignments'::regclass LOOP EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tab,r.conname); END LOOP;
END $scope$;
ALTER TABLE public.hub_attendance ADD CONSTRAINT hub_attendance_contact_scope FOREIGN KEY(organization_id,person_id) REFERENCES himmah.contacts(organization_id,id);
ALTER TABLE public.hub_volunteer_assignments ADD CONSTRAINT hub_volunteer_group_scope FOREIGN KEY(organization_id,group_id) REFERENCES himmah.groups(organization_id,id);
DROP TABLE public."futsal_entries",
public."futsal_entry_members",
public."futsal_events",
public."futsal_game_events",
public."futsal_games",
public."futsal_requests",
public."futsal_seasons",
public."hub_attendance_awards",
public."hub_challenge_events",
public."hub_challenge_groups",
public."hub_challenge_requests",
public."hub_challenge_submissions",
public."hub_challenges",
public."hub_engagement_periods",
public."hub_group_people",
public."hub_groups",
public."hub_participant_events",
public."hub_participant_invitations",
public."hub_participant_links",
public."hub_people",
public."hub_period_groups",
public."hub_period_members",
public."hub_points_entries",
public."hub_points_requests",
public."hub_redemptions",
public."hub_reward_changes",
public."hub_reward_coupons",
public."hub_rewards";
