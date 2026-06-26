-- Fix infinite recursion in team_members RLS policy
-- The old policy queried team_members from within a team_members policy → recursion.
-- Solution: use a SECURITY DEFINER helper function that bypasses RLS.

create or replace function public.is_session_member(p_session_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.team_members
    where session_id = p_session_id
      and user_id = auth.uid()
  );
$$;

-- Replace the recursive policy with one that uses the helper
drop policy if exists "team_members: read same session" on public.team_members;

create policy "team_members: read same session"
  on public.team_members for select
  using (public.is_session_member(session_id));
