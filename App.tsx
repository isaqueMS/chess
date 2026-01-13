
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
  const [copyFeedback, setCopyFeedback] = useState(false);

  const lastProcessedTs = useRef<number>(0);

  // Perfil Persistente
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

  const resetGameState = useCallback(() => {
    boardRef.current = createInitialBoard();
    historyRef.current = [];
    setBoard(boardRef.current);
    setHistory([]);
    setTurn('w');
    setGameOver(null);
    setTimers({ w: 600, b: 600 });
  }, []);

  const updateElo = (won: boolean | null) => {
    if (won === null) return;
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
        if (gameMode === GameMode.ONLINE) updateElo(winner === playerColor);
      } else if (state === 'stalemate') {
        setGameOver('Empate por afogamento.');
      }
      return true;
    } catch (e) { return false; }
  }, [gameMode, playerColor]);

  // Online Logic: Listener de Sala e Lances
  useEffect(() => {
    if (!onlineRoom) return;
    const roomRef = db.ref(`rooms/${onlineRoom}`);
    
    const handleRoomData = (snap: any) => {
      const data = snap.val();
      if (!data) return;
      
      if (playerColor === 'w' && data.playerB) {
        setOpponent(data.playerB);
        if (data.status === 'playing') setIsWaiting(false);
      }
      if (playerColor === 'b' && data.playerA) {
        setOpponent(data.playerA);
        if (data.status === 'playing') setIsWaiting(false);
      }

      if (data.status === 'resigned') {
        setGameOver('O oponente desistiu.');
        updateElo(true);
      }
    };

    roomRef.on('value', handleRoomData);

    const movesRef = roomRef.child('moves');
    movesRef.on('child_added', (snap) => {
      const data = snap.val();
      if (!data || data.timestamp <= lastProcessedTs.current) return;
      if (data.playerId !== currentUser.id) {
        lastProcessedTs.current = data.timestamp;
        applyMove(data.move);
      }
    });

    return () => {
      roomRef.off('value', handleRoomData);
      movesRef.off();
    };
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

  // Funções de Gerenciamento de Partida Online
  const createOnlineGame = () => {
    const id = Math.random().toString(36).substring(2, 8);
    resetGameState();
    setOnlineRoom(id);
    setGameMode(GameMode.ONLINE);
    setPlayerColor('w');
    setIsWaiting(true);
    setOpponent(null);
    
    db.ref(`rooms/${id}`).set({
      id,
      status: 'waiting',
      playerA: currentUser,
      createdAt: Date.now()
    });
  };

  const joinRoom = useCallback((roomId: string) => {
    db.ref(`rooms/${roomId}`).once('value').then((snap) => {
      const data = snap.val();
      if (data && data.status === 'waiting') {
        resetGameState();
        setOnlineRoom(roomId);
        setGameMode(GameMode.ONLINE);
        setPlayerColor('b');
        setOpponent(data.playerA);
        setIsWaiting(false);
        
        db.ref(`rooms/${roomId}`).update({
          playerB: currentUser,
          status: 'playing'
        });
      }
    });
  }, [currentUser, resetGameState]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) joinRoom(room);
  }, [joinRoom]);

  // IA Handler
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
            {/* Oponente UI */}
            <div className="flex justify-between items-center px-4 py-2 bg-[#262421]/50 rounded border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#3c3a37] rounded flex items-center justify-center overflow-hidden">
                   {opponent ? <img src={opponent.avatar} className="w-full h-full" alt="Avatar" /> : <i className="fas fa-robot text-gray-500"></i>}
                </div>
                <div>
                  <div className="font-bold text-sm">
                    {opponent?.name || (gameMode === GameMode.AI ? `Stockfish Lv.${Math.floor(currentUser.elo/500)}` : 'Aguardando...')}
                  </div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase">ELO {opponent?.elo || 1200}</div>
                </div>
              </div>
              <div className={`px-4 py-1.5 rounded font-mono text-xl ${turn !== playerColor && !gameOver ? 'bg-white text-black font-bold' : 'bg-[#211f1c] text-gray-500'}`}>
                {Math.floor(timers[playerColor === 'w' ? 'b' : 'w'] / 60)}:{(timers[playerColor === 'w' ? 'b' : 'w'] % 60).toString().padStart(2, '0')}
              </div>
            </div>

            <ChessBoard 
              board={board} 
              onMove={handleMove} 
              turn={turn} 
              isFlipped={playerColor === 'b'} 
              lastMove={history.length > 0 ? history[history.length - 1] : null}
              gameOver={!!gameOver}
            />

            {/* Jogador UI */}
            <div className="flex justify-between items-center px-4 py-2 bg-[#262421]/50 rounded border border-white/5">
              <div className="flex items-center gap-3">
                <img src={currentUser.avatar} className="w-10 h-10 rounded-md cursor-pointer" onClick={() => setShowProfileModal(true)} alt="Me" />
                <div>
                  <div className="font-bold text-sm">{currentUser.name}</div>
                  <div className="text-[10px] text-[#81b64c] font-bold uppercase">ELO {currentUser.elo}</div>
                </div>
              </div>
              <div className={`px-4 py-1.5 rounded font-mono text-xl ${turn === playerColor && !gameOver ? 'bg-white text-black font-bold' : 'bg-[#211f1c] text-gray-500'}`}>
                {Math.floor(timers[playerColor] / 60)}:{(timers[playerColor] % 60).toString().padStart(2, '0')}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[380px] flex flex-col gap-4">
            <div className="h-[450px]">
              <GameControls 
                history={history} 
                onUndo={() => { if (gameMode !== GameMode.ONLINE) resetGameState(); }} 
                onResign={() => { if (onlineRoom) db.ref(`rooms/${onlineRoom}`).update({ status: 'resigned' }); setGameOver('Você desistiu.'); }} 
                turn={turn} 
                whiteTimer={timers.w} blackTimer={timers.b} 
                gameMode={gameMode} 
              />
            </div>

            {gameMode === GameMode.LOCAL && (
              <div className="flex flex-col gap-2">
                <button onClick={createOnlineGame} className="bg-[#81b64c] hover:bg-[#95c562] py-4 rounded-lg font-bold text-xl shadow-[0_4px_0_rgb(69,101,40)] transition-transform active:translate-y-1">
                  <i className="fas fa-bolt mr-2"></i> JOGAR ONLINE
                </button>
                <button onClick={() => { setGameMode(GameMode.AI); resetGameState(); }} className="bg-[#3c3a37] py-3 rounded-lg font-bold hover:bg-[#4a4844]">
                  DESAFIAR IA
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modal de Espera / Convite */}
        {isWaiting && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <div className="bg-[#262421] p-8 rounded-2xl w-full max-w-sm border border-white/10 text-center shadow-2xl">
              <div className="w-16 h-16 bg-[#81b64c]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-user-plus text-[#81b64c] text-2xl"></i>
              </div>
              <h2 className="text-2xl font-bold mb-2">Convidar Amigo</h2>
              <p className="text-gray-400 text-sm mb-6">Envie o link abaixo. O jogo começará assim que o oponente entrar.</p>
              
              <div className="bg-[#1a1917] p-4 rounded-xl mb-6 border border-white/5 break-all text-xs font-mono text-[#81b64c]">
                {window.location.origin}/?room={onlineRoom}
              </div>

              <button 
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/?room=${onlineRoom}`);
                  setCopyFeedback(true);
                  setTimeout(() => setCopyFeedback(false), 2000);
                }} 
                className={`w-full py-4 rounded-xl font-bold transition-all ${copyFeedback ? 'bg-[#81b64c]' : 'bg-[#3c3a37]'}`}
              >
                {copyFeedback ? 'LINK COPIADO!' : 'COPIAR LINK'}
              </button>
              
              <button 
                onClick={() => { setOnlineRoom(null); setGameMode(GameMode.LOCAL); setIsWaiting(false); }} 
                className="mt-4 text-gray-500 text-xs font-bold uppercase hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Perfil Modal */}
        {showProfileModal && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[110] p-4">
            <div className="bg-[#262421] p-8 rounded-2xl w-full max-w-md border border-white/10">
              <h2 className="text-2xl font-bold mb-6">Configurações de Perfil</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold">Nome de Usuário</label>
                  <input 
                    value={currentUser.name} 
                    onChange={e => setCurrentUser({...currentUser, name: e.target.value})} 
                    className="w-full bg-[#1a1917] border border-[#3c3a37] p-3 rounded mt-1 outline-none focus:border-[#81b64c]" 
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase font-bold">Avatar</label>
                  <div className="flex gap-4 mt-2 items-center">
                    <img src={currentUser.avatar} className="w-16 h-16 rounded shadow-lg" alt="Preview" />
                    <button onClick={() => setCurrentUser({...currentUser, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`})} className="bg-[#3c3a37] px-4 py-2 rounded text-sm font-bold">Novo Avatar</button>
                  </div>
                </div>
              </div>
              <button onClick={() => setShowProfileModal(false)} className="w-full bg-[#81b64c] py-4 rounded-xl font-bold mt-8 shadow-lg">SALVAR ALTERAÇÕES</button>
            </div>
          </div>
        )}

        {/* Game Over Modal */}
        {gameOver && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-[#262421] p-10 rounded-2xl text-center shadow-2xl max-w-sm w-full border border-white/10">
              <div className="text-6xl mb-4">🏁</div>
              <h2 className="text-2xl font-bold mb-2">Fim de Partida</h2>
              <p className="text-gray-400 mb-8">{gameOver}</p>
              <button onClick={() => window.location.assign(window.location.origin)} className="w-full bg-[#81b64c] py-4 rounded-xl font-bold text-white shadow-lg">NOVA PARTIDA</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
