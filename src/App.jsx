import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";

// TugasKu — a dead-simple personal ticketing board, backed by Supabase.
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

export default function TugasKu() {
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
  const [promForm, setPromForm] = useState({
    text: "",
    to_whom: "",
    due_date: "",
  });
  const [showPromForm, setShowPromForm] = useState(false);
  const [collapsed, toggleCollapsed] = useCollapsed();
  const [page, setPage] = useState("tugas");
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
      setSession(s),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  // ---------- load + daily reset ----------
  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: true });

      if (error) {
        setError(error.message);
        return;
      }

      // reset daily tasks that were completed on a previous day
      const stale = data.filter(
        (t) => t.daily && t.status === "done" && t.done_date !== todayStr(),
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
        ? { status, done_date: todayStr() }
        : { status, done_date: null };
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
      ts.map((x) => (x.id === t.id ? { ...x, is_public: v } : x)),
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
      details: "Dari TugasKu — janji yang harus ditepati.",
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
        (a.due_date || "9999") < (b.due_date || "9999") ? -1 : 1,
      ),
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
      <div
        style={{
          ...S.page,
          ...themeVars,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ color: "var(--muted)", fontSize: 14 }}>Memuat…</span>
      </div>
    );

  if (!session) return <Login themeVars={themeVars} />;

  if (error)
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
        <div style={{ ...S.focusCard, maxWidth: 480 }}>
          <div style={{ ...S.focusLabel }}>Gagal terhubung ke database</div>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>
            {error}
            <br />
            <br />
            Cek: (1) env <code>VITE_SUPABASE_URL</code> dan{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> sudah diisi, (2) tabel{" "}
            <code>tasks</code> sudah dibuat lewat{" "}
            <code>supabase-setup.sql</code>.
          </div>
        </div>
      </div>
    );

  if (!tasks)
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
      <div style={S.wrap}>
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
            <h1 style={S.h1}>TugasKu</h1>
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
          {["tugas", "barang", "duit"].map((p) => (
            <button
              key={p}
              style={{ ...S.navBtn, ...(page === p ? S.navBtnActive : {}) }}
              onClick={() => setPage(p)}
            >
              {p === "tugas" ? "Tugas" : p === "barang" ? "Barang" : "Duit"}
            </button>
          ))}
        </div>

        {page === "barang" && <BarangPage session={session} />}
        {page === "duit" && <DuitPage session={session} />}

        {page === "tugas" && showPassForm && (
          <div
            style={{
              ...S.promBox,
              background: "var(--card)",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ ...S.dumpTitle, marginBottom: 8 }}>
              Ganti password
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="password"
                style={{ ...S.input, flex: 1, minWidth: 0 }}
                placeholder="Password baru (min. 6 karakter)"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && changePassword()}
              />
              <button
                style={{ ...S.addBtn, width: 60 }}
                onClick={changePassword}
              >
                OK
              </button>
            </div>
            {passMsg && (
              <div style={{ color: "var(--red)", fontSize: 13, marginTop: 6 }}>
                {passMsg}
              </div>
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
                  <button
                    style={S.focusBtn}
                    onClick={() => move(focus.id, "inprogress")}
                  >
                    Terima & mulai →
                  </button>
                ) : (
                  <button
                    style={S.focusBtn}
                    onClick={() => move(focus.id, "done")}
                  >
                    Tandai selesai ✓
                  </button>
                )}
              </div>
            )}
            {!focus && (
              <div
                style={{
                  ...S.focusCard,
                  background: "var(--green-bg)",
                  borderColor: "var(--green-border)",
                }}
              >
                <div style={{ ...S.focusLabel, color: "var(--green)" }}>
                  Semua beres
                </div>
                <div style={{ ...S.focusTitle, color: "var(--green-dark)" }}>
                  Tidak ada tugas tersisa hari ini. 🎉
                </div>
              </div>
            )}

            {/* janji — hal yang gak boleh kelupaan */}
            <div style={S.promBox}>
              <div
                style={{ ...S.dumpHead, cursor: "pointer", userSelect: "none" }}
              >
                <span
                  style={{ ...S.dumpTitle, color: "var(--janji-ink)" }}
                  onClick={() => toggleCollapsed("janji")}
                >
                  <span style={S.chev}>{collapsed.janji ? "▸" : "▾"}</span>{" "}
                  Janji yang harus ditepati
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
                        style={{
                          ...S.input,
                          width: "100%",
                          boxSizing: "border-box",
                          marginBottom: 6,
                        }}
                        placeholder="Janji apa? (misal: kirim laporan ke Rendy)"
                        value={promForm.text}
                        onChange={(e) =>
                          setPromForm({ ...promForm, text: e.target.value })
                        }
                      />
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          style={{ ...S.input, flex: 1, minWidth: 0 }}
                          placeholder="Ke siapa?"
                          value={promForm.to_whom}
                          onChange={(e) =>
                            setPromForm({
                              ...promForm,
                              to_whom: e.target.value,
                            })
                          }
                        />
                        <input
                          type="date"
                          style={{ ...S.input, flex: 1, minWidth: 0 }}
                          value={promForm.due_date}
                          onChange={(e) =>
                            setPromForm({
                              ...promForm,
                              due_date: e.target.value,
                            })
                          }
                        />
                        <button
                          style={{ ...S.addBtn, width: 60 }}
                          onClick={addPromise}
                        >
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
                            ? {
                                borderLeft: "3px solid var(--red)",
                                background: "var(--red-bg)",
                              }
                            : today
                              ? {
                                  borderLeft: "3px solid #B8860B",
                                  background: "var(--janji-bg)",
                                }
                              : {}),
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <EditableText
                            value={p.text}
                            onSave={(v) => editPromise(p.id, v)}
                            style={{
                              fontSize: 14,
                              fontWeight: 500,
                              lineHeight: 1.4,
                            }}
                          />
                          <div
                            style={{
                              ...S.dumpHint,
                              marginBottom: 0,
                              marginTop: 3,
                            }}
                          >
                            {p.to_whom && (
                              <>
                                ke <b>{p.to_whom}</b> ·{" "}
                              </>
                            )}
                            {overdue && (
                              <span
                                style={{ color: "var(--red)", fontWeight: 700 }}
                              >
                                TELAT — {p.due_date}
                              </span>
                            )}
                            {today && (
                              <span
                                style={{
                                  color: "var(--janji-ink)",
                                  fontWeight: 700,
                                }}
                              >
                                HARI INI
                              </span>
                            )}
                            {!overdue && !today && p.due_date && (
                              <>sampai {p.due_date}</>
                            )}
                            {!p.due_date && <>tanpa deadline</>}
                          </div>
                        </div>
                        <div style={S.cardBtns}>
                          {p.due_date && (
                            <a
                              href={gcalUrl(p)}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                ...S.btnGhost,
                                textDecoration: "none",
                                display: "inline-block",
                              }}
                              title="Tambah ke Google Calendar"
                            >
                              📅
                            </a>
                          )}
                          <button
                            style={{
                              ...S.btn,
                              background: "var(--green-dark)",
                            }}
                            onClick={() => keepPromise(p.id)}
                          >
                            Ditepati ✓
                          </button>
                          <button
                            style={S.btnGhost}
                            onClick={() => removePromise(p.id)}
                          >
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
              <button style={S.addBtn} onClick={addTask}>
                +
              </button>
            </div>
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

            {/* brain dump — tumpahin dulu, sortir belakangan */}
            <div style={S.dump}>
              <div
                style={{ ...S.dumpHead, cursor: "pointer", userSelect: "none" }}
                onClick={() => toggleCollapsed("dump")}
              >
                <span style={S.dumpTitle}>
                  <span style={S.chev}>{collapsed.dump ? "▸" : "▾"}</span> Lagi
                  resah apa?
                  {collapsed.dump && worries.length > 0 && (
                    <span style={S.miniCount}>{worries.length}</span>
                  )}
                </span>
                {released > 0 && !collapsed.dump && (
                  <span style={S.dumpReleased}>
                    {released} dilepas hari ini
                  </span>
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
                    <button style={S.addBtn} onClick={addWorry}>
                      +
                    </button>
                  </div>
                  {worries.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={S.dumpHint}>
                        Sortir: bisa lu pengaruhi → jadiin tugas. Di luar
                        kendali lu → lepasin.
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
                            <button
                              style={S.btn}
                              onClick={() => worryToTask(w)}
                            >
                              Jadiin tugas
                            </button>
                            <button
                              style={S.btnGhost}
                              onClick={() => releaseWorry(w.id)}
                            >
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
            <Section
              title="Todo"
              count={todo.length}
              collapsed={!!collapsed.todo}
              onToggle={() => toggleCollapsed("todo")}
            >
              {todo.map((t) => (
                <Card
                  key={t.id}
                  t={t}
                  onEdit={editTask}
                  onTogglePublic={togglePublic}
                >
                  <button
                    style={S.btn}
                    onClick={() => move(t.id, "inprogress")}
                  >
                    Terima
                  </button>
                  <button style={S.btnGhost} onClick={() => remove(t.id)}>
                    ✕
                  </button>
                </Card>
              ))}
              {todo.length === 0 && <Empty text="Kosong — mantap." />}
            </Section>

            <Section
              title="In Progress"
              count={doing.length}
              collapsed={!!collapsed.doing}
              onToggle={() => toggleCollapsed("doing")}
            >
              {doing.map((t) => (
                <Card
                  key={t.id}
                  t={t}
                  active
                  onEdit={editTask}
                  onTogglePublic={togglePublic}
                >
                  <button
                    style={{ ...S.btn, background: "var(--green-dark)" }}
                    onClick={() => move(t.id, "done")}
                  >
                    Selesai
                  </button>
                  <button style={S.btnGhost} onClick={() => move(t.id, "todo")}>
                    ↩
                  </button>
                </Card>
              ))}
              {doing.length === 0 && (
                <Empty text="Belum ada yang dikerjakan." />
              )}
            </Section>

            <Section
              title="Completed"
              count={done.length}
              collapsed={!!collapsed.done}
              onToggle={() => toggleCollapsed("done")}
            >
              {done.map((t) => (
                <Card
                  key={t.id}
                  t={t}
                  done
                  onEdit={editTask}
                  onTogglePublic={togglePublic}
                >
                  <button style={S.btnGhost} onClick={() => move(t.id, "todo")}>
                    ↩
                  </button>
                  {!t.daily && (
                    <button style={S.btnGhost} onClick={() => remove(t.id)}>
                      ✕
                    </button>
                  )}
                </Card>
              ))}
              {done.length === 0 && (
                <Empty text="Belum ada yang selesai hari ini." />
              )}
            </Section>

            <div style={S.footer}>
              Tugas harian otomatis balik ke Todo setiap pagi. Data tersimpan di
              cloud — buka dari HP atau laptop, tetap sync.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const FIRE_CSS = `
html, body, #root { margin: 0; padding: 0; }

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
  dipinjem: {
    label: "🤝 dipinjem",
    color: "var(--janji-ink)",
    border: "var(--janji-border)",
  },
  rusak: {
    label: "⚠ rusak",
    color: "var(--accent)",
    border: "var(--accent-border)",
  },
  servis: {
    label: "🔧 diservis",
    color: "var(--janji-ink)",
    border: "var(--janji-border)",
  },
  ilang: { label: "? ilang", color: "var(--red)", border: "var(--red)" },
};

const rupiah = (n) => (n == null ? "" : "Rp" + n.toLocaleString("id-ID"));

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
      price: form.price
        ? parseInt(form.price.replace(/\D/g, ""), 10) || null
        : null,
    };
    setForm({ name: "", location: "", price: "" });
    setShowForm(false);
    const { data, error } = await supabase
      .from("items")
      .insert(row)
      .select()
      .single();
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
          (x.location || "").toLowerCase().includes(ql),
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

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 12,
        }}
      >
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
            style={{
              ...S.input,
              width: "100%",
              boxSizing: "border-box",
              marginBottom: 6,
            }}
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
            <button style={{ ...S.addBtn, width: 60 }} onClick={addItem}>
              OK
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        {shown.length === 0 && (
          <div style={S.empty}>
            {ql
              ? `Gak nemu "${q}" — belum dicatet atau beneran ilang 😅`
              : "Belum ada barang. Mulai dari yang sering lu cari."}
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
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "baseline",
                    marginTop: 4,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--muted2)" }}>
                    📍
                  </span>
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
                  style={{
                    ...S.btnGhost,
                    color: m.color,
                    borderColor: m.border,
                    whiteSpace: "nowrap",
                  }}
                  title="Klik buat ganti status"
                  onClick={() => cycleStatus(it)}
                >
                  {m.label}
                </button>
                <button style={S.btnGhost} onClick={() => removeItem(it.id)}>
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={S.footer}>
        Pindahin barang? Tap lokasinya, edit. Status: klik buat muter ada →
        dipinjem → rusak → diservis → ilang.
      </div>
    </>
  );
}

// tanggal lokal (bukan UTC) biar jam 6 pagi WIB gak kecatet "kemarin"
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const SOURCES = ["cash", "bca", "danamon"];

function DuitPage({ session }) {
  const [rows, setRows] = useState(null);
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("cash");
  const [note, setNote] = useState("");

  useEffect(() => {
    // ambil 30 hari terakhir, cukup buat konteks
    const since = new Date();
    since.setDate(since.getDate() - 30);
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
      source,
      note: note.trim() || null,
      spent_date: localToday(),
    };
    setAmount("");
    setNote("");
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

  if (rows === null) return <div style={S.empty}>Memuat…</div>;

  const today = localToday();
  const todayRows = rows.filter((r) => r.spent_date === today);
  const todayTotal = todayRows.reduce((s, r) => s + r.amount, 0);

  // konteks 7 hari — biar satu hari gak diliat sendirian
  const week = new Date();
  week.setDate(week.getDate() - 6);
  const weekStr = `${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, "0")}-${String(week.getDate()).padStart(2, "0")}`;
  const weekRows = rows.filter((r) => r.spent_date >= weekStr);
  const weekTotal = weekRows.reduce((s, r) => s + r.amount, 0);
  const avg = Math.round(weekTotal / 7);

  const perSource = SOURCES.map((s) => ({
    s,
    total: todayRows
      .filter((r) => r.source === s)
      .reduce((a, r) => a + r.amount, 0),
  })).filter((x) => x.total > 0);

  return (
    <>
      {/* input dulu, angka belakangan — biar nyatetnya gak mikir */}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          style={{ ...S.input, flex: 1, minWidth: 0, fontSize: 17 }}
          placeholder="Berapa? (misal 25000)"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button style={{ ...S.addBtn, width: 60 }} onClick={add}>
          OK
        </button>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {SOURCES.map((s) => (
          <button
            key={s}
            style={{
              ...S.btnGhost,
              flex: 1,
              textTransform: "uppercase",
              fontSize: 12,
              fontWeight: 700,
              ...(source === s
                ? { borderColor: "var(--accent)", color: "var(--accent)" }
                : {}),
            }}
            onClick={() => setSource(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <input
        style={{
          ...S.input,
          width: "100%",
          boxSizing: "border-box",
          marginTop: 8,
          fontSize: 13,
        }}
        placeholder="Catatan (opsional — kosongin juga gapapa)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />

      {/* angka hari ini — netral, tanpa penilaian */}
      <div style={{ marginTop: 22, textAlign: "center" }}>
        <div style={S.eyebrow}>Hari ini</div>
        <div
          style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em" }}
        >
          {rupiah(todayTotal)}
        </div>
        <div style={{ ...S.dumpHint, marginTop: 4 }}>
          rata-rata 7 hari terakhir: {rupiah(avg)}/hari
        </div>
        {perSource.length > 0 && (
          <div style={{ ...S.dumpHint, marginTop: 2 }}>
            {perSource.map((x) => `${x.s} ${rupiah(x.total)}`).join(" · ")}
          </div>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        {todayRows.length === 0 && (
          <div style={{ ...S.empty, textAlign: "center" }}>
            Belum ada catatan hari ini.
          </div>
        )}
        {todayRows.map((r) => (
          <div key={r.id} style={{ ...S.card, padding: "10px 14px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>
                {rupiah(r.amount)}
              </span>
              <span style={{ ...S.dumpHint, marginLeft: 8 }}>
                {r.source}
                {r.note ? ` · ${r.note}` : ""}
              </span>
            </div>
            <button style={S.btnGhost} onClick={() => remove(r.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <div style={S.footer}>
        Dicatet doang, gak dinilai. Angka gede sehari itu normal — liatnya per
        minggu.
      </div>
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
    (tasks || [])
      .filter((t) => t.status === s)
      .sort((a, b) => a.priority - b.priority);
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
      <div style={S.wrap}>
        <div style={{ marginBottom: 20 }}>
          <div style={S.eyebrow}>{dateLabel} · Papan publik (read-only)</div>
          <h1 style={S.h1}>TugasKu</h1>
        </div>

        {tasks === null && <div style={S.empty}>Memuat…</div>}

        {tasks !== null && tasks.length === 0 && (
          <div style={{ ...S.focusCard }}>
            <div style={S.focusTitle}>Belum ada yang di-share di sini.</div>
          </div>
        )}

        {doing.length > 0 && (
          <div
            style={{
              ...S.focusCard,
              animation: "emberGlow 1.8s ease-in-out infinite",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Flame />
              <div style={{ ...S.focusLabel, marginBottom: 0 }}>
                Lagi dikerjain
              </div>
            </div>
            {doing.map((t) => (
              <div
                key={t.id}
                style={{ ...S.focusTitle, marginBottom: 4, marginTop: 8 }}
              >
                {t.title}
              </div>
            ))}
          </div>
        )}

        {todo.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <div style={S.sectionHead}>
              <span>Antrian</span>
              <span style={S.count}>{todo.length}</span>
            </div>
            {todo.map((t) => (
              <div key={t.id} style={S.card}>
                <div style={S.cardTitle}>{t.title}</div>
              </div>
            ))}
          </div>
        )}

        {done.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <div style={S.sectionHead}>
              <span>Kelar</span>
              <span style={S.count}>{done.length}</span>
            </div>
            {done.map((t) => (
              <div key={t.id} style={{ ...S.card, opacity: 0.55 }}>
                <div style={{ ...S.cardTitle, textDecoration: "line-through" }}>
                  {t.title}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={S.footer}>
          Cuma yang ditandain publik yang keliatan di sini.
        </div>
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
        <h1 style={{ ...S.h1, marginBottom: 18 }}>TugasKu</h1>
        <input
          style={{
            ...S.input,
            width: "100%",
            boxSizing: "border-box",
            marginBottom: 8,
          }}
          placeholder="Username"
          autoCapitalize="none"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          style={{
            ...S.input,
            width: "100%",
            boxSizing: "border-box",
            marginBottom: 12,
          }}
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
            <span
              style={{
                ...S.tag,
                color: "var(--accent)",
                borderColor: "var(--accent-border)",
              }}
            >
              penting
            </span>
          )}
          {t.daily && <span style={S.tag}>harian</span>}
          {t.is_public && (
            <span
              style={{
                ...S.tag,
                color: "var(--green)",
                borderColor: "var(--green-border)",
              }}
            >
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
              ...(t.is_public
                ? { borderColor: "var(--green)", color: "var(--green)" }
                : {}),
            }}
            title={
              t.is_public
                ? "Keliatan di link publik — klik buat sembunyiin"
                : "Privat — klik buat tampilin di link publik"
            }
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
  focusTitle: {
    fontSize: 18,
    fontWeight: 600,
    lineHeight: 1.35,
    marginBottom: 12,
  },
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
    fontSize: 15,
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
  optLabel: {
    fontSize: 13,
    color: "var(--muted2)",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },

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
  chev: {
    display: "inline-block",
    width: 14,
    fontSize: 11,
    color: "var(--faint)",
  },
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
