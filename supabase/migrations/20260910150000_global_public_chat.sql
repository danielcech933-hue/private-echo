-- Replace the old account-based messenger's data flow with one public room.
-- Anyone using the public/anon Supabase role can read and post short messages.

create table if not exists public.global_chat_messages (
  id uuid primary key default gen_random_uuid(),
  nickname text not null default 'Anonymous',
  body text not null,
  created_at timestamptz not null default now(),
  constraint global_chat_messages_nickname_length check (char_length(nickname) between 1 and 32),
  constraint global_chat_messages_body_length check (char_length(body) between 1 and 2000)
);

create index if not exists global_chat_messages_created_at_idx
  on public.global_chat_messages (created_at desc);

alter table public.global_chat_messages enable row level security;

drop policy if exists "Anyone can read global chat" on public.global_chat_messages;
create policy "Anyone can read global chat"
  on public.global_chat_messages
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can post to global chat" on public.global_chat_messages;
create policy "Anyone can post to global chat"
  on public.global_chat_messages
  for insert
  to anon, authenticated
  with check (
    char_length(nickname) between 1 and 32
    and char_length(body) between 1 and 2000
  );

-- The public room is append-only from the browser.
drop policy if exists "Nobody can update global chat" on public.global_chat_messages;
drop policy if exists "Nobody can delete global chat" on public.global_chat_messages;

-- Enable Supabase Realtime for the single public room.
do $$
begin
  begin
    alter publication supabase_realtime add table public.global_chat_messages;
  exception
    when duplicate_object then null;
  end;
end;
$$;
