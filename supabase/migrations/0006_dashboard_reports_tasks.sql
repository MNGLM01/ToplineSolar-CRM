-- Topline Solar CRM · Step 4: dashboard figures, reports and tasks.
-- All figures are worked out here so each role only ever receives what it may see.
-- Money figures (revenue, collections, spend, profit, margins) are returned to the Owner only.

-- ---------- Tasks: simple to-dos for staff ----------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  note text,
  due_on date,
  priority text not null default 'normal' check (priority in ('normal','high')),
  assigned_to uuid not null references public.profiles(id),
  lead_id uuid references public.leads(id),
  project_id uuid references public.projects(id),
  status text not null default 'open' check (status in ('open','done')),
  done_at timestamptz,
  done_by uuid references public.profiles(id),
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index tasks_assignee_idx on public.tasks(assigned_to, status, due_on) where deleted_at is null;

create or replace function public.tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.app_role := public.my_role();
begin
  if r is null or r = 'partner' then raise exception 'Not allowed'; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    -- sales executives give tasks to themselves only
    if r = 'sales' and new.assigned_to <> auth.uid() then raise exception 'You can only add tasks for yourself'; end if;
  else
    if new.created_by is distinct from old.created_by then raise exception 'Not allowed'; end if;
    if r = 'sales' and new.assigned_to is distinct from old.assigned_to then raise exception 'Only the owner or office manager can reassign tasks'; end if;
    if new.deleted_at is distinct from old.deleted_at and not (public.is_staff_admin() or old.created_by = auth.uid()) then
      raise exception 'Only the person who added the task can delete it';
    end if;
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.done_at := now(); new.done_by := auth.uid(); end if;
  if new.status = 'open' then new.done_at := null; new.done_by := null; end if;
  return new;
end $$;
create trigger tasks_guard before insert or update on public.tasks for each row execute function public.tasks_guard();
create trigger audit_tasks after insert or update or delete on public.tasks for each row execute function public.audit_trigger();
create trigger touch_tasks before update on public.tasks for each row execute function public.touch_updated_at();

alter table public.tasks enable row level security;
create policy tasks_select on public.tasks for select to authenticated using (
  public.my_role() in ('owner','office_manager','sales') and (deleted_at is null or public.is_owner())
  and (public.is_staff_admin() or assigned_to = auth.uid() or created_by = auth.uid()));
create policy tasks_insert on public.tasks for insert to authenticated with check (public.my_role() in ('owner','office_manager','sales'));
create policy tasks_update on public.tasks for update to authenticated using (
  public.is_staff_admin() or assigned_to = auth.uid() or created_by = auth.uid()) with check (true);

-- ---------- Dashboard: leads and sales team (owner and office manager) ----------
create or replace function public.dashboard_leads(d_from date, d_to date, p_district text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb; t0 timestamptz := d_from::timestamptz; t1 timestamptz := (d_to + 1)::timestamptz;
begin
  if not public.is_staff_admin() then raise exception 'Not allowed'; end if;
  with l as (
    select * from public.leads where deleted_at is null and (p_district is null or district = p_district)
  ), period as (select * from l where created_at >= t0 and created_at < t1)
  select jsonb_build_object(
    'new_leads', (select count(*) from period),
    'won', (select count(*) from l where won_at >= t0 and won_at < t1),
    'won_from_period', (select count(*) from period p join public.lead_stages s on s.id = p.stage_id where s.is_won),
    'lost_from_period', (select count(*) from period p join public.lead_stages s on s.id = p.stage_id where s.is_lost),
    'open_now', (select count(*) from l join public.lead_stages s on s.id = l.stage_id where not s.is_won and not s.is_lost),
    'by_stage', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'color', s.color, 'is_won', s.is_won, 'is_lost', s.is_lost,
                   'count', (select count(*) from period p where p.stage_id = s.id)) order by s.sort), '[]') from public.lead_stages s where s.active or exists (select 1 from period p where p.stage_id = s.id)),
    'by_source', (select coalesce(jsonb_agg(x order by (x->>'count')::int desc), '[]') from (
                   select jsonb_build_object('name', coalesce(src.name, 'Not set'), 'count', count(*),
                     'won', count(*) filter (where st.is_won)) x
                   from period p left join public.lead_sources src on src.id = p.source_id join public.lead_stages st on st.id = p.stage_id
                   group by src.name) q),
    'by_district', (select coalesce(jsonb_agg(x order by (x->>'count')::int desc), '[]') from (
                   select jsonb_build_object('name', coalesce(p.district, 'Not set'), 'count', count(*)) x from period p group by p.district) q),
    'team', (select coalesce(jsonb_agg(x order by (x->>'won')::int desc, (x->>'leads')::int desc), '[]') from (
                   select jsonb_build_object('id', u.id, 'name', u.full_name, 'role', u.role,
                     'leads', (select count(*) from period p where p.assigned_to = u.id),
                     'open', (select count(*) from l join public.lead_stages s on s.id = l.stage_id where l.assigned_to = u.id and not s.is_won and not s.is_lost),
                     'followups_done', (select count(*) from public.followups f where f.owner_id = u.id and f.status = 'done' and f.completed_at >= t0 and f.completed_at < t1),
                     'overdue', (select count(*) from public.followups f join public.leads fl on fl.id = f.lead_id where f.owner_id = u.id and f.status = 'pending' and f.due_at < now() and fl.deleted_at is null),
                     'won', (select count(*) from l where l.assigned_to = u.id and l.won_at >= t0 and l.won_at < t1)) x
                   from public.profiles u where u.active and u.role in ('owner','office_manager','sales')) q),
    'unassigned', (select count(*) from l join public.lead_stages s on s.id = l.stage_id where l.assigned_to is null and not s.is_won and not s.is_lost),
    'overdue_followups', (select count(*) from public.followups f join l on l.id = f.lead_id where f.status = 'pending' and f.due_at < now())
  ) into res;
  return res;
end $$;

-- ---------- Dashboard: projects (owner and office manager) ----------
create or replace function public.dashboard_projects(d_from date, d_to date, p_district text default null, p_stuck_days int default 15)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.is_staff_admin() then raise exception 'Not allowed'; end if;
  with p as (
    select pr.*, c.name as customer_name, c.district, s.name as status, s.color, s.sort, s.is_completed, s.is_cancelled
    from public.projects pr join public.customers c on c.id = pr.customer_id join public.project_statuses s on s.id = pr.status_id
    where pr.deleted_at is null and (p_district is null or c.district = p_district)
  ), cur as (select * from p where not is_completed and not is_cancelled and status <> 'On Hold')
  select jsonb_build_object(
    'current', (select count(*) from cur),
    'current_kw', (select coalesce(sum(capacity_kw), 0) from cur),
    'on_hold', (select count(*) from p where status = 'On Hold'),
    'booked', (select count(*) from p where created_at::date between d_from and d_to),
    'installed', (select count(*) from p where installed_on between d_from and d_to),
    'installed_kw', (select coalesce(sum(capacity_kw), 0) from p where installed_on between d_from and d_to),
    'completed', (select count(*) from p where completed_on between d_from and d_to),
    'installed_this_month', (select count(*) from p where installed_on >= date_trunc('month', current_date)::date),
    'by_status', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'color', s.color,
                    'count', (select count(*) from cur where cur.status_id = s.id)) order by s.sort), '[]')
                  from public.project_statuses s where s.active and not s.is_completed and not s.is_cancelled and s.name <> 'On Hold'),
    'stuck', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'project_no', project_no, 'customer_name', customer_name, 'status', status, 'color', color,
                    'days', (current_date - status_changed_at::date)) order by status_changed_at), '[]')
              from (select * from cur where status_changed_at < now() - make_interval(days => p_stuck_days) order by status_changed_at limit 10) x),
    'stuck_count', (select count(*) from cur where status_changed_at < now() - make_interval(days => p_stuck_days)),
    'docs_pending', (select count(*) from public.documents d where d.deleted_at is null and d.status = 'pending'),
    'subsidy', (select jsonb_build_object(
                  'pending', count(*) filter (where sb.stage in ('Applied','Under review','Approved')),
                  'not_applied', count(*) filter (where sb.stage = 'Not applied' and p.installed_on is not null),
                  'received', count(*) filter (where sb.stage = 'Disbursed' and sb.received_on between d_from and d_to))
                from p join public.subsidies sb on sb.project_id = p.id where not p.is_cancelled),
    'installs_by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
                    'count', (select count(*) from p where date_trunc('month', p.installed_on) = m)) order by m), '[]')
                  from generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') m)
  ) into res;
  return res;
end $$;

-- ---------- Dashboard: money (owner only) ----------
create or replace function public.dashboard_money(d_from date, d_to date, p_district text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.is_owner() then raise exception 'Only the owner can see money figures'; end if;
  with pr as (
    select p.*, c.district from public.projects p join public.customers c on c.id = p.customer_id
    join public.project_statuses s on s.id = p.status_id
    where p.deleted_at is null and not s.is_cancelled and (p_district is null or c.district = p_district)
  ), t as (
    select x.* from public.transactions x left join pr on pr.id = x.project_id
    where x.deleted_at is null and (p_district is null or pr.id is not null)
  ), spend as (
    select project_id, sum(amount) amt from t where direction = 'out' and project_id is not null group by project_id
  ), rec as (
    select project_id, sum(amount) amt from t where direction = 'in' and project_id is not null group by project_id
  )
  select jsonb_build_object(
    'sales_booked', (select coalesce(sum(total_cost), 0) from pr where created_at::date between d_from and d_to),
    'sales_booked_kw', (select coalesce(sum(capacity_kw), 0) from pr where created_at::date between d_from and d_to),
    'collections', (select coalesce(sum(amount), 0) from t where direction = 'in' and txn_date between d_from and d_to),
    'project_spend', (select coalesce(sum(amount), 0) from t where kind in ('labour','vendor') and txn_date between d_from and d_to),
    'office_expenses', (select coalesce(sum(amount), 0) from t where kind = 'office_expense' and txn_date between d_from and d_to),
    'commissions_paid', (select coalesce(sum(amount), 0) from t where kind = 'commission' and txn_date between d_from and d_to),
    'other_out', (select coalesce(sum(amount), 0) from t where kind = 'other_out' and txn_date between d_from and d_to),
    'money_out', (select coalesce(sum(amount), 0) from t where direction = 'out' and txn_date between d_from and d_to),
    -- profit on projects installed in the period: project value minus what was spent on them
    'installed_value', (select coalesce(sum(pr.total_cost), 0) from pr where installed_on between d_from and d_to),
    'installed_spend', (select coalesce(sum(sp.amt), 0) from pr join spend sp on sp.project_id = pr.id where installed_on between d_from and d_to),
    'pending_dues', (select coalesce(sum(greatest(coalesce(pr.total_cost, 0) - coalesce(r.amt, 0), 0)), 0) from pr left join rec r on r.project_id = pr.id),
    'subsidy_pending_amount', (select coalesce(sum(sb.expected_amount), 0) from pr join public.subsidies sb on sb.project_id = pr.id where sb.stage in ('Applied','Under review','Approved')),
    'commissions_due', (select coalesce(sum(cm.amount), 0) - coalesce((select sum(amount) from t where kind = 'commission'), 0) from public.commissions cm join pr on pr.id = cm.project_id),
    'by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
                   'in', (select coalesce(sum(amount), 0) from t where direction = 'in' and date_trunc('month', txn_date) = m),
                   'out', (select coalesce(sum(amount), 0) from t where direction = 'out' and date_trunc('month', txn_date) = m),
                   'booked', (select coalesce(sum(total_cost), 0) from pr where date_trunc('month', created_at) = m)) order by m), '[]')
                 from generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') m)
  ) into res;
  return res;
end $$;

-- ---------- Reports (owner only): money per project ----------
create or replace function public.report_project_money(d_from date, d_to date)
returns table (project_id uuid, project_no text, customer_name text, district text, salesperson text, status text, capacity_kw numeric,
               booked_on date, installed_on date, total_cost numeric, received numeric, pending numeric,
               labour numeric, vendor numeric, commission numeric, other_spend numeric, spent numeric, profit numeric, margin_pct numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can see money reports'; end if;
  return query
  select p.id, p.project_no, c.name, c.district, u.full_name, s.name, p.capacity_kw, p.created_at::date, p.installed_on, p.total_cost,
         coalesce(x.rec, 0), greatest(coalesce(p.total_cost, 0) - coalesce(x.rec, 0), 0),
         coalesce(x.lab, 0), coalesce(x.ven, 0), coalesce(x.com, 0), coalesce(x.outall, 0) - coalesce(x.lab, 0) - coalesce(x.ven, 0) - coalesce(x.com, 0),
         coalesce(x.outall, 0),
         coalesce(p.total_cost, 0) - coalesce(x.outall, 0),
         case when coalesce(p.total_cost, 0) > 0 then round((p.total_cost - coalesce(x.outall, 0)) * 100 / p.total_cost, 1) end
  from public.projects p
  join public.customers c on c.id = p.customer_id
  join public.project_statuses s on s.id = p.status_id
  left join public.profiles u on u.id = p.assigned_to
  left join lateral (select sum(amount) filter (where direction = 'in') rec, sum(amount) filter (where kind = 'labour') lab,
                            sum(amount) filter (where kind = 'vendor') ven, sum(amount) filter (where kind = 'commission') com,
                            sum(amount) filter (where direction = 'out') outall
                     from public.transactions t where t.project_id = p.id and t.deleted_at is null) x on true
  where p.deleted_at is null and p.created_at::date between d_from and d_to
  order by p.created_at;
end $$;

-- ---------- Storage used (owner only), for the free-plan 1 GB limit ----------
create or replace function public.storage_used()
returns table (files bigint, bytes bigint)
language plpgsql stable security definer set search_path = public, storage as $$
begin
  if not public.is_owner() then raise exception 'Not allowed'; end if;
  return query select count(*), coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint from storage.objects o where o.bucket_id = 'crm-files';
end $$;

-- ---------- Login fix (also in 0005): new users get the role saved in app_metadata ----------
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
drop trigger if exists on_auth_user_role on auth.users;
create trigger on_auth_user_role after update of raw_app_meta_data on auth.users
  for each row execute function public.sync_user_role();

-- ---------- Function permissions ----------
revoke execute on function public.tasks_guard(), public.sync_user_role() from public, anon, authenticated;
revoke execute on function public.dashboard_leads(date, date, text), public.dashboard_projects(date, date, text, int),
  public.dashboard_money(date, date, text), public.report_project_money(date, date), public.storage_used() from public, anon;
grant execute on function public.dashboard_leads(date, date, text), public.dashboard_projects(date, date, text, int),
  public.dashboard_money(date, date, text), public.report_project_money(date, date), public.storage_used() to authenticated;
