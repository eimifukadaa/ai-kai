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

async function monitor() {
    console.log("Monitoring document processing progress...");

    const { data: docs, error } = await supabase
        .from('documents')
        .select('name, status, pages_done, pages_total')
        .in('status', ['uploading', 'processing', 'ready']);

    if (error) {
        console.error("Error fetching docs:", error);
        return;
    }

    for (const doc of docs) {
        const { count } = await supabase
            .from('document_chunks')
            .select('*', { count: 'exact', head: true })
            .ilike('document_id', (await supabase.from('documents').select('id').eq('name', doc.name).single()).data?.id);

        // Correct way to get ID for count
        const { data: docData } = await supabase.from('documents').select('id').eq('name', doc.name).single();
        const { count: chunkCount } = await supabase
            .from('document_chunks')
            .select('*', { count: 'exact', head: true })
            .eq('document_id', docData.id);

        console.log(`\nDocument: ${doc.name}`);
        console.log(`- Status: ${doc.status}`);
        console.log(`- Pages: ${doc.pages_done}/${doc.pages_total}`);
        console.log(`- Total Chunks: ${chunkCount}`);
    }
}

monitor();
