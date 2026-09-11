import { useAppearance } from "./AppearanceContext";

const FONT_SIZES = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
];

const SPACING_OPTIONS = [
  { id: "compact", label: "Compact" },
  { id: "comfortable", label: "Comfortable" },
];

export default function AppearanceSection() {
  const { settings, updateSetting, resetToDefaults } = useAppearance();

  return (
    <div className="settings-body">
      <div className="app-section">
        <div className="app-section-header">
          <div className="app-section-title">Smoke animation intensity</div>
          <div className="app-section-value">{Math.round(settings.smokeIntensity * 100)}%</div>
        </div>
        <div className="app-section-desc">
          Controls the glowing red smoke in the background — from off to dramatic.
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.smokeIntensity}
          onChange={(e) => updateSetting("smokeIntensity", parseFloat(e.target.value))}
          className="app-slider"
        />
        <div className="app-slider-labels">
          <span>Off</span>
          <span>Subtle</span>
          <span>Dramatic</span>
        </div>
      </div>

      <div className="app-section">
        <div className="app-section-header">
          <div className="app-section-title">Accent glow intensity</div>
          <div className="app-section-value">{Math.round(settings.glowIntensity * 100)}%</div>
        </div>
        <div className="app-section-desc">
          How strong the red glow effects are on buttons, avatars, and the input bar.
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.glowIntensity}
          onChange={(e) => updateSetting("glowIntensity", parseFloat(e.target.value))}
          className="app-slider"
        />
        <div className="app-slider-labels">
          <span>Flat</span>
          <span>Balanced</span>
          <span>Intense</span>
        </div>
      </div>

      <div className="app-section">
        <div className="app-section-title">Chat text size</div>
        <div className="app-section-desc">Applies to all messages in the conversation.</div>
        <div className="app-option-row">
          {FONT_SIZES.map((opt) => (
            <div
              key={opt.id}
              className={`app-option-btn ${settings.fontSize === opt.id ? "active" : ""}`}
              onClick={() => updateSetting("fontSize", opt.id)}
            >
              {opt.label}
            </div>
          ))}
        </div>
      </div>

      <div className="app-section">
        <div className="app-section-title">Message spacing</div>
        <div className="app-section-desc">How much room messages take up and the gap between them.</div>
        <div className="app-option-row">
          {SPACING_OPTIONS.map((opt) => (
            <div
              key={opt.id}
              className={`app-option-btn ${settings.messageSpacing === opt.id ? "active" : ""}`}
              onClick={() => updateSetting("messageSpacing", opt.id)}
            >
              {opt.label}
            </div>
          ))}
        </div>
      </div>

      <div className="app-section">
        <div className="app-toggle-row">
          <div>
            <div className="app-section-title" style={{ marginBottom: 4 }}>Background grain texture</div>
            <div className="app-section-desc" style={{ marginBottom: 0 }}>
              A subtle film-grain layer over the background for texture.
            </div>
          </div>
          <div
            className={`app-toggle ${settings.grainEnabled ? "on" : ""}`}
            onClick={() => updateSetting("grainEnabled", !settings.grainEnabled)}
          >
            <div className="app-toggle-knob"></div>
          </div>
        </div>
      </div>

      <div className="app-reset-row" onClick={resetToDefaults}>
        Reset to defaults
      </div>

      <style>{`
        .app-section { margin-bottom: 28px; }

        .app-section-header {
          display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;
        }

        .app-section-title { font-size: 13px; font-weight: 600; color: #F2E0DC; }

        .app-section-value {
          font-family: 'Space Grotesk', monospace; font-size: 12px; color: #FF9E9E;
          background: rgba(255,46,46,0.1); padding: 2px 8px; border-radius: 6px;
        }

        .app-section-desc { font-size: 11.5px; color: #6B5551; margin: 4px 0 12px; line-height: 1.5; }

        .app-slider {
          width: 100%; height: 5px; border-radius: 4px; appearance: none;
          background: linear-gradient(90deg, #8B1A1A, #FF2E2E);
          outline: none; cursor: pointer;
        }

        .app-slider::-webkit-slider-thumb {
          appearance: none; width: 16px; height: 16px; border-radius: 50%;
          background: #fff; box-shadow: 0 0 8px rgba(255,46,46,0.6);
          cursor: pointer; border: 2px solid #FF2E2E;
        }

        .app-slider-labels {
          display: flex; justify-content: space-between; font-size: 10px;
          color: #5A4844; margin-top: 6px;
        }

        .app-option-row { display: flex; gap: 8px; }

        .app-option-btn {
          flex: 1; text-align: center; padding: 10px; border-radius: 10px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,46,46,0.15);
          color: #8A7570; font-size: 12.5px; cursor: pointer; transition: all 0.2s;
        }

        .app-option-btn.active {
          background: rgba(255,46,46,0.16); border-color: #FF2E2E; color: #FFB3B0;
        }

        .app-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }

        .app-toggle {
          width: 42px; height: 24px; border-radius: 20px; flex-shrink: 0;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,46,46,0.2);
          position: relative; cursor: pointer; transition: background 0.2s;
        }

        .app-toggle.on { background: linear-gradient(135deg, #FF2E2E, #8B1A1A); border-color: transparent; }

        .app-toggle-knob {
          width: 18px; height: 18px; border-radius: 50%; background: #fff;
          position: absolute; top: 2px; left: 2px; transition: left 0.2s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }

        .app-toggle.on .app-toggle-knob { left: 21px; }

        .app-reset-row {
          text-align: center; font-size: 12px; color: #6B5551; cursor: pointer;
          padding: 10px; border-top: 1px solid rgba(255,46,46,0.1); margin-top: 8px;
        }

        .app-reset-row:hover { color: #FF9E9E; }
      `}</style>
    </div>
  );
}