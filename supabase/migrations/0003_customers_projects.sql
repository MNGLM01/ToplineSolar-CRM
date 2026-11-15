-- Topline Solar CRM · Step 2: customers, projects, PM Surya Ghar milestones, checklists,
-- site surveys, documents (with storage), subsidy and bank loans, project locking.

-- ---------- Customers ----------
create sequence public.customer_no_seq start 1;
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_no text not null unique default ('TC-' || lpad(nextval('public.customer_no_seq')::text, 5, '0')),
  lead_id uuid unique references public.leads(id),
  name text not null check (length(trim(name)) > 0),
  father_name text,
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  whatsapp text,
  alt_phone text,
  email text,
  address text,
  village text,
  district text,
  pincode text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  state text not null default 'Bihar',
  consumer_no text,           -- electricity CA / consumer number
  discom text,
  sanctioned_load_kw numeric(8,2),
  connection_phase text check (connection_phase is null or connection_phase in ('Single phase','Three phase')),
  co_applicant_name text,
  co_applicant_relation text,
  source_id int references public.lead_sources(id),
  partner_id uuid references public.partners(id),
  assigned_to uuid references public.profiles(id),
  notes text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index customers_assigned_idx on public.customers(assigned_to) where deleted_at is null;

-- ---------- Projects ----------
create table public.project_statuses (
  id serial primary key,
  name text not null unique,
  sort int not null,
  color text not null default '#2D6CDF',
  is_completed boolean not null default false,
  is_cancelled boolean not null default false,
  active boolean not null default true
);
insert into public.project_statuses (name, sort, color, is_completed, is_cancelled) values
 ('Booking',1,'#2D6CDF',false,false),
 ('Documents',2,'#2D6CDF',false,false),
 ('Loan',3,'#7C5CDB',false,false),
 ('Material Dispatch',4,'#F58220',false,false),
 ('Installation',5,'#F58220',false,false),
 ('Net Metering',6,'#FFB81C',false,false),
 ('Subsidy',7,'#FFB81C',false,false),
 ('Completed',8,'#1F9D55',true,false),
 ('On Hold',9,'#6B7A90',false,false),
 ('Cancelled',10,'#6B7A90',false,true);

create sequence public.project_no_seq start 1;
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  project_no text not null unique default ('TP-' || lpad(nextval('public.project_no_seq')::text, 5, '0')),
  customer_id uuid not null references public.customers(id),
  lead_id uuid references public.leads(id),
  capacity_kw numeric(8,2) check (capacity_kw is null or capacity_kw > 0),
  system_type text not null default 'On-grid' check (system_type in ('On-grid','Hybrid','Off-grid')),
  customer_type text not null default 'Residential' check (customer_type in ('Residential','Commercial','Industrial','Agricultural')),
  total_cost numeric(12,2) check (total_cost is null or total_cost >= 0),
  finance_type text not null default 'Cash' check (finance_type in ('Cash','Bank loan')),
  status_id int not null references public.project_statuses(id) default 1,
  status_changed_at timestamptz not null default now(),
  assigned_to uuid references public.profiles(id),      -- salesperson
  installer_names text,                                   -- installers don't log in
  start_date date,
  installed_on date,
  completed_on date,
  panel_brand text,
  panel_wattage int,
  panel_count int,
  inverter_brand text,
  inverter_capacity_kw numeric(8,2),
  inverter_serial text,
  panel_serials text,
  structure_type text,
  battery_details text,
  locked boolean not null default false,
  notes text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index projects_customer_idx on public.projects(customer_id);
create index projects_status_idx on public.projects(status_id) where deleted_at is null;
create index projects_assigned_idx on public.projects(assigned_to) where deleted_at is null;

-- PM Surya Ghar 10 steps, one row per step per project
create table public.project_milestones (
  id bigserial primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  step int not null check (step between 1 and 10),
  status text not null default 'pending' check (status in ('pending','in_progress','done','not_needed')),
  done_on date,
  note text,
  updated_by uuid references public.profiles(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (project_id, step)
);

-- internal stage checklists (template + per-project ticks)
create table public.checklist_stages (
  id serial primary key, name text not null unique, sort int not null, active boolean not null default true
);
create table public.checklist_items (
  id serial primary key,
  stage_id int not null references public.checklist_stages(id),
  text text not null,
  required boolean not null default true,
  sort int not null default 0,
  active boolean not null default true
);
create table public.project_checklist (
  project_id uuid not null references public.projects(id) on delete cascade,
  item_id int not null references public.checklist_items(id),
  done boolean not null default false,
  done_by uuid references public.profiles(id),
  done_at timestamptz,
  note text,
  primary key (project_id, item_id)
);
insert into public.checklist_stages (name, sort) values
 ('Booking & documents',1),('Before installation',2),('Installation',3),('Net metering & DISCOM',4),('After installation',5);
insert into public.checklist_items (stage_id, text, required, sort) values
 (1,'Latest 3 months electricity bills collected',true,1),
 (1,'Aadhaar, PAN and bank passbook collected',true,2),
 (1,'Registered on PM Surya Ghar portal',true,3),
 (1,'Booking amount received',true,4),
 (2,'Site survey done and roof checked',true,1),
 (2,'Shadow checked (morning and evening)',true,2),
 (2,'Inverter and earthing location agreed with customer',true,3),
 (2,'Final system size and price confirmed in writing',true,4),
 (2,'Feasibility approved by DISCOM',true,5),
 (3,'Material checked on arrival (panels, inverter, structure)',true,1),
 (3,'Panel brand and DCR certificate verified',true,2),
 (3,'Inverter serial number recorded',true,3),
 (3,'Structure fixed and levelled',true,4),
 (3,'DC wiring with MC4 connectors',true,5),
 (3,'Earthing done (minimum 2 pits) and lightning arrester',true,6),
 (3,'AC wiring, ACDB/DCDB and MCB installed',true,7),
 (3,'System switched on and generation checked',true,8),
 (4,'Net metering application submitted',true,1),
 (4,'DISCOM inspection done',true,2),
 (4,'Net meter installed',true,3),
 (4,'Commissioning report uploaded on portal',true,4),
 (5,'Installation photos taken',true,1),
 (5,'Customer shown how to use and clean the system',true,2),
 (5,'Customer testimonial video',false,3),
 (5,'Customer added to WhatsApp service group',false,4),
 (5,'Warranty cards and maintenance guide handed over',true,5);

-- ---------- Site surveys (belong to a lead; the project inherits via lead_id) ----------
create table public.site_surveys (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads(id),
  surveyed_at timestamptz,
  surveyor_id uuid references public.profiles(id) default auth.uid(),
  latitude numeric(10,7), longitude numeric(10,7),
  roof_type text, roof_condition text, roof_floor int,
  roof_length_ft numeric(8,2), roof_width_ft numeric(8,2), usable_area_sqft numeric(10,2),
  roof_direction text, shadow_notes text,
  sanctioned_load_kw numeric(8,2), connection_phase text, discom text, consumer_no text,
  meter_location text, inverter_location text, earthing_location text,
  roof_to_meter_m numeric(8,2), structure_type text,
  recommended_kw numeric(8,2),
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Documents & photos ----------
create table public.document_types (
  id serial primary key,
  name text not null unique,
  category text not null default 'other' check (category in ('kyc','electricity','bank','property','loan','survey','installation','portal','other')),
  required boolean not null default false,
  loan_only boolean not null default false,
  sort int not null default 0,
  active boolean not null default true
);
insert into public.document_types (name, category, required, loan_only, sort) values
 ('Aadhaar card','kyc',true,false,1),
 ('PAN card','kyc',true,false,2),
 ('Passport photo','kyc',true,false,3),
 ('Electricity bill','electricity',true,false,4),
 ('Bank passbook / cancelled cheque','bank',true,false,5),
 ('Property paper / roof ownership','property',true,false,6),
 ('Bank statement (6 months)','loan',true,true,7),
 ('Income proof (ITR / salary slip)','loan',true,true,8),
 ('Co-applicant Aadhaar and PAN','loan',false,true,9),
 ('Loan sanction letter','loan',false,true,10),
 ('PM Surya Ghar registration','portal',false,false,11),
 ('Feasibility approval','portal',false,false,12),
 ('Vendor agreement','portal',false,false,13),
 ('DCR certificate','installation',false,false,14),
 ('Net metering agreement','portal',false,false,15),
 ('Commissioning report','portal',false,false,16),
 ('Subsidy e-token / receipt','portal',false,false,17),
 ('Site survey photo','survey',false,false,18),
 ('Installation photo','installation',false,false,19),
 ('Other','other',false,false,20);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id),
  lead_id uuid references public.leads(id),
  doc_type_id int not null references public.document_types(id),
  file_path text not null unique,          -- path inside the 'crm-files' storage bucket
  file_name text not null,
  mime_type text,
  size_bytes int,
  version int not null default 1,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  reject_reason text,
  uploaded_by uuid references public.profiles(id) default auth.uid(),
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (project_id is not null or lead_id is not null)
);
create index documents_project_idx on public.documents(project_id) where deleted_at is null;
create index documents_lead_idx on public.documents(lead_id) where deleted_at is null;

-- ---------- Subsidy & bank loan (one of each per project) ----------
create table public.subsidies (
  project_id uuid primary key references public.projects(id) on delete cascade,
  stage text not null default 'Not applied' check (stage in ('Not applied','Applied','Under review','Approved','Disbursed','Rejected')),
  application_no text,
  expected_amount numeric(12,2),
  applied_on date,
  approved_on date,
  received_amount numeric(12,2),
  received_on date,
  notes text,
  updated_at timestamptz not null default now()
);
create table public.bank_loans (
  project_id uuid primary key references public.projects(id) on delete cascade,
  bank_name text,
  status text not null default 'Not applied' check (status in ('Not applied','Applied','Approved','Disbursed','Rejected')),
  amount_requested numeric(12,2),
  amount_approved numeric(12,2),
  interest_rate numeric(5,2),
  tenure_months int,
  emi numeric(12,2),
  loan_account_no text,
  applied_on date, approved_on date, disbursed_on date,
  notes text,
  updated_at timestamptz not null default now()
);

-- ---------- Visibility helpers ----------
create or replace function public.can_see_project(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects pr where pr.id = p and (pr.deleted_at is null or public.is_owner()) and (
    public.is_staff_admin() or (public.my_role() = 'sales' and (pr.assigned_to = auth.uid() or pr.created_by = auth.uid()))))
$$;
create or replace function public.can_see_lead(l uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.leads x where x.id = l and x.deleted_at is null and (
    public.is_staff_admin() or (public.my_role() = 'sales' and (x.assigned_to = auth.uid() or x.created_by = auth.uid()))))
$$;
create or replace function public.project_locked(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select locked from public.projects where id = p), false)
$$;

-- ---------- Rules ----------
-- new project: create the 10 milestone rows, the checklist rows, subsidy and loan records
create or replace function public.project_init() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_milestones(project_id, step) select new.id, g from generate_series(1,10) g;
  insert into public.project_checklist(project_id, item_id) select new.id, i.id from public.checklist_items i where i.active;
  insert into public.subsidies(project_id) values (new.id);
  insert into public.bank_loans(project_id) values (new.id);
  return new;
end $$;
create trigger project_init after insert on public.projects for each row execute function public.project_init();

-- project guard: lock rules, delete rules, and required details before key stages
create or replace function public.projects_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.app_role := public.my_role(); st public.project_statuses; missing text[] := '{}';
begin
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then return new; end if;
  if tg_op = 'UPDATE' then
    if old.locked and new.locked then
      raise exception 'This project is completed and locked. Only the owner can unlock it to make corrections.';
    end if;
    if old.locked and not new.locked and r is distinct from 'owner' then
      raise exception 'Only the owner can unlock a completed project.';
    end if;
    if new.deleted_at is distinct from old.deleted_at and r is distinct from 'owner' then
      raise exception 'Only the owner can delete or restore projects';
    end if;
    if r = 'sales' and new.assigned_to is distinct from old.assigned_to then
      raise exception 'Only the owner or office manager can reassign projects';
    end if;
  end if;
  if r = 'partner' then raise exception 'Partners cannot change projects'; end if;

  if tg_op = 'INSERT' or new.status_id is distinct from old.status_id then
    new.status_changed_at := now();
    select * into st from public.project_statuses where id = new.status_id;
    if st.sort >= 4 and not st.is_cancelled and st.name <> 'On Hold' then  -- Material Dispatch onwards
      if new.capacity_kw is null then missing := array_append(missing, 'system size (kW)'); end if;
      if new.total_cost is null then missing := array_append(missing, 'total project cost'); end if;
    end if;
    if st.is_completed then
      if new.panel_brand is null or new.panel_count is null then missing := array_append(missing, 'panel brand and count'); end if;
      if new.inverter_brand is null or new.inverter_serial is null then missing := array_append(missing, 'inverter brand and serial number'); end if;
      if new.installed_on is null then missing := array_append(missing, 'installation date'); end if;
      if not exists (select 1 from public.documents d join public.document_types t on t.id = d.doc_type_id
                     where d.project_id = new.id and d.deleted_at is null and t.name = 'Installation photo') then
        missing := array_append(missing, 'at least one installation photo');
      end if;
    end if;
    if array_length(missing, 1) > 0 then
      raise exception 'Before moving to "%", please add: %', st.name, array_to_string(missing, ', ');
    end if;
    if st.is_completed then
      new.locked := true;
      new.completed_on := coalesce(new.completed_on, current_date);
    end if;
  end if;
  return new;
end $$;
create trigger projects_guard before insert or update on public.projects for each row execute function public.projects_guard();

-- child records of a locked project can't change
create or replace function public.child_lock_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.project_id, old.project_id);
begin
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  if pid is not null and public.project_locked(pid) then
    raise exception 'This project is completed and locked. Ask the owner to unlock it to make changes.';
  end if;
  if public.my_role() = 'partner' then raise exception 'Not allowed'; end if;
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['project_milestones','project_checklist','subsidies','bank_loans','documents'] loop
    execute format('create trigger lock_%1$s before insert or update or delete on public.%1$s for each row execute function public.child_lock_guard()', t);
  end loop;
end $$;

-- who ticked a checklist item and when
create or replace function public.checklist_stamp() returns trigger
language plpgsql as $$
begin
  if new.done and not coalesce(old.done, false) then new.done_by := auth.uid(); new.done_at := now(); end if;
  if not new.done then new.done_by := null; new.done_at := null; end if;
  return new;
end $$;
create trigger checklist_stamp before update on public.project_checklist for each row execute function public.checklist_stamp();

create or replace function public.milestone_stamp() returns trigger
language plpgsql as $$
begin
  new.updated_by := auth.uid(); new.updated_at := now();
  if new.status = 'done' and new.done_on is null then new.done_on := current_date; end if;
  return new;
end $$;
create trigger milestone_stamp before update on public.project_milestones for each row execute function public.milestone_stamp();

-- document versions and verification stamps; only owner/office manager verify
create or replace function public.documents_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1 + coalesce((select max(version) from public.documents d
      where d.doc_type_id = new.doc_type_id
        and ((new.project_id is not null and d.project_id = new.project_id) or (new.project_id is null and d.lead_id = new.lead_id))), 0);
    new.status := 'pending'; new.verified_by := null; new.verified_at := null;
  else
    if new.status is distinct from old.status then
      if not public.is_staff_admin() then raise exception 'Only the owner or office manager can verify documents'; end if;
      if new.status = 'rejected' and coalesce(trim(new.reject_reason), '') = '' then raise exception 'Please give a reason for rejecting'; end if;
      new.verified_by := auth.uid(); new.verified_at := now();
    end if;
    if new.deleted_at is distinct from old.deleted_at and not public.is_staff_admin() then
      raise exception 'Only the owner or office manager can remove documents';
    end if;
  end if;
  return new;
end $$;
create trigger documents_guard before insert or update on public.documents for each row execute function public.documents_guard();

create or replace function public.customers_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.deleted_at is distinct from old.deleted_at and not public.is_owner() then
    raise exception 'Only the owner can delete or restore customers';
  end if;
  if public.my_role() = 'partner' then raise exception 'Not allowed'; end if;
  if tg_op = 'UPDATE' and pg_trigger_depth() <= 1 and public.my_role() = 'sales' and new.assigned_to is distinct from old.assigned_to then
    raise exception 'Only the owner or office manager can reassign customers';
  end if;
  if new.whatsapp is null or new.whatsapp = '' then new.whatsapp := new.phone; end if;
  return new;
end $$;
create trigger customers_guard before insert or update on public.customers for each row execute function public.customers_guard();

do $$ declare t text; begin
  foreach t in array array['customers','projects','project_milestones','project_checklist','site_surveys','documents','subsidies','bank_loans','project_statuses','checklist_stages','checklist_items','document_types'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit_trigger()', t);
  end loop;
  foreach t in array array['customers','projects','site_surveys','subsidies','bank_loans'] loop
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------- Convert a lead into a customer + project (one step, all or nothing) ----------
create or replace function public.convert_lead(
  p_lead uuid, p_capacity numeric, p_system_type text, p_total_cost numeric, p_finance text,
  p_father_name text default null, p_consumer_no text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare l public.leads; cid uuid; pid uuid; won int;
begin
  if not public.can_see_lead(p_lead) then raise exception 'You do not have access to this lead'; end if;
  select * into l from public.leads where id = p_lead;
  if exists (select 1 from public.customers where lead_id = p_lead) then
    raise exception 'This lead is already a customer';
  end if;
  insert into public.customers(lead_id, name, father_name, phone, whatsapp, alt_phone, email, address, village, district, pincode, state,
    consumer_no, discom, sanctioned_load_kw, source_id, partner_id, assigned_to, notes)
  values (l.id, l.name, p_father_name, l.phone, l.whatsapp, l.alt_phone, l.email, l.address, l.village, l.district, l.pincode, l.state,
    p_consumer_no, l.discom, l.sanctioned_load_kw, l.source_id, l.partner_id, coalesce(l.assigned_to, auth.uid()), l.notes)
  returning id into cid;
  insert into public.projects(customer_id, lead_id, capacity_kw, system_type, customer_type, total_cost, finance_type, assigned_to, start_date)
  values (cid, l.id, p_capacity, coalesce(p_system_type, 'On-grid'), l.customer_type, p_total_cost, coalesce(p_finance, 'Cash'),
    coalesce(l.assigned_to, auth.uid()), current_date)
  returning id into pid;
  -- carry site-survey photos and lead documents over to the project
  update public.documents set project_id = pid where lead_id = l.id and project_id is null;
  select id into won from public.lead_stages where is_won limit 1;
  update public.leads set stage_id = won where id = l.id and stage_id is distinct from won;
  insert into public.lead_activities(lead_id, type, body) values (l.id, 'system', 'Converted to customer');
  return pid;
end $$;

-- ---------- Row level security ----------
alter table public.customers enable row level security;
alter table public.projects enable row level security;
alter table public.project_statuses enable row level security;
alter table public.project_milestones enable row level security;
alter table public.checklist_stages enable row level security;
alter table public.checklist_items enable row level security;
alter table public.project_checklist enable row level security;
alter table public.site_surveys enable row level security;
alter table public.document_types enable row level security;
alter table public.documents enable row level security;
alter table public.subsidies enable row level security;
alter table public.bank_loans enable row level security;

create policy customers_select on public.customers for select to authenticated using (
  (deleted_at is null or public.is_owner()) and (public.is_staff_admin()
   or (public.my_role() = 'sales' and (assigned_to = auth.uid() or created_by = auth.uid()))));
create policy customers_insert on public.customers for insert to authenticated with check (public.is_staff_admin());
create policy customers_update on public.customers for update to authenticated using (
  public.is_staff_admin() or (public.my_role() = 'sales' and assigned_to = auth.uid())) with check (true);

create policy projects_select on public.projects for select to authenticated using (public.can_see_project(id));
create policy projects_insert on public.projects for insert to authenticated with check (public.is_staff_admin());
create policy projects_update on public.projects for update to authenticated using (public.can_see_project(id)) with check (true);

do $$ declare t text; begin
  foreach t in array array['project_milestones','project_checklist','subsidies','bank_loans'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.can_see_project(project_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.can_see_project(project_id)) with check (true)', t);
  end loop;
end $$;

create policy surveys_select on public.site_surveys for select to authenticated using (public.can_see_lead(lead_id) or exists (select 1 from public.projects p where p.lead_id = site_surveys.lead_id and public.can_see_project(p.id)));
create policy surveys_insert on public.site_surveys for insert to authenticated with check (public.can_see_lead(lead_id));
create policy surveys_update on public.site_surveys for update to authenticated using (public.can_see_lead(lead_id) or exists (select 1 from public.projects p where p.lead_id = site_surveys.lead_id and public.can_see_project(p.id))) with check (true);

create policy documents_select on public.documents for select to authenticated using (
  (deleted_at is null or public.is_staff_admin()) and
  ((project_id is not null and public.can_see_project(project_id)) or (lead_id is not null and public.can_see_lead(lead_id))));
create policy documents_insert on public.documents for insert to authenticated with check (
  (project_id is not null and public.can_see_project(project_id)) or (project_id is null and lead_id is not null and public.can_see_lead(lead_id)));
create policy documents_update on public.documents for update to authenticated using (
  (project_id is not null and public.can_see_project(project_id)) or (lead_id is not null and public.can_see_lead(lead_id))) with check (true);

do $$ declare t text; begin
  foreach t in array array['project_statuses','checklist_stages','checklist_items','document_types'] loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (public.my_role() is not null)', t);
    execute format('create policy %1$s_write on public.%1$s for all to authenticated using (public.is_owner()) with check (public.is_owner())', t);
  end loop;
end $$;

-- partner portal: the referring partner sees the project status (never money) of their referred customer
create or replace function public.partner_project_status(l uuid) returns text
language sql stable security definer set search_path = public as $$
  select ps.name from public.projects p
    join public.project_statuses ps on ps.id = p.status_id
    join public.leads x on x.id = p.lead_id
   where p.lead_id = l and p.deleted_at is null
     and (public.is_staff_admin() or public.can_see_lead(l)
          or (public.my_role() = 'partner' and x.partner_id = public.my_partner_id()))
   order by p.created_at desc limit 1
$$;
create or replace view public.partner_leads with (security_invoker = true) as
  select l.id, l.lead_no, l.name, l.phone, l.village, l.district, l.monthly_bill, l.created_at,
         s.name as stage, s.is_won, s.is_lost, public.partner_project_status(l.id) as project_status
  from public.leads l join public.lead_stages s on s.id = l.stage_id
  where l.deleted_at is null;

-- ---------- File storage: private bucket, paths projects/<project id>/... or leads/<lead id>/... ----------
create or replace function public.can_see_file(path text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := string_to_array(path, '/');
begin
  if array_length(parts, 1) < 3 or parts[2] !~ '^[0-9a-f-]{36}$' then return false; end if;
  if parts[1] = 'projects' then return public.can_see_project(parts[2]::uuid); end if;
  if parts[1] = 'leads' then
    return public.can_see_lead(parts[2]::uuid)
        or exists (select 1 from public.projects p where p.lead_id = parts[2]::uuid and public.can_see_project(p.id));
  end if;
  return false;
end $$;
create or replace function public.can_add_file(path text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := string_to_array(path, '/');
begin
  if not public.can_see_file(path) then return false; end if;
  if parts[1] = 'projects' and public.project_locked(parts[2]::uuid) then return false; end if;
  return true;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crm-files', 'crm-files', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
-- files are never overwritten or deleted from the app: every upload is a new version
create policy crm_files_read on storage.objects for select to authenticated
  using (bucket_id = 'crm-files' and public.can_see_file(name));
create policy crm_files_add on storage.objects for insert to authenticated
  with check (bucket_id = 'crm-files' and public.can_add_file(name));

-- ---------- Function permissions ----------
alter function public.checklist_stamp() set search_path = public;
alter function public.milestone_stamp() set search_path = public;
revoke execute on function public.project_init(), public.projects_guard(), public.child_lock_guard(),
  public.checklist_stamp(), public.milestone_stamp(), public.documents_guard(), public.customers_guard()
  from public, anon, authenticated;
revoke execute on function public.can_see_project(uuid), public.can_see_lead(uuid), public.project_locked(uuid),
  public.partner_project_status(uuid), public.can_see_file(text), public.can_add_file(text),
  public.convert_lead(uuid, numeric, text, numeric, text, text, text) from public, anon;
grant execute on function public.can_see_project(uuid), public.can_see_lead(uuid), public.project_locked(uuid),
  public.partner_project_status(uuid), public.can_see_file(text), public.can_add_file(text),
  public.convert_lead(uuid, numeric, text, numeric, text, text, text) to authenticated;
