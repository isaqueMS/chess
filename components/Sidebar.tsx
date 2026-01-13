
import React from 'react';
import { User } from '../types';

interface SidebarProps {
  user: User;
  onProfileClick: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ user, onProfileClick }) => {
  const menuItems = [
    { icon: 'fa-chess-board', label: 'Jogar', active: true },
    { icon: 'fa-puzzle-piece', label: 'Problemas' },
    { icon: 'fa-graduation-cap', label: 'Aprender' },
    { icon: 'fa-eye', label: 'Assistir' },
    { icon: 'fa-newspaper', label: 'Notícias' },
  ];

  return (
    <>
      <div className="hidden md:flex flex-col w-20 lg:w-64 sidebar-bg border-r border-[#3c3a37] h-screen sticky top-0 z-40">
        <div className="p-6 flex items-center justify-center lg:justify-start space-x-2 mb-6">
          <i className="fas fa-chess-knight text-3xl text-[#81b64c]"></i>
          <span className="hidden lg:block font-bold text-xl">Chess<span className="text-gray-400">.com</span></span>
        </div>
        <nav className="flex-1">
          {menuItems.map((item, idx) => (
            <button key={idx} className={`w-full flex flex-col lg:flex-row items-center lg:space-x-4 px-2 lg:px-6 py-4 hover:bg-[#3c3a37] ${item.active ? 'nav-active' : ''}`}>
              <i className={`fas ${item.icon} text-xl text-gray-400 ${item.active ? 'text-[#81b64c]' : ''}`}></i>
              <span className={`hidden lg:block font-bold text-sm ${item.active ? 'text-white' : 'text-gray-400'}`}>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-[#3c3a37] bg-[#1a1917] cursor-pointer" onClick={onProfileClick}>
          <div className="flex items-center space-x-3">
            <img src={user.avatar} className="w-10 h-10 rounded-lg border border-white/10" />
            <div className="hidden lg:block overflow-hidden">
              <div className="text-sm font-bold truncate">{user.name}</div>
              <div className="text-[10px] text-[#81b64c] font-bold">ELO {user.elo}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
