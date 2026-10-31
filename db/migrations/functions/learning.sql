-- Learning commands run as the app's verified owner role; authorization is repeated in SQL.
CREATE OR REPLACE FUNCTION hub_learning_admin(actor text, org uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(select 1 from hub_memberships where organization_id=org and user_id=actor and role in ('owner','admin')) $$;
CREATE OR REPLACE FUNCTION hub_learning_content_valid(p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE q jsonb; c jsonb;
BEGIN
 IF NOT (p ?& ARRAY['title','description','mode','release','opensAt','closesAt','questions']) OR jsonb_typeof(p)<>'object' OR length(trim(coalesce(p->>'title',''))) NOT BETWEEN 2 AND 160 OR length(coalesce(p->>'description',''))>1000 OR coalesce(p->>'mode','') NOT IN ('assigned','open') OR coalesce(p->>'release','') NOT IN ('immediate','manual') OR jsonb_typeof(p->'questions')<>'array' OR jsonb_array_length(p->'questions') NOT BETWEEN 1 AND 50 THEN RETURN false; END IF;
 IF nullif(p->>'opensAt','') IS NOT NULL THEN PERFORM (p->>'opensAt')::timestamptz; END IF;
 IF nullif(p->>'closesAt','') IS NOT NULL THEN PERFORM (p->>'closesAt')::timestamptz; END IF;
 IF nullif(p->>'opensAt','') IS NOT NULL AND nullif(p->>'closesAt','') IS NOT NULL AND (p->>'closesAt')::timestamptz<=(p->>'opensAt')::timestamptz THEN RETURN false; END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(p->'questions') LOOP
  IF NOT (q ?& ARRAY['text','choices','correct','explanation']) OR length(trim(coalesce(q->>'text',''))) NOT BETWEEN 1 AND 500 OR length(coalesce(q->>'explanation',''))>1000 OR jsonb_typeof(q->'choices')<>'array' OR jsonb_array_length(q->'choices') NOT BETWEEN 2 AND 6 OR jsonb_typeof(q->'correct')<>'number' OR (q->>'correct')!~'^[0-5]$' OR (q->>'correct')::int>=jsonb_array_length(q->'choices') THEN RETURN false; END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(q->'choices') LOOP IF jsonb_typeof(c)<>'string' OR length(trim(c#>>'{}')) NOT BETWEEN 1 AND 300 THEN RETURN false; END IF; END LOOP;
 END LOOP; RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE OR REPLACE FUNCTION hub_learning_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='hub_learning_versions' AND TG_OP='UPDATE' THEN
 IF (NEW.id,NEW.organization_id,NEW.item_id,NEW.number,NEW.content,NEW.created_at) IS NOT DISTINCT FROM (OLD.id,OLD.organization_id,OLD.item_id,OLD.number,OLD.content,OLD.created_at) AND (NOT OLD.released OR NEW.released) THEN RETURN NEW; END IF; END IF;
 IF TG_TABLE_NAME='hub_learning_attempts' AND TG_OP='UPDATE' THEN
 IF OLD.submitted_at IS NULL AND (NEW.id,NEW.organization_id,NEW.recipient_id,NEW.sequence,NEW.created_at) IS NOT DISTINCT FROM (OLD.id,OLD.organization_id,OLD.recipient_id,OLD.sequence,OLD.created_at) THEN RETURN NEW; END IF; END IF;
 RAISE EXCEPTION 'Learning history is immutable';
END $$;
DROP TRIGGER IF EXISTS hub_learning_version_immutable ON hub_learning_versions;
CREATE TRIGGER hub_learning_version_immutable BEFORE UPDATE OR DELETE ON hub_learning_versions FOR EACH ROW EXECUTE FUNCTION hub_learning_immutable();
DROP TRIGGER IF EXISTS hub_learning_attempt_immutable ON hub_learning_attempts;
CREATE TRIGGER hub_learning_attempt_immutable BEFORE UPDATE OR DELETE ON hub_learning_attempts FOR EACH ROW EXECUTE FUNCTION hub_learning_immutable();
DROP TRIGGER IF EXISTS hub_learning_operation_immutable ON hub_learning_operations;
CREATE TRIGGER hub_learning_operation_immutable BEFORE UPDATE OR DELETE ON hub_learning_operations FOR EACH ROW EXECUTE FUNCTION hub_learning_immutable();

CREATE OR REPLACE FUNCTION hub_learning_staff(actor text,org uuid,item uuid,k uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE i hub_learning_items%ROWTYPE; v hub_learning_versions%ROWTYPE; r hub_learning_recipients%ROWTYPE; prior hub_learning_operations%ROWTYPE; result jsonb; entry jsonb; content jsonb; pub uuid; aid uuid; sid uuid; n int; cmd text:=p->>'action';
BEGIN
 IF NOT hub_learning_admin(actor,org) THEN RETURN jsonb_build_object('error','forbidden'); END IF;
 PERFORM pg_advisory_xact_lock(hashtext(org::text),hashtext(actor||k::text));
 SELECT * INTO prior FROM hub_learning_operations WHERE organization_id=org AND actor_id='staff:'||actor AND request_key=k;
 IF FOUND THEN IF prior.payload<>p||jsonb_build_object('item',item) THEN RETURN jsonb_build_object('error','conflict'); END IF; RETURN prior.response; END IF;
 IF cmd='create' THEN
  content:=p->'content'; IF NOT hub_learning_content_valid(content) THEN RETURN jsonb_build_object('error','invalid_input'); END IF;
 ELSE
  SELECT * INTO i FROM hub_learning_items WHERE organization_id=org AND id=item FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  IF coalesce((p->>'version')::int,0)<>i.version THEN RETURN jsonb_build_object('error','conflict'); END IF;
 END IF;
 IF cmd IN ('create','save') THEN
  content:=p->'content'; IF NOT hub_learning_content_valid(content) THEN RETURN jsonb_build_object('error','invalid_input'); END IF;
  aid:=nullif(p->>'activity','')::uuid; sid:=nullif(p->>'session','')::uuid;
  IF sid IS NOT NULL THEN
   SELECT activity_id INTO pub FROM hub_activity_sessions WHERE organization_id=org AND id=sid;
   IF NOT FOUND OR (aid IS NOT NULL AND aid<>pub) THEN RETURN jsonb_build_object('error','invalid_input'); END IF; aid:=pub;
  END IF;
  IF aid IS NOT NULL AND NOT EXISTS(select 1 from hub_activities where organization_id=org and id=aid) THEN RETURN jsonb_build_object('error','invalid_input'); END IF;
  IF cmd='create' THEN
   INSERT INTO hub_learning_items(id,organization_id,title,description,activity_id,session_id,draft,created_by) VALUES(item,org,trim(content->>'title'),content->>'description',aid,sid,content,actor) RETURNING * INTO i;
  ELSE
   UPDATE hub_learning_items SET title=trim(content->>'title'),description=content->>'description',activity_id=aid,session_id=sid,draft=content,version=version+1 WHERE organization_id=org AND id=item RETURNING * INTO i;
  END IF;
 ELSIF cmd='publish' THEN
  IF NOT hub_learning_content_valid(i.draft) THEN RETURN jsonb_build_object('error','invalid_input'); END IF;
  IF nullif(i.draft->>'closesAt','') IS NOT NULL AND (i.draft->>'closesAt')::timestamptz<=statement_timestamp() THEN RETURN jsonb_build_object('error','invalid_input'); END IF;
  IF (SELECT count(*) FROM hub_learning_versions WHERE organization_id=org AND item_id=item)>=50 THEN RETURN jsonb_build_object('error','invalid_input'); END IF;
  SELECT coalesce(max(number),0)+1 INTO n FROM hub_learning_versions WHERE organization_id=org AND item_id=item;
  INSERT INTO hub_learning_versions(organization_id,item_id,number,content,released) VALUES(org,item,n,i.draft,i.draft->>'release'='immediate') RETURNING id INTO pub;
  UPDATE hub_learning_items SET current_publication=pub,state='published',version=version+1 WHERE organization_id=org AND id=item RETURNING * INTO i;
 ELSIF cmd IN ('close','reopen') THEN
  IF i.current_publication IS NULL THEN RETURN jsonb_build_object('error','invalid_input'); END IF;
  UPDATE hub_learning_items SET state=case when cmd='close' then 'closed' else 'published' end,version=version+1 WHERE organization_id=org AND id=item RETURNING * INTO i;
 ELSIF cmd IN ('release','open-link','assign','revoke','allow') THEN
  SELECT * INTO v FROM hub_learning_versions WHERE organization_id=org AND item_id=item AND id=(p->>'publication')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  IF cmd='release' THEN UPDATE hub_learning_versions SET released=true WHERE id=v.id;
  ELSIF cmd='open-link' THEN
   IF v.content->>'mode'<>'open' OR i.current_publication<>v.id THEN RETURN jsonb_build_object('error','invalid_input'); END IF;
   IF coalesce(p->>'hash','')!~'^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('error','invalid_input'); END IF;
   UPDATE hub_learning_versions SET open_hash=p->>'hash' WHERE id=v.id;
  ELSIF cmd='assign' THEN
   IF v.content->>'mode'<>'assigned' OR i.current_publication<>v.id OR jsonb_typeof(p->'recipients')<>'array' OR jsonb_array_length(p->'recipients') NOT BETWEEN 1 AND 50 THEN RETURN jsonb_build_object('error','invalid_input'); END IF;
   -- Validate the entire reviewed batch before touching any assignment.
   FOR entry IN SELECT value FROM jsonb_array_elements(p->'recipients') LOOP
    IF coalesce(entry->>'hash','')!~'^[a-f0-9]{64}$' OR NOT EXISTS(select 1 from himmah.contacts where organization_id=org and id=(entry->>'contact')::uuid and archived_at IS NULL) THEN RETURN jsonb_build_object('error','invalid_input'); END IF;
   END LOOP;
   IF (SELECT count(distinct x->>'contact') FROM jsonb_array_elements(p->'recipients') x)<>jsonb_array_length(p->'recipients') THEN RETURN jsonb_build_object('error','invalid_input'); END IF;
   FOR entry IN SELECT value FROM jsonb_array_elements(p->'recipients') LOOP
    INSERT INTO hub_learning_recipients(organization_id,publication_id,contact_id,name,link_hash)
    SELECT org,v.id,c.id,c.display_name,entry->>'hash' FROM himmah.contacts c WHERE c.organization_id=org AND c.id=(entry->>'contact')::uuid
    ON CONFLICT(organization_id,publication_id,contact_id) DO UPDATE SET link_hash=excluded.link_hash,revoked=false,revision=hub_learning_recipients.revision+1;
   END LOOP;
  ELSE
   SELECT * INTO r FROM hub_learning_recipients WHERE organization_id=org AND publication_id=v.id AND id=(p->>'recipient')::uuid FOR UPDATE;
   IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
   IF r.revision<>coalesce((p->>'recipientRevision')::int,0) THEN RETURN jsonb_build_object('error','conflict'); END IF;
   IF cmd='allow' THEN
    IF r.allowance>=5 OR r.revoked OR EXISTS(select 1 from hub_learning_attempts where organization_id=org and recipient_id=r.id and submitted_at IS NULL) THEN RETURN jsonb_build_object('error','invalid_input'); END IF;
    UPDATE hub_learning_recipients SET allowance=allowance+1,revision=revision+1 WHERE id=r.id;
   ELSE UPDATE hub_learning_recipients SET revoked=true,revision=revision+1 WHERE id=r.id; END IF;
  END IF;
  UPDATE hub_learning_items SET version=version+1 WHERE organization_id=org AND id=item RETURNING * INTO i;
 ELSE RETURN jsonb_build_object('error','invalid_input'); END IF;
 result:=jsonb_build_object('id',i.id,'version',i.version,'publication',i.current_publication);
 INSERT INTO hub_directory_audit(organization_id,actor_id,action,entity_id) VALUES(org,actor,'learning.'||cmd,item::text);
 INSERT INTO hub_learning_operations(organization_id,actor_id,request_key,payload,response) VALUES(org,'staff:'||actor,k,p||jsonb_build_object('item',item),result);
 RETURN result;
END $$;

-- Resolve an access credential without trusting supplied org/recipient identifiers.
CREATE OR REPLACE FUNCTION hub_learning_access(item uuid,credential text,resume text) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE v hub_learning_versions%ROWTYPE; r hub_learning_recipients%ROWTYPE;
BEGIN
 SELECT lv.* INTO v FROM hub_learning_versions lv JOIN hub_learning_recipients lr ON lr.organization_id=lv.organization_id AND lr.publication_id=lv.id WHERE lv.item_id=item AND lr.link_hash=credential AND NOT lr.revoked;
 IF FOUND THEN SELECT * INTO r FROM hub_learning_recipients WHERE organization_id=v.organization_id AND publication_id=v.id AND link_hash=credential AND NOT revoked;
 ELSE
  SELECT * INTO v FROM hub_learning_versions WHERE item_id=item AND open_hash=credential AND content->>'mode'='open';
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  SELECT * INTO r FROM hub_learning_recipients WHERE organization_id=v.organization_id AND publication_id=v.id AND guest_hash=resume AND NOT revoked;
  IF NOT FOUND AND EXISTS(select 1 from hub_learning_recipients where organization_id=v.organization_id and publication_id=v.id and guest_hash=resume and revoked) THEN RETURN jsonb_build_object('error','not_found'); END IF;
 END IF;
 RETURN jsonb_build_object('org',v.organization_id,'publication',v.id,'recipient',r.id);
END $$;
CREATE OR REPLACE FUNCTION hub_learning_public(item uuid,credential text,resume text) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE access jsonb; v hub_learning_versions%ROWTYPE; r hub_learning_recipients%ROWTYPE; a hub_learning_attempts%ROWTYPE; i hub_learning_items%ROWTYPE; questions jsonb; visible boolean; available boolean;
BEGIN
 access:=hub_learning_access(item,credential,resume); IF access?'error' THEN RETURN access; END IF;
 SELECT * INTO v FROM hub_learning_versions WHERE id=(access->>'publication')::uuid;
 SELECT * INTO i FROM hub_learning_items WHERE organization_id=v.organization_id AND id=item;
 SELECT * INTO r FROM hub_learning_recipients WHERE id=(access->>'recipient')::uuid;
 SELECT * INTO a FROM hub_learning_attempts WHERE organization_id=v.organization_id AND recipient_id=r.id ORDER BY sequence DESC LIMIT 1;
 visible:=a.submitted_at IS NOT NULL AND v.released;
 available:=i.state='published' AND i.current_publication=v.id AND (nullif(v.content->>'opensAt','') IS NULL OR (v.content->>'opensAt')::timestamptz<=statement_timestamp()) AND (nullif(v.content->>'closesAt','') IS NULL OR (v.content->>'closesAt')::timestamptz>statement_timestamp());
 IF available OR a.id IS NOT NULL THEN
 SELECT coalesce(jsonb_agg(case when visible then q else q-'correct'-'explanation' end ORDER BY ord),'[]') INTO questions FROM jsonb_array_elements(v.content->'questions') WITH ORDINALITY x(q,ord);
 ELSE questions:='[]'; END IF;
 RETURN jsonb_build_object('title',v.content->>'title','description',v.content->>'description','mode',v.content->>'mode','opensAt',v.content->>'opensAt','closesAt',v.content->>'closesAt','release',v.content->>'release','number',v.number,
 'available',available,'questionCount',jsonb_array_length(v.content->'questions'),
 'questions',questions,'name',r.name,'allowance',coalesce(r.allowance,1),'attempt',case when a.id IS NULL then null else jsonb_build_object('id',a.id,'sequence',a.sequence,'answers',a.answers,'revision',a.revision,'submittedAt',a.submitted_at,'score',case when visible then a.score else null end,'total',jsonb_array_length(v.content->'questions'),'released',visible) end);
END $$;
CREATE OR REPLACE FUNCTION hub_learning_participate(item uuid,credential text,resume text,k uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE access jsonb; i hub_learning_items%ROWTYPE; v hub_learning_versions%ROWTYPE; r hub_learning_recipients%ROWTYPE; a hub_learning_attempts%ROWTYPE; prior hub_learning_operations%ROWTYPE; identity text; result jsonb; count_attempts int; q jsonb; answer int; total int:=0; cmd text:=p->>'action'; guesthash text:=p->>'guestHash';
BEGIN
 access:=hub_learning_access(item,credential,resume); IF access?'error' THEN RETURN access; END IF;
 -- Same lock order as staff commands; serializes close/release/rotation with submissions.
 SELECT * INTO i FROM hub_learning_items WHERE id=item AND organization_id=(access->>'org')::uuid FOR UPDATE;
 SELECT * INTO v FROM hub_learning_versions WHERE id=(access->>'publication')::uuid FOR UPDATE;
 access:=hub_learning_access(item,credential,resume); IF access?'error' THEN RETURN access; END IF;
 SELECT * INTO r FROM hub_learning_recipients WHERE id=(access->>'recipient')::uuid FOR UPDATE;
 IF r.id IS NULL THEN
  IF cmd<>'start' OR coalesce(guesthash,'')!~'^[a-f0-9]{64}$' OR length(trim(coalesce(p->>'name',''))) NOT BETWEEN 1 AND 80 THEN RETURN jsonb_build_object('error','invalid_input'); END IF;
  -- A failed response can retry the exact start without creating a second guest.
  SELECT * INTO r FROM hub_learning_recipients WHERE organization_id=v.organization_id AND publication_id=v.id AND guest_hash=guesthash FOR UPDATE;
  IF FOUND AND r.revoked THEN RETURN jsonb_build_object('error','not_found'); END IF;
 END IF;
 identity:='participant:'||coalesce(r.id::text,guesthash);
 SELECT * INTO prior FROM hub_learning_operations WHERE organization_id=v.organization_id AND actor_id=identity AND request_key=k;
 IF FOUND THEN IF prior.payload<>p||jsonb_build_object('item',item) THEN RETURN jsonb_build_object('error','conflict'); END IF; RETURN prior.response; END IF;
 IF i.state<>'published' OR i.current_publication<>v.id OR (nullif(v.content->>'opensAt','') IS NOT NULL AND (v.content->>'opensAt')::timestamptz>statement_timestamp()) OR (nullif(v.content->>'closesAt','') IS NOT NULL AND (v.content->>'closesAt')::timestamptz<=statement_timestamp()) THEN RETURN jsonb_build_object('error','learning_closed'); END IF;
 IF r.id IS NULL THEN INSERT INTO hub_learning_recipients(organization_id,publication_id,name,guest_hash) VALUES(v.organization_id,v.id,trim(p->>'name'),guesthash) RETURNING * INTO r; END IF;
 SELECT * INTO a FROM hub_learning_attempts WHERE organization_id=v.organization_id AND recipient_id=r.id ORDER BY sequence DESC LIMIT 1 FOR UPDATE;
 IF cmd='start' THEN
  IF a.id IS NULL OR a.submitted_at IS NOT NULL THEN
   SELECT count(*) INTO count_attempts FROM hub_learning_attempts WHERE organization_id=v.organization_id AND recipient_id=r.id;
   IF count_attempts>=r.allowance THEN RETURN jsonb_build_object('error','learning_attempt_limit'); END IF;
   INSERT INTO hub_learning_attempts(organization_id,recipient_id,sequence) VALUES(v.organization_id,r.id,count_attempts+1) RETURNING * INTO a;
  END IF;
 ELSE
  IF a.id IS NULL OR a.id IS DISTINCT FROM nullif(p->>'attempt','')::uuid OR a.revision<>coalesce((p->>'revision')::int,0) OR a.submitted_at IS NOT NULL THEN RETURN jsonb_build_object('error','conflict'); END IF;
  IF cmd='answer' THEN
   IF coalesce(p->>'question','')!~'^[0-9]{1,2}$' OR coalesce(p->>'choice','')!~'^[0-5]$' THEN RETURN jsonb_build_object('error','invalid_input'); END IF;
   q:=v.content->'questions'->((p->>'question')::int);
   IF q IS NULL OR (p->>'choice')::int>=jsonb_array_length(q->'choices') THEN RETURN jsonb_build_object('error','invalid_input'); END IF;
   UPDATE hub_learning_attempts SET answers=answers||jsonb_build_object(p->>'question',(p->>'choice')::int),revision=revision+1 WHERE id=a.id RETURNING * INTO a;
  ELSIF cmd='submit' THEN
   FOR answer IN 0..jsonb_array_length(v.content->'questions')-1 LOOP
    q:=v.content->'questions'->answer;
    IF a.answers->>answer::text=q->>'correct' THEN total:=total+1; END IF;
   END LOOP;
   UPDATE hub_learning_attempts SET score=total,submitted_at=statement_timestamp(),revision=revision+1 WHERE id=a.id RETURNING * INTO a;
  ELSE RETURN jsonb_build_object('error','invalid_input'); END IF;
 END IF;
 result:=jsonb_build_object('id',a.id,'revision',a.revision,'guestStarted',coalesce(r.guest_hash=guesthash,false));
 -- On first guest start, use its stable new principal for all subsequent requests;
 -- retain the initial key under the guest-hash identity too for response-loss replay.
 INSERT INTO hub_learning_operations(organization_id,actor_id,request_key,payload,response) VALUES(v.organization_id,identity,k,p||jsonb_build_object('item',item),result);
 IF identity<>('participant:'||r.id::text) THEN INSERT INTO hub_learning_operations(organization_id,actor_id,request_key,payload,response) VALUES(v.organization_id,'participant:'||r.id::text,k,p||jsonb_build_object('item',item),result); END IF;
 RETURN result;
END $$;
