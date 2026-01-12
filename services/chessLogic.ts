
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

// Simplified move validation for basic movement patterns
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
      // Normal move
      if (to.col === from.col) {
        if (to.row === from.row + direction && !target) return true;
        if (from.row === startRow && to.row === from.row + 2 * direction && !target && !board[from.row + direction][from.col]) return true;
      } 
      // Capture
      else if (dx === 1 && to.row === from.row + direction && target) {
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
  const opponentColor = color === 'w' ? 'b' : 'w';
  
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.color === opponentColor) {
        if (isPseudoLegalMove(board, { from: { row: r, col: c }, to: kingPos, piece })) {
          return true;
        }
      }
    }
  }
  return false;
};

export const isValidMove = (board: Board, move: Move): boolean => {
  if (!isPseudoLegalMove(board, move)) return false;
  
  // Simulation: Does this move leave my King in check?
  const simulatedBoard = makeMove(board, move);
  return !isCheck(simulatedBoard, move.piece.color);
};

export const makeMove = (board: Board, move: Move): Board => {
  const newBoard = board.map(row => [...row]);
  newBoard[move.to.row][move.to.col] = move.piece;
  newBoard[move.from.row][move.from.col] = null;
  return newBoard;
};

export const getGameState = (board: Board, turn: Color): 'playing' | 'checkmate' | 'stalemate' => {
  const hasLegalMoves = board.some((row, r) => 
    row.some((piece, c) => {
      if (!piece || piece.color !== turn) return false;
      
      for (let tr = 0; tr < 8; tr++) {
        for (let tc = 0; tc < 8; tc++) {
          if (isValidMove(board, { from: { row: r, col: c }, to: { row: tr, col: tc }, piece })) {
            return true;
          }
        }
      }
      return false;
    })
  );

  if (!hasLegalMoves) {
    return isCheck(board, turn) ? 'checkmate' : 'stalemate';
  }
  return 'playing';
};
