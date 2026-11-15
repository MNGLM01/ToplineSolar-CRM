alter function public.touch_updated_at() set search_path = public;
-- trigger functions are never called directly
revoke execute on function public.activity_touch_lead(), public.audit_trigger(), public.handle_new_user(),
  public.leads_guard(), public.leads_timeline(), public.sync_next_followup(), public.touch_updated_at()
  from public, anon, authenticated;
-- RLS helpers: signed-in users only
revoke execute on function public.my_role(), public.my_partner_id(), public.is_staff_admin(), public.is_owner() from public, anon;
grant execute on function public.my_role(), public.my_partner_id(), public.is_staff_admin(), public.is_owner() to authenticated;
