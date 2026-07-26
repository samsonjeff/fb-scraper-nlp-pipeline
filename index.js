require("dotenv").config();
const axios = require("axios");
const express = require("express");
const Groq = require("groq-sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SYSTEM_PROMPT = process.env.BOT_SYSTEM_PROMPT ||
    "You are a helpful, concise assistant replying to customers. Keep replies friendly and under 300 characters.";

// ── AI Clients ────────────────────────────────────────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Test route ────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
    res.send("ReplyGenie is running ✅");
});

// ── Webhook verification ──────────────────────────────────────────────────────
app.get("/webhook", (req, res) => {
    const mode      = req.query["hub.mode"];
    const token     = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
        console.log("Webhook verified ✅");
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// ── Receive messages ──────────────────────────────────────────────────────────
app.post("/webhook", (req, res) => {
    const body = req.body;

    if (body.object === "page") {
        // Acknowledge immediately so Meta doesn't retry
        res.status(200).send("EVENT_RECEIVED");

        body.entry.forEach((entry) => {
            const event = entry.messaging[0];
            if (!event) return;

            const senderPSID = event.sender.id;

            if (event.message && event.message.text) {
                const userMessage = event.message.text;
                console.log(`📩 Message from ${senderPSID}: ${userMessage}`);

                generateAiResponse(userMessage)
                    .then(aiReply => sendMessage(senderPSID, aiReply))
                    .catch(err => {
                        console.error("❌ All AI providers failed:", err.message);
                        sendMessage(senderPSID, "Sorry, I'm having trouble responding right now. Please try again shortly.");
                    });
            }
        });
    } else {
        res.sendStatus(404);
    }
});

// ── AI: Primary = Groq, Fallback = Gemini ────────────────────────────────────
async function generateAiResponse(userMessage) {
    try {
        console.log("🤖 Trying Groq...");
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user",   content: userMessage   }
            ],
            model:       process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
            temperature: 0.7,
            max_tokens:  300,
        });
        const reply = completion.choices[0]?.message?.content;
        if (!reply) throw new Error("Empty response from Groq");
        console.log("✅ Groq responded.");
        return reply;

    } catch (groqError) {
        console.warn(`⚠️  Groq failed (${groqError.message}). Falling back to Gemini...`);

        try {
            const model = genAI.getGenerativeModel({
                model:          process.env.GEMINI_MODEL || "gemini-2.5-flash",
                systemInstruction: SYSTEM_PROMPT,
            });
            const result = await model.generateContent(userMessage);
            const reply  = result.response.text();
            if (!reply) throw new Error("Empty response from Gemini");
            console.log("✅ Gemini responded (fallback).");
            return reply;

        } catch (geminiError) {
            console.error(`❌ Gemini also failed: ${geminiError.message}`);
            throw geminiError; // bubble up so the caller sends the error message
        }
    }
}

// ── Send reply via Messenger ──────────────────────────────────────────────────
async function sendMessage(senderPSID, text) {
    try {
        await axios.post(
            `https://graph.facebook.com/${process.env.GRAPH_API_VERSION || "v25.0"}/me/messages`,
            {
                recipient:       { id: senderPSID },
                messaging_type:  "RESPONSE",
                message:         { text },
            },
            {
                params: { access_token: process.env.PAGE_ACCESS_TOKEN },
            }
        );
        console.log("📤 Reply sent ✅");
    } catch (error) {
        console.error("❌ Error sending reply:", error.response?.data || error.message);
    }
}

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🤖 Primary AI  : Groq  (${process.env.GROQ_MODEL})`);
    console.log(`🔁 Fallback AI : Gemini (${process.env.GEMINI_MODEL})`);
    console.log(`🔑 Verify token: ${process.env.VERIFY_TOKEN}`);
});