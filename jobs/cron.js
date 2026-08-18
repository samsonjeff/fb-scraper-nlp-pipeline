const cron = require("node-cron");
const { runScraper } = require("../routes/scraper");

function startCronJobs() {
    // Run FB scraper every hour at minute 0
    cron.schedule("0 * * * *", async () => {
        console.log("⏰ Cron: Running scheduled FB Page scrape...");
        try {
            await runScraper();
        } catch (err) {
            console.error("❌ Cron scraper error:", err.message);
        }
    });

    console.log("📰 Cron: FB Scraper scheduled (every hour)");
}

module.exports = { startCronJobs };
