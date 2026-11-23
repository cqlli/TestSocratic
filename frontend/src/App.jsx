import { useState, useEffect } from "react";

const API = "http://localhost:8000";
const STORAGE_KEY = "testsocratic_sessions";

const STAGES = [
  { id: "orientation", label: "1. Orientation", goal: "Understand what the function should do." },
  { id: "conceptualisation", label: "2. Conceptualisation", goal: "Think about what could go wrong and what to test." },
  { id: "investigation", label: "3. Investigation", goal: "Design test cases and trace the code." },
  { id: "discussion", label: "4. Discussion", goal: "Evaluate your tests and reflect." },
];

function newSession(mode = "socratic") {
  return { id: crypto.randomUUID(), mode, stage: "orientation", messages: [], createdAt: Date.now() };
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // ignore and start fresh
  }
  return [newSession()];
}

function chatTitle(s) {
  const first = s.messages.find((m) => m.role === "user");
  if (!first) return "New chat";
  return first.content.length > 32 ? first.content.slice(0, 32) + "..." : first.content;
}

export default function App() {
  const [sessions, setSessions] = useState(loadSessions);
  const [activeId, setActiveId] = useState(() => sessions[0].id);
  const [task, setTask] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const active = sessions.find((s) => s.id === activeId) || sessions[0];
  const visible = sessions.filter((s) => s.messages.length > 0 || s.id === active.id);

  useEffect(() => {
    fetch(API + "/task")
      .then((r) => r.json())
      .then(setTask)
      .catch(() => setError("Could not load the task. Is the backend running?"));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // storage unavailable, history just won't persist
    }
  }, [sessions]);

  function updateSession(id, patch) {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function newChat(mode) {
    if (loading) return;
    if (active.messages.length === 0) {
      updateSession(active.id, { mode, stage: "orientation" });
    } else {
      const s = newSession(mode);
      setSessions((prev) => [s, ...prev]);
      setActiveId(s.id);
    }
    setInput("");
    setError("");
  }

  function openChat(id) {
    if (loading) return;
    setActiveId(id);
    setError("");
  }

  function deleteChat(id) {
    if (loading) return;
    if (!window.confirm("Delete this chat from this browser?")) return;
    const remaining = sessions.filter((s) => s.id !== id);
    if (remaining.length === 0) {
      const s = newSession();
      setSessions([s]);
      setActiveId(s.id);
      return;
    }
    setSessions(remaining);
    if (id === active.id) setActiveId(remaining[0].id);
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const sid = active.id;
    const next = [...active.messages, { role: "user", content: text }];
    updateSession(sid, { messages: next });
    setInput("");
    setLoading(true);
    setError("");
    try {
      const res = await fetch(API + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: active.mode, messages: next, session_id: sid, stage: active.stage }),
      });
      if (!res.ok) throw new Error("Server error " + res.status);
      const data = await res.json();
      updateSession(sid, { messages: [...next, { role: "assistant", content: data.reply }] });
    } catch (e) {
      setError("Something went wrong: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  function downloadTranscript() {
    const lines = active.messages.map((m) => (m.role === "user" ? "You: " : "Tutor: ") + m.content);
    const text = `Session ${active.id} (${active.mode})\n\n` + lines.join("\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `transcript-${active.id.slice(0, 8)}.txt`;
    a.click();
  }

  const currentGoal = STAGES.find((s) => s.id === active.stage)?.goal;

  return (
    <div style={{ display: "flex", gap: 16, maxWidth: 1040, margin: "0 auto", padding: 16, textAlign: "left" }}>
      <aside style={{ width: 240, flexShrink: 0, borderRight: "1px solid #ccc", paddingRight: 12 }}>
        <h3 style={{ margin: "0 0 8px" }}>Chats</h3>
        <button style={{ width: "100%", marginBottom: 6 }} onClick={() => newChat("socratic")} disabled={loading}>
          + New Socratic chat
        </button>
        <button style={{ width: "100%", marginBottom: 12 }} onClick={() => newChat("baseline")} disabled={loading}>
          + New baseline chat
        </button>
        {visible.map((s) => (
          <div
            key={s.id}
            onClick={() => openChat(s.id)}
            style={{
              padding: "8px 6px",
              marginBottom: 4,
              borderRadius: 6,
              cursor: loading ? "default" : "pointer",
              background: s.id === active.id ? "rgba(128,128,128,0.2)" : "transparent",
              display: "flex",
              justifyContent: "space-between",
              gap: 6,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {chatTitle(s)}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {s.mode === "socratic" ? "Socratic" : "Baseline"} · {new Date(s.createdAt).toLocaleString()}
              </div>
            </div>
            <button
              aria-label="Delete chat"
              onClick={(e) => {
                e.stopPropagation();
                deleteChat(s.id);
              }}
              disabled={loading}
            >
              x
            </button>
          </div>
        ))}
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ marginTop: 0 }}>TestSocratic</h1>
        <p style={{ margin: 0 }}>
          Mode: <b>{active.mode === "socratic" ? "Socratic" : "Baseline"}</b>
        </p>

        {task && (
          <div style={{ margin: "16px 0", padding: 12, border: "1px solid #ccc", borderRadius: 8 }}>
            <h3 style={{ margin: "0 0 8px" }}>{task.title}</h3>
            <p style={{ margin: "0 0 8px" }}>{task.description}</p>
            <pre style={{ margin: 0, padding: 8, background: "#f4f4f4", color: "#111", overflowX: "auto" }}>
              {task.code}
            </pre>
          </div>
        )}

        <div style={{ margin: "8px 0" }}>
          {STAGES.map((s) => (
            <button
              key={s.id}
              disabled={active.stage === s.id}
              onClick={() => updateSession(active.id, { stage: s.id })}
              style={{ marginRight: 6 }}
            >
              {s.label}
            </button>
          ))}
          <p style={{ margin: "6px 0 0", fontSize: 14 }}><i>{currentGoal}</i></p>
        </div>

        <div style={{ margin: "16px 0", minHeight: 260 }}>
          {active.messages.map((m, i) => (
            <p key={i} style={{ whiteSpace: "pre-wrap" }}>
              <b>{m.role === "user" ? "You" : "Tutor"}:</b> {m.content}
            </p>
          ))}
          {loading && <p><i>Thinking...</i></p>}
          {error && <p style={{ color: "red" }}>{error}</p>}
        </div>

        <textarea
          rows={3}
          style={{ width: "100%" }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
        />
        <button onClick={send} disabled={loading}>Send</button>{" "}
        <button onClick={downloadTranscript} disabled={active.messages.length === 0}>Download transcript</button>
      </main>
    </div>
  );
}