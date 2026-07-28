require("dotenv").config();
const axios = require("axios");
const express = require("express");
const mongoose = require("mongoose");
const Groq = require("groq-sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Conversation = require("./models/Conversation");

const app = express();
app.use(express.json());


const PORT = process.env.PORT || 3000;
const SYSTEM_PROMPT = process.env.BOT_SYSTEM_PROMPT ||
    "Ikaw ay Tagalog assistant, I'm replying to customers in Tagalog, Keep replies friendly and under 300 characters.";

// ── AI Clients ────────────────────────────────────────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── MongoDB Connection ────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("🗄️  MongoDB connected ✅"))
    .catch(err => console.error("❌ MongoDB connection error:", err.message));

// ── Test route ────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
    res.send("Messenger Bot is running ✅");
});

// ── Dashboard route ───────────────────────────────────────────────────────────
app.get("/dashboard", async (req, res) => {
    try {
        const logs = await Conversation.find()
            .sort({ timestamp: -1 })
            .limit(100);

        const rows = logs.map(log => `
            <tr>
                <td>${new Date(log.timestamp).toLocaleString()}</td>
                <td><code>${log.senderPSID}</code></td>
                <td>${escapeHtml(log.userMessage)}</td>
                <td>${escapeHtml(log.aiReply)}</td>
                <td><span class="badge badge-${log.provider}">${log.provider}</span></td>
            </tr>`).join("");

        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ReplyGenie Dashboard</title>
    <meta http-equiv="refresh" content="15">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f1a; color: #e2e8f0; min-height: 100vh; }
        header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 24px 32px; display: flex; align-items: center; gap: 12px; }
        header h1 { font-size: 1.5rem; font-weight: 700; color: #fff; }
        header span { font-size: 0.85rem; color: rgba(255,255,255,0.7); margin-left: auto; }
        .container { padding: 32px; }
        .stat-bar { display: flex; gap: 16px; margin-bottom: 28px; }
        .stat { background: #1e1e2e; border: 1px solid #2d2d42; border-radius: 12px; padding: 20px 24px; flex: 1; }
        .stat .label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
        .stat .value { font-size: 2rem; font-weight: 700; color: #a78bfa; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; background: #1e1e2e; border-radius: 12px; overflow: hidden; border: 1px solid #2d2d42; }
        thead { background: #16213e; }
        th { padding: 14px 16px; text-align: left; font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
        td { padding: 14px 16px; border-top: 1px solid #2d2d42; font-size: 0.875rem; vertical-align: top; max-width: 320px; word-wrap: break-word; }
        tr:hover { background: #252538; }
        code { background: #0f172a; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; color: #67e8f9; }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
        .badge-groq { background: #064e3b; color: #6ee7b7; }
        .badge-gemini { background: #1e3a5f; color: #93c5fd; }
        .badge-fallback { background: #4a1942; color: #f0abfc; }
        .empty { text-align: center; padding: 60px; color: #64748b; }
        .refresh-note { text-align: right; font-size: 0.75rem; color: #4b5563; margin-top: 12px; }
    </style>
</head>
<body>
    <header>
        <span>🤖</span>
        <h1>Messenger Bot Dashboard</h1>
        <span>Auto-refreshes every 15s · Last updated: ${new Date().toLocaleTimeString()}</span>
    </header>
    <div class="container">
        <div class="stat-bar">
            <div class="stat">
                <div class="label">Total Conversations</div>
                <div class="value">${logs.length}</div>
            </div>
            <div class="stat">
                <div class="label">Groq Responses</div>
                <div class="value">${logs.filter(l => l.provider === "groq").length}</div>
            </div>
            <div class="stat">
                <div class="label">Gemini Fallbacks</div>
                <div class="value">${logs.filter(l => l.provider === "gemini").length}</div>
            </div>
        </div>
        ${logs.length === 0
                ? `<div class="empty">📭 No conversations yet. Send a message to your Facebook Page to get started!</div>`
                : `<table>
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Sender ID</th>
                        <th>User Message</th>
                        <th>AI Reply</th>
                        <th>Provider</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
               </table>
               <p class="refresh-note">Showing last 100 conversations · Page auto-refreshes every 15 seconds</p>`
            }
    </div>
</body>
</html>`);
    } catch (err) {
        res.status(500).send("Dashboard error: " + err.message);
    }
});

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

// ── Receive messages ──────────────────────────────────────────────────────────
app.post("/webhook", (req, res) => {
    const body = req.body;

    if (body.object === "page") {
        res.status(200).send("EVENT_RECEIVED");

        body.entry.forEach((entry) => {
            const event = entry.messaging[0];
            if (!event) return;

            const senderPSID = event.sender.id;

            if (event.message && event.message.text) {
                const userMessage = event.message.text;
                console.log(`📩 Message from ${senderPSID}: ${userMessage}`);

                generateAiResponse(userMessage)
                    .then(({ reply, provider }) => {
                        // Save to MongoDB
                        Conversation.create({
                            senderPSID,
                            userMessage,
                            aiReply: reply,
                            provider
                        }).catch(err => console.error("⚠️  DB save error:", err.message));

                        sendMessage(senderPSID, reply);
                    })
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

// ── AI: Primary = Gemini, Fallback = Groq ────────────────────────────────────
async function generateAiResponse(userMessage) {
    try {
        console.log("🤖 Trying Gemini...");
        const model = genAI.getGenerativeModel({
            // model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
            model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
            systemInstruction: SYSTEM_PROMPT,
        });
        const result = await model.generateContent(userMessage);
        const reply = result.response.text();
        if (!reply) throw new Error("Empty response from Gemini");
        console.log("✅ Gemini responded.");
        return { reply, provider: "gemini" };

    } catch (geminiError) {
        console.warn(`⚠️  Gemini failed (${geminiError.message}). Falling back to Groq...`);

        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: userMessage }
                ],
                model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
                temperature: 0.7,
                max_tokens: 300,
            });
            const reply = completion.choices[0]?.message?.content;
            if (!reply) throw new Error("Empty response from Groq");
            console.log("✅ Groq responded (fallback).");
            return { reply, provider: "groq" };

        } catch (groqError) {
            console.error(`❌ Groq also failed: ${groqError.message}`);
            throw groqError;
        }
    }
}

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

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Dashboard    : http://localhost:${PORT}/dashboard`);
    console.log(`🤖 Primary AI   : Gemini (${process.env.GEMINI_MODEL})`);
    console.log(`🔁 Fallback AI  : Groq  (${process.env.GROQ_MODEL})`);
    console.log(`🔑 Verify token : ${process.env.VERIFY_TOKEN}`);
});