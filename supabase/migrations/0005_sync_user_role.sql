-- Fix: Supabase saves a new user's app_metadata (role, partner) just after the auth.users row is inserted,
-- so the insert trigger saw no role and made every new login an inactive "sales" profile.
-- Sync the profile whenever the role or partner in app_metadata is set or changed.
create or replace function public.sync_user_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.raw_app_meta_data ? 'role'
     and (old.raw_app_meta_data->>'role' is distinct from new.raw_app_meta_data->>'role'
          or old.raw_app_meta_data->>'partner_id' is distinct from new.raw_app_meta_data->>'partner_id') then
    update public.profiles
       set role = (new.raw_app_meta_data->>'role')::public.app_role,
           partner_id = nullif(new.raw_app_meta_data->>'partner_id', '')::uuid,
           active = true
     where id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.sync_user_role() from public, anon, authenticated;
drop trigger if exists on_auth_user_role on auth.users;
create trigger on_auth_user_role after update of raw_app_meta_data on auth.users
  for each row execute function public.sync_user_role();

-- repair accounts already created with the wrong role
update public.profiles p
   set role = (u.raw_app_meta_data->>'role')::public.app_role,
       partner_id = nullif(u.raw_app_meta_data->>'partner_id', '')::uuid,
       active = true
  from auth.users u
 where u.id = p.id and u.raw_app_meta_data ? 'role'
   and (p.role::text is distinct from u.raw_app_meta_data->>'role' or not p.active)
   and u.banned_until is null;
