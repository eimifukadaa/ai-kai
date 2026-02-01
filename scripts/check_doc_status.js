const { createClient } = require('@supabase/supabase-js');
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

const supabase = createClient(apiUrl, serviceKey);

async function checkDoc() {
    console.log("Fetching all documents...");

    const { data: docs, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching docs:", error);
        return;
    }

    if (docs && docs.length > 0) {
        for (const doc of docs) {
            console.log(`\nDocument: ${doc.name}`);
            console.log(`- ID: ${doc.id}`);
            console.log(`- Status: ${doc.status}`);
            console.log(`- Pages: ${doc.pages_done}/${doc.pages_total}`);

            const { count, error: countError } = await supabase
                .from('document_chunks')
                .select('*', { count: 'exact', head: true })
                .eq('document_id', doc.id);

            console.log(`- Total Chunks: ${countError ? 'Error' : count}`);

            if (count > 0) {
                const { data: chunk } = await supabase
                    .from('document_chunks')
                    .select('embedding')
                    .eq('document_id', doc.id)
                    .limit(1)
                    .single();
                console.log(`- Has Embedding for Sample Chunk: ${chunk && chunk.embedding ? 'YES' : 'NO'}`);
            }
        }
    } else {
        console.log("No documents found.");
    }
}

checkDoc();
