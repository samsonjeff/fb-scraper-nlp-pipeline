require("dotenv").config();
const axios = require("axios");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const Groq = require("groq-sdk");
const supabase = require("./supabase/client");
const Conversation = require("./models/Conversation");
const { requireApiKey, verifyFacebookSignature } = require("./utils/auth");
const { getUserProfile } = require("./utils/meta");
const geminiPool = require("./utils/geminiKeyPool");

const app = express();

// ── Message Deduplication (Supabase-backed, multi-instance safe) ─────────────
// Uses the `processed_messages` table (PRIMARY KEY on mid) as a distributed
// lock.  If two instances race on the same mid, only one INSERT wins;
// the other gets PG error 23505 (unique_violation) and skips processing.
//
// Table DDL (already created in Supabase):
//   CREATE TABLE processed_messages (
//       mid          TEXT PRIMARY KEY,
//       processed_at TIMESTAMPTZ DEFAULT now()
//   );

/**
 * Atomically claims a message ID.
 * @returns {Promise<boolean>} true if this instance claimed it, false if already taken.
 */
async function tryClaimMessage(mid) {
    const { error } = await supabase
        .from("processed_messages")
        .insert({ mid });

    if (error?.code === "23505") return false; // duplicate — another instance beat us
    if (error) {
        // Non-dedup error (e.g. table missing): log and allow processing to continue
        console.error("⚠️  Dedup insert error (allowing through):", error.message);
    }
    return true;
}

// Trust reverse proxy headers (required for deployment platforms like Render/Heroku)
app.set("trust proxy", 1);

// ── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet());

// Preserve raw body buffer for HMAC signature verification in webhooks
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// General rate limiter for standard endpoints
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Limit each IP to 200 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." }
});
app.use(generalLimiter);

// Dedicated rate limiter for webhook endpoint
const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
});

const PORT = process.env.PORT || 3000;
const SYSTEM_PROMPT = process.env.BOT_SYSTEM_PROMPT || ` ikaw ay tagalog AI bot assistant ng MDRRMC Talisay Batangas 4220 Philippines. kailangan lamang mag tanong at kumuha ng detalye, katulad ng mga:

- tunay na pangalan ng user,
- barangay sa Talisay Batangas,
- landmark o lugar na malapit sa lokasyon,
- numero o contact,
- tulong na kailangan(rescue, medical, emergency, supply at pagkain, at iba pa)

Pag - katapos mag tanong ipapaalala kay user na siguraduhing tama ang mga detalye.
dahil ito ang basihan ng amin team sa pag - sasagawa ng aksyon, na naka depende sa kailangan ng user.
naka focus lamang ang aming team sa mga nasalanta na dulot ng bagyo, lindol, pag - putok ng bulkang Taal, at natural na kalamidad sa Talisay Batangas 4220 Philippines.
Maging maikli at panatilihin ang iyong mga sagot sa ilalim ng 300 na letra(characters).`;

// ── AI Clients ────────────────────────────────────────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Supabase Connection ───────────────────────────────────────────────────────
console.log("🗄️  Supabase client initialised ✅");
console.log(`   URL : ${process.env.SUPABASE_URL}`);

// ── FB Page Scraper ──────────────────────────────────────────────────────────
app.use("/scraper", require("./routes/scraper"));
const { startCronJobs } = require("./jobs/cron");
startCronJobs();


// ── Health Check ─────────────────────────────────────────────────────────────
// GET / → safe health check status
app.get("/", (req, res) => {
    res.json({
        status: "healthy",
        service: "responde-backend",
        timestamp: new Date().toISOString()
    });
});

// ── Protected Debug / Inspection API ─────────────────────────────────────────
// GET /api/debug/conversations (Requires x-api-key header)
app.get("/api/debug/conversations", requireApiKey, async (req, res) => {
    try {
        const { psid, limit = 100 } = req.query;

        // Fetch bot conversations from Supabase
        let convQuery = supabase
            .from("conversations")
            .select("*")
            .order("timestamp", { ascending: false })
            .limit(parseInt(limit));

        if (psid) convQuery = convQuery.eq("sender_psid", psid);
        const { data: conversations } = await convQuery;

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

        return res.json({
            success: true,
            bot_conversations: {
                total: (conversations || []).length,
                data: conversations || []
            },
            scraped_posts: {
                total: (posts || []).length,
                data: posts || []
            },
            scraped_comments: {
                total: (comments || []).length,
                data: comments || []
            }
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});


// ── Webhook verification (Meta GET challenge) ─────────────────────────────────
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

// ── Receive messages (Meta POST webhook) ──────────────────────────────────────
app.post("/webhook", webhookLimiter, verifyFacebookSignature, async (req, res) => {
    if (req.body.object !== "page") {
        return res.sendStatus(404);
    }

    res.status(200).send("EVENT_RECEIVED");

    for (const entry of req.body.entry || []) {
        for (const event of entry.messaging || []) {
            if (!event.sender?.id || !event.message?.text) continue;

            const senderPSID = event.sender.id;
            const userMessage = event.message.text;
            const mid = event.message?.mid;

            // ── Dedup: skip if another instance (or a retry) already claimed this mid ──
            if (mid) {
                const claimed = await tryClaimMessage(mid);
                if (!claimed) {
                    console.log(`⏭️  Skipping duplicate message ${mid} from ${senderPSID}`);
                    continue;
                }
            }

            try {
                // Fetch sender's real name & profile pic from Meta Graph API
                const profile = await getUserProfile(senderPSID);

                const { reply: rawReply, provider } = await generateAiResponse(userMessage, senderPSID);
                const reply = stripMarkdown(rawReply);
                // Use Facebook message ID if available, otherwise generate a UUID
                const conversationId = event.message?.mid || crypto.randomUUID();

                await Conversation.upsert({
                    conversationId,
                    senderPSID,
                    userMessage,
                    aiReply: reply,
                    provider,
                    senderName: profile.name || "Unknown User"
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

// ── Generate AI response with conversation context ────────────────────────────
async function generateAiResponse(userMessage, senderPSID) {
    // ── Try Gemini (multi-key pool) ──────────────────────────────────────────
    let selectedKey = null;
    try {
        selectedKey = geminiPool.getNextClient();
    } catch (poolErr) {
        // All keys on cooldown
        console.warn(`⏩ ${poolErr.message} Going straight to Groq...`);
    }

    if (selectedKey) {
        const { client, keyIndex } = selectedKey;
        try {
            // Get last 10 messages from this user
            const { data: history } = await supabase
                .from("conversations")
                .select("user_message, ai_reply")
                .eq("sender_psid", senderPSID)
                .order("timestamp", { ascending: false })
                .limit(10);

            // Build context string
            const contextMessages = (history || []).reverse().map(h =>
                `User: ${h.user_message}\nBot: ${h.ai_reply}`
            ).join("\n---\n");

            const contextPrompt = contextMessages
                ? `Previous conversation:\n${contextMessages}\n\nNow respond to:`
                : "First message from user. Respond to:";

            console.log("🤖 Trying Gemini with conversation context...");
            const result = await client.models.generateContent({
                model: process.env.GEMINI_MODEL || "models/gemini-2.5-flash",
                contents: `${contextPrompt}\n${userMessage}`,
                config: { systemInstruction: SYSTEM_PROMPT }
            });
            const reply = result.text;
            if (!reply) throw new Error("Empty response from Gemini");
            console.log("✅ Gemini responded.");
            return { reply, provider: "gemini" };

        } catch (geminiError) {
            const is429 = geminiError.message?.includes('429') || geminiError.status === 429;
            const is503 = geminiError.message?.includes('503') || geminiError.status === 503;
            if (is429 || is503) {
                geminiPool.markKeyCooldown(keyIndex);
                console.warn(`⚠️ Gemini key hit ${is429 ? '429' : '503 (high demand)'}. Trying next key...`);
                // Attempt once more with a different key
                try {
                    const retry = geminiPool.getNextClient();
                    const { data: history } = await supabase
                        .from("conversations")
                        .select("user_message, ai_reply")
                        .eq("sender_psid", senderPSID)
                        .order("timestamp", { ascending: false })
                        .limit(10);
                    const contextMessages = (history || []).reverse().map(h =>
                        `User: ${h.user_message}\nBot: ${h.ai_reply}`
                    ).join("\n---\n");
                    const contextPrompt = contextMessages
                        ? `Previous conversation:\n${contextMessages}\n\nNow respond to:`
                        : "First message from user. Respond to:";
                    const retryResult = await retry.client.models.generateContent({
                        model: process.env.GEMINI_MODEL || "models/gemini-2.5-flash",
                        contents: `${contextPrompt}\n${userMessage}`,
                        config: { systemInstruction: SYSTEM_PROMPT }
                    });
                    const retryReply = retryResult.text;
                    if (!retryReply) throw new Error("Empty response from Gemini (retry)");
                    console.log("✅ Gemini responded (retry with next key).");
                    return { reply: retryReply, provider: "gemini" };
                } catch (retryErr) {
                    const retryIs429 = retryErr.message?.includes('429') || retryErr.status === 429;
                    if (retryIs429 && retryErr !== poolErr) {
                        // If the retry key also got a keyIndex, cool it down too
                    }
                    console.warn(`⚠️ Gemini retry also failed. Falling back to Groq...`);
                }
            } else {
                console.warn(`⚠️ Gemini failed: ${geminiError.message || geminiError}. Falling back to Groq...`);
            }
        }
    }

    // ── Groq Fallback ────────────────────────────────────────────────────────
    try {
        // Same for Groq
        const { data: history } = await supabase
            .from("conversations")
            .select("user_message, ai_reply")
            .eq("sender_psid", senderPSID)
            .order("timestamp", { ascending: false })
            .limit(10);

        const contextMessages = (history || []).reverse().map(h =>
            `User: ${h.user_message}\nBot: ${h.ai_reply}`
        ).join("\n---\n");

        const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...(contextMessages ? [{ role: "user", content: `Context:\n${contextMessages}` }] : []),
            { role: "user", content: userMessage }
        ];

        const completion = await groq.chat.completions.create({
            messages,
            model: process.env.GROQ_MODEL || "qwen/qwen3.6-27b",
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

// ── Strip markdown formatting for plain-text channels (e.g. Messenger) ─────────
function stripMarkdown(text) {
    return text
        // Remove <think>...</think> blocks (reasoning/thinking model output)
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        // Remove bold+italic: ***text*** or ___text___
        .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
        .replace(/___(.+?)___/g, '$1')
        // Remove bold: **text** or __text__
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        // Remove italic: *text* or _text_
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        // Remove bullet points: lines starting with * or - or +
        .replace(/^[\*\-\+]\s+/gm, '')
        // Remove numbered list dots: "1. ", "2. " etc.
        .replace(/^\d+\.\s+/gm, '')
        // Remove heading hashes: ## Heading
        .replace(/^#{1,6}\s+/gm, '')
        // Remove inline code backticks
        .replace(/`(.+?)`/g, '$1')
        // Collapse multiple blank lines into one
        .replace(/\n{3,}/g, '\n\n')
        .trim();
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

// ── API: Reset entire database ────────────────────────────────────────────────
app.post("/api/reset-database", requireApiKey, async (req, res) => {
    try {
        const { error, count } = await supabase
            .from("conversations")
            .delete()
            .neq("id", 0); // delete all rows

        if (error) throw new Error(error.message);

        console.log(`🗑️  Database reset! Deleted conversations from Supabase.`);
        res.json({
            success: true,
            message: `Database reset successfully! All conversations deleted.`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── API: Get full conversation history for a user ─────────────────────────────
app.get("/api/user-history/:senderPSID", requireApiKey, async (req, res) => {
    try {
        const { senderPSID } = req.params;
        const { limit = 50 } = req.query;

        const { data: history, error } = await supabase
            .from("conversations")
            .select("*")
            .eq("sender_psid", senderPSID)
            .order("timestamp", { ascending: true })
            .limit(parseInt(limit));

        if (error) throw new Error(error.message);

        // Format for NLP context
        const formattedHistory = (history || []).flatMap(msg => [
            {
                role: "user",
                content: msg.user_message,
                timestamp: msg.timestamp
            },
            {
                role: "assistant",
                content: msg.ai_reply,
                timestamp: msg.timestamp
            }
        ]);

        res.json({
            senderPSID,
            totalMessages: (history || []).length,
            conversationHistory: formattedHistory
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    const poolStatus = geminiPool.getPoolStatus();
    console.log(`🤖 Primary AI   : Gemini (${poolStatus.totalKeys} keys, model: ${process.env.GEMINI_MODEL || "gemini-2.5-flash"})`);
    console.log(`🔁 Fallback AI  : Groq  (${process.env.GROQ_MODEL || "llama-3.1-8b-instant"})`);
    console.log(`🔑 Verify token : ${process.env.VERIFY_TOKEN ? "CONFIGURED" : "NOT SET"}`);
    console.log(`🛡️  App secret   : ${process.env.APP_SECRET ? "CONFIGURED" : "NOT SET (Recommended for webhook verification)"}`);
    console.log(`📰 FB Scraper   : active (FB_PAGE_ID: ${process.env.FB_PAGE_ID || 'NOT SET'})`);
});