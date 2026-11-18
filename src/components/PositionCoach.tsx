import { Chess, type Move } from "chess.js";
import { useEffect, useRef, useState } from "react";
import { LocalEngine } from "../lib/engine";
import type { Settings } from "../lib/storage";

const pieces = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
function clue(move: Move, inCheck: boolean) {
  if (inCheck) return "Your king is in check. Compare captures, blocks and king moves.";
  if (move.san.endsWith("#")) return "The opposing king has no escape after one forcing move. Look for mate.";
  if (move.isKingsideCastle() || move.isQueensideCastle()) return "Can one move shelter your king and bring a rook closer to the center?";
  if (move.captured) return `Examine the ${pieces[move.captured]} on ${move.to}. What can recapture there?`;
  if (move.san.endsWith("+")) return "Find a check that restricts the opponent’s replies.";
  return `Look at your ${pieces[move.piece]} on ${move.from}. Compare its activity on each legal destination.`;
}
interface Lesson { move: Move; prompt: string; choices: string[]; reply?: string }
export default function PositionCoach({ fen, settings, onAssist, feedbackEnabled, onArrow }: {
  fen: string; settings: Settings; feedbackEnabled: boolean; onAssist: () => void; onArrow: (from: string, to: string) => void;
}) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [status, setStatus] = useState("");
  const [revealed, reveal] = useState(false);
  const engine = useRef<LocalEngine | null>(null);
  useEffect(() => () => { engine.current?.destroy(); engine.current = null; }, []);
  async function begin() {
    if (engine.current) return;
    onAssist();
    const search = new LocalEngine({ mode: settings.engineMode, threads: settings.engineThreads });
    engine.current = search;
    setStatus("Studying the position…");
    try {
      const result = await search.analyze(fen, { movetime: 900, depth: 16 });
      if (engine.current !== search) return;
      const board = new Chess(fen);
      const legal = board.moves({ verbose: true });
      const best = legal.find(m => m.lan === result.bestMove);
      if (!best) throw new Error("No legal candidate");
      board.move(best);
      const pv = result.lines.find(line => line.pv[0] === best.lan)?.pv;
      const reply = pv?.[1] && board.moves({verbose:true}).find(m => m.lan === pv[1])?.san;
      const choices = [best.san, ...legal.filter(m => m.lan !== best.lan)
        .sort((a,b) => Number(b.piece === best.piece) - Number(a.piece === best.piece)).slice(0,2).map(m => m.san)].sort();
      setLesson({ move: best, prompt: clue(best, new Chess(fen).isCheck()), choices, reply });
      setStatus("");
    } catch {
      if (engine.current === search) setStatus("The coach could not read this position. Try again.");
    } finally {
      search.destroy();
      if (engine.current === search) engine.current = null;
    }
  }
  function show() {
    if (!lesson) return;
    reveal(true);
    onArrow(lesson.move.from, lesson.move.to);
    setStatus(`Try ${lesson.move.san}.${lesson.reply ? ` Then calculate the reply ${lesson.reply}.` : ""} Play your choice on the board.`);
  }
  return <section className="position-coach" aria-label="Position coach">
    <strong>Position coach</strong>
    {lesson ? <>
      <p>{lesson.prompt}</p>
      {!revealed && <><p>Which move would you try?</p><div className="coach-choices">{lesson.choices.map(san =>
        <button key={san} className="button secondary" onClick={() => san === lesson.move.san ? show() : setStatus(`${san} is legal. Compare another candidate with the clue.`)}>{san}</button>)}
        <button className="text-button" onClick={show}>Show the line</button></div></>}
    </> : <><p>Study your next move. Coaching enables move feedback and makes this game unrated.</p>
      <button className="button secondary" disabled={!!engine.current} onClick={begin}>Coach this position</button>
      {!feedbackEnabled && <button className="text-button" onClick={onAssist}>Enable move feedback</button>}</>}
    <span role="status">{status}</span>
  </section>;
}
