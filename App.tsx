
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
  const [copyFeedback, setCopyFeedback] = useState(false);

  const historyLenRef = useRef(0);

  const [currentUser] = useState<User>(() => ({
    ...DEFAULT_USER,
    id: `u_${Math.random().toString(36).substr(2, 5)}`,
    name: `Player_${Math.floor(Math.random() * 9000) + 1000}`,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`
  }));

  // Função para entrar em uma sala
  const joinRoom = useCallback((roomId: string) => {
    const roomRef = db.ref(`rooms/${roomId}`);
    roomRef.once('value', (snap) => {
      const data = snap.val();
      if (!data) {
        alert("Sala não encontrada.");
        window.history.replaceState({}, document.title, "/");
        return;
      }
      
      setOnlineRoom(roomId);
      setGameMode(GameMode.ONLINE);
      setPlayerColor('b');
      setIsWaiting(false);
      setOpponent(data.playerA);
      
      roomRef.child('playerB').set(currentUser);
      roomRef.child('status').set('playing');
    });
  }, [currentUser]);

  // Verificar link de convite ao carregar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) {
      joinRoom(roomFromUrl);
    }
  }, [joinRoom]);

  // Sincronização Online
  useEffect(() => {
    if (!onlineRoom) return;

    const roomRef = db.ref(`rooms/${onlineRoom}`);
    
    const handleData = (snapshot: any) => {
      const data = snapshot.val();
      if (!data) return;

      if (data.moves) {
        const movesArray = Object.values(data.moves) as any[];
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

  const handleCopyLink = () => {
    const fullLink = `${window.location.origin}/?room=${onlineRoom}`;
    navigator.clipboard.writeText(fullLink);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const handleResign = () => {
    if (onlineRoom) db.ref(`rooms/${onlineRoom}/status`).set('resigned');
    setGameOver('Você desistiu.');
  };

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
          <div className="flex-1 flex flex-col items-center">
            <div className="w-full max-w-[600px] mb-2 flex justify-between items-center px-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#262421] rounded flex items-center justify-center text-gray-500">
                  <i className={`fas ${gameMode === GameMode.AI ? 'fa-robot' : 'fa-user'}`}></i>
                </div>
                <span className="font-bold text-sm">{opponent?.name || (gameMode === GameMode.AI ? 'Computador' : 'Aguardando...')}</span>
              </div>
              <div className={`px-3 py-1 rounded font-mono text-xl ${turn !== playerColor ? 'bg-white text-black shadow-lg scale-105' : 'bg-[#262421] text-gray-400 opacity-60'}`}>
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
                <img src={currentUser.avatar} className="w-8 h-8 rounded border border-white/10" />
                <span className="font-bold text-sm">{currentUser.name}</span>
              </div>
              <div className={`px-3 py-1 rounded font-mono text-xl ${turn === playerColor ? 'bg-white text-black shadow-lg scale-105' : 'bg-[#262421] text-gray-400 opacity-60'}`}>
                {Math.floor(timers[playerColor] / 60)}:{(timers[playerColor] % 60).toString().padStart(2, '0')}
              </div>
            </div>
          </div>

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
                <button onClick={createOnlineGame} className="bg-[#81b64c] hover:bg-[#95c562] py-4 rounded-lg font-bold text-xl shadow-[0_4px_0_rgb(69,101,40)] transition-all active:translate-y-1 active:shadow-none">
                  JOGAR ONLINE
                </button>
                <button onClick={() => setGameMode(GameMode.AI)} className="bg-[#3c3a37] hover:bg-[#4a4844] py-4 rounded-lg font-bold transition-all border border-white/5">
                  CONTRA COMPUTADOR
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modal de Espera com Link Completo */}
        {isWaiting && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-6">
            <div className="bg-[#262421] p-8 rounded-2xl border border-white/10 text-center max-w-md shadow-2xl animate-in zoom-in duration-300">
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 border-4 border-[#81b64c]/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-[#81b64c] border-t-transparent rounded-full animate-spin"></div>
                <i className="fas fa-chess-king text-3xl text-[#81b64c] absolute inset-0 flex items-center justify-center"></i>
              </div>
              
              <h2 className="text-2xl font-bold mb-2">Desafiar Amigo</h2>
              <p className="text-gray-400 text-sm mb-6">Compartilhe o link abaixo para iniciar a partida em tempo real.</p>
              
              <div className="bg-[#1a1917] p-4 rounded-xl mb-6 border border-white/5 flex flex-col gap-3">
                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest text-left px-1">Link de Convite</div>
                <div className="flex items-center gap-2">
                  <input 
                    readOnly 
                    value={`${window.location.origin}/?room=${onlineRoom}`} 
                    className="bg-transparent text-sm flex-1 outline-none text-[#81b64c] font-mono truncate" 
                  />
                  <button 
                    onClick={handleCopyLink} 
                    className={`${copyFeedback ? 'bg-[#81b64c]' : 'bg-[#3c3a37] hover:bg-[#4a4844]'} transition-all px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2`}
                  >
                    <i className={`fas ${copyFeedback ? 'fa-check' : 'fa-copy'}`}></i>
                    {copyFeedback ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>
              
              <button onClick={() => window.location.reload()} className="text-gray-500 hover:text-white font-bold text-xs uppercase tracking-widest transition-colors">
                <i className="fas fa-times mr-2"></i> Cancelar Desafio
              </button>
            </div>
          </div>
        )}

        {gameOver && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#262421] p-10 rounded-2xl border border-white/10 text-center shadow-2xl max-w-xs scale-in-center">
              <div className="text-5xl text-yellow-500 mb-4"><i className="fas fa-trophy"></i></div>
              <h2 className="text-2xl font-bold mb-2">Fim de Jogo</h2>
              <p className="text-gray-400 mb-8">{gameOver}</p>
              <button onClick={() => window.location.reload()} className="w-full bg-[#81b64c] px-8 py-4 rounded-xl font-bold text-white shadow-[0_4px_0_rgb(69,101,40)] hover:bg-[#95c562] transition-all">
                VOLTAR AO INÍCIO
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
