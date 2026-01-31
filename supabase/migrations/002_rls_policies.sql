-- Enable RLS on all tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE citations ENABLE ROW LEVEL SECURITY;

-- Documents policies
CREATE POLICY "Users can insert their own documents"
ON documents FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own documents"
ON documents FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
ON documents FOR UPDATE
USING (auth.uid() = user_id);

-- Jobs policies
CREATE POLICY "Users can view their own jobs"
ON jobs FOR SELECT
USING (auth.uid() = user_id);

-- Document pages/chunks policies (via document_id)
-- Note: Subqueries in RLS can be expensive, but necessary here if no direct user_id on child tables.
-- However, for performance we might want to denormalize user_id or trust the document join.
-- For MVP, simple join check.

CREATE POLICY "Users can view their own document pages"
ON document_pages FOR SELECT
USING (EXISTS (SELECT 1 FROM documents WHERE documents.id = document_pages.document_id AND documents.user_id = auth.uid()));

CREATE POLICY "Users can view their own document chunks"
ON document_chunks FOR SELECT
USING (EXISTS (SELECT 1 FROM documents WHERE documents.id = document_chunks.document_id AND documents.user_id = auth.uid()));

-- Chats policies
CREATE POLICY "Users can CRUD their own chats"
ON chats FOR ALL
USING (auth.uid() = user_id);

-- Messages policies
CREATE POLICY "Users can CRUD their own messages"
ON messages FOR ALL
USING (EXISTS (SELECT 1 FROM chats WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid()));

-- Citations policies
CREATE POLICY "Users can view citations for their messages"
ON citations FOR SELECT
USING (EXISTS (SELECT 1 FROM messages JOIN chats ON messages.chat_id = chats.id WHERE messages.id = citations.message_id AND chats.user_id = auth.uid()));


-- STORAGE POLICIES
-- Note: These must be applied in the Supabase Dashboard or via API as they are on the storage.objects table which is in a different schema.
-- But including here for reference.

-- CREATE POLICY "Users can upload to their own folder"
-- ON storage.objects FOR INSERT
-- WITH CHECK (bucket_id = 'kai_docs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- CREATE POLICY "Users can read their own files"
-- ON storage.objects FOR SELECT
-- USING (bucket_id = 'kai_docs' AND (storage.foldername(name))[1] = auth.uid()::text);
