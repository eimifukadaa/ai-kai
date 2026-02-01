import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenerativeAIStream, Message, StreamingTextResponse, StreamData } from "ai";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
    try {
        if (!process.env.GEMINI_API_KEY) {
            console.error("Missing GEMINI_API_KEY");
            return new Response("Configuration Error: Missing GEMINI_API_KEY in server environment.", { status: 500 });
        }

        // Parse keys (comma separated)
        const apiKeys = process.env.GEMINI_API_KEY.split(',').map(k => k.trim()).filter(k => k.length > 0);

        if (apiKeys.length === 0) {
            return new Response("Configuration Error: No valid API keys found.", { status: 500 });
        }

        const supabase = await createClient();
        const { data: { session }, error: authError } = await supabase.auth.getSession();

        if (authError || !session) {
            console.error("Auth error:", authError);
            return new Response("Unauthorized: Please log in again.", { status: 401 });
        }

        const { messages } = await req.json();
        const lastMessage = messages[messages.length - 1];
        const query = lastMessage.content;

        // 1. Setup Gemini with first key for embeddings (embeddings usually have higher rate limits)
        // We use the first key for embeddings to keep it simple, or we could rotate too.
        // For now, let's just use the first one, if it fails we might need to handle it too, but generation is the main bottleneck.
        const genAI_Embed = new GoogleGenerativeAI(apiKeys[0]);
        const embeddingModel = genAI_Embed.getGenerativeModel({ model: "text-embedding-004" });

        // Create Admin Client for searching (bypasses RLS)
        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // 2. Search for relevant chunks using Vector Search
        let chunks = [];
        try {
            const embeddingResult = await embeddingModel.embedContent(query);
            const embedding = embeddingResult.embedding.values;

            const { data, error: searchError } = await supabaseAdmin
                .rpc('search_documents_vector', {
                    query_embedding: embedding,
                    match_count: 100, // MEGA FIX: Use 100 chunks
                    filter_user_id: null
                });

            if (searchError) console.error("Search error:", searchError);
            if (data) {
                chunks = data;
                console.log(`[DEBUG] Found ${chunks.length} chunks for query: "${query}"`);
            }

        } catch (embedError) {
            console.error("Embedding generation failed:", embedError);
        }

        // 3. Enrich with Document Names
        const docIds = [...new Set(chunks.map((c: any) => c.document_id))];
        let docMap: Record<string, string> = {};

        if (docIds.length > 0) {
            const { data: docs } = await supabaseAdmin.from('documents').select('id, name').in('id', docIds);
            if (docs) docs.forEach(d => docMap[d.id] = d.name);
        }

        // 4. Build Context
        const retrievedChunks = chunks || [];
        const contextText = retrievedChunks.map((c: any) => {
            const name = docMap[c.document_id] || "Dokumen KAI";
            return `[File: ${name}, Page: ${c.page_number}] ${c.content}`;
        }).join("\n\n");

        const systemPrompt = `You are an expert AI assistant specialized in PT.KAI (Indonesian Railways) regulations. 
Your mission is to provide extremely detailed, accurate, and professional answers using ONLY the provided document context.

INSTRUCTIONS:
1. Provide a comprehensive explanation in Indonesian.
2. Synthesize information from multiple pages if necessary to give a complete answer.
3. If the answer is found, format it clearly and professionally.
4. ALWAYS add a "Sumber" section at the VERY END.
5. In the "Sumber" section, list each unique document name and its page(s) on a new line.
6. If the EXACT answer is not present in the context, respond ONLY with: "Tidak ditemukan di dokumen yang diupload."

EXAMPLE RESPONSE STYLE:
[Penjelasan mendalam tentang topik tersebut...]

Sumber
Peraturan Dinas 3.pdf
p.95, p.102

CONTEXT DATA:
${contextText}`;

        const prompt = `${systemPrompt}\n\nPertanyaan: ${query}\n\nJawaban:`;

        // 4. Stream Response with Fallback AND Key Rotation
        const modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-flash-latest"];

        let geminiStream = null;
        let lastError = null;

        // Loop through keys
        for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
            const currentKey = apiKeys[keyIndex];
            const currentGenAI = new GoogleGenerativeAI(currentKey);

            console.log(`Using API Key ${keyIndex + 1}/${apiKeys.length}`);

            // Try models with current key
            for (const modelName of modelsToTry) {
                try {
                    console.log(`Trying model: ${modelName} with Key ${keyIndex + 1}...`);
                    const model = currentGenAI.getGenerativeModel({ model: modelName });
                    geminiStream = await model.generateContentStream(prompt);

                    // If we get here, it worked! Break inner loop
                    break;
                } catch (e: any) {
                    console.error(`Model ${modelName} failed with Key ${keyIndex + 1}:`, e.message);
                    lastError = e;

                    // Check if it is a quota/rate limit error
                    const isQuotaError = e.message?.includes('429') || e.status === 429 || e.toString().includes('Quota');

                    if (isQuotaError) {
                        // If it's a quota error, we should try the next KEY, not just the next model (usually).
                        // So we break the model loop to go to the next key.
                        console.warn("Quota exceeded on current key, switching...");
                        break;
                    }

                    // If it's NOT a quota error (e.g. model not found), we try the next MODEL on the same key.
                    // Unless it's the last model, then loop continues naturally.
                }
            }

            // If we have a stream, we are good! Break user loop.
            if (geminiStream) break;
        }

        if (!geminiStream) {
            // If we exhausted all keys and models
            console.error("All keys and models exhausted.");
            throw lastError || new Error("Failed to generate response with all available keys.");
        }

        const data = new StreamData();
        const enrichedCitations = retrievedChunks.map((c: any) => ({
            ...c,
            document_name: docMap[c.document_id] || "Dokumen KAI"
        }));
        data.append({ citations: enrichedCitations });

        const stream = GoogleGenerativeAIStream(geminiStream, {
            onFinal: async (completion) => {
                data.close();
            },
        });

        return new StreamingTextResponse(stream, {}, data);

    } catch (err: any) {
        console.error("Chat API Error:", err);

        // Handle Google Generative AI 429 errors
        if (err.message?.includes('429') || err.status === 429 || err.toString().includes('Quota exceeded')) {
            return new Response("AI Usage Limit Reached on ALL keys. Please add more keys or try again later.", { status: 429 });
        }

        return new Response(err.message || "Internal Server Error", { status: 500 });
    }
}
