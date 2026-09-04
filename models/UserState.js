const supabase = require("../supabase/client");

const TABLE = "user_states";

// In-memory cache for fast lookups & offline fallback (maps PSID -> { botPaused: boolean, cachedAt: number })
const stateCache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 1 minute in-memory TTL before re-checking DB

const UserState = {
    /**
     * Check whether the bot is currently paused for a given user PSID.
     * Checks memory cache first, then Supabase table, defaulting to false on error.
     * 
     * @param {string} senderPSID
     * @returns {Promise<boolean>} true if paused, false otherwise
     */
    async isBotPaused(senderPSID) {
        if (!senderPSID) return false;

        const cached = stateCache.get(senderPSID);
        const now = Date.now();
        if (cached && (now - cached.cachedAt) < CACHE_TTL_MS) {
            return cached.botPaused;
        }

        try {
            const { data, error } = await supabase
                .from(TABLE)
                .select("bot_paused")
                .eq("sender_psid", senderPSID)
                .maybeSingle();

            if (error) {
                // If table does not exist or network issue, warn and fallback to cached/false
                console.warn(`⚠️ UserState lookup warning for ${senderPSID}:`, error.message);
                return cached ? cached.botPaused : false;
            }

            const isPaused = Boolean(data?.bot_paused);
            stateCache.set(senderPSID, { botPaused: isPaused, cachedAt: now });
            return isPaused;
        } catch (err) {
            console.error(`❌ UserState.isBotPaused error:`, err.message);
            return cached ? cached.botPaused : false;
        }
    },

    /**
     * Set the bot paused status for a user PSID.
     * Updates in-memory cache immediately and persists to Supabase.
     * 
     * @param {string} senderPSID
     * @param {boolean} paused
     * @param {string} [senderName]
     * @returns {Promise<boolean>}
     */
    async setBotPaused(senderPSID, paused, senderName = null) {
        if (!senderPSID) return false;

        const isPaused = Boolean(paused);
        stateCache.set(senderPSID, { botPaused: isPaused, cachedAt: Date.now() });

        const payload = {
            sender_psid: senderPSID,
            bot_paused: isPaused,
            paused_at: isPaused ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
        };

        if (senderName && !senderName.startsWith("User ") && senderName !== "Unknown User") {
            payload.sender_name = senderName;
        }

        try {
            const { error } = await supabase
                .from(TABLE)
                .upsert(payload, { onConflict: "sender_psid" });

            if (error) {
                console.warn(`⚠️ Failed to persist UserState in Supabase:`, error.message);
            } else {
                console.log(`💾 Persisted UserState: PSID ${senderPSID} -> bot_paused: ${isPaused}`);
            }
        } catch (err) {
            console.warn(`⚠️ UserState.setBotPaused network error:`, err.message);
        }

        return isPaused;
    },

    /**
     * List all states currently tracked in cache (useful for debugging/status)
     */
    getCacheSnapshot() {
        const result = {};
        for (const [psid, info] of stateCache.entries()) {
            result[psid] = info.botPaused;
        }
        return result;
    }
};

module.exports = UserState;
