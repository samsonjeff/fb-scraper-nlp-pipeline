const express = require("express");
const axios = require("axios");
const supabase = require("../supabase/client");
const { detectBarangay, detectIncidentType } = require("../utils/barangays");
const { requireApiKey } = require("../utils/auth");

const router = express.Router();

// Track last scrape for the status endpoint
let lastScrapeResult = { ran: false, timestamp: null, postsFound: 0, commentsFound: 0, error: null };

/**
 * Core scraper logic — fetches posts + comments from the FB Page via Graph API.
 */
async function runScraper() {
    const PAGE_ID = process.env.FB_PAGE_ID;
    const TOKEN = process.env.PAGE_ACCESS_TOKEN;
    const API_VERSION = process.env.GRAPH_API_VERSION || "v25.0";

    if (!PAGE_ID || !TOKEN) {
        throw new Error("Missing FB_PAGE_ID or PAGE_ACCESS_TOKEN in .env");
    }

    console.log("📰 Scraper: Starting FB Page scrape...");

    let postsUpserted = 0;
    let commentsUpserted = 0;

    // ── 1. Fetch recent posts ────────────────────────────────────────────────
    const postsUrl = `https://graph.facebook.com/${API_VERSION}/${PAGE_ID}/posts`;
    const postsRes = await axios.get(postsUrl, {
        params: {
            fields: "id,message,created_time",
            limit: 25,
            access_token: TOKEN
        }
    });

    const posts = postsRes.data?.data || [];
    console.log(`📰 Scraper: Fetched ${posts.length} posts`);

    for (const post of posts) {
        const caption = post.message || "";
        const barangay = detectBarangay(caption);

        // Upsert post (skip if already exists)
        const { error: postErr } = await supabase
            .from("fb_posts")
            .upsert({
                id: post.id,
                caption,
                post_date: post.created_time,
                barangay
            }, { onConflict: "id" });

        if (postErr) {
            console.error(`❌ Scraper: Failed to upsert post ${post.id}:`, postErr.message);
            continue;
        }
        postsUpserted++;

        // ── 2. Fetch comments for this post ──────────────────────────────────
        try {
            const commentsUrl = `https://graph.facebook.com/${API_VERSION}/${post.id}/comments`;
            const commentsRes = await axios.get(commentsUrl, {
                params: {
                    fields: "id,from,message,created_time",
                    limit: 100,
                    access_token: TOKEN
                }
            });

            const comments = commentsRes.data?.data || [];

            for (const comment of comments) {
                const commentText = comment.message || "";
                const commentBarangay = detectBarangay(commentText);
                const incidentType = detectIncidentType(commentText);

                // Parse date and time from created_time
                const commentDt = new Date(comment.created_time);
                const commentDate = commentDt.toISOString().split("T")[0]; // YYYY-MM-DD
                const commentTime = commentDt.toISOString().split("T")[1].split(".")[0]; // HH:MM:SS

                const { error: commentErr } = await supabase
                    .from("fb_comments")
                    .upsert({
                        id: comment.id,
                        post_id: post.id,
                        user_name: comment.from?.name || "Unknown",
                        comment_text: commentText,
                        comment_date: commentDate,
                        comment_time: commentTime,
                        barangay: commentBarangay,
                        incident_type: incidentType
                    }, { onConflict: "id" });

                if (commentErr) {
                    console.error(`❌ Scraper: Failed to upsert comment ${comment.id}:`, commentErr.message);
                    continue;
                }
                commentsUpserted++;
            }
        } catch (commentFetchErr) {
            // Some posts may not allow comment fetching — log and continue
            console.warn(`⚠️ Scraper: Could not fetch comments for post ${post.id}:`, commentFetchErr.message);
        }
    }

    const result = {
        ran: true,
        timestamp: new Date().toISOString(),
        postsFound: postsUpserted,
        commentsFound: commentsUpserted,
        error: null
    };
    lastScrapeResult = result;

    console.log(`✅ Scraper: Done — ${postsUpserted} posts, ${commentsUpserted} comments saved`);
    return result;
}

// ── POST /scraper/run — manually trigger scrape ─────────────────────────────
router.post("/run", requireApiKey, async (req, res) => {
    try {
        const result = await runScraper();
        res.json({ success: true, ...result });
    } catch (err) {
        console.error("❌ Scraper run error:", err.message);
        lastScrapeResult = { ran: true, timestamp: new Date().toISOString(), postsFound: 0, commentsFound: 0, error: err.message };
        res.status(500).json({ error: err.message });
    }
});

// ── GET /scraper/status — quick health check ────────────────────────────────
router.get("/status", (req, res) => {
    res.json({
        scraper: "FB Page Scraper",
        lastRun: lastScrapeResult.timestamp,
        postsFound: lastScrapeResult.postsFound,
        commentsFound: lastScrapeResult.commentsFound,
        lastError: lastScrapeResult.error
    });
});

module.exports = router;
module.exports.runScraper = runScraper;
