import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import pdf from "pdf-parse";
import mammoth from "mammoth";

type ProcessingResult = {
  success: boolean;
  pagesTotal: number;
  chunksCount: number;
  error?: string;
};

type ChunkInsert = {
  document_id: string;
  page_number: number;
  chunk_index: number;
  content: string;
  embedding?: number[];
};

function getAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase environment variables are incomplete.");
  }

  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY?.split(",").map((key) => key.trim()).find(Boolean);
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY for document processing.");
  }
  return new GoogleGenerativeAI(apiKey);
}

function splitIntoPages(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const byFormFeed = normalized
    .split("\f")
    .map((page) => page.trim())
    .filter(Boolean);

  if (byFormFeed.length > 1) return byFormFeed;

  const pageSize = 4500;
  const overlap = 300;
  const pages: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + pageSize, normalized.length);
    const slice = normalized.slice(start, end).trim();
    if (slice) pages.push(slice);
    if (end >= normalized.length) break;
    start += pageSize - overlap;
  }

  return pages;
}

function chunkText(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const size = 1000;
  const overlap = 120;
  const chunks: string[] = [];

  for (let start = 0; start < normalized.length; start += size - overlap) {
    const end = Math.min(start + size, normalized.length);
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
  }

  return chunks;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  const vectors: number[][] = [];

  for (const text of texts) {
    const result = await model.embedContent(text);
    vectors.push(result.embedding.values);
  }

  return vectors;
}

async function extractTextFromBuffer(buffer: Buffer, filename: string): Promise<{ text: string; extension: string }> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value || "", extension: ".docx" };
  }

  const result = await pdf(buffer);
  return { text: result.text || "", extension: ".pdf" };
}

export async function processDocument(documentId: string): Promise<ProcessingResult> {
  const supabaseAdmin = getAdminClient();

  const { data: document, error: documentError } = await supabaseAdmin
    .from("documents")
    .select("id, name, storage_path")
    .eq("id", documentId)
    .single();

  if (documentError || !document) {
    throw new Error(documentError?.message || "Document not found.");
  }

  await supabaseAdmin
    .from("documents")
    .update({ status: "processing", pages_done: 0 })
    .eq("id", documentId);

  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from("kai_docs")
    .download(document.storage_path);

  if (downloadError || !fileData) {
    throw new Error(downloadError?.message || "Failed to download document file.");
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const { text } = await extractTextFromBuffer(buffer, document.name || document.storage_path || "document.pdf");

  const pages = splitIntoPages(text);
  const pagesTotal = pages.length;

  if (pagesTotal === 0) {
    await supabaseAdmin
      .from("documents")
      .update({ status: "error" })
      .eq("id", documentId);

    return {
      success: false,
      pagesTotal: 0,
      chunksCount: 0,
      error: "No text could be extracted from the document.",
    };
  }

  await supabaseAdmin.from("document_pages").delete().eq("document_id", documentId);
  await supabaseAdmin.from("document_chunks").delete().eq("document_id", documentId);

  const pageRows = pages.map((pageText, index) => ({
    document_id: documentId,
    page_number: index + 1,
    text: pageText,
  }));

  const { error: pageInsertError } = await supabaseAdmin
    .from("document_pages")
    .insert(pageRows);

  if (pageInsertError) {
    throw new Error(pageInsertError.message);
  }

  await supabaseAdmin
    .from("documents")
    .update({ pages_total: pagesTotal, pages_done: pagesTotal })
    .eq("id", documentId);

  const chunkRows: ChunkInsert[] = [];

  for (const [pageIndex, pageText] of pages.entries()) {
    const pageChunks = chunkText(pageText);
    if (pageChunks.length === 0) continue;

    const vectors = await embedTexts(pageChunks);
    pageChunks.forEach((content, chunkIndex) => {
      chunkRows.push({
        document_id: documentId,
        page_number: pageIndex + 1,
        chunk_index: chunkIndex,
        content,
        embedding: vectors[chunkIndex],
      });
    });
  }

  if (chunkRows.length > 0) {
    const { error: chunkInsertError } = await supabaseAdmin
      .from("document_chunks")
      .insert(chunkRows);

    if (chunkInsertError) {
      throw new Error(chunkInsertError.message);
    }
  }

  await supabaseAdmin
    .from("documents")
    .update({ status: "ready" })
    .eq("id", documentId);

  await supabaseAdmin
    .from("jobs")
    .delete()
    .eq("document_id", documentId);

  return {
    success: true,
    pagesTotal,
    chunksCount: chunkRows.length,
  };
}
