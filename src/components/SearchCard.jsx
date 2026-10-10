// Web-search answer card: the AI's cited answer plus a clickable list of sources.

// Extracts a display hostname from a URL without ever throwing —
// search results come from the open web, so a malformed URL shouldn't
// be able to crash the whole chat view.
function safeHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Splits a search answer on [n] citation markers and renders each one
 * as a small clickable chip that scrolls to and briefly highlights the
 * matching source card below. messageId scopes the source element ids
 * so citations in different search answers never collide.
 */
function renderAnswerWithCitations(text, messageId) {
  const parts = text.split(/(\[\d+\])/g);

  function handleCitationClick(num) {
    const el = document.getElementById(`${messageId}-source-${num}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("search-source-flash");
    setTimeout(() => el.classList.remove("search-source-flash"), 1200);
  }

  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const num = match[1];
      return (
        <span
          key={i}
          className="citation-chip"
          onClick={() => handleCitationClick(num)}
        >
          {num}
        </span>
      );
    }
    return part.split("\n").map((line, j, arr) => (
      <span key={`${i}-${j}`}>
        {line}
        {j < arr.length - 1 && <br />}
      </span>
    ));
  });
}

export default function SearchCard({ message }) {
  const m = message;
  return (
    <div className="msg-row ai">
      <div className="msg-avatar"></div>
      <div className="search-card">
        <div className="search-card-label">🔍 Web search</div>
        <div className="search-card-answer">
          {renderAnswerWithCitations(m.content, m.id)}
        </div>
        {m.sources?.length > 0 && (
          <div className="search-sources">
            <div className="search-sources-label">Sources</div>
            {m.sources.map((s, i) => (
              <a
                key={i}
                id={`${m.id}-source-${i + 1}`}
                className="search-source-item"
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="search-source-num">{i + 1}</span>
                <div className="search-source-text">
                  <div className="search-source-title">{s.title}</div>
                  <div className="search-source-url">{safeHostname(s.url)}</div>
                </div>
              </a>
            ))}
          </div>
        )}
        {m.provider && <div className="provider-tag">{m.provider}</div>}
      </div>
    </div>
  );
}