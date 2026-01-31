import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenerativeAIStream, Message, StreamingTextResponse, StreamData } from "ai";
import { createClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
    try {
        if (!process.env.GEMINI_API_KEY) {
            console.error("Missing GEMINI_API_KEY");
            return new Response("Configuration Error: Missing GEMINI_API_KEY in server environment.", { status: 500 });
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

        // 1. Setup Gemini Models
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        // Using gemini-2.5-flash (Confirmed available in 2026 environment)
        // Note: 1.5/1.0 models are deprecated/404.
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

        // 2. Search for relevant chunks using Vector Search
        // Generate embedding for query
        let chunks = [];
        try {
            const embeddingResult = await embeddingModel.embedContent(query);
            const embedding = embeddingResult.embedding.values;

            const { data, error: searchError } = await supabase
                .rpc('search_documents_vector', {
                    query_embedding: embedding,
                    match_count: 25, // Increased context for better recall
                    filter_user_id: session.user.id
                });

            if (searchError) console.error("Search error:", searchError);
            if (data) chunks = data;

        } catch (embedError) {
            console.error("Embedding generation failed:", embedError);
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

        // 4. Stream Response with Fallback
        const modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-flash-latest"];
        let geminiStream = null;
        let lastError = null;

        for (const modelName of modelsToTry) {
            try {
                console.log(`Trying model: ${modelName}...`);
                const model = genAI.getGenerativeModel({ model: modelName });
                geminiStream = await model.generateContentStream(prompt);
                break; // Success!
            } catch (e: any) {
                console.error(`Model ${modelName} failed:`, e.message);
                lastError = e;
                // If 429 (Quota) or 404 (Not Found), try next.
                // If it's the last model, throw the error.
                if (modelsToTry.indexOf(modelName) === modelsToTry.length - 1) {
                    throw e;
                }
            }
        }

        if (!geminiStream) throw lastError;

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
            return new Response("AI Usage Limit Reached. Please try again later.", { status: 429 });
        }

        return new Response(err.message || "Internal Server Error", { status: 500 });
    }
}
