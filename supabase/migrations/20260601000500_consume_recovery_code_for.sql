-- Service-role variant of consume_recovery_code: accepts the user_id explicitly
-- instead of reading auth.uid(). Used by the consume-recovery-code edge function,
-- which authenticates the user via JWT then calls this RPC with the resolved id
-- in order to bypass AAL2 RLS while still hashing + atomically marking used_at.

create or replace function public.consume_recovery_code_for(
  p_user uuid,
  p_code text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched uuid;
begin
  update public.recovery_codes
     set used_at = now()
   where user_id = p_user
     and used_at is null
     and code_hash = encode(extensions.digest(p_code, 'sha256'), 'hex')
   returning id into matched;
  return matched is not null;
end;
$$;

revoke all on function public.consume_recovery_code_for(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_recovery_code_for(uuid, text) to service_role;

comment on function public.consume_recovery_code_for(uuid, text) is
  'Service-role only. Validates + marks a recovery code as used for the given user. Returns true on first match, false otherwise (already used or wrong code).';
