
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

  // Refs para manter consistência absoluta fora do ciclo de render do React
  const boardRef = useRef<Board>(createInitialBoard());
  const historyRef = useRef<Move[]>([]);
  const lastMoveIdx = useRef(-1);

  const [currentUser] = useState<User>(() => ({
    ...DEFAULT_USER,
    id: `u_${Math.random().toString(36).substr(2, 5)}`,
    name: `Player_${Math.floor(Math.random() * 9000) + 1000}`,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`
  }));

  // Sincroniza refs com estado para uso em callbacks assíncronos
  useEffect(() => {
    boardRef.current = board;
    historyRef.current = history;
  }, [board, history]);

  const setupGameListeners = (roomId: string) => {
    const roomRef = db.ref(`rooms/${roomId}`);
    
    // Escuta movimentos individuais
    roomRef.child('moves').on('child_added', (snapshot) => {
      const data = snapshot.val();
      const moveIdx = parseInt(snapshot.key || "0");

      if (moveIdx > lastMoveIdx.current) {
        lastMoveIdx.current = moveIdx;
        const move: Move = data.move;
        
        // Aplica o movimento
        const updatedBoard = makeMove(boardRef.current, move);
        const nextTurn = data.nextTurn;

        setBoard(updatedBoard);
        setTurn(nextTurn);
        setHistory(prev => (prev.length <= moveIdx ? [...prev, move] : prev));

        const state = getGameState(updatedBoard, nextTurn);
        if (state === 'checkmate') setGameOver(`Xeque-mate! Vitoria das ${move.piece.color === 'w' ? 'Brancas' : 'Pretas'}`);
        else if (state === 'stalemate') setGameOver('Empate por afogamento.');
      }
    });

    // Escuta mensagens do chat
    roomRef.child('messages').on('child_added', (snap) => {
      setMessages(prev => [...prev, snap.val()]);
    });

    // Escuta status de desistência
    roomRef.child('status').on('value', (snap) => {
      if (snap.val() === 'resigned' && !gameOver) {
        setGameOver('O oponente desistiu da partida.');
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

    roomRef.child('playerB').on('value', (snap) => {
      if (snap.val()) {
        setOpponent(snap.val());
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
    roomRef.child('playerB').set(currentUser);
    roomRef.child('status').set('playing');
    
    roomRef.child('playerA').once('value', (snap) => {
      setOpponent(snap.val());
    });

    setupGameListeners(roomId);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) joinRoom(room);
  }, []);

  const handleMove = useCallback((move: Move) => {
    if (gameOver) return;
    if (gameMode === GameMode.ONLINE && turn !== playerColor) return;

    // No modo online, o movimento é confirmado via Firebase para ambos
    if (gameMode === GameMode.ONLINE && onlineRoom) {
      const nextIdx = historyRef.current.length;
      db.ref(`rooms/${onlineRoom}/moves/${nextIdx}`).set({
        move,
        nextTurn: turn === 'w' ? 'b' : 'w',
        timestamp: Date.now()
      });
    } else {
      // Modo Local: Atualização imediata
      const newBoard = makeMove(board, move);
      const nextTurn = turn === 'w' ? 'b' : 'w';
      setBoard(newBoard);
      setTurn(nextTurn);
      setHistory(prev => [...prev, move]);
      
      const state = getGameState(newBoard, nextTurn);
      if (state === 'checkmate') setGameOver('Xeque-mate!');
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

  // Timer Tick
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
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col lg:flex-row gap-8 w-full max-w-6xl items-center lg:items-start">
          
          <div className="flex flex-col w-full max-w-[560px]">
            {/* Oponente UI */}
            <div className="flex justify-between items-center mb-2 bg-[#262421] p-3 rounded">
              <div className="flex items-center gap-3">
                <img src={opponent?.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=robot'} className="w-10 h-10 rounded bg-[#3c3a37]" />
                <span className="font-bold text-sm">{opponent?.name || 'Aguardando...'}</span>
              </div>
              <div className={`px-4 py-1 rounded font-mono text-2xl ${turn !== playerColor ? 'bg-white text-black' : 'text-gray-500'}`}>
                {Math.floor(timers[playerColor === 'w' ? 'b' : 'w'] / 60)}:{(timers[playerColor === 'w' ? 'b' : 'w'] % 60).toString().padStart(2, '0')}
              </div>
            </div>

            <ChessBoard board={board} onMove={handleMove} turn={turn} isFlipped={playerColor === 'b'} />

            {/* Player UI */}
            <div className="flex justify-between items-center mt-2 bg-[#262421] p-3 rounded">
              <div className="flex items-center gap-3">
                <img src={currentUser.avatar} className="w-10 h-10 rounded bg-[#3c3a37]" />
                <span className="font-bold text-sm">{currentUser.name} (Você)</span>
              </div>
              <div className={`px-4 py-1 rounded font-mono text-2xl ${turn === playerColor ? 'bg-white text-black' : 'text-gray-500'}`}>
                {Math.floor(timers[playerColor] / 60)}:{(timers[playerColor] % 60).toString().padStart(2, '0')}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[360px] h-[600px]">
            <GameControls 
              history={history} 
              onUndo={() => {}} 
              onResign={handleResign} 
              turn={turn}
              whiteTimer={timers.w} blackTimer={timers.b} 
              gameMode={gameMode} messages={messages} onSendMessage={handleSendMessage}
            />
            {!onlineRoom && (
              <button onClick={createOnlineGame} className="w-full mt-4 bg-[#81b64c] hover:bg-[#95c562] py-4 rounded font-bold text-white shadow-[0_4px_0_rgb(69,101,40)] transition-all">
                NOVA PARTIDA ONLINE
              </button>
            )}
          </div>
        </div>
      </main>

      {isWaiting && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[50]">
          <div className="bg-[#262421] p-8 rounded-xl text-center max-w-sm border border-white/10">
            <h2 className="text-xl font-bold mb-4">Convidar Amigo</h2>
            <p className="text-gray-400 text-sm mb-6">Envie o link abaixo para jogar:</p>
            <div className="bg-[#1a1917] p-3 rounded mb-6 flex items-center">
              <input readOnly value={`${window.location.origin}/?room=${onlineRoom}`} className="bg-transparent text-[10px] flex-1 outline-none text-[#81b64c]" />
              <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/?room=${onlineRoom}`); alert('Copiado!'); }} className="ml-2 text-xs bg-gray-700 px-2 py-1 rounded">Copiar</button>
            </div>
            <button onClick={() => window.location.href = '/'} className="text-xs uppercase font-bold text-red-500">Cancelar</button>
          </div>
        </div>
      )}

      {gameOver && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100]">
          <div className="bg-[#262421] p-10 rounded-2xl text-center border border-white/10">
            <h2 className="text-3xl font-bold mb-4">Fim de Jogo</h2>
            <p className="text-gray-400 mb-8">{gameOver}</p>
            <button onClick={() => window.location.href = '/'} className="bg-[#81b64c] px-10 py-3 rounded font-bold">VOLTAR AO INÍCIO</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
