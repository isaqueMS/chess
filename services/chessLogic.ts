
import { Board, Color, Piece, PieceType, Position, Move } from '../types';

export const createInitialBoard = (): Board => {
  const board: Board = Array(8).fill(null).map(() => Array(8).fill(null));
  
  const setupRow = (row: number, color: Color) => {
    const pieces: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    pieces.forEach((type, col) => {
      board[row][col] = { type, color };
    });
  };

  const setupPawns = (row: number, color: Color) => {
    for (let col = 0; col < 8; col++) {
      board[row][col] = { type: 'p', color };
    }
  };

  setupRow(0, 'b');
  setupPawns(1, 'b');
  setupPawns(6, 'w');
  setupRow(7, 'w');

  return board;
};

export const isPseudoLegalMove = (board: Board, move: Move): boolean => {
  const { from, to, piece } = move;
  const target = board[to.row][to.col];
  
  if (target && target.color === piece.color) return false;
  if (from.row === to.row && from.col === to.col) return false;

  const dx = Math.abs(to.col - from.col);
  const dy = Math.abs(to.row - from.row);

  switch (piece.type) {
    case 'p':
      const direction = piece.color === 'w' ? -1 : 1;
      const startRow = piece.color === 'w' ? 6 : 1;
      if (to.col === from.col) {
        if (to.row === from.row + direction && !target) return true;
        if (from.row === startRow && to.row === from.row + 2 * direction && !target && !board[from.row + direction][from.col]) return true;
      } else if (dx === 1 && to.row === from.row + direction && target) {
        return true;
      }
      return false;
    case 'r': 
      if (dx !== 0 && dy !== 0) return false;
      return isPathClear(board, from, to);
    case 'n': 
      return (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
    case 'b': 
      if (dx !== dy) return false;
      return isPathClear(board, from, to);
    case 'q': 
      if (dx !== dy && dx !== 0 && dy !== 0) return false;
      return isPathClear(board, from, to);
    case 'k': 
      return dx <= 1 && dy <= 1;
    default: return false;
  }
};

const isPathClear = (board: Board, from: Position, to: Position): boolean => {
  const stepRow = to.row > from.row ? 1 : to.row < from.row ? -1 : 0;
  const stepCol = to.col > from.col ? 1 : to.col < from.col ? -1 : 0;
  let currRow = from.row + stepRow;
  let currCol = from.col + stepCol;
  while (currRow !== to.row || currCol !== to.col) {
    if (board[currRow][currCol]) return false;
    currRow += stepRow;
    currCol += stepCol;
  }
  return true;
};

export const findKing = (board: Board, color: Color): Position => {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece?.type === 'k' && piece.color === color) return { row: r, col: c };
    }
  }
  return { row: -1, col: -1 };
};

export const isCheck = (board: Board, color: Color): boolean => {
  const kingPos = findKing(board, color);
  if (kingPos.row === -1) return false;
  const opponentColor = color === 'w' ? 'b' : 'w';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.color === opponentColor) {
        if (isPseudoLegalMove(board, { from: { row: r, col: c }, to: kingPos, piece })) return true;
      }
    }
  }
  return false;
};

export const isValidMove = (board: Board, move: Move): boolean => {
  if (!isPseudoLegalMove(board, move)) return false;
  const simulatedBoard = makeMove(board, move);
  return !isCheck(simulatedBoard, move.piece.color);
};

export const makeMove = (board: Board, move: Move): Board => {
  const newBoard = board.map(row => [...row]);
  let pieceToPlace = { ...move.piece };
  if (move.promotion) {
    pieceToPlace.type = move.promotion;
  }
  newBoard[move.to.row][move.to.col] = pieceToPlace;
  newBoard[move.from.row][move.from.col] = null;
  return newBoard;
};

export const getGameState = (board: Board, turn: Color): 'playing' | 'checkmate' | 'stalemate' => {
  let hasLegalMoves = false;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.color === turn) {
        for (let tr = 0; tr < 8; tr++) {
          for (let tc = 0; tc < 8; tc++) {
            if (isValidMove(board, { from: { row: r, col: c }, to: { row: tr, col: tc }, piece })) {
              hasLegalMoves = true;
              break;
            }
          }
          if (hasLegalMoves) break;
        }
      }
      if (hasLegalMoves) break;
    }
  }

  if (!hasLegalMoves) {
    return isCheck(board, turn) ? 'checkmate' : 'stalemate';
  }
  return 'playing';
};

// IA Básica: Avaliação de Material
const pieceValues: Record<PieceType, number> = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 900 };

export const getBestMove = (board: Board, color: Color): Move | null => {
  const possibleMoves: Move[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.color === color) {
        for (let tr = 0; tr < 8; tr++) {
          for (let tc = 0; tc < 8; tc++) {
            const move = { from: { row: r, col: c }, to: { row: tr, col: tc }, piece };
            if (isValidMove(board, move)) possibleMoves.push(move);
          }
        }
      }
    }
  }

  if (possibleMoves.length === 0) return null;

  // IA Simples: Escolhe o movimento que captura a peça mais valiosa ou um aleatório
  return possibleMoves.sort((a, b) => {
    const valA = board[a.to.row][a.to.col] ? pieceValues[board[a.to.row][a.to.col]!.type] : 0;
    const valB = board[b.to.row][b.to.col] ? pieceValues[board[b.to.row][b.to.col]!.type] : 0;
    return valB - valA;
  })[0];
};
