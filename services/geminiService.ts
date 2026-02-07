
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
                category: { type: Type.STRING, description: "Assegna una categoria specifica (es. Frutta, Verdura, Carne, Pesce, Latticini, Salumi, Dolci, Panetteria, Bevande, Surgelati, Gastronomia, Pulizia, Packaging, Tasse ed oneri)." }
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

const SYSTEM_INSTRUCTION = `Sei un esperto contabile e gestore magazzino specializzato nel settore food & beverage.
Estrai i dati in JSON con precisione assoluta.

CLASSIFICAZIONE PRODOTTI (CATEGORY):
Classifica ogni riga del documento in una di queste macro-categorie o creane una pertinente se necessario:
- 'Frutta' / 'Verdura'
- 'Carne' (Pollame, Bovino, Suino, ecc.)
- 'Pesce' (Fresco, Congelato, Crostacei)
- 'Latticini' (Formaggi, Latte, Burro, Panna)
- 'Salumi' (Prosciutti, Salami, Insaccati)
- 'Dolci' (Zucchero, Cioccolato, Pasticceria, Dessert)
- 'Bevande' (Acqua, Vino, Birra, Bibite, Alcolici)
- 'Alimentari' (Pasta, Farina, Olio, Spezie, Scatolame)
- 'Gastronomia' (Preparati, Sughi pronti, Rosticceria)
- 'Surgelati' (Se non già classificati come carne/pesce)
- 'Pulizia' (Detersivi, Sanificanti)
- 'Packaging' (Vaschette, Carta, Scatole)
- 'Tasse ed oneri' (Bolli, Trasporto, Commissioni, Oneri bancari, Spese incasso)

REGOLE FORNITORE E DATE:
- Il FORNITORE è il 'Cedente'. Ignora il cliente.
- Date sempre YYYY-MM-DD.
- 'UD' = Pezzi, 'KG' = Peso, 'CJ' = Casse/Confezioni.

Solo JSON in uscita.`;

const normalizeDate = (dateStr: string): string => {
  if (!dateStr || dateStr === "N/D" || dateStr === "0") return new Date().toISOString().split('T')[0];
  const cleanDate = dateStr.trim().replace(/[^\d\/\.\-]/g, '');
  const parts = cleanDate.split(/[\.\/\-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
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
            { text: "Estrai prodotti e totali in JSON. Classifica ogni riga con la categoria merceologica corretta (Carne, Pesce, Dolci, Tasse, ecc.)." }
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
