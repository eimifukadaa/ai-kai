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

async function reprocess() {
    console.log("Identifying broken documents (ready but 0 chunks)...");

    // 1. Get all documents
    const { data: docs, error } = await supabase
        .from('documents')
        .select('*');

    if (error) {
        console.error("Error fetching docs:", error);
        return;
    }

    const brokenDocs = [];

    for (const doc of docs) {
        const { count, error: countError } = await supabase
            .from('document_chunks')
            .select('*', { count: 'exact', head: true })
            .eq('document_id', doc.id);

        // Condition: 0 chunks, OR way fewer chunks than pages (indicating failed extraction for many pages)
        // Except for very small docs. For Jilid I (260 pages), 15 chunks is definitely broken.
        const isBroken = (count === 0 && doc.status === 'ready') ||
            (doc.pages_total > 10 && count < doc.pages_total * 0.5 && doc.status === 'ready') ||
            (doc.name.includes("Peraturan Dinas 19 Jilid I")); // Force this one

        if (isBroken) {
            brokenDocs.push(doc);
        }
    }

    console.log(`Found ${brokenDocs.length} broken documents.`);

    for (const doc of brokenDocs) {
        console.log(`\nReprocessing: ${doc.name} (ID: ${doc.id})`);

        // 1. Delete existing data
        console.log("- Deleting old chunks and pages...");
        await supabase.from('document_chunks').delete().eq('document_id', doc.id);
        await supabase.from('document_pages').delete().eq('document_id', doc.id);

        // 2. Reset document status
        console.log("- Resetting document status...");
        await supabase.from('documents').update({ status: 'uploading', pages_done: 0 }).eq('id', doc.id);

        // 3. Create new job
        console.log("- Creating new job...");
        const { data: job, error: jobError } = await supabase.from('jobs').insert({
            document_id: doc.id,
            user_id: doc.user_id,
            status: 'queued',
            attempts: 0
        }).select().single();

        if (jobError) {
            console.error("  Error creating job:", jobError);
        } else {
            console.log(`  Job created: ${job.id}`);
        }
    }

    console.log("\nReprocessing tasks queued. Make sure the Go worker is running.");
}

reprocess();
