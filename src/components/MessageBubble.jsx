// A normal chat message (user or assistant), including the typing-stream
// effect and any tree/chart the AI attached.
import StructuredResponse from "./StructuredResponse";

export default function MessageBubble({ message, isStreaming, displayed }) {
  const m = message;
  const shownText = isStreaming ? displayed : m.content;

  return (
    <div className={`msg-row ${m.role === "user" ? "user" : "ai"}`}>
      {m.role === "assistant" && <div className="msg-avatar"></div>}
      <div className="ai-response-stack">
        <div className="msg-bubble">
          {shownText.split("\n").map((line, j, arr) => (
            <span key={j}>
              {line}
              {j < arr.length - 1 && <br />}
            </span>
          ))}
          {isStreaming && <span className="stream-cursor"></span>}
          {m.provider && !isStreaming && (
            <div className="provider-tag">{m.provider}</div>
          )}
        </div>
        {!isStreaming && m.structure && (
          <StructuredResponse structure={m.structure} />
        )}
      </div>
    </div>
  );
}