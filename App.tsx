
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChessBoard from './components/ChessBoard';
import GameControls from './components/GameControls';
import { Board, Move, Color, GameMode, User } from './types';
import { createInitialBoard, makeMove, getGameState } from './services/chessLogic';
import { db } from './services/firebase';
import { DEFAULT_USER } from './constants';

const App: React.FC = () => {
  // Estado local do jogo
  const [board, setBoard] = useState<Board>(createInitialBoard());
  const [turn, setTurn] = useState<Color>('w');
  const [history, setHistory] = useState<Move[]>([]);
  const [timers, setTimers] = useState({ w: 600, b: 600 });
  const [gameOver, setGameOver] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.LOCAL);
  
  // Estados de rede
  const [onlineRoom, setOnlineRoom] = useState<string | null>(null);
  const [playerColor, setPlayerColor] = useState<Color>('w');
  const [isWaiting, setIsWaiting] = useState(false);
  const [messages, setMessages] = useState<{user: string, text: string}[]>([]);
  const [opponent, setOpponent] = useState<User | null>(null);

  // Refs críticas para evitar loops de rede e fechamentos inesperados
  const historyRef = useRef<Move[]>([]);
  const boardRef = useRef<Board>(createInitialBoard());
  const lastProcessedIdx = useRef(-1);

  // Perfil de usuário único para esta sessão
  const [currentUser] = useState<User>(() => ({
    ...DEFAULT_USER,
    id: `user_${Math.random().toString(36).substr(2, 9)}`,
    name: `Player_${Math.floor(Math.random() * 9000) + 1000}`,
    elo: 1200 + Math.floor(Math.random() * 200),
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`
  }));

  // Sincroniza refs com estado
  useEffect(() => {
    historyRef.current = history;
    boardRef.current = board;
  }, [history, board]);

  // Detector de entrada via link (Oponente entrando)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    if (roomId) {
      joinRoom(roomId);
    }
  }, []);

  const setupGameListeners = (roomId: string) => {
    const roomRef = db.ref(`rooms/${roomId}`);
    
    // Escuta lances individualmente para evitar carregar o histórico todo toda vez
    roomRef.child('moves').on('child_added', (snapshot) => {
      const data = snapshot.val();
      const moveIdx = parseInt(snapshot.key || "0");

      if (moveIdx > lastProcessedIdx.current) {
        lastProcessedIdx.current = moveIdx;
        
        // Aplica o movimento remotamente
        const move: Move = data.move;
        const nextBoard = makeMove(boardRef.current, move);
        const nextTurn = data.nextTurn;

        setBoard(nextBoard);
        setTurn(nextTurn);
        setHistory(prev => {
          // Só adiciona se o lance ainda não existir localmente para evitar duplicatas
          if (prev.length <= moveIdx) return [...prev, move];
          return prev;
        });

        const state = getGameState(nextBoard, nextTurn);
        if (state === 'checkmate') setGameOver(`Xeque-mate! Vitória das ${move.piece.color === 'w' ? 'Brancas' : 'Pretas'}`);
      }
    });

    // Escuta mensagens
    roomRef.child('messages').on('child_added', (snap) => {
      const msg = snap.val();
      setMessages(prev => [...prev, msg]);
    });

    // Escuta status da partida
    roomRef.child('status').on('value', (snap) => {
      if (snap.val() === 'resigned' && !gameOver) {
        setGameOver('O oponente abandonou a partida.');
      }
    });
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
      createdAt: Date.now()
    });

    // Detecta quando player B entra
    roomRef.child('playerB').on('value', (snap) => {
      const data = snap.val();
      if (data) {
        setOpponent(data);
        setIsWaiting(false);
      }
    });

    setupGameListeners(id);
  };

  const joinRoom = (roomId: string) => {
    setOnlineRoom(roomId);
    setGameMode(GameMode.ONLINE);
    setPlayerColor('b');
    setIsWaiting(false);

    const roomRef = db.ref(`rooms/${roomId}`);
    
    // Registra-se como oponente
    roomRef.child('playerB').set(currentUser);
    roomRef.child('status').set('playing');
    
    // Pega dados do Host
    roomRef.child('playerA').once('value', (snap) => {
      setOpponent(snap.val());
    });

    setupGameListeners(roomId);
  };

  const handleMove = useCallback((move: Move) => {
    if (gameOver) return;
    if (gameMode === GameMode.ONLINE && turn !== playerColor) return;

    // 1. Aplica localmente primeiro (Resposta instantânea)
    const newBoard = makeMove(board, move);
    const nextTurn = turn === 'w' ? 'b' : 'w';
    
    // 2. Se for online, envia para o Firebase
    if (gameMode === GameMode.ONLINE && onlineRoom) {
      const moveIdx = history.length;
      db.ref(`rooms/${onlineRoom}/moves/${moveIdx}`).set({
        move,
        nextTurn,
        senderId: currentUser.id
      });
    } else {
      // No modo local, atualiza o estado manualmente
      setBoard(newBoard);
      setHistory(prev => [...prev, move]);
      setTurn(nextTurn);
      
      const state = getGameState(newBoard, nextTurn);
      if (state === 'checkmate') setGameOver('Xeque-mate!');
    }
  }, [board, turn, gameMode, playerColor, onlineRoom, history, gameOver, currentUser.id]);

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

  // Cronômetros (Apenas para feedback visual)
  useEffect(() => {
    if (gameOver || isWaiting) return;
    const interval = setInterval(() => {
      setTimers(prev => ({
        ...prev,
        [turn]: Math.max(0, prev[turn] - 1)
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [turn, gameOver, isWaiting]);

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-[#312e2b]">
      <Sidebar user={currentUser} />
      
      <main className="flex-1 overflow-hidden flex flex-col items-center justify-center p-4 lg:p-8">
        <div className="flex flex-col lg:flex-row items-start justify-center gap-8 w-full max-w-7xl">
          
          <div className="flex flex-col items-center w-full max-w-[600px]">
            {/* Top Player Info (Oponente) */}
            <div className="w-full flex justify-between items-center mb-2 bg-[#262421] p-3 rounded border border-white/5">
              <div className="flex items-center space-x-3">
                <img src={opponent?.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=robot'} className="w-10 h-10 rounded bg-[#3c3a37]" />
                <div>
                  <div className="text-sm font-bold text-white leading-none">{opponent?.name || (gameMode === GameMode.ONLINE ? 'Aguardando...' : 'Oponente')}</div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase mt-1">ELO {opponent?.elo || '1500'}</div>
                </div>
              </div>
              <div className={`px-4 py-1.5 rounded font-mono text-2xl font-bold ${turn !== playerColor ? 'bg-white text-black' : 'bg-[#1a1917] text-gray-500'}`}>
                {Math.floor(timers[playerColor === 'w' ? 'b' : 'w'] / 60)}:{(timers[playerColor === 'w' ? 'b' : 'w'] % 60).toString().padStart(2, '0')}
              </div>
            </div>

            <ChessBoard 
              board={board} 
              onMove={handleMove} 
              turn={turn} 
              isFlipped={playerColor === 'b'} 
            />

            {/* Bottom Player Info (Você) */}
            <div className="w-full flex justify-between items-center mt-2 bg-[#262421] p-3 rounded border border-white/5">
              <div className="flex items-center space-x-3">
                <img src={currentUser.avatar} className="w-10 h-10 rounded bg-[#3c3a37]" />
                <div>
                  <div className="text-sm font-bold text-white leading-none">{currentUser.name} <span className="text-[#81b64c] ml-1">(Você)</span></div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase mt-1">ELO {currentUser.elo}</div>
                </div>
              </div>
              <div className={`px-4 py-1.5 rounded font-mono text-2xl font-bold ${turn === playerColor ? 'bg-white text-black' : 'bg-[#1a1917] text-gray-500'}`}>
                {Math.floor(timers[playerColor] / 60)}:{(timers[playerColor] % 60).toString().padStart(2, '0')}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[400px] h-[640px]">
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
              <button 
                onClick={createOnlineGame} 
                className="w-full mt-4 bg-[#81b64c] hover:bg-[#95c562] py-4 rounded-xl font-bold text-white shadow-[0_4px_0_rgb(69,101,40)] active:shadow-none active:translate-y-1 transition-all flex items-center justify-center gap-2"
              >
                <i className="fas fa-play"></i> JOGAR ONLINE
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Modal de Espera */}
      {isWaiting && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[10000]">
          <div className="bg-[#262421] p-10 rounded-2xl border border-white/10 max-w-sm w-full text-center animate-in fade-in zoom-in duration-300">
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-[#81b64c]/20 border-t-[#81b64c] animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-[#81b64c] text-3xl">
                <i className="fas fa-chess-knight"></i>
              </div>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Aguardando Oponente</h2>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">Envie este link para um amigo para começar o duelo em tempo real:</p>
            <div className="bg-[#1a1917] p-3 rounded-lg border border-white/5 flex items-center mb-8">
              <input readOnly value={`${window.location.origin}/?room=${onlineRoom}`} className="bg-transparent text-[11px] text-[#81b64c] flex-1 outline-none font-mono" />
              <button 
                onClick={() => { 
                  navigator.clipboard.writeText(`${window.location.origin}/?room=${onlineRoom}`);
                  alert('Link de convite copiado!');
                }} 
                className="ml-2 bg-[#3c3a37] px-3 py-1.5 rounded text-white text-xs hover:bg-[#4a4844] transition-colors"
              >
                Copiar
              </button>
            </div>
            <button onClick={() => window.location.href = '/'} className="text-gray-500 text-xs font-bold uppercase hover:text-red-400 transition-colors">Cancelar Desafio</button>
          </div>
        </div>
      )}

      {/* Modal de Fim de Jogo */}
      {gameOver && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[20000]">
          <div className="bg-[#262421] p-12 rounded-3xl border border-white/10 text-center max-w-sm animate-in zoom-in duration-300">
            <div className="text-yellow-500 text-6xl mb-6 drop-shadow-[0_0_15px_rgba(234,179,8,0.3)]">
              <i className="fas fa-trophy"></i>
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">Fim de Jogo</h2>
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
