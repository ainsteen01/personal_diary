import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import type { User } from "@supabase/supabase-js";
import "./App.css";

const MOODS = [
  { label: "Peaceful", symbol: "☁", color: "mood-peaceful" },
  { label: "Happy", symbol: "☀", color: "mood-happy" },
  { label: "Grateful", symbol: "♡", color: "mood-grateful" },
  { label: "Thoughtful", symbol: "◌", color: "mood-thoughtful" },
  { label: "Sad", symbol: "☂", color: "mood-sad" },
  { label: "Excited", symbol: "✳", color: "mood-excited" },
];

const today = () => new Date().toLocaleDateString("en-CA");

const emptyDraft = () => ({
  title: "",
  content: "",
  mood: "Peaceful",
  date: today(),
});

function formatDate(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatShortDate(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface Entry {
  id: number;
  title: string;
  content: string;
  mood: string;
  date: string;
  created_at: string;
  user_id: string;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Auth Form State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState("");

  // Password Reset State
  const [authMode, setAuthMode] = useState<"login" | "forgot" | "update">("login");
  const [newPassword, setNewPassword] = useState("");

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [theme, setTheme] = useState(() => localStorage.getItem("quiet-diary-theme") || "light");
  const [activeView, setActiveView] = useState("All entries");
  const [activeMood, setActiveMood] = useState("All");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  // --- AUTHENTICATION LISTENER ---
  useEffect(() => {
    // Check if user is arriving from a password reset link
    const hash = window.location.hash;
    if (hash && hash.includes("type=recovery")) {
      setAuthMode("update");
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("update");
      }
    });

    return () => subscription.unsubscribe();
  }, []);


  // --- FETCH ENTRIES (Only when user is logged in) ---
  useEffect(() => {
    if (!user) {
      setEntries([]);
      return;
    }

    // Save the ID to a constant so TypeScript knows it's safe
    const currentUserId = user.id;

    async function fetchEntries() {
      setLoading(true);
      const { data, error } = await supabase
        .from("entries")
        .select("*")
        .eq("user_id", currentUserId) // <--- Now it uses the constant
        .order("date", { ascending: false })
        .order("id", { ascending: false });

      if (error) {
        console.error("Error fetching entries:", error);
        setNotice("Failed to load entries.");
      } else if (data) {
        setEntries(data);
      }
      setLoading(false);
    }
    fetchEntries();
  }, [user]);

  // --- SAVE THEME ---
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("quiet-diary-theme", theme);
  }, [theme]);

  // --- AUTH FUNCTIONS ---
  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setAuthError(error.message);
      else setNotice("Account created! You can log in now.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError(error.message);
    }
    setAuthLoading(false);
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    // For local testing, this will log the link to the console instead of sending an email
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://ainsteen01.github.io/personal_diary/", // Change this to your GitHub Pages URL for production
    });

    if (error) {
      setAuthError(error.message);
    } else {
      setNotice("Password reset link generated! Check the browser console.");
    }
    setAuthLoading(false);
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setAuthError(error.message);
    } else {
      setNotice("Password updated successfully!");
      setAuthMode("login");
      await supabase.auth.signOut(); // Force them to log in with the new password
    }
    setAuthLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setEntries([]);
    setEmail("");
    setPassword("");
    setAuthMode("login");
  }

  // --- DERIVED DATA ---
  const sortedEntries = useMemo(
    () =>
      [...entries].sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateB !== dateA) return dateB - dateA;
        return b.id - a.id;
      }),
    [entries]
  );

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sortedEntries.filter((entry) => {
      const matchesSearch = !query || entry.title.toLowerCase().includes(query) || entry.content.toLowerCase().includes(query);
      const matchesMood = activeMood === "All" || entry.mood === activeMood;
      const matchesView = activeView !== "Today" || entry.date === today();
      return matchesSearch && matchesMood && matchesView;
    });
  }, [sortedEntries, search, activeMood, activeView]);

  const selectedEntry = entries.find((entry) => entry.id === selectedId);
  const todayCount = entries.filter((entry) => entry.date === today()).length;
  const wordCount = entries.reduce((total, entry) => total + `${entry.title} ${entry.content}`.trim().split(/\s+/).filter(Boolean).length, 0);

  function openNewEntry() {
    setDraft(emptyDraft());
    setEditingId(null);
    setSelectedId(null);
    setEditorOpen(true);
  }

  function openEditEntry(entry: Entry) {
    setDraft({ title: entry.title, content: entry.content, mood: entry.mood, date: entry.date });
    setEditingId(entry.id);
    setSelectedId(null);
    setEditorOpen(true);
  }

  async function saveEntry(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.content.trim() || !user) return;

    if (editingId !== null) {
      const { error } = await supabase.from("entries").update({ title: draft.title.trim(), content: draft.content.trim(), mood: draft.mood, date: draft.date }).eq("id", editingId);
      if (error) { console.error(error); setNotice("Failed to update entry."); return; }
      setEntries((current) => current.map((e) => (e.id === editingId ? { ...e, ...draft } : e)));
      setNotice("Your entry has been updated.");
    } else {
      const { data, error } = await supabase.from("entries").insert([{ title: draft.title.trim(), content: draft.content.trim(), mood: draft.mood, date: draft.date, user_id: user.id }]).select();
      if (error) { console.error(error); setNotice("Failed to save entry."); return; }
      if (data) setEntries((current) => [data[0], ...current]);
      setNotice("A new memory has been saved.");
    }
    setEditorOpen(false);
    setEditingId(null);
    setActiveView("All entries");
    setActiveMood("All");
    setSearch("");
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from("entries").delete().eq("id", deleteId);
    if (error) { console.error(error); setNotice("Failed to delete entry."); return; }
    setEntries((current) => current.filter((entry) => entry.id !== deleteId));
    setDeleteId(null);
    setSelectedId(null);
    setNotice("Entry deleted.");
  }

  function chooseView(view: string) {
    setActiveView(view);
    setActiveMood("All");
    setSearch("");
    setSelectedId(null);
  }

  // --- RENDER: LOADING OR AUTH SCREENS ---
  if (authLoading) {
    return <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  if (!user || authMode === "update") {
    return (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
        <div className="editor-modal" style={{ maxWidth: '400px' }}>
          <div className="modal-topline">
            <span className="modal-kicker">YOUR PRIVATE JOURNAL</span>
          </div>
          
          {/* FORGOT PASSWORD SCREEN */}
          {authMode === "forgot" && (
            <>
              <h2>Reset password.</h2>
              <p className="modal-description">Enter your email and we'll generate a reset link.</p>
              {authError && <p style={{ color: '#a95043', fontSize: '12px', marginBottom: '10px' }}>{authError}</p>}
              <form onSubmit={handleForgotPassword}>
                <label className="field-label">EMAIL</label>
                <input className="field-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                <div className="editor-actions" style={{ marginTop: '20px' }}>
                  <button type="submit" className="primary-button" disabled={authLoading}>Send Reset Link</button>
                </div>
              </form>
              <button type="button" className="text-button" style={{ marginTop: '20px', width: '100%', justifyContent: 'center' }} onClick={() => setAuthMode("login")}>
                Back to login
              </button>
            </>
          )}

          {/* UPDATE PASSWORD SCREEN (After clicking link) */}
          {authMode === "update" && (
            <>
              <h2>Set new password.</h2>
              <p className="modal-description">Choose a strong new password for your account.</p>
              {authError && <p style={{ color: '#a95043', fontSize: '12px', marginBottom: '10px' }}>{authError}</p>}
              <form onSubmit={handleUpdatePassword}>
                <label className="field-label">NEW PASSWORD</label>
                <input className="field-input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                <div className="editor-actions" style={{ marginTop: '20px' }}>
                  <button type="submit" className="primary-button" disabled={authLoading}>Update Password</button>
                </div>
              </form>
            </>
          )}

          {/* LOGIN / SIGNUP SCREEN */}
          {authMode === "login" && (
            <>
              <h2>{isSignUp ? "Create your space." : "Welcome back."}</h2>
              <p className="modal-description">Log in to keep your memories safe and private.</p>
              {authError && <p style={{ color: '#a95043', fontSize: '12px', marginBottom: '10px' }}>{authError}</p>}
              <form onSubmit={handleAuth}>
                <label className="field-label">EMAIL</label>
                <input className="field-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                <label className="field-label">PASSWORD</label>
                <input className="field-input" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                <div className="editor-actions" style={{ marginTop: '20px' }}>
                  <button type="submit" className="primary-button" disabled={authLoading}>
                    {authLoading ? "Please wait..." : isSignUp ? "Sign Up" : "Log In"}
                  </button>
                </div>
              </form>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                <button type="button" className="text-button" onClick={() => { setIsSignUp(!isSignUp); setAuthError(""); }}>
                  {isSignUp ? "Log in instead" : "Need an account? Sign up"}
                </button>
                {!isSignUp && (
                  <button type="button" className="text-button" onClick={() => { setAuthMode("forgot"); setAuthError(""); }}>
                    Forgot password?
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // --- RENDER: MAIN APP ---
  if (loading) {
    return (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: 'Playfair Display', fontSize: '24px', color: 'var(--accent)' }}>Opening your journal...</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" onClick={() => chooseView("All entries")}>
          <span className="brand-mark">q.</span>
          <span className="brand-copy"><strong>quiet pages</strong><small>YOUR PERSONAL SPACE</small></span>
        </a>
        <div className="side-label">YOUR JOURNAL</div>
        <nav className="side-nav">
          <button className={activeView === "All entries" ? "nav-item active" : "nav-item"} onClick={() => chooseView("All entries")}><span className="nav-symbol">▤</span> All entries <span className="nav-count">{entries.length}</span></button>
          <button className={activeView === "Today" ? "nav-item active" : "nav-item"} onClick={() => chooseView("Today")}><span className="nav-symbol">◷</span> Today <span className="nav-count">{todayCount}</span></button>
        </nav>
        <div className="side-label mood-heading">BY YOUR MOOD</div>
        <div className="mood-nav">
          {MOODS.map((mood) => (
            <button key={mood.label} className={`mood-nav-item ${activeMood === mood.label ? "selected" : ""}`} onClick={() => { setActiveMood(activeMood === mood.label ? "All" : mood.label); setSelectedId(null); }}>
              <span className={`mood-dot ${mood.color}`}>{mood.symbol}</span> {mood.label}
              {activeMood === mood.label && <span className="mood-check">✓</span>}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-quote"><span className="quote-mark">“</span><p>Your story matters, even on the days that feel ordinary.</p><span className="quote-credit">A NOTE TO YOURSELF</span></div>
          <button className="theme-toggle" onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}>
            <span className="theme-icon">{theme === "light" ? "☾" : "☀"}</span><span>{theme === "light" ? "Dark appearance" : "Light appearance"}</span><span className={`toggle-track ${theme === "dark" ? "on" : ""}`}><span /></span>
          </button>
          <button className="theme-toggle" onClick={handleLogout} style={{ color: 'var(--muted)' }}><span className="theme-icon">↪</span><span>Log out</span></button>
          <div className="sidebar-footer"><span className="privacy-dot" />Logged in as {user.email}</div>
        </div>
      </aside>

      <main className="main-area" id="home">
        <header className="topbar">
          <div className="breadcrumb"><span>My journal</span><span className="breadcrumb-slash">/</span><strong>{activeView === "Today" ? "Today" : "Your pages"}</strong></div>
          <div className="topbar-actions">
            <span className="private-label"><span>♧</span> Your private space</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginRight: '10px' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{user.email}</span>
              <button onClick={handleLogout} className="cancel-button" style={{ height: '32px', padding: '0 10px', fontSize: '10px' }}>Log out</button>
            </div>
            <button className="primary-button top-create" onClick={openNewEntry}><span>＋</span> New entry</button>
          </div>
        </header>

        <div className="content-wrap">
          <section className="welcome-section">
            <div className="eyebrow"><span className="eyebrow-line" />A MOMENT FOR YOURSELF</div>
            <h1>Every day has<br />a story <span>worth keeping.</span></h1>
            <p className="welcome-description">A quiet corner of the internet that belongs to you.<br className="desktop-break" />Write freely, reflect gently, and keep the little things close.</p>
            <div className="welcome-actions">
              <button className="primary-button" onClick={openNewEntry}><span className="button-pencil">↗</span> Write today's entry</button>
              <span className="welcome-date">{formatDate(today())}</span>
            </div>
          </section>

          <section className="stats-grid" aria-label="Journal statistics">
            <div className="stat-card"><div className="stat-icon stat-icon-lilac">▤</div><div><span className="stat-label">TOTAL ENTRIES</span><div className="stat-value">{entries.length}</div><span className="stat-note">Your story, one page at a time</span></div></div>
            <div className="stat-card"><div className="stat-icon stat-icon-peach">♡</div><div><span className="stat-label">WRITTEN TODAY</span><div className="stat-value">{todayCount}</div><span className="stat-note">Little moments from today</span></div></div>
            <div className="stat-card"><div className="stat-icon stat-icon-sage">Aa</div><div><span className="stat-label">WORDS WRITTEN</span><div className="stat-value">{wordCount.toLocaleString()}</div><span className="stat-note">Thoughts that found their way out</span></div></div>
          </section>

          <section className="entries-section">
            <div className="section-heading">
              <div><div className="section-eyebrow">YOUR PERSONAL COLLECTION</div><h2>{activeView === "Today" ? "Today's reflections" : activeMood !== "All" ? `${activeMood} moments` : "Your entries"}<span className="heading-count">{visibleEntries.length}</span></h2></div>
              <button className="text-button" onClick={openNewEntry}><span>＋</span> Write a memory</button>
            </div>
            <div className="entries-toolbar">
              <label className="search-box">
                <span className="search-symbol">⌕</span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a thought, a feeling, a word..." />
                {search && <button className="clear-search" onClick={() => setSearch("")}>×</button>}
              </label>
              <button className={`filter-button ${activeMood !== "All" ? "filter-active" : ""}`} onClick={() => setActiveMood((c) => { const i = MOODS.findIndex((m) => m.label === c); return MOODS[(i + 1) % MOODS.length].label; })}><span>☷</span> {activeMood === "All" ? "Filter by mood" : activeMood}</button>
            </div>

            {visibleEntries.length > 0 ? (
              <div className="entries-grid">
                {visibleEntries.map((entry, index) => {
                  const mood = MOODS.find((item) => item.label === entry.mood) || MOODS[0];
                  return (
                    <article key={entry.id} className={`entry-card entry-accent-${index % 3}`}>
                      <button className="entry-card-open" onClick={() => setSelectedId(entry.id)}>
                        <div className="entry-meta"><span className="entry-date">{formatShortDate(entry.date)}</span><span className={`mood-pill ${mood.color}`}><span>{mood.symbol}</span> {entry.mood}</span></div>
                        <h3>{entry.title}</h3><p className="entry-excerpt">{entry.content}</p>
                        <div className="entry-card-footer"><span>{entry.content.trim().split(/\s+/).filter(Boolean).length} words</span><span className="read-entry">Read entry <span>↗</span></span></div>
                      </button>
                      <button className="entry-edit-shortcut" onClick={() => openEditEntry(entry)} title="Edit entry">↗</button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">✎</div><h3>No pages found just yet.</h3>
                <p>{search ? "Try another word or clear your search." : activeView === "Today" ? "Your day is still unfolding. Write the first line." : "A blank page is full of possibility. Start with whatever is on your mind."}</p>
                <button className="primary-button" onClick={openNewEntry}>＋ Write your first entry</button>
              </div>
            )}
            <div className="end-note"><span>✳</span> Every little moment is part of your story.</div>
          </section>
        </div>
      </main>

      {editorOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditorOpen(false); }}>
          <section className="editor-modal" role="dialog" aria-modal="true">
            <div className="modal-topline"><span className="modal-kicker">YOUR PRIVATE JOURNAL</span><button className="modal-close" onClick={() => setEditorOpen(false)}>×</button></div>
            <h2>{editingId !== null ? "Revisit this moment." : "Let's make a memory."}</h2>
            <p className="modal-description">There are no rules here. Just you, your thoughts, and a blank page.</p>
            <form onSubmit={saveEntry}>
              <label className="field-label">DATE</label><input className="field-input date-input" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required />
              <label className="field-label">GIVE THIS MOMENT A NAME</label><input className="field-input title-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="A thought, a moment, a little something..." maxLength={120} required autoFocus />
              <label className="field-label">YOUR THOUGHTS</label><textarea className="field-input entry-textarea" value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="Start wherever you are. Write whatever feels true..." rows={7} required />
              <div className="textarea-foot"><span>Write from the heart. Edit later.</span><span>{draft.content.trim() ? draft.content.trim().split(/\s+/).length : 0} words</span></div>
              <label className="field-label mood-field-label">HOW ARE YOU FEELING?</label>
              <div className="mood-picker">
                {MOODS.map((mood) => (
                  <button key={mood.label} type="button" className={`mood-choice ${draft.mood === mood.label ? "chosen" : ""}`} onClick={() => setDraft({ ...draft, mood: mood.label })}><span className={`mood-dot ${mood.color}`}>{mood.symbol}</span> {mood.label}</button>
                ))}
              </div>
              <div className="editor-actions">
                <button type="button" className="cancel-button" onClick={() => setEditorOpen(false)}>Cancel</button>
                <button type="submit" className="primary-button"><span>♡</span> {editingId !== null ? "Save changes" : "Save this memory"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {selectedEntry && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
          <article className="reader-modal" role="dialog" aria-modal="true">
            <div className="reader-topline"><span className="modal-kicker">A PAGE FROM YOUR STORY</span><button className="modal-close" onClick={() => setSelectedId(null)}>×</button></div>
            <div className="reader-date">{formatDate(selectedEntry.date)}</div><h2>{selectedEntry.title}</h2>
            <div className="reader-mood"><span>{MOODS.find((m) => m.label === selectedEntry.mood)?.symbol || "♡"}</span> Feeling {selectedEntry.mood.toLowerCase()}</div>
            <div className="reader-content">{selectedEntry.content}</div>
            <div className="reader-footer"><button className="cancel-button delete-button" onClick={() => setDeleteId(selectedEntry.id)}>Delete entry</button><button className="primary-button" onClick={() => openEditEntry(selectedEntry)}>↗ Edit entry</button></div>
          </article>
        </div>
      )}

      {deleteId !== null && (
        <div className="modal-backdrop confirm-backdrop">
          <section className="confirm-modal" role="alertdialog" aria-modal="true">
            <div className="confirm-icon">!</div><h2>Let this memory go?</h2><p>This entry will be permanently removed from your cloud storage.</p>
            <div className="editor-actions"><button className="cancel-button" onClick={() => setDeleteId(null)}>Keep entry</button><button className="danger-button" onClick={confirmDelete}>Delete entry</button></div>
          </section>
        </div>
      )}

      {notice && (
        <div className="toast-message" role="status">
          <span>✓</span> {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
    </div>
  );
}

export default App;