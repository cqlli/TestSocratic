import { useState, useEffect } from "react";

const API = "http://localhost:8000";

const STAGES = [
  { id: "orientation", label: "1. Orientation", goal: "Understand what the function should do." },
  { id: "conceptualisation", label: "2. Conceptualisation", goal: "Think about what could go wrong and what to test." },
  { id: "investigation", label: "3. Investigation", goal: "Design test cases and trace the code." },
  { id: "discussion", label: "4. Discussion", goal: "Evaluate your tests and reflect." },
];

export default function App() {
  const [mode, setMode] = useState("socratic");
  const [stage, setStage] = useState("orientation");
  const [task, setTask] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    fetch(API + "/task")
      .then((r) => r.json())
      .then(setTask)
      .catch(() => setError("Could not load the task. Is the backend running?"));
  }, []);

  function switchMode(newMode) {
    setMode(newMode);
    setStage("orientation");
    setMessages([]);
    setError("");
    setSessionId(crypto.randomUUID());
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError("");
    try {
      const res = await fetch(API + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, messages: next, session_id: sessionId, stage }),
      });
      if (!res.ok) throw new Error("Server error " + res.status);
      const data = await res.json();
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setError("Something went wrong: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  function downloadTranscript() {
    const lines = messages.map((m) => (m.role === "user" ? "You: " : "Tutor: ") + m.content);
    const text = `Session ${sessionId} (${mode})\n\n` + lines.join("\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `transcript-${sessionId.slice(0, 8)}.txt`;
    a.click();
  }

  const currentGoal = STAGES.find((s) => s.id === stage)?.goal;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 16, textAlign: "left" }}>
      <h1>TestSocratic</h1>
      <div>
        <button disabled={mode === "socratic"} onClick={() => switchMode("socratic")}>Socratic</button>{" "}
        <button disabled={mode === "baseline"} onClick={() => switchMode("baseline")}>Baseline</button>
      </div>

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
            disabled={stage === s.id}
            onClick={() => setStage(s.id)}
            style={{ marginRight: 6 }}
          >
            {s.label}
          </button>
        ))}
        <p style={{ margin: "6px 0 0", fontSize: 14 }}><i>{currentGoal}</i></p>
      </div>

      <div style={{ margin: "16px 0", minHeight: 260 }}>
        {messages.map((m, i) => (
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
      <button onClick={downloadTranscript} disabled={messages.length === 0}>Download transcript</button>
    </div>
  );
}