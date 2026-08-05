import { useState, useEffect, useRef } from "react";
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
    "--accent": "#1E7A4D",
    "--on-accent": "#FFFFFF",
    "--accent-border": "#BFE0CB",
    "--accent-bg": "#EDF7F0",
    "--border": "#E3DFD4",
    "--border2": "#D9D4C8",
    "--badge": "#E8E4DA",
    "--card": "#FFFFFF",
    "--card2": "#FDFCFA",
    "--green-bg": "#EDF6EE",
    "--green-border": "#BFDCC2",
    "--green": "#3E7A46",
    "--green-dark": "#2E5934",
    "--on-green": "#FFFFFF",
    "--solid": "#2B2822",
    "--on-solid": "#F6F4EF",
    "--dump-bg": "#EFEBE2",
    "--dump-border": "#C9C2B2",
    "--janji-bg": "#FBF6E9",
    "--janji-border": "#E6D9B8",
    "--janji-ink": "#7A5C1E",
    "--on-janji": "#FFFFFF",
    "--red": "#C0392B",
    "--red-bg": "#FDF1EF",
    "--shadow-hard": "4px 4px 0 rgba(43,40,34,0.13)",
    // warna per sumber — versi terang dibikin lebih gelap biar kebaca di kartu putih
    "--src-0": "#C2451F",
    "--src-1": "#2F7A4F",
    "--src-2": "#2C6DA8",
    "--src-3": "#836512",
    "--src-4": "#7A4FA8",
    "--src-5": "#B33A54",
    "--src-6": "#1F7A72",
    "--src-7": "#8A5A38",
    // garis tebal ala kartu Tuku — di terang ikut warna tinta
    "--border-strong": "#2B2822",
    "--glass": "rgba(255,255,255,0.45)",
    "--glass-border": "rgba(0,0,0,0.07)",
    "--glass-hi": "rgba(255,255,255,0.75)",
    "--glass-pill": "#FFFFFF",
    "--glass-pill-shadow": "0 2px 10px rgba(0,0,0,0.14)",
    "--glass-shadow": "0 4px 18px rgba(0,0,0,0.06)",
    "--lens": "rgba(255,255,255,0.30)",
  },
  // gelap tapi bukan item pekat: permukaan berlapis (bg < card < card2) biar ada
  // kedalaman, teks off-white biar gak bikin halation, aksen digeser dikit biar
  // gak nyilo. Semua pasangan teks/latar minimal 4.5:1.
  dark: {
    "--bg": "#1A1713",
    "--ink": "#DEDACE",
    "--muted": "#A8A192",
    "--muted2": "#C2BBAB",
    "--faint": "#8F897B",
    "--accent": "#48C88A",
    "--on-accent": "#08190F",
    "--accent-border": "#2C5A3C",
    "--accent-bg": "#14291C",
    "--border": "#38332C",
    "--border2": "#453F36",
    "--badge": "#38332C",
    "--card": "#242019",
    "--card2": "#2B271F",
    "--green-bg": "#1B2A1E",
    "--green-border": "#31543A",
    "--green": "#7FC48C",
    "--green-dark": "#4F9A5C",
    "--on-green": "#0F1F0D",
    "--solid": "#B8B1A2",
    "--on-solid": "#1F1D18",
    "--dump-bg": "#211E17",
    "--dump-border": "#4A4534",
    "--janji-bg": "#2A2314",
    "--janji-border": "#544927",
    "--janji-ink": "#D4AF5E",
    "--on-janji": "#241F12",
    "--red": "#DB6552",
    "--red-bg": "#331A14",
    "--shadow-hard": "4px 4px 0 rgba(0,0,0,0.45)",
    "--src-0": "#E4572E",
    "--src-1": "#4C9E6E",
    "--src-2": "#5892D6",
    "--src-3": "#C9A227",
    "--src-4": "#A177D1",
    "--src-5": "#D95F79",
    "--src-6": "#38AFA5",
    "--src-7": "#B9825E",
    // di gelap garis tinta bakal nyilo — pakai abu hangat yang masih keliatan
    "--border-strong": "#4A4339",
    // di gelap kacanya dibikin cekung (lebih gelap dari latar) biar pill-nya
    // yang terang keliatan naik — sebelumnya track sama pill warnanya kembar
    "--glass": "rgba(0,0,0,0.55)",
    "--glass-border": "rgba(255,255,255,0.14)",
    "--glass-hi": "rgba(255,255,255,0.16)",
    "--glass-pill": "#4A4136",
    "--glass-pill-shadow": "0 2px 12px rgba(0,0,0,0.55)",
    "--glass-shadow": "0 6px 22px rgba(0,0,0,0.5)",
    "--lens": "rgba(255,255,255,0.14)",
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
  const [tugasSub, setTugasSub] = useState("board");
  const [page, setPage] = useState("home");
  const [navDir, setNavDir] = useState(1);
  const touchRef = useRef(null);
  const PAGES = ["home", "tugas", "barang", "duit", "diri"];

  const goPage = (p) => {
    setNavDir(PAGES.indexOf(p) >= PAGES.indexOf(page) ? 1 : -1);
    setPage(p);
  };

  const onTouchStart = (e) => {
    const tag = e.target.tagName;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
      touchRef.current = null;
      return;
    }
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchEnd = (e) => {
    if (!touchRef.current) return;
    const dx = e.changedTouches[0].clientX - touchRef.current.x;
    const dy = e.changedTouches[0].clientY - touchRef.current.y;
    touchRef.current = null;
    // harus jelas horizontal & cukup jauh — biar gak ketuker sama scroll
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 2) return;
    const i = PAGES.indexOf(page);
    if (dx < 0 && i < PAGES.length - 1) goPage(PAGES[i + 1]);
    if (dx > 0 && i > 0) goPage(PAGES[i - 1]);
  };
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
    const bg = THEMES[dark ? "dark" : "light"]["--bg"];
    document.body.style.background = bg;
    document.body.style.margin = "0";
    // html + theme-color ikut ganti biar area overscroll & UI browser gak nyilo
    document.documentElement.style.background = bg;
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", bg);
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

  const dateLabel = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div
      style={{ ...S.page, ...themeVars }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
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

        <GlassNav
          items={[["home", "Home"], ["tugas", "Tugas"], ["barang", "Barang"], ["duit", "Duit"], ["diri", "Diri"]]}
          value={page}
          onChange={goPage}
          style={{ marginBottom: 20 }}
        />

        <div key={page} className={navDir > 0 ? "page-slide-l" : "page-slide-r"}>

        {page === "barang" && <BarangPage session={session} />}
        {page === "duit" && <DuitPage session={session} />}
        {page === "diri" && <DiriPage session={session} />}
        {page === "home" && <HomePage session={session} go={goPage} />}

        {page === "tugas" && showPassForm && (
          <div style={S.promBox}>
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
        <GlassNav
          small
          items={[["board", "Tugas"], ["janji", "Janji"], ["resah", "Resah"]]}
          value={tugasSub}
          onChange={setTugasSub}
          style={{ marginBottom: 14 }}
        />

        {tugasSub === "board" && (
        <>
        <div>
            <div style={S.inputCard}>
              <div style={S.cardEyebrow}>Tugas baru</div>
              <div style={S.addRow}>
                <input
                  style={S.input}
                  placeholder="Tulis di sini…"
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
                    Harian
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
            </div>
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
              <button style={S.btnGreen} onClick={() => move(t.id, "done")}>
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

        {tugasSub === "janji" && (
        <>
        {/* janji — hal yang gak boleh kelupaan */}
        <div style={S.promBox}>
          <div style={S.dumpHead}>
            <span style={{ ...S.cardEyebrow, color: "var(--janji-ink)" }}>
              Janji
              {promises.length > 0 && (
                <span style={S.miniCount}>{promises.length}</span>
              )}
            </span>
            <button
              style={S.promAddLink}
              onClick={() => setShowPromForm((v) => !v)}
            >
              {showPromForm ? "batal" : "+ baru"}
            </button>
          </div>
          <>

          {showPromForm && (
            <div style={{ marginBottom: 10 }}>
              <input
                style={{ ...S.input, width: "100%", boxSizing: "border-box", marginBottom: 6 }}
                placeholder="Janji apa?"
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
            <div style={S.dumpHint}>Kosong.</div>
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
                    ? { borderLeft: "3px solid var(--janji-ink)", background: "var(--janji-bg)" }
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
                    {p.to_whom && (
                      <>ke <b>{p.to_whom}</b>{p.due_date ? " · " : ""}</>
                    )}
                    {overdue && (
                      <span style={{ color: "var(--red)", fontWeight: 700 }}>
                        telat · {p.due_date}
                      </span>
                    )}
                    {today && (
                      <span style={{ color: "var(--janji-ink)", fontWeight: 700 }}>
                        hari ini
                      </span>
                    )}
                    {!overdue && !today && p.due_date && <>{p.due_date}</>}
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
                    style={S.btnGreen}
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
        </div>
        </>
        )}

        {tugasSub === "resah" && (
        <>
        <div
          style={{
            ...S.inputCard,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ ...S.cardEyebrow, marginBottom: 0 }}>
              Resah
              {worries.length > 0 && <span style={S.miniCount}>{worries.length}</span>}
            </span>
            {released > 0 && <span style={S.dumpReleased}>{released} dilepas</span>}
          </div>
          <div style={S.addRow}>
            <input
              style={S.input}
              placeholder="Tumpahin di sini…"
              value={worryText}
              onChange={(e) => setWorryText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addWorry()}
            />
            <button style={S.addBtn} onClick={addWorry}>+</button>
          </div>
        </div>

        {worries.length === 0 && (
          <div style={{ ...S.empty, textAlign: "center", marginTop: 12 }}>Kosong.</div>
        )}
        {worries.length > 0 && (
          <div style={{ marginTop: 12 }}>
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
                      {suggestions[w.id] === "..." ? "AI lagi mikir…" : suggestions[w.id]}
                    </div>
                  )}
                </div>
                <div style={S.cardBtns}>
                  <button style={S.btnGhost} title="Minta saran AI" onClick={() => suggestAI(w)}>
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


        </>
        )}
        </div>
      </div>
    </div>
  );
}

const FIRE_CSS = `
html, body, #root { margin: 0; padding: 0; }
input::placeholder, textarea::placeholder { color: var(--faint); opacity: 1; }
.glass-nav {
  position: relative;
  display: flex;
  border-radius: 16px;
  background: var(--glass);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(18px) saturate(1.7);
  -webkit-backdrop-filter: blur(18px) saturate(1.7);
  box-shadow: inset 0 1px 0 var(--glass-hi), var(--glass-shadow);
  padding: 4px;
  overflow: hidden;
}
.glass-pill {
  position: absolute;
  top: 4px;
  bottom: 4px;
  border-radius: 12px;
  background: var(--glass-pill);
  box-shadow: var(--glass-pill-shadow), inset 0 1px 0 var(--glass-hi);
  transition: left 0.42s cubic-bezier(0.3, 1.35, 0.4, 1);
  pointer-events: none;
}
.glass-tab {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  padding: 9px 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 12px;
  transition: color 0.25s ease, transform 0.15s ease;
  font-family: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.glass-tab:active { transform: scale(0.94); }
.glass-pill.dragging {
  transition: none;
  transform: scale(1.18);
  z-index: 2;
  background: var(--lens);
  box-shadow: 0 8px 26px rgba(0,0,0,0.25), inset 0 1px 0 var(--glass-hi), 0 0 0 1px var(--glass-border);
  backdrop-filter: blur(1.5px) saturate(1.9) brightness(1.12);
  -webkit-backdrop-filter: blur(1.5px) saturate(1.9) brightness(1.12);
}
@keyframes pageFromRight { from { opacity: 0.35; transform: translateX(28px); } to { opacity: 1; transform: none; } }
@keyframes pageFromLeft  { from { opacity: 0.35; transform: translateX(-28px); } to { opacity: 1; transform: none; } }
.page-slide-l { animation: pageFromRight 0.28s cubic-bezier(0.25, 0.9, 0.35, 1); }
.page-slide-r { animation: pageFromLeft 0.28s cubic-bezier(0.25, 0.9, 0.35, 1); }
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
@keyframes toastIn {
  0%   { transform: translateX(-50%) translateY(14px); opacity: 0; }
  12%  { transform: translateX(-50%) translateY(0);    opacity: 1; }
  82%  { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes popTotal {
  0%   { transform: scale(1); }
  35%  { transform: scale(1.05); }
  100% { transform: scale(1); }
}
.keypad-key:active { transform: scale(0.94); }
.tap-tile { transition: transform 0.15s, border-color 0.15s, background 0.15s; }
.tap-tile:active { transform: scale(0.92); }
.submit-key:active { transform: translateY(2px); }
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

// mata buat toggle "keliatan / disembunyiin" — ikut warna teks tombolnya,
// jadi konsisten di light & dark (emoji dulu warnanya ngikut font sistem)
function Eye({ off }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block" }}
      aria-hidden="true"
    >
      <path d="M2 12s3.7-6.2 10-6.2S22 12 22 12s-3.7 6.2-10 6.2S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.7" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

function GlassNav({ items, value, onChange, small, style }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const [dragX, setDragX] = useState(null); // posisi pill (px) pas di-drag
  const n = items.length;
  const idx = Math.max(0, items.findIndex(([k]) => k === value));

  const onPointerDown = (e) => {
    const rect = ref.current.getBoundingClientRect();
    drag.current = { rect, startX: e.clientX, moved: false, lastX: null };
    ref.current.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.startX) < 7) return;
    d.moved = true;
    const segW = d.rect.width / n;
    const pillW = segW - 5;
    let x = e.clientX - d.rect.left - pillW / 2;
    x = Math.max(2.5, Math.min(d.rect.width - pillW - 2.5, x));
    d.lastX = x;
    setDragX(x);
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    setDragX(null);
    if (!d) return;
    const segW = d.rect.width / n;
    let i;
    if (!d.moved || d.lastX == null) {
      // tap biasa — pindah ke tab yang dipencet
      // (pointer capture bikin onClick tombol gak kepanggil, jadi ditangani di sini)
      i = Math.floor((e.clientX - d.rect.left) / segW);
    } else {
      const pillW = segW - 5;
      i = Math.floor((d.lastX + pillW / 2) / segW);
    }
    i = Math.max(0, Math.min(n - 1, i));
    onChange(items[i][0]);
  };

  const dragging = dragX != null;

  return (
    <div
      ref={ref}
      className="glass-nav"
      style={{ ...style, touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div
        className={dragging ? "glass-pill dragging" : "glass-pill"}
        style={{
          width: `calc(${100 / n}% - 5px)`,
          left: dragging ? dragX : `calc(${(idx * 100) / n}% + 2.5px)`,
        }}
      />
      {items.map(([k, label]) => (
        <button
          key={k}
          className="glass-tab"
          style={{
            fontSize: small ? 13 : 14,
            fontWeight: 700,
            color: value === k ? "var(--ink)" : "var(--muted2)",
          }}
          onClick={() => !dragging && onChange(k)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function EditableText({ value, onSave, style, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing)
    return (
      <div
        // kalau kosong, placeholder-nya yang jadi target tap — tanpa ini
        // barisnya nol tinggi dan gak ada yang bisa dipencet
        style={{ ...style, cursor: "text", ...(value ? {} : { color: "var(--faint)" }) }}
        title="Tap untuk edit"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value || placeholder || ""}
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
        border: "none",
        borderBottom: "1px solid var(--accent)",
        borderRadius: 0,
        padding: "2px 0",
        background: "transparent",
        outline: "none",
        font: "inherit",
      }}
      value={draft}
      placeholder={placeholder}
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

// angka-angka di Catet pakai mono biar berasa struk — stack bawaan sistem,
// gak usah nge-load font dari luar
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

// tiap sumber dapet warnanya sendiri. Nomor urutnya dari posisi di daftar
// sumber (jadi gak ada yang kembar selama <= 8), sumber yang udah dihapus dari
// daftar jatuh ke hash namanya biar warnanya tetep konsisten.
const srcVar = (name, sources) => {
  let i = sources.indexOf(name);
  if (i < 0) {
    let h = 0;
    for (let k = 0; k < name.length; k++) h = (h * 31 + name.charCodeAt(k)) >>> 0;
    i = h;
  }
  return `var(--src-${i % 8})`;
};
const srcTint = (name, sources, pct) =>
  `color-mix(in srgb, ${srcVar(name, sources)} ${pct}%, transparent)`;

// tombol keluar/masuk: yang aktif jadi pill padet
const segBtn = (on, isIn) => ({
  flex: 1,
  border: "none",
  borderRadius: 9,
  padding: "10px 0",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "background 0.15s, color 0.15s",
  ...(on
    ? isIn
      ? { background: "var(--green-dark)", color: "var(--on-green)" }
      : { background: "var(--solid)", color: "var(--on-solid)" }
    : { background: "transparent", color: "var(--muted)" }),
});

const submitBtn = (ready) => ({
  border: "1.5px solid var(--border2)",
  borderRadius: 14,
  background: ready ? "var(--accent)" : "var(--badge)",
  color: ready ? "var(--on-accent)" : "var(--faint)",
  fontSize: 16,
  fontWeight: 800,
  padding: "14px 0",
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "var(--shadow-hard)",
  transition: "background 0.12s, color 0.12s, transform 0.12s",
});

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
const usernameOf = (session) =>
  (session?.user?.email || "").split("@")[0] || "anon";

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
        <div style={S.eyebrow}>Keluar rutin</div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>{rupiah(total)}</div>
        <div style={{ ...S.dumpHint, marginTop: 2 }}>
          {unpaid.length === 0
            ? "semua kebayar ✓"
            : `${unpaid.length} belum dibayar`}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button style={S.promAddLink} onClick={() => setShowForm((v) => !v)}>
          {showForm ? "batal" : "+ tambah"}
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
                  {it.due_day ? ` · tgl ${it.due_day}` : ""}
                  {` · ${it.source || sources[0] || "cash"}`}
                </div>
              </div>
              <div style={S.cardBtns}>
                {paid ? (
                  <span style={{ ...S.tag, color: "var(--green)" }}>
                    ✓ bulan ini
                  </span>
                ) : (
                  <button
                    style={S.btnGreen}
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
        <div style={S.eyebrow}>Masuk rutin</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: "var(--green)" }}>
          {rupiah(incomes.reduce((s, x) => s + Number(x.amount), 0))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button style={S.promAddLink} onClick={() => setShowInForm((v) => !v)}>
          {showInForm ? "batal" : "+ tambah"}
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
                  <span style={{ ...S.tag, color: "var(--green)" }}>
                    ✓ bulan ini
                  </span>
                ) : (
                  <button
                    style={S.btnGreen}
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
      <GlassNav
        small
        items={[["piutang", "Ngutang ke gue"], ["utang", "Gue ngutang"]]}
        value={dir}
        onChange={setDir}
        style={{ marginTop: 4, marginBottom: 12 }}
      />

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
                style={S.btnGreen}
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

function GrupView({ session }) {
  const me = usernameOf(session);
  const [groups, setGroups] = useState(null);
  const [gid, setGid] = useState(null);
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [personal, setPersonal] = useState([]);
  const [mode, setMode] = useState(null); // null | create | join
  const [cForm, setCForm] = useState({ name: "", budget: "", end_date: "" });
  const [jCode, setJCode] = useState("");
  const [gAmt, setGAmt] = useState("");
  const [gNote, setGNote] = useState("");
  const [pAmt, setPAmt] = useState("");
  const [pNote, setPNote] = useState("");
  const [advice, setAdvice] = useState(null);
  const [err, setErr] = useState("");

  // daftar grup diambil dari keanggotaan, bukan dari isi money_groups —
  // biar yang udah keluar gak nongol lagi pas reload.
  const loadGroups = async () => {
    const { data: mine, error: memErr } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", session.user.id);
    if (memErr) { setGroups([]); return; }
    const ids = (mine || []).map((m) => m.group_id);
    if (ids.length === 0) { setGroups([]); setGid(null); return; }
    const { data, error } = await supabase
      .from("money_groups")
      .select("*")
      .in("id", ids);
    if (error) { setGroups([]); return; }
    setGroups(data);
    if (data.length > 0 && !gid) setGid(data[0].id);
  };
  useEffect(() => { loadGroups(); }, [session]);

  useEffect(() => {
    if (!gid) return;
    supabase.from("group_members").select("*").eq("group_id", gid)
      .then(({ data, error }) => setMembers(error ? [] : data));
    supabase.from("group_expenses").select("*").eq("group_id", gid)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => setExpenses(error ? [] : data));
    supabase.from("group_personal").select("*").eq("group_id", gid)
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => setPersonal(error ? [] : data));
    setAdvice(null);
  }, [gid, session]);

  const createGroup = async () => {
    const name = cForm.name.trim();
    if (!name) return;
    const budget = parseInt(cForm.budget.replace(/\D/g, ""), 10) || null;
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const { data, error } = await supabase
      .from("money_groups")
      .insert({ name, budget, end_date: cForm.end_date || null, invite_code: code })
      .select().single();
    if (error) { setErr(error.message); return; }
    await supabase.from("group_members").insert({ group_id: data.id, name: me });
    setCForm({ name: "", budget: "", end_date: "" });
    setMode(null);
    setGroups((gs) => [...(gs || []), data]);
    setGid(data.id);
  };

  const joinGroup = async () => {
    const code = jCode.trim().toUpperCase();
    if (!code) return;
    setErr("");
    const { data, error } = await supabase.rpc("join_money_group", { code, uname: me });
    if (error || !data) { setErr("Kode grup gak ketemu."); return; }
    setJCode("");
    setMode(null);
    await loadGroups();
    setGid(data);
  };

  const addGroupExpense = async () => {
    const amount = parseInt(gAmt.replace(/\D/g, ""), 10);
    if (!amount) return;
    const row = { group_id: gid, amount, note: gNote.trim() || null, by_name: me, spent_date: localToday() };
    setGAmt(""); setGNote("");
    const { data, error } = await supabase.from("group_expenses").insert(row).select().single();
    if (!error) setExpenses((xs) => [data, ...xs]);
  };

  const leaveGroup = async () => {
    if (!window.confirm(`Keluar dari "${g.name}"? Catatan pengeluaran grup tetap kesimpen buat anggota lain.`))
      return;
    setErr("");
    const { data, error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", gid)
      .eq("user_id", session.user.id)
      .select();
    if (error) { setErr(error.message); return; }
    // nol baris = kehapus policy, bukan sukses diem-diem
    if (!data || data.length === 0) { setErr("Gagal keluar dari grup."); return; }
    const rest = (groups || []).filter((x) => x.id !== gid);
    setGroups(rest);
    setGid(rest[0]?.id || null);
    setMode(null);
  };

  const addPersonalExpense = async () => {
    const amount = parseInt(pAmt.replace(/\D/g, ""), 10);
    if (!amount) return;
    const row = { group_id: gid, amount, note: pNote.trim() || null, spent_date: localToday() };
    setPAmt(""); setPNote("");
    const { data, error } = await supabase.from("group_personal").insert(row).select().single();
    if (!error) setPersonal((xs) => [data, ...xs]);
  };

  const g = (groups || []).find((x) => x.id === gid);
  const myMember = members.find((m) => m.user_id === session.user.id);
  const groupSpent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const groupLeft = g?.budget != null ? Number(g.budget) - groupSpent : null;
  const myPersonalSpent = personal.reduce((s, e) => s + Number(e.amount), 0);
  const myPersonalLeft = myMember?.personal_budget != null ? Number(myMember.personal_budget) - myPersonalSpent : null;
  const daysLeft = g?.end_date
    ? Math.max(0, Math.ceil((new Date(g.end_date + "T00:00:00") - new Date(localToday() + "T00:00:00")) / 86400000))
    : null;

  const askAI = async () => {
    setAdvice("...");
    try {
      const summary = [
        `Trip: ${g.name}${g.end_date ? `, berakhir ${g.end_date} (sisa ${daysLeft} hari)` : ""}`,
        `Budget bersama: ${g.budget != null ? rupiah(Number(g.budget)) : "belum diset"} | kepake ${rupiah(groupSpent)} | sisa ${groupLeft != null ? rupiah(groupLeft) : "-"}`,
        `Anggota: ${members.map((m) => m.name).join(", ")} (${members.length} orang)`,
        `Pengeluaran grup terakhir: ${expenses.slice(0, 10).map((e) => `${rupiah(Number(e.amount))}${e.note ? " " + e.note : ""}`).join("; ") || "belum ada"}`,
        `Budget pribadi gue: ${myMember?.personal_budget != null ? rupiah(Number(myMember.personal_budget)) : "belum diset"} | kepake ${rupiah(myPersonalSpent)} | sisa ${myPersonalLeft != null ? rupiah(myPersonalLeft) : "-"}`,
      ].join("\n");
      const r = await fetch("/api/tripai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary }),
      });
      const data = await r.json();
      setAdvice(data.advice || "AI-nya lagi bengong, coba lagi.");
    } catch {
      setAdvice("Gagal konek ke AI.");
    }
  };

  if (groups === null) return <div style={S.empty}>Memuat…</div>;

  // ---- belum punya grup / mau bikin-gabung ----
  if (!g || mode) {
    return (
      <>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button
            style={{ ...S.btnGhost, flex: 1, fontWeight: 700, ...(mode === "create" ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}) }}
            onClick={() => setMode("create")}
          >
            + Bikin grup
          </button>
          <button
            style={{ ...S.btnGhost, flex: 1, fontWeight: 700, ...(mode === "join" ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}) }}
            onClick={() => setMode("join")}
          >
            Gabung pakai kode
          </button>
          {g && (
            <button style={{ ...S.btnGhost }} onClick={() => setMode(null)}>✕</button>
          )}
        </div>

        {mode === "create" && (
          <div style={{ marginTop: 10 }}>
            <input
              style={{ ...S.input, width: "100%", boxSizing: "border-box", marginBottom: 6 }}
              placeholder="Nama grup"
              value={cForm.name}
              onChange={(e) => setCForm({ ...cForm, name: e.target.value })}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <input
                style={{ ...S.input, flex: 1.5, minWidth: 0 }}
                placeholder="Budget bersama"
                inputMode="numeric"
                value={cForm.budget}
                onChange={(e) => setCForm({ ...cForm, budget: e.target.value })}
              />
              <input
                type="date"
                style={{ ...S.input, flex: 1, minWidth: 0 }}
                title="Trip sampai kapan? (buat hitung sisa hari)"
                value={cForm.end_date}
                onChange={(e) => setCForm({ ...cForm, end_date: e.target.value })}
              />
              <button style={{ ...S.addBtn, width: 60 }} onClick={createGroup}>OK</button>
            </div>
          </div>
        )}

        {mode === "join" && (
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <input
              style={{ ...S.input, flex: 1, minWidth: 0, textTransform: "uppercase" }}
              placeholder="Kode grup"
              value={jCode}
              onChange={(e) => setJCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinGroup()}
            />
            <button style={{ ...S.addBtn, width: 60 }} onClick={joinGroup}>OK</button>
          </div>
        )}

        {err && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{err}</div>}
        {!g && !mode && (
          <div style={{ ...S.empty, marginTop: 10 }}>
            Buat patungan trip, kosan, apa aja.
          </div>
        )}
      </>
    );
  }

  // ---- tampilan grup aktif ----
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
        {groups.length > 1 ? (
          <select
            style={{ ...S.input, flex: 1, minWidth: 0, fontWeight: 700 }}
            value={gid}
            onChange={(e) => setGid(e.target.value)}
          >
            {groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        ) : (
          <div style={{ flex: 1, fontSize: 17, fontWeight: 700 }}>{g.name}</div>
        )}
        <button
          style={S.btnGhost}
          title="Copy kode invite buat temen"
          onClick={() => {
            navigator.clipboard
              .writeText(`Gabung grup "${g.name}" di LifeHack: buka ${window.location.origin}, login/daftar, tab Duit → Grup → Gabung pakai kode: ${g.invite_code}`)
              .then(() => alert(`Kode ${g.invite_code} + instruksi kecopy ✓`));
          }}
        >
          🔗 {g.invite_code}
        </button>
        <button style={S.btnGhost} onClick={() => setMode("join")}>+</button>
      </div>

      <div style={{ ...S.dumpHint, marginTop: 6 }}>
        anggota: {members.map((m) => m.name).join(" · ") || "cuma lu"}
        {daysLeft != null && <> · <b>sisa {daysLeft} hari</b></>}
      </div>

      {/* budget bersama */}
      <div style={{ ...S.dump, marginTop: 12, textAlign: "center" }}>
        <div style={S.eyebrow}>Budget bersama</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: groupLeft != null && groupLeft < 0 ? "var(--red)" : "var(--ink)" }}>
          {groupLeft != null ? `sisa ${rupiah(groupLeft)}` : rupiah(groupSpent) + " kepake"}
        </div>
        {g.budget != null && (
          <div style={{ ...S.dumpHint, marginTop: 2 }}>
            dari {rupiah(Number(g.budget))} · kepake {rupiah(groupSpent)}
          </div>
        )}
        <button style={{ ...S.btnGhost, fontSize: 13, marginTop: 8 }} onClick={askAI} disabled={advice === "..."}>
          ✨ {advice === "..." ? "lagi ngitung…" : "Duitnya cukup gak?"}
        </button>
        {advice && advice !== "..." && (
          <div style={{ ...S.aiBubble, marginTop: 8, textAlign: "left", whiteSpace: "pre-wrap" }}>{advice}</div>
        )}
      </div>

      {/* catat pengeluaran grup */}
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        <input
          style={{ ...S.input, flex: 1, minWidth: 0 }}
          placeholder="Berapa?"
          inputMode="numeric"
          value={gAmt}
          onChange={(e) => setGAmt(e.target.value)}
        />
        <input
          style={{ ...S.input, flex: 1.2, minWidth: 0 }}
          placeholder="Buat apa?"
          value={gNote}
          onChange={(e) => setGNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addGroupExpense()}
        />
        <button style={{ ...S.addBtn, width: 50 }} onClick={addGroupExpense}>+</button>
      </div>

      {expenses.map((e) => (
        <div key={e.id} style={{ ...S.card, padding: "10px 14px", marginTop: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{rupiah(Number(e.amount))}</span>
            <span style={{ ...S.dumpHint, marginLeft: 8 }}>
              {e.note ? `${e.note} · ` : ""}oleh {e.by_name} · {e.spent_date}
            </span>
          </div>
          <button style={S.btnGhost} onClick={async () => {
            setExpenses((xs) => xs.filter((x) => x.id !== e.id));
            await supabase.from("group_expenses").delete().eq("id", e.id);
          }}>✕</button>
        </div>
      ))}

      {/* pribadi — cuma lu yang liat */}
      <div style={{ ...S.sectionHead, marginTop: 24, marginBottom: 6 }}>
        <span>Pribadi (privat)</span>
        <span style={{ ...S.count, fontWeight: 400 }}>
          {myPersonalLeft != null ? `sisa ${rupiah(myPersonalLeft)}` : rupiah(myPersonalSpent) + " kepake"}
        </span>
      </div>
      <div style={{ ...S.dumpHint, marginBottom: 6 }}>
        budget:{" "}
        <EditableText
          value={myMember?.personal_budget != null ? rupiah(Number(myMember.personal_budget)) : ""}
          onSave={async (v) => {
            const n = parseInt(v.replace(/\D/g, ""), 10);
            if (isNaN(n)) return;
            setMembers((ms) => ms.map((m) => m.user_id === session.user.id ? { ...m, personal_budget: n } : m));
            await supabase.from("group_members").update({ personal_budget: n })
              .eq("group_id", gid).eq("user_id", session.user.id);
          }}
          placeholder="tap buat set"
          style={{ display: "inline-block", fontSize: 13, fontWeight: 700 }}
        />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          style={{ ...S.input, flex: 1, minWidth: 0 }}
          placeholder="Berapa?"
          inputMode="numeric"
          value={pAmt}
          onChange={(e) => setPAmt(e.target.value)}
        />
        <input
          style={{ ...S.input, flex: 1.2, minWidth: 0 }}
          placeholder="Buat apa?"
          value={pNote}
          onChange={(e) => setPNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addPersonalExpense()}
        />
        <button style={{ ...S.addBtn, width: 50 }} onClick={addPersonalExpense}>+</button>
      </div>
      {personal.map((e) => (
        <div key={e.id} style={{ ...S.card, padding: "10px 14px", marginTop: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{rupiah(Number(e.amount))}</span>
            <span style={{ ...S.dumpHint, marginLeft: 8 }}>{e.note || ""} · {e.spent_date}</span>
          </div>
          <button style={S.btnGhost} onClick={async () => {
            setPersonal((xs) => xs.filter((x) => x.id !== e.id));
            await supabase.from("group_personal").delete().eq("id", e.id);
          }}>✕</button>
        </div>
      ))}

      <div style={{ textAlign: "center", marginTop: 26 }}>
        <button
          style={{ ...S.btnGhost, fontSize: 13, color: "var(--red)" }}
          onClick={leaveGroup}
        >
          Keluar dari grup
        </button>
      </div>
      {err && (
        <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8, textAlign: "center" }}>
          {err}
        </div>
      )}
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
                      style={S.btnGreen}
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

function AsetView({ session, sources }) {
  const [assets, setAssets] = useState(null);
  const [balances, setBalances] = useState([]);
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
    supabase
      .from("balances")
      .select("*")
      .eq("user_id", session.user.id)
      .then(({ data, error }) => setBalances(error ? [] : data));
  }, [session]);

  const setBalance = async (source, amount) => {
    const row = {
      source,
      amount,
      updated_at: new Date().toISOString(),
      user_id: session.user.id,
    };
    setBalances((bs) => [...bs.filter((b) => b.source !== source), row]);
    await supabase.from("balances").upsert(row, { onConflict: "user_id,source" });
  };

  const balanceOf = (source) => balances.find((b) => b.source === source);

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

  const saldoTotal = balances.reduce((s, b) => s + Number(b.amount), 0);
  const total = assets.reduce((s, x) => s + x.value, 0) + saldoTotal;

  return (
    <>
      <div style={{ marginTop: 6, textAlign: "center" }}>
        <div style={S.eyebrow}>Total aset (saldo + lainnya)</div>
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
            style={{ ...S.btnGhost, padding: "6px 8px", lineHeight: 0 }}
            title={show ? "Sembunyiin" : "Liat"}
            onClick={toggleShow}
          >
            <Eye off={show} />
          </button>
        </div>
      </div>

      {/* ===== saldo per sumber ===== */}
      <div style={{ ...S.sectionHead, marginTop: 18, marginBottom: 8 }}>
        <span>Saldo</span>
        <span style={{ ...S.count, fontWeight: 400 }}>
          {show ? rupiah(saldoTotal) : "••••"}
        </span>
      </div>
      {sources.map((s) => {
        const b = balanceOf(s);
        return (
          <div key={s} style={{ ...S.card, padding: "10px 14px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {s}
              </span>
              {b && (
                <span style={{ ...S.dumpHint, marginLeft: 8 }}>
                  update {Math.floor((Date.now() - new Date(b.updated_at)) / 86400000) === 0
                    ? "hari ini"
                    : `${Math.floor((Date.now() - new Date(b.updated_at)) / 86400000)} hari lalu`}
                </span>
              )}
            </div>
            <EditableText
              value={b ? (show ? rupiah(Number(b.amount)) : "••••") : "isi saldo…"}
              onSave={(v) => {
                const n = parseInt(v.replace(/\D/g, ""), 10);
                if (!isNaN(n)) setBalance(s, n);
              }}
              style={{ fontSize: 15, fontWeight: 700, textAlign: "right", minWidth: 90 }}
            />
          </div>
        );
      })}
      <div style={{ ...S.dumpHint, marginBottom: 4 }}>
        Nama sumber ngikutin chip di tab Catet (edit lewat ✎ di sana).
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 18 }}>
        <div style={S.sectionHead}><span>Aset lainnya</span></div>
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
  const [calMonth, setCalMonth] = useState(() => localToday().slice(0, 7)); // 'YYYY-MM'
  const [catetSub, setCatetSub] = useState("catet");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [totalKey, setTotalKey] = useState(0); // ganti = total-nya ngedenyut
  const toastRef = useRef(null);

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
      .slice(0, 12);
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

  const toast = (msg) => {
    clearTimeout(toastRef.current);
    setAddedMsg("");
    requestAnimationFrame(() => {
      setAddedMsg(msg);
      toastRef.current = setTimeout(() => setAddedMsg(""), 1600);
    });
  };

  const add = async () => {
    const amt = parseInt(amount.replace(/\D/g, ""), 10);
    if (!amt) {
      toast("Isi nominalnya dulu ya 😉");
      return;
    }
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
    setTotalKey((k) => k + 1);
    toast(kind === "out" ? `✓ Kecatet! ${rupiah(amt)}` : `✓ Masuk ${rupiah(amt)} 🎉`);
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

  // ---- data buat kartu struk ----
  // 7 hari yang berujung di tanggal yang lagi diliat
  const DOW = ["M", "S", "S", "R", "K", "J", "S"];
  const spark = [...Array(7)].map((_, i) => {
    const d = new Date(viewDate + "T00:00:00");
    d.setDate(d.getDate() - (6 - i));
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const v = rows
      .filter((r) => r.spent_date === ds && isOut(r))
      .reduce((s, r) => s + r.amount, 0);
    return { ds, v, label: DOW[d.getDay()], now: ds === viewDate };
  });
  const sparkMax = Math.max(...spark.map((d) => d.v), 1);

  // rincian per sumber buat hari yang diliat
  const bySource = {};
  todayRows.filter(isOut).forEach((r) => {
    bySource[r.source] = (bySource[r.source] || 0) + r.amount;
  });
  const breakdown = Object.entries(bySource).sort((a, b) => b[1] - a[1]);

  const amountNum = parseInt(amount.replace(/\D/g, ""), 10) || 0;
  const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "⌫"];
  const tapKey = (k) =>
    setAmount((a) => {
      const digits = a.replace(/\D/g, "");
      if (k === "⌫") return digits.slice(0, -1);
      const next = (digits + k).replace(/^0+(?=\d)/, "");
      return next.length > 9 ? digits : next;
    });

  return (
    <>
      <GlassNav
        small
        items={[["keluar", "Catet"], ["rutin", "Rutin"], ["mikir", "Rencana"], ["utang", "Utang"], ["grup", "Grup"], ["aset", "Aset"]]}
        value={sub}
        onChange={setSub}
        style={{ marginBottom: 14 }}
      />

      {sub === "aset" && <AsetView session={session} sources={sources} />}
      {sub === "rutin" && (
        <RutinView session={session} sources={sources} onLogExpense={logExpense} />
      )}
      {sub === "mikir" && <MikirView session={session} onLogExpense={logExpense} />}
      {sub === "utang" && (
        <UtangView session={session} sources={sources} onLogExpense={logExpense} />
      )}
      {sub === "grup" && <GrupView session={session} />}

      {sub === "keluar" && (
      <>
      <GlassNav
        small
        items={[["catet", "Catet"], ["struk", "Struk"], ["kalender", "Kalender"]]}
        value={catetSub}
        onChange={setCatetSub}
        style={{ marginBottom: 14 }}
      />

      {catetSub === "catet" && (
      <>
      {/* ===== kartu catet ===== */}
      <div style={{ ...S.receipt, marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* kalendernya pindah tab — jangan sampai nyatet ke tanggal lain tanpa sadar */}
        {!isToday && (
          <button
            style={{
              ...S.btnGhost,
              fontFamily: MONO,
              fontSize: 11,
              borderColor: "var(--janji-border)",
              color: "var(--janji-ink)",
            }}
            title="Balikin ke hari ini"
            onClick={() => setSpentDate(today)}
          >
            nyatet buat {dayLabel} · balik ke hari ini ✕
          </button>
        )}
        <div style={{ display: "flex", gap: 6, background: "var(--badge)", borderRadius: 12, padding: 4 }}>
          {[["out", "− Keluar"], ["in", "+ Masuk"]].map(([k, label]) => (
            <button key={k} style={segBtn(kind === k, k === "in")} onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ textAlign: "center" }}>
          <input
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "none",
              background: "transparent",
              textAlign: "center",
              fontFamily: MONO,
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: amountNum ? "var(--ink)" : "var(--faint)",
              outline: "none",
              padding: 0,
            }}
            inputMode="numeric"
            aria-label="Nominal"
            value={"Rp " + (amountNum ? amountNum.toLocaleString("id-ID") : "0")}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 9))}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--faint)", marginTop: 2 }}>
            {amountNum ? (
              <>
                {kind === "out" ? "keluar" : "masuk"} ·{" "}
                <span style={{ color: srcVar(source, sources), fontWeight: 700 }}>{source}</span>
              </>
            ) : (
              "ketik atau pencet angkanya 👇"
            )}
          </div>
        </div>

        {!editSrc ? (
          <div style={{ display: "flex", gap: 6 }}>
            <select
              style={{
                ...S.input,
                flex: 1,
                minWidth: 0,
                textTransform: "uppercase",
                fontSize: 13,
                fontWeight: 700,
                color: srcVar(source, sources),
              }}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              {sources.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
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
          <div style={{ display: "flex", gap: 6 }}>
            <input
              style={{ ...S.input, flex: 1, minWidth: 0, fontSize: 16 }}
              placeholder="Pisahin pakai koma"
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

        <input
          style={{ ...S.input, width: "100%", boxSizing: "border-box", fontSize: 16 }}
          placeholder="Catatan"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7 }}>
          {KEYS.map((k) => (
            <button key={k} className="keypad-key" style={S.keypadKey} onClick={() => tapKey(k)}>
              {k}
            </button>
          ))}
        </div>

        <button className="submit-key" style={submitBtn(amountNum > 0)} onClick={add}>
          {kind === "out" ? "Catet keluar" : "Catet masuk"}
        </button>
      </div>

      </>
      )}

      {catetSub === "struk" && (
      <>
      {/* ===== struk: total hari yang lagi diliat ===== */}
      <div style={S.receipt}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <div style={S.receiptEyebrow}>Keluar {dayLabel}</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
            {todayRows.length} catatan
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
          <div
            key={totalKey}
            style={{
              fontFamily: MONO,
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: showTotal ? "-0.02em" : "0.12em",
              animation: "popTotal 0.35s ease",
            }}
          >
            {showTotal ? rupiah(todayTotal) : "Rp ••••••"}
          </div>
          <button
            style={{ ...S.btnGhost, padding: "6px 8px", lineHeight: 0 }}
            title={showTotal ? "Sembunyiin total" : "Liat total"}
            onClick={toggleTotal}
          >
            <Eye off={showTotal} />
          </button>
        </div>

        {/* 7 hari terakhir — batang terakhir = hari yang lagi diliat */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 40, marginTop: 12 }}>
          {spark.map((d) => (
            <div
              key={d.ds}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}
            >
              <div
                title={showTotal && d.v ? `${d.ds} · ${rupiah(d.v)}` : d.ds}
                style={{
                  width: "100%",
                  borderRadius: "4px 4px 0 0",
                  background: d.now ? "var(--accent)" : "var(--border2)",
                  height: Math.max(3, Math.round((d.v / sparkMax) * 24)),
                }}
              />
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  color: d.now ? "var(--accent)" : "var(--faint)",
                }}
              >
                {d.label}
              </div>
            </div>
          ))}
        </div>

        {showTotal && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
            {rupiah(avg)}/hari · minggu {rupiah(thisWeek)} · bulan {rupiah(thisMonth)}
          </div>
        )}
        {showTotal && todayIn > 0 && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--green)", marginTop: 3 }}>
            masuk +{rupiah(todayIn)}
          </div>
        )}
        {showTotal && monthIn > 0 && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--green)", marginTop: 3 }}>
            masuk bulan ini +{rupiah(monthIn)}
          </div>
        )}
      </div>

      {/* ===== struk hari ini ===== */}
      <div style={S.receiptList}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            padding: "0 18px 10px",
            borderBottom: "1.5px dashed var(--border2)",
          }}
        >
          <div style={S.receiptEyebrow}>Struk {dayLabel}</div>
          {breakdown.length > 0 && (
            <button
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                fontFamily: MONO,
                fontSize: 11,
                color: "var(--accent)",
                textDecoration: "underline",
                padding: 0,
              }}
              onClick={() => setShowBreakdown((v) => !v)}
            >
              {showBreakdown ? "tutup" : "rincian"}
            </button>
          )}
        </div>

        {showBreakdown && breakdown.length > 0 && (
          <div
            style={{
              padding: "12px 18px",
              borderBottom: "1.5px dashed var(--border2)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {breakdown.map(([src, v]) => (
              <div key={src}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600 }}>
                  <span style={{ textTransform: "uppercase", color: srcVar(src, sources) }}>
                    {src}
                  </span>
                  <span style={{ fontFamily: MONO }}>{showTotal ? rupiah(v) : "Rp ••••"}</span>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 99,
                    background: "var(--badge)",
                    marginTop: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      background: srcVar(src, sources),
                      borderRadius: 99,
                      width: `${Math.round((v / (todayTotal || 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {todayRows.length === 0 && (
          <div style={{ ...S.empty, textAlign: "center", padding: "16px 18px" }}>Kosong.</div>
        )}

        {todayRows.map((r) => (
          <div
            key={r.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "11px 18px",
              borderBottom: "1px dotted var(--border)",
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: srcTint(r.source, sources, 16),
                border: `1px solid ${srcTint(r.source, sources, 45)}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                color: srcVar(r.source, sources),
                flexShrink: 0,
              }}
            >
              {r.source.slice(0, 3)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {r.note || r.source}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: "var(--muted)" }}>
                {r.created_at
                  ? new Date(r.created_at).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    }) + " · "
                  : ""}
                {r.source}
              </div>
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 13,
                fontWeight: 700,
                color: isOut(r) ? "var(--ink)" : "var(--green)",
                whiteSpace: "nowrap",
              }}
            >
              {showTotal ? `${isOut(r) ? "−" : "+"}${rupiah(r.amount)}` : "Rp ••••"}
            </div>
            <button
              style={{ border: "none", background: "none", cursor: "pointer", color: "var(--faint)", fontSize: 13, padding: 2 }}
              onClick={() => remove(r.id)}
            >
              ✕
            </button>
          </div>
        ))}

        <div
          style={{
            padding: "12px 18px 0",
            display: "flex",
            justifyContent: "space-between",
            fontFamily: MONO,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <span>TOTAL</span>
          <span>{showTotal ? rupiah(todayTotal) : "Rp ••••••"}</span>
        </div>

        {/* sobekan struk */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: -9,
            height: 9,
            background:
              "repeating-linear-gradient(90deg, var(--card) 0 10px, transparent 10px 20px)",
          }}
        />
      </div>
      <div
        style={{
          textAlign: "center",
          fontFamily: MONO,
          fontSize: 10,
          color: "var(--faint)",
          letterSpacing: "1px",
          marginTop: 16,
        }}
      >
        ✂ - - - - - - - - - - - - - - - - - - - -
      </div>

      <div style={{ textAlign: "center", marginTop: 14 }}>
        <button
          style={{ ...S.btnGhost, fontSize: 13 }}
          title="Duit gue kemana aja?"
          onClick={analyzeAI}
          disabled={analysis === "..."}
        >
          {analysis === "..." ? "✨ lagi mikir…" : "✨"}
        </button>
      </div>
      {analysis && analysis !== "..." && (
        <div style={{ ...S.aiBubble, marginTop: 10, whiteSpace: "pre-wrap" }}>
          {analysis}
        </div>
      )}

      </>
      )}

      {catetSub === "kalender" && (
      <>
      {(() => {
        // total keluar per tanggal (dari data yang keload, ~40 hari)
        const perDay = {};
        rows.forEach((r) => {
          if ((r.kind || "out") === "out")
            perDay[r.spent_date] = (perDay[r.spent_date] || 0) + r.amount;
        });
        const vals = Object.values(perDay).filter((v) => v > 0);
        const avgDay = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;

        const colorOf = (d) => {
          if (!showTotal) return null; // mata ketutup = polos
          const v = perDay[d];
          if (!v) return null;
          if (avgDay === 0) return null;
          if (v < avgDay * 0.5) return "var(--green)";
          if (v <= avgDay * 1.5) return "var(--janji-ink)";
          return "var(--red)";
        };

        const [yy, mm] = calMonth.split("-").map(Number);
        const first = new Date(yy, mm - 1, 1);
        const daysIn = new Date(yy, mm, 0).getDate();
        const startDow = first.getDay(); // Minggu = 0
        const cells = [
          ...Array(startDow).fill(null),
          ...Array.from({ length: daysIn }, (_, i) => i + 1),
        ];
        const prevM = () => {
          const d = new Date(yy, mm - 2, 1);
          setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        };
        const nextM = () => {
          const d = new Date(yy, mm, 1);
          setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        };
        const monthLabel = first.toLocaleDateString("id-ID", { month: "long", year: "numeric" });

        return (
          <div style={{ ...S.dump, marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <button style={S.btnGhost} onClick={prevM}>‹</button>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{monthLabel}</span>
              <button style={S.btnGhost} onClick={nextM}>›</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {["M", "S", "S", "R", "K", "J", "S"].map((d, i) => (
                <div key={i} style={{ textAlign: "center", fontSize: 10, color: "var(--faint)" }}>{d}</div>
              ))}
              {cells.map((day, i) => {
                if (!day) return <div key={i} />;
                const ds = `${calMonth}-${String(day).padStart(2, "0")}`;
                const c = colorOf(ds);
                const sel = ds === (spentDate || localToday());
                const future = ds > localToday();
                return (
                  <button
                    key={i}
                    disabled={future}
                    onClick={() => setSpentDate(ds)}
                    title={showTotal && perDay[ds] ? rupiah(perDay[ds]) : ds}
                    style={{
                      padding: "7px 0",
                      borderRadius: 8,
                      fontSize: 13,
                      cursor: future ? "default" : "pointer",
                      background: sel ? "var(--badge)" : "transparent",
                      border: sel
                        ? "1.5px solid var(--accent)"
                        : c
                        ? `1.5px solid ${c}`
                        : "1px solid var(--border)",
                      color: future ? "var(--faint)" : c || "var(--ink)",
                      fontWeight: sel || c ? 700 : 400,
                      opacity: future ? 0.35 : 1,
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      </>
      )}

      {addedMsg && <div style={S.toast}>{addedMsg}</div>}
      </>
      )}

    </>
  );
}

// urut dari yang paling berat ke yang paling enak — biar gampang nyarinya.
// kolom `mood` di database cuma text, jadi nambah pilihan gak perlu migrasi.
const MOODS = [
  ["lelah", "😴"], ["bosan", "🥱"], ["sedih", "😢"], ["kesepian", "😔"],
  ["cemas", "😰"], ["frustasi", "😤"], ["marah", "😠"], ["kewalahan", "😵‍💫"],
  ["biasa", "😐"], ["lega", "😮‍💨"], ["tenang", "😌"], ["oke", "🙂"],
  ["seneng", "😄"], ["bersyukur", "🙏"],
];
const moodEmoji = (m) => (MOODS.find((x) => x[0] === m) || ["", "·"])[1];

// Poin streak "yang lagi dikurangin". Makin lama makin gede lompatannya —
// dihitung dari lamanya bersih, jadi gak ada yang perlu disimpen di database.
const STREAK_TIERS = [
  { days: 1, pts: 1, label: "hari pertama" },
  { days: 3, pts: 3, label: "3 hari" },
  { days: 7, pts: 10, label: "1 minggu" },
  { days: 14, pts: 25, label: "2 minggu" },
  { days: 30, pts: 60, label: "1 bulan" },
  { days: 60, pts: 150, label: "2 bulan" },
  { days: 90, pts: 250, label: "3 bulan" },
  { days: 180, pts: 600, label: "6 bulan" },
  { days: 365, pts: 1500, label: "1 tahun" },
];
// tiap hari good habit dikerjain
const GOOD_POINT = 5;
const streakPoints = (days) =>
  STREAK_TIERS.filter((t) => days >= t.days).reduce((s, t) => s + t.pts, 0);
const nextTier = (days) => STREAK_TIERS.find((t) => days < t.days) || null;
const lastTierDays = (days) => {
  const passed = STREAK_TIERS.filter((t) => days >= t.days);
  return passed.length ? passed[passed.length - 1].days : 0;
};

const PALETTE = [
  "#E4572E", "#3E7A46", "#B8860B", "#4A6FA5",
  "#8E5BA6", "#C0392B", "#2A9D8F", "#8A8578",
];

// ---------- jam: menit dari tengah malam ----------
const toMin = (s) => {
  const m = /^\s*(\d{1,2})[:.]?(\d{2})\s*$/.exec(String(s ?? ""));
  if (!m) return null;
  const h = +m[1];
  const mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
};
const fromMin = (v) =>
  v == null
    ? ""
    : `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
// durasi start→end, lewat tengah malam ikut kehitung; sama persis = sehari penuh
const spanMin = (s, e) => (e - s + 1440) % 1440 || 1440;
const parseRange = (txt) => {
  const parts = String(txt).split(/[-–—]/);
  if (parts.length !== 2) return null;
  const s = toMin(parts[0]);
  const e = toMin(parts[1]);
  if (s == null || e == null) return null;
  return {
    start_min: s,
    end_min: e,
    hours: Math.round((spanMin(s, e) / 60) * 100) / 100,
  };
};

const SNAP = 5; // menit — biar gampang pas ditarik pakai jari

// Jam analog 24 jam — tengah malam di atas, jalan searah jarum jam.
// Ujung tiap busur bisa ditarik buat ganti jam mulai / selesai.
function JamAnalog({ blocks, onCommit }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null); // { id, which: 'start' | 'end' }
  const [draft, setDraft] = useState(null); // { id, start_min, end_min }
  const [nowMin, setNowMin] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    }, 60000);
    return () => clearInterval(t);
  }, []);

  const timed = blocks
    .filter((b) => b.start_min != null && b.end_min != null)
    .map((b) => (draft && draft.id === b.id ? { ...b, ...draft } : b));

  const pt = (min, r) => {
    const a = ((min / 1440) * 360 - 90) * (Math.PI / 180);
    return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
  };
  const arc = (s, e, r) => {
    const sweep = Math.min(spanMin(s, e), 1439.9);
    const [x1, y1] = pt(s, r);
    const [x2, y2] = pt(s + sweep, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${sweep > 720 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const [hx, hy] = pt(nowMin, 52);

  // posisi jari -> menit, dibulatin ke kelipatan SNAP
  const minutesAt = (e) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return null;
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    const min = ((deg + 360) % 360) * 4; // 360 derajat = 1440 menit
    return (Math.round(min / SNAP) * SNAP) % 1440;
  };

  const startDrag = (b, which) => (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { id: b.id, which };
    setDraft({ id: b.id, start_min: b.start_min, end_min: b.end_min });
  };

  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const m = minutesAt(e);
    if (m == null) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const next =
        d.which === "start" ? { ...prev, start_min: m } : { ...prev, end_min: m };
      // jangan sampai busurnya ilang
      return spanMin(next.start_min, next.end_min) < 15 ? prev : next;
    });
  };

  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || !draft) return;
    const before = blocks.find((b) => b.id === d.id);
    if (
      before &&
      (before.start_min !== draft.start_min || before.end_min !== draft.end_min)
    ) {
      onCommit(d.id, {
        start_min: draft.start_min,
        end_min: draft.end_min,
        hours: Math.round((spanMin(draft.start_min, draft.end_min) / 60) * 100) / 100,
      });
    }
    setDraft(null);
  };

  const dragging = draft && timed.find((b) => b.id === draft.id);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 200 200"
      style={{ width: "100%", maxWidth: 250, display: "block", margin: "2px auto 0" }}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* jam & angkanya */}
      {[...Array(24)].map((_, h) => {
        const major = h % 6 === 0;
        const [x1, y1] = pt(h * 60, 78);
        const [x2, y2] = pt(h * 60, major ? 85 : 83);
        const [tx, ty] = pt(h * 60, 93);
        return (
          <g key={h}>
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={major ? "var(--muted2)" : "var(--border2)"}
              strokeWidth={major ? 1.6 : 1}
              strokeLinecap="round"
            />
            <text
              x={tx} y={ty}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily={MONO}
              fontSize="7.5"
              fontWeight={major ? 700 : 400}
              fill={major ? "var(--muted2)" : "var(--faint)"}
            >
              {h}
            </text>
          </g>
        );
      })}

      {/* cincin kegiatan */}
      <circle cx="100" cy="100" r="62" fill="none" stroke="var(--badge)" strokeWidth="12" />
      {timed.map((b) => (
        <path
          key={b.id}
          d={arc(b.start_min, b.end_min, 62)}
          stroke={b.color || "var(--muted)"}
          strokeWidth="12"
          fill="none"
          opacity={draft && draft.id !== b.id ? 0.4 : 1}
        >
          <title>{`${b.name} · ${fromMin(b.start_min)}–${fromMin(b.end_min)}`}</title>
        </path>
      ))}

      {/* pegangan tiap ujung — ditarik buat ganti jamnya */}
      {timed.map((b) =>
        ["start", "end"].map((which) => {
          const [x, y] = pt(which === "start" ? b.start_min : b.end_min, 62);
          const on = draft?.id === b.id && dragRef.current?.which === which;
          return (
            <g
              key={`${b.id}-${which}`}
              onPointerDown={startDrag(b, which)}
              style={{ cursor: "grab", touchAction: "none" }}
            >
              <circle cx={x} cy={y} r="13" fill="transparent" />
              <circle
                cx={x}
                cy={y}
                r={on ? 6.5 : 5}
                fill={b.color || "var(--muted)"}
                stroke="var(--bg)"
                strokeWidth="2"
              />
            </g>
          );
        })
      )}

      {/* jarum "sekarang" */}
      <line
        x1="100" y1="100" x2={hx} y2={hy}
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="100" cy="100" r="2.6" fill="var(--accent)" />

      {/* pas ditarik, jamnya muncul di tengah */}
      {dragging && (
        <>
          <text
            x="100" y="124"
            textAnchor="middle"
            fontFamily={MONO}
            fontSize="9"
            fontWeight="700"
            fill="var(--ink)"
          >
            {fromMin(dragging.start_min)}–{fromMin(dragging.end_min)}
          </text>
          <text
            x="100" y="134"
            textAnchor="middle"
            fontFamily={MONO}
            fontSize="6"
            letterSpacing="1.2"
            fill="var(--faint)"
          >
            {(spanMin(dragging.start_min, dragging.end_min) / 60).toFixed(1)} JAM
          </text>
        </>
      )}
    </svg>
  );
}

function WaktuSection({ session }) {
  const [blocks, setBlocks] = useState(null);
  const [form, setForm] = useState({ name: "", hours: "", start: "", end: "", wajib: false });
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase
      .from("time_blocks")
      .select("*")
      .eq("user_id", session.user.id)
      .order("hours", { ascending: false })
      .then(({ data, error }) => setBlocks(error ? [] : data));
  }, [session]);

  // jam mulai/selesai diisi dua-duanya = durasinya ngikut, gak usah ngetik lagi
  const formSpan = (() => {
    const s = toMin(form.start);
    const e = toMin(form.end);
    if (s == null || e == null) return null;
    return { start_min: s, end_min: e, hours: Math.round((spanMin(s, e) / 60) * 100) / 100 };
  })();

  const addBlock = async () => {
    const name = form.name.trim();
    const hours = formSpan
      ? formSpan.hours
      : parseFloat(String(form.hours).replace(",", "."));
    if (!name || isNaN(hours) || hours <= 0) return;
    const used = (blocks || []).length;
    const row = {
      name,
      hours,
      wajib: form.wajib,
      color: PALETTE[used % PALETTE.length],
      ...(formSpan ? { start_min: formSpan.start_min, end_min: formSpan.end_min } : {}),
    };
    setErr("");
    setForm({ name: "", hours: "", start: "", end: "", wajib: false });
    setShowForm(false);
    const { data, error } = await supabase
      .from("time_blocks").insert(row).select().single();
    if (error) { setErr(error.message); return; }
    setBlocks((xs) => [...xs, data].sort((a, b) => b.hours - a.hours));
  };

  const patchBlock = async (id, patch) => {
    setBlocks((xs) =>
      xs
        .map((x) => (x.id === id ? { ...x, ...patch } : x))
        .sort((a, b) => b.hours - a.hours)
    );
    const { error } = await supabase.from("time_blocks").update(patch).eq("id", id);
    if (error) setErr(error.message);
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 26, gap: 10 }}>
        <div style={S.sectionHead}><span>🕒 Peta 24 jam</span></div>
        <button style={S.promAddLink} onClick={() => setShowForm((v) => !v)}>
          {showForm ? "batal" : "+ kegiatan"}
        </button>
      </div>

      <div style={{ ...S.card, display: "block", padding: 14, marginBottom: 8 }}>
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
                background: b.color || "var(--muted)",
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

        <div
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: "var(--muted)",
            marginTop: 8,
            textAlign: "center",
          }}
        >
          {over ? (
            <span style={{ color: "var(--red)" }}>
              kepake {used.toFixed(1)} jam — lebih {(used - 24).toFixed(1)} jam dari 24
            </span>
          ) : (
            <>
              kepake {used.toFixed(1)} · wajib {wajibTotal.toFixed(1)} ·{" "}
              <b style={{ color: "var(--green)" }}>{free.toFixed(1)} jam bebas</b>
            </>
          )}
        </div>
      </div>

      {/* jam analog — cuma kegiatan yang punya jam mulai & selesai */}
      {blocks.some((b) => b.start_min != null && b.end_min != null) && (
        <div style={{ ...S.card, display: "block", padding: 14, marginBottom: 8 }}>
          <JamAnalog
            blocks={blocks}
            onCommit={(id, patch) => patchBlock(id, patch)}
          />
        </div>
      )}

      {showForm && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input
              style={{ ...S.input, flex: 1, minWidth: 0 }}
              placeholder="Kegiatan"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <button style={{ ...S.addBtn, width: 60 }} onClick={addBlock}>OK</button>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
            <input
              type="time"
              style={{ ...S.input, flex: 1, minWidth: 0, fontSize: 14 }}
              title="Jam mulai"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            />
            <span style={{ color: "var(--faint)", fontSize: 13 }}>–</span>
            <input
              type="time"
              style={{ ...S.input, flex: 1, minWidth: 0, fontSize: 14 }}
              title="Jam selesai"
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
            />
            <input
              style={{
                ...S.input,
                width: 74,
                flexShrink: 0,
                fontFamily: MONO,
                fontSize: 14,
                ...(formSpan ? { color: "var(--faint)" } : {}),
              }}
              placeholder="jam"
              inputMode="decimal"
              title={formSpan ? "Ikut jam mulai & selesai" : "Durasi (kalau jamnya gak pasti)"}
              disabled={!!formSpan}
              value={formSpan ? String(formSpan.hours) : form.hours}
              onChange={(e) => setForm({ ...form, hours: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && addBlock()}
            />
          </div>
          <label style={S.optLabel}>
            <input
              type="checkbox"
              checked={form.wajib}
              onChange={(e) => setForm({ ...form, wajib: e.target.checked })}
            />{" "}
            Wajib
          </label>
        </div>
      )}

      {blocks.length === 0 && !showForm && (
        <div style={S.empty}>Kosong.</div>
      )}

      {blocks.map((b) => (
        <div key={b.id} style={{ ...S.card, padding: "10px 14px" }}>
          <button
            className="tap-tile"
            title="Tap buat ganti warna"
            onClick={() => cycleColor(b)}
            style={{
              width: 20,
              height: 20,
              borderRadius: 7,
              border: "none",
              background: b.color || "var(--muted)",
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
            <EditableText
              value={
                b.start_min != null && b.end_min != null
                  ? `${fromMin(b.start_min)}–${fromMin(b.end_min)}`
                  : ""
              }
              onSave={(v) => {
                const r = parseRange(v);
                if (r) patchBlock(b.id, r);
                else if (!v.trim())
                  patchBlock(b.id, { start_min: null, end_min: null });
              }}
              placeholder="atur jam…"
              style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)", marginTop: 2 }}
            />
          </div>
          {b.wajib && (
            <span style={{ ...S.tag, color: "var(--janji-ink)" }}>
              wajib
            </span>
          )}
          <EditableText
            value={`${b.hours}`}
            onSave={(v) => {
              const n = parseFloat(String(v).replace(",", "."));
              if (!isNaN(n) && n > 0) patchBlock(b.id, { hours: n });
            }}
            style={{
              fontFamily: MONO,
              fontSize: 14,
              fontWeight: 700,
              minWidth: 34,
              textAlign: "right",
            }}
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

      {err && (
        <div style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>
          {err}
          {/[Cc]olumn|start_min/.test(err) && (
            <> — jalanin dulu bagian <code>time_blocks</code> di supabase-setup.sql.</>
          )}
        </div>
      )}
    </>
  );
}

// `children` disisipin di antara Mimpi sama Yang-nyedot-energi — biar urutan
// section-nya sama kayak desain tanpa mecah komponen ini jadi dua (dan bikin
// query-nya jalan dua kali)
function MimpiSection({ session }) {
  const [dreams, setDreams] = useState([]);
  const [touches, setTouches] = useState([]);
  const [newDream, setNewDream] = useState("");
  const [showDreamForm, setShowDreamForm] = useState(false);

  const today = localToday();

  useEffect(() => {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceStr = since.toISOString().slice(0, 10);
    supabase.from("dreams").select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => setDreams(error ? [] : data));
    supabase.from("dream_touches").select("*")
      .eq("user_id", session.user.id).gte("date", sinceStr)
      .then(({ data, error }) => setTouches(error ? [] : data));
  }, [session]);

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
    if (!error)
      setTouches((ts) => [...ts.filter((t) => !(t.dream_id === dr.id && t.date === today)), data]);
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

  const touchedDays = (id) =>
    new Set(touches.filter((t) => t.dream_id === id).map((t) => t.date)).size;
  const touchedToday = (id) =>
    touches.some((t) => t.dream_id === id && t.date === today);
  const touchedTodayCount = dreams.filter((d) => touchedToday(d.id)).length;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div style={{ ...S.sectionHead, color: "var(--janji-ink)" }}>
          <span>✨ Mimpi</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexShrink: 0 }}>
          {dreams.length > 0 && (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {touchedTodayCount}/{dreams.length} hari ini
            </span>
          )}
          <button style={S.promAddLink} onClick={() => setShowDreamForm((v) => !v)}>
            {showDreamForm ? "batal" : "+ mimpi"}
          </button>
        </div>
      </div>

      {showDreamForm && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input
            style={{ ...S.input, flex: 1, minWidth: 0 }}
            placeholder="Mimpi apa?"
            value={newDream}
            onChange={(e) => setNewDream(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDream()}
          />
          <button style={{ ...S.addBtn, width: 60 }} onClick={addDream}>OK</button>
        </div>
      )}

      {dreams.length === 0 && !showDreamForm && <div style={S.empty}>Belum ada.</div>}

      {dreams.map((dr) => {
        const days = touchedDays(dr.id);
        const doneToday = touchedToday(dr.id);
        return (
          <div
            key={dr.id}
            style={{
              ...S.card,
              display: "block",
              ...(doneToday ? { borderColor: "var(--janji-border)" } : {}),
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <EditableText
                  value={dr.name}
                  onSave={(v) => patchDream(dr.id, { name: v })}
                  style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}
                />
                <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                  {[...Array(7)].map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        background: i < days ? "var(--janji-ink)" : "transparent",
                        border: `1px solid ${i < days ? "var(--janji-ink)" : "var(--border2)"}`,
                      }}
                    />
                  ))}
                  <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 4 }}>
                    {days}/7 minggu ini
                  </span>
                </div>
              </div>
              <button
                className="tap-tile"
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "9px 14px",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  background: doneToday ? "var(--janji-bg)" : "var(--janji-ink)",
                  color: doneToday ? "var(--janji-ink)" : "var(--on-janji)",
                  boxShadow: doneToday ? "inset 0 0 0 1px var(--janji-border)" : "none",
                }}
                title={doneToday ? "Batal sentuh hari ini" : "Sentuh hari ini"}
                onClick={() => touchDream(dr)}
              >
                {doneToday ? "beres ✓" : "Sentuh"}
              </button>
              <button style={S.btnGhost} onClick={() => removeDream(dr.id)}>✕</button>
            </div>
            <div style={{ marginTop: 8 }}>
              <EditableText
                value={dr.next_step || ""}
                onSave={(v) => patchDream(dr.id, { next_step: v })}
                placeholder="langkah kecil berikutnya…"
                style={{ fontSize: 14, lineHeight: 1.4 }}
              />
            </div>
            <div style={{ marginTop: 3 }}>
              <EditableText
                value={dr.why || ""}
                onSave={(v) => patchDream(dr.id, { why: v })}
                placeholder="kenapa ini penting?"
                style={{ fontSize: 12, color: "var(--muted2)", fontStyle: "italic", lineHeight: 1.4 }}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

function DrainSection({ session }) {
  const [drains, setDrains] = useState([]);
  const [drainEvents, setDrainEvents] = useState([]);
  const [dailyStat, setDailyStat] = useState(null);
  const [newDrain, setNewDrain] = useState("");
  const [showDrainForm, setShowDrainForm] = useState(false);
  const [err, setErr] = useState("");

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
    setErr("");
    setNewDrain("");
    setShowDrainForm(false);
    const { data, error } = await supabase.from("drains").insert({ name }).select().single();
    if (error) { setErr(error.message); return; }
    setDrains((xs) => [...xs, data]);
  };

  const logDrain = async (d) => {
    const { data, error } = await supabase
      .from("drain_events").insert({ drain_id: d.id, date: today }).select().single();
    if (!error) setDrainEvents((es) => [...es, data]);
  };

  const patchDrain = async (id, patch) => {
    setErr("");
    setDrains((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("drains").update(patch).eq("id", id);
    if (error) setErr(error.message);
  };

  const removeDrain = async (d) => {
    if (!window.confirm(`Hapus "${d.name}"?`)) return;
    setDrains((xs) => xs.filter((x) => x.id !== d.id));
    setDrainEvents((es) => es.filter((e) => e.drain_id !== d.id));
    await supabase.from("drains").delete().eq("id", d.id);
  };

  const drainCount = (id) => drainEvents.filter((e) => e.drain_id === id).length;
  const drainToday = (id) =>
    drainEvents.filter((e) => e.drain_id === id && e.date === today).length;
  const topDrains = drains
    .map((d) => ({ ...d, n: drainCount(d.id) }))
    .filter((d) => d.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);

  // baris solusi: ikon + teks yang bisa di-tap buat diisi
  const solusi = (icon, value, onSave, placeholder, color) => (
    <div style={{ display: "flex", gap: 7, alignItems: "flex-start", marginTop: 6 }}>
      <span style={{ fontSize: 12, lineHeight: 1.5, flexShrink: 0 }}>{icon}</span>
      <EditableText
        value={value || ""}
        onSave={onSave}
        placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.45, color }}
      />
    </div>
  );

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div style={S.sectionHead}>
          <span>⚡ Bikin cape</span>
        </div>
        <button style={S.promAddLink} onClick={() => setShowDrainForm((v) => !v)}>
          {showDrainForm ? "batal" : "+ tambah"}
        </button>
      </div>

      {showDrainForm && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input
            style={{ ...S.input, flex: 1, minWidth: 0 }}
            placeholder="Apa yang bikin cape?"
            autoFocus
            value={newDrain}
            onChange={(e) => setNewDrain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDrain()}
          />
          <button style={{ ...S.addBtn, width: 60 }} onClick={addDrain}>OK</button>
        </div>
      )}

      {drains.length === 0 && !showDrainForm && <div style={S.empty}>Belum ada.</div>}

      {drains.map((d) => {
        const n = drainToday(d.id);
        const week = drainCount(d.id);
        return (
          <div
            key={d.id}
            style={{
              ...S.card,
              display: "block",
              ...(n > 0 ? { borderColor: "var(--red)" } : {}),
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <EditableText
                  value={d.name}
                  onSave={(v) => patchDrain(d.id, { name: v })}
                  style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}
                />
                {week > 0 && (
                  <div style={{ ...S.dumpHint, marginBottom: 0, marginTop: 2 }}>
                    {week}× minggu ini{n > 0 ? ` · ${n}× hari ini` : ""}
                  </div>
                )}
              </div>
              <button
                className="tap-tile"
                style={{
                  ...S.btnGhost,
                  borderRadius: 999,
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  ...(n > 0
                    ? {
                        background: "var(--red-bg)",
                        borderColor: "var(--red)",
                        color: "var(--red)",
                        fontWeight: 700,
                      }
                    : {}),
                }}
                title="Tap tiap kejadian"
                onClick={() => logDrain(d)}
              >
                kejadian{n > 0 ? ` ·${n}` : ""}
              </button>
              <button style={S.btnGhost} title={`Hapus "${d.name}"`} onClick={() => removeDrain(d)}>
                ✕
              </button>
            </div>

            {solusi(
              "🩹",
              d.solusi_sementara,
              (v) => patchDrain(d.id, { solusi_sementara: v }),
              "solusi sementaranya apa nih?",
              "var(--ink)"
            )}
            {solusi(
              "🌱",
              d.solusi_panjang,
              (v) => patchDrain(d.id, { solusi_panjang: v }),
              "solusi jangka panjang",
              "var(--muted2)"
            )}
          </div>
        );
      })}

      {topDrains.length > 0 && (
        <div style={{ ...S.dumpHint, marginTop: 8 }}>
          paling bikin cape:{" "}
          {topDrains.map((d, i) => (
            <span key={d.id}>
              {i > 0 && " · "}
              <b>{d.name} ×{d.n}</b>
            </span>
          ))}
        </div>
      )}

      {err && (
        <div style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>
          {err}
          {/solusi|[Cc]olumn/.test(err) && (
            <> — jalanin dulu bagian <code>drains</code> di supabase-setup.sql.</>
          )}
        </div>
      )}

      {dailyStat && (
        <div style={{ ...S.dumpHint, marginTop: 14, textAlign: "center" }}>
          Wajib harian hari ini:{" "}
          <b style={{ color: dailyStat.done === dailyStat.total ? "var(--green)" : "var(--ink)" }}>
            {dailyStat.done}/{dailyStat.total} kelar
          </b>
        </div>
      )}
    </>
  );
}

function PencapaianSection({ session }) {
  const [items, setItems] = useState(null);
  const [form, setForm] = useState({ text: "", year: "" });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    supabase
      .from("achievements")
      .select("*")
      .eq("user_id", session.user.id)
      .order("year", { ascending: false, nullsFirst: false })
      .then(({ data, error }) => setItems(error ? [] : data));
  }, [session]);

  const addItem = async () => {
    const text = form.text.trim();
    if (!text) return;
    const y = parseInt(form.year, 10);
    const row = { text, year: y >= 1900 && y <= 2100 ? y : null };
    setForm({ text: "", year: "" });
    setShowForm(false);
    const { data, error } = await supabase
      .from("achievements").insert(row).select().single();
    if (!error)
      setItems((xs) =>
        [...xs, data].sort((a, b) => (b.year || 0) - (a.year || 0))
      );
  };

  const patchItem = async (id, patch) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await supabase.from("achievements").update(patch).eq("id", id);
  };

  const removeItem = async (id) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    await supabase.from("achievements").delete().eq("id", id);
  };

  if (items === null) return null;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 26 }}>
        <div style={S.sectionHead}>
          <span>🏆 Rak pencapaian</span>
          {items.length > 0 && <span style={S.count}>{items.length}</span>}
        </div>
        <button style={S.promAddLink} onClick={() => setShowForm((v) => !v)}>
          {showForm ? "batal" : "+ tambah"}
        </button>
      </div>

      {showForm && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input
            style={{ ...S.input, flex: 2, minWidth: 0 }}
            placeholder="Apa yang berhasil lu capai?"
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
          />
          <input
            style={{ ...S.input, flex: 0.6, minWidth: 0 }}
            placeholder="Tahun"
            inputMode="numeric"
            value={form.year}
            onChange={(e) => setForm({ ...form, year: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
          />
          <button style={{ ...S.addBtn, width: 60 }} onClick={addItem}>OK</button>
        </div>
      )}

      {items.length === 0 && !showForm && (
        <div style={S.empty}>Belum ada.</div>
      )}

      {/* trofi tetep pakai kartu — di sini kartunya emang jadi medali */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        {items.map((a) => (
          <div
            key={a.id}
            style={{
              background: "linear-gradient(160deg, var(--janji-bg), var(--card))",
              border: "1px solid var(--janji-border)",
              borderRadius: 14,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              position: "relative",
            }}
          >
            <div style={{ fontSize: 18, lineHeight: 1 }}>🏅</div>
            <EditableText
              value={a.text}
              onSave={(v) => patchItem(a.id, { text: v })}
              style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}
            />
            <EditableText
              value={a.year ? String(a.year) : ""}
              onSave={(v) => {
                const y = parseInt(String(v).replace(/\D/g, ""), 10);
                patchItem(a.id, { year: y >= 1900 && y <= 2100 ? y : null });
              }}
              placeholder="tahun"
              style={{ fontSize: 11, color: "var(--janji-ink)", fontWeight: 700, fontFamily: MONO }}
            />
            <button
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                border: "none",
                background: "none",
                cursor: "pointer",
                color: "var(--faint)",
                fontSize: 12,
                padding: 4,
                lineHeight: 1,
              }}
              title="Hapus"
              onClick={() => removeItem(a.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function DiriPage({ session }) {
  const [moods, setMoods] = useState([]);
  const [habits, setHabits] = useState(null);
  const [events, setEvents] = useState([]);
  const [newHabit, setNewHabit] = useState("");
  const [showHabitForm, setShowHabitForm] = useState(null); // null | "bad" | "good"
  const [habitErr, setHabitErr] = useState("");
  const [sub, setSub] = useState("mood");
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
      const [dr, de, dm, dt, tb, dtask, ach] = await Promise.all([
        supabase.from("drains").select("id,name").eq("user_id", session.user.id),
        supabase.from("drain_events").select("drain_id,date").eq("user_id", session.user.id).gte("date", sinceStr),
        supabase.from("dreams").select("id,name,why,next_step").eq("user_id", session.user.id),
        supabase.from("dream_touches").select("dream_id,date").eq("user_id", session.user.id).gte("date", sinceStr),
        supabase.from("time_blocks").select("name,hours,wajib").eq("user_id", session.user.id),
        supabase.from("tasks").select("status").eq("user_id", session.user.id).eq("daily", true),
        supabase.from("achievements").select("text,year").eq("user_id", session.user.id),
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
        `Pencapaian seumur hidup: ${(ach.data || []).map((a) => a.text + (a.year ? ` (${a.year})` : "")).join("; ") || "belum diisi"}`,
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

  const addHabit = async (kind) => {
    const name = newHabit.trim();
    if (!name) return;
    setHabitErr("");
    setNewHabit("");
    setShowHabitForm(null);
    const { data, error } = await supabase
      .from("habits").insert({ name, kind }).select().single();
    if (error) { setHabitErr(error.message); return; }
    setHabits((hs) => [...hs, data]);
  };

  const patchHabit = async (id, patch) => {
    setHabits((hs) => hs.map((h) => (h.id === id ? { ...h, ...patch } : h)));
    const { error } = await supabase.from("habits").update(patch).eq("id", id);
    if (error) setHabitErr(error.message);
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

  // good habit: sekali sehari, bisa dibatalin kalau kepencet
  const toggleGood = async (h) => {
    if (doneToday(h)) {
      setEvents((es) => es.filter((e) => !(e.habit_id === h.id && e.date === today)));
      await supabase.from("habit_events").delete().eq("habit_id", h.id).eq("date", today);
      return;
    }
    const { data, error } = await supabase
      .from("habit_events")
      .insert({ habit_id: h.id, date: today, mood: todayMood?.mood || null })
      .select().single();
    if (!error) setEvents((es) => [data, ...es]);
  };

  const kindOf = (h) => h.kind || "bad";
  const badHabits = (habits || []).filter((h) => kindOf(h) === "bad");
  const goodHabits = (habits || []).filter((h) => kindOf(h) === "good");

  const cleanDays = (h) => {
    const ev = events.filter((e) => e.habit_id === h.id);
    const last = ev.length > 0 ? ev[0].created_at : h.created_at;
    return Math.floor((Date.now() - new Date(last)) / 86400000);
  };

  // good habit dihitung per hari, bukan per tap
  const doneDates = (h) =>
    new Set(events.filter((e) => e.habit_id === h.id).map((e) => e.date));
  const doneToday = (h) => doneDates(h).has(today);
  const goodPoints = (h) => doneDates(h).size * GOOD_POINT;

  const totalPoints =
    badHabits.reduce((s, h) => s + streakPoints(cleanDays(h)), 0) +
    goodHabits.reduce((s, h) => s + goodPoints(h), 0);

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
      {/* poin habit — keliatan di semua sub-tab */}
      {totalPoints > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "baseline",
            gap: 6,
            marginBottom: 8,
            fontFamily: MONO,
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 700, color: "var(--janji-ink)" }}>
            🏅 {totalPoints.toLocaleString("id-ID")}
          </span>
          <span style={{ fontSize: 10, color: "var(--faint)" }}>poin</span>
        </div>
      )}

      <GlassNav
        small
        items={[
          ["mood", "Mood"],
          ["mimpi", "Mimpi"],
          ["habit", "Habit"],
          ["energi", "Energi"],
          ["waktu", "Waktu"],
          ["trofi", "Trofi"],
        ]}
        value={sub}
        onChange={setSub}
        style={{ marginBottom: 14 }}
      />

      {sub === "mood" && (
      <>
      {/* ===== mood check-in ===== */}
      <div style={S.dump}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={S.dumpTitle}>Lagi ngerasa gimana?</div>
          {todayMood && (
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green)" }}>tercatat ✓</span>
          )}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(62px, 1fr))",
            gap: 6,
          }}
        >
          {MOODS.map(([m, e]) => {
            const on = todayMood?.mood === m;
            return (
              <button
                key={m}
                className="tap-tile"
                style={{
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  background: on ? "var(--accent-bg)" : "var(--card)",
                  border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 14,
                  padding: "9px 2px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "var(--ink)",
                }}
                onClick={() => checkIn(m)}
              >
                <span style={{ fontSize: 20, lineHeight: 1.1 }}>{e}</span>
                <span
                  style={{
                    fontSize: 10,
                    color: on ? "var(--accent)" : "var(--muted)",
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "center" }}>
          {last7.map((d) => (
            <div
              key={d.ds}
              title={d.ds}
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                background: d.mood ? "var(--card2)" : "transparent",
                border: `1px dashed ${d.ds === today ? "var(--accent)" : "var(--border2)"}`,
              }}
            >
              {d.mood ? moodEmoji(d.mood) : ""}
            </div>
          ))}
        </div>
        <div style={{ ...S.dumpHint, textAlign: "center", marginTop: 6 }}>
          7 hari terakhir · tap sekali sehari
        </div>

        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button
            style={{ ...S.btnGhost, fontSize: 13 }}
            onClick={reflectAI}
            disabled={reflection === "..."}
          >
            ✨ {reflection === "..." ? "lagi baca…" : "Baca pola gue dong"}
          </button>
        </div>
        {reflection && reflection !== "..." && (
          <>
            <div style={{ ...S.aiBubble, marginTop: 10, whiteSpace: "pre-wrap" }}>
              {reflection}
            </div>
            <div style={{ ...S.dumpHint, marginTop: 6, textAlign: "center" }}>
              Cuma baca pola, bukan diagnosis.
            </div>
          </>
        )}
      </div>
      </>
      )}

      {sub === "mimpi" && <MimpiSection session={session} />}

      {sub === "habit" && (
      <>
        {/* ===== bad habit ===== */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4, gap: 10 }}>
          <div style={S.sectionHead}><span>Bad habit</span></div>
          <button
            style={S.promAddLink}
            onClick={() => setShowHabitForm((v) => (v === "bad" ? null : "bad"))}
          >
            {showHabitForm === "bad" ? "batal" : "+ tambah"}
          </button>
        </div>

        {showHabitForm === "bad" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <input
              style={{ ...S.input, flex: 1, minWidth: 0 }}
              placeholder="Apa yang mau dikurangin?"
              autoFocus
              value={newHabit}
              onChange={(e) => setNewHabit(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addHabit("bad")}
            />
            <button style={{ ...S.addBtn, width: 60 }} onClick={() => addHabit("bad")}>OK</button>
          </div>
        )}

        {habits === null && <div style={S.empty}>Memuat…</div>}
        {habits !== null && badHabits.length === 0 && showHabitForm !== "bad" && (
          <div style={S.empty}>Belum ada.</div>
        )}

        {badHabits.map((h) => {
          const days = cleanDays(h);
          const tm = topMood(h);
          const pts = streakPoints(days);
          const next = nextTier(days);
          const from = lastTierDays(days);
          const pct = next ? Math.round(((days - from) / (next.days - from)) * 100) : 100;
          return (
            <div key={h.id} style={{ ...S.card, display: "block" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ flexShrink: 0, textAlign: "center", minWidth: 30 }}>
                  <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 700, color: "var(--green)", lineHeight: 1 }}>
                    {days}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: "var(--faint)" }}>hari</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <EditableText
                    value={h.name}
                    onSave={(v) => patchHabit(h.id, { name: v })}
                    style={S.cardTitle}
                  />
                  {tm && (
                    <div style={{ ...S.dumpHint, marginBottom: 0, marginTop: 3 }}>
                      biasanya pas {tm} {moodEmoji(tm)}
                    </div>
                  )}
                </div>
                <div style={S.cardBtns}>
                  {pts > 0 && (
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "var(--janji-ink)", whiteSpace: "nowrap" }}>
                      🏅 {pts}
                    </span>
                  )}
                  <button
                    className="tap-tile"
                    style={{ ...S.btnGhost, borderRadius: 999, fontSize: 12 }}
                    onClick={() => logEvent(h)}
                  >
                    kejadian lagi
                  </button>
                  <button style={S.btnGhost} onClick={() => removeHabit(h.id)}>✕</button>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 99, background: "var(--badge)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.max(2, pct)}%`, background: "var(--janji-ink)", borderRadius: 99 }} />
                </div>
                <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap" }}>
                  {next ? (
                    <>{next.label} <b style={{ color: "var(--janji-ink)" }}>+{next.pts}</b></>
                  ) : (
                    "maks 🎉"
                  )}
                </span>
              </div>

              {justLogged === h.id && (
                <div style={{ ...S.aiBubble, marginTop: 8 }}>
                  Kecatet. Hitungannya mulai lagi dari sekarang.
                </div>
              )}
            </div>
          );
        })}

        {/* ===== good habit ===== */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 44, gap: 10 }}>
          <div style={S.sectionHead}><span>Good habit</span></div>
          <button
            style={S.promAddLink}
            onClick={() => setShowHabitForm((v) => (v === "good" ? null : "good"))}
          >
            {showHabitForm === "good" ? "batal" : "+ tambah"}
          </button>
        </div>

        {showHabitForm === "good" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <input
              style={{ ...S.input, flex: 1, minWidth: 0 }}
              placeholder="Apa yang mau dibiasain?"
              autoFocus
              value={newHabit}
              onChange={(e) => setNewHabit(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addHabit("good")}
            />
            <button style={{ ...S.addBtn, width: 60 }} onClick={() => addHabit("good")}>OK</button>
          </div>
        )}

        {habits !== null && goodHabits.length === 0 && showHabitForm !== "good" && (
          <div style={S.empty}>Belum ada.</div>
        )}

        {goodHabits.map((h) => {
          const done = doneToday(h);
          const total = doneDates(h).size;
          return (
            <div
              key={h.id}
              style={{
                ...S.card,
                ...(done ? { borderColor: "var(--green)" } : {}),
              }}
            >
              <div style={{ flexShrink: 0, textAlign: "center", minWidth: 30 }}>
                <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 700, color: "var(--green)", lineHeight: 1 }}>
                  {total}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: "var(--faint)" }}>hari</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <EditableText
                  value={h.name}
                  onSave={(v) => patchHabit(h.id, { name: v })}
                  style={S.cardTitle}
                />
              </div>
              {total > 0 && (
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "var(--janji-ink)", whiteSpace: "nowrap" }}>
                  🏅 {goodPoints(h)}
                </span>
              )}
              <button
                className="tap-tile"
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "9px 14px",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  background: done ? "var(--green-bg)" : "var(--green-dark)",
                  color: done ? "var(--green)" : "var(--on-green)",
                  boxShadow: done ? "inset 0 0 0 1px var(--green-border)" : "none",
                }}
                title={done ? "Batal buat hari ini" : `Udah dikerjain (+${GOOD_POINT})`}
                onClick={() => toggleGood(h)}
              >
                {done ? "udah ✓" : "Udah"}
              </button>
              <button style={S.btnGhost} onClick={() => removeHabit(h.id)}>✕</button>
            </div>
          );
        })}

        {habitErr && (
          <div style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>
            {habitErr}
            {/kind|[Cc]olumn/.test(habitErr) && (
              <> — jalanin dulu bagian <code>habits</code> di supabase-setup.sql.</>
            )}
          </div>
        )}
      </>
      )}

      {sub === "energi" && <DrainSection session={session} />}

      {sub === "trofi" && <PencapaianSection session={session} />}

      {sub === "waktu" && <WaktuSection session={session} />}
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
          <div style={{ ...S.focusCard, borderColor: "var(--accent)" }}>
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
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const u = username.trim().toLowerCase();
    if (!u || !password) return;
    setBusy(true);
    setErr("");

    if (mode === "register") {
      try {
        const r = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: u, password, invite }),
        });
        const data = await r.json();
        setBusy(false);
        if (!r.ok) {
          setErr(data.error || "Gagal daftar.");
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({
          email: `${u}@tugasku.local`,
          password,
        });
        if (error) {
          setErr("Akun jadi, tapi gagal auto-login. Coba masuk manual.");
          setMode("login");
        }
      } catch {
        setBusy(false);
        setErr("Gagal konek ke server.");
      }
      return;
    }

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
        <div style={S.eyebrow}>{mode === "register" ? "Bikin akun baru" : "Masuk dulu"}</div>
        <h1 style={{ ...S.h1, marginBottom: 4 }}>LifeHack</h1>
        <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 14 }}>by afifi</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[["login", "Masuk"], ["register", "Daftar"]].map(([k, label]) => (
            <button
              key={k}
              style={{
                ...S.btnGhost,
                flex: 1,
                padding: "8px 0",
                fontSize: 13,
                fontWeight: 700,
                ...(mode === k ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}),
              }}
              onClick={() => {
                setMode(k);
                setErr("");
              }}
            >
              {label}
            </button>
          ))}
        </div>
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
        {mode === "register" && (
          <input
            style={{ ...S.input, width: "100%", boxSizing: "border-box", marginBottom: 12 }}
            placeholder="Invite code"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        )}
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
          {busy ? "Sebentar…" : mode === "register" ? "Daftar →" : "Masuk →"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, count, children, collapsed, onToggle }) {
  return (
    <div style={{ marginTop: 26 }}>
      {/* label · garis · jumlah */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 4px",
          marginBottom: 10,
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={onToggle}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontWeight: 700,
            color: "var(--muted2)",
            whiteSpace: "nowrap",
          }}
        >
          <span style={S.chev}>{collapsed ? "▸" : "▾"}</span> {title}
        </span>
        <div style={{ flex: 1, height: 1.5, background: "var(--border)" }} />
        <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)" }}>{count}</span>
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
        ...(done ? { opacity: 0.5 } : {}),
      }}
    >
      {active && <Flame />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <EditableText
          value={t.title}
          onSave={(v) => onEdit(t.id, v)}
          style={{
            ...S.cardTitle,
            ...(active ? { fontWeight: 700, color: "var(--accent)" } : {}),
            ...(done
              ? { textDecoration: "line-through", color: "var(--muted)" }
              : {}),
          }}
        />
        <div style={S.tags}>
          {t.priority === 0 && (
            <span style={{ ...S.tag, color: "var(--accent)" }}>
              penting
            </span>
          )}
          {t.daily && <span style={S.tag}>harian</span>}
          {t.is_public && (
            <span style={{ ...S.tag, color: "var(--green)" }}>
              publik
            </span>
          )}
        </div>
      </div>
      <div style={S.cardBtns}>
        {more && onTogglePublic && (
          <button
            style={{
              ...S.btnGhost,
              padding: "6px 8px",
              lineHeight: 0,
              ...(t.is_public ? { borderColor: "var(--green)", color: "var(--green)" } : {}),
            }}
            title={t.is_public ? "Keliatan di link publik" : "Privat"}
            onClick={() => onTogglePublic(t)}
          >
            <Eye off={!t.is_public} />
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
    padding: "2px 0 18px",
    marginBottom: 12,
    borderBottom: "1px solid var(--border)",
  },
  focusLabel: {
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "var(--accent)",
    fontWeight: 700,
    marginBottom: 6,
  },
  focusTitle: { fontSize: 26, fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.015em", marginBottom: 16 },
  focusBtn: {
    background: "var(--accent)",
    color: "var(--on-accent)",
    border: "none",
    borderRadius: 16,
    padding: "15px 16px",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
    width: "100%",
  },

  addRow: { display: "flex", gap: 8 },
  inputCard: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  cardEyebrow: {
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    fontWeight: 700,
    color: "var(--muted)",
  },
  input: {
    flex: 1,
    padding: "10px 2px",
    borderRadius: 0,
    border: "none",
    borderBottom: "1px solid var(--border2)",
    background: "transparent",
    color: "var(--ink)",
    fontSize: 16, // >=16 biar iOS gak auto-zoom pas ngetik
    outline: "none",
  },
  addBtn: {
    width: 46,
    borderRadius: 10,
    border: "none",
    background: "var(--solid)",
    color: "var(--on-solid)",
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
    padding: "13px 2px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: 600, lineHeight: 1.35 },
  tags: { display: "flex", gap: 6, marginTop: 6 },
  tag: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--muted)",
  },
  cardBtns: { display: "flex", gap: 6, flexShrink: 0 },
  btn: {
    background: "var(--accent)",
    color: "var(--on-accent)",
    border: "none",
    borderRadius: 8,
    padding: "7px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnGreen: {
    background: "var(--green-dark)",
    color: "var(--on-green)",
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

  // ---- gaya struk buat tab Catet ----
  receipt: {
    padding: "2px 0 16px",
    borderBottom: "1px solid var(--border)",
  },
  receiptList: {
    padding: "16px 0 0",
    position: "relative",
    marginTop: 14,
  },
  receiptEyebrow: {
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "var(--muted)",
  },
  keypadKey: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    background: "transparent",
    fontFamily: MONO,
    fontSize: 20,
    fontWeight: 700,
    padding: "13px 0",
    cursor: "pointer",
    color: "var(--ink)",
    transition: "transform 0.08s",
  },
  toast: {
    position: "fixed",
    bottom: 28,
    left: "50%",
    transform: "translateX(-50%)",
    background: "var(--solid)",
    color: "var(--on-solid)",
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: 700,
    padding: "12px 22px",
    borderRadius: 999,
    animation: "toastIn 1.6s ease forwards",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    zIndex: 50,
    whiteSpace: "nowrap",
  },
  worryCard: {
    padding: "13px 2px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  promBox: {
    marginBottom: 22,
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
    background: "transparent",
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
    padding: "2px 0 2px 10px",
    borderLeft: "2px solid var(--accent-border)",
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
