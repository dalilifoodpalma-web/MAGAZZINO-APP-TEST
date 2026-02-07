
import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, AlertCircle, Loader2, Trash2, Hash, Edit2, Save, X, ChevronDown, ChevronUp, Package, AlertTriangle, Truck, Files, Clock, Zap, Image as ImageIcon, CloudOff } from 'lucide-react';
import { Document, Product } from '../types';
import { extractDocumentData } from '../services/geminiService';
import { translations, Language } from '../translations';

interface DocumentManagerProps {
  documents: Document[];
  onAdd: (doc: Document) => void;
  onUpdate: (doc: Document) => void;
  onDelete: (id: string) => void;
  type: 'invoice' | 'deliveryNote';
  language: Language;
}

const DocumentManager: React.FC<DocumentManagerProps> = ({ documents, onAdd, onUpdate, onDelete, type, language }) => {
  const t = translations[language];
  const [isUploading, setIsUploading] = useState(false);
  const [isWaitingQuota, setIsWaitingQuota] = useState(false);
  const [uploadCount, setUploadCount] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<{message: string, type: 'ia' | 'db' | 'generic'} | null>(null);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [confirmingDeleteDocId, setConfirmingDeleteDocId] = useState<string | null>(null);
  const [editSupplier, setEditSupplier] = useState<string>('');
  const [loadingStep, setLoadingStep] = useState(0);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isInvoice = type === 'invoice';
  const Icon = isInvoice ? FileText : Truck;
  const label = isInvoice ? t.invoices : t.deliveryNotes;

  useEffect(() => {
    let interval: any;
    let timerInterval: any;
    if (isUploading) {
      setLoadingStep(0);
      setSecondsElapsed(0);
      interval = setInterval(() => {
        setLoadingStep(prev => (prev < 4 ? prev + 1 : prev));
      }, 6000);
      timerInterval = setInterval(() => {
        setSecondsElapsed(prev => prev + 1);
      }, 1000);
    }
    return () => {
      clearInterval(interval);
      clearInterval(timerInterval);
    };
  }, [isUploading]);

  const compressImage = (file: File): Promise<{data: string, type: string}> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_DIM = 1800;
          if (width > height && width > MAX_DIM) {
            height *= MAX_DIM / width;
            width = MAX_DIM;
          } else if (height > MAX_DIM) {
            width *= MAX_DIM / height;
            height = MAX_DIM;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          resolve({
            data: compressed.split(',')[1],
            type: 'image/jpeg'
          });
        };
      };
    });
  };

  const processFileWithRetry = async (file: File): Promise<void> => {
    let base64Data = "";
    let mimeType = file.type;

    try {
      if (file.type.startsWith('image/')) {
        const compressed = await compressImage(file);
        base64Data = compressed.data;
        mimeType = compressed.type;
      } else {
        const reader = new FileReader();
        base64Data = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = () => reject(new Error("Errore lettura file."));
          reader.readAsDataURL(file);
        });
      }

      const extractedDataArray = await extractDocumentData(base64Data, mimeType);
      
      for (const data of extractedDataArray) {
        const internalId = `${type === 'invoice' ? 'INV' : 'DDT'}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const products: Product[] = (data.products || []).map((p: any, index: number) => ({
          id: `${internalId}-${index}`,
          sku: String(p.code || '').trim(),
          name: String(p.name || 'Prodotto').trim(),
          quantity: parseFloat(p.quantity) || 0,
          unitOfMeasure: String(p.unit || 'UD').toUpperCase(),
          unitPrice: parseFloat(p.unitPrice) || 0,
          totalPrice: parseFloat(p.totalPrice) || (parseFloat(p.quantity) * parseFloat(p.unitPrice)) || 0,
          category: String(p.category || 'Altro').trim(),
          invoiceDate: data.date || new Date().toISOString().split('T')[0],
          invoiceId: internalId,
          invoiceNumber: data.documentNumber || `DOC-${Date.now()}`,
          supplier: data.supplier || 'Sconosciuto',
          docType: type
        }));

        const newDoc: Document = {
          id: internalId,
          documentNumber: data.documentNumber || `DOC-${Date.now()}`,
          date: data.date || new Date().toISOString().split('T')[0],
          supplier: data.supplier || 'Sconosciuto',
          fileName: file.name,
          totalAmount: data.totalAmount || products.reduce((sum, p) => sum + p.totalPrice, 0),
          status: 'processed',
          extractedProducts: products,
          type: type,
          isCreditNote: !!data.isCreditNote
        };
        
        await onAdd(newDoc);
      }
    } catch (err: any) {
      if (err.message?.includes("Database") || err.message?.includes("column")) {
        throw { message: "Errore Sincronizzazione Cloud. Il file è stato letto ma non salvato.", type: 'db' };
      } else if (err.message?.includes("TIMEOUT") || err.message?.includes("fetch")) {
        throw { message: "L'IA ha impiegato troppo tempo. Riprova con un file più leggero o una foto più chiara.", type: 'ia' };
      }
      throw { message: err.message || "Errore sconosciuto.", type: 'generic' };
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadCount({ current: 0, total: files.length });
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        setUploadCount(prev => ({ ...prev, current: i + 1 }));
        await processFileWithRetry(files[i]);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setError(err);
    } finally {
      setIsUploading(false);
      setUploadCount({ current: 0, total: 0 });
    }
  };

  const formatCurrency = (val: number) => val.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-slate-900">Gestione {label}</h1>
        <p className="text-slate-500">{t.inventoryMonitoring}</p>
      </div>

      <div className={`bg-white border-2 border-dashed rounded-3xl p-10 text-center transition-all ${isUploading ? 'border-indigo-400 bg-indigo-50 shadow-inner' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50 shadow-sm'}`}>
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,image/*" className="hidden" id="doc-upload" multiple />
        {isUploading ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-indigo-600" size={56} />
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2">
                <Zap size={18} className="text-indigo-600 fill-indigo-600 animate-bounce" />
                <p className="font-bold text-slate-900 text-lg">Analisi accelerata...</p>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs font-mono rounded-lg">{secondsElapsed}s</span>
              </div>
              <p className="text-xs text-slate-400">Estrazione dati in corso con Gemini Flash Lite.</p>
            </div>
          </div>
        ) : (
          <label htmlFor="doc-upload" className="cursor-pointer flex flex-col items-center gap-4">
            <div className="p-6 bg-indigo-100 text-indigo-600 rounded-full flex gap-3 shadow-inner">
              <Upload size={36} />
              <ImageIcon size={24} className="opacity-40" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Carica Documenti</h3>
              <p className="text-slate-500 text-sm max-w-sm mx-auto mt-1">Caricamento ultra-veloce dei prodotti nel magazzino.</p>
            </div>
            <span className="mt-2 inline-flex px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200">Seleziona File</span>
          </label>
        )}
      </div>

      {error && (
        <div className={`flex items-center gap-4 p-5 rounded-2xl border shadow-sm animate-in shake duration-500 ${error.type === 'db' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
          {error.type === 'db' ? <CloudOff size={24} /> : <AlertCircle size={24} />}
          <div className="flex-1 text-left">
            <p className="text-sm font-black uppercase tracking-tight">{error.type === 'db' ? "Problema Cloud" : "Problema IA"}</p>
            <p className="text-xs opacity-90">{error.message}</p>
            {error.type === 'db' && <p className="text-[10px] mt-1 font-bold italic">L'app continuerà a funzionare in modalità locale per questo documento.</p>}
          </div>
          <button onClick={() => setError(null)} className="p-2 hover:bg-black/5 rounded-lg transition-colors"><X size={18}/></button>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Icon className="text-indigo-600" size={20} /> {t.history} {label}
        </h2>
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {documents.length === 0 ? (
            <div className="p-20 text-center text-slate-300">
              <Icon className="mx-auto mb-4 opacity-10" size={80} />
              <p className="font-medium">Nessun documento in archivio.</p>
            </div>
          ) : (
            documents.map((doc) => {
              const isExpanded = expandedDocId === doc.id;
              const isConfirmingDelete = confirmingDeleteDocId === doc.id;
              return (
                <div key={doc.id} className="group transition-all">
                  <div className={`p-6 flex items-center justify-between cursor-pointer hover:bg-slate-50 ${isExpanded ? 'bg-indigo-50/20' : ''} ${isConfirmingDelete ? 'bg-rose-50/40' : ''}`} onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}>
                    <div className="flex items-center gap-5 flex-1">
                      <div className={`p-3 rounded-2xl border transition-all ${isExpanded ? 'bg-indigo-600 text-white shadow-md' : isConfirmingDelete ? 'bg-rose-600 text-white shadow-md' : 'bg-slate-100 text-slate-600'}`}>
                        {isConfirmingDelete ? <AlertTriangle size={24} /> : isExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className={`font-black text-lg transition-colors ${isConfirmingDelete ? 'text-rose-700' : 'text-slate-900'}`}>{doc.supplier}</h4>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-tighter ${doc.isCreditNote ? 'bg-fuchsia-100 text-fuchsia-700' : 'bg-indigo-100 text-indigo-700'}`}>
                            {doc.isCreditNote ? "ABBUONO" : `#${doc.documentNumber}`}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 mt-1 font-medium">{new Date(doc.date).toLocaleDateString()} | {doc.extractedProducts.length} prodotti</p>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-6">
                      <p className={`text-xl font-black ${isConfirmingDelete ? 'text-rose-700' : 'text-slate-900'}`}>{formatCurrency(doc.totalAmount)}</p>
                      
                      <div className="flex items-center" onClick={e => e.stopPropagation()}>
                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1.5 bg-rose-100 p-1 rounded-xl border border-rose-200 shadow-sm animate-in zoom-in-95">
                            <button 
                              onClick={() => { onDelete(doc.id); setConfirmingDeleteDocId(null); }} 
                              className="px-3 py-1.5 bg-rose-600 text-white text-[10px] font-black rounded-lg hover:bg-rose-700 transition"
                            >
                              SI
                            </button>
                            <button 
                              onClick={() => setConfirmingDeleteDocId(null)} 
                              className="px-3 py-1.5 bg-white text-slate-600 text-[10px] font-black rounded-lg border border-slate-200 hover:bg-slate-50 transition"
                            >
                              NO
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => setConfirmingDeleteDocId(doc.id)} 
                            className="p-2.5 text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all"
                            title="Elimina documento"
                          >
                            <Trash2 size={22} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {isExpanded && !isConfirmingDelete && (
                    <div className="px-6 pb-6 animate-in slide-in-from-top-2">
                      <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-inner">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-200">
                              <th className="px-4 py-3 font-bold text-slate-600 text-[10px] uppercase">Prodotto</th>
                              <th className="px-4 py-3 font-bold text-slate-600 text-[10px] uppercase text-center">Quantità</th>
                              <th className="px-4 py-3 font-bold text-slate-600 text-[10px] uppercase text-right">Prezzo Unit.</th>
                              <th className="px-4 py-3 font-bold text-slate-600 text-[10px] uppercase text-right">Totale</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {doc.extractedProducts.map((p) => (
                              <tr key={p.id} className="hover:bg-white">
                                <td className="px-4 py-3 font-bold">{p.name} <span className="text-[10px] font-mono text-slate-400">({p.sku || 'N/D'})</span></td>
                                <td className="px-4 py-3 text-center font-black">{p.quantity} <span className="text-[10px] opacity-50">{p.unitOfMeasure}</span></td>
                                <td className="px-4 py-3 text-right text-slate-500">{formatCurrency(p.unitPrice)}</td>
                                <td className="px-4 py-3 text-right font-black text-indigo-600">{formatCurrency(p.totalPrice)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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

export default DocumentManager;
