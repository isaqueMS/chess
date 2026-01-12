
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
      {/* Timers & Players - Hidden on mobile if redundant with board layout, or kept small */}
      <div className="p-3 space-y-2 bg-[#2a2825] hidden md:block">
        <div className={`p-2 rounded flex justify-between items-center ${turn === 'b' ? 'bg-[#3c3a37] ring-1 ring-[#81b64c]' : 'bg-[#211f1c]'}`}>
          <span className="text-xs font-semibold">Oponente</span>
          <span className="text-lg font-mono">{formatTime(blackTimer)}</span>
        </div>
        <div className={`p-2 rounded flex justify-between items-center ${turn === 'w' ? 'bg-[#3c3a37] ring-1 ring-[#81b64c]' : 'bg-[#211f1c]'}`}>
          <span className="text-xs font-semibold">Você</span>
          <span className="text-lg font-mono">{formatTime(whiteTimer)}</span>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-[#3c3a37]">
        <button 
          onClick={() => setActiveTab('moves')}
          className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'moves' ? 'text-[#81b64c] border-b-2 border-[#81b64c]' : 'text-gray-500'}`}
        >
          Lances
        </button>
        <button 
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'chat' ? 'text-[#81b64c] border-b-2 border-[#81b64c]' : 'text-gray-500'}`}
        >
          Chat {messages.length > 0 && `(${messages.length})`}
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 bg-[#211f1c]">
        {activeTab === 'moves' ? (
          <div className="grid grid-cols-2 md:grid-cols-2 gap-x-2 gap-y-1">
            {history.map((move, i) => (
              <div key={i} className="flex space-x-2 text-xs py-1 border-b border-white/5 items-center">
                <span className="text-gray-600 w-4 font-mono">{Math.floor(i/2) + 1}.</span>
                <span className="font-medium text-gray-300">
                  {move.piece.type.toUpperCase()}{String.fromCharCode(97 + move.to.col)}{8 - move.to.row}
                </span>
              </div>
            ))}
            {history.length === 0 && <div className="col-span-2 text-center text-gray-600 text-[10px] mt-4 uppercase font-bold tracking-widest">Aguardando lance inicial...</div>}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex-1 space-y-3 overflow-y-auto mb-2 pr-1">
              {messages.length === 0 && <div className="text-center text-gray-600 text-[10px] mt-4 italic uppercase">Nenhuma mensagem...</div>}
              {messages.map((m, i) => (
                <div key={i} className="text-xs leading-tight">
                  <span className={`font-bold mr-1 ${m.user === 'System' ? 'text-yellow-500' : 'text-[#81b64c]'}`}>{m.user}:</span>
                  <span className="text-gray-400">{m.text}</span>
                </div>
              ))}
            </div>
            <form onSubmit={handleSend} className="flex space-x-2">
              <input 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Chat..."
                className="flex-1 bg-[#1a1917] border border-[#3c3a37] rounded px-2 py-1.5 text-xs outline-none focus:border-[#81b64c]"
              />
              <button type="submit" className="bg-[#3c3a37] p-2 rounded hover:bg-[#4a4844] text-[#81b64c]">
                <i className="fas fa-paper-plane text-xs"></i>
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Global Actions */}
      <div className="p-3 bg-[#2a2825] border-t border-[#3c3a37] flex gap-2">
        <button 
          onClick={onUndo}
          disabled={gameMode === GameMode.ONLINE}
          className="flex-1 bg-[#3c3a37] py-2 rounded font-bold text-[10px] uppercase disabled:opacity-20"
        >
          Analisar
        </button>
        <button onClick={onResign} className="flex-1 bg-[#3c3a37] py-2 rounded font-bold text-[10px] uppercase text-red-400">
          Desistir
        </button>
      </div>
    </div>
  );
};

export default GameControls;
