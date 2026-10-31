-- Follow-ups: an "Empty" template (no Safari Digital follow-ups), and readable tags.
-- {name} → [First name], {trip} → [Trip], {company} → [Company name] in saved follow-ups.
-- (The sender understands both, so this only changes what clients see.)

alter table public.followup_settings drop constraint if exists followup_settings_template;
alter table public.followup_settings add constraint followup_settings_template
  check (template in ('standard', 'gentle', 'persistent', 'blank'));

create or replace function public.set_followups(p_client_id uuid, p_enabled boolean, p_template text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_admin() or p_client_id = public.my_client_id()) then
    raise exception 'Not allowed';
  end if;
  if p_template not in ('standard', 'gentle', 'persistent', 'blank') then
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

update public.followup_rules
   set subject = replace(replace(replace(subject, '{name}', '[First name]'), '{trip}', '[Trip]'), '{company}', '[Company name]'),
       body    = replace(replace(replace(body,    '{name}', '[First name]'), '{trip}', '[Trip]'), '{company}', '[Company name]')
 where subject ~ '\{(name|trip|company)\}' or body ~ '\{(name|trip|company)\}';
