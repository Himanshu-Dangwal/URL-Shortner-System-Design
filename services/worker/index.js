require("dotenv").config();
const { consumeClickEvents } = require("../../libs/mq/rabbit");
const { logClick } = require("../../libs/db/mongo");

async function main() {
  await consumeClickEvents(async event => {
    console.log("Processing click event:", event);
    await logClick({
      urlId: event.urlId,
      code: event.code,
      userAgent: event.userAgent,
      ip: event.ip,
      ts: new Date(event.ts)
    });
  });
}

main().catch(err => {
  console.error("Worker failed:", err);
  process.exit(1);
});
