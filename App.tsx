
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

  const boardRef = useRef<Board>(board);
  const historyRef = useRef<Move[]>(history);
  const turnRef = useRef<Color>(turn);

  const [currentUser] = useState<User>(() => ({
    ...DEFAULT_USER,
    id: `u_${Math.random().toString(36).substr(2, 5)}`,
    name: `Player_${Math.floor(Math.random() * 9000) + 1000}`,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`
  }));

  useEffect(() => {
    boardRef.current = board;
    historyRef.current = history;
    turnRef.current = turn;
  }, [board, history, turn]);

  // Sincronização Firebase Melhorada
  const setupGameListeners = (roomId: string) => {
    const roomRef = db.ref(`rooms/${roomId}`);
    
    // Escuta estado geral da partida
    roomRef.on('value', (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      // Sincroniza movimentos
      if (data.moves) {
        const remoteMoves = Object.values(data.moves) as any[];
        if (remoteMoves.length > historyRef.current.length) {
          const lastRemote = remoteMoves[remoteMoves.length - 1];
          const newBoard = makeMove(boardRef.current, lastRemote.move);
          setBoard(newBoard);
          setHistory(remoteMoves.map(m => m.move));
          setTurn(lastRemote.nextTurn);
          
          const state = getGameState(newBoard, lastRemote.nextTurn);
          if (state === 'checkmate') setGameOver(`Xeque-mate! Vitória das ${lastRemote.move.piece.color === 'w' ? 'Brancas' : 'Pretas'}`);
          else if (state === 'stalemate') setGameOver('Empate por afogamento.');
        }
      }

      if (data.status === 'resigned' && !gameOver) {
        setGameOver('Partida encerrada: O oponente desistiu.');
      }
    });

    roomRef.child('messages').on('child_added', (snap) => {
      setMessages(prev => {
        const msg = snap.val();
        if (prev.find(m => m.timestamp === msg.timestamp)) return prev;
        return [...prev, msg];
      });
    });
  };

  const startAIMove = useCallback(() => {
    if (gameOver || turn !== 'b') return;
    setTimeout(() => {
      const move = getBestMove(boardRef.current, 'b');
      if (move) {
        const newBoard = makeMove(boardRef.current, move);
        setBoard(newBoard);
        setTurn('w');
        setHistory(prev => [...prev, move]);
        const state = getGameState(newBoard, 'w');
        if (state === 'checkmate') setGameOver('Você perdeu! Xeque-mate da IA.');
      }
    }, 600);
  }, [gameOver, turn]);

  useEffect(() => {
    if (gameMode === GameMode.AI && turn === 'b') {
      startAIMove();
    }
  }, [turn, gameMode, startAIMove]);

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

  const joinRoom = (roomId: string) => {
    const roomRef = db.ref(`rooms/${roomId}`);
    roomRef.once('value', (snap) => {
      const data = snap.val();
      if (!data) return;
      
      setOnlineRoom(roomId);
      setGameMode(GameMode.ONLINE);
      setPlayerColor('b');
      setIsWaiting(false);
      setOpponent(data.playerA);
      
      roomRef.child('playerB').set(currentUser);
      roomRef.child('status').set('playing');
      setupGameListeners(roomId);
    });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) joinRoom(room);
  }, []);

  const handleMove = useCallback((move: Move) => {
    if (gameOver) return;
    if (gameMode === GameMode.ONLINE && turn !== playerColor) return;

    if (gameMode === GameMode.ONLINE && onlineRoom) {
      const nextIdx = historyRef.current.length;
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
      
      const state = getGameState(newBoard, nextTurn);
      if (state === 'checkmate') setGameOver('Xeque-mate!');
      else if (state === 'stalemate') setGameOver('Empate!');
    }
  }, [board, turn, gameMode, playerColor, onlineRoom, gameOver]);

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
    setGameOver('Você desistiu da partida.');
  };

  useEffect(() => {
    if (gameOver || isWaiting) return;
    const timer = setInterval(() => {
      setTimers(prev => ({ ...prev, [turn]: Math.max(0, prev[turn] - 1) }));
    }, 1000);
    return () => clearInterval(timer);
  }, [turn, gameOver, isWaiting]);

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-[#312e2b]">
      <Sidebar user={currentUser} />
      <main className="flex-1 flex flex-col items-center justify-center p-4 overflow-y-auto custom-scrollbar">
        <div className="flex flex-col lg:flex-row gap-6 w-full max-w-6xl items-center lg:items-start py-8">
          
          <div className="flex flex-col w-full max-w-[560px]">
            {/* Oponente UI */}
            <div className="flex justify-between items-center mb-2 bg-[#262421] p-3 rounded-t-lg border-b border-white/5">
              <div className="flex items-center gap-3">
                <img src={opponent?.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=robot'} className="w-10 h-10 rounded bg-[#3c3a37] border border-white/10" />
                <div>
                  <div className="font-bold text-sm">{opponent?.name || (gameMode === GameMode.AI ? 'Stockfish Lite (IA)' : 'Aguardando...')}</div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold">Rating 1200</div>
                </div>
              </div>
              <div className={`px-4 py-1 rounded font-mono text-2xl transition-all duration-300 ${turn !== playerColor && !gameOver ? 'bg-white text-black scale-105 shadow-lg' : 'text-gray-500 bg-[#1a1917]'}`}>
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

            {/* Player UI */}
            <div className="flex justify-between items-center mt-2 bg-[#262421] p-3 rounded-b-lg border-t border-white/5">
              <div className="flex items-center gap-3">
                <img src={currentUser.avatar} className="w-10 h-10 rounded bg-[#3c3a37] border border-white/10" />
                <div>
                  <div className="font-bold text-sm">{currentUser.name} (Você)</div>
                  <div className="text-[10px] text-[#81b64c] uppercase font-bold">Rating {currentUser.elo}</div>
                </div>
              </div>
              <div className={`px-4 py-1 rounded font-mono text-2xl transition-all duration-300 ${turn === playerColor && !gameOver ? 'bg-white text-black scale-105 shadow-lg' : 'text-gray-500 bg-[#1a1917]'}`}>
                {Math.floor(timers[playerColor] / 60)}:{(timers[playerColor] % 60).toString().padStart(2, '0')}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[380px] flex flex-col gap-4">
            <div className="h-[500px]">
              <GameControls 
                history={history} 
                onUndo={() => {}} 
                onResign={handleResign} 
                turn={turn}
                whiteTimer={timers.w} blackTimer={timers.b} 
                gameMode={gameMode} messages={messages} onSendMessage={handleSendMessage}
              />
            </div>
            
            <div className="grid grid-cols-1 gap-2">
              {!onlineRoom && gameMode === GameMode.LOCAL && (
                <>
                  <button onClick={createOnlineGame} className="w-full bg-[#81b64c] hover:bg-[#95c562] py-4 rounded font-bold text-white shadow-[0_4px_0_rgb(69,101,40)] transition-all active:translate-y-1 active:shadow-none">
                    <i className="fas fa-globe mr-2"></i> JOGAR ONLINE
                  </button>
                  <button onClick={() => setGameMode(GameMode.AI)} className="w-full bg-[#3c3a37] hover:bg-[#4a4844] py-4 rounded font-bold text-white border border-white/5 transition-all">
                    <i className="fas fa-robot mr-2"></i> CONTRA IA
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {isWaiting && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[50]">
          <div className="bg-[#262421] p-8 rounded-xl text-center max-w-sm border border-white/10 shadow-2xl">
            <div className="w-16 h-16 border-4 border-[#81b64c] border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <h2 className="text-xl font-bold mb-4">Aguardando Oponente</h2>
            <p className="text-gray-400 text-sm mb-6">Compartilhe o link para começar a partida:</p>
            <div className="bg-[#1a1917] p-3 rounded mb-6 flex items-center border border-white/5">
              <input readOnly value={`${window.location.origin}/?room=${onlineRoom}`} className="bg-transparent text-[10px] flex-1 outline-none text-[#81b64c] font-mono" />
              <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/?room=${onlineRoom}`); alert('Link copiado!'); }} className="ml-2 text-xs bg-[#3c3a37] hover:bg-[#4a4844] px-3 py-1 rounded transition-colors">Copiar</button>
            </div>
            <button onClick={() => window.location.href = '/'} className="text-xs uppercase font-bold text-red-500 hover:underline">Cancelar Desafio</button>
          </div>
        </div>
      )}

      {gameOver && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] animate-in fade-in duration-500">
          <div className="bg-[#262421] p-10 rounded-2xl text-center border border-white/10 shadow-2xl max-w-md">
            <i className="fas fa-trophy text-6xl text-yellow-500 mb-6 block"></i>
            <h2 className="text-3xl font-bold mb-4">Fim de Jogo</h2>
            <p className="text-gray-400 text-lg mb-8 leading-relaxed">{gameOver}</p>
            <div className="flex flex-col gap-3">
               <button onClick={() => window.location.href = '/'} className="bg-[#81b64c] hover:bg-[#95c562] px-10 py-4 rounded-xl font-bold text-white shadow-[0_4px_0_rgb(69,101,40)] transition-all">
                NOVA PARTIDA
              </button>
              <button onClick={() => setGameOver(null)} className="text-gray-500 text-sm font-bold hover:text-white transition-colors">VER TABULEIRO</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
