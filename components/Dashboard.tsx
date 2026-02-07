
import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Package, TrendingUp, Euro, Calendar, Users, Box, Layers, ChevronRight } from 'lucide-react';
import { Product, Invoice } from '../types';
import { translations, Language } from '../translations';

interface DashboardProps {
  inventory: Product[];
  invoices: Invoice[];
  onKpiClick: (group: 'month' | 'category' | 'supplier' | 'none') => void;
  language: Language;
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const UNIT_COLORS: Record<string, string> = {
  'UD': '#6366f1',
  'KG': '#10b981',
  'CJ': '#f59e0b'
};

const Dashboard: React.FC<DashboardProps> = ({ inventory, invoices, onKpiClick, language }) => {
  const t = translations[language];
  const totalValue = inventory.reduce((sum, p) => sum + p.totalPrice, 0);
  const uniqueProducts = new Set(inventory.map(p => p.name.toLowerCase())).size;
  const totalSuppliers = new Set(invoices.map(i => i.supplier.toLowerCase())).size;

  const statsByUnit = inventory.reduce((acc, p) => {
    let unit = (p.unitOfMeasure || 'UD').toUpperCase();
    acc[unit] = (acc[unit] || 0) + p.quantity;
    return acc;
  }, { 'UD': 0, 'KG': 0, 'CJ': 0 } as Record<string, number>);

  // Fixed line 34-36: Added explicit type casting for Object.entries to prevent 'unknown' type errors during comparison
  const unitChartData = (Object.entries(statsByUnit) as [string, number][])
    .filter(([_, value]) => value > 0)
    .map(([name, value]) => ({ name, value }));

  const monthlyDataMap = invoices.reduce((acc, inv) => {
    const month = new Date(inv.date).toLocaleString(language === 'it' ? 'it-IT' : 'en-US', { month: 'short' });
    acc[month] = (acc[month] || 0) + inv.totalAmount;
    return acc;
  }, {} as Record<string, number>);

  const monthlyChartData = Object.entries(monthlyDataMap).map(([name, valore]) => ({ name, valore }));

  const formatCurrency = (val: number) => {
    return val.toLocaleString(language === 'it' ? 'it-IT' : 'en-US', { style: 'currency', currency: 'EUR' });
  };

  const formatNumber = (val: number) => {
    return val.toLocaleString(language === 'it' ? 'it-IT' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t.dashboard}</h1>
          <p className="text-slate-500">{t.controlCenter}</p>
        </div>
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200">
          <Calendar size={18} className="text-indigo-600" />
          <span className="text-sm font-medium">{new Date().toLocaleDateString(language === 'it' ? 'it-IT' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <button onClick={() => onKpiClick('none')} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-left hover:shadow-md transition-all group">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg w-fit mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors"><Box size={24} /></div>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{t.uniqueProducts}</p>
          <h3 className="text-2xl font-black text-slate-900 mt-1">{uniqueProducts}</h3>
        </button>

        <button onClick={() => onKpiClick('none')} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-left hover:shadow-md transition-all group relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Package size={24} />
            </div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.stockSummary}</div>
          </div>
          
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Unità (UD)</span>
                <span className="text-xs font-black text-slate-900">{formatNumber(statsByUnit['UD'])}</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full rounded-full transition-all duration-1000" style={{ width: '100%' }}></div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Peso (KG)</span>
                <span className="text-xs font-black text-slate-900">{formatNumber(statsByUnit['KG'])}</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{ width: '100%' }}></div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Casse (CJ)</span>
                <span className="text-xs font-black text-slate-900">{formatNumber(statsByUnit['CJ'])}</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full transition-all duration-1000" style={{ width: '100%' }}></div>
              </div>
            </div>
          </div>
          
          <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronRight size={14} className="text-slate-300" />
          </div>
        </button>

        <button onClick={() => onKpiClick('supplier')} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-left hover:shadow-md transition-all group">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg w-fit mb-4 group-hover:bg-amber-600 group-hover:text-white transition-colors"><Users size={24} /></div>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{t.suppliers}</p>
          <h3 className="text-2xl font-black text-slate-900 mt-1">{totalSuppliers}</h3>
        </button>

        <button onClick={() => onKpiClick('none')} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-left hover:shadow-md transition-all group">
          <div className="p-2 bg-rose-50 text-rose-600 rounded-lg w-fit mb-4 group-hover:bg-rose-600 group-hover:text-white transition-colors"><Euro size={24} /></div>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{t.stockValue}</p>
          <h3 className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(totalValue)}</h3>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-800">
            <TrendingUp size={20} className="text-indigo-600" /> {t.purchaseHistory}
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip 
                  formatter={(value: any) => [formatCurrency(Number(value) || 0), 'Spesa']}
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Area type="monotone" dataKey="valore" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-800">
            <Layers size={20} className="text-indigo-600" /> {t.unitDistribution}
          </h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={unitChartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={70} paddingAngle={5}>
                  {unitChartData.map((entry, index) => (
                    <Cell key={index} fill={UNIT_COLORS[entry.name] || COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => [formatNumber(Number(value) || 0), 'Quantità']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {['UD', 'KG', 'CJ'].map((unit) => (
              <div key={unit} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase">{unit === 'UD' ? 'Unità' : unit === 'KG' ? 'Peso' : 'Casse'}</span>
                <span className="text-sm font-black" style={{ color: UNIT_COLORS[unit] }}>{formatNumber(statsByUnit[unit])}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
