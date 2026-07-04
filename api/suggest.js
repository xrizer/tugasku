// Vercel serverless function — proxy ke Gemini biar API key gak keekspos di frontend.
// Set env var GEMINI_API_KEY di Vercel (TANPA prefix VITE_).

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body || {};
  if (!text || typeof text !== "string" || text.length > 500) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const prompt = `Kamu adalah teman yang santai dan suportif, ngomong bahasa Indonesia gaul (pakai "lu/gue"). Seseorang lagi resah dan nulis ini di aplikasi task management-nya:

"${text}"

Kasih respon SINGKAT (maksimal 2 kalimat): satu saran praktis kecil yang bisa langsung dilakuin, boleh dibumbui humor ringan. Jangan menggurui, jangan pakai emoji berlebihan (maksimal 1), jangan nyuruh "konsultasi ke profesional" kecuali topiknya berat banget.`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 1000,
            temperature: 0.9,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );
    const data = await r.json();
    const suggestion = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!suggestion) {
      return res.status(502).json({ error: "No suggestion" });
    }
    return res.status(200).json({ suggestion });
  } catch (e) {
    return res.status(500).json({ error: "AI request failed" });
  }
}
