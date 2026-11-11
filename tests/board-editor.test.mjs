import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { editorSquares, emptyBoardSetup, nextEditorSquare, placeEditorPiece, setupFromFen, setupToFen, validateBoardSetup } from '../src/lib/board-editor.ts';

test('setup fields round-trip a FEN without losing castling, en passant, or counters', () => {
  const fen = 'r3k2r/ppp2ppp/2npbn2/3Np3/4P3/2N1B3/PPP2PPP/R3K2R b KQkq - 17 24';
  const setup = setupFromFen(fen);
  assert.equal(setupToFen(setup), fen);
  assert.equal(validateBoardSetup(setup).valid, true);
  const ep = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 21';
  assert.equal(setupToFen(setupFromFen(ep)), ep);
  assert.equal(validateBoardSetup(setupFromFen(ep)).valid, true);
});

test('empty setups give actionable errors and become valid after placing both kings', () => {
  let setup = emptyBoardSetup();
  assert.match(validateBoardSetup(setup).error, /white king/);
  setup = { ...setup, board: placeEditorPiece(setup.board, 'e1', { color: 'w', type: 'k' }) };
  assert.match(validateBoardSetup(setup).error, /black king/);
  setup = { ...setup, board: placeEditorPiece(setup.board, 'e8', { color: 'b', type: 'k' }) };
  const result = validateBoardSetup(setup);
  assert.equal(result.valid, true);
  assert.equal(result.note, 'Draw by insufficient material');
  assert.equal(result.fen, '4k3/8/8/8/8/8/8/4K3 w - - 0 1');
});

test('king placement relocates that color only and never mutates prior board state', () => {
  const board = setupFromFen().board;
  const next = placeEditorPiece(board, 'f1', { color: 'w', type: 'k' });
  assert.equal(board.e1.type, 'k');
  assert.equal(next.e1, undefined);
  assert.equal(next.f1.type, 'k');
  assert.equal(next.e8.color, 'b');
  const removed = placeEditorPiece(next, 'f1', null);
  assert.equal(removed.f1, undefined);
  assert.equal(next.f1.type, 'k');
});

test('setup validation explains illegal kings, pawns, rights and counters', () => {
  const kings = setupFromFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
  const touching = { ...kings, board: placeEditorPiece(kings.board, 'e2', { color: 'b', type: 'k' }) };
  assert.match(validateBoardSetup(touching).error, /Kings cannot touch/);
  assert.match(validateBoardSetup({ ...kings, board: placeEditorPiece(kings.board, 'a8', { color: 'w', type: 'p' }) }).error, /promoted piece/);
  assert.match(validateBoardSetup({ ...kings, castling: 'K' }).error, /Turn off White kingside/);
  assert.match(validateBoardSetup({ ...kings, enPassant: 'd6' }).error, /Choose None/);
  assert.match(validateBoardSetup({ ...kings, halfmove: '-1' }).error, /zero or more/);
  assert.match(validateBoardSetup({ ...kings, fullmove: '0' }).error, /one or more/);
  assert.match(validateBoardSetup({ ...kings, fullmove: '' }).error, /one or more/);
});

test('ordinary checks are accepted but the side that just moved cannot remain in check', () => {
  const check = setupFromFen('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1');
  assert.equal(validateBoardSetup(check).valid, true);
  assert.match(validateBoardSetup(check).note, /in check/);
  assert.equal(validateBoardSetup({ ...check, turn: 'b' }).valid, false);
});

test('board navigation respects orientation and does not wrap across edge files', () => {
  assert.equal(editorSquares('w')[0], 'a8');
  assert.equal(editorSquares('b')[0], 'h1');
  assert.equal(nextEditorSquare('a8', 'ArrowLeft', 'w'), 'a8');
  assert.equal(nextEditorSquare('h8', 'ArrowRight', 'w'), 'h8');
  assert.equal(nextEditorSquare('e2', 'ArrowUp', 'w'), 'e3');
  assert.equal(nextEditorSquare('e2', 'ArrowUp', 'b'), 'e1');
  assert.equal(nextEditorSquare('e2', 'Home', 'b'), 'h2');
  assert.equal(nextEditorSquare('e2', 'End', 'b'), 'a2');
  assert.equal(setupToFen(setupFromFen()), new Chess().fen());
});
