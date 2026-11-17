-- Fix: "You don't have permission to do that" when saving a money entry or making a quotation.
-- The read rules for transactions, quotations and projects looked the row up again by its id
-- (can_see_txn(id) etc.). While a row is being inserted that lookup can't see it yet, so the
-- app's "save and give me back the new row" failed for every role, the owner included.
-- The rules below check the row's own columns instead. Who can see what is unchanged.

drop policy transactions_select on public.transactions;
drop policy transactions_update on public.transactions;
create policy transactions_select on public.transactions for select to authenticated using (
  (deleted_at is null or public.is_owner()) and (
    public.is_owner()
    or (public.my_role() = 'office_manager' and ((direction = 'in' and project_id is not null) or created_by = auth.uid()))
    or (public.my_role() = 'partner' and kind = 'commission' and partner_id = public.my_partner_id())));
create policy transactions_update on public.transactions for update to authenticated using (
  (deleted_at is null or public.is_owner()) and (
    public.is_owner()
    or (public.my_role() = 'office_manager' and ((direction = 'in' and project_id is not null) or created_by = auth.uid())))) with check (true);

drop policy quotations_select on public.quotations;
drop policy quotations_update on public.quotations;
create policy quotations_select on public.quotations for select to authenticated using (
  (deleted_at is null or public.is_owner()) and (
    public.can_see_lead(lead_id)
    or (project_id is not null and public.can_see_project(project_id))
    or exists (select 1 from public.projects p where p.lead_id = quotations.lead_id and public.can_see_project(p.id))));
create policy quotations_update on public.quotations for update to authenticated using (
  (deleted_at is null or public.is_owner()) and (
    public.can_see_lead(lead_id)
    or (project_id is not null and public.can_see_project(project_id))
    or exists (select 1 from public.projects p where p.lead_id = quotations.lead_id and public.can_see_project(p.id)))) with check (true);

drop policy projects_select on public.projects;
drop policy projects_update on public.projects;
create policy projects_select on public.projects for select to authenticated using (
  (deleted_at is null or public.is_owner()) and (
    public.is_staff_admin() or (public.my_role() = 'sales' and (assigned_to = auth.uid() or created_by = auth.uid()))));
create policy projects_update on public.projects for update to authenticated using (
  (deleted_at is null or public.is_owner()) and (
    public.is_staff_admin() or (public.my_role() = 'sales' and (assigned_to = auth.uid() or created_by = auth.uid())))) with check (true);
