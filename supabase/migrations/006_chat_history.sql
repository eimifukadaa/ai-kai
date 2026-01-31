-- Chat History Schema
-- Conversations table to store chat sessions
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'New Chat',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Messages table to store conversation history
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now() not null
);

-- Indexes for performance
create index if not exists conversations_user_id_idx on conversations(user_id);
create index if not exists conversations_updated_at_idx on conversations(updated_at desc);
create index if not exists messages_conversation_id_idx on messages(conversation_id);
create index if not exists messages_created_at_idx on messages(created_at);

-- RLS Policies
alter table conversations enable row level security;
alter table messages enable row level security;

-- Users can only see their own conversations
create policy "Users can view own conversations"
  on conversations for select
  using (auth.uid() = user_id);

create policy "Users can create own conversations"
  on conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own conversations"
  on conversations for update
  using (auth.uid() = user_id);

create policy "Users can delete own conversations"
  on conversations for delete
  using (auth.uid() = user_id);

-- Users can only see messages from their conversations
create policy "Users can view own messages"
  on messages for select
  using (
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
    )
  );

create policy "Users can create messages in own conversations"
  on messages for insert
  with check (
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
    )
  );

create policy "Users can delete messages in own conversations"
  on messages for delete
  using (
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
    )
  );

-- Function to update conversation timestamp (created AFTER tables exist)
create or replace function update_conversation_timestamp()
returns trigger as $$
begin
  update conversations
  set updated_at = now()
  where id = NEW.conversation_id;
  return NEW;
end;
$$ language plpgsql;

-- Trigger to update conversation timestamp when message is added
drop trigger if exists update_conversation_timestamp_trigger on messages;
create trigger update_conversation_timestamp_trigger
  after insert on messages
  for each row
  execute function update_conversation_timestamp();

