-- Seed de données E2E (tournoi / équipes / joueurs / stages / matches / scrims).
--
-- Toutes les lignes sont rattachées au tenant `e2e-test` (slug), ce qui rend le
-- jeu isolé et trivialement nettoyable (cf. bloc CLEANUP en bas de fichier).
-- Aucune branche Supabase payante : alternative gratuite via un tenant dédié
-- dans le projet existant.
--
-- Idempotent : purge les données e2e précédentes puis réinsère un jeu
-- déterministe. Rejouable à volonté.
--
-- Application :
--   psql "$DATABASE_URL" -f database/seeds/e2e_tournament_test_data.sql
--   (ou via le MCP Supabase execute_sql)
--
-- Contenu : 1 tenant, 8 équipes, 48 joueurs (6/équipe dont 1 remplaçant,
-- joueur #1 = capitaine), 1 tournoi Overwatch (running), 8 tournament_teams,
-- 1 stage bracket + 8 stage_teams, 5 matches (3 finished, 1 ongoing,
-- 1 pending + 1 rattaché à un scrim), 5 games, 3 scrims (scheduled/completed/draft).

DO $$
DECLARE
  t_tenant uuid;
  team_names text[] := ARRAY['Phoenix Rising','Shadow Wolves','Iron Titans','Crimson Storm','Arctic Foxes','Thunder Hawks','Neon Vipers','Golden Eagles'];
  short_names text[] := ARRAY['PHR','SHW','IRT','CRS','ARF','THH','NEV','GOE'];
  firsts text[] := ARRAY['Lucas','Hugo','Theo','Nathan','Leo','Arthur','Jade','Emma','Lea','Chloe','Alice','Lina','Sarah','Ines','Karim','Yuki','Chen','Erik','Sven','Pavel','Marco','Dani','Louis','Maya'];
  lasts text[] := ARRAY['Martin','Bernard','Dubois','Thomas','Robert','Petit','Durand','Moreau','Laurent','Simon','Garcia','Muller','Kim','Park','Santos','Jensen','Novak','Fischer'];
  maps text[] := ARRAY['Hanamura','King''s Row','Numbani','Dorado','Ilios'];
  team_ids uuid[] := '{}';
  v_team uuid; v_user uuid; v_first text; v_last text; v_tag text;
  v_tour uuid; v_stage uuid; v_m1 uuid; v_m2 uuid; v_scrim2 uuid;
  i int; j int; idxf int; idxl int;
BEGIN
  SELECT id INTO t_tenant FROM tenants WHERE slug='e2e-test';
  IF t_tenant IS NULL THEN
    t_tenant := 'e2e70000-0000-4000-8000-000000000001';
    INSERT INTO tenants(id,slug,name) VALUES (t_tenant,'e2e-test','E2E Test Data');
  END IF;

  -- Idempotency: wipe previous e2e data (FK-safe order)
  DELETE FROM games WHERE tenant_id=t_tenant;
  DELETE FROM matches WHERE tenant_id=t_tenant;
  DELETE FROM scrims WHERE tenant_id=t_tenant;
  DELETE FROM stage_teams WHERE tenant_id=t_tenant;
  DELETE FROM tournament_stages WHERE tenant_id=t_tenant;
  DELETE FROM tournament_teams WHERE tenant_id=t_tenant;
  DELETE FROM team_members WHERE tenant_id=t_tenant;
  DELETE FROM teams WHERE tenant_id=t_tenant;
  DELETE FROM auth.users WHERE email LIKE '%@e2e.test';

  -- Teams + players (6 each: 5 players + 1 substitute, player #1 is captain)
  FOR i IN 1..8 LOOP
    v_team := ('e2e70000-0000-4000-8000-' || lpad(to_hex(65536 + i),12,'0'))::uuid;
    INSERT INTO teams(id,name,short_name,slug,tenant_id,is_active,country,description)
      VALUES (v_team, team_names[i], short_names[i], 'e2e-team-'||i, t_tenant, true, 'FR', 'Equipe de test E2E');
    team_ids := array_append(team_ids, v_team);
    FOR j IN 1..6 LOOP
      v_user := ('e2e70000-0000-4000-8000-' || lpad(to_hex(131072 + i*16 + j),12,'0'))::uuid;
      idxf := 1 + (((i-1)*6 + (j-1)) % array_length(firsts,1));
      idxl := 1 + ((((i-1)*6 + (j-1))*7) % array_length(lasts,1));
      v_first := firsts[idxf];
      v_last := lasts[idxl];
      v_tag := v_first || '#' || lpad((1000 + ((i*131 + j*17) % 9000))::text, 4, '0');
      INSERT INTO auth.users(id, instance_id, aud, role, email, created_at, updated_at)
        VALUES (v_user, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
                'e2e-'||i||'-'||j||'@e2e.test', now(), now());
      INSERT INTO team_members(team_id,user_id,role,battle_tag,display_name,tenant_id,is_substitute)
        VALUES (v_team, v_user, CASE WHEN j=6 THEN 'substitute' ELSE 'player' END,
                v_tag, v_first||' '||v_last, t_tenant, j=6);
      IF j=1 THEN UPDATE teams SET captain_id=v_user WHERE id=v_team; END IF;
    END LOOP;
  END LOOP;

  -- Tournament
  v_tour := 'e2e70000-0000-4000-8000-000000030001';
  INSERT INTO tournaments(id,name,short_name,slug,game,status,format,format_type,max_teams,start_date,end_date,tenant_id,visibility,is_featured,timezone)
    VALUES (v_tour,'E2E Test Cup','E2E','e2e-test-cup','overwatch','running','single_elimination','bracket',8,current_date,current_date+14,t_tenant,'public',false,'Europe/Paris');

  FOR i IN 1..8 LOOP
    INSERT INTO tournament_teams(tournament_id,team_id,seed,status,tenant_id)
      VALUES (v_tour, team_ids[i], i, 'registered', t_tenant);
  END LOOP;

  -- Stage + stage teams
  v_stage := 'e2e70000-0000-4000-8000-000000040001';
  INSERT INTO tournament_stages(id,tournament_id,name,stage_type,default_match_format,bracket_format,visible,is_active,is_public,order_index,tiebreaker_policy,start_date,end_date,slug,tenant_id)
    VALUES (v_stage, v_tour,'Playoffs','bracket','bo3','single_elim',true,true,true,0,'manual',current_date,current_date+14,'e2e-playoffs',t_tenant);
  FOR i IN 1..8 LOOP
    INSERT INTO stage_teams(stage_id,team_id,seed,is_substitute,tenant_id)
      VALUES (v_stage, team_ids[i], i, false, t_tenant);
  END LOOP;

  -- Matches (quarterfinals): 2 finished, 1 ongoing, 1 pending
  v_m1 := gen_random_uuid();
  INSERT INTO matches(id,tournament_id,stage_id,team1_id,team2_id,team1_score,team2_score,winner_team_id,match_format,status,round_name,round_number,bracket_side,scheduled_at,completed_at,tenant_id)
    VALUES (v_m1,v_tour,v_stage,team_ids[1],team_ids[2],2,1,team_ids[1],'bo3','finished','Quart de finale 1',1,'none',now()-interval '2 days',now()-interval '2 days'+interval '90 min',t_tenant);
  v_m2 := gen_random_uuid();
  INSERT INTO matches(id,tournament_id,stage_id,team1_id,team2_id,team1_score,team2_score,winner_team_id,match_format,status,round_name,round_number,bracket_side,scheduled_at,completed_at,tenant_id)
    VALUES (v_m2,v_tour,v_stage,team_ids[3],team_ids[4],2,0,team_ids[3],'bo3','finished','Quart de finale 2',1,'none',now()-interval '2 days',now()-interval '2 days'+interval '70 min',t_tenant);
  INSERT INTO matches(tournament_id,stage_id,team1_id,team2_id,team1_score,team2_score,match_format,status,round_name,round_number,bracket_side,scheduled_at,tenant_id)
    VALUES (v_tour,v_stage,team_ids[5],team_ids[6],1,0,'bo3','ongoing','Quart de finale 3',1,'none',now(),t_tenant);
  INSERT INTO matches(tournament_id,stage_id,team1_id,team2_id,match_format,status,round_name,round_number,bracket_side,scheduled_at,tenant_id)
    VALUES (v_tour,v_stage,team_ids[7],team_ids[8],'bo3','pending','Quart de finale 4',1,'none',now()+interval '1 day',t_tenant);

  -- Games for the two finished matches
  INSERT INTO games(match_id,map_name,map_order,team1_score,team2_score,winner_team_id,tenant_id) VALUES
    (v_m1,maps[1],1,1,0,team_ids[1],t_tenant),
    (v_m1,maps[2],2,0,1,team_ids[2],t_tenant),
    (v_m1,maps[3],3,1,0,team_ids[1],t_tenant),
    (v_m2,maps[4],1,1,0,team_ids[3],t_tenant),
    (v_m2,maps[5],2,1,0,team_ids[3],t_tenant);

  -- Scrims: scheduled / completed / draft
  INSERT INTO scrims(name,slug,game,status,team1_id,team2_id,scheduled_date,is_public,description,tenant_id) VALUES
    ('E2E Scrim A','e2e-scrim-a','overwatch','scheduled',team_ids[1],team_ids[3],now()+interval '3 days',true,'Scrim de test programme',t_tenant);
  v_scrim2 := gen_random_uuid();
  INSERT INTO scrims(id,name,slug,game,status,team1_id,team2_id,scheduled_date,is_public,description,tenant_id) VALUES
    (v_scrim2,'E2E Scrim B','e2e-scrim-b','overwatch','completed',team_ids[2],team_ids[4],now()-interval '5 days',true,'Scrim de test termine',t_tenant);
  INSERT INTO scrims(name,slug,game,status,team1_id,team2_id,scheduled_date,is_public,description,tenant_id) VALUES
    ('E2E Scrim C','e2e-scrim-c','overwatch','draft',team_ids[5],team_ids[6],now()+interval '7 days',false,'Scrim de test brouillon',t_tenant);

  -- One match attached to the completed scrim (scrim branch of matches_owner_check)
  INSERT INTO matches(scrim_id,team1_id,team2_id,team1_score,team2_score,winner_team_id,match_format,status,tenant_id)
    VALUES (v_scrim2,team_ids[2],team_ids[4],2,1,team_ids[2],'bo3','finished',t_tenant);
END $$;

-- =====================================================================
-- CLEANUP (decommenter pour tout supprimer ; ordre FK-safe) :
--
-- DO $$
-- DECLARE t uuid; BEGIN
--   SELECT id INTO t FROM tenants WHERE slug='e2e-test';
--   IF t IS NULL THEN RETURN; END IF;
--   DELETE FROM games WHERE tenant_id=t;
--   DELETE FROM matches WHERE tenant_id=t;
--   DELETE FROM scrims WHERE tenant_id=t;
--   DELETE FROM stage_teams WHERE tenant_id=t;
--   DELETE FROM tournament_stages WHERE tenant_id=t;
--   DELETE FROM tournament_teams WHERE tenant_id=t;
--   DELETE FROM team_members WHERE tenant_id=t;
--   DELETE FROM teams WHERE tenant_id=t;
--   DELETE FROM auth.users WHERE email LIKE '%@e2e.test';
--   DELETE FROM tenants WHERE id=t;
-- END $$;
-- =====================================================================
