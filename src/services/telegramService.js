const https = require("https");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function sendTelegramAlert(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("[Telegram] Token o Chat ID no configurados.");
    return;
  }

  const postData = JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: "Markdown"
  });

  const options = {
    hostname: "api.telegram.org",
    port: 443,
    path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    res.on("data", () => {});
  });

  req.on("error", (e) => {
    console.error("[Telegram Error]:", e.message);
  });

  req.write(postData);
  req.end();
}

module.exports = { sendTelegramAlert };