// Small model chooser above the input bar (SU-2).
// "Auto" is the free fallback chain. Free models are remembered on this device.
// A Frontier model is metered: it shows how many free trial messages are left
// and locks itself when they run out.
import { useState, useEffect, useRef } from "react";

export default function ModelPicker({ models, frontierInfo, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [open]);

  // Nothing to choose between: stay out of the way.
  if (!models || models.length < 2) return null;

  const current = models.find((m) => m.id === value) || models[0];
  const trialLeft = frontierInfo?.trial_left ?? 0;
  const trialTotal = frontierInfo?.trial_total ?? 0;
  const frontierReady = !!frontierInfo?.available && trialLeft > 0;

  function choose(m) {
    if (m.tier === "frontier" && !frontierReady) return;
    onChange(m.id);
    setOpen(false);
  }

  return (
    <div className="md-wrap" ref={wrapRef}>
      <div
        className={`md-chip ${current.tier === "frontier" ? "frontier" : ""} ${disabled ? "disabled" : ""}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        title="Choose which AI model answers"
      >
        <span className="md-chip-dot"></span>
        <span>{current.label}</span>
        {current.tier === "frontier" && <span className="md-chip-count">{trialLeft} left</span>}
        <span className="md-chip-caret">▾</span>
      </div>

      {open && (
        <div className="md-menu">
          {models.map((m) => {
            const locked = m.tier === "frontier" && !frontierReady;
            return (
              <div
                key={m.id}
                className={`md-item ${m.id === current.id ? "active" : ""} ${locked ? "locked" : ""}`}
                onClick={() => choose(m)}
              >
                <div className="md-item-top">
                  <span className="md-item-label">{m.label}</span>
                  {m.tier === "frontier" ? (
                    <span className="md-tag frontier">Frontier</span>
                  ) : (
                    <span className="md-tag">Free</span>
                  )}
                </div>
                <div className="md-item-blurb">{m.blurb}</div>
                {m.tier === "frontier" && (
                  <div className="md-item-note">
                    {!frontierInfo?.available
                      ? "Not set up yet."
                      : trialLeft > 0
                      ? `${trialLeft} of ${trialTotal} free trial messages left. Uses real credit.`
                      : "Free trial used. Part of the paid plan."}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}