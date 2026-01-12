
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChessBoard from './components/ChessBoard';
import GameControls from './components/GameControls';
import { Board, Move, Color, GameMode, User } from './types';
import { createInitialBoard, makeMove, getGameState, getBestMove, isValidMove } from './services/chessLogic';
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

  // Refs para controle de sincronização sem disparar re-renders excessivos
  const historyCountRef = useRef(0);
  const boardRef = useRef<Board>(createInitialBoard());

  const [currentUser] = useState<User>(() => ({
    ...DEFAULT_USER,
    id: `u_${Math.random().toString(36).substr(2, 5)}`,
    name: `Player_${Math.floor(Math.random() * 9000) + 1000}`,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`
  }));

  // Sincronização em tempo real via Firebase
  useEffect(() => {
    if (!onlineRoom) return;

    const gameRef = db.ref(`rooms/${onlineRoom}`);
    
    // Listener para o estado da sala (Jogadores e Status)
    gameRef.on('value', (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      if (playerColor === 'w') {
        if (data.playerB && !opponent) setOpponent(data.playerB);
        if (data.status === 'playing' && isWaiting) setIsWaiting(false);
      } else {
        if (data.playerA && !opponent) setOpponent(data.playerA);
      }

      if (data.status === 'resigned') setGameOver('O oponente abandonou a partida.');
    });

    // Listener ATÔMICO para movimentos (Garante que o jogo flua)
    const movesRef = db.ref(`rooms/${onlineRoom}/moves`);
    movesRef.on('child_added', (snapshot) => {
      const moveData = snapshot.val();
      if (!moveData) return;

      // Só aplica se ainda não tivermos esse lance no histórico local
      setHistory(prev => {
        const alreadyExists = prev.some(m => 
          m.from.row === moveData.move.from.row && 
          m.from.col === moveData.move.from.col &&
          m.to.row === moveData.move.to.row && 
          m.to.col === moveData.move.to.col &&
          m.piece.type === moveData.move.piece.type
        );

        if (!alreadyExists) {
          const newMove = moveData.move;
          const newBoard = makeMove(boardRef.current, newMove);
          boardRef.current = newBoard;
          setBoard(newBoard);
          setTurn(moveData.nextTurn);
          historyCountRef.current += 1;
          
          const state = getGameState(newBoard, moveData.nextTurn);
          if (state === 'checkmate') setGameOver(`Fim de jogo: Xeque-mate!`);
          return [...prev, newMove];
        }
        return prev;
      });
    });

    // Listener para Chat
    const chatRef = db.ref(`rooms/${onlineRoom}/messages`);
    chatRef.on('value', (snapshot) => {
      const msgs = snapshot.val();
      if (msgs) {
        setMessages(Object.values(msgs));
      }
    });

    return () => {
      gameRef.off();
      movesRef.off();
      chatRef.off();
    };
  }, [onlineRoom, playerColor, opponent, isWaiting]);

  const joinRoom = useCallback((roomId: string) => {
    const roomRef = db.ref(`rooms/${roomId}`);
    roomRef.once('value').then((snap) => {
      const data = snap.val();
      if (data && data.status === 'waiting') {
        setOnlineRoom(roomId);
        setGameMode(GameMode.ONLINE);
        setPlayerColor('b');
        setOpponent(data.playerA);
        roomRef.update({
          playerB: currentUser,
          status: 'playing'
        });
      }
    });
  }, [currentUser]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) joinRoom(room);
  }, [joinRoom]);

  const executeLocalMove = (move: Move) => {
    const newBoard = makeMove(boardRef.current, move);
    boardRef.current = newBoard;
    const nextTurn = turn === 'w' ? 'b' : 'w';
    setBoard(newBoard);
    setTurn(nextTurn);
    setHistory(prev => [...prev, move]);
    historyCountRef.current += 1;
    
    const state = getGameState(newBoard, nextTurn);
    if (state === 'checkmate') setGameOver(`Fim de jogo: Xeque-mate!`);
  };

  const handleMove = useCallback((move: Move) => {
    if (gameOver) return;
    
    if (gameMode === GameMode.ONLINE) {
      if (turn !== playerColor || !onlineRoom) return;
      
      const nextTurn = turn === 'w' ? 'b' : 'w';
      // Enviamos apenas o lance para o Firebase, o listener child_added cuidará de atualizar o tabuleiro local
      db.ref(`rooms/${onlineRoom}/moves`).push({
        move,
        nextTurn,
        timestamp: Date.now()
      });
    } else {
      executeLocalMove(move);
    }
  }, [turn, gameMode, playerColor, onlineRoom, gameOver]);

  const sendMessage = (text: string) => {
    if (!onlineRoom) return;
    db.ref(`rooms/${onlineRoom}/messages`).push({
      user: currentUser.name,
      text: text,
      timestamp: Date.now()
    });
  };

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
    if (onlineRoom) db.ref(`rooms/${onlineRoom}`).update({ status: 'resigned' });
    setGameOver('Você abandonou a partida.');
  };

  // IA move handler
  useEffect(() => {
    if (gameMode === GameMode.AI && turn === 'b' && !gameOver) {
      const timeout = setTimeout(() => {
        const move = getBestMove(boardRef.current, 'b');
        if (move) executeLocalMove(move);
      }, 800);
      return () => clearTimeout(timeout);
    }
  }, [turn, gameMode, gameOver]);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#312e2b] text-white overflow-hidden">
      <Sidebar user={currentUser} />
      
      <main className="flex-1 flex flex-col items-center overflow-y-auto pb-20 md:pb-0 pt-4 px-2 md:px-4">
        <div className="flex flex-col lg:flex-row gap-4 md:gap-8 w-full max-w-6xl items-center lg:items-start lg:mt-4">
          
          <div className="w-full max-w-[600px] flex flex-col gap-2">
            {/* Opponent Card */}
            <div className="flex justify-between items-center px-4 py-2 bg-[#262421]/50 rounded border border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#262421] rounded flex items-center justify-center text-gray-500">
                  <i className={`fas ${gameMode === GameMode.AI ? 'fa-robot' : 'fa-user'}`}></i>
                </div>
                <div className="flex flex-col">
                   <span className="font-bold text-xs truncate max-w-[120px]">{opponent?.name || (gameMode === GameMode.AI ? 'Stockfish Lite' : 'Oponente')}</span>
                   <span className="text-[10px] text-gray-500">ELO {opponent?.elo || 1200}</span>
                </div>
              </div>
              <div className={`px-3 py-1 rounded font-mono text-xl transition-all ${turn !== playerColor && !gameOver ? 'bg-white text-black shadow-lg' : 'bg-[#211f1c] text-gray-400'}`}>
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

            {/* User Card */}
            <div className="flex justify-between items-center px-4 py-2 bg-[#262421]/50 rounded border border-white/5">
              <div className="flex items-center gap-2">
                <img src={currentUser.avatar} className="w-8 h-8 rounded-md border border-white/10" alt="Me" />
                <div className="flex flex-col">
                  <span className="font-bold text-xs">{currentUser.name}</span>
                  <span className="text-[10px] text-[#81b64c]">ELO {currentUser.elo}</span>
                </div>
              </div>
              <div className={`px-3 py-1 rounded font-mono text-xl transition-all ${turn === playerColor && !gameOver ? 'bg-white text-black shadow-lg' : 'bg-[#211f1c] text-gray-400'}`}>
                {Math.floor(timers[playerColor] / 60)}:{(timers[playerColor] % 60).toString().padStart(2, '0')}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[360px] flex flex-col gap-4">
            <div className="h-[400px]">
              <GameControls 
                history={history} 
                onUndo={() => gameMode !== GameMode.ONLINE && (boardRef.current = createInitialBoard(), setBoard(boardRef.current), setHistory([]), setTurn('w'))} 
                onResign={handleResign} 
                turn={turn}
                whiteTimer={timers.w} blackTimer={timers.b} 
                gameMode={gameMode}
                messages={messages}
                onSendMessage={sendMessage}
              />
            </div>
            
            {gameMode === GameMode.LOCAL && !onlineRoom && (
              <div className="flex flex-col gap-2">
                <button onClick={createOnlineGame} className="bg-[#81b64c] hover:bg-[#95c562] py-4 rounded-lg font-bold text-xl shadow-[0_4px_0_rgb(69,101,40)] active:translate-y-1">
                  JOGAR ONLINE
                </button>
                <button onClick={() => { setGameMode(GameMode.AI); boardRef.current = createInitialBoard(); setBoard(boardRef.current); setHistory([]); setGameOver(null); }} className="bg-[#3c3a37] py-3 rounded-lg font-bold">
                  CONTRA COMPUTADOR
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modal Wait */}
        {isWaiting && (
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[100] p-4">
            <div className="bg-[#262421] p-8 rounded-2xl border border-white/10 text-center max-w-sm w-full shadow-2xl">
              <div className="animate-spin text-3xl text-[#81b64c] mb-4"><i className="fas fa-circle-notch"></i></div>
              <h2 className="text-2xl font-bold mb-4">Desafie um Amigo</h2>
              <div className="bg-[#1a1917] p-3 rounded-xl mb-6 flex flex-col gap-3">
                <div className="text-[10px] text-gray-500 truncate font-mono">
                  {window.location.origin}/?room={onlineRoom}
                </div>
                <button 
                  onClick={() => {
                    const link = `${window.location.origin}/?room=${onlineRoom}`;
                    navigator.clipboard.writeText(link);
                    setCopyFeedback(true);
                    setTimeout(() => setCopyFeedback(false), 2000);
                  }} 
                  className={`py-3 rounded-lg font-bold text-sm ${copyFeedback ? 'bg-[#81b64c]' : 'bg-[#3c3a37]'}`}
                >
                  {copyFeedback ? 'COPIADO!' : 'COPIAR LINK'}
                </button>
              </div>
              <button onClick={() => window.location.reload()} className="text-red-500 font-bold text-xs uppercase">Cancelar</button>
            </div>
          </div>
        )}

        {/* Modal GameOver */}
        {gameOver && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-[#262421] p-8 rounded-2xl border border-white/10 text-center shadow-2xl max-w-xs w-full">
              <h2 className="text-2xl font-bold mb-2">Fim de Jogo</h2>
              <p className="text-gray-400 text-sm mb-8">{gameOver}</p>
              <button onClick={() => window.location.assign(window.location.origin)} className="w-full bg-[#81b64c] py-4 rounded-xl font-bold text-white shadow-[0_4px_0_rgb(69,101,40)]">
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
