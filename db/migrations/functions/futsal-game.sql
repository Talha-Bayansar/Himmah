CREATE FUNCTION futsal_game_now() RETURNS timestamptz LANGUAGE sql VOLATILE AS $$ SELECT clock_timestamp(); $$;
--> statement-breakpoint
-- Internal gameplay commands. HTTP callers never supply state, outcomes, clock or point allocations.
CREATE FUNCTION futsal_game_points(p_org uuid,p_season uuid,p_index integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT coalesce(jsonb_object_agg(m.person_id::text,jsonb_build_object('eligible',not p.archived,'points',greatest(0,coalesce((
  SELECT sum(e.amount) FROM hub_points_entries e LEFT JOIN hub_points_entries original ON original.organization_id=e.organization_id AND original.person_id=e.person_id AND original.id=e.original_id
  WHERE e.organization_id=p_org AND e.person_id=m.person_id
   AND greatest(coalesce(original.occurred_at,e.occurred_at),e.created_at)>=CASE WHEN p_index=0 THEN (s.snapshot->'settings'->>'preparationStartsAt')::timestamptz ELSE (s.snapshot->'plan'->'trainingAt'->>(p_index-1))::timestamptz END
   AND greatest(coalesce(original.occurred_at,e.occurred_at),e.created_at)<(s.snapshot->'plan'->'trainingAt'->>p_index)::timestamptz
 ),0)))), '{}'::jsonb)
 FROM futsal_entry_members m JOIN hub_people p ON p.organization_id=m.organization_id AND p.id=m.person_id JOIN futsal_seasons s ON s.organization_id=m.organization_id AND s.id=m.season_id
 WHERE m.organization_id=p_org AND m.season_id=p_season;
$$;
--> statement-breakpoint
CREATE FUNCTION futsal_game_commit(p_actor text,p_org uuid,p_season uuid,p_key uuid,p_request jsonb,p_prior jsonb,p_points jsonb,p_state jsonb,p_event jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE season futsal_seasons%ROWTYPE;game futsal_games%ROWTYPE;receipt futsal_game_events%ROWTYPE;v integer;slot_at timestamptz;
BEGIN
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 SELECT * INTO season FROM futsal_seasons WHERE organization_id=p_org AND id=p_season FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 SELECT * INTO receipt FROM futsal_game_events WHERE organization_id=p_org AND request_key=p_key;
 IF FOUND THEN
  IF receipt.actor_id<>p_actor OR receipt.season_id<>p_season OR receipt.request<>p_request THEN RETURN jsonb_build_object('code','conflict'); END IF;
  RETURN jsonb_build_object('id',p_season,'version',receipt.version);
 END IF;
 IF season.status<>'prepared' THEN RETURN jsonb_build_object('code','futsal_locked'); END IF;
 SELECT * INTO game FROM futsal_games WHERE organization_id=p_org AND season_id=p_season FOR UPDATE;
 IF coalesce(game.version,0)<>(p_request->>'version')::integer OR coalesce(game.state,'null'::jsonb) IS DISTINCT FROM p_prior THEN RETURN jsonb_build_object('code','conflict'); END IF;
 IF p_state->>'engineVersion' IS DISTINCT FROM 'futsal-game-v1' OR NOT coalesce(p_state->>'status' IN ('active','completed'),false) OR jsonb_typeof(p_state->'entries') IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 IF game.version IS NULL THEN
  IF p_request->>'operation'<>'activate' OR p_event->>'kind'<>'activation' OR (p_state->>'step')::int<>0 OR p_state->>'status'<>'active' THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  IF EXISTS(SELECT 1 FROM futsal_entry_members m JOIN hub_people p ON p.organization_id=m.organization_id AND p.id=m.person_id WHERE m.organization_id=p_org AND m.season_id=p_season AND p.archived) THEN RETURN jsonb_build_object('code','futsal_member'); END IF;
  INSERT INTO futsal_games(organization_id,season_id,state) VALUES(p_org,p_season,p_state);v:=1;
 ELSE
  IF p_request->>'operation'<>'advance' OR game.state->>'status'<>'active' OR (p_state->>'step')::int<>(game.state->>'step')::int+1 THEN RETURN jsonb_build_object('code','conflict'); END IF;
  IF p_event->>'kind'='training' THEN
   slot_at:=(season.snapshot->'plan'->'trainingAt'->>(p_event->>'index')::int)::timestamptz;
   IF p_points IS DISTINCT FROM futsal_game_points(p_org,p_season,(p_event->>'index')::int) THEN RETURN jsonb_build_object('code','conflict'); END IF;
  ELSIF p_event->>'kind'='round' THEN
   slot_at:=(season.snapshot->'plan'->'rounds'->(p_event->>'index')::int->>'at')::timestamptz;
  ELSE RETURN jsonb_build_object('code','invalid_input'); END IF;
  IF slot_at IS NULL OR slot_at>futsal_game_now() OR slot_at<>(p_event->>'at')::timestamptz THEN RETURN jsonb_build_object('code','game_not_due'); END IF;
  v:=game.version+1;
  UPDATE futsal_games SET state=p_state,version=v WHERE organization_id=p_org AND season_id=p_season;
 END IF;
 INSERT INTO futsal_game_events(organization_id,season_id,actor_id,request_key,request,version,event) VALUES(p_org,p_season,p_actor,p_key,p_request,v,p_event);
 RETURN jsonb_build_object('id',p_season,'version',v);
END;$$;
--> statement-breakpoint
CREATE FUNCTION futsal_game_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='futsal_game_events' OR TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable game history'; END IF;
 IF OLD.state->>'status'='completed' OR NEW.organization_id<>OLD.organization_id OR NEW.season_id<>OLD.season_id OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'immutable game identity or completed state'; END IF;
 RETURN NEW;
END;$$;
--> statement-breakpoint
CREATE TRIGGER futsal_game_history_guard BEFORE UPDATE OR DELETE ON futsal_game_events FOR EACH ROW EXECUTE FUNCTION futsal_game_immutable();
--> statement-breakpoint
CREATE TRIGGER futsal_game_state_guard BEFORE UPDATE OR DELETE ON futsal_games FOR EACH ROW EXECUTE FUNCTION futsal_game_immutable();
