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
    <title>MessBot Dashboard</title>
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
        
        /* Reset Button Styles */
        .controls { display: flex; gap: 12px; margin-bottom: 20px; align-items: center; }
        .btn-reset { 
            background: #dc2626; 
            color: white; 
            border: none; 
            padding: 10px 16px; 
            border-radius: 6px; 
            cursor: pointer; 
            font-size: 0.875rem; 
            font-weight: 600;
            transition: all 0.2s;
        }
        .btn-reset:hover { background: #b91c1c; }
        .btn-reset:active { transform: scale(0.98); }
        .status-message { 
            font-size: 0.875rem; 
            padding: 12px 16px; 
            border-radius: 6px; 
            display: none;
        }
        .status-message.success { 
            background: #065f46; 
            color: #6ee7b7; 
            display: block;
        }
        .status-message.error { 
            background: #7f1d1d; 
            color: #fca5a5; 
            display: block;
        }
        
        /* Modal Styles */
        .modal { 
            display: none; 
            position: fixed; 
            z-index: 1000; 
            left: 0; 
            top: 0; 
            width: 100%; 
            height: 100%; 
            background-color: rgba(0, 0, 0, 0.7);
        }
        .modal-content { 
            background-color: #1e1e2e; 
            margin: 15% auto; 
            padding: 30px; 
            border: 1px solid #2d2d42;
            border-radius: 12px; 
            width: 90%; 
            max-width: 400px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        }
        .modal h2 { color: #ff6b6b; margin-bottom: 12px; }
        .modal p { color: #e2e8f0; margin-bottom: 20px; font-size: 0.95rem; }
        .modal-buttons { display: flex; gap: 12px; }
        .btn-confirm { 
            background: #dc2626; 
            color: white; 
            padding: 10px 20px; 
            border: none; 
            border-radius: 6px; 
            cursor: pointer; 
            font-weight: 600;
            flex: 1;
        }
        .btn-confirm:hover { background: #b91c1c; }
        .btn-cancel { 
            background: #374151; 
            color: white; 
            padding: 10px 20px; 
            border: none; 
            border-radius: 6px; 
            cursor: pointer; 
            font-weight: 600;
            flex: 1;
        }
        .btn-cancel:hover { background: #4b5563; }
    </style>
</head>
<body>
    <header>
        <span>🤖</span>
        <h1>Messenger Bot Dashboard</h1>
        <span>Auto-refreshes every 15s · Last updated: ${new Date().toLocaleTimeString()}</span>
    </header>
    <div class="container">
        <div class="controls">
            <button class="btn-reset" onclick="openResetModal()">🗑️ Reset Database</button>
            <div id="statusMessage" class="status-message"></div>
        </div>
        
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

    <!-- Reset Confirmation Modal -->
    <div id="resetModal" class="modal">
        <div class="modal-content">
            <h2>⚠️ Confirm Reset</h2>
            <p>Are you sure you want to delete ALL conversations? This action cannot be undone.</p>
            <div class="modal-buttons">
                <button class="btn-confirm" onclick="confirmReset()">Yes, Delete All</button>
                <button class="btn-cancel" onclick="closeResetModal()">Cancel</button>
            </div>
        </div>
    </div>

    <script>
        function openResetModal() {
            document.getElementById('resetModal').style.display = 'block';
        }

        function closeResetModal() {
            document.getElementById('resetModal').style.display = 'none';
        }

        async function confirmReset() {
            const statusDiv = document.getElementById('statusMessage');
            const resetBtn = document.querySelector('.btn-reset');
            
            try {
                resetBtn.disabled = true;
                resetBtn.textContent = '⏳ Resetting...';

                const response = await fetch('/api/reset-database', {
                    method: 'POST',
                    headers: {
                        'x-api-key': prompt('Enter API Key to confirm reset:')
                    }
                });

                const data = await response.json();

                if (response.ok) {
                    statusDiv.className = 'status-message success';
                    statusDiv.textContent = '✅ ' + data.message;
                    closeResetModal();
                    setTimeout(() => location.reload(), 2000);
                } else {
                    statusDiv.className = 'status-message error';
                    statusDiv.textContent = '❌ ' + data.error;
                }
            } catch (err) {
                statusDiv.className = 'status-message error';
                statusDiv.textContent = '❌ Error: ' + err.message;
            } finally {
                resetBtn.disabled = false;
                resetBtn.textContent = '🗑️ Reset Database';
            }
        }

        // Close modal when clicking outside
        window.onclick = function(event) {
            const modal = document.getElementById('resetModal');
            if (event.target == modal) {
                modal.style.display = 'none';
            }
        }
    </script>
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