
import React, { useState, useRef, useEffect } from 'react';
import { LayoutGrid, Package, FileText, Settings, Database, Truck, ClipboardCheck, Globe, ChevronDown, Landmark } from 'lucide-react';
import { ViewType } from '../types';
import { translations, Language } from '../translations';

interface SidebarProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  isOpen: boolean;
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView, isOpen, language, onLanguageChange }) => {
  const t = translations[language];
  const [isLangOpen, setIsLangOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const menuItems = [
    { id: 'dashboard', label: t.dashboard, icon: LayoutGrid },
    { id: 'inventory', label: t.inventory, icon: Package },
    { id: 'invoices', label: t.invoices, icon: FileText },
    { id: 'deliveryNotes', label: t.deliveryNotes, icon: Truck },
    { id: 'physicalCounts', label: t.physicalInventory, icon: ClipboardCheck },
    { id: 'invoiceReview', label: t.invoiceReview, icon: Landmark },
  ];

  const langs: { code: Language; label: string; flag: string }[] = [
    { code: 'it', label: 'Italiano', flag: 'IT' },
    { code: 'en', label: 'English', flag: 'EN' },
    { code: 'es', label: 'Español', flag: 'ES' },
    { code: 'fr', label: 'Français', flag: 'FR' },
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLangFlag = langs.find(l => l.code === language)?.flag || 'IT';

  return (
    <header className="fixed top-0 left-0 right-0 h-20 bg-slate-900/95 backdrop-blur-md text-slate-300 z-50 shadow-xl border-b border-slate-800">
      <div className="max-w-7xl mx-auto h-full px-4 flex items-center justify-between">
        
        {/* Left Side: Logo and Nav */}
        <div className="flex items-center gap-8 min-w-0">
          <div className="flex items-center gap-3 shrink-0">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-500/20">
              <Database size={24} />
            </div>
            <h1 className="text-xl font-black text-white tracking-tighter hidden md:block">DALILI'</h1>
          </div>

          <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar py-2 shrink">
            {menuItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id as ViewType)}
                  className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-3 md:px-5 py-2 rounded-xl transition-all whitespace-nowrap relative ${
                    isActive 
                      ? 'text-white' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <item.icon size={20} className={isActive ? 'text-indigo-400' : ''} />
                  <span className={`text-[10px] md:text-sm font-bold uppercase md:capitalize tracking-tight ${isActive ? 'opacity-100' : 'opacity-80'}`}>
                    {item.label}
                  </span>
                  {isActive && (
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 bg-indigo-400 rounded-full shadow-[0_0_8px_rgba(129,140,248,0.8)]"></div>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right Side: Language Selection */}
        <div className="flex items-center shrink-0 ml-4">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsLangOpen(!isLangOpen)}
              className="flex items-center gap-2.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all group shadow-inner"
              title="Cambia Lingua"
            >
              <Globe size={18} className="text-indigo-400 group-hover:rotate-12 transition-transform duration-500" />
              <span className="text-[11px] font-black text-white uppercase tracking-wider">{currentLangFlag}</span>
              <ChevronDown size={14} className={`text-slate-500 transition-transform duration-300 ${isLangOpen ? 'rotate-180' : ''}`} />
            </button>

            {isLangOpen && (
              <div className="absolute right-0 mt-2 w-44 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-200 z-[60] backdrop-blur-xl">
                {langs.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => {
                      onLanguageChange(l.code);
                      setIsLangOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      language === l.code 
                        ? 'bg-indigo-600 text-white shadow-lg' 
                        : 'text-slate-400 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    <span>{l.label}</span>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${
                      language === l.code ? 'bg-white/20 border-white/30 text-white' : 'bg-slate-900 border-slate-700 text-slate-500'
                    }`}>
                      {l.flag}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </header>
  );
};

export default Sidebar;
