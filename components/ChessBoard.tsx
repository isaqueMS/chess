
import React, { useState } from 'react';
import { Board, Position, Move } from '../types';
import { PIECE_IMAGES } from '../constants';
import { isValidMove, isCheck, findKing } from '../services/chessLogic';

interface ChessBoardProps {
  board: Board;
  onMove: (move: Move) => void;
  turn: 'w' | 'b';
  isFlipped?: boolean;
}

const ChessBoard: React.FC<ChessBoardProps> = ({ board, onMove, turn, isFlipped = false }) => {
  const [selected, setSelected] = useState<Position | null>(null);

  const handleSquareClick = (row: number, col: number) => {
    const piece = board[row][col];

    if (selected) {
      if (selected.row === row && selected.col === col) {
        setSelected(null);
        return;
      }

      const selectedPiece = board[selected.row][selected.col];
      if (selectedPiece && selectedPiece.color === turn) {
        const move: Move = {
          from: selected,
          to: { row, col },
          piece: selectedPiece,
          captured: piece || undefined
        };

        if (isValidMove(board, move)) {
          onMove(move);
          setSelected(null);
          return;
        }
      }
    }

    if (piece && piece.color === turn) {
      setSelected({ row, col });
    } else {
      setSelected(null);
    }
  };

  const kingInCheck = isCheck(board, turn) ? findKing(board, turn) : null;

  // Lógica de inversão: se isFlipped, as linhas vão de 7 a 0 e colunas de 7 a 0
  const rowIndices = isFlipped ? [0, 1, 2, 3, 4, 5, 6, 7].reverse() : [0, 1, 2, 3, 4, 5, 6, 7];
  const colIndices = isFlipped ? [0, 1, 2, 3, 4, 5, 6, 7].reverse() : [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="aspect-square w-full max-w-[600px] bg-[#262421] rounded shadow-2xl overflow-hidden border-8 border-[#262421] relative">
      <div className="chess-board-grid w-full h-full">
        {rowIndices.map((rIdx) => (
          colIndices.map((cIdx) => {
            const piece = board[rIdx][cIdx];
            const isLight = (rIdx + cIdx) % 2 === 0;
            const isSelected = selected?.row === rIdx && selected?.col === cIdx;
            const isKingInCheck = kingInCheck?.row === rIdx && kingInCheck?.col === cIdx;
            
            return (
              <div 
                key={`${rIdx}-${cIdx}`}
                onClick={() => handleSquareClick(rIdx, cIdx)}
                className={`relative flex items-center justify-center cursor-pointer transition-colors duration-200
                  ${isLight ? 'square-light' : 'square-dark'}
                  ${isSelected ? 'ring-inset ring-4 ring-[#f6f669]' : ''}
                  ${isKingInCheck ? 'bg-red-500/80 shadow-[inset_0_0_20px_rgba(255,0,0,0.5)]' : ''}
                `}
              >
                {/* Board Notation - Adjusting for flip */}
                {(isFlipped ? cIdx === 7 : cIdx === 0) && (
                  <span className={`absolute top-0.5 left-1 text-[10px] font-bold select-none ${isLight ? 'text-[#779556]' : 'text-[#ebecd0]'}`}>
                    {8 - rIdx}
                  </span>
                )}
                {(isFlipped ? rIdx === 0 : rIdx === 7) && (
                  <span className={`absolute bottom-0.5 right-1 text-[10px] font-bold select-none ${isLight ? 'text-[#779556]' : 'text-[#ebecd0]'}`}>
                    {String.fromCharCode(97 + cIdx)}
                  </span>
                )}

                {/* Piece */}
                {piece && (
                  <img 
                    src={PIECE_IMAGES[`${piece.color}-${piece.type}`]} 
                    alt={`${piece.color} ${piece.type}`}
                    className={`w-[85%] h-[85%] piece-shadow select-none transition-transform duration-200 active:scale-90 ${isKingInCheck ? 'animate-bounce' : ''}`}
                    draggable={false}
                  />
                )}

                {/* Move Hints */}
                {selected && !piece && isValidMove(board, { from: selected, to: { row: rIdx, col: cIdx }, piece: board[selected.row][selected.col]! }) && (
                  <div className="w-4 h-4 rounded-full bg-black/15"></div>
                )}
                {selected && piece && piece.color !== turn && isValidMove(board, { from: selected, to: { row: rIdx, col: cIdx }, piece: board[selected.row][selected.col]! }) && (
                  <div className="absolute inset-0 border-[6px] border-black/10 rounded-full scale-90"></div>
                )}
              </div>
            );
          })
        ))}
      </div>
    </div>
  );
};

export default ChessBoard;
