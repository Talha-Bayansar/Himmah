-- Live rooms are independent of self-paced attempts, attendance and money.
CREATE OR REPLACE FUNCTION hub_live_packet(rid uuid, credential text, staff boolean) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE r hub_live_rooms%ROWTYPE; v hub_learning_versions%ROWTYPE; g hub_live_players%ROWTYPE; q jsonb; packet jsonb; summary jsonb; distribution jsonb; n int; answered int; own_choice int; own_score int;
BEGIN
 SELECT * INTO r FROM hub_live_rooms WHERE id=rid;
 SELECT * INTO v FROM hub_learning_versions WHERE organization_id=r.organization_id AND item_id=r.item_id AND id=r.publication_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
 IF NOT staff AND credential<>'' THEN
  SELECT * INTO g FROM hub_live_players WHERE organization_id=r.organization_id AND room_id=r.id AND credential_hash=credential AND NOT revoked;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','live_revoked'); END IF;
 END IF;
 SELECT count(*) INTO n FROM hub_live_players WHERE organization_id=r.organization_id AND room_id=r.id AND NOT revoked;
 packet:=jsonb_build_object('id',r.id,'code',r.code,'title',v.content->>'title','state',r.state,'questionIndex',r.question_index,'questionCount',jsonb_array_length(v.content->'questions'),'version',r.version,'expiresAt',r.expires_at,'expired',r.expires_at<=statement_timestamp(),'joined',g.id IS NOT NULL,'participants',n);
 IF NOT staff AND g.id IS NULL THEN RETURN packet; END IF;
 SELECT count(*) INTO answered FROM hub_live_answers a JOIN hub_live_players p ON p.organization_id=a.organization_id AND p.room_id=a.room_id AND p.id=a.player_id AND NOT p.revoked WHERE a.organization_id=r.organization_id AND a.room_id=r.id AND a.question_index=r.question_index;
 IF r.question_index>=0 THEN q:=v.content->'questions'->r.question_index; END IF;
 IF r.question_index>=0 THEN
  packet:=packet||jsonb_build_object('question',jsonb_build_object('text',q->>'text','choices',q->'choices'));
  IF r.state IN ('revealed','finished') OR (staff AND r.expires_at<=statement_timestamp()) THEN
   packet:=packet||jsonb_build_object('question',q);
  END IF;
 END IF;
 IF staff AND (r.state IN ('revealed','finished') OR r.expires_at<=statement_timestamp()) THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('index',x.idx,'text',x.question->>'text','answered',(select count(*) from hub_live_answers a join hub_live_players p on p.organization_id=a.organization_id and p.room_id=a.room_id and p.id=a.player_id and not p.revoked where a.organization_id=r.organization_id and a.room_id=r.id and a.question_index=x.idx),'correct',(select count(*) from hub_live_answers a join hub_live_players p on p.organization_id=a.organization_id and p.room_id=a.room_id and p.id=a.player_id and not p.revoked where a.organization_id=r.organization_id and a.room_id=r.id and a.question_index=x.idx and a.choice=(x.question->>'correct')::int)) order by x.idx),'[]') INTO summary FROM (select value as question,ordinality::int-1 as idx from jsonb_array_elements(v.content->'questions') with ordinality where ordinality<=r.question_index+1)x;
  SELECT coalesce(jsonb_agg(jsonb_build_object('choice',x.i,'count',(select count(*) from hub_live_answers a join hub_live_players p on p.organization_id=a.organization_id and p.room_id=a.room_id and p.id=a.player_id and not p.revoked where a.organization_id=r.organization_id and a.room_id=r.id and a.question_index=r.question_index and a.choice=x.i)) order by x.i),'[]') INTO distribution FROM generate_series(0,jsonb_array_length(coalesce(q->'choices','[]'))-1)x(i);
 END IF;
 IF g.id IS NOT NULL THEN
  SELECT choice INTO own_choice FROM hub_live_answers WHERE organization_id=r.organization_id AND room_id=r.id AND player_id=g.id AND question_index=r.question_index;
  IF r.state='finished' THEN SELECT count(*) INTO own_score FROM hub_live_answers a WHERE a.organization_id=r.organization_id AND a.room_id=r.id AND a.player_id=g.id AND a.question_index<=r.question_index AND a.choice=(v.content->'questions'->a.question_index->>'correct')::int; END IF;
  packet:=packet||jsonb_build_object('player',jsonb_build_object('number',g.number,'nickname',g.nickname,'revision',g.revision,'choice',own_choice,'score',own_score));
 END IF;
 RETURN packet||jsonb_build_object('answered',answered,'summary',coalesce(summary,'[]'),'distribution',coalesce(distribution,'[]'),'played',r.question_index+1);
END $$;
CREATE OR REPLACE FUNCTION hub_live_public(code_input text,credential text) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE r hub_live_rooms%ROWTYPE;
BEGIN
 SELECT * INTO r FROM hub_live_rooms WHERE code=code_input;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
 IF r.expires_at<=statement_timestamp() THEN RETURN jsonb_build_object('error','live_expired'); END IF;
 RETURN hub_live_packet(r.id,credential,false);
END $$;
CREATE OR REPLACE FUNCTION hub_live_read(actor text,org uuid,item uuid,rid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
BEGIN
 IF NOT hub_learning_admin(actor,org) THEN RETURN jsonb_build_object('error','forbidden'); END IF;
 IF NOT EXISTS(select 1 from hub_live_rooms where organization_id=org and item_id=item and id=rid) THEN RETURN jsonb_build_object('error','not_found'); END IF;
 RETURN hub_live_packet(rid,'',true);
END $$;
CREATE OR REPLACE FUNCTION hub_live_host(actor_input text,org uuid,item uuid,rid uuid,k uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r hub_live_rooms%ROWTYPE; v hub_learning_versions%ROWTYPE; prior hub_live_operations%ROWTYPE; cmd text:=p->>'action'; result jsonb; n int;
BEGIN
 IF NOT hub_learning_admin(actor_input,org) THEN RETURN jsonb_build_object('error','forbidden'); END IF;
 PERFORM pg_advisory_xact_lock(hashtext(org::text),hashtext('live-host:'||actor_input||k::text));
 SELECT * INTO prior FROM hub_live_operations WHERE organization_id=org AND actor='host:'||actor_input AND request_key=k;
 IF FOUND THEN
  IF prior.payload<>p||jsonb_build_object('item',item,'room',rid) THEN RETURN jsonb_build_object('error','conflict'); END IF;
  RETURN prior.response;
 END IF;
 IF cmd='create' THEN
  SELECT lv.* INTO v FROM hub_learning_versions lv JOIN hub_learning_items li ON li.organization_id=lv.organization_id AND li.id=lv.item_id AND li.current_publication=lv.id AND li.state='published' WHERE lv.organization_id=org AND lv.item_id=item AND lv.id=(p->>'publication')::uuid FOR SHARE OF li;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','live_unavailable'); END IF;
  IF EXISTS(select 1 from hub_live_rooms where id=rid) THEN RETURN jsonb_build_object('error','conflict'); END IF;
  FOR n IN 1..5 LOOP
   INSERT INTO hub_live_rooms(id,organization_id,item_id,publication_id,code,created_by,expires_at) VALUES(rid,org,item,v.id,upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),actor_input,statement_timestamp()+interval '12 hours') ON CONFLICT(code) DO NOTHING RETURNING * INTO r;
   EXIT WHEN FOUND;
  END LOOP;
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','service'); END IF;
 ELSE
  SELECT * INTO r FROM hub_live_rooms WHERE organization_id=org AND item_id=item AND id=rid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  IF r.expires_at<=statement_timestamp() OR r.state='finished' THEN RETURN jsonb_build_object('error','live_closed'); END IF;
  IF r.version<>coalesce((p->>'version')::int,0) THEN RETURN jsonb_build_object('error','conflict'); END IF;
  SELECT * INTO v FROM hub_learning_versions WHERE organization_id=org AND item_id=item AND id=r.publication_id;
  IF cmd='start' AND r.state='lobby' THEN
   IF NOT EXISTS(select 1 from hub_live_players where organization_id=org and room_id=rid and not revoked) THEN RETURN jsonb_build_object('error','live_empty'); END IF;
   UPDATE hub_live_rooms SET state='question',question_index=0,version=version+1 WHERE id=rid RETURNING * INTO r;
  ELSIF cmd='lock' AND r.state='question' THEN UPDATE hub_live_rooms SET state='locked',version=version+1 WHERE id=rid RETURNING * INTO r;
  ELSIF cmd='reveal' AND r.state='locked' THEN UPDATE hub_live_rooms SET state='revealed',version=version+1 WHERE id=rid RETURNING * INTO r;
  ELSIF cmd='next' AND r.state='revealed' AND r.question_index+1<jsonb_array_length(v.content->'questions') THEN UPDATE hub_live_rooms SET state='question',question_index=question_index+1,version=version+1 WHERE id=rid RETURNING * INTO r;
  ELSIF cmd='finish' THEN UPDATE hub_live_rooms SET state='finished',version=version+1 WHERE id=rid RETURNING * INTO r;
  ELSIF cmd='remove' THEN
   UPDATE hub_live_players SET revoked=true WHERE organization_id=org AND room_id=rid AND id=(p->>'player')::uuid AND NOT revoked;
   IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  ELSE RETURN jsonb_build_object('error','live_transition'); END IF;
 END IF;
 result:=jsonb_build_object('id',r.id,'version',r.version,'code',r.code);
 INSERT INTO hub_live_operations(organization_id,room_id,actor,request_key,payload,response) VALUES(org,rid,'host:'||actor_input,k,p||jsonb_build_object('item',item,'room',rid),result);
 INSERT INTO hub_directory_audit(organization_id,actor_id,action,entity_id) VALUES(org,actor_input,'live.'||cmd,rid::text);
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION hub_live_guest(code_input text,credential text,k uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r hub_live_rooms%ROWTYPE; g hub_live_players%ROWTYPE; prior hub_live_operations%ROWTYPE; v hub_learning_versions%ROWTYPE; cmd text:=p->>'action'; idx int; picked int; result jsonb;
BEGIN
 IF credential!~'^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('error','not_found'); END IF;
 SELECT * INTO r FROM hub_live_rooms WHERE code=code_input;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
 PERFORM pg_advisory_xact_lock(hashtext(r.organization_id::text),hashtext('live-guest:'||credential||k::text));
 SELECT * INTO r FROM hub_live_rooms WHERE id=r.id FOR UPDATE;
 IF r.expires_at<=statement_timestamp() THEN RETURN jsonb_build_object('error','live_expired'); END IF;
 SELECT * INTO g FROM hub_live_players WHERE organization_id=r.organization_id AND room_id=r.id AND credential_hash=credential;
 IF FOUND AND g.revoked THEN RETURN jsonb_build_object('error','live_revoked'); END IF;
 IF cmd<>'join' AND g.id IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;
 SELECT * INTO prior FROM hub_live_operations WHERE organization_id=r.organization_id AND actor='guest:'||credential AND request_key=k;
 IF FOUND THEN IF prior.payload<>p||jsonb_build_object('room',r.id) THEN RETURN jsonb_build_object('error','conflict'); END IF; RETURN prior.response; END IF;
 IF cmd='join' THEN
  IF g.id IS NULL THEN
   IF r.state<>'lobby' THEN RETURN jsonb_build_object('error','live_started'); END IF;
   IF r.next_number>=200 THEN RETURN jsonb_build_object('error','live_full'); END IF;
   IF length(coalesce(p->>'nickname',''))>40 OR coalesce(p->>'nickname','')~'[[:cntrl:]]' THEN RETURN jsonb_build_object('error','invalid_input'); END IF;
   UPDATE hub_live_rooms SET next_number=next_number+1 WHERE id=r.id RETURNING * INTO r;
   INSERT INTO hub_live_players(organization_id,room_id,credential_hash,nickname,number) VALUES(r.organization_id,r.id,credential,nullif(trim(p->>'nickname'),''),r.next_number) RETURNING * INTO g;
  END IF;
 ELSIF cmd='answer' THEN
  IF r.state<>'question' THEN RETURN jsonb_build_object('error','live_locked'); END IF;
  idx:=(p->>'question')::int; picked:=(p->>'choice')::int;
  IF r.version<>coalesce((p->>'version')::int,0) OR idx IS DISTINCT FROM r.question_index OR g.revision<>coalesce((p->>'revision')::int,0) THEN RETURN jsonb_build_object('error','conflict'); END IF;
  SELECT * INTO v FROM hub_learning_versions WHERE organization_id=r.organization_id AND id=r.publication_id;
  IF picked IS NULL OR picked<0 OR picked>=jsonb_array_length(v.content->'questions'->idx->'choices') THEN RETURN jsonb_build_object('error','invalid_input'); END IF;
  INSERT INTO hub_live_answers(organization_id,room_id,player_id,question_index,choice) VALUES(r.organization_id,r.id,g.id,idx,picked) ON CONFLICT(room_id,player_id,question_index) DO UPDATE SET choice=excluded.choice,updated_at=statement_timestamp();
  UPDATE hub_live_players SET revision=revision+1 WHERE id=g.id RETURNING * INTO g;
 ELSE RETURN jsonb_build_object('error','invalid_input'); END IF;
 result:=jsonb_build_object('id',r.id,'revision',g.revision);
 INSERT INTO hub_live_operations(organization_id,room_id,actor,request_key,payload,response) VALUES(r.organization_id,r.id,'guest:'||credential,k,p||jsonb_build_object('room',r.id),result);
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION hub_live_answer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Live answers are preserved'; END IF;
 PERFORM 1 FROM hub_live_rooms where organization_id=NEW.organization_id and id=NEW.room_id and state='question' and question_index=NEW.question_index and expires_at>statement_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Live answers are locked'; END IF;
 IF TG_OP='UPDATE' AND (NEW.organization_id,NEW.room_id,NEW.player_id,NEW.question_index) IS DISTINCT FROM (OLD.organization_id,OLD.room_id,OLD.player_id,OLD.question_index) THEN RAISE EXCEPTION 'Live answer identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hub_live_answer_immutable BEFORE INSERT OR UPDATE OR DELETE ON hub_live_answers FOR EACH ROW EXECUTE FUNCTION hub_live_answer_guard();
CREATE TRIGGER hub_live_operation_immutable BEFORE UPDATE OR DELETE ON hub_live_operations FOR EACH ROW EXECUTE FUNCTION hub_learning_immutable();
CREATE OR REPLACE FUNCTION hub_live_room_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total int;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Live rooms are preserved'; END IF;
 SELECT jsonb_array_length(content->'questions') INTO total FROM hub_learning_versions WHERE organization_id=NEW.organization_id AND item_id=NEW.item_id AND id=NEW.publication_id;
 IF NOT FOUND OR NEW.question_index>=total THEN RAISE EXCEPTION 'Live publication mismatch'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'lobby' OR NEW.question_index<>-1 OR NEW.version<>1 OR NEW.next_number<>0 THEN RAISE EXCEPTION 'Invalid initial live state'; END IF;
 ELSE
  IF (NEW.id,NEW.organization_id,NEW.item_id,NEW.publication_id,NEW.code,NEW.created_by,NEW.created_at,NEW.expires_at) IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.item_id,OLD.publication_id,OLD.code,OLD.created_by,OLD.created_at,OLD.expires_at) THEN RAISE EXCEPTION 'Live identity is immutable'; END IF;
  IF (NEW.state,NEW.question_index) IS NOT DISTINCT FROM (OLD.state,OLD.question_index) THEN
   IF NEW.version<>OLD.version OR NOT (NEW.next_number=OLD.next_number OR (OLD.state='lobby' AND NEW.next_number=OLD.next_number+1)) THEN RAISE EXCEPTION 'Invalid live revision'; END IF;
  ELSE
   IF NEW.version<>OLD.version+1 OR NEW.next_number<>OLD.next_number OR NOT (
     (OLD.state='lobby' AND NEW.state='question' AND NEW.question_index=0) OR
     (OLD.state='question' AND NEW.state='locked' AND NEW.question_index=OLD.question_index) OR
     (OLD.state='locked' AND NEW.state='revealed' AND NEW.question_index=OLD.question_index) OR
     (OLD.state='revealed' AND NEW.state='question' AND NEW.question_index=OLD.question_index+1) OR
     (OLD.state<>'finished' AND NEW.state='finished' AND NEW.question_index=OLD.question_index)
   ) THEN RAISE EXCEPTION 'Invalid live transition'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hub_live_room_immutable BEFORE INSERT OR UPDATE OR DELETE ON hub_live_rooms FOR EACH ROW EXECUTE FUNCTION hub_live_room_guard();
CREATE OR REPLACE FUNCTION hub_live_player_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Live participants are preserved'; END IF;
 IF (NEW.id,NEW.organization_id,NEW.room_id,NEW.credential_hash,NEW.nickname,NEW.number,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.room_id,OLD.credential_hash,OLD.nickname,OLD.number,OLD.created_at) OR (OLD.revoked AND NOT NEW.revoked) OR NEW.revision NOT BETWEEN OLD.revision AND OLD.revision+1 THEN RAISE EXCEPTION 'Live participant identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hub_live_player_immutable BEFORE UPDATE OR DELETE ON hub_live_players FOR EACH ROW EXECUTE FUNCTION hub_live_player_guard();
