-- ============================================================
-- Ski Team Tracker — Seed Data
-- 3 test stations with real OpenSkiMap IDs
-- ============================================================

-- Note: sessions require a real auth.uid(), so seed creates
-- anonymous placeholder sessions for development only.
-- In production, sessions are created by authenticated users.

-- Test admin UUID (use in local Supabase dev with service role)
do $$
declare
  v_admin_id  uuid := '00000000-0000-0000-0000-000000000001';
  v_member1   uuid := '00000000-0000-0000-0000-000000000002';
  v_member2   uuid := '00000000-0000-0000-0000-000000000003';
  v_session1  uuid;
  v_session2  uuid;
  v_session3  uuid;
begin

  -- ── Station 1: Chamonix ───────────────────────────────────
  insert into public.sessions (id, admin_id, station_id, station_name, station_center_lat, station_center_lng, expires_at)
  values (
    gen_random_uuid(), v_admin_id,
    '3', 'Chamonix Mont-Blanc', 45.9237, 6.8696,
    now() + interval '12 hours'
  ) returning id into v_session1;

  insert into public.team_members (session_id, user_id, display_name, avatar_color) values
    (v_session1, v_admin_id, 'Chef',    '#3b82f6'),
    (v_session1, v_member1,  'Sophie',  '#ef4444'),
    (v_session1, v_member2,  'Marc',    '#22c55e');

  insert into public.positions (session_id, user_id, lat, lng, altitude, speed) values
    (v_session1, v_admin_id, 45.9237, 6.8696,  1035.0, 0.0),
    (v_session1, v_member1,  45.9250, 6.8710,  1100.0, 8.5),
    (v_session1, v_member2,  45.9210, 6.8650,   980.0, 0.0);

  insert into public.pois (session_id, label, lat, lng, created_by, type) values
    (v_session1, 'Rendez-vous Aiguille du Midi', 45.9256, 6.8735, v_admin_id, 'meetpoint'),
    (v_session1, 'Piste verglacée', 45.9220, 6.8670, v_admin_id, 'danger');

  -- ── Station 2: Val d'Isère / Tignes ───────────────────────
  insert into public.sessions (id, admin_id, station_id, station_name, station_center_lat, station_center_lng, expires_at)
  values (
    gen_random_uuid(), v_admin_id,
    '2', 'Val-d''Isère / Tignes', 45.4484, 6.9797,
    now() + interval '12 hours'
  ) returning id into v_session2;

  insert into public.team_members (session_id, user_id, display_name, avatar_color) values
    (v_session2, v_admin_id, 'Chef',   '#3b82f6'),
    (v_session2, v_member1,  'Julie',  '#f97316');

  insert into public.positions (session_id, user_id, lat, lng, altitude, speed) values
    (v_session2, v_admin_id, 45.4484, 6.9797, 1850.0, 5.2),
    (v_session2, v_member1,  45.4510, 6.9820, 2100.0, 12.0);

  insert into public.pois (session_id, label, lat, lng, created_by, type) values
    (v_session2, 'Bar de la Folie Douce', 45.4495, 6.9810, v_admin_id, 'meetpoint');

  -- ── Station 3: Verbier ────────────────────────────────────
  insert into public.sessions (id, admin_id, station_id, station_name, station_center_lat, station_center_lng, expires_at)
  values (
    gen_random_uuid(), v_admin_id,
    '14', 'Verbier', 46.0956, 7.2273,
    now() + interval '12 hours'
  ) returning id into v_session3;

  insert into public.team_members (session_id, user_id, display_name, avatar_color) values
    (v_session3, v_admin_id, 'Chef',    '#3b82f6'),
    (v_session3, v_member1,  'Alex',    '#8b5cf6'),
    (v_session3, v_member2,  'Camille', '#ec4899');

  insert into public.positions (session_id, user_id, lat, lng, altitude, speed) values
    (v_session3, v_admin_id, 46.0956, 7.2273, 1500.0, 0.0),
    (v_session3, v_member1,  46.0970, 7.2290, 1650.0, 6.0),
    (v_session3, v_member2,  46.0940, 7.2260, 1420.0, 0.0);

end $$;
