
import React, { useState, useEffect } from 'react';
import { getLocalHistory, SavedGame } from '../services/storage';

const Sidebar: React.FC = () => {
  const [history, setHistory] = useState<SavedGame[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setHistory(getLocalHistory());
  }, []);

  const menuItems = [
    { icon: 'fa-chess-board', label: 'Jogar', active: !showHistory, onClick: () => setShowHistory(false) },
    { icon: 'fa-history', label: 'Histórico Local', active: showHistory, onClick: () => setShowHistory(true) },
    { icon: 'fa-users', label: 'Social' },
    { icon: 'fa-cog', label: 'Configurações' },
  ];

  return (
    <div className="hidden md:flex flex-col w-64 sidebar-bg border-r border-[#3c3a37] h-screen sticky top-0">
      <div className="p-6 flex items-center space-x-2 mb-6">
        <i className="fas fa-chess-knight text-3xl text-[#81b64c]"></i>
        <span className="font-bold text-lg tracking-tight">GM Chess <span className="text-[10px] bg-[#81b64c] px-1 rounded text-white">LAN</span></span>
      </div>
      
      <nav className="flex-1 overflow-y-auto">
        {menuItems.map((item, idx) => (
          <button 
            key={idx}
            onClick={item.onClick}
            className={`w-full flex items-center space-x-3 px-6 py-4 hover:bg-[#3c3a37] transition-colors ${item.active ? 'nav-active' : ''}`}
          >
            <i className={`fas ${item.icon} w-6 text-gray-400`}></i>
            <span className={`font-medium ${item.active ? 'text-white' : 'text-gray-400'}`}>{item.label}</span>
          </button>
        ))}

        {showHistory && (
          <div className="px-4 py-2 space-y-2">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase px-2">Partidas Recentes</h3>
            {history.length === 0 ? (
              <p className="text-xs text-gray-600 px-2 italic">Nenhuma partida salva.</p>
            ) : (
              history.map((game) => (
                <div key={game.id} className="bg-[#1a1917] p-2 rounded text-[11px] border border-white/5">
                  <div className="flex justify-between text-[#81b64c] font-bold">
                    <span>{game.mode}</span>
                    <span>{game.date}</span>
                  </div>
                  <div className="text-gray-400 truncate mt-1">{game.result}</div>
                  <div className="text-gray-600 mt-1">{game.moves.length} lances</div>
                </div>
              ))
            )}
          </div>
        )}
      </nav>

      <div className="p-6 border-t border-[#3c3a37]">
        <div className="flex items-center space-x-3">
          <img src="https://picsum.photos/seed/gm/40" alt="User" className="w-10 h-10 rounded-lg shadow-md" />
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-semibold truncate">Offline Player</span>
            <span className="text-xs text-[#81b64c] font-bold">Local Host</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
