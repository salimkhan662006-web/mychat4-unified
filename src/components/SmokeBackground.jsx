// The signature glowing red smoke + film-grain layers behind the whole app.
// Intensity and grain are driven by CSS variables set in AppearanceContext.

export default function SmokeBackground() {
  return (
    <>
      <div className="smoke-layer">
        <div className="smoke-blob smoke-1"></div>
        <div className="smoke-blob smoke-2"></div>
        <div className="smoke-blob smoke-3"></div>
      </div>
      <div className="grain"></div>
    </>
  );
}