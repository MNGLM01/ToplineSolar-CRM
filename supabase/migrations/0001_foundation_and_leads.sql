-- Topline Solar CRM · Step 1: foundation, roles, leads, follow-ups, partners, audit
create extension if not exists pgcrypto;

-- ---------- Roles & profiles ----------
create type public.app_role as enum ('owner','office_manager','sales','partner');

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  area text,
  commission_type text not null default 'per_kw' check (commission_type in ('per_kw','per_installation','percent')),
  commission_value numeric(12,2) not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  role public.app_role not null default 'sales',
  partner_id uuid references public.partners(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- helpers (security definer so RLS policies can call them without recursion)
create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;
create or replace function public.my_partner_id() returns uuid
language sql stable security definer set search_path = public as $$
  select partner_id from public.profiles where id = auth.uid() and active
$$;
create or replace function public.is_staff_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('owner','office_manager'), false)
$$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'owner', false)
$$;

-- ---------- Settings / lookup lists ----------
create table public.lead_stages (
  id serial primary key,
  name text not null unique,
  sort int not null,
  color text not null default '#2D6CDF',
  is_won boolean not null default false,
  is_lost boolean not null default false,
  active boolean not null default true
);
create table public.lead_sources (
  id serial primary key,
  name text not null unique,
  sort int not null default 0,
  active boolean not null default true
);
create table public.lost_reasons (
  id serial primary key,
  name text not null unique,
  sort int not null default 0,
  active boolean not null default true
);
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.lead_stages (name, sort, color, is_won, is_lost) values
 ('New',1,'#2D6CDF',false,false),
 ('Contacted',2,'#2D6CDF',false,false),
 ('Interested',3,'#F58220',false,false),
 ('Site Survey Scheduled',4,'#F58220',false,false),
 ('Site Survey Done',5,'#F58220',false,false),
 ('Quotation Sent',6,'#FFB81C',false,false),
 ('Negotiation',7,'#FFB81C',false,false),
 ('Won',8,'#1F9D55',true,false),
 ('Lost',9,'#6B7A90',false,true),
 ('Future / Call Later',10,'#6B7A90',false,false);
insert into public.lead_sources (name, sort) values
 ('Walk-in',1),('Referral Partner',2),('Facebook / Instagram',3),('Website',4),
 ('Phone call',5),('IndiaMART',6),('Justdial',7),('Other',8);
insert into public.lost_reasons (name, sort) values
 ('Price too high',1),('Not interested',2),('No suitable roof',3),('Went to competitor',4),('Other',5);
insert into public.app_settings (key, value) values
 ('solar_estimate', '{"tariff_per_unit":7,"units_per_kw_month":120,"cost_per_kw":60000,"subsidy_per_kw_first_2":30000,"subsidy_third_kw":18000,"subsidy_max":78000}'),
 ('company', '{"name":"Topline Solar","city":"Kishanganj, Bihar"}');

-- ---------- Leads ----------
create sequence public.lead_no_seq start 1;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  lead_no text not null unique default ('TL-' || lpad(nextval('public.lead_no_seq')::text, 5, '0')),
  name text not null check (length(trim(name)) > 0),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  whatsapp text,
  alt_phone text,
  email text,
  address text,
  village text,
  district text,
  pincode text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  state text not null default 'Bihar',
  monthly_bill numeric(12,2),
  roof_type text,
  customer_type text not null default 'Residential' check (customer_type in ('Residential','Commercial','Industrial','Agricultural')),
  sanctioned_load_kw numeric(8,2),
  discom text,
  source_id int references public.lead_sources(id),
  partner_id uuid references public.partners(id),
  stage_id int not null references public.lead_stages(id) default 1,
  temperature text check (temperature in ('hot','warm','cold')),
  assigned_to uuid references public.profiles(id),
  deal_value numeric(12,2),
  lost_reason_id int references public.lost_reasons(id),
  next_followup_at timestamptz,
  won_at timestamptz,
  notes text,
  last_activity_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index leads_phone_active_uniq on public.leads(phone) where deleted_at is null;
create index leads_stage_idx on public.leads(stage_id) where deleted_at is null;
create index leads_assigned_idx on public.leads(assigned_to) where deleted_at is null;
create index leads_partner_idx on public.leads(partner_id) where deleted_at is null;

create table public.lead_activities (
  id bigserial primary key,
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null check (type in ('note','call','whatsapp','visit','stage_change','assignment','followup','system')),
  body text,
  meta jsonb not null default '{}',
  user_id uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index lead_activities_lead_idx on public.lead_activities(lead_id, created_at desc);

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null default 'call' check (type in ('call','visit','whatsapp','meeting')),
  title text not null,
  note text,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','done','cancelled')),
  owner_id uuid references public.profiles(id) default auth.uid(),
  completed_at timestamptz,
  outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index followups_owner_due_idx on public.followups(owner_id, status, due_at);
create index followups_lead_idx on public.followups(lead_id);

-- ---------- Audit log (every change, who/what/when, old & new) ----------
create table public.audit_log (
  id bigserial primary key,
  table_name text not null,
  record_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index audit_log_record_idx on public.audit_log(table_name, record_id, created_at desc);

create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log(table_name, record_id, action, old_data, new_data)
  values (tg_table_name,
          coalesce((case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id',''),
          tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['leads','followups','partners','profiles','lead_stages','lead_sources','lost_reasons','app_settings'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit_trigger()', t);
  end loop;
  foreach t in array array['leads','followups','partners','profiles'] loop
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------- Lead business rules ----------
create or replace function public.leads_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.app_role := public.my_role();
begin
  -- updates made by the system's own triggers (timeline, follow-up dates) skip the user checks
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then return new; end if;
  -- only the owner may move a lead to/from trash
  if tg_op = 'UPDATE' and (new.deleted_at is distinct from old.deleted_at) and r is distinct from 'owner' then
    raise exception 'Only the owner can delete or restore leads';
  end if;
  -- partners: forced to their own partner id, cannot assign or change stage
  if r = 'partner' then
    if tg_op = 'INSERT' then
      new.partner_id := public.my_partner_id();
      new.source_id := (select id from public.lead_sources where name = 'Referral Partner');
      new.stage_id := 1; new.assigned_to := null;
    else
      raise exception 'Partners cannot edit leads';
    end if;
  end if;
  -- sales: new leads they create are assigned to them; they cannot reassign to others
  if r = 'sales' then
    if tg_op = 'INSERT' then new.assigned_to := auth.uid(); end if;
    if tg_op = 'UPDATE' and new.assigned_to is distinct from old.assigned_to then
      raise exception 'Only the owner or office manager can reassign leads';
    end if;
  end if;
  if new.whatsapp is null or new.whatsapp = '' then new.whatsapp := new.phone; end if;
  -- remember when a lead was won (for monthly counts)
  if (select is_won from public.lead_stages where id = new.stage_id) then
    if tg_op = 'INSERT' or old.stage_id is distinct from new.stage_id then new.won_at := now(); end if;
  elsif tg_op = 'UPDATE' and old.stage_id is distinct from new.stage_id then
    new.won_at := null;
  end if;
  return new;
end $$;
create trigger leads_guard before insert or update on public.leads
  for each row execute function public.leads_guard();

-- automatic timeline entries for stage changes and reassignment
create or replace function public.leads_timeline() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_activities(lead_id, type, body, meta)
    values (new.id, 'system', 'Lead created', jsonb_build_object('stage_id', new.stage_id));
  else
    if new.stage_id is distinct from old.stage_id then
      insert into public.lead_activities(lead_id, type, body, meta)
      values (new.id, 'stage_change',
        (select name from lead_stages where id = old.stage_id) || ' → ' || (select name from lead_stages where id = new.stage_id),
        jsonb_build_object('from', old.stage_id, 'to', new.stage_id));
    end if;
    if new.assigned_to is distinct from old.assigned_to then
      insert into public.lead_activities(lead_id, type, body, meta)
      values (new.id, 'assignment',
        'Assigned to ' || coalesce((select full_name from profiles where id = new.assigned_to), 'nobody'),
        jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to));
    end if;
  end if;
  return new;
end $$;
create trigger leads_timeline after insert or update on public.leads
  for each row execute function public.leads_timeline();

create or replace function public.activity_touch_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin update public.leads set last_activity_at = now() where id = new.lead_id; return new; end $$;
create trigger activity_touch_lead after insert on public.lead_activities
  for each row execute function public.activity_touch_lead();

-- keep leads.next_followup_at = earliest pending follow-up
create or replace function public.sync_next_followup() returns trigger
language plpgsql security definer set search_path = public as $$
declare lid uuid := coalesce(new.lead_id, old.lead_id);
begin
  update public.leads set next_followup_at =
    (select min(due_at) from public.followups where lead_id = lid and status = 'pending')
  where id = lid;
  return coalesce(new, old);
end $$;
create trigger followups_sync after insert or update or delete on public.followups
  for each row execute function public.sync_next_followup();

-- duplicate check usable by everyone (returns minimal info only)
create or replace function public.find_lead_by_phone(p text)
returns table(id uuid, lead_no text, name text, assigned_name text, visible boolean)
language sql stable security definer set search_path = public as $$
  select l.id, l.lead_no, l.name, pr.full_name,
         (public.is_staff_admin() or l.assigned_to = auth.uid() or l.created_by = auth.uid())
  from public.leads l left join public.profiles pr on pr.id = l.assigned_to
  where l.deleted_at is null and (l.phone = p or l.whatsapp = p or l.alt_phone = p)
  limit 1
$$;

-- ---------- Row level security ----------
alter table public.profiles enable row level security;
alter table public.partners enable row level security;
alter table public.lead_stages enable row level security;
alter table public.lead_sources enable row level security;
alter table public.lost_reasons enable row level security;
alter table public.app_settings enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.followups enable row level security;
alter table public.audit_log enable row level security;

-- profiles: everyone signed in can read names (for assignee pickers); only owner edits
create policy profiles_read on public.profiles for select to authenticated using (public.my_role() is not null);
create policy profiles_owner_write on public.profiles for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- partners: staff admins manage; sales can read names; partner reads self
create policy partners_read on public.partners for select to authenticated
  using (public.my_role() in ('owner','office_manager','sales') or id = public.my_partner_id());
create policy partners_write on public.partners for insert to authenticated with check (public.is_staff_admin());
create policy partners_update on public.partners for update to authenticated using (public.is_staff_admin()) with check (public.is_staff_admin());

-- lookups: everyone reads, owner writes
create policy stages_read on public.lead_stages for select to authenticated using (true);
create policy stages_write on public.lead_stages for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy sources_read on public.lead_sources for select to authenticated using (true);
create policy sources_write on public.lead_sources for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy lost_read on public.lost_reasons for select to authenticated using (true);
create policy lost_write on public.lost_reasons for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy settings_read on public.app_settings for select to authenticated using (public.my_role() is not null);
create policy settings_write on public.app_settings for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- leads
create policy leads_select on public.leads for select to authenticated using (
  (deleted_at is null or public.is_owner()) and (
    public.is_staff_admin()
    or (public.my_role() = 'sales' and (assigned_to = auth.uid() or created_by = auth.uid()))
    or (public.my_role() = 'partner' and partner_id = public.my_partner_id())
  ));
create policy leads_insert on public.leads for insert to authenticated with check (public.my_role() is not null);
create policy leads_update on public.leads for update to authenticated using (
  public.is_staff_admin() or (public.my_role() = 'sales' and (assigned_to = auth.uid() or created_by = auth.uid()))
) with check (true);
-- no DELETE policy: rows are never hard-deleted from the app

-- activities: visible if the lead is visible
create policy activities_select on public.lead_activities for select to authenticated using (
  public.my_role() <> 'partner' and exists (select 1 from public.leads l where l.id = lead_id));
create policy activities_insert on public.lead_activities for insert to authenticated with check (
  public.my_role() <> 'partner' and exists (select 1 from public.leads l where l.id = lead_id));

-- follow-ups
create policy followups_select on public.followups for select to authenticated using (
  public.my_role() <> 'partner' and exists (select 1 from public.leads l where l.id = lead_id));
create policy followups_insert on public.followups for insert to authenticated with check (
  public.my_role() <> 'partner' and exists (select 1 from public.leads l where l.id = lead_id));
create policy followups_update on public.followups for update to authenticated using (
  public.is_staff_admin() or owner_id = auth.uid()) with check (true);

-- audit log: owner only
create policy audit_owner on public.audit_log for select to authenticated using (public.is_owner());

-- partner-facing summary (limited columns, own leads only)
create or replace view public.partner_leads with (security_invoker = true) as
  select l.id, l.lead_no, l.name, l.phone, l.village, l.district, l.monthly_bill, l.created_at,
         s.name as stage, s.is_won, s.is_lost
  from public.leads l join public.lead_stages s on s.id = l.stage_id
  where l.deleted_at is null;

-- profiles are created for every auth user; only accounts created through the manage-users
-- function (which sets app_metadata.role) are active. Public sign-ups get an inactive profile.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, phone, email, role, partner_id, active)
  values (new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, new.phone, 'User'), '@', 1)),
    coalesce(new.raw_user_meta_data->>'phone', new.phone),
    new.email,
    coalesce((new.raw_app_meta_data->>'role')::public.app_role, 'sales'),
    nullif(new.raw_app_meta_data->>'partner_id','')::uuid,
    new.raw_app_meta_data ? 'role');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- login screen asks this to decide whether to show first-time setup
create or replace function public.setup_needed() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles)
$$;
grant execute on function public.setup_needed() to anon, authenticated;

-- lock down security-definer helpers: nothing callable without signing in except setup_needed
revoke execute on function public.find_lead_by_phone(text) from public, anon;
grant execute on function public.find_lead_by_phone(text) to authenticated;
revoke execute on function public.my_role(), public.my_partner_id(), public.is_staff_admin(), public.is_owner() from anon;
