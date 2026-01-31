-- RLS is usually enabled by default on storage.objects. 
-- We skip ALTER TABLE to avoid ownership errors.

-- Policy to allow users to upload files to their own folder
-- Path structure: {user_id}/{document_id}/filename.pdf
-- bucket_id must be 'kai_docs'
CREATE POLICY "Users can upload to their own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'kai_docs' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy to allow users to read their own files
CREATE POLICY "Users can read their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'kai_docs' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy to allow users to update (overwrite) their own files (resumable uploads might need this)
CREATE POLICY "Users can update their own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'kai_docs' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);
