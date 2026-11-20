import { useId } from "react";
import "./HallSwitch.css";

const hallTableUrl = (import.meta.env?.BASE_URL ?? "./") + "images/hall-table.webp";
export function hallTableBackground() {
  const url = new URL(hallTableUrl, document.baseURI);
  return `url("${url.href}")`;
}

export default function HallSwitch({ enabled, onChange }: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const descriptionId = useId();
  return (
    <button
      type="button"
      className="hall-mode-switch"
      role="switch"
      aria-label="Tournament Hall"
      aria-checked={enabled}
      aria-describedby={descriptionId}
      onClick={() => onChange(!enabled)}
    >
      <span className="hall-switch-art" style={{backgroundImage: hallTableBackground()}} aria-hidden="true" />
      <span className="hall-switch-copy">
        <strong>Tournament Hall</strong>
        <span id={descriptionId}>A tournament table with an interactive scoresheet.</span>
      </span>
      <span className="hall-switch-track" aria-hidden="true"><i /></span>
    </button>
  );
}
