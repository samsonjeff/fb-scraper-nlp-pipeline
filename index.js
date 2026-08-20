require("dotenv").config();
const axios = require("axios");
const express = require("express");
const Groq = require("groq-sdk");
const Conversation = require("./models/Conversation");

const { GoogleGenAI } = require("@google/genai");
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });


const app = express();
app.use(express.json());


const PORT = process.env.PORT || 3000;
const SYSTEM_PROMPT = process.env.BOT_SYSTEM_PROMPT ||
    "Ikaw ay Tagalog assistant, I'm replying to customers in Tagalog, Keep replies friendly and under 300 characters.";

// ── AI Clients ────────────────────────────────────────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Supabase Connection ───────────────────────────────────────────────────────
console.log("🗄️  Supabase client initialised ✅");
console.log(`   URL : ${process.env.SUPABASE_URL}`);

// ── FB Page Scraper ──────────────────────────────────────────────────────────
app.use("/scraper", require("./routes/scraper"));
const { startCronJobs } = require("./jobs/cron");
startCronJobs();


// ── Test route ────────────────────────────────────────────────────────────────
// GET /            → shows all conversations + scraped posts/comments as JSON
// GET /?psid=xxx   → shows conversations for a specific sender PSID
app.get("/", async (req, res) => {
    try {
        const supabase = require("./supabase/client");
        const { psid, limit = 100 } = req.query;
        const filter = psid ? { senderPSID: psid } : {};

        const conversations = await Conversation.find(filter)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit));

        // Fetch scraped posts
        const { data: posts } = await supabase
            .from("fb_posts")
            .select("*")
            .order("post_date", { ascending: false })
            .limit(parseInt(limit));

        // Fetch scraped comments
        const { data: comments } = await supabase
            .from("fb_comments")
            .select("*")
            .order("comment_date", { ascending: false })
            .limit(parseInt(limit));

        const payload = {
            success: true,
            bot_conversations: {
                total: conversations.length,
                data: conversations
            },
            scraped_posts: {
                total: (posts || []).length,
                data: posts || []
            },
            scraped_comments: {
                total: (comments || []).length,
                data: comments || []
            }
        };

        // Display as readable formatted JSON on the browser screen
        return res.send(`<pre>${JSON.stringify(payload, null, 2)}</pre>`);
    } catch (e) {
        return res.status(500).send(e.message);
    }
}); // updated Aug. 19, 2026

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ── Webhook verification ──────────────────────────────────────────────────────
app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
        console.log("Webhook verified ✅");
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// // ── Receive messages - 08/01/2026
const crypto = require("crypto");  // at top of file
app.post("/webhook", async (req, res) => {
    if (req.body.object !== "page") {
        return res.sendStatus(404);
    }

    res.status(200).send("EVENT_RECEIVED");

    for (const entry of req.body.entry || []) {
        for (const event of entry.messaging || []) {
            if (!event.sender?.id || !event.message?.text) continue;

            const senderPSID = event.sender.id;
            const userMessage = event.message.text;

            try {
                const { reply, provider } = await generateAiResponse(userMessage, senderPSID);
                const conversationId = crypto.randomUUID();

                await Conversation.create({
                    conversationId,
                    senderPSID,
                    userMessage,
                    aiReply: reply,
                    provider
                });

                await sendMessage(senderPSID, reply);
            } catch (err) {
                console.error(`❌ Failed for ${senderPSID}:`, err.message);
                try {
                    await sendMessage(senderPSID, "Sorry, I'm having trouble responding right now.");
                } catch (sendErr) {
                    console.error("❌ Failed to send error message:", sendErr.message);
                }
            }
        }
    }
});

// generate AI response 08/01/2026 udpate
async function generateAiResponse(userMessage, senderPSID) {
    try {
        // Get last 10 messages from this user
        const history = await Conversation.find({ senderPSID })
            .sort({ timestamp: -1 })
            .limit(10);

        // Build context string
        const contextMessages = history.reverse().map(h =>
            `User: ${h.userMessage}\nBot: ${h.aiReply}`
        ).join("\n---\n");

        const contextPrompt = contextMessages
            ? `Previous conversation:\n${contextMessages}\n\nNow respond to:`
            : "First message from user. Respond to:";

        console.log("🤖 Trying Gemini with conversation context...");
        const result = await genAI.models.generateContent({
            model: process.env.GEMINI_MODEL || "models/gemini-2.5-flash",
            contents: `${contextPrompt}\n${userMessage}`,
            // // 08/01/2026
            // contents: userMessage,
            config: { systemInstruction: SYSTEM_PROMPT }
        });
        const reply = result.text;
        if (!reply) throw new Error("Empty response from Gemini");
        console.log("✅ Gemini responded.");
        return { reply, provider: "gemini" };

    } catch (geminiError) {
        console.warn(`⚠️ Gemini failed: ${geminiError.message || geminiError}. Falling back to Groq...`);

        try {
            // Same for Groq
            const history = await Conversation.find({ senderPSID })
                .sort({ timestamp: -1 })
                .limit(10);

            const contextMessages = history.reverse().map(h =>
                `User: ${h.userMessage}\nBot: ${h.aiReply}`
            ).join("\n---\n");

            const messages = [
                { role: "system", content: SYSTEM_PROMPT },
                ...(contextMessages ? [{ role: "user", content: `Context:\n${contextMessages}` }] : []),
                { role: "user", content: userMessage }
            ];

            const completion = await groq.chat.completions.create({
                messages,
                model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
                temperature: 0.7,
                max_tokens: 300,
            });
            const reply = completion.choices[0]?.message?.content;
            if (!reply) throw new Error("Empty response from Groq");
            console.log("✅ Groq responded.");
            return { reply, provider: "groq" };

        } catch (groqError) {
            console.error(`❌ Groq failed: ${groqError.message}`);
            throw groqError;
        }
    }
};

// ── Send reply via Messenger ──────────────────────────────────────────────────
async function sendMessage(senderPSID, text) {
    try {
        await axios.post(
            `https://graph.facebook.com/${process.env.GRAPH_API_VERSION || "v25.0"}/me/messages`,
            {
                recipient: { id: senderPSID },
                messaging_type: "RESPONSE",
                message: { text },
            },
            { params: { access_token: process.env.PAGE_ACCESS_TOKEN } }
        );
        console.log("📤 Reply sent ✅");
    } catch (error) {
        console.error("❌ Error sending reply:", error.response?.data || error.message);
    }
}

// ── API: Reset entire database - 07/29/2026
app.post("/api/reset-database", async (req, res) => {
    try {
        const apiKey = req.headers["x-api-key"];
        if (apiKey !== process.env.INTERNAL_API_KEY) {
            return res.status(403).json({ error: "Unauthorized - Invalid API key" });
        }

        // Delete all conversations
        const result = await Conversation.deleteMany({});

        console.log(`🗑️  Database reset! Deleted ${result.deletedCount} documents`);
        res.json({
            success: true,
            message: `Database reset successfully! Deleted ${result.deletedCount} conversations.`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API enpoint for NLP HTTP request 08/01/2026
// ── API: Get full conversation history for a user 
app.get("/api/user-history/:senderPSID", async (req, res) => {
    try {
        const apiKey = req.headers["x-api-key"];
        if (apiKey !== process.env.INTERNAL_API_KEY) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        const { senderPSID } = req.params;
        const { limit = 50 } = req.query;

        const history = await Conversation.find({ senderPSID })
            .sort({ timestamp: 1 })  // oldest first
            .limit(parseInt(limit));

        // Format for NLP context
        const formattedHistory = history.map(msg => ({
            role: "user",
            content: msg.userMessage,
            timestamp: msg.timestamp
        }, {
            role: "assistant",
            content: msg.aiReply,
            timestamp: msg.timestamp
        })).flat();

        res.json({
            senderPSID,
            totalMessages: history.length,
            conversationHistory: formattedHistory
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Server running official url of your backend`);
    console.log(`📊 Dashboard    : add "/dashboard on your url" `);
    console.log(`🤖 Primary AI   : Gemini (${process.env.GEMINI_MODEL})`);
    console.log(`🔁 Fallback AI  : Groq  (${process.env.GROQ_MODEL})`);
    console.log(`🔑 Verify token : ${process.env.VERIFY_TOKEN}`);
    console.log(`📰 FB Scraper   : hourly cron active (FB_PAGE_ID: ${process.env.FB_PAGE_ID || 'NOT SET'})`);
});