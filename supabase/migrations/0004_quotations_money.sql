-- Topline Solar CRM · Step 3: price list, quotations (with versions), money in/out,
-- office expenses, referral commissions. Revenue, spend and profit are visible to the Owner only.

-- ---------- Price list ----------
create table public.price_items (
  id serial primary key,
  category text not null check (category in ('Panel','Inverter','Structure','Cables & BOS','Battery','Installation','Net metering','Other')),
  name text not null check (length(trim(name)) > 0),
  description text,
  unit text not null default 'pcs',
  rate numeric(12,2) not null check (rate >= 0),
  gst_rate numeric(5,2) not null default 5 check (gst_rate >= 0 and gst_rate <= 28),
  watt int,                         -- panels: watt per panel
  capacity_kw numeric(8,2),         -- inverters: size in kW
  per_kw boolean not null default false,  -- quantity follows the system size (e.g. structure, installation per kW)
  sort int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.price_items (category, name, description, unit, rate, gst_rate, watt, capacity_kw, per_kw, sort) values
 ('Panel','Waaree 545 Wp Mono PERC (DCR)','Bifacial, DCR certified, 25-year performance warranty','pcs',15000,5,545,null,false,1),
 ('Panel','Adani 540 Wp Mono PERC (DCR)','DCR certified, 25-year performance warranty','pcs',14800,5,540,null,false,2),
 ('Inverter','Growatt 3 kW on-grid inverter','Single phase, WiFi monitoring, 10-year warranty','pcs',28000,5,null,3,false,10),
 ('Inverter','Growatt 5 kW on-grid inverter','Single phase, WiFi monitoring, 10-year warranty','pcs',42000,5,null,5,false,11),
 ('Inverter','Growatt 10 kW on-grid inverter','Three phase, WiFi monitoring, 10-year warranty','pcs',75000,5,null,10,false,12),
 ('Inverter','Deye 5 kW hybrid inverter','Battery-ready, single phase','pcs',95000,5,null,5,false,13),
 ('Structure','Elevated GI mounting structure','Hot-dip galvanised, wind-load rated','kW',7000,5,null,null,true,20),
 ('Cables & BOS','DC cable 4 sq mm (copper)','Solar grade, UV resistant','m',85,5,null,null,false,30),
 ('Cables & BOS','AC cable 6 sq mm (copper)',null,'m',120,5,null,null,false,31),
 ('Cables & BOS','ACDB + DCDB with SPD and MCB',null,'set',6500,5,null,null,false,32),
 ('Cables & BOS','Earthing kit (2 pits) + lightning arrester',null,'set',6000,5,null,null,false,33),
 ('Battery','150 Ah lithium battery',null,'pcs',38000,5,null,null,false,40),
 ('Installation','Installation and commissioning',null,'kW',3000,18,null,null,true,50),
 ('Installation','Transport and handling',null,'lot',2000,18,null,null,false,51),
 ('Net metering','Net meter and DISCOM charges','Paid to the DISCOM on the customer''s behalf','lot',5000,0,null,null,false,60);

-- ---------- Quotations ----------
create sequence public.quote_no_seq start 1;
create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  quote_no text not null default ('TQ-' || lpad(nextval('public.quote_no_seq')::text, 5, '0')),  -- same number across revisions
  version int not null default 1,
  lead_id uuid not null references public.leads(id),
  project_id uuid references public.projects(id),
  status text not null default 'Draft' check (status in ('Draft','Sent','Accepted','Rejected')),
  customer_name text not null,
  customer_phone text,
  customer_address text,
  capacity_kw numeric(8,2) not null check (capacity_kw > 0),
  system_type text not null default 'On-grid' check (system_type in ('On-grid','Hybrid','Off-grid')),
  customer_type text not null default 'Residential',
  items jsonb not null default '[]',            -- [{item_id, category, name, description, unit, qty, rate, discount_pct, gst_rate}]
  extra_discount numeric(12,2) not null default 0 check (extra_discount >= 0),
  subtotal numeric(12,2) not null default 0,    -- after line discounts, before GST
  gst_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,       -- what the customer pays Topline Solar
  subsidy numeric(12,2) not null default 0,     -- expected PM Surya Ghar subsidy (paid to the customer)
  monthly_bill numeric(12,2),
  include_loan boolean not null default false,
  loan_amount numeric(12,2), loan_rate numeric(5,2), loan_months int,
  valid_until date,
  payment_terms text,
  notes text,
  pdf_path text,
  sent_at timestamptz,
  decided_at timestamptz,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (quote_no, version)
);
create index quotations_lead_idx on public.quotations(lead_id) where deleted_at is null;
create index quotations_project_idx on public.quotations(project_id) where deleted_at is null;

-- ---------- Money ----------
create table public.expense_categories (
  id serial primary key, name text not null unique, sort int not null default 0, active boolean not null default true
);
insert into public.expense_categories (name, sort) values
 ('Rent',1),('Salaries',2),('Fuel and travel',3),('Electricity',4),('Phone and internet',5),('Office supplies',6),('Marketing',7),('Repairs',8),('Other',9);

create sequence public.txn_no_seq start 1;
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  txn_no text not null unique default ('TM-' || lpad(nextval('public.txn_no_seq')::text, 5, '0')),
  kind text not null check (kind in ('customer_payment','loan_disbursal','other_in','labour','vendor','commission','office_expense','other_out')),
  direction text not null generated always as (case when kind in ('customer_payment','loan_disbursal','other_in') then 'in' else 'out' end) stored,
  amount numeric(12,2) not null check (amount > 0),
  txn_date date not null default current_date,
  mode text not null default 'Cash' check (mode in ('Cash','UPI','Bank transfer','Cheque')),
  project_id uuid references public.projects(id),
  partner_id uuid references public.partners(id),
  category_id int references public.expense_categories(id),
  paid_to text,                 -- labour / vendor name
  reference text,               -- UTR, cheque number
  note text,
  receipt_path text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (kind not in ('customer_payment','loan_disbursal') or project_id is not null),
  check (kind <> 'commission' or partner_id is not null),
  check (kind <> 'office_expense' or category_id is not null)
);
create index transactions_project_idx on public.transactions(project_id) where deleted_at is null;
create index transactions_date_idx on public.transactions(txn_date) where deleted_at is null;

-- ---------- Referral commissions ----------
create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id),
  project_id uuid not null unique references public.projects(id),
  amount numeric(12,2) not null check (amount >= 0),
  basis text not null,           -- how it was worked out, e.g. "3 kW × ₹1,500"
  earned_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values
 ('commission', '{"earn_at_status": "Net Metering"}'),
 ('company', jsonb_build_object(
   'name', 'Topline Solar', 'tagline', 'Trusted Solar Partner in North Bihar', 'address', 'Purnea, Bihar',
   'phones', '+91 74628 55050, +91 82101 55294', 'email', '', 'gstin', '', 'website', '',
   'bank_name', '', 'bank_account_name', 'Topline Solar', 'bank_account_no', '', 'bank_ifsc', '', 'upi_id', '',
   'quote_valid_days', 15,
   'payment_terms', E'40% advance at booking\n50% before material dispatch\n10% after installation and commissioning',
   'quote_terms', E'Prices include supply, installation and commissioning as listed.\nPM Surya Ghar subsidy is paid by the government directly to the customer''s bank account after commissioning; eligibility and timing are decided by the government.\nNet metering is subject to DISCOM approval and inspection.\nPanels: 25-year performance warranty. Inverter: as per manufacturer warranty.\nAny civil work, extra cable beyond the quoted length or structure changes will be charged separately.'))
-- keep anything already saved (the company row exists since step 1); add the new fields
on conflict (key) do update set value = excluded.value || public.app_settings.value;

-- ---------- Helpers ----------
create or replace function public.can_see_quote(q uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.quotations x where x.id = q and (x.deleted_at is null or public.is_owner())
    and (public.can_see_lead(x.lead_id) or (x.project_id is not null and public.can_see_project(x.project_id))
         or exists (select 1 from public.projects p where p.lead_id = x.lead_id and public.can_see_project(p.id))))
$$;
create or replace function public.can_see_txn(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.transactions x where x.id = t and (x.deleted_at is null or public.is_owner()) and (
    public.is_owner()
    or (public.my_role() = 'office_manager' and (x.direction = 'in' and x.project_id is not null or x.created_by = auth.uid()))
    or (public.my_role() = 'partner' and x.kind = 'commission' and x.partner_id = public.my_partner_id())))
$$;

-- recompute quotation totals from its items (never trust totals sent by the browser)
create or replace function public.quotations_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare it jsonb; line numeric; sub numeric := 0; gst numeric := 0; ratio numeric;
begin
  if public.my_role() = 'partner' then raise exception 'Not allowed'; end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'Draft' and (new.items is distinct from old.items or new.extra_discount is distinct from old.extra_discount
        or new.capacity_kw is distinct from old.capacity_kw or new.subsidy is distinct from old.subsidy) then
      raise exception 'This quotation has been sent. Make a revision (new version) to change it.';
    end if;
    if new.deleted_at is distinct from old.deleted_at and not public.is_owner() then
      raise exception 'Only the owner can delete quotations';
    end if;
    if new.status is distinct from old.status then
      if new.status = 'Sent' and new.sent_at is null then new.sent_at := now(); end if;
      if new.status in ('Accepted','Rejected') then new.decided_at := now(); end if;
    end if;
  end if;
  for it in select * from jsonb_array_elements(new.items) loop
    line := round(coalesce((it->>'qty')::numeric, 0) * coalesce((it->>'rate')::numeric, 0) * (1 - coalesce((it->>'discount_pct')::numeric, 0) / 100), 2);
    sub := sub + line;
    gst := gst + round(line * coalesce((it->>'gst_rate')::numeric, 0) / 100, 2);
  end loop;
  if new.extra_discount > sub then raise exception 'Discount is more than the quotation amount'; end if;
  -- extra discount reduces each line in proportion, so GST is reduced in the same proportion
  ratio := case when sub > 0 then (sub - new.extra_discount) / sub else 1 end;
  new.subtotal := round(sub - new.extra_discount, 2);
  new.gst_amount := round(gst * ratio, 2);
  new.total := new.subtotal + new.gst_amount;
  return new;
end $$;
create trigger quotations_guard before insert or update on public.quotations for each row execute function public.quotations_guard();

-- new quotation number, or next version of an existing one (copies everything, status back to Draft)
create or replace function public.revise_quotation(q uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare src public.quotations; nid uuid;
begin
  if not public.can_see_quote(q) then raise exception 'You do not have access to this quotation'; end if;
  select * into src from public.quotations where id = q;
  insert into public.quotations(quote_no, version, lead_id, project_id, customer_name, customer_phone, customer_address, capacity_kw, system_type,
    customer_type, items, extra_discount, subsidy, monthly_bill, include_loan, loan_amount, loan_rate, loan_months, valid_until, payment_terms, notes)
  values (src.quote_no, (select max(version) + 1 from public.quotations where quote_no = src.quote_no), src.lead_id, src.project_id, src.customer_name,
    src.customer_phone, src.customer_address, src.capacity_kw, src.system_type, src.customer_type, src.items, src.extra_discount, src.subsidy,
    src.monthly_bill, src.include_loan, src.loan_amount, src.loan_rate, src.loan_months, null, src.payment_terms, src.notes)
  returning id into nid;
  return nid;
end $$;

create or replace function public.transactions_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.app_role := public.my_role();
begin
  if r is null or r in ('sales','partner') then raise exception 'Only the owner or office manager can record money'; end if;
  if tg_op = 'UPDATE' then
    if new.deleted_at is distinct from old.deleted_at and r <> 'owner' then raise exception 'Only the owner can delete money entries'; end if;
    if r = 'office_manager' and old.created_by is distinct from auth.uid() then raise exception 'You can only correct entries you recorded'; end if;
    if r = 'office_manager' and old.created_at < now() - interval '2 days' then raise exception 'Entries older than 2 days can only be corrected by the owner'; end if;
    if new.created_by is distinct from old.created_by then raise exception 'Not allowed'; end if;
  else
    new.created_by := auth.uid();
  end if;
  return new;
end $$;
create trigger transactions_guard before insert or update on public.transactions for each row execute function public.transactions_guard();

-- commission rule → amount
create or replace function public.commission_for(p public.projects, pa public.partners, out amount numeric, out basis text)
language plpgsql stable set search_path = public as $$
begin
  if pa.commission_type = 'per_kw' then
    amount := round(coalesce(p.capacity_kw, 0) * pa.commission_value, 2);
    basis := trim_scale(coalesce(p.capacity_kw, 0))::text || ' kW × ₹' || trim_scale(pa.commission_value)::text || ' per kW';
  elsif pa.commission_type = 'per_installation' then
    amount := pa.commission_value; basis := 'Fixed per installation';
  else
    amount := round(coalesce(p.total_cost, 0) * pa.commission_value / 100, 2);
    basis := trim_scale(pa.commission_value)::text || '% of ₹' || trim_scale(coalesce(p.total_cost, 0))::text;
  end if;
end $$;

-- a partner's commission becomes "earned" when their referred project reaches the chosen status
create or replace function public.projects_commission() returns trigger
language plpgsql security definer set search_path = public as $$
declare trig_name text; trig_sort int; st public.project_statuses; pa public.partners; c record; pid uuid;
begin
  if new.status_id is not distinct from old.status_id then return new; end if;
  select partner_id into pid from public.customers where id = new.customer_id;
  if pid is null then return new; end if;
  select * into st from public.project_statuses where id = new.status_id;
  if st.is_cancelled or st.name = 'On Hold' then return new; end if;
  trig_name := coalesce((select value->>'earn_at_status' from public.app_settings where key = 'commission'), 'Net Metering');
  select sort into trig_sort from public.project_statuses where name = trig_name;
  if st.sort < coalesce(trig_sort, 6) then return new; end if;
  if exists (select 1 from public.commissions where project_id = new.id) then return new; end if;
  select * into pa from public.partners where id = pid;
  c := public.commission_for(new, pa);
  insert into public.commissions(partner_id, project_id, amount, basis) values (pid, new.id, c.amount, c.basis);
  return new;
end $$;
create trigger projects_commission after update on public.projects for each row execute function public.projects_commission();

create or replace function public.commissions_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;   -- created by the project trigger
  if not public.is_owner() then raise exception 'Only the owner can change commissions'; end if;
  return coalesce(new, old);
end $$;
create trigger commissions_guard before insert or update or delete on public.commissions for each row execute function public.commissions_guard();

-- ---------- Money summaries (computed on the server so totals never reach the wrong role) ----------
-- one project: cost, received, pending for owner/office manager; spent and profit for the owner only
create or replace function public.project_money(p uuid)
returns table (total_cost numeric, received numeric, pending numeric, spent numeric, profit numeric, last_payment date)
language plpgsql stable security definer set search_path = public as $$
declare cost numeric; rec numeric; sp numeric; lastp date;
begin
  if not (public.is_staff_admin() and public.can_see_project(p)) then raise exception 'Not allowed'; end if;
  select pr.total_cost into cost from public.projects pr where pr.id = p;
  select coalesce(sum(amount) filter (where direction = 'in'), 0), coalesce(sum(amount) filter (where direction = 'out'), 0),
         max(txn_date) filter (where direction = 'in')
    into rec, sp, lastp from public.transactions where project_id = p and deleted_at is null;
  return query select cost, rec, greatest(coalesce(cost, 0) - rec, 0),
    case when public.is_owner() then sp end, case when public.is_owner() then rec - sp end, lastp;
end $$;

-- who owes how much and for how long (owner and office manager)
create or replace function public.dues_list()
returns table (project_id uuid, project_no text, customer_name text, phone text, village text, status text, total_cost numeric,
               received numeric, pending numeric, last_payment date, start_date date, locked boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.project_no, c.name, c.phone, c.village, s.name, p.total_cost,
         coalesce(t.rec, 0), greatest(coalesce(p.total_cost, 0) - coalesce(t.rec, 0), 0), t.lastp, p.start_date, p.locked
  from public.projects p
  join public.customers c on c.id = p.customer_id
  join public.project_statuses s on s.id = p.status_id
  left join lateral (select sum(amount) rec, max(txn_date) lastp from public.transactions x
                     where x.project_id = p.id and x.direction = 'in' and x.deleted_at is null) t on true
  where public.is_staff_admin() and p.deleted_at is null and not s.is_cancelled
    and coalesce(p.total_cost, 0) - coalesce(t.rec, 0) > 0
  order by coalesce(t.lastp, p.start_date, p.created_at::date)
$$;

-- company totals for a period: owner only
create or replace function public.money_summary(d_from date, d_to date)
returns table (money_in numeric, money_out numeric, customer_payments numeric, project_spend numeric, office_expenses numeric,
               commissions_paid numeric, net numeric, pending_dues numeric, commissions_unpaid numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can see company totals'; end if;
  return query
  select coalesce(sum(amount) filter (where direction = 'in'), 0),
         coalesce(sum(amount) filter (where direction = 'out'), 0),
         coalesce(sum(amount) filter (where kind in ('customer_payment','loan_disbursal')), 0),
         coalesce(sum(amount) filter (where kind in ('labour','vendor')), 0),
         coalesce(sum(amount) filter (where kind = 'office_expense'), 0),
         coalesce(sum(amount) filter (where kind = 'commission'), 0),
         coalesce(sum(amount) filter (where direction = 'in'), 0) - coalesce(sum(amount) filter (where direction = 'out'), 0),
         (select coalesce(sum(d.pending), 0) from public.dues_list() d),
         (select coalesce(sum(cm.amount), 0) - coalesce((select sum(amount) from public.transactions where kind = 'commission' and deleted_at is null), 0) from public.commissions cm)
  from public.transactions where deleted_at is null and txn_date between d_from and d_to;
end $$;

-- commissions with paid / pending, for owner, office manager and the partner themselves
create or replace function public.commission_list()
returns table (id uuid, partner_id uuid, partner_name text, project_id uuid, project_no text, customer_name text, capacity_kw numeric,
               amount numeric, basis text, earned_at timestamptz, paid numeric, pending numeric)
language sql stable security definer set search_path = public as $$
  select cm.id, cm.partner_id, pa.name, cm.project_id, p.project_no, c.name, p.capacity_kw, cm.amount, cm.basis, cm.earned_at,
         coalesce(t.paid, 0), greatest(cm.amount - coalesce(t.paid, 0), 0)
  from public.commissions cm
  join public.partners pa on pa.id = cm.partner_id
  join public.projects p on p.id = cm.project_id
  join public.customers c on c.id = p.customer_id
  left join lateral (select sum(amount) paid from public.transactions x where x.kind = 'commission' and x.project_id = cm.project_id
                     and x.partner_id = cm.partner_id and x.deleted_at is null) t on true
  where public.is_staff_admin() or (public.my_role() = 'partner' and cm.partner_id = public.my_partner_id())
  order by cm.earned_at desc
$$;

-- ---------- Storage: quotations and money receipts ----------
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
  if parts[1] = 'quotes' then return public.can_see_quote(parts[2]::uuid); end if;
  if parts[1] = 'money' then return public.can_see_txn(parts[2]::uuid); end if;
  return false;
end $$;
-- files are added by people who can see the record; quotation PDFs may be replaced while regenerating
create policy crm_files_update on storage.objects for update to authenticated
  using (bucket_id = 'crm-files' and name like 'quotes/%' and public.can_see_file(name))
  with check (bucket_id = 'crm-files' and name like 'quotes/%' and public.can_see_file(name));

-- ---------- Triggers: audit, updated_at ----------
do $$ declare t text; begin
  foreach t in array array['price_items','quotations','expense_categories','transactions','commissions'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit_trigger()', t);
  end loop;
  foreach t in array array['price_items','quotations','transactions','commissions'] loop
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------- Row level security ----------
alter table public.price_items enable row level security;
alter table public.quotations enable row level security;
alter table public.expense_categories enable row level security;
alter table public.transactions enable row level security;
alter table public.commissions enable row level security;

create policy price_items_read on public.price_items for select to authenticated using (public.my_role() in ('owner','office_manager','sales'));
create policy price_items_write on public.price_items for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy quotations_select on public.quotations for select to authenticated using (public.can_see_quote(id));
create policy quotations_insert on public.quotations for insert to authenticated with check (public.can_see_lead(lead_id) or public.is_staff_admin());
create policy quotations_update on public.quotations for update to authenticated using (public.can_see_quote(id)) with check (true);

create policy expense_categories_read on public.expense_categories for select to authenticated using (public.is_staff_admin());
create policy expense_categories_write on public.expense_categories for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy transactions_select on public.transactions for select to authenticated using (public.can_see_txn(id));
create policy transactions_insert on public.transactions for insert to authenticated with check (public.is_staff_admin());
create policy transactions_update on public.transactions for update to authenticated using (public.can_see_txn(id) and public.is_staff_admin()) with check (true);

create policy commissions_select on public.commissions for select to authenticated using (
  public.is_staff_admin() or (public.my_role() = 'partner' and partner_id = public.my_partner_id()));
create policy commissions_owner on public.commissions for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- ---------- Function permissions ----------
revoke execute on function public.quotations_guard(), public.transactions_guard(), public.projects_commission(), public.commissions_guard()
  from public, anon, authenticated;
revoke execute on function public.can_see_quote(uuid), public.can_see_txn(uuid), public.revise_quotation(uuid),
  public.commission_for(public.projects, public.partners), public.project_money(uuid), public.dues_list(), public.money_summary(date, date),
  public.commission_list() from public, anon;
grant execute on function public.can_see_quote(uuid), public.can_see_txn(uuid), public.revise_quotation(uuid),
  public.project_money(uuid), public.dues_list(), public.money_summary(date, date), public.commission_list() to authenticated;
