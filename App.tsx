
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

  // Sincronização de Chat e Movimentos
  useEffect(() => {
    if (!onlineRoom) return;

    const roomRef = db.ref(`rooms/${onlineRoom}`);
    
    const handleValue = (snapshot: any) => {
      const data = snapshot.val();
      if (!data) return;

      // 1. Sincronizar Jogadores
      if (playerColor === 'w' && data.playerB && !opponent) {
        setOpponent(data.playerB);
        setIsWaiting(false);
      } else if (playerColor === 'b' && data.playerA && !opponent) {
        setOpponent(data.playerA);
      }

      // 2. Sincronizar Movimentos
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
          if (state === 'checkmate') setGameOver(`Fim de jogo: Vitória das ${lastMove.move.piece.color === 'w' ? 'Brancas' : 'Pretas'}`);
        }
      }

      // 3. Sincronizar Chat
      if (data.messages) {
        setMessages(Object.values(data.messages));
      }

      // 4. Status
      if (data.status === 'resigned') setGameOver('O oponente desistiu.');
    };

    roomRef.on('value', handleValue);
    return () => roomRef.off('value', handleValue);
  }, [onlineRoom, playerColor, opponent]);

  const joinRoom = useCallback((roomId: string) => {
    const roomRef = db.ref(`rooms/${roomId}`);
    roomRef.once('value', (snap) => {
      const data = snap.val();
      if (data) {
        setOnlineRoom(roomId);
        setGameMode(GameMode.ONLINE);
        setPlayerColor('b');
        setOpponent(data.playerA);
        roomRef.child('playerB').set(currentUser);
        roomRef.child('status').set('playing');
      }
    });
  }, [currentUser]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) joinRoom(room);
  }, [joinRoom]);

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
      if (state === 'checkmate') setGameOver(`Xeque-mate! Vitória das ${move.piece.color === 'w' ? 'Brancas' : 'Pretas'}`);
    }
  }, [board, turn, gameMode, playerColor, onlineRoom, gameOver, history.length]);

  const sendMessage = (text: string) => {
    if (!onlineRoom) return;
    const msgId = Date.now();
    db.ref(`rooms/${onlineRoom}/messages/${msgId}`).set({
      user: currentUser.name,
      text: text
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
    if (onlineRoom) db.ref(`rooms/${onlineRoom}/status`).set('resigned');
    setGameOver('Você desistiu.');
  };

  // IA move handler
  useEffect(() => {
    if (gameMode === GameMode.AI && turn === 'b' && !gameOver) {
      const timeout = setTimeout(() => {
        const move = getBestMove(board, 'b');
        if (move) handleMove(move);
      }, 600);
      return () => clearTimeout(timeout);
    }
  }, [turn, gameMode, board, gameOver, handleMove]);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#312e2b] text-white overflow-hidden">
      <Sidebar user={currentUser} />
      
      <main className="flex-1 flex flex-col items-center overflow-y-auto pb-20 md:pb-0 pt-4 px-2 md:px-4">
        <div className="flex flex-col lg:flex-row gap-4 md:gap-8 w-full max-w-6xl items-center lg:items-start lg:mt-4">
          
          <div className="w-full max-w-[600px] flex flex-col gap-2">
            <div className="flex justify-between items-center px-2 py-1 bg-[#262421]/50 rounded border border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#262421] rounded flex items-center justify-center text-gray-500">
                  <i className={`fas ${gameMode === GameMode.AI ? 'fa-robot' : 'fa-user'}`}></i>
                </div>
                <span className="font-bold text-xs">{opponent?.name || (gameMode === GameMode.AI ? 'Computador' : 'Oponente')}</span>
              </div>
              <div className={`px-3 py-1 rounded font-mono text-xl ${turn !== playerColor && !gameOver ? 'bg-white text-black' : 'bg-[#211f1c] text-gray-400'}`}>
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

            <div className="flex justify-between items-center px-2 py-1 bg-[#262421]/50 rounded border border-white/5">
              <div className="flex items-center gap-2">
                <img src={currentUser.avatar} className="w-8 h-8 rounded" alt="Me" />
                <span className="font-bold text-xs">{currentUser.name}</span>
              </div>
              <div className={`px-3 py-1 rounded font-mono text-xl ${turn === playerColor && !gameOver ? 'bg-white text-black' : 'bg-[#211f1c] text-gray-400'}`}>
                {Math.floor(timers[playerColor] / 60)}:{(timers[playerColor] % 60).toString().padStart(2, '0')}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[360px] flex flex-col gap-4">
            <div className="h-[400px]">
              <GameControls 
                history={history} 
                onUndo={() => setBoard(createInitialBoard())} 
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
                <button onClick={createOnlineGame} className="bg-[#81b64c] hover:bg-[#95c562] py-4 rounded-lg font-bold text-xl shadow-[0_4px_0_rgb(69,101,40)] transition-all active:translate-y-1">
                  JOGAR ONLINE
                </button>
                <button onClick={() => setGameMode(GameMode.AI)} className="bg-[#3c3a37] py-4 rounded-lg font-bold transition-all">
                  CONTRA IA
                </button>
              </div>
            )}
          </div>
        </div>

        {isWaiting && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4">
            <div className="bg-[#262421] p-8 rounded-2xl border border-white/10 text-center max-w-sm w-full shadow-2xl">
              <div className="animate-spin text-4xl text-[#81b64c] mb-6"><i className="fas fa-circle-notch"></i></div>
              <h2 className="text-2xl font-bold mb-2">Aguardando...</h2>
              <p className="text-gray-400 text-sm mb-6">Envie o link para um amigo jogar:</p>
              <div className="bg-[#1a1917] p-3 rounded-xl mb-6 flex flex-col gap-2">
                <input readOnly value={`${window.location.origin}/?room=${onlineRoom}`} className="bg-transparent text-[10px] text-[#81b64c] text-center outline-none" />
                <button onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/?room=${onlineRoom}`);
                  setCopyFeedback(true);
                  setTimeout(() => setCopyFeedback(false), 2000);
                }} className="bg-[#3c3a37] py-2 rounded font-bold text-xs">{copyFeedback ? 'COPIADO!' : 'COPIAR LINK'}</button>
              </div>
              <button onClick={() => window.location.reload()} className="text-red-500 font-bold text-xs uppercase">Cancelar</button>
            </div>
          </div>
        )}

        {gameOver && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
            <div className="bg-[#262421] p-8 rounded-2xl border border-white/10 text-center shadow-2xl max-w-xs w-full">
              <h2 className="text-2xl font-bold mb-2">Fim de Jogo</h2>
              <p className="text-gray-400 text-sm mb-8">{gameOver}</p>
              <button onClick={() => window.location.reload()} className="w-full bg-[#81b64c] py-4 rounded-xl font-bold text-white shadow-[0_4px_0_rgb(69,101,40)]">NOVA PARTIDA</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
