const { runScraper } = require("../routes/scraper");

let isScraping = false;

function startCronJobs() {
    const intervalSec = parseInt(process.env.SCRAPER_INTERVAL_SECONDS || "300", 10);
    const intervalMs = Math.max(intervalSec, 10) * 1000; // minimum 10 seconds safety guard

    console.log(`📰 Cron: FB Scraper scheduled (running every ${intervalSec}s)`);

    setInterval(async () => {
        if (isScraping) {
            console.log("⏳ Scraper: Previous scrape still in progress, skipping this tick...");
            return;
        }

        isScraping = true;
        console.log("⏰ Cron: Running scheduled FB Page scrape...");
        try {
            await runScraper();
        } catch (err) {
            console.error("❌ Cron scraper error:", err.message);
        } finally {
            isScraping = false;
        }
    }, intervalMs);
}

module.exports = { startCronJobs };
