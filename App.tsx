
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChessBoard from './components/ChessBoard';
import GameControls from './components/GameControls';
import { Board, Move, Color, GameMode, User } from './types';
import { createInitialBoard, makeMove, getGameState } from './services/chessLogic';
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

  const lastProcessedMoveIndex = useRef(-1);

  const [currentUser] = useState<User>({
    ...DEFAULT_USER,
    id: `user_${Math.floor(Math.random() * 1000)}`,
    name: `Jogador_${Math.floor(Math.random() * 9000) + 1000}`,
    elo: 1200 + Math.floor(Math.random() * 200)
  });

  useEffect(() => {
    db.ref(`users/${currentUser.id}`).set(currentUser);
  }, [currentUser]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    if (roomId) joinRoom(roomId);
  }, []);

  const joinRoom = async (roomId: string) => {
    setOnlineRoom(roomId);
    setGameMode(GameMode.ONLINE);
    setPlayerColor('b');
    setIsWaiting(false);

    const roomRef = db.ref(`rooms/${roomId}`);
    roomRef.child('playerB').set(currentUser);
    roomRef.child('status').set('playing');
    roomRef.child('playerA').on('value', (snap) => setOpponent(snap.val()));

    setupGameListeners(roomId);
  };

  const createOnlineGame = () => {
    const id = Math.random().toString(36).substring(2, 9);
    setOnlineRoom(id);
    setGameMode(GameMode.ONLINE);
    setPlayerColor('w');
    setIsWaiting(true);

    const roomRef = db.ref(`rooms/${id}`);
    roomRef.set({
      id,
      status: 'waiting',
      playerA: currentUser,
      lastTurn: 'w',
      createdAt: Date.now()
    });

    roomRef.child('playerB').on('value', (snap) => {
      if (snap.val()) {
        setOpponent(snap.val());
        setIsWaiting(false);
      }
    });

    setupGameListeners(id);
  };

  const setupGameListeners = (roomId: string) => {
    const movesRef = db.ref(`rooms/${roomId}/moves`);
    
    movesRef.on('child_added', (snapshot) => {
      const moveData = snapshot.val();
      const moveIndex = parseInt(snapshot.key || "0");

      if (moveIndex > lastProcessedMoveIndex.current) {
        setBoard(prevBoard => {
          const updatedBoard = makeMove(prevBoard, moveData.move);
          const nextTurn = moveData.nextTurn;
          
          const gameState = getGameState(updatedBoard, nextTurn);
          if (gameState === 'checkmate') {
            setGameOver(`Xeque-mate! Vitória das ${moveData.move.piece.color === 'w' ? 'Brancas' : 'Pretas'}`);
          }
          return updatedBoard;
        });

        setHistory(prev => {
          if (prev.length <= moveIndex) {
             return [...prev, moveData.move];
          }
          return prev;
        });
        setTurn(moveData.nextTurn);
        lastProcessedMoveIndex.current = moveIndex;
      }
    });

    db.ref(`rooms/${roomId}/messages`).on('value', (snap) => {
      if (snap.val()) setMessages(Object.values(snap.val()));
    });

    db.ref(`rooms/${roomId}/status`).on('value', (snap) => {
      if (snap.val() === 'resigned' && !gameOver) {
        setGameOver('O oponente abandonou a partida.');
      }
    });
  };

  const handleMove = useCallback((move: Move) => {
    if (gameOver || isWaiting) return;
    if (gameMode === GameMode.ONLINE && turn !== playerColor) return;

    // Movimento Local Imediato (Optimistic)
    const newBoard = makeMove(board, move);
    const nextTurn = turn === 'w' ? 'b' : 'w';
    
    setBoard(newBoard);
    setHistory(prev => [...prev, move]);
    setTurn(nextTurn);

    if (gameMode === GameMode.ONLINE && onlineRoom) {
      const nextIdx = history.length;
      db.ref(`rooms/${onlineRoom}/moves/${nextIdx}`).set({
        move,
        nextTurn: nextTurn,
        timestamp: Date.now()
      });
    } else {
      const state = getGameState(newBoard, nextTurn);
      if (state === 'checkmate') setGameOver(`Xeque-mate! Vitória das ${turn === 'w' ? 'Brancas' : 'Pretas'}`);
      if (state === 'stalemate') setGameOver(`Empate por afogamento.`);
    }
  }, [gameOver, turn, gameMode, playerColor, board, history, onlineRoom, isWaiting]);

  const handleSendMessage = (text: string) => {
    if (!onlineRoom) return;
    db.ref(`rooms/${onlineRoom}/messages`).push({
      user: currentUser.name,
      text,
      timestamp: Date.now()
    });
  };

  const handleResign = () => {
    if (onlineRoom) db.ref(`rooms/${onlineRoom}/status`).set('resigned');
    setGameOver('Você abandonou a partida.');
  };

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-[#312e2b]">
      <Sidebar user={currentUser} />
      
      <main className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4 lg:p-8 space-y-6 lg:space-y-0 lg:flex-row lg:space-x-8">
        <div className="flex flex-col items-center w-full max-w-[600px]">
          {/* Oponente */}
          <div className="w-full flex justify-between items-center mb-4 bg-[#262421] p-3 rounded-lg border border-white/5">
            <div className="flex items-center space-x-3">
              <img src={opponent?.avatar || 'https://picsum.photos/seed/enemy/40'} className="w-8 h-8 rounded" />
              <div>
                <div className="text-sm font-bold text-white leading-none">{opponent?.name || (gameMode === GameMode.ONLINE ? 'Aguardando...' : 'Oponente Local')}</div>
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">ELO {opponent?.elo || '1500'}</div>
              </div>
            </div>
            <div className={`px-3 py-1 rounded font-mono text-xl ${turn === (playerColor === 'w' ? 'b' : 'w') ? 'bg-[#81b64c] text-white' : 'bg-[#1a1917] text-gray-400'}`}>
               {Math.floor((playerColor === 'w' ? timers.b : timers.w) / 60)}:{( (playerColor === 'w' ? timers.b : timers.w) % 60).toString().padStart(2, '0')}
            </div>
          </div>

          <ChessBoard 
            board={board} 
            onMove={handleMove} 
            turn={turn} 
            isFlipped={playerColor === 'b'} 
          />

          {/* Você */}
          <div className="w-full flex justify-between items-center mt-4 bg-[#262421] p-3 rounded-lg border border-white/5">
            <div className="flex items-center space-x-3">
              <img src={currentUser.avatar} className="w-8 h-8 rounded" />
              <div>
                <div className="text-sm font-bold text-white leading-none">{currentUser.name} (Você)</div>
                <div className="text-[10px] text-[#81b64c] font-bold uppercase tracking-tighter">ELO {currentUser.elo}</div>
              </div>
            </div>
            <div className={`px-3 py-1 rounded font-mono text-xl ${turn === playerColor ? 'bg-[#81b64c] text-white' : 'bg-[#1a1917] text-gray-400'}`}>
              {Math.floor((playerColor === 'w' ? timers.w : timers.b) / 60)}:{( (playerColor === 'w' ? timers.w : timers.b) % 60).toString().padStart(2, '0')}
            </div>
          </div>
        </div>

        <div className="w-full lg:w-[380px] h-[600px] flex flex-col">
          <GameControls 
            history={history} 
            onUndo={() => {}} 
            onResign={handleResign}
            turn={turn}
            whiteTimer={timers.w}
            blackTimer={timers.b}
            gameMode={gameMode}
            messages={messages}
            onSendMessage={handleSendMessage}
          />
          {!onlineRoom && (
            <button onClick={createOnlineGame} className="w-full mt-4 bg-[#81b64c] hover:bg-[#95c562] py-4 rounded-xl font-bold text-white shadow-[0_4px_0_rgb(69,101,40)] transition-all flex items-center justify-center space-x-2">
              <i className="fas fa-bolt"></i>
              <span>NOVA PARTIDA ONLINE</span>
            </button>
          )}
        </div>
      </main>

      {isWaiting && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[10000]">
          <div className="bg-[#262421] p-10 rounded-2xl border border-white/10 max-w-sm w-full text-center">
            <div className="animate-bounce mb-4 text-[#81b64c] text-5xl">
              <i className="fas fa-link"></i>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Desafiar Amigo</h2>
            <p className="text-gray-400 text-sm mb-6">Compartilhe o link para começar:</p>
            <div className="bg-[#1a1917] p-4 rounded-xl border border-white/5 flex items-center mb-8">
              <input readOnly value={`${window.location.origin}/?room=${onlineRoom}`} className="bg-transparent text-[10px] text-[#81b64c] flex-1 outline-none font-mono" />
              <button 
                onClick={() => { 
                  navigator.clipboard.writeText(`${window.location.origin}/?room=${onlineRoom}`);
                  alert('Link copiado!');
                }} 
                className="ml-2 text-gray-400 hover:text-white"
              >
                <i className="fas fa-copy"></i>
              </button>
            </div>
            <button onClick={() => window.location.href = '/'} className="text-red-400 font-bold uppercase text-xs tracking-widest hover:underline">Cancelar</button>
          </div>
        </div>
      )}

      {gameOver && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[20000]">
          <div className="bg-[#262421] p-12 rounded-3xl border border-white/10 text-center max-w-sm">
            <div className="text-yellow-500 text-6xl mb-6"><i className="fas fa-chess-king"></i></div>
            <h2 className="text-3xl font-bold text-white mb-4">Partida Encerrada</h2>
            <p className="text-gray-400 mb-10 leading-relaxed font-medium">{gameOver}</p>
            <button onClick={() => window.location.href = '/'} className="w-full bg-[#81b64c] py-4 rounded-2xl font-bold text-white shadow-[0_5px_0_rgb(69,101,40)] hover:brightness-110 active:translate-y-1 active:shadow-none transition-all">
              NOVA PARTIDA
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
