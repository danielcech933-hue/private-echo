-- 1. Helper: does the current user share an active conversation with a user?
create or replace function public.shares_conversation(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members mine
    join public.conversation_members theirs
      on theirs.conversation_id = mine.conversation_id
    where mine.user_id = auth.uid()
      and mine.removed_at is null
      and theirs.user_id = _user_id
      and theirs.removed_at is null
  )
$$;

revoke execute on function public.shares_conversation(uuid) from public, anon;
grant execute on function public.shares_conversation(uuid) to authenticated;

-- 2. Helper: is _user_id a contact of the current user (either direction)?
create or replace function public.is_contact_of_current_user(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.contacts c
    where (c.owner_id = auth.uid() and c.contact_user_id = _user_id)
       or (c.contact_user_id = auth.uid() and c.owner_id = _user_id)
  )
$$;

revoke execute on function public.is_contact_of_current_user(uuid) from public, anon;
grant execute on function public.is_contact_of_current_user(uuid) to authenticated;

-- 3. Tighten device directory reads (metadata minimisation)
drop policy if exists devices_select_authenticated on public.devices;
create policy devices_select_scoped on public.devices
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_contact_of_current_user(user_id)
    or public.shares_conversation(user_id)
  );

-- 4. Pre-key public material: only own device rows are directly readable.
--    Remote pre-keys are obtained exclusively through claim_one_time_prekey().
drop policy if exists prekeys_select_authenticated on public.device_prekeys;
create policy prekeys_select_own_device on public.device_prekeys
  for select to authenticated
  using (public.owns_device(device_id));

-- 5. Identity material is immutable; a key change requires a new device row.
create or replace function public.enforce_device_key_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.identity_public_key <> old.identity_public_key then
    raise exception 'device identity_public_key is immutable; register a new device instead';
  end if;
  if new.crypto_suite <> old.crypto_suite then
    raise exception 'device crypto_suite is immutable';
  end if;
  if new.user_id <> old.user_id then
    raise exception 'device owner is immutable';
  end if;
  if old.status = 'revoked' and new.status <> 'revoked' then
    raise exception 'a revoked device cannot be reactivated';
  end if;
  if new.key_version < old.key_version then
    raise exception 'key_version must not decrease';
  end if;
  return new;
end;
$$;

drop trigger if exists devices_key_immutability on public.devices;
create trigger devices_key_immutability
  before update on public.devices
  for each row execute function public.enforce_device_key_immutability();

-- 6. One verification row per (contact, device) so re-verification replaces it
delete from public.contact_verifications cv
using public.contact_verifications other
where cv.contact_id = other.contact_id
  and cv.verified_device_id = other.verified_device_id
  and cv.verified_at < other.verified_at;

create unique index if not exists contact_verifications_contact_device_uniq
  on public.contact_verifications (contact_id, verified_device_id);

-- 7. Hard size limits on stored ciphertext / envelope header
alter table public.messages
  drop constraint if exists messages_ciphertext_size,
  drop constraint if exists messages_metadata_size;

alter table public.messages
  add constraint messages_ciphertext_size check (octet_length(ciphertext) <= 131072),
  add constraint messages_metadata_size check (encrypted_metadata is null or octet_length(encrypted_metadata) <= 8192);
