import paramiko
import sys
import os

# CONFIGURATION
REMOTE_FILE_PATH = "/root/kai-chat/app/api/chat/send/route.ts"
HOST = "146.190.90.47"
USERNAME = "root"
PASSWORD = "Fujimori6Riho"

# The CORRECT Content for route.ts (Hardcoded to be safe)
ROUTE_CONTENT = r"""import { GoogleGenerativeAI } from "@google/generative-ai";
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

        // 1. Setup Gemini with first key for embeddings
        const genAI_Embed = new GoogleGenerativeAI(apiKeys[0]);
        const embeddingModel = genAI_Embed.getGenerativeModel({ model: "text-embedding-004" });

        // Create Admin Client for searching
        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // 2. Search for relevant chunks
        let chunks = [];
        try {
            const embeddingResult = await embeddingModel.embedContent(query);
            const embedding = embeddingResult.embedding.values;

            const { data, error: searchError } = await supabaseAdmin
                .rpc('search_documents_vector', {
                    query_embedding: embedding,
                    match_count: 100,
                    filter_user_id: null
                });

            if (searchError) console.error("Search error:", searchError);
            if (data) {
                chunks = data;
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
Your mission is to provide extremely detailed, accurate, and professional answers using the provided document context.

INSTRUCTIONS:
1. Provide a comprehensive explanation in Indonesian.
2. Synthesize information from multiple pages if necessary to give a complete answer.
3. If the answer is found, format it clearly and professionally.
4. If the context contains RELEVANT information, use it to answer the question to the best of your ability. Do not be overly pedantic about "exact" matches.
5. ALWAYS add a "Sumber" section at the VERY END.
6. In the "Sumber" section, list each unique document name and its page(s) on a new line.
7. ONLY if the provided context is completely irrelevant to the question, respond with: "Maaf, informasi tidak ditemukan di dokumen yang diupload."

EXAMPLE RESPONSE STYLE:
[Penjelasan mendalam tentang topik tersebut...]

Sumber
Peraturan Dinas 3.pdf
p.95, p.102

CONTEXT DATA:
${contextText}`;

        const prompt = `${systemPrompt}\n\nPertanyaan: ${query}\n\nJawaban:`;

        // 4. Stream Response with Fallback AND Key Rotation
        // STRICTLY USING VERIFIED 2.5 FLASH
        const modelsToTry = ["gemini-2.5-flash", "gemini-flash-latest"];

        let geminiStream = null;
        let lastError = null;

        // Loop through keys
        for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
            const currentKey = apiKeys[keyIndex];
            const currentGenAI = new GoogleGenerativeAI(currentKey);

            // Try models with current key
            for (const modelName of modelsToTry) {
                try {
                    const model = currentGenAI.getGenerativeModel({ model: modelName });
                    geminiStream = await model.generateContentStream(prompt);
                    break;
                } catch (e: any) {
                    console.error(`Model ${modelName} failed with Key ${keyIndex + 1}:`, e.message);
                    lastError = e;
                    const isQuotaError = e.message?.includes('429') || e.status === 429 || e.toString().includes('Quota');
                    if (isQuotaError) {
                        break;
                    }
                }
            }
            if (geminiStream) break;
        }

        if (!geminiStream) {
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
        if (err.message?.includes('429') || err.status === 429 || err.toString().includes('Quota exceeded')) {
            return new Response("AI Usage Limit Reached on ALL keys. Please add more keys or try again later.", { status: 429 });
        }
        return new Response(err.message || "Internal Server Error", { status: 500 });
    }
}
"""

def create_ssh_client():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(HOST, username=USERNAME, password=PASSWORD)
        return client
    except Exception as e:
        print(f"[-] Connection failed: {e}")
        sys.exit(1)

def run_command(client, command):
    print(f"[*] Executing: {command}")
    stdin, stdout, stderr = client.exec_command(command)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if out: print(out)
    if err: print(f"Error: {err}")
    return exit_status

def main():
    print("--- 🚨 STARTING EMERGENCY PATCH 🚨 ---")
    client = create_ssh_client()
    
    # 1. READ REMOTE FILE (Before)
    print("\n[1] Checking current remote file content...")
    stdin, stdout, stderr = client.exec_command(f"cat {REMOTE_FILE_PATH}")
    current_content = stdout.read().decode()
    
    if 'gemini-1.5-pro' in current_content:
        print("❌ CRITICAL: Remote file STILL contains 'gemini-1.5-pro'!")
    else:
        print("✅ Remote file seems correct (no 'gemini-1.5-pro').")

    # 2. OVERWRITE FILE
    print("\n[2] Overwriting remote file with CORRECT content...")
    sftp = client.open_sftp()
    with sftp.file(REMOTE_FILE_PATH, 'w') as f:
        f.write(ROUTE_CONTENT)
    sftp.close()
    print("✅ File overwritten.")

    # 3. VERIFY AGAIN
    print("\n[3] Verifying new file content...")
    stdin, stdout, stderr = client.exec_command(f"cat {REMOTE_FILE_PATH}")
    new_content = stdout.read().decode()
    if 'gemini-2.5-flash' in new_content:
        print("✅ VERIFIED: File patched successfully.")
    else:
        print("❌ ERROR: Patch failed verification!")
        sys.exit(1)

    # 4. REBUILD & RESTART
    print("\n[4] Rebuilding and Restarting...")
    run_command(client, "cd /root/kai-chat && npm run build")
    run_command(client, "pm2 restart kai-chat")
    
    print("\n--- 🏁 EMERGENCY PATCH COMPLETE 🏁 ---")
    client.close()

if __name__ == "__main__":
    main()
