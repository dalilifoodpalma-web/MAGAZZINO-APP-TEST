
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Upload, AlertCircle, Loader2, Trash2, Landmark, CheckCircle2, XCircle, CreditCard, Receipt, Files, ChevronDown, ChevronUp, AlertTriangle, Filter, Calendar, Users, List, X, ArrowUpDown, SortAsc, SortDesc, Sparkles, Tag, Clock, Zap, Wallet, HandCoins, Split, Plus, Check, LayoutList, LayoutGrid, CalendarDays } from 'lucide-react';
import { Document, Product } from '../types';
import { extractDocumentData } from '../services/geminiService';
import { translations, Language } from '../translations';

interface InvoiceReviewManagerProps {
  documents: Document[];
  onAdd: (doc: Document) => void;
  onUpdate: (doc: Document) => void;
  onDelete: (id: string) => void;
  language: Language;
}

type SortField = 'date' | 'dueDate' | 'supplier';
type SortOrder = 'asc' | 'desc';
type DocTypeFilter = 'all' | 'invoice' | 'creditNote';
type PaymentStatusType = 'all' | 'paid' | 'unpaid' | 'partial';
type ViewGrouping = 'none' | 'supplier' | 'day' | 'week' | 'month' | 'year';

const InvoiceReviewManager: React.FC<InvoiceReviewManagerProps> = ({ 
  documents, 
  onAdd, 
  onUpdate,
  onDelete,
  language
}) => {
  const t = translations[language];
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [confirmingDeleteDocId, setConfirmingDeleteDocId] = useState<string | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatusType>('all');
  const [docTypeFilter, setDocTypeFilter] = useState<DocTypeFilter>('all');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  const [viewGrouping, setViewGrouping] = useState<ViewGrouping>('none');
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  
  // State for adding new installments
  const [addingInstallmentTo, setAddingInstallmentTo] = useState<string | null>(null);
  const [newInstallmentValue, setNewInstallmentValue] = useState<string>('');
  
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timerInterval: any;
    if (isUploading) {
      setSecondsElapsed(0);
      timerInterval = setInterval(() => {
        setSecondsElapsed(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timerInterval);
  }, [isUploading]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dateMenuRef.current && !dateMenuRef.current.contains(event.target as Node)) {
        setIsDateMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const processFileWithRetry = async (file: File): Promise<void> => {
    const reader = new FileReader();
    const base64Data = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = () => reject("Errore lettura file.");
      reader.readAsDataURL(file);
    });

    try {
      const extractedDataArray = await extractDocumentData(base64Data, file.type);
      
      for (const data of extractedDataArray) {
        const internalId = `REV-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        
        const products: Product[] = (data.products || []).map((p: any, index: number) => ({
          id: `${internalId}-P${index}`,
          sku: String(p.code || '').trim(),
          name: String(p.name || 'Prodotto/Servizio').trim(),
          quantity: parseFloat(p.quantity) || 1,
          unitOfMeasure: String(p.unit || 'UD').toUpperCase(),
          unitPrice: parseFloat(p.unitPrice) || 0,
          totalPrice: parseFloat(p.totalPrice) || (parseFloat(p.quantity) * parseFloat(p.unitPrice)) || 0,
          category: String(p.category || 'Generico').trim(),
          invoiceDate: data.date,
          invoiceId: internalId,
          invoiceNumber: String(data.documentNumber || 'N/D'),
          supplier: String(data.supplier || 'Fornitore Generico'),
          docType: 'reviewInvoice'
        }));

        const newDoc: Document = {
          id: internalId,
          documentNumber: String(data.documentNumber || 'N/D'),
          date: data.date,
          dueDate: data.dueDate,
          supplier: String(data.supplier || 'Fornitore Generico'),
          fileName: file.name,
          totalAmount: data.totalAmount || products.reduce((sum, p) => sum + p.totalPrice, 0),
          paidAmount: 0,
          status: 'processed',
          paymentStatus: 'unpaid',
          isCreditNote: !!data.isCreditNote,
          extractedProducts: products,
          type: 'reviewInvoice'
        };

        await onAdd(newDoc);
      }
    } catch (err: any) {
      throw err;
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress({ current: 0, total: files.length });
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(prev => ({ ...prev, current: i + 1 }));
        await processFileWithRetry(files[i]);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setError(err.message || "Errore durante l'elaborazione.");
    } finally {
      setIsUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  const handleStatusChange = (doc: Document, status: 'paid' | 'unpaid' | 'partial') => {
    let newPaidAmount = doc.paidAmount || 0;
    if (status === 'paid') newPaidAmount = doc.totalAmount;
    else if (status === 'unpaid') newPaidAmount = 0;
    
    onUpdate({ ...doc, paymentStatus: status, paidAmount: newPaidAmount });
    setAddingInstallmentTo(null);
  };

  const handleAddInstallment = (doc: Document) => {
    const amountToAdd = parseFloat(newInstallmentValue) || 0;
    if (amountToAdd <= 0) {
      setAddingInstallmentTo(null);
      setNewInstallmentValue('');
      return;
    }

    const currentPaid = doc.paidAmount || 0;
    const newTotalPaid = Math.min(doc.totalAmount, currentPaid + amountToAdd);
    
    // Se raggiungiamo il totale, segna come pagato
    const newStatus = newTotalPaid >= doc.totalAmount ? 'paid' : 'partial';

    onUpdate({ 
      ...doc, 
      paymentStatus: newStatus, 
      paidAmount: newTotalPaid 
    });

    setAddingInstallmentTo(null);
    setNewInstallmentValue('');
  };

  const formatCurrency = (val: number) => val.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

  const applyQuickFilter = (type: DocTypeFilter, payment: PaymentStatusType) => {
    setDocTypeFilter(type);
    setPaymentFilter(payment);
    setExpandedDocId(null);
  };

  const uniqueSuppliers = useMemo(() => {
    const suppliers = documents.map(doc => doc.supplier);
    return Array.from(new Set(suppliers)).sort();
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    let result = documents.filter(doc => {
      if (docTypeFilter === 'invoice' && doc.isCreditNote) return false;
      if (docTypeFilter === 'creditNote' && !doc.isCreditNote) return false;
      if (selectedSupplier !== 'all' && doc.supplier !== selectedSupplier) return false;
      
      if (paymentFilter !== 'all') {
        if (paymentFilter === 'unpaid' && doc.paymentStatus === 'paid') return false;
        if (paymentFilter === 'paid' && (doc.paymentStatus === 'unpaid' || doc.paymentStatus === 'partial')) return false;
        if (paymentFilter === 'partial' && doc.paymentStatus !== 'partial') return false;
        if (paymentFilter === 'unpaid' && doc.paymentStatus === 'partial') return true; 
        return doc.paymentStatus === paymentFilter;
      }
      return true;
    });

    result.sort((a, b) => {
      let valA: any, valB: any;
      if (sortField === 'dueDate') {
        valA = a.dueDate || a.date;
        valB = b.dueDate || b.date;
      } else if (sortField === 'supplier') {
        valA = a.supplier.toLowerCase();
        valB = b.supplier.toLowerCase();
      } else {
        valA = a.date;
        valB = b.date;
      }
      return sortOrder === 'asc' ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
    });

    return result;
  }, [documents, paymentFilter, docTypeFilter, selectedSupplier, sortField, sortOrder]);

  const getWeekNumber = (d: Date) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  const groupedData = useMemo(() => {
    if (viewGrouping === 'none') return { 'Tutti i documenti': filteredDocuments };
    if (viewGrouping === 'supplier') {
      return filteredDocuments.reduce((acc, doc) => {
        const key = doc.supplier;
        if (!acc[key]) acc[key] = [];
        acc[key].push(doc);
        return acc;
      }, {} as Record<string, Document[]>);
    }

    // Raggruppamento temporale
    return filteredDocuments.reduce((acc, doc) => {
      const d = new Date(doc.date);
      let key = "";
      
      if (viewGrouping === 'day') {
        key = d.toLocaleDateString(language === 'it' ? 'it-IT' : 'en-US', { day: '2-digit', month: 'long', year: 'numeric' });
        const today = new Date().toLocaleDateString(language === 'it' ? 'it-IT' : 'en-US', { day: '2-digit', month: 'long', year: 'numeric' });
        if (key === today) key = language === 'it' ? "Oggi" : "Today";
      } else if (viewGrouping === 'week') {
        const week = getWeekNumber(d);
        key = language === 'it' ? `Settimana ${week} - ${d.getFullYear()}` : `Week ${week} - ${d.getFullYear()}`;
      } else if (viewGrouping === 'month') {
        key = d.toLocaleString(language === 'it' ? 'it-IT' : 'en-US', { month: 'long', year: 'numeric' });
      } else if (viewGrouping === 'year') {
        key = language === 'it' ? `Anno ${d.getFullYear()}` : `Year ${d.getFullYear()}`;
      }

      if (!acc[key]) acc[key] = [];
      acc[key].push(doc);
      return acc;
    }, {} as Record<string, Document[]>);
  }, [filteredDocuments, viewGrouping, language]);

  const stats = useMemo(() => {
    return documents.reduce((acc, doc) => {
      const isPaid = doc.paymentStatus === 'paid';
      const isPartial = doc.paymentStatus === 'partial';
      const paidValue = isPaid ? doc.totalAmount : (isPartial ? (doc.paidAmount || 0) : 0);
      const remainingValue = doc.totalAmount - paidValue;

      if (isPartial) {
        acc.partialResidue += remainingValue;
      }

      if (doc.isCreditNote) {
        acc.receivedCredits += paidValue;
        acc.pendingCredits += remainingValue;
      } else {
        acc.paid += paidValue;
        acc.unpaid += remainingValue;
      }
      return acc;
    }, { paid: 0, unpaid: 0, pendingCredits: 0, receivedCredits: 0, partialResidue: 0 });
  }, [documents]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'supplier' ? 'asc' : 'desc');
    }
  };

  const activeGroupLabel = () => {
    if (viewGrouping === 'none') return "Elenco";
    if (viewGrouping === 'supplier') return "Per Fornitore";
    if (viewGrouping === 'day') return "Giorno";
    if (viewGrouping === 'week') return "Settimana";
    if (viewGrouping === 'month') return "Mese";
    if (viewGrouping === 'year') return "Anno";
    return "Filtra";
  };

  const isTimeGroupActive = ['day', 'week', 'month', 'year'].includes(viewGrouping);

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.invoiceReview}</h1>
          <p className="text-slate-500">{t.reviewSubtitle}</p>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 w-full lg:w-auto">
          <button 
            onClick={() => applyQuickFilter('invoice', 'unpaid')}
            className={`bg-white border text-left transition-all px-4 py-3 rounded-2xl flex flex-col shadow-sm group hover:shadow-md hover:-translate-y-0.5 ${docTypeFilter === 'invoice' && paymentFilter === 'unpaid' ? 'border-rose-400 ring-2 ring-rose-50' : 'border-rose-100'}`}
          >
            <span className="text-[9px] font-black text-rose-400 uppercase tracking-wider group-hover:text-rose-500">Fatture da Pagare</span>
            <span className="text-base font-black text-rose-700">{formatCurrency(stats.unpaid)}</span>
          </button>
          
          <button 
            onClick={() => applyQuickFilter('invoice', 'paid')}
            className={`bg-white border text-left transition-all px-4 py-3 rounded-2xl flex flex-col shadow-sm group hover:shadow-md hover:-translate-y-0.5 ${docTypeFilter === 'invoice' && paymentFilter === 'paid' ? 'border-emerald-400 ring-2 ring-emerald-50' : 'border-emerald-100'}`}
          >
            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider group-hover:text-emerald-500">Fatture Pagate</span>
            <span className="text-base font-black text-emerald-700">{formatCurrency(stats.paid)}</span>
          </button>

          <button 
            onClick={() => applyQuickFilter('all', 'partial')}
            className={`bg-white border text-left transition-all px-4 py-3 rounded-2xl flex flex-col shadow-sm group hover:shadow-md hover:-translate-y-0.5 ${paymentFilter === 'partial' ? 'border-amber-400 ring-2 ring-amber-50' : 'border-amber-100'}`}
          >
            <span className="text-[9px] font-black text-amber-500 uppercase tracking-wider group-hover:text-amber-600">Pagamenti Parziali</span>
            <span className="text-base font-black text-amber-700">{formatCurrency(stats.partialResidue)}</span>
          </button>

          <button 
            onClick={() => applyQuickFilter('creditNote', 'unpaid')}
            className={`bg-white border text-left transition-all px-4 py-3 rounded-2xl flex flex-col shadow-sm group hover:shadow-md hover:-translate-y-0.5 ${docTypeFilter === 'creditNote' && paymentFilter === 'unpaid' ? 'border-fuchsia-400 ring-2 ring-fuchsia-50' : 'border-fuchsia-100'}`}
          >
            <span className="text-[9px] font-black text-fuchsia-400 uppercase tracking-wider group-hover:text-fuchsia-500">Abbuoni da Ricevere</span>
            <span className="text-base font-black text-fuchsia-700">{formatCurrency(stats.pendingCredits)}</span>
          </button>

          <button 
            onClick={() => applyQuickFilter('creditNote', 'paid')}
            className={`bg-white border text-left transition-all px-4 py-3 rounded-2xl flex flex-col shadow-sm group hover:shadow-md hover:-translate-y-0.5 ${docTypeFilter === 'creditNote' && paymentFilter === 'paid' ? 'border-indigo-400 ring-2 ring-indigo-50' : 'border-indigo-100'}`}
          >
            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-wider group-hover:text-indigo-500">Abbuoni Saldati</span>
            <span className="text-base font-black text-indigo-700">{formatCurrency(stats.receivedCredits)}</span>
          </button>
        </div>
      </header>

      <div className={`bg-white border-2 border-dashed rounded-3xl p-10 text-center transition-all ${isUploading ? 'border-indigo-400 bg-indigo-50 shadow-inner' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50 shadow-sm'}`}>
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,image/*" className="hidden" id="rev-upload" multiple />
        {isUploading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <Loader2 className="animate-spin text-indigo-600" size={56} />
              <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-indigo-700">
                {uploadProgress.current}/{uploadProgress.total}
              </div>
            </div>
            <div className="space-y-1">
              <p className="font-bold text-slate-900 flex items-center justify-center gap-2"><Zap size={18} className="text-indigo-600 animate-pulse" /> Analisi in corso...</p>
              <p className="text-xs text-slate-400 font-mono">{secondsElapsed}s trascorsi</p>
            </div>
          </div>
        ) : (
          <label htmlFor="rev-upload" className="cursor-pointer flex flex-col items-center gap-4">
            <div className="p-6 bg-indigo-100 text-indigo-600 rounded-full flex gap-3 shadow-inner">
              <Receipt size={36} />
              <HandCoins size={24} className="opacity-40" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Gestione Pagamenti e Abbuoni</h3>
              <p className="text-slate-500 text-sm max-w-sm mx-auto">Carica le tue fatture e i tuoi abbuoni per monitorare i flussi di cassa.</p>
            </div>
            <span className="mt-2 inline-flex px-10 py-3.5 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200">Aggiungi Documenti</span>
          </label>
        )}
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Landmark size={22} className="text-indigo-600" /> Registro Scadenze</h2>
              {(docTypeFilter !== 'all' || paymentFilter !== 'all' || selectedSupplier !== 'all' || viewGrouping !== 'none') && (
                <button 
                  onClick={() => { setDocTypeFilter('all'); setPaymentFilter('all'); setSelectedSupplier('all'); setViewGrouping('none'); }}
                  className="text-[10px] font-black uppercase text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg transition"
                >
                  Reset Filtri
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border border-slate-200 overflow-visible no-scrollbar">
              <button 
                onClick={() => { setViewGrouping('none'); setIsDateMenuOpen(false); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition whitespace-nowrap ${viewGrouping === 'none' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <LayoutList size={14} /> Elenco
              </button>
              <button 
                onClick={() => { setViewGrouping('supplier'); setIsDateMenuOpen(false); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition whitespace-nowrap ${viewGrouping === 'supplier' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <Users size={14} /> Fornitori
              </button>
              
              <div className="relative" ref={dateMenuRef}>
                <button 
                  onClick={() => setIsDateMenuOpen(!isDateMenuOpen)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition whitespace-nowrap ${isTimeGroupActive ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  <CalendarDays size={14} /> {isTimeGroupActive ? activeGroupLabel() : "Per Data"}
                  <ChevronDown size={10} className={`transition-transform ${isDateMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isDateMenuOpen && (
                  <div className="absolute top-full left-0 mt-2 w-40 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-1 animate-in zoom-in-95 duration-200">
                    <button onClick={() => { setViewGrouping('day'); setIsDateMenuOpen(false); }} className={`w-full text-left px-3 py-2 text-[10px] font-black uppercase rounded-lg hover:bg-slate-50 transition ${viewGrouping === 'day' ? 'text-indigo-600' : 'text-slate-500'}`}>Giorno</button>
                    <button onClick={() => { setViewGrouping('week'); setIsDateMenuOpen(false); }} className={`w-full text-left px-3 py-2 text-[10px] font-black uppercase rounded-lg hover:bg-slate-50 transition ${viewGrouping === 'week' ? 'text-indigo-600' : 'text-slate-500'}`}>Settimana</button>
                    <button onClick={() => { setViewGrouping('month'); setIsDateMenuOpen(false); }} className={`w-full text-left px-3 py-2 text-[10px] font-black uppercase rounded-lg hover:bg-slate-50 transition ${viewGrouping === 'month' ? 'text-indigo-600' : 'text-slate-500'}`}>Mese</button>
                    <button onClick={() => { setViewGrouping('year'); setIsDateMenuOpen(false); }} className={`w-full text-left px-3 py-2 text-[10px] font-black uppercase rounded-lg hover:bg-slate-50 transition ${viewGrouping === 'year' ? 'text-indigo-600' : 'text-slate-500'}`}>Anno</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Ordina Per:</span>
            <button 
              onClick={() => toggleSort('date')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border transition-all flex items-center gap-1.5 ${sortField === 'date' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
            >
              <Calendar size={12} /> Data {sortField === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <button 
              onClick={() => toggleSort('dueDate')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border transition-all flex items-center gap-1.5 ${sortField === 'dueDate' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
            >
              <Clock size={12} /> Scadenza {sortField === 'dueDate' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <button 
              onClick={() => toggleSort('supplier')}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border transition-all flex items-center gap-1.5 ${sortField === 'supplier' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
            >
              <Users size={12} /> Fornitore {sortField === 'supplier' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>

            <div className="h-6 w-px bg-slate-200 mx-2 hidden sm:block"></div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 sm:pb-0">
              <select 
                value={selectedSupplier}
                onChange={e => setSelectedSupplier(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase shadow-sm focus:ring-2 focus:ring-indigo-100 outline-none"
              >
                <option value="all">Tutti i Fornitori</option>
                {uniqueSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              
              <select 
                value={paymentFilter} 
                onChange={e => setPaymentFilter(e.target.value as any)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase shadow-sm focus:ring-2 focus:ring-indigo-100 outline-none"
              >
                <option value="all">Stato: Tutti</option>
                <option value="unpaid">Da Saldare</option>
                <option value="partial">Parziali</option>
                <option value="paid">Saldati</option>
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-10">
          {(Object.entries(groupedData) as [string, Document[]][]).map(([groupTitle, docs]) => (
            <div key={groupTitle} className="space-y-4">
              {viewGrouping !== 'none' && (
                <div className="flex items-center gap-2 px-2">
                  <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">{groupTitle} <span className="text-slate-400 font-bold lowercase">({docs.length})</span></h3>
                </div>
              )}
              
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {docs.length === 0 ? (
                  <div className="p-24 text-center text-slate-300">
                    <Landmark className="mx-auto mb-4 opacity-5" size={100} />
                    <p className="font-medium text-slate-400">Nessun documento corrispondente ai filtri.</p>
                    <button 
                      onClick={() => { setDocTypeFilter('all'); setPaymentFilter('all'); setSelectedSupplier('all'); }}
                      className="mt-4 text-xs font-black text-indigo-600 hover:underline"
                    >
                      Mostra tutti i documenti
                    </button>
                  </div>
                ) : (
                  docs.map((doc) => {
                    const isExpanded = expandedDocId === doc.id;
                    const isConfirmingDelete = confirmingDeleteDocId === doc.id;
                    const isPaid = doc.paymentStatus === 'paid';
                    const isPartial = doc.paymentStatus === 'partial';
                    const isUnpaid = doc.paymentStatus === 'unpaid';
                    const isCN = doc.isCreditNote;
                    const remaining = Math.abs(doc.totalAmount - (doc.paidAmount || 0));
                    
                    const isAddingInstallment = addingInstallmentTo === doc.id;

                    return (
                      <div key={doc.id} className="group transition-all">
                        <div className={`p-6 flex items-center justify-between cursor-pointer hover:bg-slate-50 ${isExpanded ? 'bg-indigo-50/20' : ''} ${isConfirmingDelete ? 'bg-rose-50/40' : ''}`} onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}>
                          <div className="flex items-center gap-5 flex-1">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className={`font-black text-lg transition-colors ${isConfirmingDelete ? 'text-rose-700' : 'text-slate-900'}`}>{doc.supplier}</h4>
                                <span className={`px-2 py-0.5 text-[10px] font-black rounded uppercase tracking-tight ${isCN ? 'bg-fuchsia-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                                  {isCN ? "ABBUONO" : `FATTURA #${doc.documentNumber}`}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                                <p className="text-xs text-slate-500 font-medium flex items-center gap-1"><Calendar size={12}/> {new Date(doc.date).toLocaleDateString()}</p>
                                <p className={`text-xs font-bold flex items-center gap-1 ${!isPaid && new Date(doc.dueDate || doc.date) < new Date() ? 'text-rose-600' : 'text-slate-400'}`}>
                                  <Clock size={12}/> Scadenza: {new Date(doc.dueDate || doc.date).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="text-right flex items-center gap-4 md:gap-8">
                            <div className="hidden sm:block">
                              <div className="flex flex-col items-end">
                                <p className={`text-xl font-black ${isCN ? 'text-fuchsia-700' : isPaid ? 'text-emerald-700' : isPartial ? 'text-amber-600' : 'text-slate-900'}`}>
                                  {formatCurrency(isCN ? -Math.abs(doc.totalAmount) : doc.totalAmount)}
                                </p>
                                {(isPartial || (isPaid && doc.paidAmount && doc.paidAmount < doc.totalAmount)) && (
                                  <p className="text-[10px] font-black uppercase text-slate-400">Residuo: <span className="text-rose-600">{formatCurrency(isCN ? -remaining : remaining)}</span></p>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              {isConfirmingDelete ? (
                                <div className="flex items-center gap-1.5 bg-rose-100 p-1.5 rounded-2xl border border-rose-200 shadow-lg animate-in zoom-in-95">
                                  <button onClick={() => { onDelete(doc.id); setConfirmingDeleteDocId(null); }} className="px-3 py-2 bg-rose-600 text-white text-[10px] font-black rounded-xl hover:bg-rose-700 transition">SI</button>
                                  <button onClick={() => setConfirmingDeleteDocId(null)} className="px-3 py-2 bg-white text-slate-600 text-[10px] font-black rounded-xl border border-slate-200 hover:bg-slate-50 transition">NO</button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-3">
                                  <div className="flex flex-col items-end gap-1.5">
                                    <div className="relative">
                                      <select 
                                        value={doc.paymentStatus}
                                        onChange={(e) => handleStatusChange(doc, e.target.value as 'paid' | 'unpaid' | 'partial')}
                                        className={`appearance-none pl-3 pr-8 py-2 text-[10px] font-black uppercase tracking-tight rounded-xl border transition-all cursor-pointer shadow-sm focus:outline-none focus:ring-2 ${
                                          isPaid 
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100 focus:ring-emerald-200' 
                                            : isPartial
                                              ? 'bg-amber-50 text-amber-700 border-amber-100 focus:ring-amber-200'
                                              : 'bg-rose-50 text-rose-700 border-rose-100 focus:ring-rose-200'
                                        }`}
                                      >
                                        <option value="unpaid">{isCN ? "DA RICEVERE" : "DA PAGARE"}</option>
                                        <option value="partial">PAGAMENTO PARZIALE</option>
                                        <option value="paid">{isCN ? "RICEVUTO" : "SALDATO"}</option>
                                      </select>
                                      <ChevronDown size={14} className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${isPaid ? 'text-emerald-500' : isPartial ? 'text-amber-500' : 'text-rose-500'}`} />
                                    </div>

                                    {isPartial && (
                                      <div className="flex flex-col items-end gap-1.5 animate-in slide-in-from-right-2">
                                        <div className="flex items-center gap-2">
                                          <div className="flex items-center gap-2 bg-white border border-amber-100 rounded-xl px-2 py-1 shadow-sm">
                                            <span className="text-[9px] font-black text-amber-600 uppercase">Tot. Versato:</span>
                                            <span className="text-[11px] font-black text-slate-800">{formatCurrency(doc.paidAmount || 0)}</span>
                                          </div>
                                          <button 
                                            onClick={() => { setAddingInstallmentTo(isAddingInstallment ? null : doc.id); setNewInstallmentValue(''); }}
                                            className={`p-1.5 rounded-lg transition-all ${isAddingInstallment ? 'bg-rose-500 text-white shadow-rose-100' : 'bg-indigo-600 text-white shadow-indigo-100'} shadow-md`}
                                          >
                                            {isAddingInstallment ? <X size={14} /> : <Plus size={14} />}
                                          </button>
                                        </div>

                                        {isAddingInstallment && (
                                          <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-xl px-2 py-1.5 shadow-lg animate-in zoom-in-95">
                                            <span className="text-[9px] font-black text-indigo-600 uppercase">Nuovo Acconto:</span>
                                            <input 
                                              type="number"
                                              autoFocus
                                              value={newInstallmentValue}
                                              onChange={(e) => setNewInstallmentValue(e.target.value)}
                                              onKeyDown={(e) => e.key === 'Enter' && handleAddInstallment(doc)}
                                              className="w-16 bg-transparent text-[11px] font-black text-slate-800 outline-none text-right"
                                              step="0.01"
                                              placeholder="0.00"
                                            />
                                            <button 
                                              onClick={() => handleAddInstallment(doc)}
                                              className="p-1 bg-emerald-500 text-white rounded-md hover:bg-emerald-600"
                                            >
                                              <Check size={12} />
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  <button onClick={() => setConfirmingDeleteDocId(doc.id)} className="p-3 text-slate-300 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100 hover:bg-rose-50 rounded-xl">
                                    <Trash2 size={22} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {isExpanded && !isConfirmingDelete && (
                          <div className="px-6 pb-6 animate-in slide-in-from-top-2">
                            <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-inner p-5 space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Stato Gestionale</span>
                                  <div className="flex items-center gap-2">
                                    {isPaid ? <CheckCircle2 size={16} className="text-emerald-500"/> : isPartial ? <Split size={16} className="text-amber-500"/> : <AlertTriangle size={16} className="text-rose-500"/>}
                                    <p className={`font-black text-xs uppercase tracking-tight ${isPaid ? 'text-emerald-600' : isPartial ? 'text-amber-600' : 'text-rose-600'}`}>
                                      {isCN ? (isPaid ? 'Saldato' : isPartial ? 'Parziale' : 'In attesa') : (isPaid ? 'Saldata' : isPartial ? 'Acconto versato' : 'In sospeso')}
                                    </p>
                                  </div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Importo Totale</span>
                                  <p className="text-base font-black text-slate-900">{formatCurrency(isCN ? -Math.abs(doc.totalAmount) : doc.totalAmount)}</p>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                  <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest block mb-1">Già Pagato</span>
                                  <p className="text-base font-black text-amber-600">{formatCurrency(doc.paidAmount || 0)}</p>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                  <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest block mb-1">Da Saldare</span>
                                  <p className="text-base font-black text-rose-700">{formatCurrency(isCN ? -remaining : remaining)}</p>
                                </div>
                              </div>
                              
                              <div className="pt-2">
                                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">Dettaglio Voci</h5>
                                <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                                  <table className="w-full text-left text-xs">
                                    <thead>
                                      <tr className="bg-slate-50/50 text-slate-400">
                                        <th className="px-4 py-2.5 font-bold uppercase">Descrizione</th>
                                        <th className="px-4 py-2.5 font-bold uppercase text-right">Valore</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {doc.extractedProducts.map((p) => (
                                        <tr key={p.id} className="hover:bg-slate-50/50">
                                          <td className="px-4 py-3 font-semibold text-slate-700">{p.name}</td>
                                          <td className="px-4 py-3 text-right font-black text-slate-900">{formatCurrency(isCN ? -Math.abs(p.totalPrice) : p.totalPrice)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
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
          ))}
        </div>
      </div>
    </div>
  );
};

export default InvoiceReviewManager;
