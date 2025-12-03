const Redis = require("ioredis");
require("dotenv").config();

const redis = new Redis(process.env.REDIS_URL, {
  tls: process.env.REDIS_TLS === "true" ? {} : undefined
});

module.exports = redis;
