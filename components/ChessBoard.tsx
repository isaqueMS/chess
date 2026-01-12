
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

  const handleSquareClick = (r: number, c: number) => {
    const piece = board[r][c];

    if (selected) {
      if (selected.row === r && selected.col === c) {
        setSelected(null);
        return;
      }

      const selectedPiece = board[selected.row][selected.col];
      
      // Se clicar em peça da mesma cor, muda a seleção
      if (piece && piece.color === turn) {
        setSelected({ row: r, col: c });
        return;
      }

      // Tenta mover
      if (selectedPiece && selectedPiece.color === turn) {
        const move: Move = {
          from: selected,
          to: { row: r, col: c },
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

    // Primeira seleção
    if (piece && piece.color === turn) {
      setSelected({ row: r, col: c });
    }
  };

  const kingInCheck = isCheck(board, turn) ? findKing(board, turn) : null;

  // Grid Rendering
  const indices = [0, 1, 2, 3, 4, 5, 6, 7];
  const rows = isFlipped ? [...indices].reverse() : indices;
  const cols = isFlipped ? [...indices].reverse() : indices;

  return (
    <div className="aspect-square w-full max-w-[600px] bg-[#262421] rounded shadow-2xl overflow-hidden border-4 border-[#262421] relative select-none">
      <div className="chess-board-grid w-full h-full">
        {rows.map((r) => (
          cols.map((c) => {
            const piece = board[r][c];
            const isLight = (r + c) % 2 === 0;
            const isSelected = selected?.row === r && selected?.col === c;
            const isKingInCheck = kingInCheck?.row === r && kingInCheck?.col === c;
            
            // Dicas de movimento
            const isMoveHint = selected && !piece && isValidMove(board, { 
              from: selected, to: { row: r, col: c }, piece: board[selected.row][selected.col]! 
            });
            const isCaptureHint = selected && piece && piece.color !== turn && isValidMove(board, { 
              from: selected, to: { row: r, col: c }, piece: board[selected.row][selected.col]! 
            });

            return (
              <div 
                key={`${r}-${c}`}
                onClick={() => handleSquareClick(r, c)}
                className={`relative flex items-center justify-center cursor-pointer
                  ${isLight ? 'square-light' : 'square-dark'}
                  ${isSelected ? 'bg-[#f6f669cc]' : ''}
                `}
              >
                {/* Coordenadas */}
                {(isFlipped ? c === 7 : c === 0) && (
                  <span className={`absolute top-0.5 left-1 text-[8px] font-bold ${isLight ? 'text-[#779556]' : 'text-[#ebecd0]'}`}>
                    {8 - r}
                  </span>
                )}
                {(isFlipped ? r === 0 : r === 7) && (
                  <span className={`absolute bottom-0.5 right-1 text-[8px] font-bold ${isLight ? 'text-[#779556]' : 'text-[#ebecd0]'}`}>
                    {String.fromCharCode(97 + c)}
                  </span>
                )}

                {/* Peça */}
                {piece && (
                  <img 
                    src={PIECE_IMAGES[`${piece.color}-${piece.type}`]} 
                    className={`w-[85%] h-[85%] z-10 ${isKingInCheck ? 'bg-red-500/50 rounded-full' : ''}`}
                    draggable={false}
                  />
                )}

                {/* Hints */}
                {isMoveHint && <div className="w-3 h-3 rounded-full bg-black/10 z-0"></div>}
                {isCaptureHint && <div className="absolute inset-0 border-4 border-black/5 rounded-full scale-75"></div>}
              </div>
            );
          })
        ))}
      </div>
    </div>
  );
};

export default ChessBoard;
