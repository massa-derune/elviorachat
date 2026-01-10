const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors({ origin: "https://elviorajewelry.lovestoblog.com", credentials: false }));
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-r1-0528:free";
const PRODUCTS_URL = process.env.PRODUCTS_URL
  || "https://elviorajewelry.lovestoblog.com/actions/get_products.php?limit=200&offset=0";
const PRODUCTS_CACHE_MS = Number(process.env.PRODUCTS_CACHE_MS || 5 * 60 * 1000);

const SYSTEM_PROMPT = [
  "You are the Elviora jewelry store assistant.",
  "Reply in the same language as the user, concise and helpful.",
  "Use ONLY the facts in SYSTEM_FACTS and the product list in KNOWN_PRODUCTS.",
  "If asked about anything not listed, say you do not have confirmed info and offer to connect them to support.",
  "Never invent shipping policy, countries served, delivery times, or free shipping.",
  "If asked about product details and you are unsure, ask for the product name or link.",
  "If asked about payment methods and it is not listed, say it is not confirmed.",
  "If asked to suggest, pick 2-3 items from KNOWN_PRODUCTS and include price."
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

const productCache = {
  at: 0,
  text: ""
};

const buildProductsText = (products) => {
  if (!Array.isArray(products) || products.length === 0) return "";
  const lines = products.map((p) => {
    const name = String(p.name || "").trim();
    const category = String(p.category_name || "").trim();
    const price = (p.price_usd !== undefined && p.price_usd !== null)
      ? String(p.price_usd)
      : "";
    const material = String(p.material_name || p.material || "").trim();
    if (!name) return "";
    return `- ${name} | ${category || "غير محدد"} | ${material || "غير محدد"} | ${price}$`;
  }).filter(Boolean);
  return lines.join("\n");
};

const getProductsContext = async () => {
  const now = Date.now();
  if (productCache.text && (now - productCache.at) < PRODUCTS_CACHE_MS) {
    return productCache.text;
  }
  try {
    const res = await fetch(PRODUCTS_URL);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return productCache.text || "";
    }
    const text = buildProductsText(data.products || []);
    productCache.at = now;
    productCache.text = text;
    return text;
  } catch {
    return productCache.text || "";
  }
};

app.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) {
    return res.status(422).json({ ok: false, error: "EMPTY" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: "NO_API_KEY" });
  }

  const productsText = await getProductsContext();
  const payload = {
    model: MODEL,
    messages: [
      { role: "system", content: `${SYSTEM_PROMPT} SYSTEM_FACTS: ${SYSTEM_FACTS}` },
      { role: "system", content: `KNOWN_PRODUCTS:\n${productsText || "لا توجد بيانات منتجات حالياً."}` },
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
