-- Persist résumé search history without resetting existing jobs or statuses.
-- CREATE OR REPLACE retains existing privileges and the public invoker wrapper.
create or replace function nextmove_private.save_workspace(workspace jsonb, expected_revision bigint)
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
    or (workspace - array['version','tracked','preferences','profile','importedJobs','importRevision','importSource','resume','searches','resumes','selectedResumeId']) <> '{}'::jsonb then
    raise exception 'Invalid workspace' using errcode = '22023';
  end if;
  if workspace ? 'searches' and (jsonb_typeof(workspace->'searches') <> 'array') then
    raise exception 'Invalid searches' using errcode = '22023';
  end if;
  if workspace ? 'resumes' and jsonb_typeof(workspace->'resumes') <> 'array' then
    raise exception 'Invalid resume library' using errcode = '22023';
  end if;
  if workspace ? 'resumes' and jsonb_array_length(workspace->'resumes') > 20 then
    raise exception 'Too many resumes' using errcode = '22023';
  end if;
  if workspace ? 'selectedResumeId' and jsonb_typeof(workspace->'selectedResumeId') <> 'string' then
    raise exception 'Invalid resume selection' using errcode = '22023';
  end if;
  -- Keep library fields together for old clients. If no library exists yet, leave
  -- them absent so the new client can migrate the original single profile.
  if not (workspace ? 'resumes') then
    workspace := workspace || coalesce((select jsonb_build_object(
      'resumes',w.document->'resumes','selectedResumeId',coalesce(w.document->'selectedResumeId','""'::jsonb))
      from public.workspaces w where w.user_id=owner_id and w.document ? 'resumes'),'{}'::jsonb);
  end if;
  if workspace ? 'searches' and jsonb_array_length(workspace->'searches') > 20 then
    raise exception 'Too many searches' using errcode = '22023';
  end if;
  -- Old browser tabs omit the new field. Keep saved searches on their writes.
  if not (workspace ? 'searches') then
    workspace := workspace || jsonb_build_object('searches',coalesce(
      (select w.document->'searches' from public.workspaces w where w.user_id=owner_id),
      '[]'::jsonb));
  end if;
  if octet_length(workspace::text) > 8388608 then
    raise exception 'Workspace exceeds size limit' using errcode = '22023';
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
