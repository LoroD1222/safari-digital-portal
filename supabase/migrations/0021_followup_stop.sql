-- Stop (or restart) automatic follow-ups for one guest, from the inquiry panel.
create or replace function public.set_inquiry_followups(inquiry_id uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.inquiries
     set followups_stopped_at = case when p_on then null else coalesce(followups_stopped_at, now()) end
   where id = inquiry_id
     and (public.is_admin() or client_id = public.my_client_id());
  if not found then
    raise exception 'Inquiry not found';
  end if;
end;
$$;
revoke execute on function public.set_inquiry_followups(uuid, boolean) from public, anon;
grant execute on function public.set_inquiry_followups(uuid, boolean) to authenticated;
