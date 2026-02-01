const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSearch() {
    console.log("=== Testing RPC on Server Node.js ===");

    // Dummy embedding (768 zeros)
    const dummyEmbedding = new Array(768).fill(0);

    try {
        const { data, error } = await supabase.rpc('search_documents_vector', {
            query_embedding: dummyEmbedding,
            match_count: 5,
            filter_user_id: null
        });

        if (error) {
            console.error("❌ RPC Error:", error);
        } else {
            console.log("✅ RPC Success! Found items:", data.length);
            if (data.length > 0) {
                console.log("First item:", data[0]);
            }
        }
    } catch (e) {
        console.error("❌ Exception:", e);
    }
}

testSearch();
