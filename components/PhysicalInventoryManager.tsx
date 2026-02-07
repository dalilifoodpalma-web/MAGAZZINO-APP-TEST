
import React, { useState, useRef } from 'react';
import { Upload, AlertCircle, Loader2, Trash2, Hash, ChevronDown, ChevronUp, AlertTriangle, ClipboardCheck, FileSpreadsheet, PlusCircle, MinusCircle, X, Download, Eye, EyeOff, TrendingDown, TrendingUp, DollarSign, CheckCircle2, HelpCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Document, Product } from '../types';
import { extractDocumentData } from '../services/geminiService';
import { translations, Language } from '../translations';
import { getProductKey, cleanString, normalizeUnit } from '../App';

interface PhysicalInventoryManagerProps {
  documents: Document[];
  inventory: Product[];
  onAdd: (doc: Document) => void;
  onUpdate: (doc: Document) => void;
  onDelete: (id: string) => void;
  language: Language;
}

const PhysicalInventoryManager: React.FC<PhysicalInventoryManagerProps> = ({ 
  documents, 
  inventory, 
  onAdd, 
  onDelete,
  language
}) => {
  const t = translations[language];
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [confirmingDeleteDocId, setConfirmingDeleteDocId] = useState<string | null>(null);
  const [showOnlyDiscrepancies, setShowOnlyDiscrepancies] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatCurrency = (val: number) => val.toLocaleString(language === 'it' ? 'it-IT' : 'en-US', { style: 'currency', currency: 'EUR' });

  // Funzione di lookup ultra-flessibile sincronizzata con App.tsx
  const getSystemProductByInfo = (name: string, sku: string, unit: string) => {
    const searchKey = getProductKey(name, sku, unit);
    
    // 1. Tentativo Match Esatto tramite Chiave Generata (SKU o Nome+UM)
    const exactMatch = inventory.find(p => p.id.replace('INV-KEY-', '') === searchKey);
    if (exactMatch) return exactMatch;

    // 2. Fallback: Match solo su SKU normalizzato (se presente)
    const s = cleanString(sku);
    if (s && s.length > 0) {
      const skuMatch = inventory.find(p => cleanString(p.sku) === s);
      if (skuMatch) return skuMatch;
    }

    // 3. Fallback: Match solo su Nome normalizzato (senza considerare l'unità)
    const n = cleanString(name);
    const nameMatch = inventory.find(p => cleanString(p.name) === n);
    
    return nameMatch;
  };

  const getExcelVal = (row: any, keys: string[]) => {
    const rowKeys = Object.keys(row);
    for (const k of keys) {
      const found = rowKeys.find(rk => cleanString(rk) === cleanString(k));
      if (found !== undefined) return row[found];
    }
    return null;
  };

  const parseQuantity = (val: any): number => {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'number') return val;
    const cleaned = val.toString().replace(',', '.').replace(/[^-0.9.]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Number(num.toFixed(4));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      let extractedProducts: Product[] = [];
      let docData = { supplier: 'Inventario Fisico', date: new Date().toISOString().split('T')[0], documentNumber: `INV-${Date.now().toString().slice(-6)}` };

      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const reader = new FileReader();
        const dataPromise = new Promise<any[]>((resolve) => {
          reader.onload = (e) => {
            const ab = e.target?.result;
            const wb = XLSX.read(ab, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            resolve(XLSX.utils.sheet_to_json(ws));
          };
          reader.readAsArrayBuffer(file);
        });
        
        const rows = await dataPromise;
        const internalId = `PC-${Date.now()}`;
        
        extractedProducts = rows.map((row: any, idx) => {
          const name = String(getExcelVal(row, ['nome', 'descrizione', 'prodotto', 'item', 'name', 'articolo']) || 'Articolo').trim();
          const sku = String(getExcelVal(row, ['sku', 'codice', 'code', 'art', 'articolo', 'cod', 'barcode']) || '').trim();
          const rawQty = getExcelVal(row, ['quantita', 'qta', 'fisico', 'scorta', 'stock', 'quantity', 'qty', 'reale', 'conta']);
          const quantity = parseQuantity(rawQty);
          const unit = normalizeUnit(String(getExcelVal(row, ['unita', 'um', 'u.m.', 'unit', 'uom', 'misura', 'formato']) || 'UD'));

          const sysProd = getSystemProductByInfo(name, sku, unit);
          const unitPrice = sysProd ? sysProd.unitPrice : 0;

          return {
            id: `${internalId}-${idx}`,
            sku,
            name,
            quantity,
            unitOfMeasure: unit,
            unitPrice: unitPrice,
            totalPrice: Number((quantity * unitPrice).toFixed(4)),
            category: sysProd ? sysProd.category : 'Inventory',
            invoiceDate: docData.date,
            invoiceId: internalId,
            invoiceNumber: docData.documentNumber,
            supplier: docData.supplier,
            docType: 'physicalCount' as const
          };
        }).filter(p => p.name !== 'Articolo' && p.name !== '') as Product[];
      } else {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(file);
        });

        const base64Data = await base64Promise;
        const result = await extractDocumentData(base64Data, file.type);
        if (!Array.isArray(result) || result.length === 0) throw new Error("Dati non validi.");
        
        const data = result[0];
        docData = { 
          supplier: data.supplier || 'Inventario Fisico', 
          date: data.date, 
          documentNumber: data.documentNumber || `INV-${Date.now().toString().slice(-6)}` 
        };
        
        const internalId = `PC-${Date.now()}`;
        extractedProducts = (data.products || []).map((p: any, index: number) => {
          const unit = normalizeUnit(p.unit);
          const sysProd = getSystemProductByInfo(p.name, p.code, unit);
          const unitPrice = sysProd ? sysProd.unitPrice : (p.unitPrice || 0);
          const quantity = parseQuantity(p.quantity);

          return {
            id: `${internalId}-${index}`,
            sku: (p.code || '').trim(),
            name: (p.name || 'Product').trim(),
            quantity,
            unitOfMeasure: unit,
            unitPrice: unitPrice,
            totalPrice: Number((quantity * unitPrice).toFixed(4)),
            category: (p.category || sysProd?.category || 'Inventory').trim(),
            invoiceDate: docData.date,
            invoiceId: internalId,
            invoiceNumber: docData.documentNumber,
            supplier: docData.supplier,
            docType: 'physicalCount' as const
          };
        }) as Product[];
      }

      if (extractedProducts.length === 0) throw new Error("Nessun prodotto trovato nel file.");

      const newDoc: Document = {
        id: `DOC-PC-${Date.now()}`,
        documentNumber: docData.documentNumber,
        date: docData.date,
        supplier: docData.supplier,
        fileName: file.name,
        totalAmount: extractedProducts.reduce((sum, p) => sum + p.totalPrice, 0),
        status: 'processed',
        extractedProducts: extractedProducts,
        type: 'physicalCount'
      };

      onAdd(newDoc);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setError(err.message || "Errore di caricamento.");
    } finally {
      setIsUploading(false);
    }
  };

  const exportReconciliationReport = (doc: Document) => {
    const reportData = doc.extractedProducts.map(p => {
      const sysProd = getSystemProductByInfo(p.name, p.sku, p.unitOfMeasure);
      const sysQty = sysProd ? sysProd.quantity : 0;
      const diff = Number((p.quantity - sysQty).toFixed(4));
      const unitPrice = sysProd ? sysProd.unitPrice : p.unitPrice;
      const valDiff = diff * unitPrice;

      return {
        'Codice/SKU': p.sku || sysProd?.sku || 'N/D',
        'Prodotto Reale': p.name,
        'Match Sistema': sysProd ? 'SÌ' : 'NO (Nuovo)',
        'U.M.': p.unitOfMeasure,
        'Quantità Rilevata (FISICO)': p.quantity,
        'Quantità Calcolata (SISTEMA)': sysQty,
        'Differenza Stock': diff,
        'Valore Scostamento (€)': valDiff.toFixed(2),
        'Status': Math.abs(diff) < 0.001 ? 'ALLINEATO' : (diff > 0 ? 'ECCEDENZA' : 'AMMANCO')
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(reportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Riconciliazione");
    XLSX.writeFile(workbook, `Report_Magazzino_Riconciliazione_${doc.documentNumber}.xlsx`);
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.reconTitle}</h1>
          <p className="text-slate-500">{t.reconSubtitle}</p>
        </div>
        {documents.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-2xl border border-indigo-100">
            <ClipboardCheck size={18} />
            <span className="text-xs font-black uppercase">{documents.length} Inventari Registrati</span>
          </div>
        )}
      </header>

      <div className={`bg-white border-2 border-dashed rounded-3xl p-10 text-center transition-all ${isUploading ? 'border-indigo-400 bg-indigo-50 shadow-inner' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50 shadow-sm'}`}>
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,.xlsx,.xls,image/*" className="hidden" id="pc-upload" />
        {isUploading ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-indigo-600" size={56} />
            <div className="space-y-1">
              <p className="font-bold text-slate-900 text-lg">Sincronizzazione Giacenze...</p>
              <p className="text-xs text-slate-400">Gemini sta mappando i tuoi dati reali con lo storico delle fatture.</p>
            </div>
          </div>
        ) : (
          <label htmlFor="pc-upload" className="cursor-pointer flex flex-col items-center gap-4">
            <div className="p-6 bg-indigo-100 text-indigo-600 rounded-full shadow-inner"><FileSpreadsheet size={36} /></div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Importa Inventario Reale</h3>
              <p className="text-slate-500 text-sm max-w-sm mx-auto mt-1">Carica il tuo file Excel con le scorte fisiche per vedere gli scostamenti rispetto alle fatture caricate.</p>
            </div>
            <span className="mt-2 inline-flex px-10 py-3.5 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition shadow-lg">Carica File</span>
          </label>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-4 p-5 bg-rose-50 text-rose-700 border border-rose-100 rounded-2xl animate-in shake">
          <AlertCircle size={24} />
          <p className="text-xs font-bold">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto p-2 hover:bg-rose-100 rounded-xl transition-colors"><X size={18}/></button>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><History className="text-indigo-600" size={20} /> Storico Riconciliazioni</h2>
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {documents.length === 0 ? (
            <div className="p-24 text-center text-slate-300">
              <ClipboardCheck className="mx-auto mb-4 opacity-5" size={100} />
              <p className="font-medium text-slate-400">Nessun inventario registrato. Carica il primo per iniziare il confronto.</p>
            </div>
          ) : (
            documents.map((doc) => {
              const isExpanded = expandedDocId === doc.id;
              const isConfirmingDeleteDoc = confirmingDeleteDocId === doc.id;
              
              const summaryMetrics = doc.extractedProducts.reduce((acc, p) => {
                const sysProd = getSystemProductByInfo(p.name, p.sku, p.unitOfMeasure);
                const sysQty = sysProd ? sysProd.quantity : 0;
                const diff = Number((p.quantity - sysQty).toFixed(4));
                const unitPrice = sysProd ? sysProd.unitPrice : p.unitPrice;
                
                if (diff > 0.001) {
                  acc.surplusValue += diff * unitPrice;
                } else if (diff < -0.001) {
                  acc.deficitValue += Math.abs(diff) * unitPrice;
                }
                if (Math.abs(diff) > 0.001) acc.discrepanciesCount++;
                if (sysProd) acc.matchedCount++;
                return acc;
              }, { surplusValue: 0, deficitValue: 0, discrepanciesCount: 0, matchedCount: 0 });

              return (
                <div key={doc.id} className="group transition-all">
                  <div 
                    className={`p-6 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition ${isExpanded ? 'bg-indigo-50/20' : ''} ${isConfirmingDeleteDoc ? 'bg-rose-50' : ''}`}
                    onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}
                  >
                    <div className="flex items-center gap-5 flex-1">
                      <div className={`p-3 rounded-2xl border transition-all ${isConfirmingDeleteDoc ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        {isConfirmingDeleteDoc ? <AlertTriangle size={24} /> : (isExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className={`font-black text-lg ${isConfirmingDeleteDoc ? 'text-rose-700' : 'text-slate-900'}`}>{doc.supplier}</h4>
                          <span className="px-2 py-0.5 bg-slate-800 text-white text-[10px] font-black rounded uppercase">#{doc.documentNumber}</span>
                          {summaryMetrics.discrepanciesCount > 0 && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-black rounded uppercase flex items-center gap-1">
                              <AlertTriangle size={10} /> {summaryMetrics.discrepanciesCount} DISCREPANZE
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 mt-1">{new Date(doc.date).toLocaleDateString()} | Match Sistema: {summaryMetrics.matchedCount}/{doc.extractedProducts.length} referenze</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {isExpanded && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); exportReconciliationReport(doc); }}
                          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-700 transition shadow-lg shadow-emerald-100"
                        >
                          <Download size={16} /> Scarica Report XLS
                        </button>
                      )}
                      
                      <div onClick={e => e.stopPropagation()}>
                        {isConfirmingDeleteDoc ? (
                          <div className="flex items-center gap-1.5 bg-rose-100 p-1 rounded-xl border border-rose-200 animate-in zoom-in-95">
                            <button onClick={() => { onDelete(doc.id); setConfirmingDeleteDocId(null); }} className="px-4 py-2 bg-rose-600 text-white text-[10px] font-black rounded-lg">SI</button>
                            <button onClick={() => setConfirmingDeleteDocId(null)} className="px-4 py-2 bg-white text-slate-600 text-[10px] font-black rounded-lg border border-slate-200">NO</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmingDeleteDocId(doc.id)} className="p-3 text-slate-300 hover:text-rose-600 transition opacity-0 group-hover:opacity-100">
                            <Trash2 size={24} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {isExpanded && !isConfirmingDeleteDoc && (
                    <div className="px-6 pb-8 animate-in slide-in-from-top-2 duration-300 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl flex items-center gap-4">
                          <div className="p-3 bg-emerald-600 text-white rounded-xl"><TrendingUp size={24}/></div>
                          <div>
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Eccedenze (FISICO &gt; SISTEMA)</p>
                            <p className="text-xl font-black text-emerald-800">{formatCurrency(summaryMetrics.surplusValue)}</p>
                          </div>
                        </div>
                        <div className="bg-rose-50 border border-rose-100 p-5 rounded-2xl flex items-center gap-4">
                          <div className="p-3 bg-rose-600 text-white rounded-xl"><TrendingDown size={24}/></div>
                          <div>
                            <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Ammanchi (SISTEMA &gt; FISICO)</p>
                            <p className="text-xl font-black text-rose-800">{formatCurrency(summaryMetrics.deficitValue)}</p>
                          </div>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl flex items-center gap-4">
                          <div className="p-3 bg-slate-900 text-white rounded-xl"><DollarSign size={24}/></div>
                          <div>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Saldo Scostamento</p>
                            <p className={`text-xl font-black ${summaryMetrics.surplusValue - summaryMetrics.deficitValue >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {formatCurrency(summaryMetrics.surplusValue - summaryMetrics.deficitValue)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between px-2">
                        <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Dettaglio Comparativo</h5>
                        <button 
                          onClick={() => setShowOnlyDiscrepancies(!showOnlyDiscrepancies)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm ${showOnlyDiscrepancies ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}
                        >
                          {showOnlyDiscrepancies ? <EyeOff size={14} /> : <Eye size={14} />}
                          {showOnlyDiscrepancies ? 'Mostra Tutto' : 'Solo Discrepanze'}
                        </button>
                      </div>

                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm min-w-[900px]">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-6 py-4 font-bold text-slate-500 text-[10px] uppercase">Riconoscimento</th>
                                <th className="px-6 py-4 font-bold text-slate-500 text-[10px] uppercase">Prodotto (Identificato in Magazzino)</th>
                                <th className="px-6 py-4 font-bold text-slate-500 text-[10px] uppercase text-center">Fisico (Reale)</th>
                                <th className="px-6 py-4 font-bold text-slate-500 text-[10px] uppercase text-center">Sistema (Doc)</th>
                                <th className="px-6 py-4 font-bold text-slate-500 text-[10px] uppercase text-center">Differenza</th>
                                <th className="px-6 py-4 font-bold text-slate-500 text-[10px] uppercase text-right">Differenza Valore</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {doc.extractedProducts
                                .filter(p => {
                                  if (!showOnlyDiscrepancies) return true;
                                  const sysProd = getSystemProductByInfo(p.name, p.sku, p.unitOfMeasure);
                                  const sysQty = sysProd ? sysProd.quantity : 0;
                                  return (Math.abs(p.quantity - sysQty) > 0.001); 
                                })
                                .map((p) => {
                                  const sysProd = getSystemProductByInfo(p.name, p.sku, p.unitOfMeasure);
                                  const sysQty = sysProd ? sysProd.quantity : 0;
                                  const diff = Number((p.quantity - sysQty).toFixed(4));
                                  const unitPrice = sysProd ? sysProd.unitPrice : p.unitPrice;
                                  const valDiff = diff * unitPrice;
                                  
                                  return (
                                    <tr key={p.id} className={`hover:bg-slate-50/80 transition-all ${Math.abs(diff) > 0.001 ? (diff > 0 ? 'bg-emerald-50/10' : 'bg-rose-50/10') : ''}`}>
                                      <td className="px-6 py-4">
                                        {sysProd ? (
                                          <div className="flex items-center gap-1.5 text-emerald-600">
                                            <CheckCircle2 size={16} />
                                            <span className="text-[10px] font-black uppercase">Match Sistema</span>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-1.5 text-slate-400">
                                            <HelpCircle size={16} />
                                            <span className="text-[10px] font-black uppercase italic">Nuova Referenza</span>
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                          <div className="flex items-center gap-2">
                                            <p className="font-bold text-slate-800">{p.name}</p>
                                            {p.sku && <span className="text-[10px] font-mono font-bold text-slate-400">#{p.sku}</span>}
                                          </div>
                                          {sysProd && cleanString(sysProd.name) !== cleanString(p.name) && (
                                            <p className="text-[9px] text-slate-400 italic">ID Sistema: {sysProd.name}</p>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-6 py-4 text-center font-black">{p.quantity} <span className="text-[10px] opacity-40 uppercase">{p.unitOfMeasure}</span></td>
                                      <td className="px-6 py-4 text-center text-slate-400 font-medium">{sysQty} <span className="text-[10px] opacity-40 uppercase">{p.unitOfMeasure}</span></td>
                                      <td className={`px-6 py-4 text-center font-black ${diff > 0.001 ? 'text-emerald-600' : diff < -0.001 ? 'text-rose-600' : 'text-slate-300'}`}>
                                        <div className="flex items-center justify-center gap-1.5">
                                          {diff > 0.001 ? <PlusCircle size={14} /> : diff < -0.001 ? <MinusCircle size={14} /> : null}
                                          {Math.abs(diff) < 0.001 ? '0' : diff.toFixed(2)}
                                        </div>
                                      </td>
                                      <td className={`px-6 py-4 text-right font-black ${valDiff > 0.001 ? 'text-emerald-700' : valDiff < -0.001 ? 'text-rose-700' : 'text-slate-300'}`}>
                                        {Math.abs(valDiff) > 0.001 ? formatCurrency(valDiff) : '—'}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

const History = ({ className, size }: { className?: string, size?: number }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size || 24} 
    height={size || 24} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
    <path d="M12 7v5l4 2"/>
  </svg>
);

export default PhysicalInventoryManager;
