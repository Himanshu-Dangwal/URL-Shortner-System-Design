const { MongoClient } = require("mongodb");
require("dotenv").config();

let dbPromise;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const client = new MongoClient(process.env.MONGODB_URL);
      await client.connect();
      return client.db(process.env.MONGODB_DB || "url_shortener");
    })();
  }
  return dbPromise;
}

async function logClick({ urlId, code, userAgent, ip, ts }) {
  const db = await getDb();
  await db.collection("clicks").insertOne({
    urlId,
    code,
    userAgent,
    ip,
    ts: ts || new Date()
  });
}

module.exports = { getDb, logClick };
