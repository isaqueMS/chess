
import React, { useState } from 'react';
import { Move, GameMode } from '../types';

interface GameControlsProps {
  history: Move[];
  onUndo: () => void;
  onResign: () => void;
  turn: 'w' | 'b';
  whiteTimer: number;
  blackTimer: number;
  gameMode: GameMode;
  messages?: {user: string, text: string}[];
  onSendMessage?: (text: string) => void;
}

const GameControls: React.FC<GameControlsProps> = ({ 
  history, onUndo, onResign, turn, whiteTimer, blackTimer, gameMode, messages = [], onSendMessage 
}) => {
  const [activeTab, setActiveTab] = useState<'moves' | 'chat'>('moves');
  const [chatInput, setChatInput] = useState('');

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim() && onSendMessage) {
      onSendMessage(chatInput);
      setChatInput('');
    }
  };

  return (
    <div className="flex flex-col h-full sidebar-bg rounded-xl overflow-hidden border border-[#3c3a37] shadow-xl">
      {/* Timers & Players */}
      <div className="p-4 space-y-3 bg-[#2a2825]">
        <div className={`p-3 rounded-lg flex justify-between items-center ${turn === 'b' ? 'bg-[#3c3a37] ring-1 ring-[#81b64c]' : 'bg-[#211f1c]'}`}>
          <div className="flex items-center space-x-3">
            <div className="w-2 h-2 rounded-full bg-gray-600"></div>
            <span className="text-sm font-semibold">Oponente</span>
          </div>
          <span className="text-xl font-mono">{formatTime(blackTimer)}</span>
        </div>
        <div className={`p-3 rounded-lg flex justify-between items-center ${turn === 'w' ? 'bg-[#3c3a37] ring-1 ring-[#81b64c]' : 'bg-[#211f1c]'}`}>
          <div className="flex items-center space-x-3">
            <div className="w-2 h-2 rounded-full bg-white"></div>
            <span className="text-sm font-semibold">Você</span>
          </div>
          <span className="text-xl font-mono">{formatTime(whiteTimer)}</span>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-[#3c3a37]">
        <button 
          onClick={() => setActiveTab('moves')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'moves' ? 'text-[#81b64c] border-b-2 border-[#81b64c]' : 'text-gray-500'}`}
        >
          Lances
        </button>
        <button 
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'chat' ? 'text-[#81b64c] border-b-2 border-[#81b64c]' : 'text-gray-500'}`}
        >
          Chat {messages.length > 0 && `(${messages.length})`}
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 bg-[#211f1c]">
        {activeTab === 'moves' ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {history.map((move, i) => (
              <div key={i} className="flex space-x-2 text-sm py-1 border-b border-white/5">
                <span className="text-gray-600 w-6">{Math.floor(i/2) + 1}.</span>
                <span className="font-medium text-gray-300">
                  {move.piece.type.toUpperCase()}{String.fromCharCode(97 + move.to.col)}{8 - move.to.row}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex-1 space-y-3 overflow-y-auto mb-4">
              {messages.map((m, i) => (
                <div key={i} className="text-sm">
                  <span className={`font-bold mr-2 ${m.user === 'System' ? 'text-yellow-500' : 'text-[#81b64c]'}`}>{m.user}:</span>
                  <span className="text-gray-400">{m.text}</span>
                </div>
              ))}
            </div>
            <form onSubmit={handleSend} className="flex space-x-2">
              <input 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Enviar mensagem..."
                className="flex-1 bg-[#1a1917] border border-[#3c3a37] rounded px-3 py-2 text-sm outline-none focus:border-[#81b64c]"
              />
              <button type="submit" className="bg-[#3c3a37] p-2 rounded hover:bg-[#4a4844] text-[#81b64c]">
                <i className="fas fa-paper-plane"></i>
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Global Actions */}
      <div className="p-4 bg-[#2a2825] border-t border-[#3c3a37] grid grid-cols-2 gap-2">
        <button 
          onClick={onUndo}
          disabled={gameMode === GameMode.ONLINE}
          className="bg-[#3c3a37] py-2 rounded font-bold text-xs disabled:opacity-20"
        >
          Desfazer
        </button>
        <button onClick={onResign} className="bg-[#3c3a37] py-2 rounded font-bold text-xs text-red-400">
          Desistir
        </button>
      </div>
    </div>
  );
};

export default GameControls;
