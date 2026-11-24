import { useState, useEffect, useRef } from "react";

const API = import.meta.env.DEV ? "http://localhost:8000" : "";
const STORAGE_KEY = "testsocratic_sessions";
const MAX_ROWS = 30;

const STAGES = [
  { id: "orientation", name: "Orientation", goal: "Understand the requirement. What is unclear, missing or untestable?" },
  { id: "conceptualisation", name: "Conceptualisation", goal: "Choose a technique and work out your test conditions." },
  { id: "investigation", name: "Investigation", goal: "Write concrete test cases in the table, with expected results taken from the requirement." },
  { id: "discussion", name: "Discussion", goal: "Evaluate your coverage and reflect on what you found." },
];

const STARTERS = [
  "Where should I start?",
  "Which technique fits this requirement?",
  "Is my test table enough so far?",
];

const GENERAL_STARTERS = [
  "I want to understand...",
  "Help me work through a problem",
  "Check my understanding of...",
];

const MODES = [
  { id: "socratic", name: "Socratic", desc: "Asks guiding questions so you work out the answer yourself." },
  { id: "baseline", name: "Baseline", desc: "Answers your questions directly." },
];

const SUBJECTS = [
  { id: "testing", name: "Software testing", desc: "Practise test design on a set task, with a test case table and four stages." },
  { id: "general", name: "General learning", desc: "Talk through any topic you want to understand. No set task." },
];

const modeName = (id) => (MODES.find((m) => m.id === id) || MODES[0]).name;
const subjectShort = (id) => (id === "general" ? "General" : "Testing");

// Shown in the About dialog. 
const CREDITS = [
  ["Project", "TestSocratic: An LLM-Based Socratic Learning Companion for Reflective Test Design, Debugging Reasoning, and Software Testing Education"],
  ["Student Name", "Ng Wei Ting Elysia"],
  ["Matrix No.", "U2420585K"],
  ["Course", "CT3079 Mini Capstone"],
  ["Programme", "Bachelor of Technology in Computing"],
  ["Specializtion", "Software Engineering"],
  ["School", "Nanyang Technological University College of Computing and Data Science (CCDS)"],
  ["Supervisor", "Dr Owen Noel Newton Fernando"],
  ["Examiner", ""],
  ["Date", "November 2026"],
  //["Built with", "React, FastAPI, Claude (Anthropic) and Azure App Service"],
  //["Inspired by", "Xi, Zhang & Wang (2026), Computers & Education 241, 105494"],
];

const EMPTY_DRAFT = { title: "", description: "", code: "" };
const EMPTY_ROW = { data: "", expected: "", reason: "" };

function newSession() {
  return { id: crypto.randomUUID(), mode: "socratic", subject: "testing", configured: false, stage: "orientation", task: null, tests: [], messages: [], createdAt: Date.now() };
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed) && parsed.length > 0) {
      // chats saved before the setup step existed are testing chats that are already set up
      return parsed.map((s) => ({ subject: "testing", configured: true, ...s }));
    }
  } catch {
    // ignore and start fresh
  }
  return [newSession()];
}

function chatTitle(s) {
  const first = s.messages.find((m) => m.role === "user");
  if (!first) return s.task ? s.task.title : "New chat";
  return first.content.length > 36 ? first.content.slice(0, 36) + "..." : first.content;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* Small markdown subset for tutor replies: code spans, bold, lists, headings, fenced code. */

function renderInline(text) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((p, i) => {
    if (p.length > 2 && p.startsWith("`") && p.endsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
    if (p.length > 4 && p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    return p;
  });
}

function renderParagraphs(text, keyBase) {
  return text
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((para, i) => {
      const key = keyBase + "-" + i;
      const lines = para.split("\n");
      if (/^#{1,6}\s/.test(para)) {
        return <p key={key}><strong>{renderInline(para.replace(/^#{1,6}\s+/, ""))}</strong></p>;
      }
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        return <ul key={key}>{lines.map((l, j) => <li key={j}>{renderInline(l.replace(/^\s*[-*]\s+/, ""))}</li>)}</ul>;
      }
      if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
        return <ol key={key}>{lines.map((l, j) => <li key={j}>{renderInline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>)}</ol>;
      }
      return <p key={key}>{renderInline(para)}</p>;
    });
}

function MessageBody({ text }) {
  const segments = text.split(/```[^\n]*\n?([\s\S]*?)```/g);
  return (
    <>
      {segments.map((seg, i) =>
        i % 2 === 1 ? <pre key={i}><code>{seg.replace(/\n$/, "")}</code></pre> : renderParagraphs(seg, String(i))
      )}
    </>
  );
}

/* Every Socratic reply ends with a reflective question. Pull it out so the student sees what to answer next. */

function splitQuestion(text) {
  const paras = text.trim().split(/\n{2,}/);
  const last = paras[paras.length - 1].trim();
  if (!last.endsWith("?")) return { body: text, question: null };
  let head = "";
  let q = last;
  const breaks = [...last.slice(0, -1).matchAll(/[.!?]\s+/g)];
  if (breaks.length > 0) {
    const cut = breaks[breaks.length - 1];
    const idx = cut.index + cut[0].length;
    head = last.slice(0, idx).trim();
    q = last.slice(idx).trim();
  }
  if (q.length < 12) return { body: text, question: null };
  const bodyParas = paras.slice(0, -1);
  if (head) bodyParas.push(head);
  return { body: bodyParas.join("\n\n"), question: q };
}

function TutorMessage({ text, pullQuestion }) {
  const { body, question } = pullQuestion ? splitQuestion(text) : { body: text, question: null };
  return (
    <>
      {body.trim() && <MessageBody text={body} />}
      {question && (
        <p className="question">
          <span className="sr-only">Question: </span>
          {renderInline(question)}
        </p>
      )}
    </>
  );
}

export default function App() {
  const [sessions, setSessions] = useState(loadSessions);
  const [activeId, setActiveId] = useState(() => sessions[0].id);
  const [examples, setExamples] = useState([]);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState(() => {
    try {
      const t = localStorage.getItem("ts-theme");
      if (t === "light" || t === "dark") return t;
    } catch {}
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("ts-theme", theme); } catch {}
  }, [theme]);
  const [pick, setPick] = useState({ mode: null, subject: null });
  const [menuOpen, setMenuOpen] = useState(false);
  const aboutRef = useRef(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);

  const active = sessions.find((s) => s.id === activeId) || sessions[0];
  const tests = active.tests || [];
  const locked = active.messages.length > 0;
  const needsSetup = !active.configured;
  const isGeneral = active.subject === "general";
  const needsTask = !needsSetup && !isGeneral && !active.task && !locked;
  const solo = needsSetup || isGeneral;
  const visible = sessions.filter((s) => s.messages.length > 0 || s.id === active.id);
  const stageIndex = Math.max(0, STAGES.findIndex((s) => s.id === active.stage));
  const stage = STAGES[stageIndex];
  const nextStage = STAGES[stageIndex + 1];
  const assistantName = active.mode === "socratic" ? "Tutor" : "Assistant";

  useEffect(() => {
    fetch(API + "/examples")
      .then((r) => r.json())
      .then(setExamples)
      .catch(() => setError("Couldn't load the example tasks. Check that the backend is running, then refresh the page."));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // storage unavailable, history just won't persist
    }
  }, [sessions]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active.id, active.messages.length, loading]);

  function updateSession(id, patch) {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function newChat() {
    if (loading) return;
    if (!locked) {
      updateSession(active.id, { configured: false, task: null, tests: [], stage: "orientation" });
    } else {
      const s = newSession();
      setSessions((prev) => [s, ...prev]);
      setActiveId(s.id);
    }
    setPick({ mode: null, subject: null });
    setInput("");
    setError("");
    setMenuOpen(false);
  }

  function openChat(id) {
    if (loading) return;
    setActiveId(id);
    setError("");
    setMenuOpen(false);
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

  function confirmSetup() {
    if (!pick.mode || !pick.subject) return;
    updateSession(active.id, { mode: pick.mode, subject: pick.subject, configured: true, task: null, tests: [], stage: "orientation" });
    setError("");
  }

  function openAbout() {
    setMenuOpen(false);
    aboutRef.current?.showModal();
  }

  function chooseExample(ex) {
    updateSession(active.id, {
      task: { example_id: ex.id, title: ex.title, technique: ex.technique, description: ex.description, code: ex.code || "" },
      tests: [],
    });
    setError("");
  }

  function startCustom(e) {
    e.preventDefault();
    if (!draft.description.trim() && !draft.code.trim()) {
      setError("Add a requirement or some code first, then start the task.");
      return;
    }
    updateSession(active.id, {
      task: {
        title: draft.title.trim() || "My own task",
        technique: "",
        description: draft.description.trim(),
        code: draft.code,
      },
      tests: [],
    });
    setDraft(EMPTY_DRAFT);
    setError("");
  }

  function addRow() {
    if (tests.length >= MAX_ROWS) return;
    updateSession(active.id, { tests: [...tests, { ...EMPTY_ROW }] });
  }

  function updateRow(i, field, value) {
    updateSession(active.id, {
      tests: tests.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)),
    });
  }

  function deleteRow(i) {
    updateSession(active.id, { tests: tests.filter((_, idx) => idx !== i) });
  }

  function fillStarter(text) {
    setInput(text);
    inputRef.current?.focus();
  }

  async function send() {
    const text = input.trim();
    if (!text || loading || needsTask || needsSetup) return;
    const sid = active.id;
    const before = active.messages;
    const next = [...before, { role: "user", content: text }];
    updateSession(sid, { messages: next });
    setInput("");
    setLoading(true);
    setError("");
    try {
      const res = await fetch(API + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: active.mode,
          subject: active.subject,
          messages: next,
          session_id: sid,
          stage: active.stage,
          task: isGeneral ? null : active.task,
          tests: isGeneral ? [] : tests,
        }),
      });
      if (!res.ok) throw new Error("the server returned error " + res.status);
      const data = await res.json();
      updateSession(sid, { messages: [...next, { role: "assistant", content: data.reply }] });
    } catch (e) {
      updateSession(sid, { messages: before });
      setInput(text);
      setError("Couldn't get a reply (" + e.message + "). Check that the backend is running, then send again.");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  function downloadTranscript() {
    const lines = active.messages.map((m) => (m.role === "user" ? "You: " : assistantName + ": ") + m.content);
    let header = `Session ${active.id} (${active.mode}, ${active.subject})`;
    if (active.task) header += `\nTask: ${active.task.title}`;
    const filled = tests
      .map((t, i) => ({ t, n: i + 1 }))
      .filter(({ t }) => t.data.trim() || t.expected.trim() || t.reason.trim());
    let table = "";
    if (filled.length > 0) {
      table =
        "\n\nTest cases at download time:\n" +
        filled
          .map(({ t, n }) => `TC${n}: ${t.data} => ${t.expected}` + (t.reason ? ` (why: ${t.reason})` : ""))
          .join("\n");
    }
    const text = header + table + "\n\n" + lines.join("\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `transcript-${active.id.slice(0, 8)}.txt`;
    a.click();
  }

  return (
    <div className={"app" + (solo ? " solo" : "")}>
      <header className="topbar">
        <button className="btn small" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="sidebar">
          Menu
        </button>
        <span className="topbar-title">TestSocratic</span>
        <button className="btn small primary" onClick={newChat} disabled={loading}>
          New chat
        </button>
      </header>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

      <aside id="sidebar" className={"sidebar" + (menuOpen ? " open" : "")} aria-label="Chat history">
        <div className="brand">
          <div>
            <div className="brand-name">TestSocratic</div>
            <div className="brand-sub">Socratic Learning Companion </div>
          </div>
          <button className="btn quiet small sidebar-close" onClick={() => setMenuOpen(false)}>
            Close
          </button>
        </div>
        <button className="btn primary block" onClick={newChat} disabled={loading}>
          New chat
        </button>
        <ul className="chat-list">
          {visible.map((s) => (
            <li key={s.id} className={"chat-row" + (s.id === active.id ? " current" : "")}>
              <button
                className="chat-item"
                onClick={() => openChat(s.id)}
                disabled={loading}
                aria-current={s.id === active.id ? "true" : undefined}
              >
                <span className="chat-title">{chatTitle(s)}</span>
                <span className="chat-meta">
                  <span className={"badge " + s.mode}>{modeName(s.mode)}</span>
                  <span className="badge">{subjectShort(s.subject)}</span>
                  <span className="chat-date">{formatDate(s.createdAt)}</span>
                </span>
              </button>
              <button className="icon-btn" aria-label={"Delete chat: " + chatTitle(s)} onClick={() => deleteChat(s.id)} disabled={loading}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <button
          className="btn quiet small theme-toggle"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        </button>
        <button className="btn quiet small theme-toggle" onClick={openAbout}>
          About this project
        </button>
        <p className="privacy">
          Don't enter private or confidential information. Chats are logged anonymously for the project.
        </p>
      </aside>

      {needsSetup && (
        <main className="setup">
          <div className="setup-inner">
            <h1>Set up your chat</h1>
            <p className="lede">Choose how you want to be helped and what you want to learn.</p>
            <fieldset className="choices">
              <legend>How should it help you?</legend>
              {MODES.map((m) => (
                <label className="choice" key={m.id}>
                  <input type="radio" name="mode" value={m.id} checked={pick.mode === m.id} onChange={() => setPick({ ...pick, mode: m.id })} />
                  <span className="choice-title">{m.name}</span>
                  <span className="choice-desc">{m.desc}</span>
                </label>
              ))}
            </fieldset>
            <fieldset className="choices">
              <legend>What do you want to learn?</legend>
              {SUBJECTS.map((x) => (
                <label className="choice" key={x.id}>
                  <input type="radio" name="subject" value={x.id} checked={pick.subject === x.id} onChange={() => setPick({ ...pick, subject: x.id })} />
                  <span className="choice-title">{x.name}</span>
                  <span className="choice-desc">{x.desc}</span>
                </label>
              ))}
            </fieldset>
            <button className="btn primary" onClick={confirmSetup} disabled={!pick.mode || !pick.subject}>
              Start chat
            </button>
            <p className="setup-note">Your choices are fixed once you send your first message. Start a new chat to try another combination.</p>
          </div>
        </main>
      )}

      {!solo && (
      <main className="workspace">
        <section>
          <div className="mode-row">
            <span className="setup-summary">
              <span className={"badge " + active.mode}>{modeName(active.mode)}</span> Software testing
            </span>
            <p className="mode-hint">
              {locked
                ? "Fixed once a chat starts. Start a new chat to try another setup."
                : active.mode === "socratic"
                ? "The tutor asks guiding questions and doesn't hand over answers."
                : "The assistant answers your questions directly."}
            </p>
            {!locked && (
              <button className="btn quiet small" onClick={newChat}>
                Change options
              </button>
            )}
          </div>
        </section>

        {needsTask && (
          <section>
            <h1>Choose a task</h1>
            <p className="lede">
              Each task gives you a requirement. Design your test cases from the requirement alone, as in black-box testing.
            </p>
            <ul className="options">
              {examples.map((ex) => (
                <li key={ex.id}>
                  <button className="option" onClick={() => chooseExample(ex)}>
                    <span className="option-title">{ex.title}</span>
                    <span className="option-tech">{ex.technique}</span>
                    <span className="option-desc">{ex.description.replace(/^Requirement:\s*/, "")}</span>
                  </button>
                </li>
              ))}
            </ul>
            <details className="custom">
              <summary>Use your own requirement</summary>
              <form onSubmit={startCustom}>
                <label className="field">
                  Title (optional)
                  <input maxLength={100} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </label>
                <label className="field">
                  Requirement
                  <textarea
                    rows={5}
                    maxLength={3000}
                    placeholder="A user story, a business rule or a form rule. What should it do?"
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </label>
                <label className="field">
                  Code (optional)
                  <textarea
                    rows={5}
                    maxLength={6000}
                    style={{ fontFamily: "var(--mono)", fontSize: 13 }}
                    placeholder="Paste code only if you want to trace an implementation"
                    value={draft.code}
                    onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                  />
                </label>
                <button className="btn primary" type="submit">Start this task</button>
              </form>
            </details>
            {error && <div className="alert" role="alert">{error}</div>}
          </section>
        )}

        {active.task && (
          <section>
            <div className="task-head">
              <div>
                <h1>{active.task.title}</h1>
                {active.task.technique && <div className="technique">{active.task.technique}</div>}
              </div>
              {!locked && (
                <button className="btn quiet small" onClick={() => updateSession(active.id, { task: null, tests: [] })}>
                  Change task
                </button>
              )}
            </div>
            {active.task.description && <p className="requirement">{active.task.description}</p>}
            {active.task.code && (
              <details className="code-details">
                <summary>Implementation (optional, for tracing)</summary>
                <pre>{active.task.code}</pre>
              </details>
            )}
          </section>
        )}

        {!needsTask && (
          <>
            <section aria-label="Stages">
              <ol className="rail">
                {STAGES.map((s, i) => {
                  const state = i < stageIndex ? "done" : i === stageIndex ? "current" : "";
                  return (
                    <li key={s.id} className={state}>
                      <button
                        onClick={() => updateSession(active.id, { stage: s.id })}
                        aria-current={i === stageIndex ? "step" : undefined}
                      >
                        <span className="dot">{state === "done" ? "✓" : i + 1}</span>
                        {s.name}
                      </button>
                    </li>
                  );
                })}
              </ol>
              <div className="stage-goal">
                <p>{stage.goal}</p>
                {nextStage && (
                  <button className="btn small" onClick={() => updateSession(active.id, { stage: nextStage.id })}>
                    Next stage: {nextStage.name}
                  </button>
                )}
              </div>
            </section>

            <section aria-label="Test cases">
              <div className="sheet-head">
                <h2>Your test cases</h2>
                <span className="sheet-note">The tutor sees this table when you send a message.</span>
              </div>
              <div className="sheet">
                {tests.length === 0 ? (
                  <p className="sheet-empty">No test cases yet. Add one once you know what you want to test.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 52 }}>ID</th>
                        <th>Input or steps</th>
                        <th>Expected result</th>
                        <th>Why this test? (optional)</th>
                        <th style={{ width: 38 }}><span className="sr-only">Remove</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {tests.map((r, i) => (
                        <tr key={i}>
                          <td className="id">TC{i + 1}</td>
                          <td>
                            <input
                              className="mono"
                              aria-label={`TC${i + 1} input or steps`}
                              maxLength={300}
                              value={r.data}
                              onChange={(e) => updateRow(i, "data", e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              className="mono"
                              aria-label={`TC${i + 1} expected result`}
                              maxLength={300}
                              value={r.expected}
                              onChange={(e) => updateRow(i, "expected", e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`TC${i + 1} reason`}
                              maxLength={300}
                              value={r.reason}
                              onChange={(e) => updateRow(i, "reason", e.target.value)}
                            />
                          </td>
                          <td className="del">
                            <button className="icon-btn" aria-label={`Delete TC${i + 1}`} onClick={() => deleteRow(i)}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <button className="add-row" onClick={addRow} disabled={tests.length >= MAX_ROWS}>
                  {tests.length >= MAX_ROWS ? "Limit of " + MAX_ROWS + " test cases reached" : "Add test case"}
                </button>
              </div>
            </section>
          </>
        )}
      </main>
      )}

      {!needsSetup && (
      <section className="chat" aria-label="Conversation">
        <header className="chat-head">
          <div>
            <strong>{assistantName}</strong>
            {isGeneral && <span className="chat-sub">General learning</span>}
          </div>
          <div className="chat-actions">
            {isGeneral && !locked && (
              <button className="btn quiet small" onClick={newChat}>
                Change options
              </button>
            )}
            <button className="btn quiet small" onClick={downloadTranscript} disabled={!locked}>
              Download transcript
            </button>
          </div>
        </header>

        <div className="chat-log" ref={logRef} role="log" aria-live="polite">
          {needsTask && <p className="empty">Choose a task on the left to start the conversation.</p>}
          {!needsTask && !locked && !loading && (
            <div className="empty">
              <p>
                {isGeneral
                  ? "What do you want to learn? Name a topic, or tell me what you're stuck on."
                  : "Say what you're thinking, or start with a question."}
              </p>
              <div className="starters">
                {(isGeneral ? GENERAL_STARTERS : STARTERS).map((s) => (
                  <button key={s} className="btn small" onClick={() => fillStarter(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {active.messages.map((m, i) => (
            <div key={i} className={"msg " + (m.role === "user" ? "user" : "tutor")}>
              <div className="msg-role">{m.role === "user" ? "You" : assistantName}</div>
              <div className="body">
                {m.role === "user" ? m.content : <TutorMessage text={m.content} pullQuestion={active.mode === "socratic"} />}
              </div>
            </div>
          ))}
          {loading && (
            <div className="msg tutor">
              <div className="msg-role">{assistantName}</div>
              <div className="typing" role="status" aria-label={assistantName + " is replying"}>
                <span /><span /><span />
              </div>
            </div>
          )}
        </div>

        {error && !needsTask && <div className="alert" role="alert">{error}</div>}

        <div className="composer">
          <textarea
            ref={inputRef}
            rows={2}
            aria-label="Your message"
            placeholder={needsTask ? "Choose a task first" : isGeneral ? "Type a topic or question" : "Type your message"}
            value={input}
            disabled={needsTask}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="composer-row">
            <span className="hint">Enter to send, Shift+Enter for a new line</span>
            <button className="btn primary" onClick={send} disabled={loading || needsTask || !input.trim()}>
              Send
            </button>
          </div>
        </div>
      </section>
      )}

      <dialog
        ref={aboutRef}
        className="about"
        aria-labelledby="about-title"
        onClick={(e) => e.target === aboutRef.current && aboutRef.current.close()}
      >
        <div className="about-body">
          <h2 id="about-title">About TestSocratic</h2>
          <p>
            TestSocratic is a project that utilizes a Socratic AI tutor as a tool for learning software testing. 
            It guides you with questions in Socratic mode, or Baseline mode that answers directly. 
          </p>
          <dl className="credits">
            {CREDITS.filter(([, v]) => v).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="about-note">
            Replies come from an AI model and can contain mistakes. Check important points against your course
            materials. Chats are logged anonymously for the project, so don't enter private or confidential information.
          </p>
          <button className="btn primary" onClick={() => aboutRef.current.close()}>
            Close
          </button>
        </div>
      </dialog>
    </div>
  );
}
