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

async function checkJobs() {
    console.log("Checking latest jobs...");

    const { data: jobs, error } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Error fetching jobs:", error);
        return;
    }

    console.log(`Found ${jobs.length} jobs.`);
    jobs.forEach(job => {
        console.log(`Job ID: ${job.id}`);
        console.log(`  Document ID: ${job.document_id}`);
        console.log(`  Status: ${job.status}`);
        console.log(`  Attempts: ${job.attempts}`);
        console.log(`  Created: ${job.created_at}`);
    });

    console.log("\nChecking latest document...");
    const { data: docs } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

    if (docs && docs.length > 0) {
        console.log(`Latest Doc: ${docs[0].name} (${docs[0].id}) Status: ${docs[0].status}`);
    }
}

checkJobs();
