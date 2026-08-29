const axios = require("axios");

const GRAPH_VERSION = process.env.GRAPH_API_VERSION || "v25.0";

// ── In-memory profile cache ───────────────────────────────────────────────────
// Avoids hitting Meta's Graph API rate limits for repeat messages from the same
// user within a single server process lifetime.
const profileCache = new Map();

/**
 * Fetch a Messenger user's real name from the Meta Graph API.
 * Uses META_ACCESS_TOKEN (permanent long-lived token) from the environment.
 *
 * @param {string} senderPSID        - Page-Scoped User ID from the webhook event.
 * @param {string} [accessToken]     - Optional override; defaults to META_ACCESS_TOKEN env var.
 * @returns {Promise<{ name: string, firstName: string, lastName: string }>}
 */
async function getUserProfile(senderPSID, accessToken) {
    // Return cached result if already fetched this session
    if (profileCache.has(senderPSID)) {
        return profileCache.get(senderPSID);
    }

    const token = accessToken || process.env.META_ACCESS_TOKEN;

    try {
        const { data } = await axios.get(
            `https://graph.facebook.com/${GRAPH_VERSION}/${senderPSID}`,
            {
                params: {
                    fields: "first_name,last_name",
                    access_token: token
                }
            }
        );

        const profile = {
            firstName: data.first_name || "",
            lastName:  data.last_name  || "",
            name:      `${data.first_name || ""} ${data.last_name || ""}`.trim()
                           || `User ${senderPSID.slice(-4)}`
        };

        profileCache.set(senderPSID, profile);
        console.log(`👤 Profile fetched: ${profile.name} (PSID: ${senderPSID})`);
        return profile;

    } catch (err) {
        const reason = err.response?.data?.error?.message || err.message;
        console.warn(`⚠️  Could not fetch profile for PSID ${senderPSID}: ${reason}`);

        // Graceful fallback — bot continues running even if profile fetch fails
        return {
            firstName:  "",
            lastName:   "",
            name:       `User ${senderPSID.slice(-4)}`,
            profilePic: null
        };
    }
}

module.exports = { getUserProfile };
