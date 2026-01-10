const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors({ origin: "https://elviorajewelry.lovestoblog.com", credentials: false }));
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-r1-0528:free";

const SYSTEM_PROMPT = [
  "You are the Elviora jewelry store assistant.",
  "Reply in Arabic, concise and helpful.",
  "Use ONLY the facts in SYSTEM_FACTS. If asked about anything not listed, say you do not have confirmed info and offer to connect them to support.",
  "Never invent shipping policy, countries served, delivery times, or free shipping.",
  "If asked about product details and you are unsure, ask for the product name or link.",
  "If asked about payment methods and it is not listed, say it is not confirmed."
].join(" ");

const SYSTEM_FACTS = [
  "Store name: Elviora Jewelry.",
  "Location: Damascus, سوريا.",
  "Phone/WhatsApp: 09998841365.",
  "Email: info@ElvioraJewelry.com.",
  "Main categories: accessories (necklaces, earrings, bracelets), rings, sets, diversified.",
  "Shipping: delivery داخل المدينة عادة خلال 2-4 أيام عمل حسب المنطقة وشحن للمحافظات السورية خلال 3-7 أيام عمل.",
  "Exchange: الاستبدال خلال 48 ساعة من الاستلام بشرط الحفاظ على الحالة الأصلية.",
  "Payment: الدفع عند الاستلام داخل سوريا، ويمكن توفير طرق أخرى حسب الطلب."
].join(" ");

app.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) {
    return res.status(422).json({ ok: false, error: "EMPTY" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: "NO_API_KEY" });
  }

  const payload = {
    model: MODEL,
    messages: [
      { role: "system", content: `${SYSTEM_PROMPT} SYSTEM_FACTS: ${SYSTEM_FACTS}` },
      { role: "user", content: message }
    ],
    temperature: 0.4,
    max_tokens: 350
  };

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`
  };

  if (process.env.OPENROUTER_HTTP_REFERER) {
    headers["HTTP-Referer"] = process.env.OPENROUTER_HTTP_REFERER;
  }
  if (process.env.OPENROUTER_X_TITLE) {
    headers["X-Title"] = process.env.OPENROUTER_X_TITLE;
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(500).json({ ok: false, error: "OPENROUTER_FAILED", message: data });
    }

    const reply = data?.choices?.[0]?.message?.content || "";
    if (!reply) {
      return res.status(500).json({ ok: false, error: "EMPTY_RESPONSE" });
    }

    return res.json({ ok: true, reply: String(reply).trim() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "SERVER_ERROR", message: String(err) });
  }
});

app.get("/", (req, res) => {
  res.json({ ok: true, status: "ready" });
});

app.listen(PORT, () => {
  console.log(`Elviora chat API running on ${PORT}`);
});
