
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChessBoard from './components/ChessBoard';
import GameControls from './components/GameControls';
import { Board, Move, Color, GameMode } from './types';
import { createInitialBoard, makeMove, getGameState, isCheck } from './services/chessLogic';
import { saveGameToLocal } from './services/storage';

// @ts-ignore
const Peer = window.Peer;

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

  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);

  const addSystemMsg = (text: string) => {
    setMessages(prev => [...prev, { user: 'Sistema', text }]);
  };

  const getPeerConfig = () => ({
    debug: 1,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    }
  });

  const setupConnection = (conn: any) => {
    connRef.current = conn;
    
    conn.on('open', () => {
      setIsWaiting(false);
      addSystemMsg('Oponente conectado! Boa sorte.');
    });

    conn.on('data', (data: any) => {
      if (data.type === 'MOVE') syncMove(data.payload);
      else if (data.type === 'CHAT') setMessages(prev => [...prev, data.payload]);
      else if (data.type === 'RESIGN') setGameOver('Oponente desistiu da partida');
    });

    conn.on('close', () => {
      addSystemMsg('Oponente saiu da partida.');
      connRef.current = null;
    });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    
    if (roomId && !peerRef.current && typeof Peer !== 'undefined') {
      setIsWaiting(true);
      setGameMode(GameMode.ONLINE);
      setPlayerColor('b');
      addSystemMsg('Entrando na sala...');

      const peer = new Peer(getPeerConfig());
      peerRef.current = peer;

      peer.on('open', () => {
        const conn = peer.connect(roomId, { reliable: true });
        setupConnection(conn);
      });

      peer.on('error', (err: any) => {
        setIsWaiting(false);
        addSystemMsg('Erro ao conectar na sala: ' + err.type);
      });
    }
  }, []);

  const createOnlineGame = () => {
    if (typeof Peer === 'undefined') return;

    setIsWaiting(true);
    setGameMode(GameMode.ONLINE);
    setPlayerColor('w');
    
    if (peerRef.current) peerRef.current.destroy();

    const peer = new Peer(getPeerConfig());
    peerRef.current = peer;

    peer.on('open', (id: string) => {
      setOnlineRoom(id);
      addSystemMsg('Sala online criada. Copie o link abaixo.');
    });

    peer.on('connection', (conn: any) => {
      setupConnection(conn);
    });

    peer.on('error', (err: any) => {
      setIsWaiting(false);
      addSystemMsg('Erro no servidor de jogo: ' + err.type);
    });
  };

  const syncMove = (move: Move) => {
    setBoard(prev => {
      const nextBoard = makeMove(prev, move);
      const nextTurn = move.piece.color === 'w' ? 'b' : 'w';
      const gameState = getGameState(nextBoard, nextTurn);
      if (gameState === 'checkmate') setGameOver(`Xeque-mate! Vitória das ${move.piece.color === 'w' ? 'Brancas' : 'Pretas'}`);
      else if (gameState === 'stalemate') setGameOver('Empate');
      setTurn(nextTurn);
      return nextBoard;
    });
    setHistory(prev => [...prev, move]);
  };

  const handleMove = useCallback((move: Move) => {
    if (gameOver) return;
    if (gameMode === GameMode.ONLINE && turn !== playerColor) return;

    const newBoard = makeMove(board, move);
    const nextTurn = turn === 'w' ? 'b' : 'w';
    
    setBoard(newBoard);
    setHistory(prev => [...prev, move]);
    setTurn(nextTurn);

    const gameState = getGameState(newBoard, nextTurn);
    if (gameState === 'checkmate') setGameOver(`Xeque-mate! Vitória das ${turn === 'w' ? 'Brancas' : 'Pretas'}`);
    else if (gameState === 'stalemate') setGameOver('Empate por afogamento');

    if (gameMode === GameMode.ONLINE && connRef.current) {
      connRef.current.send({ type: 'MOVE', payload: move });
    }
  }, [gameOver, turn, gameMode, playerColor, board]);

  const handleResign = () => {
    if (gameMode === GameMode.ONLINE && connRef.current) {
      connRef.current.send({ type: 'RESIGN' });
    }
    setGameOver(`Fim de jogo. Vitória das ${playerColor === 'w' ? 'Pretas' : 'Brancas'}`);
  };

  useEffect(() => {
    if (gameOver && history.length > 0) {
      saveGameToLocal({
        id: Math.random().toString(36).substr(2, 9),
        date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        result: gameOver,
        moves: history,
        mode: gameMode
      });
    }
  }, [gameOver]);

  const handleUndo = useCallback(() => {
    if (history.length === 0 || gameMode === GameMode.ONLINE || gameOver) return;
    const newHistory = history.slice(0, -1);
    const newBoard = createInitialBoard();
    let currentBoard = newBoard;
    newHistory.forEach(m => { currentBoard = makeMove(currentBoard, m); });
    setBoard(currentBoard);
    setHistory(newHistory);
    setTurn(newHistory.length % 2 === 0 ? 'w' : 'b');
  }, [history, gameMode, gameOver]);

  useEffect(() => {
    if (gameOver || isWaiting) return;
    const interval = setInterval(() => {
      setTimers(prev => {
        const newVal = prev[turn] - 1;
        if (newVal <= 0) {
          setGameOver(`Tempo esgotado! Vitória das ${turn === 'w' ? 'Pretas' : 'Brancas'}`);
          return { ...prev, [turn]: 0 };
        }
        return { ...prev, [turn]: newVal };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [turn, gameOver, isWaiting]);

  const getInviteUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', onlineRoom || '');
    return url.toString();
  };

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-[#312e2b]">
      <Sidebar key={gameOver ? 'game-over' : 'game-active'} />
      <main className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4 lg:p-8 space-y-6 lg:space-y-0 lg:flex-row lg:space-x-8">
        <div className="flex flex-col items-center w-full max-w-[600px] relative">
          <div className="w-full flex justify-between items-center mb-4 px-2">
            <div className="flex items-center space-x-3 text-white">
              <div className={`w-3 h-3 rounded-full ${gameMode === GameMode.ONLINE ? 'bg-green-500' : 'bg-gray-500'}`}></div>
              <span className="font-bold text-gray-300 text-sm">
                {gameMode === GameMode.ONLINE ? `Jogo Online (${playerColor === 'w' ? 'Brancas' : 'Pretas'})` : 'Jogo Local'}
              </span>
              {isCheck(board, turn) && !gameOver && (
                <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded animate-pulse">XEQUE!</span>
              )}
            </div>
            {!onlineRoom && !isWaiting && (
              <button onClick={createOnlineGame} className="bg-[#81b64c] hover:bg-[#95c562] px-6 py-2.5 rounded-lg text-sm font-bold text-white shadow-[0_4px_0_rgb(69,101,40)] transition-all active:translate-y-[2px] active:shadow-none">
                <i className="fas fa-user-plus mr-2"></i> Desafiar Amigo
              </button>
            )}
          </div>

          <ChessBoard board={board} onMove={handleMove} turn={turn} />

          {/* Modal de Convite Atualizado */}
          {isWaiting && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
              <div className="bg-[#262421] w-full max-w-md rounded-2xl shadow-2xl border border-[#3c3a37] overflow-hidden transform transition-all">
                <div className="p-1 bg-[#81b64c]"></div>
                <div className="p-8">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-2xl font-bold text-white mb-1">Convidar para Jogar</h3>
                      <p className="text-gray-400 text-sm">Aguardando seu oponente entrar na sala...</p>
                    </div>
                    <button onClick={() => { window.location.href = window.location.pathname; }} className="text-gray-500 hover:text-white transition-colors">
                      <i className="fas fa-times text-xl"></i>
                    </button>
                  </div>
                  
                  {!onlineRoom ? (
                    <div className="flex flex-col items-center py-10 space-y-4">
                      <div className="w-12 h-12 border-4 border-[#81b64c] border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-[#81b64c] font-medium animate-pulse">Gerando link da sala...</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="relative group">
                        <label className="text-[10px] font-bold text-gray-500 uppercase mb-2 block ml-1">Link de Convite</label>
                        <div className="flex items-center bg-[#1a1917] p-4 rounded-xl border-2 border-[#3c3a37] group-hover:border-[#81b64c] transition-colors">
                          <input 
                            readOnly 
                            value={getInviteUrl()} 
                            className="bg-transparent text-sm text-gray-300 flex-1 outline-none truncate font-mono mr-3" 
                          />
                          <button 
                            onClick={() => { 
                              navigator.clipboard.writeText(getInviteUrl()); 
                              setCopySuccess(true); 
                              setTimeout(() => setCopySuccess(false), 3000);
                            }} 
                            className={`px-4 py-2 rounded-lg font-bold text-xs transition-all flex items-center space-x-2 ${copySuccess ? 'bg-[#81b64c] text-white' : 'bg-[#3c3a37] text-[#81b64c] hover:bg-[#4a4844]'}`}
                          >
                            <i className={`fas ${copySuccess ? 'fa-check' : 'fa-copy'}`}></i>
                            <span>{copySuccess ? 'Copiado!' : 'Copiar'}</span>
                          </button>
                        </div>
                      </div>

                      <div className="p-4 bg-[#81b64c]/10 rounded-xl border border-[#81b64c]/20 flex items-center space-x-4">
                        <div className="w-10 h-10 bg-[#81b64c]/20 rounded-full flex items-center justify-center">
                          <i className="fas fa-info-circle text-[#81b64c]"></i>
                        </div>
                        <p className="text-xs text-gray-300 leading-relaxed">
                          Envie este link para seu amigo. Assim que ele clicar, a partida começará automaticamente!
                        </p>
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-8 flex justify-center">
                    <button 
                      onClick={() => { window.location.href = window.location.pathname; }} 
                      className="text-gray-500 text-sm font-medium hover:text-red-400 transition-colors flex items-center space-x-2"
                    >
                      <i className="fas fa-ban"></i>
                      <span>Cancelar Desafio</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="w-full lg:w-[400px] h-full max-h-[600px]">
          <GameControls 
            history={history} 
            onUndo={handleUndo} 
            onResign={handleResign}
            turn={turn}
            whiteTimer={timers.w}
            blackTimer={timers.b}
            gameMode={gameMode}
            messages={messages}
            onSendMessage={(t) => {
              const msg = { user: playerColor === 'w' ? 'Brancas' : 'Pretas', text: t };
              setMessages(p => [...p, msg]);
              if (connRef.current) connRef.current.send({ type: 'CHAT', payload: msg });
            }}
          />
        </div>
      </main>

      {gameOver && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[150] p-4">
          <div className="bg-[#262421] p-10 rounded-2xl shadow-2xl border border-white/10 max-w-sm w-full text-center scale-up-center">
            <div className="mb-6">
              <i className="fas fa-trophy text-5xl text-[#81b64c] mb-4"></i>
              <h2 className="text-3xl font-bold text-white">Fim de Jogo</h2>
            </div>
            <p className="text-gray-300 text-lg mb-8 leading-relaxed font-medium">{gameOver}</p>
            <button 
              onClick={() => window.location.href = window.location.pathname} 
              className="w-full bg-[#81b64c] hover:bg-[#95c562] py-4 rounded-xl font-bold transition-all shadow-[0_5px_0_rgb(69,101,40)] active:translate-y-[2px] active:shadow-none text-white text-lg"
            >
              Jogar Novamente
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
