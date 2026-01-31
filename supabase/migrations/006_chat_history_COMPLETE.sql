-- Complete Chat History Migration (Run this ENTIRE script at once)

-- Drop existing objects if they exist (clean slate)
drop trigger if exists update_conversation_timestamp_trigger on messages;
drop function if exists update_conversation_timestamp();
drop table if exists messages cascade;
drop table if exists conversations cascade;

-- Create conversations table
create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'New Chat',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Create messages table
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now() not null
);

-- Create indexes
create index conversations_user_id_idx on conversations(user_id);
create index conversations_updated_at_idx on conversations(updated_at desc);
create index messages_conversation_id_idx on messages(conversation_id);
create index messages_created_at_idx on messages(created_at);

-- Enable RLS
alter table conversations enable row level security;
alter table messages enable row level security;

-- RLS Policies for conversations
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

-- RLS Policies for messages
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

-- Create trigger function
create function update_conversation_timestamp()
returns trigger as $$
begin
  update conversations
  set updated_at = now()
  where id = NEW.conversation_id;
  return NEW;
end;
$$ language plpgsql;

-- Create trigger
create trigger update_conversation_timestamp_trigger
  after insert on messages
  for each row
  execute function update_conversation_timestamp();
