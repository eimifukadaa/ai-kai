-- Step 4: Create trigger function and trigger
create or replace function update_conversation_timestamp()
returns trigger as $$
begin
  update conversations
  set updated_at = now()
  where id = NEW.conversation_id;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists update_conversation_timestamp_trigger on messages;
create trigger update_conversation_timestamp_trigger
  after insert on messages
  for each row
  execute function update_conversation_timestamp();
