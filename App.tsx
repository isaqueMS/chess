
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChessBoard from './components/ChessBoard';
import GameControls from './components/GameControls';
import { Board, Move, Color, GameMode, User } from './types';
import { createInitialBoard, makeMove, getGameState, getBestMove } from './services/chessLogic';
import { db } from './services/firebase';
import { DEFAULT_USER } from './constants';

const App: React.FC = () => {
  const [board, setBoard] = useState<Board>(createInitialBoard());
  const [turn, setTurn] = useState<Color>('w');
  const [history, setHistory] = useState<Move[]>([]);
  const [timers, setTimers] = useState({ w: 600, b: 600 });
  const [gameOver, setGameOver] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.LOCAL);
  
  const [onlineRoom, setOnlineRoom] = useState<string | null>(null);
  const [playerColor, setPlayerColor] = useState<Color>('w');
  const [isWaiting, setIsWaiting] = useState(false);
  const [messages, setMessages] = useState<{user: string, text: string}[]>([]);
  const [opponent, setOpponent] = useState<User | null>(null);

  // Refs para evitar closures obsoletos em callbacks do Firebase
  const historyLenRef = useRef(0);

  const [currentUser] = useState<User>(() => ({
    ...DEFAULT_USER,
    id: `u_${Math.random().toString(36).substr(2, 5)}`,
    name: `Player_${Math.floor(Math.random() * 9000) + 1000}`,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`
  }));

  // Sincronização Online
  useEffect(() => {
    if (!onlineRoom) return;

    const roomRef = db.ref(`rooms/${onlineRoom}`);
    
    const handleData = (snapshot: any) => {
      const data = snapshot.val();
      if (!data) return;

      if (data.moves) {
        const movesArray = Object.values(data.moves) as any[];
        // Só atualiza se o número de movimentos for diferente do local
        if (movesArray.length !== historyLenRef.current) {
          let tempBoard = createInitialBoard();
          movesArray.forEach((m: any) => {
            tempBoard = makeMove(tempBoard, m.move);
          });
          
          setBoard(tempBoard);
          setHistory(movesArray.map(m => m.move));
          setTurn(movesArray[movesArray.length - 1].nextTurn);
          historyLenRef.current = movesArray.length;

          const lastMove = movesArray[movesArray.length - 1];
          const state = getGameState(tempBoard, lastMove.nextTurn);
          if (state === 'checkmate') setGameOver(`Xeque-mate!`);
        }
      }

      if (data.status === 'resigned') setGameOver('O oponente desistiu.');
      if (data.playerB && !opponent) setOpponent(data.playerB);
    };

    roomRef.on('value', handleData);
    return () => roomRef.off('value', handleData);
  }, [onlineRoom, opponent]);

  // Lógica de Movimento
  const handleMove = useCallback((move: Move) => {
    if (gameOver) return;
    if (gameMode === GameMode.ONLINE && turn !== playerColor) return;

    if (gameMode === GameMode.ONLINE && onlineRoom) {
      const nextIdx = history.length;
      db.ref(`rooms/${onlineRoom}/moves/${nextIdx}`).set({
        move,
        nextTurn: turn === 'w' ? 'b' : 'w',
        timestamp: Date.now()
      });
    } else {
      const newBoard = makeMove(board, move);
      const nextTurn = turn === 'w' ? 'b' : 'w';
      setBoard(newBoard);
      setTurn(nextTurn);
      setHistory(prev => [...prev, move]);
      historyLenRef.current += 1;
      
      const state = getGameState(newBoard, nextTurn);
      if (state === 'checkmate') setGameOver('Xeque-mate!');
    }
  }, [board, turn, gameMode, playerColor, onlineRoom, gameOver, history.length]);

  // IA Move
  useEffect(() => {
    if (gameMode === GameMode.AI && turn === 'b' && !gameOver) {
      const timer = setTimeout(() => {
        const move = getBestMove(board, 'b');
        if (move) handleMove(move);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [turn, gameMode, board, gameOver, handleMove]);

  const createOnlineGame = () => {
    const id = Math.random().toString(36).substring(2, 8);
    setOnlineRoom(id);
    setGameMode(GameMode.ONLINE);
    setPlayerColor('w');
    setIsWaiting(true);
    db.ref(`rooms/${id}`).set({
      id,
      status: 'waiting',
      playerA: currentUser,
      createdAt: Date.now()
    });
  };

  const handleResign = () => {
    if (onlineRoom) db.ref(`rooms/${onlineRoom}/status`).set('resigned');
    setGameOver('Você desistiu.');
  };

  // Timer principal
  useEffect(() => {
    if (gameOver || isWaiting) return;
    const interval = setInterval(() => {
      setTimers(prev => ({ ...prev, [turn]: Math.max(0, prev[turn] - 1) }));
    }, 1000);
    return () => clearInterval(interval);
  }, [turn, gameOver, isWaiting]);

  return (
    <div className="flex h-screen bg-[#312e2b] text-white overflow-hidden">
      <Sidebar user={currentUser} />
      
      <main className="flex-1 flex flex-col items-center justify-center p-4 relative">
        <div className="flex flex-col lg:flex-row gap-8 w-full max-w-6xl">
          
          {/* Lado Esquerdo: Tabuleiro */}
          <div className="flex-1 flex flex-col items-center">
            <div className="w-full max-w-[600px] mb-2 flex justify-between items-center px-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#262421] rounded flex items-center justify-center">
                  <i className="fas fa-robot text-gray-500"></i>
                </div>
                <span className="font-bold text-sm">{opponent?.name || (gameMode === GameMode.AI ? 'Computador' : 'Oponente')}</span>
              </div>
              <div className={`px-3 py-1 rounded font-mono text-xl ${turn !== playerColor ? 'bg-white text-black' : 'bg-[#262421] text-gray-400'}`}>
                {Math.floor(timers[playerColor === 'w' ? 'b' : 'w'] / 60)}:{(timers[playerColor === 'w' ? 'b' : 'w'] % 60).toString().padStart(2, '0')}
              </div>
            </div>

            <ChessBoard 
              board={board} 
              onMove={handleMove} 
              turn={turn} 
              isFlipped={playerColor === 'b'}
              lastMove={history.length > 0 ? history[history.length - 1] : null}
            />

            <div className="w-full max-w-[600px] mt-2 flex justify-between items-center px-2">
              <div className="flex items-center gap-2">
                <img src={currentUser.avatar} className="w-8 h-8 rounded" />
                <span className="font-bold text-sm">{currentUser.name}</span>
              </div>
              <div className={`px-3 py-1 rounded font-mono text-xl ${turn === playerColor ? 'bg-white text-black' : 'bg-[#262421] text-gray-400'}`}>
                {Math.floor(timers[playerColor] / 60)}:{(timers[playerColor] % 60).toString().padStart(2, '0')}
              </div>
            </div>
          </div>

          {/* Lado Direito: Controles */}
          <div className="w-full lg:w-[360px] flex flex-col gap-4">
            <GameControls 
              history={history} 
              onUndo={() => {}} 
              onResign={handleResign} 
              turn={turn}
              whiteTimer={timers.w} blackTimer={timers.b} 
              gameMode={gameMode}
            />
            
            {gameMode === GameMode.LOCAL && !onlineRoom && (
              <div className="grid grid-cols-1 gap-3">
                <button onClick={createOnlineGame} className="bg-[#81b64c] hover:bg-[#95c562] py-4 rounded-lg font-bold text-xl shadow-[0_4px_0_rgb(69,101,40)] transition-all">
                  JOGAR ONLINE
                </button>
                <button onClick={() => setGameMode(GameMode.AI)} className="bg-[#3c3a37] hover:bg-[#4a4844] py-4 rounded-lg font-bold transition-all">
                  CONTRA COMPUTADOR
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modais de Estado */}
        {isWaiting && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#262421] p-8 rounded-xl border border-white/10 text-center max-w-sm">
              <div className="animate-spin text-4xl text-[#81b64c] mb-4"><i className="fas fa-circle-notch"></i></div>
              <h2 className="text-xl font-bold mb-4">Aguardando oponente...</h2>
              <p className="text-xs text-gray-400 mb-4">Envie este código: <span className="text-[#81b64c] font-mono font-bold select-all">{onlineRoom}</span></p>
              <button onClick={() => window.location.reload()} className="text-red-500 font-bold text-xs uppercase">Cancelar</button>
            </div>
          </div>
        )}

        {gameOver && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-[#262421] p-8 rounded-2xl border border-white/10 text-center shadow-2xl">
              <h2 className="text-3xl font-bold mb-2">Fim de Jogo</h2>
              <p className="text-gray-400 mb-6">{gameOver}</p>
              <button onClick={() => window.location.reload()} className="bg-[#81b64c] px-8 py-3 rounded-lg font-bold text-white shadow-[0_4px_0_rgb(69,101,40)]">NOVA PARTIDA</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
