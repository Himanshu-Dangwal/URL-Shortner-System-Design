const amqp = require("amqplib");
require("dotenv").config();

let channelPromise;

async function getChannel() {
  if (!channelPromise) {
    channelPromise = (async () => {
      const conn = await amqp.connect(process.env.RABBITMQ_URL);
      const ch = await conn.createChannel();
      await ch.assertQueue("click_events", { durable: true });
      return ch;
    })();
  }
  return channelPromise;
}

async function publishClickEvent(event) {
  const ch = await getChannel();
  ch.sendToQueue("click_events", Buffer.from(JSON.stringify(event)), {
    persistent: true
  });
}

async function consumeClickEvents(onMessage) {
  const ch = await getChannel();
  await ch.consume("click_events", msg => {
    if (!msg) return;
    const data = JSON.parse(msg.content.toString());
    Promise.resolve(onMessage(data))
      .then(() => ch.ack(msg))
      .catch(err => {
        console.error("Worker error, nacking:", err);
        ch.nack(msg, false, true);
      });
  });
}

module.exports = { publishClickEvent, consumeClickEvents };
