/***********************
 * Elviora AI Chat API
 * FINAL STABLE VERSION
 ***********************/

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch"); // مهم جداً

const app = express();

/* ---------- CORS ---------- */
app.use(
  cors({
    origin: [
      "https://elviorajewelry.lovestoblog.com",
      "http://localhost",
      "http://localhost:8080",
      "http://127.0.0.1",
      "http://127.0.0.1:8080"
    ],
    methods: ["POST", "GET"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false
  })
);

app.use(express.json({ limit: "1mb" }));

/* ---------- ENV ---------- */
const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-r1-0528:free";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

const PRODUCTS_URL =
  process.env.PRODUCTS_URL ||
  "https://elviorajewelry.lovestoblog.com/actions/get_products.php?limit=200&offset=0";

const PRODUCTS_CACHE_MS = Number(process.env.PRODUCTS_CACHE_MS || 5 * 60 * 1000);

/* ---------- SYSTEM PROMPTS ---------- */
const SYSTEM_PROMPT = `
You are the Elviora jewelry store assistant.
Reply in the same language as the user (Arabic or English).
Be concise, friendly, and helpful.
Never invent information.
If you are unsure, say so and offer support contact.
`;

const SYSTEM_FACTS = `
Store name: Elviora Jewelry
Location: Damascus, Syria
Phone/WhatsApp: 09998841365
Email: info@ElvioraJewelry.com
Categories: necklaces, earrings, bracelets, rings, sets, diversified
Shipping: inside Damascus 2-4 days, other Syrian cities 3-7 days
Exchange: within 48 hours if unused
Payment: cash on delivery inside Syria
`;

/* ---------- PRODUCT CACHE ---------- */
const productCache = {
  at: 0,
  text: ""
};

const buildProductsText = (products) => {
  if (!Array.isArray(products)) return "";
  return products
    .map((p) => {
      if (!p.name) return "";
      return `- ${p.name} | ${p.category_name || "غير محدد"} | ${
        p.material || "غير محدد"
      } | ${p.price_usd || "?"}$`;
    })
    .filter(Boolean)
    .join("\n");
};

const getProductsContext = async () => {
  const now = Date.now();
  if (productCache.text && now - productCache.at < PRODUCTS_CACHE_MS) {
    return productCache.text;
  }

  try {
    const res = await fetch(PRODUCTS_URL);
    const data = await res.json();

    if (!res.ok || !data.ok) return productCache.text || "";

    const text = buildProductsText(data.products || []);
    productCache.at = now;
    productCache.text = text;
    return text;
  } catch (err) {
    console.error("Product fetch failed:", err);
    return productCache.text || "";
  }
};

/* ---------- CHAT ENDPOINT ---------- */
app.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) {
    return res.status(422).json({ ok: false, error: "EMPTY_MESSAGE" });
  }

  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({ ok: false, error: "NO_API_KEY" });
  }

  try {
    const productsText = await getProductsContext();

    const payload = {
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `${SYSTEM_PROMPT}\n\nSYSTEM_FACTS:\n${SYSTEM_FACTS}`
        },
        {
          role: "system",
          content: `KNOWN_PRODUCTS:\n${
            productsText || "لا توجد بيانات منتجات حالياً."
          }`
        },
        {
          role: "user",
          content: message
        }
      ],
      temperature: 0.4,
      max_tokens: 350
    };

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenRouter error:", data);
      return res.status(500).json({
        ok: false,
        error: "OPENROUTER_FAILED",
        details: data
      });
    }

    const choice = data?.choices?.[0] || {};
    const reply =
      choice?.message?.content ||
      choice?.message?.reasoning ||
      choice?.text ||
      "";

    if (!reply) {
      return res.status(500).json({
        ok: false,
        error: "EMPTY_RESPONSE",
        raw: data
      });
    }

    return res.json({ ok: true, reply: String(reply).trim() });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      message: String(err)
    });
  }
});

/* ---------- HEALTH CHECK ---------- */
app.get("/", (req, res) => {
  res.json({ ok: true, status: "Elviora chat API ready" });
});

/* ---------- START ---------- */
app.listen(PORT, () => {
  console.log(`✅ Elviora Chat API running on port ${PORT}`);
});
