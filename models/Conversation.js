const supabase = require("../supabase/client");

const TABLE = "conversations";

const Conversation = {
    /**
     * Insert a new conversation row.
     * @param {{ conversationId, senderPSID, userMessage, aiReply, provider }} data
     */
    async create(data) {
        const row = {
            conversation_id: data.conversationId,
            sender_psid:     data.senderPSID,
            user_message:    data.userMessage,
            ai_reply:        data.aiReply,
            provider:        data.provider,
            timestamp:       new Date().toISOString()
        };

        const { data: inserted, error } = await supabase
            .from(TABLE)
            .insert([row])
            .select()
            .single();

        if (error) throw new Error(`Supabase insert error: ${error.message}`);
        return inserted;
    },

    /**
     * Find conversations with optional filter, sort, and limit.
     * Mimics Mongoose: Conversation.find(filter).sort({ timestamp: -1 }).limit(n)
     *
     * Returns a chainable-like object for .sort() and .limit() compatibility.
     */
    find(filter = {}) {
        return new ConversationQuery(filter);
    },

    /**
     * Delete all conversations (or with a filter).
     */
    async deleteMany(filter = {}) {
        let query = supabase.from(TABLE).delete();

        if (filter.senderPSID) {
            query = query.eq("sender_psid", filter.senderPSID);
        } else {
            // Delete all: Supabase requires a condition – use neq on a always-true field
            query = query.neq("conversation_id", "");
        }

        const { data, error, count } = await query.select();
        if (error) throw new Error(`Supabase delete error: ${error.message}`);

        return { deletedCount: data ? data.length : 0 };
    }
};

/**
 * Chainable query builder to mimic Mongoose's fluent API:
 *   Conversation.find(filter).sort({ timestamp: -1 }).limit(10)
 */
class ConversationQuery {
    constructor(filter) {
        this._filter  = filter  || {};
        this._sortCol = "timestamp";
        this._sortAsc = true;
        this._limit   = 100;
    }

    sort(sortObj) {
        // Accept { timestamp: 1 } or { timestamp: -1 }
        const [col, dir] = Object.entries(sortObj)[0];
        // Map camelCase field names to snake_case DB columns
        const colMap = {
            timestamp:    "timestamp",
            senderPSID:   "sender_psid",
            userMessage:  "user_message",
            aiReply:      "ai_reply",
            provider:     "provider",
            conversationId: "conversation_id"
        };
        this._sortCol = colMap[col] || col;
        this._sortAsc = dir === 1;
        return this;
    }

    limit(n) {
        this._limit = n;
        return this;
    }

    /**
     * Make the query thenable so `await Conversation.find(...).sort(...).limit(...)` works.
     */
    then(resolve, reject) {
        this._execute().then(resolve).catch(reject);
    }

    async _execute() {
        let query = supabase
            .from(TABLE)
            .select("*")
            .order(this._sortCol, { ascending: this._sortAsc })
            .limit(this._limit);

        if (this._filter.senderPSID) {
            query = query.eq("sender_psid", this._filter.senderPSID);
        }

        const { data, error } = await query;
        if (error) throw new Error(`Supabase select error: ${error.message}`);

        // Normalize snake_case columns back to camelCase to match existing code
        return (data || []).map(row => ({
            conversationId: row.conversation_id,
            senderPSID:     row.sender_psid,
            userMessage:    row.user_message,
            aiReply:        row.ai_reply,
            provider:       row.provider,
            timestamp:      row.timestamp
        }));
    }
}

module.exports = Conversation;
