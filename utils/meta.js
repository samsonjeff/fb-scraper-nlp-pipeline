const axios = require("axios");

const GRAPH_VERSION = process.env.GRAPH_API_VERSION || "v25.0";

// ── In-memory profile cache ───────────────────────────────────────────────────
// Avoids hitting Meta's Graph API rate limits for repeat messages from the same
// user within a single server process lifetime.
const profileCache = new Map();

/**
 * Fetch a Messenger user's real name and profile picture from the Meta Graph API.
 *
 * @param {string} senderPSID          - Page-Scoped User ID from the webhook event.
 * @param {string} [pageAccessToken]   - Optional override; defaults to PAGE_ACCESS_TOKEN env var.
 * @returns {Promise<{
 *   name: string,
 *   firstName: string,
 *   lastName: string,
 *   profilePic: string|null
 * }>}
 */
async function getUserProfile(senderPSID, pageAccessToken) {
    // Return cached result if already fetched this session
    if (profileCache.has(senderPSID)) {
        return profileCache.get(senderPSID);
    }

    const token = pageAccessToken || process.env.PAGE_ACCESS_TOKEN;

    try {
        const { data } = await axios.get(
            `https://graph.facebook.com/${GRAPH_VERSION}/${senderPSID}`,
            {
                params: {
                    fields: "first_name,last_name,profile_pic",
                    access_token: token
                }
            }
        );

        const profile = {
            firstName:  data.first_name || "",
            lastName:   data.last_name  || "",
            name:       `${data.first_name || ""} ${data.last_name || ""}`.trim()
                            || `User ${senderPSID.slice(-4)}`,
            profilePic: data.profile_pic || null
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
