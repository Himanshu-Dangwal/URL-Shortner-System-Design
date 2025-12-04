const redis = require("../cache/redisClient");

async function rateLimit({ key, limit, windowSeconds }) {
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `rate:${key}:${Math.floor(now / windowSeconds)}`;
  const count = await redis.incr(windowKey);
  if (count === 1) {
    await redis.expire(windowKey, windowSeconds);
  }
  return count <= limit;
}

module.exports = { rateLimit };
