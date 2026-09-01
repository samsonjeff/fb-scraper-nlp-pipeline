require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");
const Groq = require("groq-sdk");
const axios = require("axios");

async function runDiagnostics() {
    console.log("=========================================");
    console.log("🔍 STARTING SYSTEM DIAGNOSTICS");
    console.log("=========================================\n");

    let hasErrors = false;

    // ── 1. Check Env Variables Presence ──────────────────
    console.log("1️⃣  Checking Environment Variables...");
    const requiredEnv = [
        "SUPABASE_URL",
        "SUPABASE_SERVICE_KEY",
        "PAGE_ACCESS_TOKEN",
        "FB_PAGE_ID"
    ];

    const missing = [];
    requiredEnv.forEach(env => {
        if (!process.env[env] || process.env[env].trim() === "") {
            missing.push(env);
        }
    });

    // Gemini keys: accept either GEMINI_API_KEYS or legacy GEMINI_API_KEY
    if (!process.env.GEMINI_API_KEYS && !process.env.GEMINI_API_KEY) {
        missing.push("GEMINI_API_KEYS (or GEMINI_API_KEY)");
    }

    if (missing.length > 0) {
        console.warn(`⚠️  Missing Environment Variables: ${missing.join(", ")}`);
        console.warn("💡 Make sure to set these up in your Render environment settings or local .env file.");
    } else {
        console.log("✅ All core environment variables are present.\n");
    }

    // ── 2. Test Supabase Connection ─────────────────────
    console.log("2️⃣  Testing Supabase Connection & Schema...");
    try {
        const supabase = require("./supabase/client");

        // Test query on conversations table
        const { data, error } = await supabase
            .from("conversations")
            .select("id")
            .limit(1);

        if (error) {
            throw error;
        }
        console.log("✅ Supabase connection successful! 'conversations' table is accessible.\n");
    } catch (err) {
        hasErrors = true;
        console.error("❌ Supabase Test Failed:", err.message);
        console.error("💡 Check if SUPABASE_URL and SUPABASE_SERVICE_KEY are correct, and that you ran the SQL schema to create the 'conversations' table.");
        console.error("💡 Schema SQL can be found in README.md under 'Database Schema'.\n");
    }

    // ── 3. Test Gemini API Keys (all keys in pool) ──────────────────────────
    console.log("3️⃣  Testing Gemini API Keys...");
    try {
        const raw = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
        const keys = raw.split(",").map(k => k.trim()).filter(Boolean);

        if (keys.length === 0) {
            throw new Error("No Gemini API keys found. Set GEMINI_API_KEYS or GEMINI_API_KEY.");
        }

        console.log(`   Found ${keys.length} Gemini key(s). Validating each...`);
        const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
        let validCount = 0;
        let invalidCount = 0;

        for (let i = 0; i < keys.length; i++) {
            const label = `Key-${String(i + 1).padStart(2, "0")}`;
            const masked = keys[i].slice(0, 6) + "..." + keys[i].slice(-4);
            try {
                const testClient = new GoogleGenAI({ apiKey: keys[i] });
                const result = await testClient.models.generateContent({
                    model: modelName,
                    contents: "Ping",
                    config: {
                        systemInstruction: "You are a test helper. Reply with exactly 'Pong'."
                    }
                });
                const text = result.text;
                if (!text || text.trim() === "") {
                    throw new Error("Empty response");
                }
                console.log(`   ✅ ${label} (${masked}) — OK`);
                validCount++;
            } catch (keyErr) {
                const is429 = keyErr.message?.includes('429') || keyErr.status === 429;
                const is503 = keyErr.message?.includes('503') || keyErr.status === 503;
                if (is429 || is503) {
                    // 429 / 503 means the key is valid, but Google server was temporarily busy
                    const reason = is429 ? "rate-limited" : "high demand (503)";
                    console.log(`   ✅ ${label} (${masked}) — valid (${reason}, will recover)`);
                    validCount++;
                } else {
                    console.warn(`   ❌ ${label} (${masked}) — FAILED: ${keyErr.message}`);
                    invalidCount++;
                }
            }
        }

        console.log(`   Summary: ${validCount} valid, ${invalidCount} invalid out of ${keys.length} keys.`);
        if (invalidCount > 0) {
            hasErrors = true;
            console.warn("   ⚠️  Some keys failed. Replace invalid keys in your .env file.");
        }
        console.log();
    } catch (err) {
        hasErrors = true;
        console.error("❌ Gemini API Test Failed:", err.message);
        console.error("💡 Ensure GEMINI_API_KEYS is set with valid comma-separated keys.");
        console.error("💡 If you are getting a 'Model not found' error, try setting GEMINI_MODEL to 'gemini-2.5-flash' without the 'models/' prefix.\n");
    }

    // ── 4. Test Groq Fallback API ───────────────────────
    console.log("4️⃣  Testing Groq API...");
    try {
        if (!process.env.GROQ_API_KEY) {
            throw new Error("GROQ_API_KEY environment variable is not set.");
        }
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const modelName = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

        console.log(`🤖 Requesting Groq model: ${modelName}...`);
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: "Reply with Pong." },
                { role: "user", content: "Ping" }
            ],
            model: modelName,
            max_tokens: 10,
        });

        const text = completion.choices[0]?.message?.content;
        if (!text || text.trim() === "") {
            throw new Error("Received empty response from Groq API.");
        }
        console.log(`✅ Groq API responds correctly: "${text.trim()}"\n`);
    } catch (err) {
        hasErrors = true;
        console.error("❌ Groq API Test Failed:", err.message);
        console.error("💡 Verify that GROQ_API_KEY is correct. Make sure the GROQ_MODEL is available and correct.\n");
    }

    // ── 5. Test Facebook Page access token ──────────────
    console.log("5️⃣  Testing Facebook Page Access Token...");
    try {
        if (!process.env.PAGE_ACCESS_TOKEN || !process.env.FB_PAGE_ID) {
            throw new Error("PAGE_ACCESS_TOKEN or FB_PAGE_ID is not set.");
        }
        const version = process.env.GRAPH_API_VERSION || "v25.0";
        const url = `https://graph.facebook.com/${version}/${process.env.FB_PAGE_ID}`;

        const res = await axios.get(url, {
            params: {
                fields: "id,name",
                access_token: process.env.PAGE_ACCESS_TOKEN
            }
        });

        console.log(`✅ Facebook Token is valid! Page Name: "${res.data.name}" (ID: ${res.data.id})\n`);
    } catch (err) {
        hasErrors = true;
        const errMsg = err.response?.data?.error?.message || err.message;
        console.error("❌ Facebook Graph API Test Failed:", errMsg);
        console.error("💡 Verify that PAGE_ACCESS_TOKEN is correct and has standard page messaging permissions.");
        console.error("💡 Verify that FB_PAGE_ID is correct.\n");
    }

    console.log("=========================================");
    if (hasErrors) {
        console.log("🔴 DIAGNOSTICS COMPLETED WITH ERRORS");
        console.log("Check the logs above to identify and fix the issues.");
    } else {
        console.log("🟢 ALL SERVICES OPERATIONAL & HEALTHY!");
    }
    console.log("=========================================");
}

runDiagnostics();
