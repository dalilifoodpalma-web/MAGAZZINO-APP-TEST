
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FileSpreadsheet, Download, AlertCircle, CheckCircle2, Cloud, CloudOff, FileText, Trash2, X, Database } from 'lucide-react';
import * as XLSX from 'xlsx';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import DocumentManager from './components/DocumentManager';
import PhysicalInventoryManager from './components/PhysicalInventoryManager';
import InvoiceReviewManager from './components/InvoiceReviewManager';
import { Product, Document, ViewType } from './types';
import { translations, Language } from './translations';
import { cloudDb, supabase } from './services/supabaseService';

// Funzione di normalizzazione testo ultra-aggressiva per il matching
export const cleanString = (s: string) => {
  return (s || '')
    .toString()
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Rimuove accenti
    .replace(/[^a-z0-9]/g, ''); // Rimuove tutto ciò che non è alfanumerico
};

// Normalizzazione standard delle unità di misura per evitare discrepanze tra Excel e PDF
export const normalizeUnit = (unit: string): string => {
  const u = (unit || '').toString().toLowerCase().trim().replace(/[^a-z]/g, '');
  if (['pz', 'un', 'unit', 'each', 'pezzo', 'pezzi', 'ud', 'unita', 'u', 'pieces'].includes(u)) return 'UD';
  if (['kg', 'kilo', 'kilogrammi', 'gr', 'grammi', 'g', 'kilogram', 'kilos'].includes(u)) return 'KG';
  if (['cj', 'ct', 'cs', 'cassa', 'casse', 'box', 'collo', 'conf', 'caisse', 'bt', 'bott', 'case'].includes(u)) return 'CJ';
  return 'UD'; 
};

// Generatore di chiave univoca per il matching perfetto
export const getProductKey = (name: string, sku: string, unit: string): string => {
  const s = cleanString(sku);
  const n = cleanString(name);
  const u = normalizeUnit(unit);
  
  // Se c'è uno SKU valido (non vuoto), è l'identificativo primario
  if (s && s.length > 0) return `SKU-${s}`;
  // Altrimenti usiamo Nome + Unità come fallback
  return `NAME-${n}-${u}`;
};

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('app_lang');
    return (saved as Language) || 'it';
  });
  
  const [invoices, setInvoices] = useState<Document[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<Document[]>([]);
  const [physicalCounts, setPhysicalCounts] = useState<Document[]>([]);
  const [reviewInvoices, setReviewInvoices] = useState<Document[]>([]);
  
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [inventoryGrouping, setInventoryGrouping] = useState<'month' | 'category' | 'supplier' | 'none'>('month');
  const [isSyncing, setIsSyncing] = useState(false);
  
  const isInitialLoadDone = useRef(false);

  const t = translations[language];

  useEffect(() => {
    localStorage.setItem('app_lang', language);
  }, [language]);

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Funzione per unire documenti locali e cloud in modo intelligente
  const mergeDocuments = (local: Document[], cloud: Document[]) => {
    const map = new Map<string, Document>();
    // Carica locali
    local.forEach(d => map.set(d.id, d));
    // Unisci cloud: se esiste già, mantieni quello con lo stato di pagamento più "avanzato"
    cloud.forEach(d => {
      const existing = map.get(d.id);
      if (existing) {
        // Se locale è 'paid' e cloud no, diamo fiducia al locale finché il cloud non si aggiorna
        const existingPriority = existing.paymentStatus === 'paid' ? 2 : (existing.paymentStatus === 'partial' ? 1 : 0);
        const cloudPriority = d.paymentStatus === 'paid' ? 2 : (d.paymentStatus === 'partial' ? 1 : 0);
        
        if (cloudPriority >= existingPriority) {
          map.set(d.id, d);
        }
      } else {
        map.set(d.id, d);
      }
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  useEffect(() => {
    const initData = async () => {
      setIsSyncing(true);
      try {
        // 1. Carichiamo prima il locale per velocità
        const savedInvoices = JSON.parse(localStorage.getItem('invoices') || '[]');
        const savedBolle = JSON.parse(localStorage.getItem('deliveryNotes') || '[]');
        const savedPhysical = JSON.parse(localStorage.getItem('physicalCounts') || '[]');
        const savedReview = JSON.parse(localStorage.getItem('reviewInvoices') || '[]');
        
        setInvoices(savedInvoices);
        setDeliveryNotes(savedBolle);
        setPhysicalCounts(savedPhysical);
        setReviewInvoices(savedReview);

        // 2. Se Supabase è attivo, facciamo il merge dei dati cloud
        if (supabase) {
          const cloudDocs = await cloudDb.getAllDocuments();
          if (cloudDocs && cloudDocs.length > 0) {
            setInvoices(prev => mergeDocuments(prev, cloudDocs.filter(d => d.type === 'invoice')));
            setDeliveryNotes(prev => mergeDocuments(prev, cloudDocs.filter(d => d.type === 'deliveryNote')));
            setPhysicalCounts(prev => mergeDocuments(prev, cloudDocs.filter(d => d.type === 'physicalCount')));
            setReviewInvoices(prev => mergeDocuments(prev, cloudDocs.filter(d => d.type === 'reviewInvoice')));
          }
        }
      } catch (e) {
        console.error("Initialization Error:", e);
      } finally {
        isInitialLoadDone.current = true;
        setIsSyncing(false);
      }
    };
    initData();
  }, []);

  // Salvataggio automatico in localStorage ad ogni cambiamento
  useEffect(() => {
    if (!isInitialLoadDone.current) return;
    localStorage.setItem('invoices', JSON.stringify(invoices));
    localStorage.setItem('deliveryNotes', JSON.stringify(deliveryNotes));
    localStorage.setItem('physicalCounts', JSON.stringify(physicalCounts));
    localStorage.setItem('reviewInvoices', JSON.stringify(reviewInvoices));
  }, [invoices, deliveryNotes, physicalCounts, reviewInvoices]);

  const addDocument = async (newDoc: Document) => {
    setIsSyncing(true);
    // Stato ottimistico locale
    if (newDoc.type === 'invoice') setInvoices(prev => [newDoc, ...prev]);
    else if (newDoc.type === 'deliveryNote') setDeliveryNotes(prev => [newDoc, ...prev]);
    else if (newDoc.type === 'physicalCount') setPhysicalCounts(prev => [newDoc, ...prev]);
    else if (newDoc.type === 'reviewInvoice') setReviewInvoices(prev => [newDoc, ...prev]);

    try {
      await cloudDb.upsertDocument(newDoc);
      // Non mostriamo più il popup di successo per ogni singola aggiunta se non necessario, o lo teniamo discreto
    } catch (e: any) {
      console.warn("Cloud Sync issue (add):", e.message);
      // Non mostriamo errori all'utente se il salvataggio locale è riuscito
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteDocument = async (id: string, type: string) => {
    setIsSyncing(true);
    try {
      if (type === 'invoice') setInvoices(prev => prev.filter(i => i.id !== id));
      else if (type === 'deliveryNote') setDeliveryNotes(prev => prev.filter(dn => dn.id !== id));
      else if (type === 'physicalCount') setPhysicalCounts(prev => prev.filter(pc => pc.id !== id));
      else if (type === 'reviewInvoice') setReviewInvoices(prev => prev.filter(ri => ri.id !== id));
      
      await cloudDb.deleteDocument(id);
    } catch (e) {
      console.warn("Cloud Sync issue (delete):", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateDocument = async (updatedDoc: Document) => {
    setIsSyncing(true);
    try {
      // Aggiorna lo stato locale immediatamente (Reattività)
      if (updatedDoc.type === 'invoice') setInvoices(prev => prev.map(inv => inv.id === updatedDoc.id ? updatedDoc : inv));
      else if (updatedDoc.type === 'deliveryNote') setDeliveryNotes(prev => prev.map(dn => dn.id === updatedDoc.id ? updatedDoc : dn));
      else if (updatedDoc.type === 'physicalCount') setPhysicalCounts(prev => prev.map(pc => pc.id === updatedDoc.id ? updatedDoc : pc));
      else if (updatedDoc.type === 'reviewInvoice') setReviewInvoices(prev => prev.map(ri => ri.id === updatedDoc.id ? updatedDoc : ri));
      
      // Sincronizzazione Cloud Silenziosa in background
      await cloudDb.upsertDocument(updatedDoc);
    } catch (e: any) {
      // Silenziamo l'errore per l'utente, loggandolo solo in console
      console.warn("Sincronizzazione cloud non riuscita (aggiornamento stato), ma il dato è salvato localmente.", e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Calcolo Giacenze Consolidate
  const inventory = useMemo(() => {
    const allDocs = [...invoices, ...deliveryNotes];
    const items: Record<string, Product> = {};
    
    allDocs.forEach(doc => {
      const multiplier = doc.isCreditNote ? -1 : 1;

      doc.extractedProducts.forEach(p => {
        const key = getProductKey(p.name, p.sku, p.unitOfMeasure);
        const normUnit = normalizeUnit(p.unitOfMeasure);
        
        if (items[key]) {
          items[key].quantity = Number((items[key].quantity + (p.quantity * multiplier)).toFixed(4));
          items[key].totalPrice = Number((items[key].totalPrice + (p.totalPrice * multiplier)).toFixed(4));
          
          if (items[key].quantity !== 0) {
            items[key].unitPrice = Math.abs(items[key].totalPrice / items[key].quantity);
          }
          
          if (new Date(doc.date) >= new Date(items[key].invoiceDate)) {
            items[key].invoiceDate = doc.date;
            items[key].supplier = doc.supplier;
            items[key].invoiceNumber = doc.documentNumber;
          }
        } else {
          items[key] = { 
            ...p, 
            quantity: Number((p.quantity * multiplier).toFixed(4)),
            totalPrice: Number((p.totalPrice * multiplier).toFixed(4)),
            unitOfMeasure: normUnit,
            id: `INV-KEY-${key}`, 
            invoiceDate: doc.date,
            supplier: doc.supplier,
            invoiceNumber: doc.documentNumber
          };
        }
      });
    });
    
    return Object.values(items).filter(p => Math.abs(p.quantity) > 0.0001);
  }, [invoices, deliveryNotes]);

  const availableYears = useMemo(() => {
    // Il menu di svuotamento in magazzino deve riflettere solo Fatture e Bolle
    const warehouseDocs = [...invoices, ...deliveryNotes];
    const years = warehouseDocs.map(d => new Date(d.date).getFullYear());
    return Array.from(new Set(years)).sort((a, b) => b - a);
  }, [invoices, deliveryNotes]);

  const handleExportInventory = () => {
    if (inventory.length === 0) {
      notify(t.noExportData, "error");
      return;
    }

    const dataToExport = inventory.map(p => ({
      [t.productSku]: p.sku || 'N/D',
      'Descrizione': p.name,
      [t.categories]: p.category,
      [t.supplier]: p.supplier,
      [t.stock]: p.quantity,
      'U.M.': p.unitOfMeasure,
      'Prezzo Medio (€)': p.unitPrice.toFixed(2),
      [t.totalValue + ' (€)']: p.totalPrice.toFixed(2),
      'Ultimo Carico': p.invoiceDate
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Giacenze");
    
    XLSX.writeFile(workbook, `Giacenze_Magazzino_${new Date().toISOString().split('T')[0]}.xlsx`);
    notify(t.excelDownloaded);
  };

  const handleResetWarehouse = async (year?: number) => {
    const message = year 
      ? `ATTENZIONE: Questa azione eliminerà DEFINITIVAMENTE tutte le Fatture e Bolle del ${year}. \n\nL'Inventario Fisico e la Revisione Fatture NON verranno toccati. Confermi?`
      : "ATTENZIONE: Questa azione eliminerà TUTTE le Fatture e le Bolle di OGNI anno caricate nel magazzino. \n\nL'Inventario Fisico e la Revisione Fatture NON verranno toccati. Sei sicuro di voler procedere?";
    
    const confirmation = window.confirm(message);
    if (!confirmation) return;

    setIsSyncing(true);
    try {
      // Identifichiamo i documenti da rimuovere (Solo Fatture e Bolle)
      const targetDocs = [...invoices, ...deliveryNotes];
      const docsToRemove = year 
        ? targetDocs.filter(d => new Date(d.date).getFullYear() === year)
        : targetDocs;

      const idsToRemove = docsToRemove.map(d => d.id);

      // Aggiornamento Stato Locale
      if (year) {
        setInvoices(prev => prev.filter(d => new Date(d.date).getFullYear() !== year));
        setDeliveryNotes(prev => prev.filter(d => new Date(d.date).getFullYear() !== year));
      } else {
        setInvoices([]);
        setDeliveryNotes([]);
        // Non rimuoviamo i file da localStorage per gli altri tipi (physicalCounts, reviewInvoices)
      }

      // Sincronizzazione Cloud
      if (supabase && idsToRemove.length > 0) {
        for (const id of idsToRemove) {
          await cloudDb.deleteDocument(id).catch(e => console.warn("Errore eliminazione cloud:", id));
        }
      }
      notify(year ? `Dati magazzino del ${year} eliminati.` : "Tutte le Fatture e Bolle rimosse.", "success");
    } catch (e) {
      notify("Errore durante lo svuotamento.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="fixed top-24 left-6 z-40 hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/80 backdrop-blur shadow-sm border border-slate-200 rounded-full">
        {supabase ? (
          <div className="flex items-center gap-2 text-[10px] font-black uppercase text-indigo-600">
            <Cloud size={14} className={isSyncing ? "animate-bounce" : ""} /> 
            {isSyncing ? t.syncing : t.cloudActive}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[10px] font-black uppercase text-rose-500">
            <CloudOff size={14} /> {t.localOnly}
          </div>
        )}
      </div>

      {notification && (
        <div className="fixed top-20 right-6 z-[60] animate-in fade-in slide-in-from-right-4">
          <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border bg-white ${notification.type === 'success' ? 'border-emerald-100' : 'border-rose-100'}`}>
            {notification.type === 'success' ? <CheckCircle2 className="text-emerald-500" size={24} /> : <AlertCircle className="text-rose-500" size={24} />}
            <p className="font-bold text-sm text-slate-800">{notification.message}</p>
          </div>
        </div>
      )}

      <Sidebar activeView={activeView} setActiveView={setActiveView} isOpen={true} language={language} onLanguageChange={setLanguage} />

      <main className="flex-1 w-full pt-28 pb-12">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {activeView === 'dashboard' && <Dashboard language={language} inventory={inventory} invoices={[...invoices, ...deliveryNotes]} onKpiClick={(g) => { setInventoryGrouping(g); setActiveView('inventory'); }} />}
          {activeView === 'inventory' && (
            <Inventory 
              language={language} 
              inventory={inventory} 
              onDelete={() => {}} 
              onUpdate={() => {}} 
              initialGrouping={inventoryGrouping} 
              onGroupingChange={setInventoryGrouping} 
              onExport={handleExportInventory}
              onReset={handleResetWarehouse}
              availableYears={availableYears}
            />
          )}
          {activeView === 'invoices' && <DocumentManager language={language} documents={invoices} onAdd={addDocument} onUpdate={updateDocument} onDelete={(id) => deleteDocument(id, 'invoice')} type="invoice" />}
          {activeView === 'deliveryNotes' && <DocumentManager language={language} documents={deliveryNotes} onAdd={addDocument} onUpdate={updateDocument} onDelete={(id) => deleteDocument(id, 'deliveryNote')} type="deliveryNote" />}
          {activeView === 'physicalCounts' && <PhysicalInventoryManager language={language} documents={physicalCounts} inventory={inventory} onAdd={addDocument} onUpdate={updateDocument} onDelete={(id) => deleteDocument(id, 'physicalCount')} />}
          {activeView === 'invoiceReview' && <InvoiceReviewManager language={language} documents={reviewInvoices} onAdd={addDocument} onUpdate={updateDocument} onDelete={(id) => deleteDocument(id, 'reviewInvoice')} />}
        </div>
      </main>
    </div>
  );
};

export default App;
