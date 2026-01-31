const { GoogleGenerativeAI } = require("@google/generative-ai");
// require('dotenv').config({ path: '.env.local' });

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log("Using Key:", process.env.GEMINI_API_KEY ? "Found" : "Missing");

    try {
        // List models is usually not directly exposed on genAI instance in basic usage, 
        // but let's try via the model manager if available in this SDK version?
        // Actually, standard way is likely making a rest call or using a GET request if SDK doesn't expose it easily.
        // But let's try to just instantiate a model and generate simple content.

        const modelsToTry = [
            "gemini-1.5-flash",
            "gemini-1.5-flash-latest",
            "gemini-1.5-flash-001",
            "gemini-pro",
            "gemini-1.0-pro"
        ];

        for (const modelName of modelsToTry) {
            console.log(`Testing ${modelName}...`);
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent("Hello");
                console.log(`✅ ${modelName} SUCCESS`);
                return; // Found one!
            } catch (e) {
                console.log(`❌ ${modelName} FAILED: ${e.message}`);
            }
        }

    } catch (error) {
        console.error("Global error:", error);
    }
}

listModels();
