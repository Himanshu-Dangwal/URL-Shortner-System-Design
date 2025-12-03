const { Pool } = require("pg");
require("dotenv").config();

const rwShardA = new Pool({ connectionString: process.env.PG_RW_URL_SHARD_A });
const rwShardB = new Pool({ connectionString: process.env.PG_RW_URL_SHARD_B });
const roShardA = new Pool({ connectionString: process.env.PG_RO_URL_SHARD_A });
const roShardB = new Pool({ connectionString: process.env.PG_RO_URL_SHARD_B });

function getShardByUserId(userId) {
  return userId % 2 === 0 ? "A" : "B";
}

function getPoolsForUser(userId) {
  const shard = getShardByUserId(userId);
  if (shard === "A") return { rw: rwShardA, ro: roShardA };
  return { rw: rwShardB, ro: roShardB };
}

async function createUrl({ userId, code, targetUrl }) {
  const { rw } = getPoolsForUser(userId);
  const result = await rw.query(
    `INSERT INTO urls (user_id, code, target_url)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, code, target_url`,
    [userId, code, targetUrl]
  );
  return result.rows[0];
}

async function getUrlByCode(code) {
  const resultA = await roShardA.query(
    "SELECT id, user_id, code, target_url FROM urls WHERE code = $1",
    [code]
  );
  if (resultA.rows.length) return resultA.rows[0];

  const resultB = await roShardB.query(
    "SELECT id, user_id, code, target_url FROM urls WHERE code = $1",
    [code]
  );
  if (resultB.rows.length) return resultB.rows[0];

  return null;
}

module.exports = {
  createUrl,
  getUrlByCode,
  getPoolsForUser
};
