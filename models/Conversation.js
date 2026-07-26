const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
    senderPSID: { type: String, required: true, index: true },
    userMessage: { type: String, required: true },
    aiReply:     { type: String, required: true },
    provider:    { type: String, enum: ["groq", "gemini", "fallback"], default: "groq" },
    timestamp:   { type: Date, default: Date.now }
});

module.exports = mongoose.model("BotConversation", conversationSchema);
