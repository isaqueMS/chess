
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChessBoard from './components/ChessBoard';
import GameControls from './components/GameControls';
import { Board, Move, Color, GameMode, User } from './types';
import { createInitialBoard, makeMove, getGameState, getBestMove } from './services/chessLogic';
import { db } from './services/firebase';

const App: React.FC = () => {
  const boardRef = useRef<Board>(createInitialBoard());
  const historyRef = useRef<Move[]>([]);
  
  const [board, setBoard] = useState<Board>(boardRef.current);
  const [turn, setTurn] = useState<Color>('w');
  const [history, setHistory] = useState<Move[]>([]);
  const [gameOver, setGameOver] = useState<string | null>(null);
  const [timers, setTimers] = useState({ w: 600, b: 600 });
  
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.LOCAL);
  const [onlineRoom, setOnlineRoom] = useState<string | null>(null);
  const [playerColor, setPlayerColor] = useState<Color>('w');
  const [isWaiting, setIsWaiting] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [opponent, setOpponent] = useState<User | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const lastProcessedTs = useRef<number>(0);

  // Sistema de Perfil Persistente
  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem('chess_profile');
    if (saved) return JSON.parse(saved);
    return {
      id: `u_${Math.random().toString(36).substr(2, 5)}`,
      name: 'Grandmaster',
      elo: 1200,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`
    };
  });

  useEffect(() => {
    localStorage.setItem('chess_profile', JSON.stringify(currentUser));
  }, [currentUser]);

  const updateElo = (won: boolean | null) => {
    if (won === null) return; // Empate
    setCurrentUser(prev => ({
      ...prev,
      elo: won ? prev.elo + 25 : Math.max(100, prev.elo - 20)
    }));
  };

  const applyMove = useCallback((move: Move) => {
    try {
      const newBoard = makeMove(boardRef.current, move);
      boardRef.current = newBoard;
      historyRef.current.push(move);
      setBoard([...newBoard]);
      setHistory([...historyRef.current]);
      const nextTurn = move.piece.color === 'w' ? 'b' : 'w';
      setTurn(nextTurn);

      const state = getGameState(newBoard, nextTurn);
      if (state === 'checkmate') {
        const winner = move.piece.color;
        setGameOver(`Xeque-mate! Vitória das ${winner === 'w' ? 'Brancas' : 'Pretas'}`);
        if (gameMode !== GameMode.LOCAL) updateElo(winner === playerColor);
      } else if (state === 'stalemate') {
        setGameOver('Empate por afogamento.');
      }
      return true;
    } catch (e) { return false; }
  }, [gameMode, playerColor]);

  // Firebase Sincronização
  useEffect(() => {
    if (!onlineRoom) return;
    const roomRef = db.ref(`rooms/${onlineRoom}`);
    roomRef.on('value', (snap) => {
      const data = snap.val();
      if (!data) return;
      if (playerColor === 'w' && data.playerB) setOpponent(data.playerB);
      if (playerColor === 'b' && data.playerA) setOpponent(data.playerA);
      if (data.status === 'playing') setIsWaiting(false);
      if (data.status === 'resigned') {
        setGameOver('O oponente desistiu.');
        updateElo(true);
      }
    });
    const movesRef = roomRef.child('moves');
    movesRef.on('child_added', (snap) => {
      const data = snap.val();
      if (!data || data.timestamp <= lastProcessedTs.current) return;
      if (data.playerId !== currentUser.id) {
        lastProcessedTs.current = data.timestamp;
        applyMove(data.move);
      }
    });
    return () => { roomRef.off(); movesRef.off(); };
  }, [onlineRoom, playerColor, currentUser.id, applyMove]);

  const handleMove = (move: Move) => {
    if (gameOver) return;
    if (gameMode === GameMode.ONLINE) {
      if (turn !== playerColor || !onlineRoom) return;
      const ts = Date.now();
      lastProcessedTs.current = ts;
      if (applyMove(move)) {
        db.ref(`rooms/${onlineRoom}/moves`).push({
          move: JSON.parse(JSON.stringify(move)),
          playerId: currentUser.id,
          timestamp: ts
        });
      }
    } else {
      applyMove(move);
    }
  };

  // IA Progressiva
  useEffect(() => {
    if (gameMode === GameMode.AI && turn === 'b' && !gameOver) {
      const timeout = setTimeout(() => {
        const move = getBestMove(boardRef.current, 'b', currentUser.elo);
        if (move) applyMove(move);
      }, 600);
      return () => clearTimeout(timeout);
    }
  }, [turn, gameMode, gameOver, applyMove, currentUser.elo]);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#312e2b] text-white overflow-hidden">
      <Sidebar user={currentUser} onProfileClick={() => setShowProfileModal(true)} />
      <main className="flex-1 flex flex-col items-center overflow-y-auto pt-4 px-2">
        <div className="flex flex-col lg:flex-row gap-6 w-full max-w-6xl items-center lg:items-start">
          <div className="w-full max-w-[600px] flex flex-col gap-2">
            <div className="flex justify-between items-center px-4 py-2 bg-[#262421]/50 rounded border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#3c3a37] rounded flex items-center justify-center overflow-hidden">
                   {opponent ? <img src={opponent.avatar} className="w-full h-full" /> : <i className="fas fa-robot text-gray-500"></i>}
                </div>
                <div>
                  <div className="font-bold text-sm">{opponent?.name || (gameMode === GameMode.AI ? `Stockfish (Nível ${Math.floor(currentUser.elo/500)})` : 'Aguardando...')}</div>
                  <div className="text-[10px] text-gray-500 font-bold">ELO {opponent?.elo || (gameMode === GameMode.AI ? currentUser.elo + 100 : 1200)}</div>
                </div>
              </div>
              <div className={`px-4 py-1.5 rounded font-mono text-xl ${turn !== playerColor ? 'bg-white text-black font-bold' : 'bg-[#211f1c] text-gray-500'}`}>
                {Math.floor(timers[playerColor === 'w' ? 'b' : 'w'] / 60)}:{(timers[playerColor === 'w' ? 'b' : 'w'] % 60).toString().padStart(2, '0')}
              </div>
            </div>

            <ChessBoard board={board} onMove={handleMove} turn={turn} isFlipped={playerColor === 'b'} lastMove={history.length > 0 ? history[history.length - 1] : null} />

            <div className="flex justify-between items-center px-4 py-2 bg-[#262421]/50 rounded border border-white/5">
              <div className="flex items-center gap-3">
                <img src={currentUser.avatar} className="w-10 h-10 rounded-md cursor-pointer" onClick={() => setShowProfileModal(true)} />
                <div>
                  <div className="font-bold text-sm">{currentUser.name}</div>
                  <div className="text-[10px] text-[#81b64c] font-bold">ELO {currentUser.elo}</div>
                </div>
              </div>
              <div className={`px-4 py-1.5 rounded font-mono text-xl ${turn === playerColor ? 'bg-white text-black font-bold' : 'bg-[#211f1c] text-gray-500'}`}>
                {Math.floor(timers[playerColor] / 60)}:{(timers[playerColor] % 60).toString().padStart(2, '0')}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[380px] flex flex-col gap-4">
            <div className="h-[450px]">
              <GameControls history={history} onUndo={() => {}} onResign={() => setGameOver('Você desistiu.')} turn={turn} whiteTimer={timers.w} blackTimer={timers.b} gameMode={gameMode} />
            </div>
            {gameMode === GameMode.LOCAL && (
              <div className="flex flex-col gap-2">
                <button onClick={() => { const id = Math.random().toString(36).substring(2, 8); setOnlineRoom(id); setGameMode(GameMode.ONLINE); setPlayerColor('w'); setIsWaiting(true); db.ref(`rooms/${id}`).set({ id, status: 'waiting', playerA: currentUser }); }} className="bg-[#81b64c] py-4 rounded-lg font-bold text-xl shadow-[0_4px_0_rgb(69,101,40)]">JOGAR ONLINE</button>
                <button onClick={() => { setGameMode(GameMode.AI); setGameOver(null); }} className="bg-[#3c3a37] py-3 rounded-lg font-bold">CONTRA COMPUTADOR</button>
              </div>
            )}
          </div>
        </div>

        {/* Modal Perfil */}
        {showProfileModal && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[110] p-4">
            <div className="bg-[#262421] p-8 rounded-2xl w-full max-w-md border border-white/10">
              <h2 className="text-2xl font-bold mb-6">Editar Perfil</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold">Nome de Usuário</label>
                  <input value={currentUser.name} onChange={e => setCurrentUser({...currentUser, name: e.target.value})} className="w-full bg-[#1a1917] border border-[#3c3a37] p-3 rounded mt-1 outline-none focus:border-[#81b64c]" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold">Avatar (Seed)</label>
                  <div className="flex gap-4 mt-2 items-center">
                    <img src={currentUser.avatar} className="w-16 h-16 rounded" />
                    <button onClick={() => setCurrentUser({...currentUser, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`})} className="bg-[#3c3a37] px-4 py-2 rounded text-sm font-bold">Gerar Novo</button>
                  </div>
                </div>
              </div>
              <button onClick={() => setShowProfileModal(false)} className="w-full bg-[#81b64c] py-4 rounded-xl font-bold mt-8">SALVAR</button>
            </div>
          </div>
        )}

        {gameOver && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
            <div className="bg-[#262421] p-10 rounded-2xl text-center shadow-2xl">
              <h2 className="text-2xl font-bold mb-2">Fim de Jogo</h2>
              <p className="text-gray-400 mb-8">{gameOver}</p>
              <button onClick={() => window.location.reload()} className="w-full bg-[#81b64c] py-4 rounded-xl font-bold">NOVA PARTIDA</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
