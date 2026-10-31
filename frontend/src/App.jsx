import { useState } from "react";

const API_URL = "http://localhost:8000/chat";

export default function App() {
  const [mode, setMode] = useState("socratic");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function switchMode(newMode) {
    setMode(newMode);
    setMessages([]);
    setError("");
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
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, messages: next }),
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

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 16, textAlign: "left" }}>
      <h1>TestSocratic</h1>
      <div>
        <button disabled={mode === "socratic"} onClick={() => switchMode("socratic")}>
          Socratic
        </button>{" "}
        <button disabled={mode === "baseline"} onClick={() => switchMode("baseline")}>
          Baseline
        </button>
      </div>
      <div style={{ margin: "16px 0", minHeight: 300 }}>
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
      <button onClick={send} disabled={loading}>Send</button>
    </div>
  );
}