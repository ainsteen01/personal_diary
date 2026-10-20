import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
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
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// Define the shape of our data
interface Entry {
  id: number;
  title: string;
  content: string;
  mood: string;
  date: string;
  created_at: string;
}

function App() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [theme, setTheme] = useState(
    () => localStorage.getItem("quiet-diary-theme") || "light"
  );
  const [activeView, setActiveView] = useState("All entries");
  const [activeMood, setActiveMood] = useState("All");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  // 1. FETCH ENTRIES FROM SUPABASE ON LOAD
  useEffect(() => {
    async function fetchEntries() {
      const { data, error } = await supabase
        .from("entries")
        .select("*")
        .order("date", { ascending: false })
        .order("id", { ascending: false });

      if (error) {
        console.error("Error fetching entries:", error);
        setNotice("Failed to load entries from the cloud.");
      } else if (data) {
        setEntries(data);
      }
      setLoading(false);
    }
    fetchEntries();
  }, []);

  // 2. SAVE THEME TO LOCAL STORAGE
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("quiet-diary-theme", theme);
  }, [theme]);

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
      const matchesSearch =
        !query ||
        entry.title.toLowerCase().includes(query) ||
        entry.content.toLowerCase().includes(query);

      const matchesMood = activeMood === "All" || entry.mood === activeMood;
      const matchesView = activeView !== "Today" || entry.date === today();

      return matchesSearch && matchesMood && matchesView;
    });
  }, [sortedEntries, search, activeMood, activeView]);

  const selectedEntry = entries.find((entry) => entry.id === selectedId);
  const todayCount = entries.filter((entry) => entry.date === today()).length;
  const wordCount = entries.reduce(
    (total, entry) =>
      total +
      `${entry.title} ${entry.content}`
        .trim()
        .split(/\s+/)
        .filter(Boolean).length,
    0
  );

  function openNewEntry() {
    setDraft(emptyDraft());
    setEditingId(null);
    setSelectedId(null);
    setEditorOpen(true);
  }

  function openEditEntry(entry: Entry) {
    setDraft({
      title: entry.title,
      content: entry.content,
      mood: entry.mood,
      date: entry.date,
    });
    setEditingId(entry.id);
    setSelectedId(null);
    setEditorOpen(true);
  }

  // 3. SAVE OR UPDATE ENTRY IN SUPABASE
  async function saveEntry(event: React.FormEvent) {
    event.preventDefault();

    if (!draft.title.trim() || !draft.content.trim()) {
      setNotice("Add a title and a few words before saving.");
      return;
    }

    if (editingId !== null) {
      // Update existing entry
      const { error } = await supabase
        .from("entries")
        .update({
          title: draft.title.trim(),
          content: draft.content.trim(),
          mood: draft.mood,
          date: draft.date,
        })
        .eq("id", editingId);

      if (error) {
        console.error(error);
        setNotice("Failed to update entry.");
        return;
      }
      setEntries((current) =>
        current.map((e) => (e.id === editingId ? { ...e, ...draft } : e))
      );
      setNotice("Your entry has been updated.");
    } else {
      // Create new entry
      const { data, error } = await supabase
        .from("entries")
        .insert([
          {
            title: draft.title.trim(),
            content: draft.content.trim(),
            mood: draft.mood,
            date: draft.date,
          },
        ])
        .select();

      if (error) {
        console.error(error);
        setNotice("Failed to save entry.");
        return;
      }
      if (data) {
        setEntries((current) => [data[0], ...current]);
      }
      setNotice("A new memory has been saved.");
    }

    setEditorOpen(false);
    setEditingId(null);
    setActiveView("All entries");
    setActiveMood("All");
    setSearch("");
  }

  // 4. DELETE ENTRY FROM SUPABASE
  async function confirmDelete() {
    if (!deleteId) return;

    const { error } = await supabase
      .from("entries")
      .delete()
      .eq("id", deleteId);

    if (error) {
      console.error(error);
      setNotice("Failed to delete entry.");
      return;
    }

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

  if (loading) {
    return (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: 'Playfair Display', fontSize: '24px', color: 'var(--accent)' }}>
          Opening your journal...
        </p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#home"
          onClick={() => chooseView("All entries")}
          aria-label="Quiet Pages home"
        >
          <span className="brand-mark">q.</span>
          <span className="brand-copy">
            <strong>quiet pages</strong>
            <small>YOUR PERSONAL SPACE</small>
          </span>
        </a>

        <div className="side-label">YOUR JOURNAL</div>

        <nav className="side-nav">
          <button
            className={activeView === "All entries" ? "nav-item active" : "nav-item"}
            onClick={() => chooseView("All entries")}
          >
            <span className="nav-symbol">▤</span>
            All entries
            <span className="nav-count">{entries.length}</span>
          </button>

          <button
            className={activeView === "Today" ? "nav-item active" : "nav-item"}
            onClick={() => chooseView("Today")}
          >
            <span className="nav-symbol">◷</span>
            Today
            <span className="nav-count">{todayCount}</span>
          </button>
        </nav>

        <div className="side-label mood-heading">BY YOUR MOOD</div>

        <div className="mood-nav">
          {MOODS.map((mood) => (
            <button
              key={mood.label}
              className={`mood-nav-item ${
                activeMood === mood.label ? "selected" : ""
              }`}
              onClick={() => {
                setActiveMood(activeMood === mood.label ? "All" : mood.label);
                setSelectedId(null);
              }}
            >
              <span className={`mood-dot ${mood.color}`}>
                {mood.symbol}
              </span>
              {mood.label}
              {activeMood === mood.label && <span className="mood-check">✓</span>}
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-quote">
            <span className="quote-mark">“</span>
            <p>
              Your story matters, even on the days that feel ordinary.
            </p>
            <span className="quote-credit">A NOTE TO YOURSELF</span>
          </div>

          <button
            className="theme-toggle"
            onClick={() =>
              setTheme((current) => (current === "light" ? "dark" : "light"))
            }
          >
            <span className="theme-icon">
              {theme === "light" ? "☾" : "☀"}
            </span>
            <span>{theme === "light" ? "Dark appearance" : "Light appearance"}</span>
            <span className={`toggle-track ${theme === "dark" ? "on" : ""}`}>
              <span />
            </span>
          </button>

          <div className="sidebar-footer">
            <span className="privacy-dot" />
            Just you and your thoughts.
          </div>
        </div>
      </aside>

      <main className="main-area" id="home">
        <header className="topbar">
          <div className="breadcrumb">
            <span>My journal</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{activeView === "Today" ? "Today" : "Your pages"}</strong>
          </div>

          <div className="topbar-actions">
            <span className="private-label">
              <span>♧</span> Your private space
            </span>
            <button className="primary-button top-create" onClick={openNewEntry}>
              <span>＋</span> New entry
            </button>
          </div>
        </header>

        <div className="content-wrap">
          <section className="welcome-section">
            <div className="eyebrow">
              <span className="eyebrow-line" />
              A MOMENT FOR YOURSELF
            </div>
            <h1>
              Every day has
              <br />
              a story <span>worth keeping.</span>
            </h1>
            <p className="welcome-description">
              A quiet corner of the internet that belongs to you.
              <br className="desktop-break" />
              Write freely, reflect gently, and keep the little things close.
            </p>

            <div className="welcome-actions">
              <button className="primary-button" onClick={openNewEntry}>
                <span className="button-pencil">↗</span> Write today's entry
              </button>
              <span className="welcome-date">{formatDate(today())}</span>
            </div>
          </section>

          <section className="stats-grid" aria-label="Journal statistics">
            <div className="stat-card">
              <div className="stat-icon stat-icon-lilac">▤</div>
              <div>
                <span className="stat-label">TOTAL ENTRIES</span>
                <div className="stat-value">{entries.length}</div>
                <span className="stat-note">Your story, one page at a time</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon stat-icon-peach">♡</div>
              <div>
                <span className="stat-label">WRITTEN TODAY</span>
                <div className="stat-value">{todayCount}</div>
                <span className="stat-note">Little moments from today</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon stat-icon-sage">Aa</div>
              <div>
                <span className="stat-label">WORDS WRITTEN</span>
                <div className="stat-value">{wordCount.toLocaleString()}</div>
                <span className="stat-note">Thoughts that found their way out</span>
              </div>
            </div>
          </section>

          <section className="entries-section">
            <div className="section-heading">
              <div>
                <div className="section-eyebrow">YOUR PERSONAL COLLECTION</div>
                <h2>
                  {activeView === "Today"
                    ? "Today's reflections"
                    : activeMood !== "All"
                      ? `${activeMood} moments`
                      : "Your entries"}
                  <span className="heading-count">{visibleEntries.length}</span>
                </h2>
              </div>
              <button className="text-button" onClick={openNewEntry}>
                <span>＋</span> Write a memory
              </button>
            </div>

            <div className="entries-toolbar">
              <label className="search-box">
                <span className="search-symbol">⌕</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find a thought, a feeling, a word..."
                  aria-label="Search entries"
                />
                {search && (
                  <button
                    className="clear-search"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </label>

              <button
                className={`filter-button ${activeMood !== "All" ? "filter-active" : ""}`}
                onClick={() =>
                  setActiveMood((current) => {
                    const index = MOODS.findIndex((m) => m.label === current);
                    return MOODS[(index + 1) % MOODS.length].label;
                  })
                }
                title="Cycle through mood filters"
              >
                <span>☷</span> {activeMood === "All" ? "Filter by mood" : activeMood}
              </button>
            </div>

            {visibleEntries.length > 0 ? (
              <div className="entries-grid">
                {visibleEntries.map((entry, index) => {
                  const mood =
                    MOODS.find((item) => item.label === entry.mood) || MOODS[0];

                  return (
                    <article
                      key={entry.id}
                      className={`entry-card entry-accent-${index % 3}`}
                    >
                      <button
                        className="entry-card-open"
                        onClick={() => setSelectedId(entry.id)}
                        aria-label={`Read ${entry.title}`}
                      >
                        <div className="entry-meta">
                          <span className="entry-date">
                            {formatShortDate(entry.date)}
                          </span>
                          <span className={`mood-pill ${mood.color}`}>
                            <span>{mood.symbol}</span> {entry.mood}
                          </span>
                        </div>

                        <h3>{entry.title}</h3>
                        <p className="entry-excerpt">{entry.content}</p>

                        <div className="entry-card-footer">
                          <span>
                            {entry.content.trim().split(/\s+/).filter(Boolean).length}{" "}
                            words
                          </span>
                          <span className="read-entry">
                            Read entry <span>↗</span>
                          </span>
                        </div>
                      </button>
                      <button
                        className="entry-edit-shortcut"
                        onClick={() => openEditEntry(entry)}
                        aria-label={`Edit ${entry.title}`}
                        title="Edit entry"
                      >
                        ↗
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">✎</div>
                <h3>No pages found just yet.</h3>
                <p>
                  {search
                    ? "Try another word or clear your search."
                    : activeView === "Today"
                      ? "Your day is still unfolding. Write the first line."
                      : "A blank page is full of possibility. Start with whatever is on your mind."}
                </p>
                <button className="primary-button" onClick={openNewEntry}>
                  ＋ Write your first entry
                </button>
              </div>
            )}

            <div className="end-note">
              <span>✳</span> Every little moment is part of your story.
            </div>
          </section>
        </div>
      </main>

      {editorOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setEditorOpen(false);
        }}>
          <section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
            <div className="modal-topline">
              <span className="modal-kicker">YOUR PRIVATE JOURNAL</span>
              <button className="modal-close" onClick={() => setEditorOpen(false)} aria-label="Close editor">×</button>
            </div>

            <h2 id="editor-title">{editingId !== null ? "Revisit this moment." : "Let's make a memory."}</h2>
            <p className="modal-description">There are no rules here. Just you, your thoughts, and a blank page.</p>

            <form onSubmit={saveEntry}>
              <label className="field-label" htmlFor="entry-date">DATE</label>
              <input
                id="entry-date"
                className="field-input date-input"
                type="date"
                value={draft.date}
                onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                required
              />

              <label className="field-label" htmlFor="entry-title">GIVE THIS MOMENT A NAME</label>
              <input
                id="entry-title"
                className="field-input title-input"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="A thought, a moment, a little something..."
                maxLength={120}
                required
                autoFocus
              />

              <label className="field-label" htmlFor="entry-content">YOUR THOUGHTS</label>
              <textarea
                id="entry-content"
                className="field-input entry-textarea"
                value={draft.content}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                placeholder="Start wherever you are. Write whatever feels true..."
                rows={7}
                required
              />
              <div className="textarea-foot">
                <span>Write from the heart. Edit later.</span>
                <span>{draft.content.trim() ? draft.content.trim().split(/\s+/).length : 0} words</span>
              </div>

              <label className="field-label mood-field-label">HOW ARE YOU FEELING?</label>
              <div className="mood-picker">
                {MOODS.map((mood) => (
                  <button
                    key={mood.label}
                    type="button"
                    className={`mood-choice ${draft.mood === mood.label ? "chosen" : ""}`}
                    onClick={() => setDraft({ ...draft, mood: mood.label })}
                  >
                    <span className={`mood-dot ${mood.color}`}>{mood.symbol}</span>
                    {mood.label}
                  </button>
                ))}
              </div>

              <div className="editor-actions">
                <button type="button" className="cancel-button" onClick={() => setEditorOpen(false)}>Cancel</button>
                <button type="submit" className="primary-button">
                  <span>♡</span> {editingId !== null ? "Save changes" : "Save this memory"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {selectedEntry && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedId(null);
        }}>
          <article className="reader-modal" role="dialog" aria-modal="true" aria-labelledby="reader-title">
            <div className="reader-topline">
              <span className="modal-kicker">A PAGE FROM YOUR STORY</span>
              <button className="modal-close" onClick={() => setSelectedId(null)} aria-label="Close entry">×</button>
            </div>
            <div className="reader-date">{formatDate(selectedEntry.date)}</div>
            <h2 id="reader-title">{selectedEntry.title}</h2>
            <div className="reader-mood">
              <span>{MOODS.find((m) => m.label === selectedEntry.mood)?.symbol || "♡"}</span>
              Feeling {selectedEntry.mood.toLowerCase()}
            </div>
            <div className="reader-content">{selectedEntry.content}</div>
            <div className="reader-footer">
              <button className="cancel-button delete-button" onClick={() => setDeleteId(selectedEntry.id)}>Delete entry</button>
              <button className="primary-button" onClick={() => openEditEntry(selectedEntry)}>↗ Edit entry</button>
            </div>
          </article>
        </div>
      )}

      {deleteId !== null && (
        <div className="modal-backdrop confirm-backdrop">
          <section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
            <div className="confirm-icon">!</div>
            <h2 id="delete-title">Let this memory go?</h2>
            <p>This entry will be permanently removed from your cloud storage.</p>
            <div className="editor-actions">
              <button className="cancel-button" onClick={() => setDeleteId(null)}>Keep entry</button>
              <button className="danger-button" onClick={confirmDelete}>Delete entry</button>
            </div>
          </section>
        </div>
      )}

      {notice && (
        <div className="toast-message" role="status">
          <span>✓</span> {notice}
          <button onClick={() => setNotice("")} aria-label="Dismiss notification">×</button>
        </div>
      )}
    </div>
  );
}

export default App;