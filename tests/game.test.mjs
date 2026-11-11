import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { START_FEN, newSession, applyMove, undoMoves, restoreChess, resultFor, importFen, importPgn, sessionPgn, formatClock, uciToSan } from '../src/lib/game.ts';

function play(session, ...moves) {
  return moves.reduce((game, uci) => {
    const next = applyMove(game, uci.slice(0, 2), uci.slice(2, 4), uci[4]);
    assert.ok(next, `Expected legal move ${uci} from ${game.fen}`);
    return next;
  }, session);
}

test('a legal move stores canonical notation and awards increment only to its mover', () => {
  const original = newSession({ mode: 'local', time: { base: 180, increment: 2 } });
  const next = play(original, 'e2e4');
  assert.equal(original.moves.length, 0);
  assert.equal(next.moves[0].san, 'e4');
  assert.equal(next.moves[0].before, START_FEN);
  assert.equal(next.moves[0].fen, next.fen);
  assert.equal(next.moves[0].color, 'w');
  assert.deepEqual(next.clocks, { w: 182000, b: 180000 });
  assert.equal(next.started, true);
  assert.equal(applyMove(original, 'e2', 'e5'), null, 'illegal move rejected');
  assert.equal(applyMove(original, 'e7', 'e5'), null, 'wrong side rejected');
  assert.equal(applyMove(original, 'z2', 'e4'), null, 'invalid square rejected');
});

test('both castling directions move their king and rook; castling through check is illegal', () => {
  const game = play(importFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), 'e1g1', 'e8c8');
  const board = restoreChess(game);
  assert.equal(board.get('g1').type, 'k');
  assert.equal(board.get('f1').type, 'r');
  assert.equal(board.get('c8').type, 'k');
  assert.equal(board.get('d8').type, 'r');
  assert.deepEqual(game.moves.map(move => move.san), ['O-O', 'O-O-O']);
  assert.equal(board.get('e1'), undefined);
  assert.equal(board.get('a8'), undefined);
  const throughCheck = importFen('k4r2/8/8/8/8/8/8/4K2R w K - 0 1');
  assert.equal(applyMove(throughCheck, 'e1', 'g1'), null);
});

test('en-passant capture removes the passed pawn and undo restores its legal opportunity', () => {
  const before = play(newSession({ mode: 'local' }), 'e2e4', 'a7a6', 'e4e5', 'd7d5');
  const after = play(before, 'e5d6');
  assert.equal(after.moves.at(-1).captured, 'p');
  assert.equal(after.moves.at(-1).san, 'exd6');
  const board = restoreChess(after);
  assert.equal(board.get('d5'), undefined);
  assert.deepEqual(board.get('d6'), { type: 'p', color: 'w' });
  const undone = undoMoves(after);
  assert.equal(undone.fen, before.fen);
  assert.ok(restoreChess(undone).moves().includes('exd6'));
});

test('promotion and underpromotion preserve the selected piece in history and PGN', () => {
  const start = importFen('7k/P7/8/8/8/8/8/7K w - - 0 1');
  const queen = play(start, 'a7a8q');
  assert.equal(restoreChess(queen).get('a8').type, 'q');
  assert.equal(queen.moves[0].promotion, 'q');
  assert.match(sessionPgn(queen), /a8=Q\+/);
  const knight = play(start, 'a7a8n');
  assert.equal(restoreChess(knight).get('a8').type, 'n');
  assert.equal(knight.moves[0].promotion, 'n');
  assert.deepEqual(knight.result, { winner: null, reason: 'Insufficient material' });
  assert.equal(importPgn(sessionPgn(knight)).fen, knight.fen);
});

test('checkmate records the winning side and blocks further play', () => {
  const game = play(newSession({ mode: 'local' }), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
  assert.deepEqual(game.result, { winner: 'b', reason: 'Checkmate' });
  assert.equal(game.moves.at(-1).san, 'Qh4#');
  assert.equal(applyMove(game, 'e2', 'e4'), null);
  assert.match(sessionPgn(game), /\[Result "0-1"\]/);
  assert.match(sessionPgn(game), /Qh4# 0-1$/);
  assert.deepEqual(importPgn(sessionPgn(game)).result, game.result);
});

test('stalemate, insufficient material, and fifty-move rule produce distinct draws', () => {
  assert.deepEqual(importFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').result, { winner: null, reason: 'Stalemate' });
  assert.deepEqual(importFen('7k/8/6K1/8/8/8/8/8 w - - 0 1').result, { winner: null, reason: 'Insufficient material' });
  const fifty = play(importFen('7k/8/8/8/8/8/1R6/K7 w - - 99 50'), 'b2b3');
  assert.deepEqual(fifty.result, { winner: null, reason: 'Fifty-move rule' });
  const pawn = play(importFen('7k/8/8/8/8/8/P7/KR6 w - - 99 50'), 'a2a3');
  assert.equal(pawn.result, null, 'a pawn move resets the half-move clock');
  assert.equal(pawn.fen.split(' ')[4], '0');
});

test('repetition depends on reconstructed history and survives undo/replay', () => {
  const game = play(newSession({ mode: 'local' }), 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8');
  assert.deepEqual(game.result, { winner: null, reason: 'Threefold repetition' });
  assert.equal(new Chess(game.fen).isThreefoldRepetition(), false, 'FEN alone cannot retain repetition history');
  assert.equal(restoreChess(game).isThreefoldRepetition(), true);
  const undone = undoMoves(game);
  assert.equal(undone.result, null);
  assert.equal(restoreChess(undone).isThreefoldRepetition(), false);
  const replayed = play(undone, 'f6g8');
  assert.deepEqual(replayed.result, game.result);
  assert.deepEqual(importPgn(sessionPgn(game)).result, game.result);
  assert.equal(undoMoves(game, 100).fen, START_FEN);
});

test('PGN keeps a declared resignation or agreed draw without inventing checkmate', () => {
  const resignation = importPgn('[Event "A casual game"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 1-0');
  assert.equal(resignation.title, 'A casual game');
  assert.equal(resignation.result.winner, 'w');
  assert.equal(resultFor(restoreChess(resignation)), null);
  assert.match(sessionPgn(resignation), /\[Result "1-0"\]/);
  const draw = importPgn('[Result "1/2-1/2"]\n\n1. d4 d5 1/2-1/2');
  assert.equal(draw.result.winner, null);
  assert.match(sessionPgn(draw), /1\/2-1\/2$/);
});

test('custom black-to-move PGN preserves setup, move number, and result on round-trip', () => {
  const pgn = '[Event "Custom ending"]\n[SetUp "1"]\n[FEN "7k/8/8/8/8/8/P7/KR6 b - - 0 37"]\n[Result "*"]\n\n37... Kg7 38. a3 *';
  const game = importPgn(pgn);
  assert.equal(game.startFen, '7k/8/8/8/8/8/P7/KR6 b - - 0 37');
  assert.equal(game.moves[0].color, 'b');
  assert.deepEqual(game.moves.map(move => move.san), ['Kg7', 'a3']);
  const exported = sessionPgn(game);
  assert.match(exported, /\[SetUp "1"\]/);
  assert.match(exported, /\[FEN "7k\/8\/8\/8\/8\/8\/P7\/KR6 b - - 0 37"\]/);
  assert.match(exported, /37\.\s*\.\.\.\s*Kg7 38\. a3/);
  const roundTrip = importPgn(exported);
  assert.equal(roundTrip.startFen, game.startFen);
  assert.equal(roundTrip.fen, game.fen);
  assert.equal(roundTrip.result, null);
});

test('PGN import rejects illegal setup positions just as direct FEN import does', () => {
  for (const fen of ['8/8/8/8/8/8/4k3/4K3 w - - 0 1', '7k/8/8/8/8/8/8/4K3 w K - 0 1']) {
    assert.throws(() => importFen(fen));
    assert.throws(() => importPgn(`[SetUp "1"]\n[FEN "${fen}"]\n\n*`));
  }
});

test('bad or oversized PGN is rejected and legal UCI lines produce correct SAN', () => {
  assert.throws(() => importPgn('1. e4 e5 2. Bh6'));
  assert.throws(() => importPgn(' '.repeat(3_000_001)), /too large/);
  assert.deepEqual(uciToSan(START_FEN, ['e2e4', 'e7e5', 'g1f3']), ['e4', 'e5', 'Nf3']);
  assert.equal(formatClock(-1), '0:00');
  assert.equal(formatClock(60001), '1:01');
  assert.equal(formatClock(0, true), '∞');
});
