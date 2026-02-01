-- Enable pgvector extension to work with embeddings
create extension if not exists vector;

-- Add embedding column to document_chunks
-- gemini-embedding-001 (or text-embedding-004) has 768 dimensions
alter table document_chunks 
add column if not exists embedding vector(768);

-- Create index for faster search
create index if not exists document_chunks_embedding_idx 
on document_chunks 
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- Updated search function using vector similarity (cosine distance <->)
-- We use 1 - (A <=> B) because <=> is distance (0=same, 2=opposite), so 1 - dist = similarity
create or replace function search_documents_vector(
  query_embedding vector(768),
  match_count int default 8,
  filter_user_id uuid default null
) returns table (
  id uuid,
  document_id uuid,
  document_name text,
  page_number int,
  content text,
  similarity float
) language plpgsql security definer as $$
begin
  return query
  select
    dc.id,
    dc.document_id,
    d.name as document_name,
    dc.page_number,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from
    document_chunks dc
    join documents d on dc.document_id = d.id
  where
    (filter_user_id is null or d.user_id = filter_user_id)
  order by
    dc.embedding <=> query_embedding asc
  limit
    match_count;
end;
$$;
