
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Trash2, ChevronRight, Package, Calendar, Tag, Users, Clock, Edit2, Save, X, Layers, Hash, Check, AlertTriangle, Download, ChevronDown } from 'lucide-react';
import { Product } from '../types';
import { translations, Language } from '../translations';

interface InventoryProps {
  inventory: Product[];
  onDelete: (id: string) => void;
  onUpdate: (product: Product) => void;
  initialGrouping?: 'month' | 'category' | 'supplier' | 'none';
  onGroupingChange?: (group: 'month' | 'category' | 'supplier' | 'none') => void;
  onExport?: () => void;
  onReset?: (year?: number) => void;
  availableYears?: number[];
  language: Language;
}

const Inventory: React.FC<InventoryProps> = ({ 
  inventory, 
  onDelete, 
  onUpdate, 
  initialGrouping = 'month', 
  onGroupingChange, 
  onExport,
  onReset,
  availableYears = [],
  language 
}) => {
  const t = translations[language];
  const [searchTerm, setSearchTerm] = useState('');
  const [groupBy, setGroupBy] = useState<'month' | 'category' | 'supplier' | 'none'>(initialGrouping);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Product | null>(null);
  
  const [isResetMenuOpen, setIsResetMenuOpen] = useState(false);
  const resetMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setGroupBy(initialGrouping);
  }, [initialGrouping]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (resetMenuRef.current && !resetMenuRef.current.contains(event.target as Node)) {
        setIsResetMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleGroupingChange = (newGroup: 'month' | 'category' | 'supplier' | 'none') => {
    setGroupBy(newGroup);
    if (onGroupingChange) onGroupingChange(newGroup);
  };

  const startEditing = (p: Product) => {
    setEditingId(p.id);
    setConfirmingDeleteId(null);
    setEditForm({ ...p });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEditing = () => {
    if (editForm) {
      onUpdate({
        ...editForm,
        totalPrice: editForm.quantity * editForm.unitPrice
      });
      setEditingId(null);
      setEditForm(null);
    }
  };

  const confirmDelete = (id: string) => {
    onDelete(id);
    setConfirmingDeleteId(null);
  };

  const normalizeCategory = (cat: string): string => {
    if (!cat) return 'Generico';
    const c = cat.toLowerCase().trim();
    
    // Mappatura pro-attiva per produce
    if (c.includes('vegetable') || c.includes('verdura') || c.includes('insalata') || c.includes('ortaggi')) return 'Verdura';
    if (c.includes('fruit') || c.includes('frutta')) return 'Frutta';
    
    // Altrimenti ritorna la categoria suggerita dall'IA con la prima lettera maiuscola
    return cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
  };

  const filteredInventory = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return [...inventory]
      .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime())
      .filter(p => 
        p.name.toLowerCase().includes(term) || 
        p.supplier.toLowerCase().includes(term) ||
        (p.sku && p.sku.toLowerCase().includes(term)) ||
        (p.invoiceNumber && p.invoiceNumber.toLowerCase().includes(term)) ||
        (p.category && p.category.toLowerCase().includes(term))
      );
  }, [inventory, searchTerm]);

  const groupedData = useMemo(() => {
    if (groupBy === 'none') return { [t.inventory]: filteredInventory } as Record<string, Product[]>;
    return filteredInventory.reduce((acc, p) => {
      let key = 'Altro';
      if (groupBy === 'month') {
        key = new Date(p.invoiceDate).toLocaleString(language === 'it' ? 'it-IT' : 'en-US', { month: 'long', year: 'numeric' });
      } else if (groupBy === 'category') {
        key = normalizeCategory(p.category);
      } else if (groupBy === 'supplier') {
        key = p.supplier || 'Sconosciuto';
      }
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {} as Record<string, Product[]>);
  }, [filteredInventory, groupBy, language, t.inventory]);

  const formatCurrency = (val: number) => {
    return val.toLocaleString(language === 'it' ? 'it-IT' : 'en-US', { style: 'currency', currency: 'EUR' });
  };

  const getUnitColor = (unit: string) => {
    const u = (unit || 'UD').toUpperCase();
    switch(u) {
      case 'KG': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'CJ': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'UD': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      default: return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  const handleResetClick = (year?: number) => {
    if (onReset) {
      onReset(year);
      setIsResetMenuOpen(false);
    }
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold text-slate-900">{t.consolidatedInventory}</h1>
          <p className="text-slate-500 font-medium">{t.inventoryMonitoring}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 lg:flex-1 lg:justify-end">
          <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200 overflow-x-auto no-scrollbar">
            <button onClick={() => handleGroupingChange('month')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition whitespace-nowrap ${groupBy === 'month' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><Calendar size={14} /> {t.lastLoad}</button>
            <button onClick={() => handleGroupingChange('category')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition whitespace-nowrap ${groupBy === 'category' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><Tag size={14} /> {t.categories}</button>
            <button onClick={() => handleGroupingChange('supplier')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition whitespace-nowrap ${groupBy === 'supplier' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><Users size={14} /> {t.suppliers}</button>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={onExport}
              disabled={inventory.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-tight hover:bg-emerald-700 transition shadow-sm shadow-emerald-200 disabled:opacity-50"
            >
              <Download size={16} />
              {t.exportExcel}
            </button>
            
            <div className="relative" ref={resetMenuRef}>
              <button 
                onClick={() => setIsResetMenuOpen(!isResetMenuOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-black uppercase tracking-tight hover:bg-rose-700 transition shadow-lg shadow-rose-200 group"
                title="OPZIONI SVUOTAMENTO"
              >
                <Trash2 size={16} className="group-hover:animate-pulse" />
                {t.resetVault}
                <ChevronDown size={14} className={`transition-transform duration-300 ${isResetMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isResetMenuOpen && (
                <div className="absolute top-full right-0 mt-2 w-52 bg-white border border-rose-100 rounded-2xl shadow-2xl z-50 p-2 animate-in fade-in zoom-in-95 overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-50 mb-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Scegli Cosa Svuotare</span>
                  </div>
                  
                  <button 
                    onClick={() => handleResetClick()}
                    className="w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-black text-rose-600 hover:bg-rose-50 transition-colors uppercase flex items-center justify-between group"
                  >
                    <span>Svuota Tutto</span>
                    <AlertTriangle size={14} className="opacity-0 group-hover:opacity-100" />
                  </button>

                  <div className="h-px bg-slate-100 my-1 mx-2"></div>

                  {availableYears.length > 0 ? (
                    availableYears.map(year => (
                      <button 
                        key={year}
                        onClick={() => handleResetClick(year)}
                        className="w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-black text-slate-600 hover:bg-slate-50 transition-colors uppercase flex items-center justify-between group"
                      >
                        <span>Svuota Anno {year}</span>
                        <Calendar size={14} className="opacity-0 group-hover:opacity-100 text-slate-400" />
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-4 text-center">
                      <p className="text-[10px] font-medium text-slate-400 italic">Nessun dato trovato</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input 
          type="text" 
          placeholder={t.searchPlaceholder}
          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition placeholder:text-slate-400"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="space-y-10">
        {(Object.entries(groupedData) as [string, Product[]][]).map(([group, products]) => (
          <section key={group} className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 px-2 capitalize">
              <ChevronRight size={20} className="text-indigo-600" /> {group}
            </h2>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t.productSku}</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t.supplier}</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t.stock}</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">{t.totalValue}</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">{t.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {products.map((p) => {
                      const isEditing = editingId === p.id;
                      const isConfirmingDelete = confirmingDeleteId === p.id;
                      return (
                        <tr key={p.id} className={`group transition-all ${isEditing ? 'bg-indigo-50' : isConfirmingDelete ? 'bg-rose-50' : 'hover:bg-slate-50/80'}`}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0 transition-colors ${isEditing ? 'bg-indigo-600 text-white' : isConfirmingDelete ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:text-indigo-600'}`}>
                                {isConfirmingDelete ? <AlertTriangle size={20} /> : (isEditing ? <Check size={20} /> : (p.sku ? <Hash size={20} /> : <Package size={20} />))}
                              </div>
                              <div className="flex-1 min-w-[200px]">
                                {isEditing ? (
                                  <div className="space-y-2 animate-in slide-in-from-left-2">
                                    <input 
                                      value={editForm?.name} 
                                      onChange={e => setEditForm(f => f ? {...f, name: e.target.value} : null)}
                                      className="w-full px-2 py-1 text-sm font-bold border rounded bg-white"
                                      placeholder="Nome Prodotto"
                                    />
                                    <div className="flex gap-2">
                                      <input 
                                        value={editForm?.sku} 
                                        onChange={e => setEditForm(f => f ? {...f, sku: e.target.value} : null)}
                                        className="w-1/2 px-2 py-1 text-[10px] border rounded bg-white font-mono"
                                        placeholder="SKU"
                                      />
                                      <input 
                                        value={editForm?.category} 
                                        onChange={e => setEditForm(f => f ? {...f, category: e.target.value} : null)}
                                        className="w-1/2 px-2 py-1 text-[10px] border rounded bg-white font-bold text-indigo-600"
                                        placeholder="Categoria"
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <p className={`font-bold leading-tight ${isConfirmingDelete ? 'text-rose-900' : 'text-slate-900'}`}>{p.name}</p>
                                      {p.sku && <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">#{p.sku}</span>}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-[10px] text-indigo-600 font-bold uppercase">{normalizeCategory(p.category)}</span>
                                      <span className="text-slate-300">|</span>
                                      <span className="text-[10px] text-slate-400 italic">Doc: {p.invoiceNumber}</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {isEditing ? (
                              <input 
                                value={editForm?.supplier} 
                                onChange={e => setEditForm(f => f ? {...f, supplier: e.target.value} : null)}
                                className="w-full px-2 py-1 text-xs border rounded bg-white"
                              />
                            ) : p.supplier}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {isEditing ? (
                                <div className="flex items-center gap-1">
                                  <input 
                                    type="number"
                                    value={editForm?.quantity} 
                                    onChange={e => setEditForm(f => f ? {...f, quantity: parseFloat(e.target.value)} : null)}
                                    className="w-16 px-2 py-1 text-sm font-black border rounded bg-white"
                                  />
                                  <select 
                                    value={editForm?.unitOfMeasure}
                                    onChange={e => setEditForm(f => f ? {...f, unitOfMeasure: e.target.value} : null)}
                                    className="px-1 py-1 text-[10px] border rounded font-bold"
                                  >
                                    <option value="UD">UD</option>
                                    <option value="KG">KG</option>
                                    <option value="CJ">CJ</option>
                                  </select>
                                </div>
                              ) : (
                                <>
                                  <span className="text-base font-black text-slate-900">{p.quantity.toLocaleString(language === 'it' ? 'it-IT' : 'en-US')}</span>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border shadow-sm ${getUnitColor(p.unitOfMeasure)}`}>
                                    {p.unitOfMeasure || 'UD'}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {isEditing ? (
                              <div className="flex flex-col items-end gap-1">
                                <input 
                                  type="number"
                                  step="0.01"
                                  value={editForm?.unitPrice} 
                                  onChange={e => setEditForm(f => f ? {...f, unitPrice: parseFloat(e.target.value)} : null)}
                                  className="w-20 px-2 py-1 text-xs text-right border rounded bg-white"
                                  placeholder="Prezzo Unit."
                                />
                                <span className="text-[10px] font-bold text-slate-400">TOT: {formatCurrency((editForm?.quantity || 0) * (editForm?.unitPrice || 0))}</span>
                              </div>
                            ) : (
                              <span className="text-sm font-black text-indigo-600">{formatCurrency(p.totalPrice)}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 min-w-[120px]">
                            <div className="flex items-center justify-center gap-2">
                              {isEditing ? (
                                <>
                                  <button onClick={saveEditing} className="p-2 bg-emerald-600 text-white rounded-xl shadow-md shadow-emerald-200 hover:scale-110 transition-transform"><Check size={18} /></button>
                                  <button onClick={cancelEditing} className="p-2 bg-slate-200 text-slate-600 rounded-xl hover:bg-slate-300 transition-colors"><X size={18} /></button>
                                </>
                              ) : isConfirmingDelete ? (
                                <div className="flex items-center gap-1 bg-rose-100 p-1 rounded-lg border border-rose-200 animate-in zoom-in-95">
                                  <button onClick={() => confirmDelete(p.id)} className="px-2 py-1 bg-rose-600 text-white text-[10px] font-black rounded-lg uppercase">Si</button>
                                  <button onClick={() => setConfirmingDeleteId(null)} className="px-2 py-1 bg-slate-200 text-slate-600 text-[10px] font-black rounded-lg uppercase">No</button>
                                </div>
                              ) : (
                                <>
                                  <button onClick={() => startEditing(p)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit2 size={18} /></button>
                                  <button onClick={() => setConfirmingDeleteId(p.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={18} /></button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default Inventory;
