
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
  const [isSpectator, setIsSpectator] = useState(false);
  const [spectatorCount, setSpectatorCount] = useState(0);
  const [messages, setMessages] = useState<any[]>([]);
  const [opponent, setOpponent] = useState<User | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [leaderboard, setLeaderboard] = useState<User[]>([]);
  const [copyStatus, setCopyStatus] = useState<'Copiar' | 'Copiado!'>('Copiar');

  const lastProcessedTs = useRef<number>(0);

  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem('chess_profile');
    if (saved) return JSON.parse(saved);
    return {
      id: `u_${Math.random().toString(36).substr(2, 5)}`,
      name: 'Player',
      elo: 1200,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`
    };
  });

  // Persistir ranking no Firebase
  useEffect(() => {
    db.ref(`ranking/${currentUser.id}`).set(currentUser);
    const rankingRef = db.ref('ranking').orderByChild('elo').limitToLast(10);
    rankingRef.on('value', (snap) => {
      const val = snap.val();
      if (val) {
        const list = Object.values(val) as User[];
        setLeaderboard(list.sort((a, b) => b.elo - a.elo));
      }
    });
    return () => rankingRef.off();
  }, [currentUser]);

  // CRONÔMETRO
  useEffect(() => {
    if (gameOver || isWaiting || isSpectator || (gameMode === GameMode.ONLINE && !opponent)) return;
    const interval = setInterval(() => {
      setTimers(prev => {
        const currentSeconds = prev[turn];
        if (currentSeconds <= 0) {
          setGameOver(`Tempo esgotado! Vitória das ${turn === 'w' ? 'Pretas' : 'Brancas'}`);
          clearInterval(interval);
          return prev;
        }
        return { ...prev, [turn]: currentSeconds - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [turn, gameOver, isWaiting, gameMode, opponent, isSpectator]);

  const resetGameState = useCallback(() => {
    boardRef.current = createInitialBoard();
    historyRef.current = [];
    setBoard(boardRef.current);
    setHistory([]);
    setTurn('w');
    setGameOver(null);
    setTimers({ w: 600, b: 600 });
    setMessages([]);
    setIsSpectator(false);
  }, []);

  const updateElo = (won: boolean | null) => {
    if (won === null || isSpectator) return;
    const newElo = won ? currentUser.elo + 15 : Math.max(100, currentUser.elo - 12);
    setCurrentUser(prev => ({ ...prev, elo: newElo }));
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
        const won = move.piece.color === playerColor;
        setGameOver(`Xeque-mate! Vitória das ${move.piece.color === 'w' ? 'Brancas' : 'Pretas'}`);
        if (gameMode === GameMode.ONLINE) updateElo(won);
      } else if (state === 'stalemate') {
        setGameOver('Empate por afogamento.');
      }
      return true;
    } catch (e) { return false; }
  }, [playerColor, gameMode, currentUser.elo, isSpectator]);

  // SYNC ONLINE & ESPECTADORES
  useEffect(() => {
    if (!onlineRoom) return;
    const roomRef = db.ref(`rooms/${onlineRoom}`);
    
    // Contador de Espectadores
    const specRef = roomRef.child('spectators').child(currentUser.id);
    specRef.set(true);
    specRef.onDisconnect().remove();

    roomRef.on('value', (snap) => {
      const data = snap.val();
      if (!data) return;
      
      const specs = data.spectators ? Object.keys(data.spectators).length : 0;
      setSpectatorCount(specs);

      if (isSpectator) {
        setOpponent(data.playerB);
        // PlayerA visualmente
      } else {
        if (playerColor === 'w') setOpponent(data.playerB || null);
        else setOpponent(data.playerA || null);
      }
      
      if (data.status === 'playing') setIsWaiting(false);
      if (data.status === 'resigned') setGameOver('O oponente desistiu.');
    });

    const movesRef = roomRef.child('moves');
    movesRef.on('child_added', (snap) => {
      const data = snap.val();
      if (data && data.timestamp > lastProcessedTs.current && data.playerId !== currentUser.id) {
        lastProcessedTs.current = data.timestamp;
        applyMove(data.move);
      }
    });

    const chatRef = roomRef.child('chat');
    chatRef.on('child_added', (snap) => {
      setMessages(prev => [...prev, snap.val()]);
    });

    return () => { roomRef.off(); movesRef.off(); chatRef.off(); specRef.remove(); };
  }, [onlineRoom, playerColor, currentUser.id, applyMove, isSpectator]);

  const handleMove = (move: Move) => {
    if (gameOver || isSpectator) return;
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

  const createOnlineGame = () => {
    const id = Math.random().toString(36).substring(2, 8);
    setOnlineRoom(id); setGameMode(GameMode.ONLINE); setPlayerColor('w'); setIsWaiting(true); setIsSpectator(false);
    db.ref(`rooms/${id}`).set({ id, status: 'waiting', playerA: currentUser });
  };

  // Entrada por link (Player 2 ou Espectador)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room && !onlineRoom) {
      db.ref(`rooms/${room}`).once('value').then(snap => {
        const data = snap.val();
        if (!data) return;
        setOnlineRoom(room);
        setGameMode(GameMode.ONLINE);
        
        if (data.status === 'waiting') {
          setPlayerColor('b');
          db.ref(`rooms/${room}`).update({ playerB: currentUser, status: 'playing' });
        } else {
          // Entra como espectador
          setIsSpectator(true);
          setPlayerColor('w'); // Ver como brancas por padrão
        }
      });
    }
  }, [currentUser, onlineRoom]);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#312e2b] text-white overflow-hidden">
      <Sidebar 
        user={currentUser} 
        onProfileClick={() => setShowProfileModal(true)} 
        onRankingClick={() => setShowRanking(true)}
      />
      
      <main className="flex-1 flex flex-col items-center overflow-y-auto pt-4 px-2">
        <div className="flex flex-col lg:flex-row gap-6 w-full max-w-6xl items-center lg:items-start">
          <div className="w-full max-w-[600px] flex flex-col gap-2 relative">
            
            {isSpectator && (
              <div className="absolute top-2 right-2 z-20 bg-red-600 px-3 py-1 rounded-full text-[10px] font-bold animate-pulse flex items-center gap-2">
                <i className="fas fa-eye"></i> MODO ESPECTADOR
              </div>
            )}

            {/* OPONENTE */}
            <div className="flex justify-between items-center px-4 py-2 bg-[#262421]/50 rounded border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#3c3a37] rounded overflow-hidden flex items-center justify-center">
                   {opponent ? <img src={opponent.avatar} className="w-full h-full" /> : <i className="fas fa-robot text-gray-500"></i>}
                </div>
                <div>
                  <div className="font-bold text-sm">{opponent?.name || (gameMode === GameMode.AI ? 'Stockfish 3000' : 'Aguardando...')}</div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase">ELO {opponent?.elo || 1200}</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-[10px] text-gray-500 font-bold"><i className="fas fa-users mr-1"></i> {spectatorCount}</div>
                <div className={`px-4 py-1.5 rounded font-mono text-xl ${turn !== playerColor && !gameOver ? 'bg-white text-black font-bold' : 'bg-[#211f1c] text-gray-500'}`}>
                  {Math.floor(timers[playerColor === 'w' ? 'b' : 'w'] / 60)}:{(timers[playerColor === 'w' ? 'b' : 'w'] % 60).toString().padStart(2, '0')}
                </div>
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

            {/* JOGADOR */}
            <div className="flex justify-between items-center px-4 py-2 bg-[#262421]/50 rounded border border-white/5">
              <div className="flex items-center gap-3">
                <img src={currentUser.avatar} className="w-10 h-10 rounded-md cursor-pointer border border-white/10" onClick={() => setShowProfileModal(true)} />
                <div>
                  <div className="font-bold text-sm">{currentUser.name} {isSpectator && '(Você)'}</div>
                  <div className="text-[10px] text-[#81b64c] font-bold uppercase">ELO {currentUser.elo}</div>
                </div>
              </div>
              <div className={`px-4 py-1.5 rounded font-mono text-xl ${turn === playerColor && !gameOver ? 'bg-white text-black font-bold' : 'bg-[#211f1c] text-gray-500'}`}>
                {Math.floor(timers[playerColor] / 60)}:{(timers[playerColor] % 60).toString().padStart(2, '0')}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[380px] flex flex-col gap-4">
            <div className="h-[500px]">
              <GameControls 
                history={history} 
                onUndo={() => { if (gameMode !== GameMode.ONLINE) resetGameState(); }} 
                onResign={() => {
                  if (onlineRoom && !isSpectator) db.ref(`rooms/${onlineRoom}`).update({ status: 'resigned' });
                  setGameOver('Partida encerrada.');
                }} 
                turn={turn} 
                whiteTimer={timers.w} 
                blackTimer={timers.b} 
                gameMode={gameMode}
                messages={messages}
                onSendMessage={(text) => {
                  if (onlineRoom) db.ref(`rooms/${onlineRoom}/chat`).push({ user: currentUser.name, text, timestamp: Date.now() });
                }}
              />
            </div>

            {!onlineRoom && (
              <div className="flex flex-col gap-2">
                <button onClick={createOnlineGame} className="bg-[#81b64c] hover:bg-[#95c562] py-4 rounded-lg font-bold text-xl shadow-[0_4px_0_rgb(69,101,40)] transition-transform active:translate-y-1">
                  NOVA PARTIDA ONLINE
                </button>
                <button onClick={() => { setGameMode(GameMode.AI); resetGameState(); }} className="bg-[#3c3a37] py-3 rounded-lg font-bold">DESAFIAR COMPUTADOR</button>
              </div>
            )}
            
            {onlineRoom && (
              <button onClick={() => window.location.assign(window.location.origin)} className="bg-[#3c3a37] py-3 rounded-lg font-bold">SAIR DA SALA</button>
            )}
          </div>
        </div>

        {/* MODAL RANKING */}
        {showRanking && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[120] p-4">
            <div className="bg-[#262421] p-8 rounded-2xl w-full max-w-md border border-white/10 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-[#81b64c]"><i className="fas fa-trophy mr-2"></i> Melhores Jogadores</h2>
                <button onClick={() => setShowRanking(false)} className="text-gray-500 hover:text-white"><i className="fas fa-times"></i></button>
              </div>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                {leaderboard.map((u, idx) => (
                  <div key={u.id} className={`flex items-center justify-between p-3 rounded-lg ${u.id === currentUser.id ? 'bg-[#81b64c]/20 border border-[#81b64c]/30' : 'bg-[#1a1917]'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`w-6 text-center font-bold ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-amber-600' : 'text-gray-600'}`}>
                        {idx + 1}
                      </span>
                      <img src={u.avatar} className="w-8 h-8 rounded" />
                      <span className="font-medium text-sm">{u.name}</span>
                    </div>
                    <span className="font-mono font-bold text-[#81b64c]">{u.elo}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 p-4 bg-[#1a1917] rounded-xl text-center border border-white/5">
                <div className="text-xs text-gray-500 uppercase font-bold mb-1">Sua Posição</div>
                <div className="text-xl font-bold">ELO {currentUser.elo}</div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL CONVITE */}
        {isWaiting && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4">
            <div className="bg-[#262421] p-8 rounded-2xl w-full max-w-sm text-center border border-white/10 shadow-2xl">
              <div className="w-16 h-16 bg-[#81b64c]/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                <i className="fas fa-share-alt text-[#81b64c] text-2xl"></i>
              </div>
              <h2 className="text-xl font-bold mb-2">Convidar Oponente</h2>
              <p className="text-gray-400 text-xs mb-6">Envie este link. O primeiro a entrar joga, os outros assistem.</p>
              <div className="bg-[#1a1917] p-3 rounded mb-6 text-xs font-mono text-[#81b64c] break-all border border-white/5 select-all">
                {window.location.origin}/?room={onlineRoom}
              </div>
              <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/?room=${onlineRoom}`); setCopyStatus('Copiado!'); setTimeout(() => setCopyStatus('Copiar'), 2000); }} 
                className={`w-full py-4 rounded-xl font-bold mb-2 transition-all ${copyStatus === 'Copiado!' ? 'bg-[#81b64c]' : 'bg-[#3c3a37]'}`}>
                {copyStatus === 'Copiado!' ? 'LINK COPIADO!' : 'COPIAR LINK'}
              </button>
              <button onClick={() => { setOnlineRoom(null); setGameMode(GameMode.LOCAL); setIsWaiting(false); }} className="text-gray-500 text-xs font-bold uppercase mt-4">Cancelar</button>
            </div>
          </div>
        )}

        {/* MODAL FIM DE JOGO */}
        {gameOver && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[130] p-4">
            <div className="bg-[#262421] p-10 rounded-2xl text-center shadow-2xl max-w-sm w-full border border-white/10">
              <div className="text-5xl mb-4">🏁</div>
              <h2 className="text-2xl font-bold mb-2">Fim de Jogo</h2>
              <p className="text-gray-400 mb-8">{gameOver}</p>
              <button onClick={() => window.location.assign(window.location.origin)} className="w-full bg-[#81b64c] py-4 rounded-xl font-bold text-white shadow-lg">VOLTAR AO INÍCIO</button>
            </div>
          </div>
        )}

        {/* PERFIL */}
        {showProfileModal && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[110] p-4">
            <div className="bg-[#262421] p-8 rounded-2xl w-full max-w-md border border-white/10 shadow-2xl">
              <h2 className="text-2xl font-bold mb-6">Editar Perfil</h2>
              <div className="space-y-4">
                <input value={currentUser.name} onChange={e => setCurrentUser({...currentUser, name: e.target.value})} className="w-full bg-[#1a1917] border border-[#3c3a37] p-4 rounded-lg mt-1 outline-none focus:border-[#81b64c]" placeholder="Nome" />
                <div className="flex gap-4 mt-2 items-center">
                  <img src={currentUser.avatar} className="w-20 h-20 rounded-xl border border-white/10" />
                  <button onClick={() => setCurrentUser({...currentUser, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`})} className="bg-[#3c3a37] px-4 py-2 rounded-lg text-sm font-bold">Novo Avatar</button>
                </div>
              </div>
              <button onClick={() => setShowProfileModal(false)} className="w-full bg-[#81b64c] py-4 rounded-xl font-bold mt-8">SALVAR</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
