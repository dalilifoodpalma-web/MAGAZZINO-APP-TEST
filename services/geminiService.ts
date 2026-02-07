
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

const DOCUMENT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    documents: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          supplier: { type: Type.STRING, description: "Ragione Sociale del CEDENTE/PRESTATORE (chi emette la fattura). Non confondere con il cliente." },
          documentNumber: { type: Type.STRING },
          date: { type: Type.STRING, description: "Data emissione documento in formato YYYY-MM-DD" },
          dueDate: { type: Type.STRING, description: "Data di scadenza del pagamento in formato YYYY-MM-DD. Cerca 'Scadenza', 'Data Scadenza' o 'Saldare entro'." },
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
                category: { type: Type.STRING, description: "Assegna una categoria logica basata sul prodotto (es. Frutta, Verdura, Alimentari, Bevande, Carne, Latticini, Pesce, Pulizia, No-Food, ecc.). Sii specifico." }
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

const SYSTEM_INSTRUCTION = `Sei un esperto contabile digitale specializzato in fatture italiane. 
Estrai i dati in JSON con precisione chirurgica.

REGOLE FORNITORE:
- Il FORNITORE è il 'Cedente' o 'Prestatore'. È l'azienda che emette la fattura, solitamente indicata nel logo o nell'intestazione principale.
- NON estrarre il 'Cessionario' o 'Committente' (che è il cliente).

REGOLE SCADENZA:
- Cerca esplicitamente le scadenze dei pagamenti. Se ci sono più rate, prendi l'ultima o la data indicata come 'Data Scadenza'.
- Se non è indicata, restituisci la stessa data del documento.

REGOLE UNITA DI MISURA:
- 'UD' = Pezzi, Unità, Cad.
- 'KG' = Chilogrammi, Grammi.
- 'CJ' = Casse, Confezioni, Cartoni.

IMPORTANTE DATE: Le date DEVONO essere in formato YYYY-MM-DD. Se trovi formati come DD/MM/YYYY, convertili. Solo JSON.`;

const normalizeDate = (dateStr: string): string => {
  if (!dateStr || dateStr === "N/D" || dateStr === "0") return new Date().toISOString().split('T')[0];
  
  // Rimuovi caratteri non necessari
  const cleanDate = dateStr.trim().replace(/[^\d\/\.\-]/g, '');
  
  // Gestione formato DD/MM/YYYY o DD.MM.YYYY
  const parts = cleanDate.split(/[\.\/\-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // Già YYYY-MM-DD
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else {
      // Da DD-MM-YYYY a YYYY-MM-DD
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  
  // Fallback se la stringa è strana
  return dateStr.length === 10 && dateStr.includes('-') ? dateStr : new Date().toISOString().split('T')[0];
};

const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

export const extractDocumentData = async (base64Data: string, mimeType: string, retryCount = 0): Promise<any[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("TIMEOUT_IA")), 25000)
  );

  try {
    const apiCall = ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          parts: [
            { inlineData: { data: base64Data, mimeType: mimeType } },
            { text: "Estrai prodotti e totali in JSON. Identifica correttamente il Fornitore (Cedente) e la Data di Scadenza del pagamento." }
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
