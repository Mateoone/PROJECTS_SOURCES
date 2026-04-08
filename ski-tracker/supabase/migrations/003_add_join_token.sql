-- Add join_token column to sessions table
-- Replaces JWT-based token with a simple random UUID stored in DB
alter table public.sessions add column if not exists join_token uuid not null default gen_random_uuid();
create unique index if not exists sessions_join_token_idx on public.sessions (join_token);
