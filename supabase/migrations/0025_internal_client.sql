-- Safari Digital's own business can be a "client" in the portal (its own inquiries, ads, traffic),
-- marked internal so it's left out of client counts, income and invoices.
alter table public.clients add column if not exists is_internal boolean not null default false;

-- Follow-ups: an "agency" template (for Safari Digital selling to tour operators).
alter table public.followup_settings drop constraint if exists followup_settings_template;
alter table public.followup_settings add constraint followup_settings_template
  check (template in ('standard', 'gentle', 'persistent', 'blank', 'agency'));

create or replace function public.set_followups(p_client_id uuid, p_enabled boolean, p_template text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_admin() or p_client_id = public.my_client_id()) then
    raise exception 'Not allowed';
  end if;
  if p_template not in ('standard', 'gentle', 'persistent', 'blank', 'agency') then
    raise exception 'Unknown template';
  end if;
  insert into public.followup_settings (client_id, enabled, template, enabled_at)
  values (p_client_id, p_enabled, p_template, case when p_enabled then now() end)
  on conflict (client_id) do update
     set enabled = excluded.enabled,
         template = excluded.template,
         enabled_at = case when excluded.enabled and not public.followup_settings.enabled then now()
                           else public.followup_settings.enabled_at end,
         updated_at = now();
end;
$$;
