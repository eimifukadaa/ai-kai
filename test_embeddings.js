const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testEmbeddings() {
    if (!process.env.GEMINI_API_KEY) {
        console.error("Please set GEMINI_API_KEY env var");
        return;
    }

    const keys = process.env.GEMINI_API_KEY.split(',').map(k => k.trim());
    // Test both new and old embedding model names
    const modelsToTest = ["text-embedding-004", "embedding-001"];

    console.log(`Found ${keys.length} keys.`);

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const masked = key.length > 8 ? `${key.substring(0, 5)}...${key.substring(key.length - 3)}` : "KEY";
        console.log(`\n--- Testing Key ${i + 1}: ${masked} ---`);

        const genAI = new GoogleGenerativeAI(key);

        for (const modelName of modelsToTest) {
            process.stdout.write(`Testing ${modelName}: `);
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.embedContent("Hello world query");
                console.log(`✅ OK (Vector length: ${result.embedding.values.length})`);
            } catch (error) {
                console.log(`❌ Error: ${error.message.split('\n')[0]}`);
            }
        }
    }
}

testEmbeddings();
