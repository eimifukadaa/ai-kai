const { createClient } = require('@supabase/supabase-js');
// Load env manually if needed or just use process.env
// For this script, we need the keys. I'll read from .env.local

const fs = require('fs');
const path = require('path');

let apiUrl = '';
let serviceKey = '';

try {
    const envPath = path.resolve(__dirname, '../.env.local');
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
        if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) apiUrl = line.split('=')[1].trim();
        if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceKey = line.split('=')[1].trim();
    });
} catch (e) {
    console.log("Error reading env:", e.message);
}

if (!apiUrl || !serviceKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(apiUrl, serviceKey);

async function checkEmbeddings() {
    console.log("Checking latest document...");

    // 1. Get latest doc
    const { data: docs, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error("Error fetching docs:", error);
        return;
    }

    if (!docs || docs.length === 0) {
        console.log("No documents found.");
        return;
    }

    const doc = docs[0];
    console.log(`Latest Doc: ${doc.name} (ID: ${doc.id})`);
    console.log(`Status: ${doc.status}`);
    console.log(`Pages: ${doc.pages_done}/${doc.pages_total}`);

    // 2. Check chunks
    const { data: chunks, error: chunkError } = await supabase
        .from('document_chunks')
        .select('id, chunk_index, embedding')
        .eq('document_id', doc.id)
        .limit(5);

    if (chunkError) {
        console.error("Error fetching chunks:", chunkError);
        return;
    }

    console.log(`Found ${chunks.length} sample chunks.`);
    if (chunks.length > 0) {
        chunks.forEach((c, i) => {
            const hasEmbedding = c.embedding && c.embedding.length > 0; // pgvector returns array or string
            // If using pgvector via JSON in JS, it might be string or array
            console.log(`Chunk ${i}: Embedding present? ${hasEmbedding ? 'YES' : 'NO'}`);
            if (hasEmbedding && i === 0) {
                // Check format roughly
                // console.log("Sample:", c.embedding.toString().substring(0, 50));
            }
        });
    } else {
        console.log("WARNING: No chunks found for this document!");
    }
}

checkEmbeddings();
