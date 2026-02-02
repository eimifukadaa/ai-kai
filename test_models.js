const { GoogleGenerativeAI } = require("@google/generative-ai");

async function listModels() {
    if (!process.env.GEMINI_API_KEY) {
        console.error("Please set GEMINI_API_KEY env var");
        return;
    }

    // Handle comma-separated keys
    const keys = process.env.GEMINI_API_KEY.includes(',')
        ? process.env.GEMINI_API_KEY.split(',').map(k => k.trim())
        : [process.env.GEMINI_API_KEY];

    const modelsToTest = [
        "gemini-2.5-flash",
        "gemini-flash-latest",
        "gemini-3-flash-preview",
        "gemini-2.0-flash",
        "gemini-1.5-flash-latest" // Just in case
    ];

    console.log(`Found ${keys.length} keys.`);

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        // Mask key for log
        const masked = key.length > 8 ? `${key.substring(0, 5)}...${key.substring(key.length - 3)}` : "KEY";
        console.log(`\n--- Testing Key ${i + 1}: ${masked} ---`);

        const genAI = new GoogleGenerativeAI(key);

        for (const modelName of modelsToTest) {
            process.stdout.write(`Testing ${modelName}: `);
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent("Test");
                console.log("✅ OK");
            } catch (error) {
                if (error.message.includes("404")) {
                    console.log("❌ 404 Not Found (Model access denied or invalid)");
                } else if (error.message.includes("API key not valid")) {
                    console.log("❌ API Key Invalid");
                } else {
                    // Print first line of error to avoid clutter
                    console.log(`❌ Error: ${error.message.split('\n')[0]}`);
                }
            }
        }
    }
}

listModels();
