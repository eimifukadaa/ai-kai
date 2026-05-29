import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { StreamData, StreamingTextResponse } from "ai";

const DEFAULT_GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

type RetrievedChunk = {
  document_id: string;
  page_number: number;
  content: string;
  chunk_index?: number;
  similarity?: number;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getErrorStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }
  return undefined;
}

function parseEnvList(value?: string): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildSources(
  chunks: RetrievedChunk[],
  docMap: Record<string, string>,
) {
  const grouped = new Map<string, Set<number>>();

  for (const chunk of chunks) {
    const docName = docMap[chunk.document_id] || "Dokumen KAI";
    const page = Number(chunk.page_number);
    if (!grouped.has(docName)) grouped.set(docName, new Set<number>());
    if (Number.isFinite(page)) grouped.get(docName)!.add(page);
  }

  if (grouped.size === 0) {
    return "Tidak ada sumber dokumen yang relevan ditemukan.";
  }

  return [...grouped.entries()]
    .map(([docName, pages]) => {
      const sortedPages = [...pages]
        .sort((a, b) => a - b)
        .map((p) => `p.${p}`)
        .join(", ");
      return `${docName}\n${sortedPages}`;
    })
    .join("\n\n");
}

function buildSystemPrompt(contextText: string, sourcesText: string) {
  return `Kamu adalah AI chat utama untuk web ini dan spesialis analisis dokumen PT KAI.
Jawab SELALU dalam Bahasa Indonesia yang jelas, akurat, profesional, dan mudah dipahami.

ATURAN UTAMA:
1. Kamu adalah otak utama percakapan. Pahami maksud user dari konteks chat dan pertanyaan terbaru.
2. Gunakan konteks dokumen yang diberikan sebagai sumber fakta utama bila relevan.
3. Jika ada beberapa potongan dokumen yang relevan, gabungkan menjadi jawaban yang utuh, bukan potongan-potongan.
4. Jangan mengarang isi dokumen. Jika informasi tidak cukup, katakan dengan jujur bagian mana yang belum tersedia.
5. Jika konteks dokumen kosong atau tidak relevan, kamu tetap boleh membantu secara umum HANYA jika user meminta penjelasan umum. Namun jika user jelas meminta isi dokumen, jawab: "Maaf, informasi tidak ditemukan di dokumen yang diupload."
6. Jika jawaban menggunakan dokumen, wajib akhiri dengan bagian "Sumber".
7. Pada bagian "Sumber", tampilkan nama dokumen dan halaman yang dipakai.
8. Jangan menyebut proses internal seperti vector search, embedding, prompt, system instruction, atau tool.
9. Jika user meminta ringkasan, buat ringkas. Jika meminta detail, buat rinci dan terstruktur.
10. Prioritaskan jawaban yang benar, bukan sekadar terdengar meyakinkan.

DAFTAR SUMBER TERAMBIL:
${sourcesText}

KONTEKS DOKUMEN:
${contextText || "(kosong)"}`;
}

function buildConversationMessages(messages: unknown[]): ChatMessage[] {
  if (!Array.isArray(messages)) return [];

  return messages
    .map((message) => {
      if (typeof message !== "object" || message === null) return null;
      const role = "role" in message ? message.role : undefined;
      const content = "content" in message ? message.content : undefined;

      if (
        (role === "user" || role === "assistant" || role === "system") &&
        typeof content === "string" &&
        content.trim().length > 0
      ) {
        return { role, content: content.trim() } as ChatMessage;
      }

      return null;
    })
    .filter((message): message is ChatMessage => message !== null)
    .slice(-12);
}

function createDataProtocolStream(answer: string) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`0:${JSON.stringify(answer)}\n`));
      controller.close();
    },
  });
}

export async function POST(req: Request) {
  try {
    if (!process.env.GROQ_API_KEY) {
      console.error("Missing GROQ_API_KEY");
      return new Response(
        "Configuration Error: Missing GROQ_API_KEY in server environment.",
        { status: 500 },
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error("Missing GEMINI_API_KEY");
      return new Response(
        "Configuration Error: Missing GEMINI_API_KEY for document retrieval embeddings.",
        { status: 500 },
      );
    }

    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return new Response(
        "Configuration Error: Supabase environment variables are incomplete.",
        { status: 500 },
      );
    }

    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session) {
      console.error("Auth error:", authError);
      return new Response("Unauthorized: Please log in again.", {
        status: 401,
      });
    }

    const { messages } = await req.json();
    const conversationMessages = buildConversationMessages(messages);
    const lastMessage = conversationMessages[conversationMessages.length - 1];
    const query = lastMessage?.content?.trim();

    if (!query) {
      return new Response("Bad Request: Missing user message content.", {
        status: 400,
      });
    }

    const geminiApiKeys = parseEnvList(process.env.GEMINI_API_KEY);
    if (geminiApiKeys.length === 0) {
      return new Response(
        "Configuration Error: No valid GEMINI_API_KEY found.",
        { status: 500 },
      );
    }

    const groqModels = parseEnvList(process.env.GROQ_MODEL_FALLBACKS);
    const modelsToTry =
      groqModels.length > 0 ? groqModels : DEFAULT_GROQ_MODELS;

    const genAI = new GoogleGenerativeAI(geminiApiKeys[0]);
    const embeddingModel = genAI.getGenerativeModel({
      model: "text-embedding-004",
    });

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    let chunks: RetrievedChunk[] = [];

    try {
      const embeddingResult = await embeddingModel.embedContent(query);
      const embedding = embeddingResult.embedding.values;

      const { data, error: searchError } = await supabaseAdmin.rpc(
        "search_documents_vector",
        {
          query_embedding: embedding,
          match_count: 24,
          filter_user_id: session.user.id,
        },
      );

      if (searchError) {
        console.error("Search error:", searchError);
      } else if (data) {
        chunks = data;
        console.log(
          `[RAG] Found ${chunks.length} chunks for query: "${query}"`,
        );
      }
    } catch (embedError) {
      console.error("Embedding generation failed:", embedError);
    }

    const docIds = [...new Set(chunks.map((c) => c.document_id))];
    const docMap: Record<string, string> = {};

    if (docIds.length > 0) {
      const { data: docs, error: docsError } = await supabaseAdmin
        .from("documents")
        .select("id, name")
        .in("id", docIds)
        .eq("user_id", session.user.id);

      if (docsError) {
        console.error("Document lookup error:", docsError);
      }

      docs?.forEach((doc) => {
        docMap[doc.id] = doc.name;
      });
    }

    const retrievedChunks = chunks || [];
    const contextText = retrievedChunks
      .map((c) => {
        const name = docMap[c.document_id] || "Dokumen KAI";
        return `[File: ${name}, Page: ${c.page_number}] ${c.content}`;
      })
      .join("\n\n");

    const sourcesText = buildSources(retrievedChunks, docMap);
    const systemPrompt = buildSystemPrompt(contextText, sourcesText);

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    let completion: Awaited<
      ReturnType<typeof groq.chat.completions.create>
    > | null = null;
    let usedModel: string | null = null;
    let lastError: unknown = null;

    for (const modelName of modelsToTry) {
      try {
        completion = await groq.chat.completions.create({
          model: modelName,
          temperature: 0.2,
          max_tokens: 1800,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            ...conversationMessages,
          ],
        });
        usedModel = modelName;
        break;
      } catch (error: unknown) {
        lastError = error;
        console.error(
          `Groq model ${modelName} failed:`,
          getErrorMessage(error),
        );
      }
    }

    if (!completion) {
      throw lastError || new Error("Failed to generate response with Groq.");
    }

    const answer =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Maaf, terjadi kesalahan saat menghasilkan jawaban.";

    const data = new StreamData();
    const enrichedCitations = retrievedChunks.map((c) => ({
      ...c,
      document_name: docMap[c.document_id] || "Dokumen KAI",
    }));

    data.append({
      citations: enrichedCitations,
      model: usedModel,
    });
    data.close();

    return new StreamingTextResponse(
      createDataProtocolStream(answer),
      {
        headers: {
          ...(usedModel ? { "x-ai-model": usedModel } : {}),
          "x-vercel-ai-data-stream": "v1",
        },
      },
      data,
    );
  } catch (err: unknown) {
    console.error("Chat API Error:", err);

    const message = getErrorMessage(err) || "Internal Server Error";
    const status = getErrorStatus(err) === 429 ? 429 : 500;

    return new Response(message, { status });
  }
}
