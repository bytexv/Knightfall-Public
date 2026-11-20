import { useId } from "react";
import "./AtHomeSwitch.css";

const piecesDirectory = (import.meta.env?.BASE_URL ?? "./") + "pieces/";
const previewPosition = [
  { square: "f8", piece: "bR" }, { square: "g8", piece: "bK" },
  { square: "f7", piece: "bP" }, { square: "g7", piece: "bP" },
  { square: "h7", piece: "bP" }, { square: "d4", piece: "wP" },
  { square: "g3", piece: "wP" }, { square: "f2", piece: "wP" },
  { square: "h2", piece: "wP" }, { square: "e1", piece: "wR" },
  { square: "g1", piece: "wK" },
];

export default function AtHomeSwitch({ enabled, onChange }: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const descriptionId = useId();
  return (
    <button
      type="button"
      className="at-home-switch"
      role="switch"
      aria-label="At Home"
      aria-checked={enabled}
      aria-describedby={descriptionId}
      onClick={() => onChange(!enabled)}
    >
      <span className="at-home-switch-board" aria-hidden="true">
        {previewPosition.map(({ square, piece }) => (
          <img
            key={square}
            src={`${piecesDirectory}${piece}.svg`}
            alt=""
            draggable={false}
            style={{ gridColumn: "abcdefgh".indexOf(square[0]) + 1, gridRow: 9 - Number(square[1]) }}
          />
        ))}
      </span>
      <span className="at-home-switch-copy">
        <strong>At Home</strong>
        <span id={descriptionId}>Charcoal panels and a classic green board.</span>
      </span>
      <span className="at-home-switch-track" aria-hidden="true"><i /></span>
    </button>
  );
}
