
import { Board, Color, Piece, PieceType, Position, Move } from '../types';

export const createInitialBoard = (): Board => {
  const board: Board = Array(8).fill(null).map(() => Array(8).fill(null));
  const setupRow = (row: number, color: Color) => {
    const pieces: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    pieces.forEach((type, col) => { board[row][col] = { type, color }; });
  };
  const setupPawns = (row: number, color: Color) => {
    for (let col = 0; col < 8; col++) { board[row][col] = { type: 'p', color }; }
  };
  setupRow(0, 'b'); setupPawns(1, 'b'); setupPawns(6, 'w'); setupRow(7, 'w');
  return board;
};

export const isPseudoLegalMove = (board: Board, move: Move): boolean => {
  const { from, to, piece } = move;
  const target = board[to.row][to.col];
  if (target && target.color === piece.color) return false;
  const dx = Math.abs(to.col - from.col);
  const dy = Math.abs(to.row - from.row);

  switch (piece.type) {
    case 'p':
      const dir = piece.color === 'w' ? -1 : 1;
      if (to.col === from.col && !target) {
        if (to.row === from.row + dir) return true;
        if (from.row === (piece.color === 'w' ? 6 : 1) && to.row === from.row + 2 * dir && !board[from.row + dir][from.col]) return true;
      } else if (dx === 1 && to.row === from.row + dir && target) return true;
      return false;
    case 'r': return (dx === 0 || dy === 0) && isPathClear(board, from, to);
    case 'n': return (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
    case 'b': return dx === dy && isPathClear(board, from, to);
    case 'q': return (dx === dy || dx === 0 || dy === 0) && isPathClear(board, from, to);
    case 'k': return dx <= 1 && dy <= 1;
    default: return false;
  }
};

const isPathClear = (board: Board, from: Position, to: Position): boolean => {
  const stepRow = Math.sign(to.row - from.row);
  const stepCol = Math.sign(to.col - from.col);
  let r = from.row + stepRow, c = from.col + stepCol;
  while (r !== to.row || c !== to.col) {
    if (board[r][c]) return false;
    r += stepRow; c += stepCol;
  }
  return true;
};

export const findKing = (board: Board, color: Color): Position => {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) 
    if (board[r][c]?.type === 'k' && board[r][c]?.color === color) return { row: r, col: c };
  return { row: -1, col: -1 };
};

export const isCheck = (board: Board, color: Color): boolean => {
  const kingPos = findKing(board, color);
  const opp = color === 'w' ? 'b' : 'w';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (p && p.color === opp && isPseudoLegalMove(board, { from: { r, c }, to: kingPos, piece: p } as any)) return true;
  }
  return false;
};

export const isValidMove = (board: Board, move: Move): boolean => {
  if (!isPseudoLegalMove(board, move)) return false;
  const sim = makeMove(board, move);
  return !isCheck(sim, move.piece.color);
};

export const makeMove = (board: Board, move: Move): Board => {
  const nb = board.map(r => [...r]);
  nb[move.to.row][move.to.col] = move.promotion ? { type: move.promotion, color: move.piece.color } : { ...move.piece };
  nb[move.from.row][move.from.col] = null;
  return nb;
};

export const getGameState = (board: Board, turn: Color) => {
  const moves = getAllValidMoves(board, turn);
  if (moves.length === 0) return isCheck(board, turn) ? 'checkmate' : 'stalemate';
  return 'playing';
};

const getAllValidMoves = (board: Board, color: Color): Move[] => {
  const moves: Move[] = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (p && p.color === color) {
      for (let tr = 0; tr < 8; tr++) for (let tc = 0; tc < 8; tc++) {
        const m = { from: { row: r, col: c }, to: { row: tr, col: tc }, piece: p };
        if (isValidMove(board, m)) moves.push(m);
      }
    }
  }
  return moves;
};

// --- ENGINE IA AVANÇADA ---
const VALUES: Record<PieceType, number> = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 900 };

const evaluateBoard = (board: Board): number => {
  let score = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (p) score += (p.color === 'w' ? 1 : -1) * VALUES[p.type];
  }
  return score;
};

const minimax = (board: Board, depth: number, alpha: number, beta: number, isMaximizing: boolean): number => {
  if (depth === 0) return evaluateBoard(board);
  const turn: Color = isMaximizing ? 'w' : 'b';
  const moves = getAllValidMoves(board, turn);

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const m of moves) {
      const ev = minimax(makeMove(board, m), depth - 1, alpha, beta, false);
      maxEval = Math.max(maxEval, ev);
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const m of moves) {
      const ev = minimax(makeMove(board, m), depth - 1, alpha, beta, true);
      minEval = Math.min(minEval, ev);
      beta = Math.min(beta, ev);
      if (beta <= alpha) break;
    }
    return minEval;
  }
};

export const getBestMove = (board: Board, color: Color, userElo: number = 1500): Move | null => {
  const moves = getAllValidMoves(board, color);
  if (moves.length === 0) return null;

  // Dificuldade baseada no Elo: 
  // Elo < 800: Depth 1 (Iniciante)
  // Elo 800-1800: Depth 2 (Intermediário)
  // Elo > 1800: Depth 3 (Avançado)
  // Elo > 2500: Depth 4 (Grandmaster - lento no navegador mas fortíssimo)
  const depth = userElo < 1000 ? 1 : userElo < 2000 ? 2 : userElo < 2800 ? 3 : 4;
  
  let bestMove = null;
  let bestValue = color === 'w' ? -Infinity : Infinity;

  for (const m of moves) {
    const boardValue = minimax(makeMove(board, m), depth - 1, -Infinity, Infinity, color !== 'w');
    if (color === 'w') {
      if (boardValue > bestValue) { bestValue = boardValue; bestMove = m; }
    } else {
      if (boardValue < bestValue) { bestValue = boardValue; bestMove = m; }
    }
  }
  return bestMove;
};
