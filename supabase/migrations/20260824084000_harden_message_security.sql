-- Ciphra security hardening.
-- One-time prekeys are claimed atomically and only within an active conversation.

create or replace function public.claim_one_time_prekey(
  _device_id uuid,
  _consumer_device_id uuid,
  _conversation_id uuid
)
returns table(prekey_id integer, public_key text)
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.device_prekeys%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1 from public.devices d
    where d.id = _consumer_device_id
      and d.user_id = auth.uid()
      and d.status = 'active'
  ) then
    raise exception 'consumer device is not owned by the authenticated user';
  end if;

  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = _conversation_id
      and cm.user_id = auth.uid()
      and cm.removed_at is null
  ) then
    raise exception 'caller is not an active conversation member';
  end if;

  select p.* into claimed
  from public.device_prekeys p
  join public.devices d on d.id = p.device_id
  join public.conversation_members cm on cm.user_id = d.user_id
  where p.device_id = _device_id
    and p.consumed_at is null
    and d.status = 'active'
    and cm.conversation_id = _conversation_id
    and cm.removed_at is null
  order by p.prekey_id
  for update
  skip locked
  limit 1;

  if not found then return; end if;

  update public.device_prekeys
  set consumed_at = now(), consumed_by_device = _consumer_device_id
  where id = claimed.id;

  return query select claimed.prekey_id, claimed.public_key;
end;
$$;

drop function if exists public.claim_one_time_prekey(uuid, uuid);
revoke all on function public.claim_one_time_prekey(uuid, uuid, uuid) from public;
revoke execute on function public.claim_one_time_prekey(uuid, uuid, uuid) from anon;
grant execute on function public.claim_one_time_prekey(uuid, uuid, uuid) to authenticated;
revoke update on public.device_prekeys from authenticated;
drop policy if exists prekeys_consume on public.device_prekeys;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
for select to authenticated
using (discoverable = true or id = auth.uid());

drop policy if exists members_update_admin on public.conversation_members;
create policy members_update_admin on public.conversation_members
for update to authenticated
using (public.is_conversation_admin(conversation_id))
with check (public.is_conversation_admin(conversation_id));

drop policy if exists messages_insert_sender on public.messages;
create policy messages_insert_sender on public.messages
for insert to authenticated
with check (
  sender_user_id = auth.uid()
  and public.owns_device(sender_device_id)
  and public.is_conversation_member(conversation_id)
  and exists (
    select 1
    from public.devices d
    join public.conversation_members cm on cm.user_id = d.user_id
    where d.id = recipient_device_id
      and d.status = 'active'
      and cm.conversation_id = messages.conversation_id
      and cm.removed_at is null
  )
);

drop policy if exists delivery_insert_endpoints on public.message_delivery;
create policy delivery_insert_endpoints on public.message_delivery
for insert to authenticated
with check (
  public.can_read_message(message_id)
  and recipient_device_id = (
    select m.recipient_device_id
    from public.messages m
    where m.id = message_delivery.message_id
  )
);

drop policy if exists verifications_own on public.contact_verifications;
create policy verifications_own on public.contact_verifications
for all to authenticated
using (verifier_user_id = auth.uid())
with check (
  verifier_user_id = auth.uid()
  and exists (
    select 1 from public.contacts c
    where c.id = contact_id
      and c.owner_id = auth.uid()
      and exists (
        select 1 from public.devices d
        where d.id = verified_device_id
          and d.user_id = c.contact_user_id
          and d.status = 'active'
      )
  )
);

revoke execute on function public.owns_device(uuid) from anon;
revoke execute on function public.is_conversation_member(uuid) from anon;
revoke execute on function public.is_conversation_admin(uuid) from anon;
revoke execute on function public.can_read_message(uuid) from anon;
grant execute on function public.owns_device(uuid) to authenticated;
grant execute on function public.is_conversation_member(uuid) to authenticated;
grant execute on function public.is_conversation_admin(uuid) to authenticated;
grant execute on function public.can_read_message(uuid) to authenticated;
