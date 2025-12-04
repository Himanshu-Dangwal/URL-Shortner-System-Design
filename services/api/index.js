require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const { generateCode } = require("../../libs/utils/hash");
const { createUrl } = require("../../libs/db/pgRouter");
const redis = require("../../libs/cache/redisClient");
const { rateLimit } = require("../../libs/utils/rateLimiter");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.API_PORT || process.env.PORT || 3000;

function getUserId(req) {
  const userId = parseInt(req.header("x-user-id") || "1", 10);
  return Number.isNaN(userId) ? 1 : userId;
}

app.post("/shorten", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { url } = req.body;

    if (!url) return res.status(400).json({ error: "url required" });

    const allowed = await rateLimit({
      key: `shorten:${userId}`,
      limit: 20,
      windowSeconds: 60
    });
    if (!allowed) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    const code = generateCode();
    const urlRow = await createUrl({ userId, code, targetUrl: url });

    await redis.set(`code:${code}`, urlRow.target_url, "EX", 60 * 60);

    res.json({
      code,
      shortUrl: `${process.env.PUBLIC_REDIRECT_BASE_URL}/${code}`
    });
  } catch (err) {
    console.error("Error in /shorten", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/stats/:code", async (req, res) => {
  const { code } = req.params;
  res.json({ code, clicks: 0 });
});

app.listen(PORT, () => {
  console.log(`API service listening on ${PORT}`);
});
