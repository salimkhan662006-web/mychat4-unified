// Big centred wordmark shown on an empty new chat (phone only).
export default function HeroMark({ text }) {
  return (
    <div className="hero">
      <div className="hero-mark">Isahiri<span>AI</span></div>
      <div className="hero-sub">{text}</div>
    </div>
  );
}