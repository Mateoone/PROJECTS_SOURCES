-- ============================================================
-- Ski Team Tracker — Initial Schema
-- Tables first, then all RLS policies, then Realtime + indexes
-- ============================================================

create extension if not exists "pgcrypto";

-- ─── TABLES ───────────────────────────────────────────────────

create table public.sessions (
  id                   uuid primary key default gen_random_uuid(),
  admin_id             uuid not null,
  station_id           text not null,
  station_name         text not null,
  station_center_lat   double precision not null,
  station_center_lng   double precision not null,
  created_at           timestamptz not null default now(),
  expires_at           timestamptz not null
);

create table public.team_members (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions(id) on delete cascade,
  user_id        uuid not null,
  display_name   text not null,
  avatar_color   text not null default '#3b82f6',
  joined_at      timestamptz not null default now(),
  unique (session_id, user_id)
);

create table public.positions (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions(id) on delete cascade,
  user_id      uuid not null,
  lat          double precision not null,
  lng          double precision not null,
  altitude     double precision,
  speed        double precision,
  heading      double precision,
  accuracy     double precision,
  timestamp    timestamptz not null default now(),
  unique (session_id, user_id)
);

create type public.poi_type as enum ('meetpoint', 'danger', 'info');

create table public.pois (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions(id) on delete cascade,
  label        text not null,
  lat          double precision not null,
  lng          double precision not null,
  created_by   uuid not null,
  type         public.poi_type not null default 'info',
  created_at   timestamptz not null default now(),
  active       boolean not null default true
);

-- ─── ENABLE RLS ───────────────────────────────────────────────

alter table public.sessions     enable row level security;
alter table public.team_members enable row level security;
alter table public.positions    enable row level security;
alter table public.pois         enable row level security;

-- ─── RLS POLICIES ─────────────────────────────────────────────

-- sessions
create policy "sessions: read own or member"
  on public.sessions for select
  using (
    admin_id = auth.uid()
    or exists (
      select 1 from public.team_members tm
      where tm.session_id = sessions.id
        and tm.user_id = auth.uid()
    )
  );

create policy "sessions: admin insert"
  on public.sessions for insert
  with check (admin_id = auth.uid());

-- team_members
create policy "team_members: read same session"
  on public.team_members for select
  using (
    exists (
      select 1 from public.team_members tm2
      where tm2.session_id = team_members.session_id
        and tm2.user_id = auth.uid()
    )
  );

create policy "team_members: insert self"
  on public.team_members for insert
  with check (user_id = auth.uid());

create policy "team_members: update self"
  on public.team_members for update
  using (user_id = auth.uid());

-- positions
create policy "positions: read same session"
  on public.positions for select
  using (
    exists (
      select 1 from public.team_members tm
      where tm.session_id = positions.session_id
        and tm.user_id = auth.uid()
    )
  );

create policy "positions: upsert own"
  on public.positions for insert
  with check (user_id = auth.uid());

create policy "positions: update own"
  on public.positions for update
  using (user_id = auth.uid());

-- pois
create policy "pois: read same session"
  on public.pois for select
  using (
    exists (
      select 1 from public.team_members tm
      where tm.session_id = pois.session_id
        and tm.user_id = auth.uid()
    )
  );

create policy "pois: admin insert"
  on public.pois for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.sessions s
      where s.id = pois.session_id
        and s.admin_id = auth.uid()
    )
  );

create policy "pois: admin update"
  on public.pois for update
  using (
    exists (
      select 1 from public.sessions s
      where s.id = pois.session_id
        and s.admin_id = auth.uid()
    )
  );

-- ─── REALTIME ─────────────────────────────────────────────────

alter publication supabase_realtime add table public.positions;
alter publication supabase_realtime add table public.pois;

-- ─── INDEXES ──────────────────────────────────────────────────

create index on public.positions (session_id, user_id);
create index on public.team_members (session_id);
create index on public.pois (session_id, active);

-- ─── CLEANUP FUNCTION ─────────────────────────────────────────

create or replace function public.cleanup_expired_sessions()
returns void language sql security definer as $$
  delete from public.sessions where expires_at < now();
$$;
