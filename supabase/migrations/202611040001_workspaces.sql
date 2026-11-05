-- One atomic workspace per account. JSONB keeps imports, statuses and profile consistent.
create table public.workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.workspaces enable row level security;
revoke all on public.workspaces from public, anon, authenticated;
grant select on public.workspaces to authenticated;
create policy "Read own workspace" on public.workspaces
  for select to authenticated using ((select auth.uid()) = user_id);

-- Ownership comes only from the verified JWT. The client cannot supply an owner.
-- Writes are atomic compare-and-swap; stale devices cannot silently overwrite data.
-- Keep elevated code outside the Data API's exposed public schema.
create schema if not exists nextmove_private;
revoke all on schema nextmove_private from public, anon, authenticated;
grant usage on schema nextmove_private to authenticated;
create function nextmove_private.save_workspace(workspace jsonb, expected_revision bigint)
returns table(document jsonb, revision bigint, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if expected_revision is null or expected_revision < 0 then
    raise exception 'Invalid revision' using errcode = '22023';
  end if;
  if workspace is null or jsonb_typeof(workspace) <> 'object'
    or workspace->>'version' is distinct from '1'
    or jsonb_typeof(workspace->'tracked') is distinct from 'object'
    or jsonb_typeof(workspace->'preferences') is distinct from 'object'
    or jsonb_typeof(workspace->'profile') is distinct from 'object'
    or octet_length(workspace::text) > 8388608
    or (workspace - array['version','tracked','preferences','profile','importedJobs','importRevision','importSource','resume']) <> '{}'::jsonb then
    raise exception 'Invalid workspace' using errcode = '22023';
  end if;
  if expected_revision = 0 then
    return query insert into public.workspaces as w (user_id, document)
      values (owner_id, workspace) on conflict (user_id) do nothing
      returning w.document, w.revision, w.updated_at;
  else
    return query update public.workspaces as w
      set document = workspace, revision = w.revision + 1, updated_at = now()
      where w.user_id = owner_id and w.revision = expected_revision
      returning w.document, w.revision, w.updated_at;
  end if;
  if not found then raise exception 'Workspace changed on another device' using errcode = '40001'; end if;
end;
$$;
revoke all on function nextmove_private.save_workspace(jsonb,bigint) from public, anon;
grant execute on function nextmove_private.save_workspace(jsonb,bigint) to authenticated;

-- This exposed entry point has no elevated privileges of its own.
create function public.save_workspace(workspace jsonb, expected_revision bigint)
returns table(document jsonb, revision bigint, updated_at timestamptz)
language sql security invoker set search_path = '' as $$
  select * from nextmove_private.save_workspace(workspace, expected_revision);
$$;
revoke all on function public.save_workspace(jsonb,bigint) from public, anon;
grant execute on function public.save_workspace(jsonb,bigint) to authenticated;
