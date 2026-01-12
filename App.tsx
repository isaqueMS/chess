
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChessBoard from './components/ChessBoard';
import GameControls from './components/GameControls';
import { Board, Move, Color, GameMode } from './types';
import { createInitialBoard, makeMove, getGameState } from './services/chessLogic';
import { db } from './services/firebase';

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
  const [copySuccess, setCopySuccess] = useState(false);
  const [messages, setMessages] = useState<{user: string, text: string}[]>([]);

  const skipNextRemoteUpdate = useRef(false);

  // Escuta mudanças no Firebase
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    
    if (roomId) {
      setOnlineRoom(roomId);
      setGameMode(GameMode.ONLINE);
      setPlayerColor('b'); 
      setIsWaiting(false);

      const roomRef = db.ref(`rooms/${roomId}`);
      
      // Avisa que o oponente entrou
      roomRef.child('status').set('playing');

      roomRef.on('value', (snapshot: any) => {
        const data = snapshot.val();
        if (!data) return;

        if (skipNextRemoteUpdate.current) {
          skipNextRemoteUpdate.current = false;
          return;
        }

        // Sincronizar Histórico e Tabuleiro
        if (data.moves && data.moves.length !== history.length) {
          let currentBoard = createInitialBoard();
          data.moves.forEach((m: Move) => {
            currentBoard = makeMove(currentBoard, m);
          });
          setBoard(currentBoard);
          setHistory(data.moves);
        }
        
        // Sincronizar Turno
        if (data.lastTurn && data.lastTurn !== turn) {
          setTurn(data.lastTurn);
        }

        if (data.messages) {
          setMessages(data.messages);
        }

        if (data.status === 'resigned' && !gameOver) {
          setGameOver('O oponente desistiu da partida.');
        }
      });

      return () => roomRef.off();
    }
  }, [onlineRoom, history.length, turn, gameOver]);

  const createOnlineGame = () => {
    const id = Math.random().toString(36).substring(2, 9);
    setOnlineRoom(id);
    setGameMode(GameMode.ONLINE);
    setPlayerColor('w');
    setIsWaiting(true);
    
    const initialData = {
      status: 'waiting',
      moves: [],
      messages: [{ user: 'Sistema', text: 'Aguardando oponente entrar...' }],
      createdAt: Date.now(),
      lastTurn: 'w'
    };

    db.ref(`rooms/${id}`).set(initialData);

    db.ref(`rooms/${id}/status`).on('value', (snapshot: any) => {
      if (snapshot.val() === 'playing') {
        setIsWaiting(false);
      }
    });
  };

  const handleMove = useCallback((move: Move) => {
    if (gameOver) return;
    
    if (gameMode === GameMode.ONLINE && turn !== playerColor) {
      return;
    }

    const newBoard = makeMove(board, move);
    const nextTurn = turn === 'w' ? 'b' : 'w';
    
    setBoard(newBoard);
    const newHistory = [...history, move];
    setHistory(newHistory);
    setTurn(nextTurn);

    if (gameMode === GameMode.ONLINE && onlineRoom) {
      skipNextRemoteUpdate.current = true;
      db.ref(`rooms/${onlineRoom}`).update({
        moves: newHistory,
        lastTurn: nextTurn,
        status: 'playing'
      });
    }

    const gameState = getGameState(newBoard, nextTurn);
    if (gameState === 'checkmate') {
      setGameOver(`Xeque-mate! Vitória das ${turn === 'w' ? 'Brancas' : 'Pretas'}`);
    }
  }, [gameOver, turn, gameMode, playerColor, board, history, onlineRoom]);

  const handleUndo = useCallback(() => {
    if (gameMode === GameMode.ONLINE || history.length === 0 || gameOver) return;
    const newHistory = history.slice(0, -1);
    let tempBoard = createInitialBoard();
    newHistory.forEach(m => { tempBoard = makeMove(tempBoard, m); });
    setBoard(tempBoard);
    setHistory(newHistory);
    setTurn(prev => prev === 'w' ? 'b' : 'w');
  }, [gameMode, history, gameOver]);

  const handleResign = () => {
    if (gameMode === GameMode.ONLINE && onlineRoom) {
      db.ref(`rooms/${onlineRoom}`).update({ status: 'resigned' });
    }
    setGameOver(`Você desistiu. Vitória das ${playerColor === 'w' ? 'Pretas' : 'Brancas'}`);
  };

  const handleSendMessage = (text: string) => {
    const msg = { user: playerColor === 'w' ? 'Brancas' : 'Pretas', text };
    const currentMessages = messages || [];
    const newMessages = [...currentMessages, msg];
    setMessages(newMessages);
    if (gameMode === GameMode.ONLINE && onlineRoom) {
      db.ref(`rooms/${onlineRoom}`).update({ messages: newMessages });
    }
  };

  useEffect(() => {
    if (gameOver || isWaiting) return;
    const interval = setInterval(() => {
      setTimers(prev => {
        const newVal = prev[turn] - 1;
        if (newVal <= 0) {
          setGameOver(`Tempo esgotado!`);
          return { ...prev, [turn]: 0 };
        }
        return { ...prev, [turn]: newVal };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [turn, gameOver, isWaiting]);

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-[#312e2b]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4 lg:p-8 space-y-6 lg:space-y-0 lg:flex-row lg:space-x-8">
        <div className="flex flex-col items-center w-full max-w-[600px] relative">
          <div className="w-full flex justify-between items-center mb-4 px-2">
            <div className="flex items-center space-x-3 text-white">
              <div className={`w-2.5 h-2.5 rounded-full ${gameMode === GameMode.ONLINE ? 'bg-[#81b64c] shadow-[0_0_8px_#81b64c] animate-pulse' : 'bg-gray-500'}`}></div>
              <span className="font-bold text-gray-400 text-[10px] uppercase tracking-widest">
                {gameMode === GameMode.ONLINE ? `JOGANDO COMO ${playerColor === 'w' ? 'BRANCAS' : 'PRETAS'}` : 'MODO LOCAL'}
              </span>
            </div>
            {!onlineRoom && (
              <button 
                onClick={createOnlineGame} 
                className="bg-[#81b64c] hover:bg-[#95c562] px-5 py-2 rounded-lg text-xs font-bold text-white shadow-[0_3px_0_rgb(69,101,40)] active:translate-y-[1px] active:shadow-none transition-all"
              >
                Criar Partida Online
              </button>
            )}
          </div>

          <ChessBoard 
            board={board} 
            onMove={handleMove} 
            turn={turn} 
            isFlipped={playerColor === 'b'} 
          />

          {isWaiting && onlineRoom && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
              <div className="bg-[#262421] w-full max-w-sm rounded-xl shadow-2xl border border-[#3c3a37] p-8 text-center animate-in fade-in zoom-in duration-200">
                <div className="mb-4">
                  <div className="w-16 h-16 bg-[#81b64c]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-link text-[#81b64c] text-2xl"></i>
                  </div>
                  <h3 className="text-xl font-bold text-white">Convidar Amigo</h3>
                </div>
                <div className="bg-[#1a1917] p-3 rounded-lg border border-[#3c3a37] mb-6">
                  <div className="flex items-center">
                    <input readOnly value={window.location.origin + '/?room=' + onlineRoom} className="bg-transparent text-[11px] text-[#81b64c] flex-1 outline-none truncate font-mono" />
                    <button 
                      onClick={() => { 
                        navigator.clipboard.writeText(window.location.origin + '/?room=' + onlineRoom); 
                        setCopySuccess(true); 
                        setTimeout(() => setCopySuccess(false), 2000); 
                      }}
                      className="ml-2 text-gray-400 hover:text-white p-2"
                    >
                      <i className={`fas ${copySuccess ? 'fa-check text-green-500' : 'fa-copy'}`}></i>
                    </button>
                  </div>
                </div>
                <p className="text-gray-500 text-xs mb-8">Copie o link acima e envie para seu oponente.</p>
                <button onClick={() => window.location.href = '/'} className="text-red-400 text-xs hover:underline font-bold uppercase tracking-wider">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="w-full lg:w-[380px]">
          <GameControls 
            history={history} 
            onUndo={handleUndo} 
            onResign={handleResign}
            turn={turn}
            whiteTimer={timers.w}
            blackTimer={timers.b}
            gameMode={gameMode}
            messages={messages}
            onSendMessage={handleSendMessage}
          />
        </div>
      </main>

      {gameOver && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[10000] p-4">
          <div className="bg-[#262421] p-8 rounded-xl shadow-2xl border border-white/5 max-w-xs w-full text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Fim de Jogo</h2>
            <p className="text-gray-400 text-sm mb-8">{gameOver}</p>
            <button onClick={() => window.location.href = '/'} className="w-full bg-[#81b64c] py-3 rounded-lg font-bold text-white shadow-[0_3px_0_rgb(69,101,40)]">
              Jogar Novamente
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
