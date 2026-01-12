import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChessBoard from './components/ChessBoard';
import GameControls from './components/GameControls';
import { Board, Move, Color, GameMode, User } from './types';
import { createInitialBoard, makeMove, getGameState, getBestMove } from './services/chessLogic';
import { db } from './services/firebase';
import { DEFAULT_USER } from './constants';

const App: React.FC = () => {
  // O "Estado Mestre" é mantido em Refs para evitar ciclos de renderização do React resetando o jogo
  const boardRef = useRef<Board>(createInitialBoard());
  const historyRef = useRef<Move[]>([]);
  
  // Estados de Interface
  const [board, setBoard] = useState<Board>(boardRef.current);
  const [turn, setTurn] = useState<Color>('w');
  const [history, setHistory] = useState<Move[]>([]);
  const [gameOver, setGameOver] = useState<string | null>(null);
  const [timers, setTimers] = useState({ w: 600, b: 600 });
  
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.LOCAL);
  const [onlineRoom, setOnlineRoom] = useState<string | null>(null);
  const [playerColor, setPlayerColor] = useState<Color>('w');
  const [isWaiting, setIsWaiting] = useState(false);
  const [messages, setMessages] = useState<{user: string, text: string, timestamp: number}[]>([]);
  const [opponent, setOpponent] = useState<User | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Controle de Sincronização
  const lastMoveTimestamp = useRef<number>(0);

  const [currentUser] = useState<User>(() => ({
    ...DEFAULT_USER,
    id: `u_${Math.random().toString(36).substr(2, 5)}`,
    name: `Player_${Math.floor(Math.random() * 9000) + 1000}`,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`
  }));

  // Função para resetar o jogo
  const resetGame = useCallback(() => {
    const initialBoard = createInitialBoard();
    boardRef.current = initialBoard;
    historyRef.current = [];
    
    setBoard(initialBoard);
    setHistory([]);
    setTurn('w');
    setGameOver(null);
    setTimers({ w: 600, b: 600 });
  }, []);

  // Função de Execução de Lance (O coração do jogo)
  const applyMove = useCallback((move: Move) => {
    try {
      console.log('Aplicando movimento:', move);
      
      // 1. Cálculo Matemático
      const newBoard = makeMove(boardRef.current, move);
      
      // Verificação mais robusta do retorno
      if (!newBoard || !Array.isArray(newBoard) || newBoard.length !== 8) {
        console.error('Movimento inválido retornou tabuleiro inválido:', newBoard);
        return false;
      }
      
      boardRef.current = newBoard;
      historyRef.current.push(move);

      // 2. Atualização de UI (React)
      setBoard([...newBoard]);
      setHistory([...historyRef.current]);
      
      const nextTurn = move.piece.color === 'w' ? 'b' : 'w';
      setTurn(nextTurn);

      // 3. Atualizar timers (adicionar tempo após cada movimento)
      setTimers(prev => ({
        ...prev,
        [move.piece.color === 'w' ? 'b' : 'w']: prev[move.piece.color === 'w' ? 'b' : 'w'] + 2 // Adiciona 2 segundos
      }));

      // 4. Verificação de Fim de Jogo
      const state = getGameState(newBoard, nextTurn);
      if (state === 'checkmate') {
        setGameOver(`Xeque-mate! Vitória das ${move.piece.color === 'w' ? 'Brancas' : 'Pretas'}`);
      } else if (state === 'stalemate') {
        setGameOver('Empate por afogamento.');
      }
      
      return true;
    } catch (error) {
      console.error('Erro ao aplicar movimento:', error);
      return false;
    }
  }, []);

  // Função para desfazer o último movimento
  const handleUndo = useCallback(() => {
    if (historyRef.current.length === 0 || gameOver || 
        (gameMode === GameMode.ONLINE && turn !== playerColor)) return;

    // Remove o último movimento
    historyRef.current.pop();
    
    // Reconstroi o tabuleiro do início
    const newBoard = createInitialBoard();
    historyRef.current.forEach(move => {
      makeMove(newBoard, move);
    });
    
    boardRef.current = newBoard;
    setBoard([...newBoard]);
    setHistory([...historyRef.current]);
    setTurn(prev => prev === 'w' ? 'b' : 'w');
  }, [gameOver, gameMode, turn, playerColor]);

  // Loop do Cronômetro
  useEffect(() => {
    if (gameOver || isWaiting || gameMode === GameMode.LOCAL) return;

    const interval = setInterval(() => {
      setTimers(prev => {
        const currentVal = prev[turn];
        if (currentVal <= 0) {
          setGameOver(`Tempo esgotado! Vitória das ${turn === 'w' ? 'Pretas' : 'Brancas'}`);
          clearInterval(interval);
          return prev;
        }
        return { ...prev, [turn]: currentVal - 1 };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [turn, gameOver, isWaiting, gameMode]);

  // Listener do Firebase (Apenas recebe lances de terceiros)
  useEffect(() => {
    if (!onlineRoom || gameMode !== GameMode.ONLINE) return;

    const roomRef = db.ref(`rooms/${onlineRoom}`);
    
    // Escuta Metadados da Sala
    const unsubscribeRoom = roomRef.on('value', (snap) => {
      const data = snap.val();
      if (!data) return;
      
      if (playerColor === 'w' && data.playerB) setOpponent(data.playerB);
      if (playerColor === 'b' && data.playerA) setOpponent(data.playerA);
      
      if (data.status === 'playing') setIsWaiting(false);
      if (data.status === 'resigned') setGameOver('O oponente desistiu.');
      if (data.status === 'finished') {
        setGameOver(data.result || 'Partida encerrada');
      }
    });

    // Escuta Lances
    const movesRef = roomRef.child('moves');
    const unsubscribeMoves = movesRef.on('child_added', (snap) => {
      const data = snap.val();
      if (!data) return;

      // Se o lance foi feito por outra pessoa e é mais novo que o último que processamos
      if (data.playerId !== currentUser.id && data.timestamp > lastMoveTimestamp.current) {
        lastMoveTimestamp.current = data.timestamp;
        applyMove(data.move);
      }
    });

    // Chat
    const unsubscribeMessages = roomRef.child('messages').on('value', (snap) => {
      if (snap.exists()) {
        const messagesData = snap.val();
        setMessages(Object.values(messagesData));
      }
    });

    return () => {
      roomRef.off('value', unsubscribeRoom);
      movesRef.off('child_added', unsubscribeMoves);
      roomRef.child('messages').off('value', unsubscribeMessages);
    };
  }, [onlineRoom, playerColor, currentUser.id, applyMove, gameMode]);

  // Handler de Clique no Tabuleiro - CORRIGIDO
  const handleMove = useCallback((move: Move) => {
    console.log('HandleMove chamado com:', move);
    
    if (gameOver) {
      console.log('Jogo terminado, movimento ignorado');
      return;
    }
    
    // Verifica se é o turno do jogador
    if (turn !== move.piece.color) {
      console.log('Não é o turno deste jogador', turn, move.piece.color);
      return;
    }

    // Se for Online, valida se é o turno do jogador
    if (gameMode === GameMode.ONLINE) {
      if (turn !== playerColor || !onlineRoom) {
        console.log('Não pode mover no modo online', { turn, playerColor, onlineRoom });
        return;
      }
      
      const ts = Date.now();
      lastMoveTimestamp.current = ts;

      // Tenta aplicar localmente primeiro
      const success = applyMove(move);
      if (!success) {
        console.error('Falha ao aplicar movimento localmente');
        return;
      }

      // Sincroniza com Firebase
      console.log('Enviando movimento para Firebase');
      db.ref(`rooms/${onlineRoom}/moves`).push({
        move,
        playerId: currentUser.id,
        timestamp: ts
      }).catch(error => {
        console.error('Erro ao enviar movimento para Firebase:', error);
      });
    } else {
      // Modo Local ou AI
      console.log('Aplicando movimento local');
      applyMove(move);
    }
  }, [gameOver, gameMode, turn, playerColor, onlineRoom, currentUser.id, applyMove]);

  // IA Handler
  useEffect(() => {
    if (gameMode === GameMode.AI && turn === 'b' && !gameOver) {
      console.log('Turno da IA, calculando melhor movimento...');
      const timeout = setTimeout(() => {
        try {
          const move = getBestMove(boardRef.current, 'b');
          if (move) {
            console.log('IA encontrou movimento:', move);
            applyMove(move);
          } else {
            console.log('IA não encontrou movimento válido');
          }
        } catch (error) {
          console.error('Erro na IA:', error);
        }
      }, 700);
      return () => clearTimeout(timeout);
    }
  }, [turn, gameMode, gameOver, applyMove]);

  // Funções de Gerenciamento de Sala
  const createOnlineGame = useCallback(() => {
    const id = Math.random().toString(36).substring(2, 8);
    setOnlineRoom(id);
    setGameMode(GameMode.ONLINE);
    setPlayerColor('w');
    setIsWaiting(true);
    setOpponent(null);
    resetGame();
    
    db.ref(`rooms/${id}`).set({
      id,
      status: 'waiting',
      playerA: currentUser,
      createdAt: Date.now()
    });
  }, [currentUser, resetGame]);

  const joinRoom = useCallback((roomId: string) => {
    db.ref(`rooms/${roomId}`).once('value').then((snap) => {
      const data = snap.val();
      if (data && data.status === 'waiting') {
        setOnlineRoom(roomId);
        setGameMode(GameMode.ONLINE);
        setPlayerColor('b');
        setOpponent(data.playerA);
        resetGame();
        
        db.ref(`rooms/${roomId}`).update({
          playerB: currentUser,
          status: 'playing'
        });
      }
    });
  }, [currentUser, resetGame]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) joinRoom(room);
  }, [joinRoom]);

  const sendMessage = useCallback((text: string) => {
    if (onlineRoom && text.trim()) {
      db.ref(`rooms/${onlineRoom}/messages`).push({
        user: currentUser.name,
        text: text.trim(),
        timestamp: Date.now()
      });
    }
  }, [onlineRoom, currentUser.name]);

  const handleResign = useCallback(() => {
    if (onlineRoom) {
      db.ref(`rooms/${onlineRoom}`).update({ 
        status: 'finished',
        result: 'Vitória por desistência'
      });
      setGameOver('Você desistiu da partida.');
    } else {
      setGameOver('Partida encerrada por desistência.');
    }
  }, [onlineRoom]);

  const handleNewGame = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    console.log('Iniciando nova partida...');
    if (onlineRoom) {
      // Limpar sala online
      db.ref(`rooms/${onlineRoom}`).remove();
    }
    setOnlineRoom(null);
    setGameMode(GameMode.LOCAL);
    setOpponent(null);
    setIsWaiting(false);
    setMessages([]);
    resetGame();
  }, [onlineRoom, resetGame]);

  // PREVENIR O RECARREGAMENTO DA PÁGINA
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (onlineRoom && !gameOver) {
        e.preventDefault();
        e.returnValue = 'Você tem uma partida em andamento. Tem certeza que deseja sair?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [onlineRoom, gameOver]);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#312e2b] text-white overflow-hidden">
      <Sidebar user={currentUser} />
      
      <main className="flex-1 flex flex-col items-center overflow-y-auto pb-20 md:pb-0 pt-4 px-2">
        <div className="flex flex-col lg:flex-row gap-6 w-full max-w-6xl items-center lg:items-start lg:mt-4">
          
          <div className="w-full max-w-[600px] flex flex-col gap-2">
            {/* Oponente */}
            <div className="flex justify-between items-center px-4 py-2 bg-[#262421]/50 rounded border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#3c3a37] rounded flex items-center justify-center">
                  {opponent?.avatar ? (
                    <img src={opponent.avatar} className="w-10 h-10 rounded" alt="Avatar" />
                  ) : (
                    <i className={`fas ${gameMode === GameMode.AI ? 'fa-robot' : 'fa-user'} text-gray-400`}></i>
                  )}
                </div>
                <div>
                  <div className="font-bold text-sm">{opponent?.name || (gameMode === GameMode.AI ? 'Stockfish 11' : 'Oponente')}</div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">ELO {opponent?.elo || 1200}</div>
                </div>
              </div>
              <div className={`px-4 py-1.5 rounded font-mono text-xl transition-all ${turn !== playerColor && !gameOver ? 'bg-white text-black font-bold shadow-lg' : 'bg-[#211f1c] text-gray-500'}`}>
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

            {/* Usuário */}
            <div className="flex justify-between items-center px-4 py-2 bg-[#262421]/50 rounded border border-white/5">
              <div className="flex items-center gap-3">
                <img src={currentUser.avatar} className="w-10 h-10 rounded-md" alt="Avatar" />
                <div>
                  <div className="font-bold text-sm">{currentUser.name}</div>
                  <div className="text-[10px] text-[#81b64c] font-bold uppercase tracking-widest">ELO {currentUser.elo}</div>
                </div>
              </div>
              <div className={`px-4 py-1.5 rounded font-mono text-xl transition-all ${turn === playerColor && !gameOver ? 'bg-white text-black font-bold shadow-lg' : 'bg-[#211f1c] text-gray-500'}`}>
                {Math.floor(timers[playerColor] / 60)}:{(timers[playerColor] % 60).toString().padStart(2, '0')}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[380px] flex flex-col gap-4">
            <div className="h-[450px]">
              <GameControls 
                history={history} 
                onUndo={handleUndo} 
                onResign={handleResign}
                turn={turn}
                whiteTimer={timers.w} 
                blackTimer={timers.b} 
                gameMode={gameMode}
                messages={messages}
                onSendMessage={sendMessage}
                playerColor={playerColor}
              />
            </div>

            {gameMode === GameMode.LOCAL && !onlineRoom && (
              <div className="grid grid-cols-1 gap-2">
                <button 
                  onClick={createOnlineGame} 
                  className="bg-[#81b64c] hover:bg-[#95c562] py-4 rounded-lg font-bold text-xl shadow-[0_4px_0_rgb(69,101,40)] transition-all active:translate-y-1 active:shadow-none"
                >
                  <i className="fas fa-bolt mr-2"></i> JOGAR ONLINE
                </button>
                <button 
                  onClick={() => { 
                    setGameMode(GameMode.AI); 
                    resetGame();
                  }} 
                  className="bg-[#3c3a37] py-3 rounded-lg font-bold hover:bg-[#4a4844] transition-colors"
                >
                  CONTRA COMPUTADOR
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modal Convite */}
        {isWaiting && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <div className="bg-[#262421] p-8 rounded-2xl border border-white/10 text-center max-w-sm w-full shadow-2xl animate-in zoom-in duration-200">
              <div className="w-16 h-16 bg-[#81b64c]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-user-plus text-[#81b64c] text-2xl"></i>
              </div>
              <h2 className="text-2xl font-bold mb-2">Desafio Criado!</h2>
              <p className="text-gray-400 text-sm mb-6 leading-relaxed">Envie o link para um amigo. O jogo começará quando ele entrar.</p>
              
              <div className="bg-[#1a1917] p-4 rounded-xl mb-6 border border-white/5">
                <div className="text-[10px] text-[#81b64c] font-mono mb-3 truncate">
                  {window.location.origin}/?room={onlineRoom}
                </div>
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigator.clipboard.writeText(`${window.location.origin}/?room=${onlineRoom}`);
                    setCopyFeedback(true);
                    setTimeout(() => setCopyFeedback(false), 2000);
                  }} 
                  className={`w-full py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${copyFeedback ? 'bg-[#81b64c]' : 'bg-[#3c3a37]'}`}
                >
                  <i className={`fas ${copyFeedback ? 'fa-check' : 'fa-copy'}`}></i>
                  {copyFeedback ? 'LINK COPIADO!' : 'COPIAR LINK'}
                </button>
              </div>
              
              <button 
                onClick={handleNewGame} 
                className="text-gray-500 hover:text-white text-xs font-bold uppercase"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Modal GameOver */}
        {gameOver && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-[#262421] p-10 rounded-2xl border border-white/10 text-center shadow-2xl max-w-sm w-full">
              <div className="text-6xl mb-4">🏁</div>
              <h2 className="text-2xl font-bold mb-2">Fim da Partida</h2>
              <p className="text-gray-400 mb-8">{gameOver}</p>
              <button 
                onClick={handleNewGame} 
                className="w-full bg-[#81b64c] py-4 rounded-xl font-bold text-white shadow-[0_4px_0_rgb(69,101,40)] transition-all active:translate-y-1 active:shadow-none"
              >
                NOVA PARTIDA
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;