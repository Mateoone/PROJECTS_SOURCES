-- Replace auth-based RLS with open policies.
-- Security is enforced at the application layer via the join_token.
-- No Supabase auth required — users are identified by a client-generated UUID.

-- ─── sessions ───────────────────────────────────────────────
drop policy if exists "sessions: read own or member" on public.sessions;
drop policy if exists "sessions: admin insert" on public.sessions;

create policy "sessions: open read" on public.sessions for select using (true);
create policy "sessions: open insert" on public.sessions for insert with check (true);

-- ─── team_members ────────────────────────────────────────────
drop policy if exists "team_members: read same session" on public.team_members;
drop policy if exists "team_members: insert self" on public.team_members;
drop policy if exists "team_members: update self" on public.team_members;

create policy "team_members: open read"   on public.team_members for select using (true);
create policy "team_members: open insert" on public.team_members for insert with check (true);
create policy "team_members: open update" on public.team_members for update using (true);

-- ─── positions ───────────────────────────────────────────────
drop policy if exists "positions: read same session" on public.positions;
drop policy if exists "positions: upsert own" on public.positions;
drop policy if exists "positions: update own" on public.positions;

create policy "positions: open read"   on public.positions for select using (true);
create policy "positions: open insert" on public.positions for insert with check (true);
create policy "positions: open update" on public.positions for update using (true);

-- ─── pois ────────────────────────────────────────────────────
drop policy if exists "pois: read same session" on public.pois;
drop policy if exists "pois: admin insert" on public.pois;
drop policy if exists "pois: admin update" on public.pois;

create policy "pois: open read"   on public.pois for select using (true);
create policy "pois: open insert" on public.pois for insert with check (true);
create policy "pois: open update" on public.pois for update using (true);

-- ─── drop unused helper function ────────────────────────────
drop function if exists public.is_session_member(uuid);
