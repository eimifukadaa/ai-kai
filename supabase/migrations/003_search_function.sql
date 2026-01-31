-- RPC function to search document chunks
CREATE OR REPLACE FUNCTION search_documents(
  query_text TEXT,
  match_count INTEGER DEFAULT 8
) RETURNS TABLE (
  id UUID,
  document_id UUID,
  page_number INTEGER,
  content TEXT,
  rank REAL
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.page_number,
    dc.content,
    ts_rank(dc.tsv, plainto_tsquery('simple', query_text))::REAL AS rank
  FROM
    document_chunks dc
    JOIN documents d ON dc.document_id = d.id
  WHERE
    d.user_id = auth.uid() -- Enforce RLS via join check or just direct user ownership if we had it
    AND dc.tsv @@ plainto_tsquery('simple', query_text)
  ORDER BY
    rank DESC
  LIMIT
    match_count;
END;
$$;
