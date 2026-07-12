import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";

// LifeHack by afifi — a dead-simple personal ticketing board, backed by Supabase.
// Flow: Todo → (Terima/Accept) → In Progress → (Selesai) → Completed.
// Daily tasks auto-reset to Todo every new day (via done_date check on load).
// Data syncs across devices.

const todayStr = () => new Date().toISOString().slice(0, 10);

const COLLAPSE_KEY = "tugasku-collapsed";

const THEMES = {
  light: {
    "--bg": "#F6F4EF",
    "--ink": "#2B2822",
    "--muted": "#8A8578",
    "--muted2": "#6E6A5E",
    "--faint": "#A5A093",
    "--accent": "#E4572E",
    "--accent-border": "#F0C4B4",
    "--accent-bg": "#FFF4EC",
    "--border": "#E3DFD4",
    "--border2": "#D9D4C8",
    "--badge": "#E8E4DA",
    "--card": "#FFFFFF",
    "--card2": "#FDFCFA",
    "--green-bg": "#EDF6EE",
    "--green-border": "#BFDCC2",
    "--green": "#3E7A46",
    "--green-dark": "#2E5934",
    "--dump-bg": "#EFEBE2",
    "--dump-border": "#C9C2B2",
    "--janji-bg": "#FBF6E9",
    "--janji-border": "#E6D9B8",
    "--janji-ink": "#7A5C1E",
    "--red": "#C0392B",
    "--red-bg": "#FDF1EF",
  },
  dark: {
    "--bg": "#16140F",
    "--ink": "#EDEAE0",
    "--muted": "#9C968A",
    "--muted2": "#B3AC9E",
    "--faint": "#6E6A5E",
    "--accent": "#F26B3F",
    "--accent-border": "#5C2E1E",
    "--accent-bg": "#2A1B13",
    "--border": "#34302A",
    "--border2": "#3D3931",
    "--badge": "#34302A",
    "--card": "#211E18",
    "--card2": "#26231C",
    "--green-bg": "#17241A",
    "--green-border": "#2C4A33",
    "--green": "#8FCF9A",
    "--green-dark": "#3E8A4C",
    "--dump-bg": "#1D1B15",
    "--dump-border": "#45402F",
    "--janji-bg": "#231E10",
    "--janji-border": "#4C4223",
    "--janji-ink": "#D9B25C",
    "--red": "#E0604F",
    "--red-bg": "#2C1712",
  },
};

const THEME_KEY = "tugasku-theme";

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(COLLAPSE_KEY)) || {};
    } catch {
      return {};
    }
  });
  const toggle = (key) =>
    setCollapsed((c) => {
      const next = { ...c, [key]: !c[key] };
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  return [collapsed, toggle];
}

export default function LifeHack() {
  const [session, setSession] = useState(undefined); // undefined = checking
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDaily, setNewDaily] = useState(false);
  const [newPriority, setNewPriority] = useState(1);
  const [worries, setWorries] = useState([]);
  const [worryText, setWorryText] = useState("");
  const [released, setReleased] = useState(0);
  const [promises, setPromises] = useState([]);
  const [promForm, setPromForm] = useState({ text: "", to_whom: "", due_date: "" });
  const [showPromForm, setShowPromForm] = useState(false);
  const [collapsed, toggleCollapsed] = useCollapsed();
  const [page, setPage] = useState("home");
  const [dark, setDark] = useState(() => {
    try {
      const s = localStorage.getItem(THEME_KEY);
      if (s) return s === "dark";
    } catch {}
    return (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  });
  const toggleTheme = () =>
    setDark((d) => {
      const n = !d;
      try {
        localStorage.setItem(THEME_KEY, n ? "dark" : "light");
      } catch {}
      return n;
    });
  useEffect(() => {
    document.body.style.background = dark ? "#16140F" : "#F6F4EF";
    document.body.style.margin = "0";
  }, [dark]);

  const [showPassForm, setShowPassForm] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [passMsg, setPassMsg] = useState("");

  const changePassword = async () => {
    if (newPass.length < 6) {
      setPassMsg("Minimal 6 karakter.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) {
      setPassMsg("Gagal: " + error.message);
    } else {
      setPassMsg("");
      setNewPass("");
      setShowPassForm(false);
      alert("Password berhasil diganti ✓");
    }
  };

  const themeVars = {
    ...(dark ? THEMES.dark : THEMES.light),
    colorScheme: dark ? "dark" : "light",
  };

  // ---------- auth ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  // ---------- load + daily reset ----------
  useEffect(() => {
    if (!session) return;
    (async () => {
      let { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: true });

      if (error) {
        setError(error.message);
        return;
      }

      // auto-clean: task selesai (non-harian) lebih dari 2 hari -> hapus
      const cutoff = Date.now() - 2 * 86400000;
      const expired = data.filter(
        (t) =>
          t.status === "done" &&
          !t.daily &&
          t.done_at &&
          new Date(t.done_at).getTime() < cutoff
      );
      if (expired.length > 0) {
        const ids = expired.map((t) => t.id);
        await supabase.from("tasks").delete().in("id", ids);
        data = data.filter((t) => !ids.includes(t.id));
      }

      // reset daily tasks that were completed on a previous day
      const stale = data.filter(
        (t) => t.daily && t.status === "done" && t.done_date !== todayStr()
      );
      if (stale.length > 0) {
        const ids = stale.map((t) => t.id);
        await supabase
          .from("tasks")
          .update({ status: "todo", done_date: null })
          .in("id", ids);
        data.forEach((t) => {
          if (ids.includes(t.id)) {
            t.status = "todo";
            t.done_date = null;
          }
        });
      }
      setTasks(data);

      const w = await supabase
        .from("worries")
        .select("*")
        .order("created_at", { ascending: true });
      if (!w.error) setWorries(w.data);

      const p = await supabase
        .from("promises")
        .select("*")
        .eq("done", false)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (!p.error) setPromises(p.data);
    })();
  }, [session]);

  // ---------- actions (optimistic: update UI first, then sync) ----------
  const move = async (id, status) => {
    const patch =
      status === "done"
        ? { status, done_date: todayStr(), done_at: new Date().toISOString() }
        : { status, done_date: null, done_at: null };
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) setError(error.message);
  };

  const remove = async (id) => {
    setTasks((ts) => ts.filter((t) => t.id !== id));
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) setError(error.message);
  };

  const addTask = async () => {
    const title = newTitle.trim();
    if (!title) return;
    const draft = {
      title,
      priority: newPriority,
      daily: newDaily,
      status: "todo",
    };
    setNewTitle("");
    setNewDaily(false);
    setNewPriority(1);

    const { data, error } = await supabase
      .from("tasks")
      .insert(draft)
      .select()
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setTasks((ts) => [...ts, data]);
  };

  // ---------- brain dump ----------
  const addWorry = async () => {
    const text = worryText.trim();
    if (!text) return;
    setWorryText("");
    const { data, error } = await supabase
      .from("worries")
      .insert({ text })
      .select()
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setWorries((ws) => [...ws, data]);
  };

  // bisa dikontrol → jadi tiket
  const worryToTask = async (w) => {
    setWorries((ws) => ws.filter((x) => x.id !== w.id));
    const { data, error } = await supabase
      .from("tasks")
      .insert({ title: w.text, priority: 1, daily: false, status: "todo" })
      .select()
      .single();
    if (!error) setTasks((ts) => [...ts, data]);
    await supabase.from("worries").delete().eq("id", w.id);
  };

  const togglePublic = async (t) => {
    const v = !t.is_public;
    setTasks((ts) =>
      ts.map((x) => (x.id === t.id ? { ...x, is_public: v } : x))
    );
    await supabase.from("tasks").update({ is_public: v }).eq("id", t.id);
  };

  // ---------- edit ----------
  const editTask = async (id, title) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, title } : t)));
    await supabase.from("tasks").update({ title }).eq("id", id);
  };

  const editWorry = async (id, text) => {
    setWorries((ws) => ws.map((w) => (w.id === id ? { ...w, text } : w)));
    await supabase.from("worries").update({ text }).eq("id", id);
  };

  const editPromise = async (id, text) => {
    setPromises((ps) => ps.map((p) => (p.id === id ? { ...p, text } : p)));
    await supabase.from("promises").update({ text }).eq("id", id);
  };

  const gcalUrl = (p) => {
    // all-day event on due date
    const d = p.due_date.replace(/-/g, "");
    const next = new Date(p.due_date + "T00:00:00");
    next.setDate(next.getDate() + 1);
    const d2 = next.toISOString().slice(0, 10).replace(/-/g, "");
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: `Janji: ${p.text}${p.to_whom ? " (ke " + p.to_whom + ")" : ""}`,
      dates: `${d}/${d2}`,
      details: "Dari LifeHack by afifi — janji yang harus ditepati.",
    });
    return `https://calendar.google.com/calendar/render?${params}`;
  };

  // ---------- janji ----------
  const addPromise = async () => {
    const text = promForm.text.trim();
    if (!text) return;
    const row = {
      text,
      to_whom: promForm.to_whom.trim() || null,
      due_date: promForm.due_date || null,
    };
    setPromForm({ text: "", to_whom: "", due_date: "" });
    setShowPromForm(false);
    const { data, error } = await supabase
      .from("promises")
      .insert(row)
      .select()
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setPromises((ps) =>
      [...ps, data].sort((a, b) =>
        (a.due_date || "9999") < (b.due_date || "9999") ? -1 : 1
      )
    );
  };

  const keepPromise = async (id) => {
    setPromises((ps) => ps.filter((p) => p.id !== id));
    await supabase.from("promises").update({ done: true }).eq("id", id);
  };

  const removePromise = async (id) => {
    setPromises((ps) => ps.filter((p) => p.id !== id));
    await supabase.from("promises").delete().eq("id", id);
  };

  const [suggestions, setSuggestions] = useState({}); // {worryId: text | "..."}

  const suggestAI = async (w) => {
    setSuggestions((s) => ({ ...s, [w.id]: "..." }));
    try {
      const r = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: w.text }),
      });
      const data = await r.json();
      setSuggestions((s) => ({
        ...s,
        [w.id]: data.suggestion || "Hmm, AI-nya lagi bengong. Coba lagi.",
      }));
    } catch {
      setSuggestions((s) => ({
        ...s,
        [w.id]: "Gagal konek ke AI — cek env GEMINI_API_KEY di Vercel.",
      }));
    }
  };

  // gak bisa dikontrol → lepasin
  const releaseWorry = async (id) => {
    setWorries((ws) => ws.filter((x) => x.id !== id));
    setReleased((n) => n + 1);
    await supabase.from("worries").delete().eq("id", id);
  };

  // ---------- render ----------
  const shareId = new URLSearchParams(window.location.search).get("share");
  if (shareId) return <PublicView userId={shareId} themeVars={themeVars} />;

  if (session === undefined)
    return (
      <div style={{ ...S.page, ...themeVars, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--muted)", fontSize: 14 }}>Memuat…</span>
      </div>
    );

  if (!session) return <Login themeVars={themeVars} />;

  if (error)
    return (
      <div style={{ ...S.page, ...themeVars, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...S.focusCard, maxWidth: 480 }}>
          <div style={{ ...S.focusLabel }}>Gagal terhubung ke database</div>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>
            {error}
            <br />
            <br />
            Cek: (1) env <code>VITE_SUPABASE_URL</code> dan{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> sudah diisi, (2) tabel{" "}
            <code>tasks</code> sudah dibuat lewat <code>supabase-setup.sql</code>.
          </div>
        </div>
      </div>
    );

  if (!tasks)
    return (
      <div style={{ ...S.page, ...themeVars, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--muted)", fontSize: 14 }}>Memuat…</span>
      </div>
    );

  const byStatus = (s) =>
    tasks.filter((t) => t.status === s).sort((a, b) => a.priority - b.priority);

  const todo = byStatus("todo");
  const doing = byStatus("inprogress");
  const done = byStatus("done");

  // the single most important thing right now
  const focus = doing[0] || todo[0] || null;

  const dateLabel = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div style={{ ...S.page, ...themeVars }}>
      <style>{FIRE_CSS}</style>
      <div className="lh-wrap">
        {/* header */}
        <div
          style={{
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div>
            <div style={S.eyebrow}>{dateLabel}</div>
            <h1 style={S.h1}>LifeHack</h1>
            <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 2 }}>by afifi</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              style={S.themeBtn}
              onClick={toggleTheme}
              title={dark ? "Mode terang" : "Mode gelap"}
            >
              {dark ? "☀️" : "🌙"}
            </button>
            <button
              style={{ ...S.themeBtn, fontSize: 13 }}
              onClick={() => {
                const url = `${window.location.origin}?share=${session.user.id}`;
                navigator.clipboard
                  .writeText(url)
                  .then(() => alert("Link publik kecopy ✓\n" + url))
                  .catch(() => prompt("Copy link ini:", url));
              }}
              title="Copy link papan publik"
            >
              🔗
            </button>
            <button
              style={{ ...S.themeBtn, fontSize: 13, color: "var(--muted)" }}
              onClick={() => setShowPassForm((v) => !v)}
              title="Ganti password"
            >
              🔑
            </button>
            <button
              style={{ ...S.themeBtn, fontSize: 13, color: "var(--muted)" }}
              onClick={() => supabase.auth.signOut()}
              title="Keluar"
            >
              keluar
            </button>
          </div>
        </div>

        <div style={S.nav}>
          {["home", "tugas", "barang", "duit", "diri"].map((p) => (
            <button
              key={p}
              style={{ ...S.navBtn, ...(page === p ? S.navBtnActive : {}) }}
              onClick={() => setPage(p)}
            >
              {p === "home" ? "Home" : p === "tugas" ? "Tugas" : p === "barang" ? "Barang" : p === "duit" ? "Duit" : "Diri"}
            </button>
          ))}
        </div>

        {page === "barang" && <BarangPage session={session} />}
        {page === "duit" && <DuitPage session={session} />}
        {page === "diri" && <DiriPage session={session} />}
        {page === "home" && <HomePage session={session} go={setPage} />}

        {page === "tugas" && showPassForm && (
          <div style={{ ...S.promBox, background: "var(--card)", border: "1px solid var(--border)" }}>
            <div style={{ ...S.dumpTitle, marginBottom: 8 }}>Ganti password</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="password"
                style={{ ...S.input, flex: 1, minWidth: 0 }}
                placeholder="Password baru (min. 6 karakter)"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && changePassword()}
              />
              <button style={{ ...S.addBtn, width: 60 }} onClick={changePassword}>
                OK
              </button>
            </div>
            {passMsg && (
              <div style={{ color: "var(--red)", fontSize: 13, marginTop: 6 }}>{passMsg}</div>
            )}
          </div>
        )}

        {page === "tugas" && (
        <>
        {/* focus card — one thing at a time */}
        {focus && (
          <div
            style={{
              ...S.focusCard,
              ...(focus.status === "inprogress"
                ? { animation: "emberGlow 1.8s ease-in-out infinite" }
                : {}),
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {focus.status === "inprogress" && <Flame />}
              <div style={{ ...S.focusLabel, marginBottom: 0 }}>
                {focus.status === "inprogress"
                  ? "Lagi dikerjain — jangan pindah dulu"
                  : "Fokus sekarang"}
              </div>
            </div>
            <div style={{ height: 6 }} />
            <div style={S.focusTitle}>{focus.title}</div>
            {focus.status === "todo" ? (
              <button style={S.focusBtn} onClick={() => move(focus.id, "inprogress")}>
                Terima & mulai →
              </button>
            ) : (
              <button style={S.focusBtn} onClick={() => move(focus.id, "done")}>
                Tandai selesai ✓
              </button>
            )}
          </div>
        )}
        {!focus && (
          <div style={{ ...S.focusCard, background: "var(--green-bg)", borderColor: "var(--green-border)" }}>
            <div style={{ ...S.focusLabel, color: "var(--green)" }}>Semua beres</div>
            <div style={{ ...S.focusTitle, color: "var(--green-dark)" }}>
              Tidak ada tugas tersisa hari ini. 🎉
            </div>
          </div>
        )}

        {/* janji — hal yang gak boleh kelupaan */}
        <div
          style={
            collapsed.janji
              ? { marginBottom: 10, padding: "4px 2px" }
              : S.promBox
          }
        >
          <div style={{ ...S.dumpHead, cursor: "pointer", userSelect: "none" }}>
            <span
              style={{ ...S.dumpTitle, color: "var(--janji-ink)" }}
              onClick={() => toggleCollapsed("janji")}
            >
              <span style={S.chev}>{collapsed.janji ? "▸" : "▾"}</span> Janji yang
              harus ditepati
              {collapsed.janji && promises.length > 0 && (
                <span style={S.miniCount}>{promises.length}</span>
              )}
            </span>
            {!collapsed.janji && (
              <button
                style={S.promAddLink}
                onClick={() => setShowPromForm((v) => !v)}
              >
                {showPromForm ? "batal" : "+ janji baru"}
              </button>
            )}
          </div>
          {!collapsed.janji && (
          <>

          {showPromForm && (
            <div style={{ marginBottom: 10 }}>
              <input
                style={{ ...S.input, width: "100%", boxSizing: "border-box", marginBottom: 6 }}
                placeholder="Janji apa? (misal: kirim laporan ke Rendy)"
                value={promForm.text}
                onChange={(e) => setPromForm({ ...promForm, text: e.target.value })}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  style={{ ...S.input, flex: 1, minWidth: 0 }}
                  placeholder="Ke siapa?"
                  value={promForm.to_whom}
                  onChange={(e) => setPromForm({ ...promForm, to_whom: e.target.value })}
                />
                <input
                  type="date"
                  style={{ ...S.input, flex: 1, minWidth: 0 }}
                  value={promForm.due_date}
                  onChange={(e) => setPromForm({ ...promForm, due_date: e.target.value })}
                />
                <button style={{ ...S.addBtn, width: 60 }} onClick={addPromise}>
                  OK
                </button>
              </div>
            </div>
          )}

          {promises.length === 0 && !showPromForm && (
            <div style={S.dumpHint}>Gak ada janji tertunda. Aman.</div>
          )}

          {promises.map((p) => {
            const overdue = p.due_date && p.due_date < todayStr();
            const today = p.due_date === todayStr();
            return (
              <div
                key={p.id}
                style={{
                  ...S.worryCard,
                  ...(overdue
                    ? { borderLeft: "3px solid var(--red)", background: "var(--red-bg)" }
                    : today
                    ? { borderLeft: "3px solid #B8860B", background: "var(--janji-bg)" }
                    : {}),
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <EditableText
                    value={p.text}
                    onSave={(v) => editPromise(p.id, v)}
                    style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}
                  />
                  <div style={{ ...S.dumpHint, marginBottom: 0, marginTop: 3 }}>
                    {p.to_whom && <>ke <b>{p.to_whom}</b> · </>}
                    {overdue && (
                      <span style={{ color: "var(--red)", fontWeight: 700 }}>
                        TELAT — {p.due_date}
                      </span>
                    )}
                    {today && (
                      <span style={{ color: "var(--janji-ink)", fontWeight: 700 }}>
                        HARI INI
                      </span>
                    )}
                    {!overdue && !today && p.due_date && <>sampai {p.due_date}</>}
                    {!p.due_date && <>tanpa deadline</>}
                  </div>
                </div>
                <div style={S.cardBtns}>
                  {p.due_date && (
                    <a
                      href={gcalUrl(p)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ ...S.btnGhost, textDecoration: "none", display: "inline-block" }}
                      title="Tambah ke Google Calendar"
                    >
                      📅
                    </a>
                  )}
                  <button
                    style={{ ...S.btn, background: "var(--green-dark)" }}
                    onClick={() => keepPromise(p.id)}
                  >
                    Ditepati ✓
                  </button>
                  <button style={S.btnGhost} onClick={() => removePromise(p.id)}>
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
          </>
          )}
        </div>

        {/* add */}
        <div style={S.addRow}>
          <input
            style={S.input}
            placeholder="Tambah tugas baru…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
          />
          <button style={S.addBtn} onClick={addTask}>+</button>
        </div>
        {newTitle.trim() !== "" && (
          <div style={S.addOpts}>
            <label style={S.optLabel}>
              <input
                type="checkbox"
                checked={newDaily}
                onChange={(e) => setNewDaily(e.target.checked)}
              />{" "}
              Tugas harian (reset tiap hari)
            </label>
            <label style={S.optLabel}>
              <input
                type="checkbox"
                checked={newPriority === 0}
                onChange={(e) => setNewPriority(e.target.checked ? 0 : 1)}
              />{" "}
              Penting
            </label>
          </div>
        )}

        {/* brain dump — tumpahin dulu, sortir belakangan */}
        <div
          style={
            collapsed.dump
              ? { marginTop: 14, padding: "4px 2px" }
              : S.dump
          }
        >
          <div
            style={{ ...S.dumpHead, cursor: "pointer", userSelect: "none" }}
            onClick={() => toggleCollapsed("dump")}
          >
            <span style={S.dumpTitle}>
              <span style={S.chev}>{collapsed.dump ? "▸" : "▾"}</span> Lagi resah
              apa?
              {collapsed.dump && worries.length > 0 && (
                <span style={S.miniCount}>{worries.length}</span>
              )}
            </span>
            {released > 0 && !collapsed.dump && (
              <span style={S.dumpReleased}>{released} dilepas hari ini</span>
            )}
          </div>
          {!collapsed.dump && (
          <>
          <div style={S.addRow}>
            <input
              style={{ ...S.input, background: "var(--card2)" }}
              placeholder="Tumpahin di sini, jangan disimpen di kepala…"
              value={worryText}
              onChange={(e) => setWorryText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addWorry()}
            />
            <button style={S.addBtn} onClick={addWorry}>+</button>
          </div>
          {worries.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={S.dumpHint}>
                Sortir: bisa lu pengaruhi → jadiin tugas. Di luar kendali lu → lepasin.
              </div>
              {worries.map((w) => (
                <div key={w.id} style={S.worryCard}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <EditableText
                      value={w.text}
                      onSave={(v) => editWorry(w.id, v)}
                      style={{ fontSize: 14, lineHeight: 1.4 }}
                    />
                    {suggestions[w.id] && (
                      <div style={S.aiBubble}>
                        {suggestions[w.id] === "..."
                          ? "AI lagi mikir…"
                          : suggestions[w.id]}
                      </div>
                    )}
                  </div>
                  <div style={S.cardBtns}>
                    <button
                      style={S.btnGhost}
                      title="Minta saran AI"
                      onClick={() => suggestAI(w)}
                    >
                      ✨
                    </button>
                    <button style={S.btn} onClick={() => worryToTask(w)}>
                      Jadiin tugas
                    </button>
                    <button style={S.btnGhost} onClick={() => releaseWorry(w.id)}>
                      Lepasin
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          </>
          )}
        </div>

        {/* sections */}
        <Section title="Todo" count={todo.length} collapsed={!!collapsed.todo} onToggle={() => toggleCollapsed("todo")}>
          {todo.map((t) => (
            <Card key={t.id} t={t} onEdit={editTask} onTogglePublic={togglePublic}>
              <button style={S.btn} onClick={() => move(t.id, "inprogress")}>
                Terima
              </button>
              <button style={S.btnGhost} onClick={() => remove(t.id)}>✕</button>
            </Card>
          ))}
        </Section>

        <Section title="In Progress" count={doing.length} collapsed={!!collapsed.doing} onToggle={() => toggleCollapsed("doing")}>
          {doing.map((t) => (
            <Card key={t.id} t={t} active onEdit={editTask} onTogglePublic={togglePublic}>
              <button style={{ ...S.btn, background: "var(--green-dark)" }} onClick={() => move(t.id, "done")}>
                Selesai
              </button>
              <button style={S.btnGhost} onClick={() => move(t.id, "todo")}>↩</button>
            </Card>
          ))}
        </Section>

        <Section title="Completed" count={done.length} collapsed={!!collapsed.done} onToggle={() => toggleCollapsed("done")}>
          {done.map((t) => (
            <Card key={t.id} t={t} done onEdit={editTask} onTogglePublic={togglePublic}>
              <button style={S.btnGhost} onClick={() => move(t.id, "todo")}>↩</button>
              {!t.daily && (
                <button style={S.btnGhost} onClick={() => remove(t.id)}>✕</button>
              )}
            </Card>
          ))}
        </Section>


        </>
        )}
      </div>
    </div>
  );
}

const FIRE_CSS = `
html, body, #root { margin: 0; padding: 0; }
.lh-wrap { max-width: 560px; margin: 0 auto; }
@media (min-width: 900px)  { .lh-wrap { max-width: 720px; } }
@media (min-width: 1280px) { .lh-wrap { max-width: 820px; } }

@keyframes flickerOuter {
  0%   { transform: rotate(45deg) scale(1)    translateY(0); }
  25%  { transform: rotate(43deg) scale(1.08) translateY(-1px); }
  50%  { transform: rotate(47deg) scale(0.94) translateY(0.5px); }
  75%  { transform: rotate(44deg) scale(1.05) translateY(-0.5px); }
  100% { transform: rotate(45deg) scale(1)    translateY(0); }
}
@keyframes flickerInner {
  0%   { transform: rotate(45deg) scale(1); opacity: 0.95; }
  30%  { transform: rotate(48deg) scale(0.85); opacity: 1; }
  60%  { transform: rotate(42deg) scale(1.1); opacity: 0.85; }
  100% { transform: rotate(45deg) scale(1); opacity: 0.95; }
}
@keyframes emberGlow {
  0%   { box-shadow: 0 0 0 1px var(--accent-border), 0 2px 10px rgba(228,87,46,0.18); }
  50%  { box-shadow: 0 0 0 1px var(--accent), 0 2px 18px rgba(228,87,46,0.42); }
  100% { box-shadow: 0 0 0 1px var(--accent-border), 0 2px 10px rgba(228,87,46,0.18); }
}
@keyframes sparkRise {
  0%   { transform: translateY(0)    scale(1);   opacity: 0.9; }
  100% { transform: translateY(-14px) scale(0.3); opacity: 0; }
}
`;

function Flame() {
  const outer = {
    position: "absolute",
    bottom: 2,
    left: 5,
    width: 16,
    height: 16,
    background: "linear-gradient(135deg, #E4572E 0%, #F39C12 100%)",
    borderRadius: "0 50% 50% 50%",
    transformOrigin: "50% 80%",
    animation: "flickerOuter 0.9s ease-in-out infinite",
  };
  const inner = {
    position: "absolute",
    bottom: 3,
    left: 9,
    width: 8,
    height: 8,
    background: "linear-gradient(135deg, #F9D423 0%, #FFF3B0 100%)",
    borderRadius: "0 50% 50% 50%",
    transformOrigin: "50% 80%",
    animation: "flickerInner 0.7s ease-in-out infinite",
  };
  const spark = (delay, left) => ({
    position: "absolute",
    bottom: 16,
    left,
    width: 3,
    height: 3,
    borderRadius: "50%",
    background: "#F39C12",
    animation: `sparkRise 1.4s ease-out ${delay}s infinite`,
  });
  return (
    <div style={{ position: "relative", width: 26, height: 26, flexShrink: 0 }}>
      <div style={outer} />
      <div style={inner} />
      <div style={spark(0, 8)} />
      <div style={spark(0.5, 14)} />
      <div style={spark(0.9, 5)} />
    </div>
  );
}

function EditableText({ value, onSave, style }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing)
    return (
      <div
        style={{ ...style, cursor: "text" }}
        title="Tap untuk edit"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value}
      </div>
    );

  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== value) onSave(v);
  };

  return (
    <input
      autoFocus
      style={{
        ...style,
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid var(--accent)",
        borderRadius: 6,
        padding: "2px 6px",
        background: "var(--card)",
        outline: "none",
        font: "inherit",
      }}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

const STATUS_ORDER = ["ada", "dipinjem", "rusak", "servis", "ilang"];
const STATUS_META = {
  ada: { label: "✓ ada", color: "var(--green)", border: "var(--green-border)" },
  dipinjem: { label: "🤝 dipinjem", color: "var(--janji-ink)", border: "var(--janji-border)" },
  rusak: { label: "⚠ rusak", color: "var(--accent)", border: "var(--accent-border)" },
  servis: { label: "🔧 diservis", color: "var(--janji-ink)", border: "var(--janji-border)" },
  ilang: { label: "? ilang", color: "var(--red)", border: "var(--red)" },
};

const rupiah = (n) =>
  n == null ? "" : "Rp" + n.toLocaleString("id-ID");

function BarangPage({ session }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ name: "", location: "", price: "" });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    supabase
      .from("items")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => setItems(error ? [] : data));
  }, [session]);

  const addItem = async () => {
    const name = form.name.trim();
    if (!name) return;
    const row = {
      name,
      location: form.location.trim() || null,
      price: form.price ? parseInt(form.price.replace(/\D/g, ""), 10) || null : null,
    };
    setForm({ name: "", location: "", price: "" });
    setShowForm(false);
    const { data, error } = await supabase.from("items").insert(row).select().single();
    if (!error) setItems((xs) => [data, ...xs]);
  };

  const patchItem = async (id, patch) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await supabase.from("items").update(patch).eq("id", id);
  };

  const removeItem = async (id) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    await supabase.from("items").delete().eq("id", id);
  };

  const cycleStatus = (it) => {
    const next =
      STATUS_ORDER[(STATUS_ORDER.indexOf(it.status) + 1) % STATUS_ORDER.length];
    patchItem(it.id, { status: next });
  };

  if (items === null) return <div style={S.empty}>Memuat…</div>;

  const ql = q.trim().toLowerCase();
  const shown = ql
    ? items.filter(
        (x) =>
          x.name.toLowerCase().includes(ql) ||
          (x.location || "").toLowerCase().includes(ql)
      )
    : items;

  const total = items.reduce((s, x) => s + (x.price || 0), 0);

  return (
    <>
      {/* search-first: pertanyaannya selalu "barang gue di mana?" */}
      <input
        style={{
          ...S.input,
          width: "100%",
          boxSizing: "border-box",
          fontSize: 17,
          padding: "14px 16px",
        }}
        placeholder="Cari barang… (nama atau lokasi)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <span style={S.dumpHint}>
          {items.length} barang · total {rupiah(total)}
        </span>
        <button style={S.promAddLink} onClick={() => setShowForm((v) => !v)}>
          {showForm ? "batal" : "+ barang baru"}
        </button>
      </div>

      {showForm && (
        <div style={{ marginTop: 8 }}>
          <input
            style={{ ...S.input, width: "100%", boxSizing: "border-box", marginBottom: 6 }}
            placeholder="Nama barang (misal: e-money mandiri)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <input
              style={{ ...S.input, flex: 2, minWidth: 0 }}
              placeholder="Di mana? (misal: dompet abu)"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
            <input
              style={{ ...S.input, flex: 1, minWidth: 0 }}
              placeholder="Harga"
              inputMode="numeric"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
            <button style={{ ...S.addBtn, width: 60 }} onClick={addItem}>OK</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        {shown.length === 0 && (
          <div style={S.empty}>
            {ql ? `Gak nemu "${q}" — belum dicatet atau beneran ilang 😅` : "Belum ada barang. Mulai dari yang sering lu cari."}
          </div>
        )}
        {shown.map((it) => {
          const m = STATUS_META[it.status] || STATUS_META.ada;
          return (
            <div key={it.id} style={S.card}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <EditableText
                  value={it.name}
                  onSave={(v) => patchItem(it.id, { name: v })}
                  style={S.cardTitle}
                />
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginTop: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "var(--muted2)" }}>📍</span>
                  <EditableText
                    value={it.location || "belum dicatet"}
                    onSave={(v) => patchItem(it.id, { location: v })}
                    style={{ fontSize: 13, color: "var(--muted2)" }}
                  />
                  {it.price != null && (
                    <span style={S.tag}>{rupiah(it.price)}</span>
                  )}
                </div>
              </div>
              <div style={S.cardBtns}>
                <button
                  style={{ ...S.btnGhost, color: m.color, borderColor: m.border, whiteSpace: "nowrap" }}
                  title="Klik buat ganti status"
                  onClick={() => cycleStatus(it)}
                >
                  {m.label}
                </button>
                <button style={S.btnGhost} onClick={() => removeItem(it.id)}>✕</button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={S.footer}>
        Pindahin barang? Tap lokasinya, edit. Status: klik buat muter ada → dipinjem → rusak → diservis → ilang.
      </div>
    </>
  );
}

// tanggal lokal (bukan UTC) biar jam 6 pagi WIB gak kecatet "kemarin"
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const DEFAULT_SOURCES = ["cash", "bca", "danamon"];

const thisMonthStr = () => localToday().slice(0, 7); // 'YYYY-MM'

function RutinView({ session, sources, onLogExpense }) {
  const [items, setItems] = useState(null);
  const [form, setForm] = useState({ name: "", amount: "", due_day: "" });
  const [showForm, setShowForm] = useState(false);
  const [incomes, setIncomes] = useState([]);
  const [inForm, setInForm] = useState({ name: "", amount: "" });
  const [showInForm, setShowInForm] = useState(false);

  useEffect(() => {
    supabase
      .from("fixed_costs")
      .select("*")
      .eq("user_id", session.user.id)
      .order("due_day", { ascending: true, nullsFirst: false })
      .then(({ data, error }) => setItems(error ? [] : data));
    supabase
      .from("fixed_income")
      .select("*")
      .eq("user_id", session.user.id)
      .order("amount", { ascending: false })
      .then(({ data, error }) => setIncomes(error ? [] : data));
  }, [session]);

  const addIncome = async () => {
    const name = inForm.name.trim();
    const amount = parseInt(inForm.amount.replace(/\D/g, ""), 10);
    if (!name || isNaN(amount)) return;
    setInForm({ name: "", amount: "" });
    setShowInForm(false);
    const { data, error } = await supabase
      .from("fixed_income")
      .insert({ name, amount, source: sources[0] || null })
      .select()
      .single();
    if (!error) setIncomes((xs) => [...xs, data]);
  };

  const patchIncome = async (id, patch) => {
    setIncomes((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await supabase.from("fixed_income").update(patch).eq("id", id);
  };

  const removeIncome = async (id) => {
    setIncomes((xs) => xs.filter((x) => x.id !== id));
    await supabase.from("fixed_income").delete().eq("id", id);
  };

  const markReceived = async (it) => {
    patchIncome(it.id, { last_received: thisMonthStr() });
    onLogExpense({
      amount: Number(it.amount),
      kind: "in",
      source: it.source || sources[0] || "cash",
      note: it.name,
      spent_date: localToday(),
    });
  };

  const addItem = async () => {
    const name = form.name.trim();
    const amount = parseInt(form.amount.replace(/\D/g, ""), 10);
    if (!name || isNaN(amount)) return;
    const due = parseInt(form.due_day, 10);
    const row = {
      name,
      amount,
      due_day: due >= 1 && due <= 31 ? due : null,
      source: sources[0] || null,
    };
    setForm({ name: "", amount: "", due_day: "" });
    setShowForm(false);
    const { data, error } = await supabase
      .from("fixed_costs")
      .insert(row)
      .select()
      .single();
    if (!error) setItems((xs) => [...xs, data]);
  };

  const patchItem = async (id, patch) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await supabase.from("fixed_costs").update(patch).eq("id", id);
  };

  const removeItem = async (id) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    await supabase.from("fixed_costs").delete().eq("id", id);
  };

  const markPaid = async (it) => {
    const month = thisMonthStr();
    patchItem(it.id, { last_paid: month });
    // sekalian kecatet ke pengeluaran — gak perlu nyatet dua kali
    onLogExpense({
      amount: Number(it.amount),
      kind: "out",
      source: it.source || sources[0] || "cash",
      note: it.name,
      spent_date: localToday(),
    });
  };

  if (items === null) return <div style={S.empty}>Memuat…</div>;

  const month = thisMonthStr();
  const total = items.reduce((s, x) => s + Number(x.amount), 0);
  const unpaid = items.filter((x) => x.last_paid !== month);

  return (
    <>
      <div style={{ marginTop: 6, textAlign: "center" }}>
        <div style={S.eyebrow}>Total rutin per bulan</div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>{rupiah(total)}</div>
        <div style={{ ...S.dumpHint, marginTop: 2 }}>
          {unpaid.length === 0
            ? "semua udah kebayar bulan ini ✓"
            : `${unpaid.length} belum dibayar bulan ini`}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button style={S.promAddLink} onClick={() => setShowForm((v) => !v)}>
          {showForm ? "batal" : "+ biaya rutin"}
        </button>
      </div>

      {showForm && (
        <div style={{ marginTop: 6 }}>
          <input
            style={{ ...S.input, width: "100%", boxSizing: "border-box", marginBottom: 6 }}
            placeholder="Nama (misal: kosan, Claude Pro)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <input
              style={{ ...S.input, flex: 2, minWidth: 0 }}
              placeholder="Nominal"
              inputMode="numeric"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <input
              style={{ ...S.input, flex: 1, minWidth: 0 }}
              placeholder="Tgl (1-31)"
              inputMode="numeric"
              value={form.due_day}
              onChange={(e) => setForm({ ...form, due_day: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
            />
            <button style={{ ...S.addBtn, width: 60 }} onClick={addItem}>OK</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {items.length === 0 && (
          <div style={{ ...S.empty, textAlign: "center" }}>
            Belum ada. Mulai dari yang gede: kosan, langganan bulanan.
          </div>
        )}
        {items.map((it) => {
          const paid = it.last_paid === month;
          return (
            <div key={it.id} style={{ ...S.card, ...(paid ? { opacity: 0.55 } : {}) }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <EditableText
                  value={it.name}
                  onSave={(v) => patchItem(it.id, { name: v })}
                  style={S.cardTitle}
                />
                <div style={{ ...S.dumpHint, marginBottom: 0, marginTop: 3 }}>
                  <EditableText
                    value={rupiah(it.amount)}
                    onSave={(v) => {
                      const n = parseInt(v.replace(/\D/g, ""), 10);
                      if (!isNaN(n)) patchItem(it.id, { amount: n });
                    }}
                    style={{ display: "inline-block", fontSize: 13 }}
                  />
                  {it.due_day ? ` · tiap tgl ${it.due_day}` : ""}
                  {` · dari ${it.source || sources[0] || "cash"}`}
                </div>
              </div>
              <div style={S.cardBtns}>
                {paid ? (
                  <span style={{ ...S.tag, color: "var(--green)", borderColor: "var(--green-border)" }}>
                    ✓ bulan ini
                  </span>
                ) : (
                  <button
                    style={{ ...S.btn, background: "var(--green-dark)" }}
                    onClick={() => markPaid(it)}
                  >
                    Bayar ✓
                  </button>
                )}
                <button style={S.btnGhost} onClick={() => removeItem(it.id)}>✕</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ===== pemasukan rutin ===== */}
      <div style={{ marginTop: 26, textAlign: "center" }}>
        <div style={S.eyebrow}>Pemasukan rutin per bulan</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: "var(--green)" }}>
          {rupiah(incomes.reduce((s, x) => s + Number(x.amount), 0))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button style={S.promAddLink} onClick={() => setShowInForm((v) => !v)}>
          {showInForm ? "batal" : "+ pemasukan rutin"}
        </button>
      </div>

      {showInForm && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <input
            style={{ ...S.input, flex: 2, minWidth: 0 }}
            placeholder="Nama (misal: gaji, mentoring)"
            value={inForm.name}
            onChange={(e) => setInForm({ ...inForm, name: e.target.value })}
          />
          <input
            style={{ ...S.input, flex: 1, minWidth: 0 }}
            placeholder="Nominal"
            inputMode="numeric"
            value={inForm.amount}
            onChange={(e) => setInForm({ ...inForm, amount: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && addIncome()}
          />
          <button style={{ ...S.addBtn, width: 60 }} onClick={addIncome}>OK</button>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        {incomes.map((it) => {
          const received = it.last_received === thisMonthStr();
          return (
            <div key={it.id} style={{ ...S.card, ...(received ? { opacity: 0.55 } : {}) }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <EditableText
                  value={it.name}
                  onSave={(v) => patchIncome(it.id, { name: v })}
                  style={S.cardTitle}
                />
                <div style={{ ...S.dumpHint, marginBottom: 0, marginTop: 3 }}>
                  <EditableText
                    value={rupiah(it.amount)}
                    onSave={(v) => {
                      const n = parseInt(v.replace(/\D/g, ""), 10);
                      if (!isNaN(n)) patchIncome(it.id, { amount: n });
                    }}
                    style={{ display: "inline-block", fontSize: 13 }}
                  />
                </div>
              </div>
              <div style={S.cardBtns}>
                {received ? (
                  <span style={{ ...S.tag, color: "var(--green)", borderColor: "var(--green-border)" }}>
                    ✓ bulan ini
                  </span>
                ) : (
                  <button
                    style={{ ...S.btn, background: "var(--green-dark)" }}
                    onClick={() => markReceived(it)}
                  >
                    Terima ✓
                  </button>
                )}
                <button style={S.btnGhost} onClick={() => removeIncome(it.id)}>✕</button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={S.footer}>
        "Bayar ✓" / "Terima ✓" otomatis nyatet ke Catet — sekali tap, dua urusan kelar.
      </div>
    </>
  );
}

function UtangView({ session, sources, onLogExpense }) {
  const [debts, setDebts] = useState(null);
  const [dir, setDir] = useState("piutang"); // piutang = ke gue | utang = gue yang ngutang
  const [form, setForm] = useState({ who: "", amount: "", note: "" });
  const [showForm, setShowForm] = useState(false);
  const [showLunas, setShowLunas] = useState(false);

  useEffect(() => {
    supabase
      .from("debts")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => setDebts(error ? [] : data));
  }, [session]);

  const addDebt = async () => {
    const who = form.who.trim();
    const amount = parseInt(form.amount.replace(/\D/g, ""), 10);
    if (!who || isNaN(amount)) return;
    const row = { who, amount, note: form.note.trim() || null, direction: dir };
    setForm({ who: "", amount: "", note: "" });
    setShowForm(false);
    const { data, error } = await supabase.from("debts").insert(row).select().single();
    if (!error) setDebts((xs) => [data, ...xs]);
  };

  const patchDebt = async (id, patch) => {
    setDebts((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await supabase.from("debts").update(patch).eq("id", id);
  };

  const removeDebt = async (id) => {
    setDebts((xs) => xs.filter((x) => x.id !== id));
    await supabase.from("debts").delete().eq("id", id);
  };

  const markLunas = async (d) => {
    patchDebt(d.id, { status: "lunas" });
    const isPiutang = (d.direction || "piutang") === "piutang";
    // piutang lunas -> duit masuk; utang lunas -> duit keluar. Dua-duanya kecatet.
    onLogExpense({
      amount: Number(d.amount),
      kind: isPiutang ? "in" : "out",
      source: sources[0] || "cash",
      note: isPiutang
        ? `${d.who} lunasin utang${d.note ? " (" + d.note + ")" : ""}`
        : `bayar utang ke ${d.who}${d.note ? " (" + d.note + ")" : ""}`,
      spent_date: localToday(),
    });
  };

  const ageOf = (ts) => {
    const days = Math.floor((Date.now() - new Date(ts)) / 86400000);
    if (days === 0) return "hari ini";
    if (days === 1) return "kemarin";
    return `${days} hari`;
  };

  if (debts === null) return <div style={S.empty}>Memuat…</div>;

  const byDir = (x) => (x.direction || "piutang") === dir;
  const active = debts.filter((d) => d.status !== "lunas" && byDir(d));
  const lunas = debts.filter((d) => d.status === "lunas" && byDir(d));
  const total = active.reduce((s, d) => s + Number(d.amount), 0);
  const isPiutang = dir === "piutang";

  return (
    <>
      <div style={{ ...S.nav, marginTop: 4, marginBottom: 12, padding: 3 }}>
        {[["piutang", "Ngutang ke gue"], ["utang", "Gue ngutang"]].map(([k, label]) => (
          <button
            key={k}
            style={{ ...S.navBtn, padding: "7px 0", fontSize: 13, ...(dir === k ? S.navBtnActive : {}) }}
            onClick={() => setDir(k)}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 6, textAlign: "center" }}>
        <div style={S.eyebrow}>{isPiutang ? "Total piutang" : "Total utang gue"}</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: isPiutang ? "var(--green)" : "var(--janji-ink)" }}>
          {rupiah(total)}
        </div>
        <div style={{ ...S.dumpHint, marginTop: 2 }}>
          {active.length === 0
            ? isPiutang ? "gak ada yang ngutang. bersih." : "lu gak ngutang siapa-siapa. merdeka 🎉"
            : isPiutang ? `${active.length} orang belum lunas` : `${active.length} utang belum dibayar`}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
        <button style={S.promAddLink} onClick={() => setShowForm((v) => !v)}>
          {showForm ? "batal" : isPiutang ? "+ catat piutang" : "+ catat utang gue"}
        </button>
      </div>

      {showForm && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input
              style={{ ...S.input, flex: 2, minWidth: 0 }}
              placeholder={isPiutang ? "Siapa yang ngutang?" : "Ngutang ke siapa?"}
              value={form.who}
              onChange={(e) => setForm({ ...form, who: e.target.value })}
            />
            <input
              style={{ ...S.input, flex: 1, minWidth: 0 }}
              placeholder="Berapa?"
              inputMode="numeric"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              style={{ ...S.input, flex: 1, minWidth: 0 }}
              placeholder="Buat apa? (opsional)"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && addDebt()}
            />
            <button style={{ ...S.addBtn, width: 60 }} onClick={addDebt}>OK</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {active.length === 0 && (
          <div style={{ ...S.empty, textAlign: "center" }}>
            Kosong. Semoga awet 😄
          </div>
        )}
        {active.map((d) => (
          <div key={d.id} style={S.card}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <EditableText
                value={d.who}
                onSave={(v) => patchDebt(d.id, { who: v })}
                style={S.cardTitle}
              />
              <div style={{ ...S.dumpHint, marginBottom: 0, marginTop: 3 }}>
                <EditableText
                  value={rupiah(d.amount)}
                  onSave={(v) => {
                    const n = parseInt(v.replace(/\D/g, ""), 10);
                    if (!isNaN(n)) patchDebt(d.id, { amount: n });
                  }}
                  style={{ display: "inline-block", fontSize: 13, fontWeight: 700 }}
                />
                {d.note ? ` · ${d.note}` : ""} · udah {ageOf(d.created_at)}
              </div>
            </div>
            <div style={S.cardBtns}>
              <button
                style={{ ...S.btn, background: "var(--green-dark)" }}
                onClick={() => markLunas(d)}
              >
                Lunas ✓
              </button>
              <button style={S.btnGhost} onClick={() => removeDebt(d.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {lunas.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div
            style={{ ...S.dumpHint, cursor: "pointer", userSelect: "none" }}
            onClick={() => setShowLunas((v) => !v)}
          >
            {showLunas ? "▾" : "▸"} riwayat lunas ({lunas.length})
          </div>
          {showLunas &&
            lunas.map((d) => (
              <div key={d.id} style={{ ...S.card, opacity: 0.5 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...S.cardTitle, textDecoration: "line-through" }}>
                    {d.who} — {rupiah(d.amount)}
                  </div>
                </div>
                <button style={S.btnGhost} onClick={() => removeDebt(d.id)}>✕</button>
              </div>
            ))}
        </div>
      )}

      <div style={S.footer}>
        Lunas otomatis kecatet ke Catet (piutang → masuk, utang → keluar). Dibayar sebagian? Tap nominalnya, kurangin.
      </div>
    </>
  );
}

function MikirView({ session, onLogExpense }) {
  const [fixedOut, setFixedOut] = useState(0);
  const [fixedIn, setFixedIn] = useState(0);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [months, setMonths] = useState("");
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    supabase
      .from("purchase_plans")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => setPlans(error ? [] : data));
  }, [session]);

  const savePlan = async () => {
    const p2 = parseInt(price.replace(/\D/g, ""), 10);
    const m2 = parseInt(months, 10) || null;
    const nm = name.trim() || "rencana beli";
    if (!p2) return;
    setName("");
    setPrice("");
    setMonths("");
    const { data, error } = await supabase
      .from("purchase_plans")
      .insert({ name: nm, price: p2, months: m2 })
      .select()
      .single();
    if (!error) setPlans((xs) => [data, ...xs]);
  };

  const removePlan = async (id) => {
    setPlans((xs) => xs.filter((x) => x.id !== id));
    await supabase.from("purchase_plans").delete().eq("id", id);
  };

  const markBought = async (pl) => {
    setPlans((xs) =>
      xs.map((x) => (x.id === pl.id ? { ...x, status: "kebeli" } : x))
    );
    await supabase.from("purchase_plans").update({ status: "kebeli" }).eq("id", pl.id);
    if (pl.months && pl.months > 1) {
      // cicilan -> otomatis jadi biaya rutin bulanan
      await supabase.from("fixed_costs").insert({
        name: `cicilan ${pl.name}`,
        amount: Math.ceil(Number(pl.price) / pl.months),
      });
      alert(`"cicilan ${pl.name}" ditambahin ke biaya Rutin ✓`);
    } else {
      // cash -> kecatet sebagai pengeluaran hari ini
      onLogExpense({
        amount: Number(pl.price),
        kind: "out",
        source: "cash",
        note: pl.name,
        spent_date: localToday(),
      });
    }
  };

  useEffect(() => {
    supabase
      .from("fixed_costs")
      .select("amount")
      .eq("user_id", session.user.id)
      .then(({ data }) =>
        setFixedOut((data || []).reduce((s, x) => s + Number(x.amount), 0))
      );
    supabase
      .from("fixed_income")
      .select("amount")
      .eq("user_id", session.user.id)
      .then(({ data }) =>
        setFixedIn((data || []).reduce((s, x) => s + Number(x.amount), 0))
      );
  }, [session]);

  const sisa = fixedIn - fixedOut;
  const p = parseInt(price.replace(/\D/g, ""), 10) || 0;
  const m = parseInt(months, 10) || 0;
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

  const Row = ({ label, value, strong, color }) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, lineHeight: 1.9 }}>
      <span style={{ color: "var(--muted2)" }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 500, ...(color ? { color } : {}) }}>{value}</span>
    </div>
  );

  return (
    <>
      <div style={{ ...S.dump, marginTop: 6 }}>
        <Row label="Pemasukan rutin" value={rupiah(fixedIn)} />
        <Row label="Beban rutin" value={`${rupiah(fixedOut)} (${pct(fixedOut, fixedIn)}% dari income)`} />
        <Row label="Sisa bebas per bulan" value={rupiah(sisa)} strong />
        {(fixedIn === 0 || fixedOut === 0) && (
          <div style={{ ...S.dumpHint, marginTop: 6 }}>
            Isi dulu pemasukan & biaya rutin di tab Rutin biar hitungannya bener.
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={S.eyebrow}>Mau beli sesuatu yang gede?</div>
        <input
          style={{ ...S.input, width: "100%", boxSizing: "border-box", marginTop: 8 }}
          placeholder="Barangnya apa? (misal: iPhone, motor)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <input
            style={{ ...S.input, flex: 2, minWidth: 0 }}
            placeholder="Harganya berapa?"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <input
            style={{ ...S.input, flex: 1, minWidth: 0 }}
            placeholder="Cicil? (bln)"
            inputMode="numeric"
            value={months}
            onChange={(e) => setMonths(e.target.value)}
          />
        </div>
      </div>

      {p > 0 && (
        <div style={{ ...S.dump, marginTop: 12 }}>
          {m > 1 ? (
            <>
              <Row label={`Cicilan (${m} bulan)`} value={`${rupiah(Math.ceil(p / m))}/bulan`} strong />
              <Row
                label="Beban rutin baru"
                value={`${rupiah(fixedOut + Math.ceil(p / m))} (${pct(fixedOut + Math.ceil(p / m), fixedIn)}% dari income)`}
              />
              <Row
                label="Sisa bebas jadi"
                value={rupiah(sisa - Math.ceil(p / m))}
                strong
                color={sisa - Math.ceil(p / m) < 0 ? "var(--red)" : undefined}
              />
            </>
          ) : (
            <>
              <Row label="Harga" value={rupiah(p)} strong />
              <Row
                label="Setara sisa bebas"
                value={sisa > 0 ? `${(p / sisa).toFixed(1)} bulan` : "—"}
              />
              <Row label="Persen dari income sebulan" value={`${pct(p, fixedIn)}%`} />
            </>
          )}
          <div style={{ ...S.dumpHint, marginTop: 8 }}>
            Angkanya gitu — keputusannya tetep di lu. Gak ada yang nge-judge di sini.
          </div>
          <button style={{ ...S.focusBtn, marginTop: 10 }} onClick={savePlan}>
            Simpan sebagai rencana
          </button>
        </div>
      )}

      {/* ===== daftar rencana ===== */}
      {plans.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={S.eyebrow}>Rencana pembelian</div>
          {plans.map((pl) => {
            const perMonth = pl.months && pl.months > 1 ? Math.ceil(Number(pl.price) / pl.months) : null;
            const bought = pl.status === "kebeli";
            return (
              <div key={pl.id} style={{ ...S.card, marginTop: 8, ...(bought ? { opacity: 0.55 } : {}) }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...S.cardTitle, ...(bought ? { textDecoration: "line-through" } : {}) }}>
                    {pl.name}
                  </div>
                  <div style={{ ...S.dumpHint, marginBottom: 0, marginTop: 3 }}>
                    {rupiah(Number(pl.price))}
                    {perMonth
                      ? ` · cicil ${pl.months} bln (${rupiah(perMonth)}/bln) · sisa bebas jadi ${rupiah(sisa - perMonth)}`
                      : sisa > 0
                      ? ` · cash — setara ${(Number(pl.price) / sisa).toFixed(1)} bulan sisa bebas`
                      : ""}
                  </div>
                </div>
                <div style={S.cardBtns}>
                  {!bought && (
                    <button
                      style={{ ...S.btn, background: "var(--green-dark)" }}
                      onClick={() => markBought(pl)}
                    >
                      Kebeli ✓
                    </button>
                  )}
                  <button style={S.btnGhost} onClick={() => removePlan(pl.id)}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function AsetView({ session }) {
  const [assets, setAssets] = useState(null);
  const [form, setForm] = useState({ name: "", value: "" });
  const [showForm, setShowForm] = useState(false);
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem("tugasku-show-assets") === "1";
    } catch {
      return false;
    }
  });
  const toggleShow = () =>
    setShow((v) => {
      try {
        localStorage.setItem("tugasku-show-assets", v ? "0" : "1");
      } catch {}
      return !v;
    });

  useEffect(() => {
    supabase
      .from("assets")
      .select("*")
      .eq("user_id", session.user.id)
      .order("value", { ascending: false })
      .then(({ data, error }) => setAssets(error ? [] : data));
  }, [session]);

  const addAsset = async () => {
    const name = form.name.trim();
    const value = parseInt(form.value.replace(/\D/g, ""), 10);
    if (!name || isNaN(value)) return;
    setForm({ name: "", value: "" });
    setShowForm(false);
    const { data, error } = await supabase
      .from("assets")
      .insert({ name, value })
      .select()
      .single();
    if (!error) setAssets((xs) => [...xs, data].sort((a, b) => b.value - a.value));
  };

  const patchAsset = async (id, patch) => {
    const withTime = { ...patch, updated_at: new Date().toISOString() };
    setAssets((xs) =>
      xs.map((x) => (x.id === id ? { ...x, ...withTime } : x))
    );
    await supabase.from("assets").update(withTime).eq("id", id);
  };

  const removeAsset = async (id) => {
    setAssets((xs) => xs.filter((x) => x.id !== id));
    await supabase.from("assets").delete().eq("id", id);
  };

  const ago = (ts) => {
    const days = Math.floor((Date.now() - new Date(ts)) / 86400000);
    if (days === 0) return "hari ini";
    if (days === 1) return "kemarin";
    return `${days} hari lalu`;
  };

  if (assets === null) return <div style={S.empty}>Memuat…</div>;

  const total = assets.reduce((s, x) => s + x.value, 0);

  return (
    <>
      <div style={{ marginTop: 6, textAlign: "center" }}>
        <div style={S.eyebrow}>Total aset</div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: show ? "-0.02em" : "0.15em",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <span>{show ? rupiah(total) : "Rp ••••••"}</span>
          <button
            style={{ ...S.btnGhost, fontSize: 14, padding: "5px 9px" }}
            onClick={toggleShow}
          >
            {show ? "🙈" : "👁"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <button style={S.promAddLink} onClick={() => setShowForm((v) => !v)}>
          {showForm ? "batal" : "+ aset baru"}
        </button>
      </div>

      {showForm && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <input
            style={{ ...S.input, flex: 2, minWidth: 0 }}
            placeholder="Nama (misal: BCA, emas, WBSA)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            style={{ ...S.input, flex: 1, minWidth: 0 }}
            placeholder="Nilai"
            inputMode="numeric"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && addAsset()}
          />
          <button style={{ ...S.addBtn, width: 60 }} onClick={addAsset}>OK</button>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        {assets.length === 0 && (
          <div style={{ ...S.empty, textAlign: "center" }}>
            Belum ada. Mulai dari yang gede: rekening, cash, investasi.
          </div>
        )}
        {assets.map((a) => (
          <div key={a.id} style={S.card}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <EditableText
                value={a.name}
                onSave={(v) => patchAsset(a.id, { name: v })}
                style={S.cardTitle}
              />
              <div style={{ ...S.dumpHint, marginBottom: 0, marginTop: 3 }}>
                update {ago(a.updated_at)}
              </div>
            </div>
            <div style={S.cardBtns}>
              <EditableText
                value={show ? rupiah(a.value) : "••••"}
                onSave={(v) => {
                  const n = parseInt(v.replace(/\D/g, ""), 10);
                  if (!isNaN(n)) patchAsset(a.id, { value: n });
                }}
                style={{ fontSize: 15, fontWeight: 700, textAlign: "right", minWidth: 90 }}
              />
              <button style={S.btnGhost} onClick={() => removeAsset(a.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>

      <div style={S.footer}>
        Update pas nilainya berubah aja — gak usah tiap hari. Tap angkanya buat edit.
      </div>
    </>
  );
}

function DuitPage({ session }) {
  const [rows, setRows] = useState(null);
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState("out");
  const [spentDate, setSpentDate] = useState(localToday());
  const [addedMsg, setAddedMsg] = useState("");
  const [sources, setSources] = useState(DEFAULT_SOURCES);
  const [source, setSource] = useState(DEFAULT_SOURCES[0]);
  const [note, setNote] = useState("");
  const [editSrc, setEditSrc] = useState(false);
  const [srcDraft, setSrcDraft] = useState("");
  const [sub, setSub] = useState("keluar");
  const [showTotal, setShowTotal] = useState(() => {
    try {
      return localStorage.getItem("tugasku-show-total") === "1";
    } catch {
      return false;
    }
  });
  const [analysis, setAnalysis] = useState(null); // null | "..." | text

  const analyzeAI = async () => {
    setAnalysis("...");
    try {
      const payload = rows.slice(0, 200).map((r) => ({
        amount: r.amount,
        source: r.source,
        note: r.note,
        spent_date: r.spent_date,
        kind: r.kind || "out",
      }));
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      const data = await res.json();
      setAnalysis(data.analysis || "AI-nya lagi bengong, coba lagi.");
    } catch {
      setAnalysis("Gagal konek ke AI.");
    }
  };
  const toggleTotal = () =>
    setShowTotal((v) => {
      try {
        localStorage.setItem("tugasku-show-total", v ? "0" : "1");
      } catch {}
      return !v;
    });

  useEffect(() => {
    supabase
      .from("user_prefs")
      .select("sources")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.sources?.length) {
          setSources(data.sources);
          setSource(data.sources[0]);
        }
      });
  }, [session]);

  const saveSources = async () => {
    const list = srcDraft
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 6);
    if (list.length === 0) return;
    setSources(list);
    setSource(list[0]);
    setEditSrc(false);
    await supabase
      .from("user_prefs")
      .upsert({ user_id: session.user.id, sources: list });
  };

  useEffect(() => {
    // ambil 40 hari terakhir — cukup buat cover bulan berjalan penuh
    const since = new Date();
    since.setDate(since.getDate() - 40);
    const sinceStr = since.toISOString().slice(0, 10);
    supabase
      .from("expenses")
      .select("*")
      .eq("user_id", session.user.id)
      .gte("spent_date", sinceStr)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => setRows(error ? [] : data));
  }, [session]);

  const add = async () => {
    const amt = parseInt(amount.replace(/\D/g, ""), 10);
    if (!amt) return;
    const row = {
      amount: amt,
      kind,
      source,
      note: note.trim() || null,
      spent_date: spentDate || localToday(),
    };
    setAmount("");
    setNote("");
    setKind("out");
    // tanggal gak di-reset — biar bisa nyatet beberapa entry di hari yang sama
    const { data, error } = await supabase
      .from("expenses")
      .insert(row)
      .select()
      .single();
    if (!error) setRows((xs) => [data, ...xs]);
  };

  const remove = async (id) => {
    setRows((xs) => xs.filter((x) => x.id !== id));
    await supabase.from("expenses").delete().eq("id", id);
  };

  const logExpense = async (row) => {
    const { data, error } = await supabase
      .from("expenses")
      .insert(row)
      .select()
      .single();
    if (!error) setRows((xs) => [data, ...xs]);
  };

  if (rows === null) return <div style={S.empty}>Memuat…</div>;

  const today = localToday();
  const isOut = (r) => (r.kind || "out") === "out";
  const viewDate = spentDate || today;
  const isToday = viewDate === today;
  const dayLabel = isToday
    ? "hari ini"
    : "hari " +
      new Date(viewDate + "T00:00:00").toLocaleDateString("id-ID", {
        weekday: "long",
      }) +
      ` (${viewDate.split("-").reverse().join("/")})`;
  const todayRows = rows.filter((r) => r.spent_date === viewDate);
  const todayTotal = todayRows.filter(isOut).reduce((s, r) => s + r.amount, 0);
  const todayIn = todayRows.filter((r) => !isOut(r)).reduce((s, r) => s + r.amount, 0);

  // konteks 7 hari — biar satu hari gak diliat sendirian
  const week = new Date();
  week.setDate(week.getDate() - 6);
  const weekStr = `${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, "0")}-${String(week.getDate()).padStart(2, "0")}`;
  const weekRows = rows.filter((r) => r.spent_date >= weekStr && isOut(r));
  const weekTotal = weekRows.reduce((s, r) => s + r.amount, 0);
  const avg = Math.round(weekTotal / 7);

  // minggu ini (mulai Senin) & bulan ini
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // Senin = 0
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow);
  const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  const firstStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const thisWeek = rows.filter((r) => r.spent_date >= mondayStr && isOut(r)).reduce((s, r) => s + r.amount, 0);
  const thisMonth = rows.filter((r) => r.spent_date >= firstStr && isOut(r)).reduce((s, r) => s + r.amount, 0);
  const monthIn = rows.filter((r) => r.spent_date >= firstStr && !isOut(r)).reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <div style={{ ...S.nav, marginBottom: 14, padding: 3 }}>
        {[["keluar", "Catet"], ["rutin", "Rutin"], ["mikir", "Rencana"], ["utang", "Utang"], ["aset", "Aset"]].map(([k, label]) => (
          <button
            key={k}
            style={{ ...S.navBtn, padding: "7px 0", fontSize: 13, ...(sub === k ? S.navBtnActive : {}) }}
            onClick={() => setSub(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {sub === "aset" && <AsetView session={session} />}
      {sub === "rutin" && (
        <RutinView session={session} sources={sources} onLogExpense={logExpense} />
      )}
      {sub === "mikir" && <MikirView session={session} onLogExpense={logExpense} />}
      {sub === "utang" && (
        <UtangView session={session} sources={sources} onLogExpense={logExpense} />
      )}

      {sub === "keluar" && (
      <>
      {/* input dulu, angka belakangan — biar nyatetnya gak mikir */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {[["out", "− Keluar"], ["in", "+ Masuk"]].map(([k, label]) => (
          <button
            key={k}
            style={{
              ...S.btnGhost,
              flex: 1,
              fontSize: 12,
              fontWeight: 700,
              ...(kind === k
                ? k === "in"
                  ? { borderColor: "var(--green)", color: "var(--green)" }
                  : { borderColor: "var(--muted2)", color: "var(--ink)", background: "var(--card)" }
                : {}),
            }}
            onClick={() => setKind(k)}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          style={{ ...S.input, flex: 1, minWidth: 0, fontSize: 17 }}
          placeholder="Berapa? (misal 25000)"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button style={{ ...S.addBtn, width: 60 }} onClick={add}>OK</button>
      </div>
      {!editSrc ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {sources.map((s) => (
            <button
              key={s}
              style={{
                ...S.btnGhost,
                textTransform: "uppercase",
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: "nowrap",
                ...(source === s
                  ? { borderColor: "var(--accent)", color: "var(--accent)" }
                  : {}),
              }}
              onClick={() => setSource(s)}
            >
              {s}
            </button>
          ))}
          <button
            style={{ ...S.btnGhost, padding: "7px 10px" }}
            title="Edit daftar sumber"
            onClick={() => {
              setSrcDraft(sources.join(", "));
              setEditSrc(true);
            }}
          >
            ✎
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input
            style={{ ...S.input, flex: 1, minWidth: 0, fontSize: 16 }}
            placeholder="Pisahin pakai koma, misal: cash, bca, danamon, gopay"
            value={srcDraft}
            autoFocus
            onChange={(e) => setSrcDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveSources();
              if (e.key === "Escape") setEditSrc(false);
            }}
          />
          <button style={{ ...S.addBtn, width: 60 }} onClick={saveSources}>OK</button>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input
          style={{ ...S.input, flex: 2, minWidth: 0, fontSize: 16 }}
          placeholder="Catatan (opsional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <input
          type="date"
          max={localToday()}
          style={{ ...S.input, flex: 1, minWidth: 0, fontSize: 14 }}
          title="Tanggal — ganti kalau mau catet pengeluaran kemarin"
          value={spentDate}
          onChange={(e) => setSpentDate(e.target.value)}
        />
      </div>
      {addedMsg && (
        <div style={{ fontSize: 13, color: "var(--green)", marginTop: 6, textAlign: "center" }}>
          {addedMsg}
        </div>
      )}

      {/* angka hari ini — default disembunyiin, buka kalau siap liat */}
      <div style={{ marginTop: 22, textAlign: "center" }}>
        <div style={S.eyebrow}>Keluar {dayLabel}</div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: showTotal ? "-0.02em" : "0.15em",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <span>{showTotal ? rupiah(todayTotal) : "Rp ••••••"}</span>
          <button
            style={{ ...S.btnGhost, fontSize: 14, padding: "5px 9px" }}
            title={showTotal ? "Sembunyiin total" : "Liat total"}
            onClick={toggleTotal}
          >
            {showTotal ? "🙈" : "👁"}
          </button>
        </div>
        {showTotal && (
          <>
            {todayIn > 0 && (
              <div style={{ ...S.dumpHint, marginTop: 4, color: "var(--green)" }}>
                masuk {dayLabel} +{rupiah(todayIn)}
              </div>
            )}
            <div style={{ ...S.dumpHint, marginTop: 4 }}>
              rata-rata 7 hari terakhir: {rupiah(avg)}/hari
            </div>
            <div style={{ ...S.dumpHint, marginTop: 2 }}>
              minggu ini {rupiah(thisWeek)} · bulan ini {rupiah(thisMonth)}
            </div>
            {monthIn > 0 && (
              <div style={{ ...S.dumpHint, marginTop: 2, color: "var(--green)" }}>
                masuk bulan ini +{rupiah(monthIn)}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 14 }}>
        <button
          style={{ ...S.btnGhost, fontSize: 13 }}
          onClick={analyzeAI}
          disabled={analysis === "..."}
        >
          ✨ {analysis === "..." ? "AI lagi baca catatan lu…" : "Duit gue kemana aja?"}
        </button>
      </div>
      {analysis && analysis !== "..." && (
        <div style={{ ...S.aiBubble, marginTop: 10, whiteSpace: "pre-wrap" }}>
          {analysis}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        {todayRows.length === 0 && (
          <div style={{ ...S.empty, textAlign: "center" }}>
            Belum ada catatan {dayLabel === "hari ini" ? "hari ini" : dayLabel}.
          </div>
        )}
        {todayRows.map((r) => (
          <div key={r.id} style={{ ...S.card, padding: "10px 14px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  ...((r.kind || "out") === "in" && showTotal ? { color: "var(--green)" } : {}),
                  ...(!showTotal ? { color: "var(--faint)", letterSpacing: "0.1em" } : {}),
                }}
              >
                {showTotal
                  ? `${(r.kind || "out") === "in" ? "+" : ""}${rupiah(r.amount)}`
                  : "Rp ••••"}
              </span>
              <span style={{ ...S.dumpHint, marginLeft: 8 }}>
                {r.source}{r.note ? ` · ${r.note}` : ""}
              </span>
            </div>
            <button style={S.btnGhost} onClick={() => remove(r.id)}>✕</button>
          </div>
        ))}
      </div>

      <div style={S.footer}>
        Dicatet doang, gak dinilai. Angka gede sehari itu normal — liatnya per minggu.
      </div>
      </>
      )}
    </>
  );
}

const MOODS = [
  ["lelah", "😴"], ["sedih", "😢"], ["frustasi", "😤"],
  ["cemas", "😰"], ["biasa", "😐"], ["oke", "🙂"],
];
const moodEmoji = (m) => (MOODS.find((x) => x[0] === m) || ["", "·"])[1];

const PALETTE = [
  "#E4572E", "#3E7A46", "#B8860B", "#4A6FA5",
  "#8E5BA6", "#C0392B", "#2A9D8F", "#8A8578",
];

function WaktuSection({ session }) {
  const [blocks, setBlocks] = useState(null);
  const [form, setForm] = useState({ name: "", hours: "", wajib: false });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    supabase
      .from("time_blocks")
      .select("*")
      .eq("user_id", session.user.id)
      .order("hours", { ascending: false })
      .then(({ data, error }) => setBlocks(error ? [] : data));
  }, [session]);

  const addBlock = async () => {
    const name = form.name.trim();
    const hours = parseFloat(String(form.hours).replace(",", "."));
    if (!name || isNaN(hours) || hours <= 0) return;
    const used = (blocks || []).length;
    const row = {
      name,
      hours,
      wajib: form.wajib,
      color: PALETTE[used % PALETTE.length],
    };
    setForm({ name: "", hours: "", wajib: false });
    setShowForm(false);
    const { data, error } = await supabase
      .from("time_blocks").insert(row).select().single();
    if (!error)
      setBlocks((xs) => [...xs, data].sort((a, b) => b.hours - a.hours));
  };

  const patchBlock = async (id, patch) => {
    setBlocks((xs) =>
      xs
        .map((x) => (x.id === id ? { ...x, ...patch } : x))
        .sort((a, b) => b.hours - a.hours)
    );
    await supabase.from("time_blocks").update(patch).eq("id", id);
  };

  const removeBlock = async (id) => {
    setBlocks((xs) => xs.filter((x) => x.id !== id));
    await supabase.from("time_blocks").delete().eq("id", id);
  };

  const cycleColor = (b) => {
    const i = PALETTE.indexOf(b.color);
    patchBlock(b.id, { color: PALETTE[(i + 1) % PALETTE.length] });
  };

  if (blocks === null) return null;

  const used = blocks.reduce((s, b) => s + Number(b.hours), 0);
  const free = Math.max(0, 24 - used);
  const over = used > 24;
  const wajibTotal = blocks
    .filter((b) => b.wajib)
    .reduce((s, b) => s + Number(b.hours), 0);

  return (
    <>
      <div style={{ ...S.sectionHead, marginTop: 26 }}>
        <span>Peta 24 jam</span>
      </div>

      {/* stacked bar */}
      <div
        style={{
          display: "flex",
          height: 34,
          borderRadius: 10,
          overflow: "hidden",
          border: "1px solid var(--border)",
        }}
      >
        {blocks.map((b) => (
          <div
            key={b.id}
            title={`${b.name} — ${b.hours} jam`}
            style={{
              width: `${(Number(b.hours) / 24) * 100}%`,
              background: b.color || "#8A8578",
              minWidth: 2,
            }}
          />
        ))}
        {free > 0 && (
          <div
            title={`belum keclaim — ${free.toFixed(1)} jam`}
            style={{
              width: `${(free / 24) * 100}%`,
              background:
                "repeating-linear-gradient(45deg, transparent, transparent 4px, var(--border) 4px, var(--border) 6px)",
            }}
          />
        )}
      </div>

      <div style={{ ...S.dumpHint, marginTop: 6, textAlign: "center" }}>
        {over ? (
          <span style={{ color: "var(--red)" }}>
            kepake {used.toFixed(1)} jam — lebih {(used - 24).toFixed(1)} jam dari 24. Ada yang harus ngalah.
          </span>
        ) : (
          <>
            kepake {used.toFixed(1)} jam · wajib {wajibTotal.toFixed(1)} jam ·{" "}
            <b style={{ color: "var(--green)" }}>
              {free.toFixed(1)} jam belum keclaim
            </b>
            {free >= 1 && " — di situ tempat hal yang katanya \"gak sempet\""}
          </>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button style={S.promAddLink} onClick={() => setShowForm((v) => !v)}>
          {showForm ? "batal" : "+ kegiatan"}
        </button>
      </div>

      {showForm && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input
              style={{ ...S.input, flex: 2, minWidth: 0 }}
              placeholder="Kegiatan (misal: tidur, kerja, commute)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              style={{ ...S.input, flex: 1, minWidth: 0 }}
              placeholder="Jam"
              inputMode="decimal"
              value={form.hours}
              onChange={(e) => setForm({ ...form, hours: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && addBlock()}
            />
            <button style={{ ...S.addBtn, width: 60 }} onClick={addBlock}>OK</button>
          </div>
          <label style={S.optLabel}>
            <input
              type="checkbox"
              checked={form.wajib}
              onChange={(e) => setForm({ ...form, wajib: e.target.checked })}
            />{" "}
            Wajib (gak bisa diganggu gugat)
          </label>
        </div>
      )}

      {blocks.length === 0 && !showForm && (
        <div style={S.empty}>
          Kosong. Mulai dari yang pasti: tidur, kerja, commute, makan — sisanya bakal keliatan sendiri.
        </div>
      )}

      {blocks.map((b) => (
        <div key={b.id} style={{ ...S.card, padding: "10px 14px" }}>
          <button
            title="Tap buat ganti warna"
            onClick={() => cycleColor(b)}
            style={{
              width: 18,
              height: 18,
              borderRadius: 6,
              border: "none",
              background: b.color || "#8A8578",
              cursor: "pointer",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <EditableText
              value={b.name}
              onSave={(v) => patchBlock(b.id, { name: v })}
              style={{ fontSize: 15, fontWeight: 500 }}
            />
          </div>
          {b.wajib && (
            <span style={{ ...S.tag, color: "var(--janji-ink)", borderColor: "var(--janji-border)" }}>
              wajib
            </span>
          )}
          <EditableText
            value={`${b.hours}`}
            onSave={(v) => {
              const n = parseFloat(String(v).replace(",", "."));
              if (!isNaN(n) && n > 0) patchBlock(b.id, { hours: n });
            }}
            style={{ fontSize: 14, fontWeight: 700, minWidth: 34, textAlign: "right" }}
          />
          <span style={{ fontSize: 12, color: "var(--faint)" }}>jam</span>
          <button
            style={{ ...S.btnGhost, padding: "4px 8px", fontSize: 11 }}
            title={b.wajib ? "Jadiin fleksibel" : "Tandain wajib"}
            onClick={() => patchBlock(b.id, { wajib: !b.wajib })}
          >
            {b.wajib ? "☑" : "☐"}
          </button>
          <button style={S.btnGhost} onClick={() => removeBlock(b.id)}>✕</button>
        </div>
      ))}
    </>
  );
}

function EnergiSection({ session }) {
  const [drains, setDrains] = useState([]);
  const [drainEvents, setDrainEvents] = useState([]);
  const [dreams, setDreams] = useState([]);
  const [touches, setTouches] = useState([]);
  const [dailyStat, setDailyStat] = useState(null);
  const [newDrain, setNewDrain] = useState("");
  const [newDream, setNewDream] = useState("");
  const [showDrainForm, setShowDrainForm] = useState(false);
  const [showDreamForm, setShowDreamForm] = useState(false);

  const today = localToday();

  useEffect(() => {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceStr = since.toISOString().slice(0, 10);

    supabase.from("drains").select("*")
      .eq("user_id", session.user.id)
      .then(({ data, error }) => setDrains(error ? [] : data));
    supabase.from("drain_events").select("*")
      .eq("user_id", session.user.id).gte("date", sinceStr)
      .then(({ data, error }) => setDrainEvents(error ? [] : data));
    supabase.from("dreams").select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => setDreams(error ? [] : data));
    supabase.from("dream_touches").select("*")
      .eq("user_id", session.user.id).gte("date", sinceStr)
      .then(({ data, error }) => setTouches(error ? [] : data));
    // wajib harian dari board Tugas
    supabase.from("tasks").select("status")
      .eq("user_id", session.user.id).eq("daily", true)
      .then(({ data, error }) => {
        if (!error && data.length > 0)
          setDailyStat({
            done: data.filter((t) => t.status === "done").length,
            total: data.length,
          });
      });
  }, [session]);

  const addDrain = async () => {
    const name = newDrain.trim();
    if (!name) return;
    setNewDrain("");
    setShowDrainForm(false);
    const { data, error } = await supabase.from("drains").insert({ name }).select().single();
    if (!error) setDrains((xs) => [...xs, data]);
  };

  const logDrain = async (d) => {
    const { data, error } = await supabase
      .from("drain_events").insert({ drain_id: d.id, date: today }).select().single();
    if (!error) setDrainEvents((es) => [...es, data]);
  };

  const removeDrain = async (id) => {
    if (!window.confirm("Hapus beserta riwayatnya?")) return;
    setDrains((xs) => xs.filter((x) => x.id !== id));
    await supabase.from("drains").delete().eq("id", id);
  };

  const addDream = async () => {
    const name = newDream.trim();
    if (!name) return;
    setNewDream("");
    setShowDreamForm(false);
    const { data, error } = await supabase.from("dreams").insert({ name }).select().single();
    if (!error) setDreams((xs) => [...xs, data]);
  };

  const touchDream = async (dr) => {
    const { data, error } = await supabase
      .from("dream_touches")
      .upsert({ dream_id: dr.id, date: today }, { onConflict: "dream_id,date" })
      .select().single();
    if (!error) setTouches((ts) => [...ts.filter((t) => !(t.dream_id === dr.id && t.date === today)), data]);
  };

  const patchDream = async (id, patch) => {
    setDreams((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await supabase.from("dreams").update(patch).eq("id", id);
  };

  const removeDream = async (id) => {
    if (!window.confirm("Hapus mimpi ini beserta riwayatnya?")) return;
    setDreams((xs) => xs.filter((x) => x.id !== id));
    await supabase.from("dreams").delete().eq("id", id);
  };

  // rekap drain 7 hari
  const drainCount = (id) => drainEvents.filter((e) => e.drain_id === id).length;
  const drainToday = (id) => drainEvents.filter((e) => e.drain_id === id && e.date === today).length;
  const topDrains = drains
    .map((d) => ({ ...d, n: drainCount(d.id) }))
    .filter((d) => d.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);

  const touchedDays = (id) =>
    new Set(touches.filter((t) => t.dream_id === id).map((t) => t.date)).size;
  const touchedToday = (id) =>
    touches.some((t) => t.dream_id === id && t.date === today);

  return (
    <>
      {/* ===== yang nyedot energi ===== */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 26 }}>
        <div style={S.sectionHead}><span>Yang nyedot energi</span></div>
        <button style={S.promAddLink} onClick={() => setShowDrainForm((v) => !v)}>
          {showDrainForm ? "batal" : "+ tambah"}
        </button>
      </div>

      {showDrainForm && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input
            style={{ ...S.input, flex: 1, minWidth: 0 }}
            placeholder="Apa yang nyedot? (misal: scroll, suruhan dadakan)"
            value={newDrain}
            onChange={(e) => setNewDrain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDrain()}
          />
          <button style={{ ...S.addBtn, width: 60 }} onClick={addDrain}>OK</button>
        </div>
      )}

      {drains.length === 0 && !showDrainForm && (
        <div style={S.empty}>
          Tambahin penyedot energi lu (scroll, meeting dadakan, macet…) — tiap kejadian tinggal tap.
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {drains.map((d) => {
          const n = drainToday(d.id);
          return (
            <button
              key={d.id}
              style={{ ...S.btnGhost, fontSize: 13 }}
              title="Tap tiap kejadian. Tahan buat hapus? — pakai ✕ di rekap"
              onClick={() => logDrain(d)}
            >
              ⚡ {d.name}{n > 0 ? ` ·${n}` : ""}
            </button>
          );
        })}
      </div>

      {topDrains.length > 0 && (
        <div style={{ ...S.dumpHint, marginTop: 8 }}>
          7 hari terakhir paling nyedot:{" "}
          {topDrains.map((d, i) => (
            <span key={d.id}>
              {i > 0 && " · "}
              <b>{d.name} ×{d.n}</b>
              <span
                style={{ cursor: "pointer", marginLeft: 3, color: "var(--faint)" }}
                onClick={() => removeDrain(d.id)}
              >✕</span>
            </span>
          ))}
        </div>
      )}

      {/* ===== mimpi yang dikejar ===== */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 26 }}>
        <div style={S.sectionHead}><span>Mimpi yang dikejar</span></div>
        <button style={S.promAddLink} onClick={() => setShowDreamForm((v) => !v)}>
          {showDreamForm ? "batal" : "+ mimpi"}
        </button>
      </div>

      {showDreamForm && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input
            style={{ ...S.input, flex: 1, minWidth: 0 }}
            placeholder="Misal: IELTS, benerin CV"
            value={newDream}
            onChange={(e) => setNewDream(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDream()}
          />
          <button style={{ ...S.addBtn, width: 60 }} onClick={addDream}>OK</button>
        </div>
      )}

      {dreams.length === 0 && !showDreamForm && (
        <div style={S.empty}>
          Apapun yang lu pengin kejar tapi ngerasa gak ada waktu/energi — taro di sini.
          Yang penting bukan selesai, tapi kesentuh.
        </div>
      )}

      {dreams.map((dr) => {
        const days = touchedDays(dr.id);
        const doneToday = touchedToday(dr.id);
        return (
          <div key={dr.id} style={{ ...S.card, display: "block" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.cardTitle}>{dr.name}</div>
                <div style={{ marginTop: 3 }}>
                  <EditableText
                    value={dr.why || ""}
                    onSave={(v) => patchDream(dr.id, { why: v })}
                    placeholder="kenapa ini penting? (tap — buat dibaca pas males)"
                    style={{ fontSize: 12, color: "var(--muted2)", fontStyle: "italic", lineHeight: 1.4 }}
                  />
                </div>
              </div>
              <div style={S.cardBtns}>
                {doneToday ? (
                  <span style={{ ...S.tag, color: "var(--green)", borderColor: "var(--green-border)" }}>
                    ✓ hari ini
                  </span>
                ) : (
                  <button
                    style={{ ...S.btn, background: "var(--green-dark)" }}
                    onClick={() => touchDream(dr)}
                  >
                    Sentuh ✓
                  </button>
                )}
                <button style={S.btnGhost} onClick={() => removeDream(dr.id)}>✕</button>
              </div>
            </div>
            <div style={{ marginTop: 8, padding: "8px 10px", background: "var(--card2)", border: "1px solid var(--border)", borderRadius: 10 }}>
              <div style={{ ...S.fieldLabel || {}, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 2 }}>
                Langkah kecil berikutnya
              </div>
              <EditableText
                value={dr.next_step || ""}
                onSave={(v) => patchDream(dr.id, { next_step: v })}
                placeholder="tap — sekecil mungkin, misal: buka 1 video, tulis 1 paragraf"
                style={{ fontSize: 14, lineHeight: 1.4 }}
              />
            </div>
            <div style={{ ...S.dumpHint, marginBottom: 0, marginTop: 6 }}>
              kesentuh <b>{days}/7 hari</b> terakhir
              {days === 0 && " — 5 menit juga ngitung"}
            </div>
          </div>
        );
      })}

      {/* ===== wajib harian tetep jalan ===== */}
      {dailyStat && (
        <div style={{ ...S.dumpHint, marginTop: 14, textAlign: "center" }}>
          Wajib harian hari ini:{" "}
          <b style={{ color: dailyStat.done === dailyStat.total ? "var(--green)" : "var(--ink)" }}>
            {dailyStat.done}/{dailyStat.total} kelar
          </b>{" "}
          (dari board Tugas)
        </div>
      )}
    </>
  );
}

function DiriPage({ session }) {
  const [moods, setMoods] = useState([]);
  const [habits, setHabits] = useState(null);
  const [events, setEvents] = useState([]);
  const [newHabit, setNewHabit] = useState("");
  const [showHabitForm, setShowHabitForm] = useState(false);
  const [justLogged, setJustLogged] = useState(null); // habit_id yang baru dicatet

  useEffect(() => {
    const since = new Date();
    since.setDate(since.getDate() - 60);
    const sinceStr = since.toISOString().slice(0, 10);
    supabase
      .from("moods").select("*")
      .eq("user_id", session.user.id)
      .gte("date", sinceStr)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => setMoods(error ? [] : data));
    supabase
      .from("habits").select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => setHabits(error ? [] : data));
    supabase
      .from("habit_events").select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data, error }) => setEvents(error ? [] : data));
  }, [session]);

  const today = localToday();
  const todayMood = moods.find((m) => m.date === today);
  const [reflection, setReflection] = useState(null);

  const reflectAI = async () => {
    setReflection("...");
    try {
      // rangkum data lokal + ambil drains/dreams sekalian
      const since = new Date();
      since.setDate(since.getDate() - 14);
      const sinceStr = since.toISOString().slice(0, 10);
      const [dr, de, dm, dt, tb, dtask] = await Promise.all([
        supabase.from("drains").select("id,name").eq("user_id", session.user.id),
        supabase.from("drain_events").select("drain_id,date").eq("user_id", session.user.id).gte("date", sinceStr),
        supabase.from("dreams").select("id,name,why,next_step").eq("user_id", session.user.id),
        supabase.from("dream_touches").select("dream_id,date").eq("user_id", session.user.id).gte("date", sinceStr),
        supabase.from("time_blocks").select("name,hours,wajib").eq("user_id", session.user.id),
        supabase.from("tasks").select("status").eq("user_id", session.user.id).eq("daily", true),
      ]);

      const moodCount = {};
      moods.forEach((m) => (moodCount[m.mood] = (moodCount[m.mood] || 0) + 1));
      const moodRecap = Object.entries(moodCount)
        .sort((a, b) => b[1] - a[1])
        .map(([m, n]) => `${m} ${n}x`)
        .join(", ");
      const moodLines = moods
        .filter((m) => m.date >= sinceStr)
        .map((m) => `${m.date}: ${m.mood}`)
        .join("; ");

      const habitLines = habits
        .map((h) => {
          const ev = events.filter((e) => e.habit_id === h.id);
          const evMoods = ev.filter((e) => e.mood).map((e) => e.mood);
          const last = ev.length > 0 ? ev[0].created_at : h.created_at;
          const clean = Math.floor((Date.now() - new Date(last)) / 86400000);
          return `${h.name}: bersih ${clean} hari, ${ev.length} kejadian tercatat${evMoods.length ? `, mood pas kejadian: ${evMoods.join(",")}` : ""}`;
        })
        .join("; ");

      const drainLines = (dr.data || [])
        .map((d) => {
          const n = (de.data || []).filter((e) => e.drain_id === d.id).length;
          return n > 0 ? `${d.name} ${n}x` : null;
        })
        .filter(Boolean)
        .join(", ");

      const dreamLines = (dm.data || [])
        .map((d) => {
          const n = new Set((dt.data || []).filter((t) => t.dream_id === d.id).map((t) => t.date)).size;
          return `${d.name} (kesentuh ${n}/14 hari${d.why ? `, alasan: ${d.why}` : ""}${d.next_step ? `, langkah berikutnya: ${d.next_step}` : ""})`;
        })
        .join("; ");

      const blocks = tb.data || [];
      const usedH = blocks.reduce((s, b) => s + Number(b.hours), 0);
      const timeLines = blocks.length
        ? blocks.map((b) => `${b.name} ${b.hours}jam${b.wajib ? " (wajib)" : ""}`).join(", ") +
          ` — total kepake ${usedH.toFixed(1)}/24 jam, sisa ${(24 - usedH).toFixed(1)} jam belum keclaim`
        : "belum diisi";
      const dt2 = dtask.data || [];
      const dailyLine = dt2.length
        ? `${dt2.filter((t) => t.status === "done").length}/${dt2.length} kelar hari ini`
        : "belum ada";

      const summary = [
        `Rekap mood keseluruhan: ${moodRecap || "belum ada"}`,
        `Mood 14 hari terakhir: ${moodLines || "belum ada data"}`,
        `Kebiasaan yang dikurangin: ${habitLines || "belum ada"}`,
        `Penyedot energi (14 hari): ${drainLines || "belum ada"}`,
        `Mimpi yang dikejar: ${dreamLines || "belum ada"}`,
        `Peta 24 jam: ${timeLines}`,
        `Kegiatan wajib harian: ${dailyLine}`,
      ].join("\n");

      const res = await fetch("/api/reflect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary }),
      });
      const data = await res.json();
      setReflection(data.reflection || "AI-nya lagi bengong, coba lagi.");
    } catch {
      setReflection("Gagal konek ke AI.");
    }
  };

  const checkIn = async (mood) => {
    const row = { mood, date: today };
    const { data, error } = await supabase.from("moods").insert(row).select().single();
    if (!error) setMoods((ms) => [data, ...ms]);
  };

  const addHabit = async () => {
    const name = newHabit.trim();
    if (!name) return;
    setNewHabit("");
    setShowHabitForm(false);
    const { data, error } = await supabase.from("habits").insert({ name }).select().single();
    if (!error) setHabits((hs) => [...hs, data]);
  };

  const removeHabit = async (id) => {
    if (!window.confirm("Hapus kebiasaan ini beserta riwayatnya?")) return;
    setHabits((hs) => hs.filter((h) => h.id !== id));
    setEvents((es) => es.filter((e) => e.habit_id !== id));
    await supabase.from("habits").delete().eq("id", id);
  };

  const logEvent = async (h) => {
    const row = { habit_id: h.id, date: today, mood: todayMood?.mood || null };
    setJustLogged(h.id);
    setTimeout(() => setJustLogged(null), 6000);
    const { data, error } = await supabase
      .from("habit_events").insert(row).select().single();
    if (!error) setEvents((es) => [data, ...es]);
  };

  const cleanDays = (h) => {
    const ev = events.filter((e) => e.habit_id === h.id);
    const last = ev.length > 0 ? ev[0].created_at : h.created_at;
    return Math.floor((Date.now() - new Date(last)) / 86400000);
  };

  const topMood = (h) => {
    const withMood = events.filter((e) => e.habit_id === h.id && e.mood);
    if (withMood.length < 2) return null;
    const count = {};
    withMood.forEach((e) => (count[e.mood] = (count[e.mood] || 0) + 1));
    return Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
  };

  // 7 hari terakhir buat strip mood
  const last7 = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const m = moods.find((x) => x.date === ds);
    return { ds, mood: m?.mood };
  });

  return (
    <>
      {/* ===== mood check-in ===== */}
      <div style={S.dump}>
        <div style={{ ...S.dumpTitle, marginBottom: 10 }}>
          {todayMood
            ? `Hari ini lu lagi ${todayMood.mood} ${moodEmoji(todayMood.mood)}`
            : "Lagi ngerasa gimana?"}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {MOODS.map(([m, e]) => (
            <button
              key={m}
              style={{
                ...S.btnGhost,
                fontSize: 13,
                ...(todayMood?.mood === m
                  ? { borderColor: "var(--accent)", color: "var(--accent)" }
                  : {}),
              }}
              onClick={() => checkIn(m)}
            >
              {e} {m}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
          {last7.map((d) => (
            <div key={d.ds} style={{ textAlign: "center", fontSize: 16 }} title={d.ds}>
              {d.mood ? moodEmoji(d.mood) : "·"}
            </div>
          ))}
        </div>
        <div style={{ ...S.dumpHint, textAlign: "center", marginTop: 2 }}>7 hari terakhir</div>

        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button
            style={{ ...S.btnGhost, fontSize: 13 }}
            onClick={reflectAI}
            disabled={reflection === "..."}
          >
            ✨ {reflection === "..." ? "AI lagi baca pola lu…" : "Baca pola gue dong"}
          </button>
        </div>
        {reflection && reflection !== "..." && (
          <>
            <div style={{ ...S.aiBubble, marginTop: 10, whiteSpace: "pre-wrap" }}>
              {reflection}
            </div>
            <div style={{ ...S.dumpHint, marginTop: 6, textAlign: "center" }}>
              AI cuma baca pola, bukan diagnosis. Buat yang berat, psikolog tetep juaranya.
            </div>
          </>
        )}
      </div>

      {/* ===== kebiasaan ===== */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 22 }}>
        <div style={S.sectionHead}>
          <span>Yang lagi dikurangin</span>
        </div>
        <button style={S.promAddLink} onClick={() => setShowHabitForm((v) => !v)}>
          {showHabitForm ? "batal" : "+ tambah"}
        </button>
      </div>

      {showHabitForm && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <input
            style={{ ...S.input, flex: 1, minWidth: 0 }}
            placeholder="Apa yang mau dikurangin?"
            value={newHabit}
            onChange={(e) => setNewHabit(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addHabit()}
          />
          <button style={{ ...S.addBtn, width: 60 }} onClick={addHabit}>OK</button>
        </div>
      )}

      {habits === null && <div style={S.empty}>Memuat…</div>}
      {habits !== null && habits.length === 0 && !showHabitForm && (
        <div style={S.empty}>Belum ada. Mulai dari satu aja — jangan borong.</div>
      )}

      {(habits || []).map((h) => {
        const days = cleanDays(h);
        const tm = topMood(h);
        return (
          <div key={h.id} style={{ ...S.card, display: "block" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.cardTitle}>{h.name}</div>
                <div style={{ ...S.dumpHint, marginBottom: 0, marginTop: 3 }}>
                  <span style={{ color: "var(--green)", fontWeight: 700 }}>
                    {days === 0 ? "mulai lagi hari ini" : `bersih ${days} hari`}
                  </span>
                  {tm && <> · biasanya kejadian pas lagi {tm} {moodEmoji(tm)}</>}
                </div>
              </div>
              <div style={S.cardBtns}>
                <button style={S.btnGhost} onClick={() => logEvent(h)}>
                  kejadian lagi
                </button>
                <button style={S.btnGhost} onClick={() => removeHabit(h.id)}>✕</button>
              </div>
            </div>
            {justLogged === h.id && (
              <div style={{ ...S.aiBubble, marginTop: 8 }}>
                Kecatet. Gapapa — jujur itu bagian tersulitnya, dan lu barusan lakuin.
                Hitungannya mulai lagi dari sekarang, bukan dari nol harga diri.
              </div>
            )}
          </div>
        );
      })}

      <EnergiSection session={session} />

      <WaktuSection session={session} />

      <div style={S.footer}>
        Gak ada streak yang "hangus", gak ada merah, gak ada hukuman.
        Cuma data — biar lu kenal polanya sendiri.
      </div>
    </>
  );
}

function HomePage({ session, go }) {
  const [d, setD] = useState(null);

  useEffect(() => {
    (async () => {
      const uid = session.user.id;
      const today = localToday();
      const month = today.slice(0, 7);

      const [tasks, promises, exp, fixed, moods, dreams, touches, habits, hevents, debts] =
        await Promise.all([
          supabase.from("tasks").select("title,status,daily").eq("user_id", uid),
          supabase.from("promises").select("text,to_whom,due_date").eq("done", false),
          supabase.from("expenses").select("amount,kind").eq("user_id", uid).eq("spent_date", today),
          supabase.from("fixed_costs").select("name,last_paid").eq("user_id", uid),
          supabase.from("moods").select("mood,date").eq("user_id", uid).eq("date", today).order("created_at", { ascending: false }).limit(1),
          supabase.from("dreams").select("id,name,next_step").eq("user_id", uid),
          supabase.from("dream_touches").select("dream_id").eq("user_id", uid).eq("date", today),
          supabase.from("habits").select("id,name,created_at").eq("user_id", uid),
          supabase.from("habit_events").select("habit_id,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(100),
          supabase.from("debts").select("amount,status").eq("user_id", uid),
        ]);

      const t = tasks.data || [];
      const doing = t.find((x) => x.status === "inprogress");
      const daily = t.filter((x) => x.daily);
      const proms = promises.data || [];
      const overdue = proms.filter((p) => p.due_date && p.due_date < today);
      const dueToday = proms.filter((p) => p.due_date === today);
      const out = (exp.data || []).filter((r) => (r.kind || "out") === "out").reduce((s, r) => s + r.amount, 0);
      const unpaid = (fixed.data || []).filter((f) => f.last_paid !== month);
      const drs = dreams.data || [];
      const touchedIds = new Set((touches.data || []).map((x) => x.dream_id));
      const hbs = (habits.data || []).map((h) => {
        const ev = (hevents.data || []).filter((e) => e.habit_id === h.id);
        const last = ev.length > 0 ? ev[0].created_at : h.created_at;
        return { name: h.name, days: Math.floor((Date.now() - new Date(last)) / 86400000) };
      });
      const piutang = (debts.data || []).filter((x) => x.status !== "lunas").reduce((s, x) => s + Number(x.amount), 0);

      let showMoney = false;
      try { showMoney = localStorage.getItem("tugasku-show-total") === "1"; } catch {}

      setD({
        doing, todoCount: t.filter((x) => x.status === "todo").length,
        dailyDone: daily.filter((x) => x.status === "done").length, dailyTotal: daily.length,
        overdue, dueToday, promCount: proms.length,
        out, showMoney, unpaid,
        mood: moods.data?.[0]?.mood || null,
        dreams: drs.map((x) => ({ ...x, touched: touchedIds.has(x.id) })),
        habits: hbs, piutang,
      });
    })();
  }, [session]);

  if (!d) return <div style={S.empty}>Memuat…</div>;

  const Card = ({ emoji, title, children, page, accent }) => (
    <div
      style={{
        ...S.card,
        display: "block",
        cursor: "pointer",
        ...(accent ? { border: "1px solid var(--accent-border)", background: "var(--accent-bg)" } : {}),
      }}
      onClick={() => go(page)}
    >
      <div style={{ ...S.eyebrow, marginBottom: 6 }}>{emoji} {title}</div>
      {children}
    </div>
  );
  const big = { fontSize: 16, fontWeight: 600, lineHeight: 1.35 };
  const sub = { fontSize: 12, color: "var(--muted2)", marginTop: 3 };

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <Card emoji="🔥" title="Fokus sekarang" page="tugas" accent>
            <div style={big}>
              {d.doing ? d.doing.title : "Gak ada yang nyala — pilih satu dari " + d.todoCount + " todo"}
            </div>
            {d.dailyTotal > 0 && (
              <div style={sub}>
                wajib harian: <b style={{ color: d.dailyDone === d.dailyTotal ? "var(--green)" : "var(--ink)" }}>{d.dailyDone}/{d.dailyTotal}</b> kelar
              </div>
            )}
          </Card>
        </div>

        <Card emoji="🤝" title="Janji" page="tugas">
          <div style={big}>
            {d.overdue.length > 0 ? (
              <span style={{ color: "var(--red)" }}>{d.overdue.length} TELAT</span>
            ) : d.dueToday.length > 0 ? (
              <span style={{ color: "var(--janji-ink)" }}>{d.dueToday.length} hari ini</span>
            ) : d.promCount > 0 ? (
              `${d.promCount} jalan`
            ) : (
              "aman ✓"
            )}
          </div>
          {(d.overdue[0] || d.dueToday[0]) && (
            <div style={sub}>
              {(d.overdue[0] || d.dueToday[0]).text}
              {(d.overdue[0] || d.dueToday[0]).to_whom && <> · ke <b>{(d.overdue[0] || d.dueToday[0]).to_whom}</b></>}
            </div>
          )}
        </Card>

        <Card emoji="💸" title="Duit hari ini" page="duit">
          <div style={big}>{d.showMoney ? rupiah(d.out) : "Rp ••••"}</div>
          <div style={sub}>
            {d.unpaid.length > 0 ? `${d.unpaid.length} rutin belum dibayar` : "rutin bulan ini beres ✓"}
            {d.piutang > 0 && d.showMoney && <> · piutang {rupiah(d.piutang)}</>}
          </div>
        </Card>

        <Card emoji={d.mood ? moodEmoji(d.mood) : "🫥"} title="Mood" page="diri">
          <div style={big}>{d.mood || "belum check-in"}</div>
          {d.habits.length > 0 && (
            <div style={sub}>
              {d.habits.slice(0, 2).map((h, i) => (
                <span key={h.name}>{i > 0 && " · "}{h.name}: <b style={{ color: "var(--green)" }}>{h.days}h</b></span>
              ))}
            </div>
          )}
        </Card>

        <Card emoji="⭐" title="Mimpi" page="diri">
          <div style={big}>
            {d.dreams.length === 0
              ? "belum ada"
              : `${d.dreams.filter((x) => x.touched).length}/${d.dreams.length} kesentuh`}
          </div>
          {d.dreams.find((x) => !x.touched) && (
            <div style={sub}>
              next: {d.dreams.find((x) => !x.touched).next_step || d.dreams.find((x) => !x.touched).name}
            </div>
          )}
        </Card>
      </div>
      <div style={S.footer}>Tap kartu buat buka tab-nya. Satu layar, cukup.</div>
    </>
  );
}

function PublicView({ userId, themeVars }) {
  const [tasks, setTasks] = useState(null);

  useEffect(() => {
    supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .eq("is_public", true)
      .then(({ data, error }) => setTasks(error ? [] : data));
  }, [userId]);

  const byStatus = (s) =>
    (tasks || []).filter((t) => t.status === s).sort((a, b) => a.priority - b.priority);
  const doing = byStatus("inprogress");
  const todo = byStatus("todo");
  const done = byStatus("done");

  const dateLabel = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div style={{ ...S.page, ...themeVars }}>
      <style>{FIRE_CSS}</style>
      <div className="lh-wrap">
        <div style={{ marginBottom: 20 }}>
          <div style={S.eyebrow}>{dateLabel} · Papan publik (read-only)</div>
          <h1 style={S.h1}>LifeHack</h1>
        </div>

        {tasks === null && (
          <div style={S.empty}>Memuat…</div>
        )}

        {tasks !== null && tasks.length === 0 && (
          <div style={{ ...S.focusCard }}>
            <div style={S.focusTitle}>Belum ada yang di-share di sini.</div>
          </div>
        )}

        {doing.length > 0 && (
          <div style={{ ...S.focusCard, animation: "emberGlow 1.8s ease-in-out infinite" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Flame />
              <div style={{ ...S.focusLabel, marginBottom: 0 }}>Lagi dikerjain</div>
            </div>
            {doing.map((t) => (
              <div key={t.id} style={{ ...S.focusTitle, marginBottom: 4, marginTop: 8 }}>
                {t.title}
              </div>
            ))}
          </div>
        )}

        {todo.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <div style={S.sectionHead}><span>Antrian</span><span style={S.count}>{todo.length}</span></div>
            {todo.map((t) => (
              <div key={t.id} style={S.card}>
                <div style={S.cardTitle}>{t.title}</div>
              </div>
            ))}
          </div>
        )}

        {done.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <div style={S.sectionHead}><span>Kelar</span><span style={S.count}>{done.length}</span></div>
            {done.map((t) => (
              <div key={t.id} style={{ ...S.card, opacity: 0.55 }}>
                <div style={{ ...S.cardTitle, textDecoration: "line-through" }}>{t.title}</div>
              </div>
            ))}
          </div>
        )}

        <div style={S.footer}>Cuma yang ditandain publik yang keliatan di sini.</div>
      </div>
    </div>
  );
}

function Login({ themeVars }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const u = username.trim().toLowerCase();
    if (!u || !password) return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({
      email: `${u}@tugasku.local`,
      password,
    });
    setBusy(false);
    if (error) setErr("Username atau password salah.");
  };

  return (
    <div
      style={{
        ...S.page,
        ...themeVars,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 340, padding: 16 }}>
        <div style={S.eyebrow}>Masuk dulu</div>
        <h1 style={{ ...S.h1, marginBottom: 4 }}>LifeHack</h1>
        <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 18 }}>by afifi</div>
        <input
          style={{ ...S.input, width: "100%", boxSizing: "border-box", marginBottom: 8 }}
          placeholder="Username"
          autoCapitalize="none"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          style={{ ...S.input, width: "100%", boxSizing: "border-box", marginBottom: 12 }}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {err && (
          <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 10 }}>
            {err}
          </div>
        )}
        <button
          style={{ ...S.focusBtn, opacity: busy ? 0.6 : 1 }}
          disabled={busy}
          onClick={submit}
        >
          {busy ? "Sebentar…" : "Masuk →"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, count, children, collapsed, onToggle }) {
  return (
    <div style={{ marginTop: 26 }}>
      <div
        style={{ ...S.sectionHead, cursor: "pointer", userSelect: "none" }}
        onClick={onToggle}
      >
        <span>
          <span style={S.chev}>{collapsed ? "▸" : "▾"}</span> {title}
        </span>
        <span style={S.count}>{count}</span>
      </div>
      {!collapsed && children}
    </div>
  );
}

function Card({ t, children, active, done, onEdit, onTogglePublic }) {
  const [more, setMore] = useState(false);
  const kids = Array.isArray(children) ? children.filter(Boolean) : [children];
  const primary = kids[0];
  const rest = kids.slice(1);
  return (
    <div
      style={{
        ...S.card,
        ...(active
          ? {
              border: "1px solid transparent",
              animation: "emberGlow 1.8s ease-in-out infinite",
            }
          : {}),
        ...(done ? { opacity: 0.55 } : {}),
      }}
    >
      {active && <Flame />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <EditableText
          value={t.title}
          onSave={(v) => onEdit(t.id, v)}
          style={{
            ...S.cardTitle,
            ...(done ? { textDecoration: "line-through" } : {}),
          }}
        />
        <div style={S.tags}>
          {t.priority === 0 && (
            <span style={{ ...S.tag, color: "var(--accent)", borderColor: "var(--accent-border)" }}>
              penting
            </span>
          )}
          {t.daily && <span style={S.tag}>harian</span>}
          {t.is_public && (
            <span style={{ ...S.tag, color: "var(--green)", borderColor: "var(--green-border)" }}>
              publik
            </span>
          )}
        </div>
      </div>
      <div style={S.cardBtns}>
        {more && onTogglePublic && (
          <button
            style={{ ...S.btnGhost, ...(t.is_public ? { borderColor: "var(--green)", color: "var(--green)" } : {}) }}
            title={t.is_public ? "Keliatan di link publik — klik buat sembunyiin" : "Privat — klik buat tampilin di link publik"}
            onClick={() => onTogglePublic(t)}
          >
            {t.is_public ? "👁" : "🙈"}
          </button>
        )}
        {more && rest}
        {primary}
        <button
          style={{ ...S.btnGhost, padding: "7px 8px" }}
          title="Aksi lainnya"
          onClick={() => setMore((v) => !v)}
        >
          {more ? "›" : "⋯"}
        </button>
      </div>
    </div>
  );
}

function Empty({ text }) {
  return <div style={S.empty}>{text}</div>;
}

const S = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    fontFamily:
      "'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif",
    color: "var(--ink)",
    padding: "24px 16px 60px",
  },
  wrap: { maxWidth: 560, margin: "0 auto" },
  eyebrow: {
    fontSize: 12,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 4,
  },
  h1: { fontSize: 30, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" },

  focusCard: {
    background: "var(--accent-bg)",
    border: "1px solid var(--accent-border)",
    borderRadius: 14,
    padding: "16px 18px",
    marginBottom: 22,
  },
  focusLabel: {
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--accent)",
    fontWeight: 700,
    marginBottom: 6,
  },
  focusTitle: { fontSize: 18, fontWeight: 600, lineHeight: 1.35, marginBottom: 12 },
  focusBtn: {
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 16px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },

  addRow: { display: "flex", gap: 8 },
  input: {
    flex: 1,
    padding: "11px 14px",
    borderRadius: 10,
    border: "1px solid var(--border2)",
    background: "var(--card)",
    fontSize: 16, // >=16 biar iOS gak auto-zoom pas ngetik
    outline: "none",
  },
  addBtn: {
    width: 46,
    borderRadius: 10,
    border: "none",
    background: "var(--ink)",
    color: "var(--bg)",
    fontSize: 20,
    cursor: "pointer",
  },
  addOpts: { display: "flex", gap: 16, marginTop: 8 },
  optLabel: { fontSize: 13, color: "var(--muted2)", display: "flex", alignItems: "center", gap: 4 },

  sectionHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--muted2)",
    marginBottom: 8,
  },
  count: {
    background: "var(--badge)",
    borderRadius: 20,
    padding: "1px 9px",
    fontSize: 12,
  },
  card: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "12px 14px",
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: 500, lineHeight: 1.35 },
  tags: { display: "flex", gap: 6, marginTop: 5 },
  tag: {
    fontSize: 11,
    color: "var(--muted)",
    border: "1px solid var(--border)",
    borderRadius: 20,
    padding: "1px 8px",
  },
  cardBtns: { display: "flex", gap: 6, flexShrink: 0 },
  btn: {
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "7px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnGhost: {
    background: "transparent",
    color: "var(--muted)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "7px 10px",
    fontSize: 13,
    cursor: "pointer",
  },
  empty: {
    fontSize: 13,
    color: "var(--faint)",
    padding: "10px 2px",
  },
  dump: {
    marginTop: 26,
    background: "var(--dump-bg)",
    border: "1px dashed var(--dump-border)",
    borderRadius: 14,
    padding: "14px 16px",
  },
  dumpHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 10,
  },
  dumpTitle: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--muted2)",
  },
  dumpReleased: { fontSize: 12, color: "var(--green)", fontWeight: 600 },
  dumpHint: { fontSize: 12, color: "var(--muted)", marginBottom: 8 },
  worryCard: {
    background: "var(--card2)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "10px 12px",
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  promBox: {
    marginBottom: 22,
    background: "var(--janji-bg)",
    border: "1px solid var(--janji-border)",
    borderRadius: 14,
    padding: "14px 16px",
  },
  promAddLink: {
    background: "transparent",
    border: "none",
    color: "var(--janji-ink)",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    padding: 0,
  },
  themeBtn: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 16,
    cursor: "pointer",
    lineHeight: 1,
  },
  chev: { display: "inline-block", width: 14, fontSize: 11, color: "var(--faint)" },
  miniCount: {
    marginLeft: 8,
    background: "var(--badge)",
    borderRadius: 20,
    padding: "1px 8px",
    fontSize: 11,
    color: "var(--muted2)",
  },
  aiBubble: {
    marginTop: 8,
    padding: "8px 10px",
    background: "var(--accent-bg)",
    border: "1px solid var(--accent-border)",
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--ink)",
  },
  nav: {
    display: "flex",
    gap: 6,
    marginBottom: 20,
    background: "var(--badge)",
    borderRadius: 12,
    padding: 4,
  },
  navBtn: {
    flex: 1,
    padding: "9px 0",
    border: "none",
    borderRadius: 9,
    background: "transparent",
    color: "var(--muted2)",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  navBtnActive: {
    background: "var(--card)",
    color: "var(--ink)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  footer: {
    marginTop: 32,
    fontSize: 12,
    color: "var(--faint)",
    textAlign: "center",
  },
};
