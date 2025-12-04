require("dotenv").config();
const express = require("express");
const redis = require("../../libs/cache/redisClient");
const { getUrlByCode } = require("../../libs/db/pgRouter");
const { publishClickEvent } = require("../../libs/mq/rabbit");

const app = express();
const PORT = process.env.REDIRECT_PORT || process.env.PORT || 3001;

app.get("/:code", async (req, res) => {
  const { code } = req.params;
  try {
    let targetUrl = await redis.get(`code:${code}`);
    let urlRow = null;

    if (!targetUrl) {
      urlRow = await getUrlByCode(code);
      if (!urlRow) return res.status(404).send("Not found");
      targetUrl = urlRow.target_url;
      await redis.set(`code:${code}`, targetUrl, "EX", 60 * 60);
    }

    publishClickEvent({
      code,
      urlId: urlRow ? urlRow.id : null,
      userAgent: req.headers["user-agent"],
      ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      ts: new Date().toISOString()
    }).catch(err => console.error("Failed to publish click event", err));

    res.redirect(targetUrl);
  } catch (err) {
    console.error("Redirect error:", err);
    res.status(500).send("Internal error");
  }
});

app.listen(PORT, () => {
  console.log(`Redirect service listening on ${PORT}`);
});
