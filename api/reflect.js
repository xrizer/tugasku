// Refleksi pola dari data tab Diri — BUKAN diagnosis.
// Pakai GEMINI_API_KEY yang sama.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { summary } = req.body || {};
  if (!summary || typeof summary !== "string" || summary.length > 8000) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const prompt = `Kamu teman yang hangat, jujur, dan suportif. Bahasa Indonesia santai (lu/gue). Ini rangkuman data self-tracking seseorang beberapa minggu terakhir:

${summary}

Tugas lu:
1. Refleksiin POLA yang keliatan dari data (misal: "kejadian X-nya numpuk pas mood lu Y"). Cuma dari data — jangan nebak-nebak yang gak ada di data.
2. Kasih 1-2 saran kecil yang praktis dan bisa langsung dicoba minggu ini.
3. Kalau datanya nunjukin lelah/sedih yang berkepanjangan atau pola yang berat, ajak dengan hangat buat ngobrol sama psikolog — sebagai langkah wajar, bukan nakut-nakutin.

ATURAN KERAS:
- DILARANG diagnosis atau pakai label klinis (depresi, anxiety, kecanduan, burnout, dll). Lu bukan psikolog dan harus bilang gitu kalau relevan.
- Jangan nge-judge, jangan menggurui, jangan drama.
- Jangan berlebihan positif juga — jujur tapi hangat.
- Maksimal 8 kalimat. Boleh 1 emoji.`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 1500,
            temperature: 0.6,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );
    const data = await r.json();
    const reflection = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!reflection) return res.status(502).json({ error: "No reflection" });
    return res.status(200).json({ reflection });
  } catch (e) {
    return res.status(500).json({ error: "AI request failed" });
  }
}
