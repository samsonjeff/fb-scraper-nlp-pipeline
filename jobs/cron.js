const cron = require("node-cron");
const { runScraper } = require("../routes/scraper");

function startCronJobs() {
    const intervalSec = parseInt(process.env.SCRAPER_INTERVAL_SECONDS || "3600"); // default 1 hour
    // If interval includes seconds, use 6‑field cron syntax (node‑cron supports seconds)
    const cronExpr = intervalSec < 60
        ? `*/${intervalSec} * * * * *`
        : `*/${intervalSec / 60} * * * *`;
    console.log(`📰 Cron: FB Scraper scheduled (${intervalSec}s interval) using '${cronExpr}'`);
    cron.schedule(cronExpr, async () => {
        console.log("⏰ Cron: Running scheduled FB Page scrape...");
        try {
            await runScraper();
        } catch (err) {
            console.error("❌ Cron scraper error:", err.message);
        }
    });
}

module.exports = { startCronJobs };
