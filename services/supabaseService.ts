
import { createClient } from '@supabase/supabase-js';
import { Document } from '../types';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseAnonKey && supabaseUrl !== "undefined") 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

const sanitizeDocumentForDb = (doc: Document) => {
  const cleanProducts = (doc.extractedProducts || []).map(p => ({
    id: String(p.id),
    sku: String(p.sku || ''),
    name: String(p.name || 'Prodotto'),
    quantity: Number(p.quantity) || 0,
    unitOfMeasure: String(p.unitOfMeasure || 'UD'),
    unitPrice: Number(p.unitPrice) || 0,
    totalPrice: Number(p.totalPrice) || 0,
    category: String(p.category || 'Generico'),
    invoiceDate: doc.date,
    invoiceId: doc.id,
    invoiceNumber: String(doc.documentNumber),
    supplier: String(doc.supplier),
    docType: doc.type
  }));

  // Assicuriamoci che i campi opzionali abbiano valori di default validi per il DB
  return {
    id: doc.id,
    document_number: String(doc.documentNumber || 'N/D'),
    date: doc.date || new Date().toISOString().split('T')[0],
    due_date: doc.dueDate || doc.date || null,
    supplier: String(doc.supplier || 'Fornitore Sconosciuto'),
    total_amount: isNaN(doc.totalAmount) ? 0 : Number(doc.totalAmount),
    paid_amount: isNaN(doc.paidAmount || 0) ? 0 : Number(doc.paidAmount || 0),
    file_name: String(doc.fileName || ''),
    type: String(doc.type),
    payment_status: String(doc.paymentStatus || 'unpaid'),
    is_credit_note: Boolean(doc.isCreditNote),
    extracted_products: cleanProducts 
  };
};

export const cloudDb = {
  async getAllDocuments(): Promise<Document[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('date', { ascending: false });
      
      if (error) throw error;
      return data.map(d => ({
        id: d.id,
        documentNumber: d.document_number,
        date: d.date,
        dueDate: d.due_date || d.date,
        supplier: d.supplier,
        totalAmount: Number(d.total_amount),
        paidAmount: Number(d.paid_amount || 0),
        fileName: d.file_name,
        type: d.type,
        status: 'processed',
        paymentStatus: (d.payment_status || 'unpaid') as any,
        isCreditNote: !!d.is_credit_note,
        extractedProducts: Array.isArray(d.extracted_products) ? d.extracted_products : []
      })) as Document[];
    } catch (err) {
      console.error("Cloud Fetch Error:", err);
      return [];
    }
  },

  async upsertDocument(doc: Document) {
    if (!supabase) return;
    
    const dbRecord = sanitizeDocumentForDb(doc);
    
    try {
      const { error } = await supabase
        .from('documents')
        .upsert(dbRecord, { onConflict: 'id' });
      
      if (error) {
        console.error("Supabase Upsert Error Detailed:", error);
        // Se l'errore è dovuto a colonne mancanti, avvisiamo lo sviluppatore ma non stritoliamo i dati
        if (error.code === 'PGRST204' || error.message.includes('column')) {
          throw new Error(`Errore Schema Database: Assicurati che la tabella 'documents' abbia le colonne: due_date (text), payment_status (text), paid_amount (numeric), is_credit_note (boolean).`);
        }
        throw error;
      }
    } catch (err: any) {
      console.error("Supabase Sync Failed:", err);
      throw err;
    }
  },

  async deleteDocument(id: string) {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('documents').delete().eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.error("Cloud Delete Error:", err);
      throw err;
    }
  }
};
