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

if (!apiUrl || !serviceKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(apiUrl, serviceKey);

async function checkTerms() {
    const terms = ["Pengawas peron", "Perhentian", "Stasiun batas biasa", "Peraturan Dinas 19 Jilid I"];

    console.log("Searching for terms in document_chunks content...");

    for (const term of terms) {
        const { data, error } = await supabase
            .from('document_chunks')
            .select('content, page_number, document_id')
            .ilike('content', `%${term}%`)
            .limit(5);

        if (error) {
            console.error(`Error searching for "${term}":`, error);
            continue;
        }

        console.log(`\nTerm: "${term}"`);
        if (data && data.length > 0) {
            console.log(`Found ${data.length} matches:`);
            for (const item of data) {
                // Get doc name
                const { data: doc } = await supabase.from('documents').select('name').eq('id', item.document_id).single();
                console.log(`- Doc: ${doc ? doc.name : item.document_id}, Page: ${item.page_number}`);
                console.log(`  Snippet: ${item.content.substring(0, 100).replace(/\n/g, ' ')}...`);
            }
        } else {
            console.log("NOT FOUND in any chunk.");
        }
    }

    // Also check if the document exists
    const { data: docs } = await supabase.from('documents').select('id, name, status').ilike('name', '%Peraturan Dinas 19 Jilid I%');
    console.log("\nSearching for document matching 'Peraturan Dinas 19 Jilid I':");
    if (docs && docs.length > 0) {
        docs.forEach(d => console.log(`- ${d.name} (ID: ${d.id}, Status: ${d.status})`));
    } else {
        console.log("Document NOT FOUND.");
    }
}

checkTerms();
