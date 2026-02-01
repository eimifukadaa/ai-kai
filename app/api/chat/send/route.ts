import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenerativeAIStream, Message, StreamingTextResponse, StreamData } from "ai";
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

        // 2. Search for relevant chunks using Vector Search
        let chunks = [];
        try {
            const embeddingResult = await embeddingModel.embedContent(query);
            const embedding = embeddingResult.embedding.values;

            const { data, error: searchError } = await supabase
                .rpc('search_documents_vector', {
                    query_embedding: embedding,
                    match_count: 25,
                    filter_user_id: session.user.id
                });

            if (searchError) console.error("Search error:", searchError);
            if (data) chunks = data;

        } catch (embedError) {
            console.error("Embedding generation failed:", embedError);
            // We continue without chunks if embedding fails (fallback to pure LLM)
        }

        // 3. Build Context
        const retrievedChunks = chunks || [];
        const contextText = retrievedChunks.map((c: any) =>
            `[Page ${c.page_number}] ${c.content}`
        ).join("\n\n");

        const systemPrompt = `You are an AI assistant for PT.KAI (Indonesian Railways). Answer questions ONLY using the provided document text.
    If the answer is not found in the documents, respond with: "TIDAK DITEMUKAN DI DOKUMEN YANG DIUPLOAD."
    Always cite the source by referencing the page number like [Page X].
    
    Context:
    ${contextText}
    `;

        const prompt = `${systemPrompt}\n\nUser Question: ${query}`;

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
        data.append({ citations: retrievedChunks });

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
