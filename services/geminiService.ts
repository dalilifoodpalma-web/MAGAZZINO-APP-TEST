
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

const DOCUMENT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    documents: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          supplier: { type: Type.STRING },
          documentNumber: { type: Type.STRING },
          date: { type: Type.STRING },
          dueDate: { type: Type.STRING },
          isCreditNote: { type: Type.BOOLEAN },
          totalAmount: { type: Type.NUMBER, description: "Il totale finale del documento inclusa IVA e oneri" },
          products: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                code: { type: Type.STRING },
                name: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
                unit: { type: Type.STRING, description: "Usa solo 'UD' per unità/pezzo, 'KG' per peso, 'CJ' per casse/confezioni." },
                unitPrice: { type: Type.NUMBER },
                totalPrice: { type: Type.NUMBER },
                category: { type: Type.STRING, description: "Usa solo 'Frutta' o 'Verdura'. Mappa 'Vegetables' a 'Verdura'." }
              },
              required: ["name", "quantity", "unit"]
            }
          }
        },
        required: ["supplier", "documentNumber", "date", "products", "isCreditNote", "totalAmount"]
      }
    }
  },
  required: ["documents"]
};

const SYSTEM_INSTRUCTION = `Sei un estrattore dati ultra-veloce per la gestione magazzino. 
Estrai in JSON: fornitore, numero, data, scadenza, nota credito, TOTALE DOCUMENTO FINALE e lista prodotti.

REGOLE UNITA DI MISURA:
- Usa 'UD' per tutto ciò che è unità, pezzi, singole unità (es. PZ, UN, Pezzo).
- Usa 'KG' per prodotti a peso (es. KG, Kilo, Grammi).
- Usa 'CJ' per confezioni, casse, box, colli (es. CA, CT, CS, Cassa, Box).

REGOLE CATEGORIE: 
- Usa esclusivamente 'Frutta' o 'Verdura'.

IMPORTANTE DATE: Le date DEVONO essere in formato YYYY-MM-DD.
Mancanti = 0 o "". Solo JSON.`;

const normalizeDate = (dateStr: string): string => {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const cleanDate = dateStr.trim().replace(/[^\d\/\.\-]/g, '');
  const parts = cleanDate.split(/[\.\/\-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return dateStr;
};

const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

export const extractDocumentData = async (base64Data: string, mimeType: string, retryCount = 0): Promise<any[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("TIMEOUT_IA")), 25000)
  );

  try {
    const apiCall = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { inlineData: { data: base64Data, mimeType: mimeType } },
            { text: "Estrai prodotti e totali in JSON. Normalizza unità in UD, KG, CJ." }
          ]
        }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: DOCUMENT_RESPONSE_SCHEMA,
        temperature: 0,
        topP: 1,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const response = await Promise.race([apiCall, timeoutPromise]) as GenerateContentResponse;
    const resultText = response.text;
    if (!resultText) throw new Error("EMPTY_RESPONSE");

    const parsed = JSON.parse(resultText);
    const docs = parsed.documents || [];

    return docs.map((d: any) => ({
      ...d,
      date: normalizeDate(d.date),
      dueDate: normalizeDate(d.dueDate || d.date)
    }));

  } catch (error: any) {
    console.error(`[AI] Tentativo ${retryCount + 1} fallito:`, error.message);
    if (retryCount < 1 && (error.message.includes("TIMEOUT") || error.message.includes("fetch"))) {
      await wait(1000);
      return extractDocumentData(base64Data, mimeType, retryCount + 1);
    }
    throw error;
  }
};
