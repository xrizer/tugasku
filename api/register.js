// Register founder baru — TANPA buka public signup.
// Validasi invite code di server, lalu bikin akun via Supabase Admin API.
//
// Env vars yang dibutuhkan di Vercel (TANPA prefix VITE_):
//   SUPABASE_URL               = https://xxxx.supabase.co (sama kayak VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY  = secret key (Settings -> API -> service_role / sb_secret)
//   INVITE_CODE                = kode rahasia yang lu bagiin ke co-founder

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { username, password, invite } = req.body || {};

  if (!invite || invite !== process.env.INVITE_CODE) {
    return res.status(403).json({ error: "Invite code salah." });
  }

  const u = String(username || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,20}$/.test(u)) {
    return res.status(400).json({
      error: "Username 2-20 karakter: huruf kecil, angka, titik, strip, underscore.",
    });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "Password minimal 6 karakter." });
  }

  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email: `${u}@tugasku.local`,
        password,
        email_confirm: true, // langsung aktif, gak nunggu verifikasi email
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = data?.msg || data?.message || "";
      if (/already|exists|registered/i.test(msg)) {
        return res.status(409).json({ error: "Username udah kepake." });
      }
      return res.status(502).json({ error: "Gagal bikin akun: " + msg });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Server error." });
  }
}
