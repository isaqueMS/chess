
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
      // Se clicar na mesma peça, desseleciona
      if (selected.row === row && selected.col === col) {
        setSelected(null);
        return;
      }

      const selectedPiece = board[selected.row][selected.col];
      
      // Se clicar em outra peça da mesma cor, muda a seleção
      if (piece && piece.color === turn) {
        setSelected({ row, col });
        return;
      }

      // Tenta realizar o movimento
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

    // Seleciona a peça se for o turno correto
    if (piece && piece.color === turn) {
      setSelected({ row, col });
    } else {
      setSelected(null);
    }
  };

  const kingInCheck = isCheck(board, turn) ? findKing(board, turn) : null;

  // Lógica de renderização das linhas e colunas
  const rows = [0, 1, 2, 3, 4, 5, 6, 7];
  const cols = [0, 1, 2, 3, 4, 5, 6, 7];
  
  const displayRows = isFlipped ? [...rows].reverse() : rows;
  const displayCols = isFlipped ? [...cols].reverse() : cols;

  return (
    <div className="aspect-square w-full max-w-[600px] bg-[#262421] rounded shadow-2xl overflow-hidden border-8 border-[#262421] relative select-none">
      <div className="chess-board-grid w-full h-full">
        {displayRows.map((r) => (
          displayCols.map((c) => {
            const piece = board[r][c];
            const isLight = (r + c) % 2 === 0;
            const isSelected = selected?.row === r && selected?.col === c;
            const isKingInCheck = kingInCheck?.row === r && kingInCheck?.col === c;
            
            // Verifica se este quadrado é um destino válido para a peça selecionada
            const isMoveHint = selected && !piece && isValidMove(board, { 
              from: selected, 
              to: { row: r, col: c }, 
              piece: board[selected.row][selected.col]! 
            });

            const isCaptureHint = selected && piece && piece.color !== turn && isValidMove(board, { 
              from: selected, 
              to: { row: r, col: c }, 
              piece: board[selected.row][selected.col]! 
            });

            return (
              <div 
                key={`${r}-${c}`}
                onClick={() => handleSquareClick(r, c)}
                className={`relative flex items-center justify-center cursor-pointer transition-colors duration-150
                  ${isLight ? 'square-light' : 'square-dark'}
                  ${isSelected ? 'bg-[#f6f669cc] !important' : ''}
                  ${isKingInCheck ? 'bg-red-500/80 shadow-[inset_0_0_20px_rgba(255,0,0,0.5)]' : ''}
                `}
              >
                {/* Notação de Coordenadas */}
                {(isFlipped ? c === 7 : c === 0) && (
                  <span className={`absolute top-0.5 left-1 text-[10px] font-bold ${isLight ? 'text-[#779556]' : 'text-[#ebecd0]'}`}>
                    {8 - r}
                  </span>
                )}
                {(isFlipped ? r === 0 : r === 7) && (
                  <span className={`absolute bottom-0.5 right-1 text-[10px] font-bold ${isLight ? 'text-[#779556]' : 'text-[#ebecd0]'}`}>
                    {String.fromCharCode(97 + c)}
                  </span>
                )}

                {/* Destaque de Seleção customizado (overlay para não matar a cor do quadrado) */}
                {isSelected && <div className="absolute inset-0 bg-yellow-400/30"></div>}

                {/* Peça */}
                {piece && (
                  <img 
                    src={PIECE_IMAGES[`${piece.color}-${piece.type}`]} 
                    alt={`${piece.color} ${piece.type}`}
                    className="w-[90%] h-[90%] piece-shadow z-10 transition-transform active:scale-95"
                    draggable={false}
                  />
                )}

                {/* Sugestões de Movimento */}
                {isMoveHint && (
                  <div className="w-4 h-4 rounded-full bg-black/10 z-0"></div>
                )}
                {isCaptureHint && (
                  <div className="absolute inset-0 border-[6px] border-black/5 rounded-full scale-90 z-0"></div>
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
