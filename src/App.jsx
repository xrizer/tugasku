import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";

// TugasKu — a dead-simple personal ticketing board, backed by Supabase.
// Flow: Todo → (Terima/Accept) → In Progress → (Selesai) → Completed.
// Daily tasks auto-reset to Todo every new day (via done_date check on load).
// Data syncs across devices.

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function TugasKu() {
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

  // ---------- load + daily reset ----------
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
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
  }, []);

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

  // gak bisa dikontrol → lepasin
  const releaseWorry = async (id) => {
    setWorries((ws) => ws.filter((x) => x.id !== id));
    setReleased((n) => n + 1);
    await supabase.from("worries").delete().eq("id", id);
  };

  // ---------- render ----------
  if (error)
    return (
      <div
        style={{
          ...S.page,
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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ color: "#8A8578", fontSize: 14 }}>Memuat…</span>
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
    <div style={S.page}>
      <div style={S.wrap}>
        {/* header */}
        <div style={{ marginBottom: 20 }}>
          <div style={S.eyebrow}>{dateLabel}</div>
          <h1 style={S.h1}>TugasKu</h1>
        </div>

        {/* focus card — one thing at a time */}
        {focus && (
          <div style={S.focusCard}>
            <div style={S.focusLabel}>Fokus sekarang</div>
            <div style={S.focusTitle}>{focus.title}</div>
            {focus.status === "todo" ? (
              <button
                style={S.focusBtn}
                onClick={() => move(focus.id, "inprogress")}
              >
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
          <div
            style={{
              ...S.focusCard,
              background: "#EDF6EE",
              borderColor: "#BFDCC2",
            }}
          >
            <div style={{ ...S.focusLabel, color: "#3E7A46" }}>Semua beres</div>
            <div style={{ ...S.focusTitle, color: "#2E5934" }}>
              Tidak ada tugas tersisa hari ini. 🎉
            </div>
          </div>
        )}

        {/* janji — hal yang gak boleh kelupaan */}
        <div style={S.promBox}>
          <div style={S.dumpHead}>
            <span style={{ ...S.dumpTitle, color: "#7A5C1E" }}>
              Janji yang harus ditepati
            </span>
            <button
              style={S.promAddLink}
              onClick={() => setShowPromForm((v) => !v)}
            >
              {showPromForm ? "batal" : "+ janji baru"}
            </button>
          </div>

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
                    setPromForm({ ...promForm, to_whom: e.target.value })
                  }
                />
                <input
                  type="date"
                  style={{ ...S.input, flex: 1, minWidth: 0 }}
                  value={promForm.due_date}
                  onChange={(e) =>
                    setPromForm({ ...promForm, due_date: e.target.value })
                  }
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
                    ? { borderLeft: "3px solid #C0392B", background: "#FDF1EF" }
                    : today
                      ? {
                          borderLeft: "3px solid #B8860B",
                          background: "#FBF6E9",
                        }
                      : {}),
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}
                  >
                    {p.text}
                  </div>
                  <div style={{ ...S.dumpHint, marginBottom: 0, marginTop: 3 }}>
                    {p.to_whom && (
                      <>
                        ke <b>{p.to_whom}</b> ·{" "}
                      </>
                    )}
                    {overdue && (
                      <span style={{ color: "#C0392B", fontWeight: 700 }}>
                        TELAT — {p.due_date}
                      </span>
                    )}
                    {today && (
                      <span style={{ color: "#7A5C1E", fontWeight: 700 }}>
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
                  <button
                    style={{ ...S.btn, background: "#2E5934" }}
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
          <div style={S.dumpHead}>
            <span style={S.dumpTitle}>Lagi resah apa?</span>
            {released > 0 && (
              <span style={S.dumpReleased}>{released} dilepas hari ini</span>
            )}
          </div>
          <div style={S.addRow}>
            <input
              style={{ ...S.input, background: "#FDFCFA" }}
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
                Sortir: bisa lu pengaruhi → jadiin tugas. Di luar kendali lu →
                lepasin.
              </div>
              {worries.map((w) => (
                <div key={w.id} style={S.worryCard}>
                  <div style={{ flex: 1, fontSize: 14, lineHeight: 1.4 }}>
                    {w.text}
                  </div>
                  <div style={S.cardBtns}>
                    <button style={S.btn} onClick={() => worryToTask(w)}>
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
        </div>

        {/* sections */}
        <Section title="Todo" count={todo.length}>
          {todo.map((t) => (
            <Card key={t.id} t={t}>
              <button style={S.btn} onClick={() => move(t.id, "inprogress")}>
                Terima
              </button>
              <button style={S.btnGhost} onClick={() => remove(t.id)}>
                ✕
              </button>
            </Card>
          ))}
          {todo.length === 0 && <Empty text="Kosong — mantap." />}
        </Section>

        <Section title="In Progress" count={doing.length}>
          {doing.map((t) => (
            <Card key={t.id} t={t} active>
              <button
                style={{ ...S.btn, background: "#2E5934" }}
                onClick={() => move(t.id, "done")}
              >
                Selesai
              </button>
              <button style={S.btnGhost} onClick={() => move(t.id, "todo")}>
                ↩
              </button>
            </Card>
          ))}
          {doing.length === 0 && <Empty text="Belum ada yang dikerjakan." />}
        </Section>

        <Section title="Completed" count={done.length}>
          {done.map((t) => (
            <Card key={t.id} t={t} done>
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
      </div>
    </div>
  );
}

function Section({ title, count, children }) {
  return (
    <div style={{ marginTop: 26 }}>
      <div style={S.sectionHead}>
        <span>{title}</span>
        <span style={S.count}>{count}</span>
      </div>
      {children}
    </div>
  );
}

function Card({ t, children, active, done }) {
  return (
    <div
      style={{
        ...S.card,
        ...(active ? { borderLeft: "3px solid #E4572E" } : {}),
        ...(done ? { opacity: 0.55 } : {}),
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            ...S.cardTitle,
            ...(done ? { textDecoration: "line-through" } : {}),
          }}
        >
          {t.title}
        </div>
        <div style={S.tags}>
          {t.priority === 0 && (
            <span
              style={{ ...S.tag, color: "#E4572E", borderColor: "#F0C4B4" }}
            >
              penting
            </span>
          )}
          {t.daily && <span style={S.tag}>harian</span>}
        </div>
      </div>
      <div style={S.cardBtns}>{children}</div>
    </div>
  );
}

function Empty({ text }) {
  return <div style={S.empty}>{text}</div>;
}

const S = {
  page: {
    minHeight: "100vh",
    background: "#F6F4EF",
    fontFamily:
      "'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif",
    color: "#2B2822",
    padding: "24px 16px 60px",
  },
  wrap: { maxWidth: 560, margin: "0 auto" },
  eyebrow: {
    fontSize: 12,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#8A8578",
    marginBottom: 4,
  },
  h1: { fontSize: 30, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" },

  focusCard: {
    background: "#FFF4EC",
    border: "1px solid #F0C4B4",
    borderRadius: 14,
    padding: "16px 18px",
    marginBottom: 22,
  },
  focusLabel: {
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#E4572E",
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
    background: "#E4572E",
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
    border: "1px solid #D9D4C8",
    background: "#fff",
    fontSize: 15,
    outline: "none",
  },
  addBtn: {
    width: 46,
    borderRadius: 10,
    border: "none",
    background: "#2B2822",
    color: "#fff",
    fontSize: 20,
    cursor: "pointer",
  },
  addOpts: { display: "flex", gap: 16, marginTop: 8 },
  optLabel: {
    fontSize: 13,
    color: "#6E6A5E",
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
    color: "#6E6A5E",
    marginBottom: 8,
  },
  count: {
    background: "#E8E4DA",
    borderRadius: 20,
    padding: "1px 9px",
    fontSize: 12,
  },
  card: {
    background: "#fff",
    border: "1px solid #E3DFD4",
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
    color: "#8A8578",
    border: "1px solid #E3DFD4",
    borderRadius: 20,
    padding: "1px 8px",
  },
  cardBtns: { display: "flex", gap: 6, flexShrink: 0 },
  btn: {
    background: "#E4572E",
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
    color: "#8A8578",
    border: "1px solid #E3DFD4",
    borderRadius: 8,
    padding: "7px 10px",
    fontSize: 13,
    cursor: "pointer",
  },
  empty: {
    fontSize: 13,
    color: "#A5A093",
    padding: "10px 2px",
  },
  dump: {
    marginTop: 26,
    background: "#EFEBE2",
    border: "1px dashed #C9C2B2",
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
    color: "#6E6A5E",
  },
  dumpReleased: { fontSize: 12, color: "#3E7A46", fontWeight: 600 },
  dumpHint: { fontSize: 12, color: "#8A8578", marginBottom: 8 },
  worryCard: {
    background: "#FDFCFA",
    border: "1px solid #E3DFD4",
    borderRadius: 12,
    padding: "10px 12px",
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  promBox: {
    marginBottom: 22,
    background: "#FBF6E9",
    border: "1px solid #E6D9B8",
    borderRadius: 14,
    padding: "14px 16px",
  },
  promAddLink: {
    background: "transparent",
    border: "none",
    color: "#7A5C1E",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    padding: 0,
  },
  footer: {
    marginTop: 32,
    fontSize: 12,
    color: "#A5A093",
    textAlign: "center",
  },
};
