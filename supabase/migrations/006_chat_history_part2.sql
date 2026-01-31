-- Step 2: Create indexes
create index if not exists conversations_user_id_idx on conversations(user_id);
create index if not exists conversations_updated_at_idx on conversations(updated_at desc);
create index if not exists messages_conversation_id_idx on messages(conversation_id);
create index if not exists messages_created_at_idx on messages(created_at);
