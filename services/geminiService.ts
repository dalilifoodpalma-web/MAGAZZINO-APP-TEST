
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
                category: { type: Type.STRING, description: "Assegna una categoria specifica tra: Frutta, Verdura, Carne, Pesce, Latticini, Salumi, Dolci, Panetteria, Bevande, Alimentari, Surgelati, Gastronomia, Pulizia, Packaging, Tasse ed oneri." }
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
Il tuo compito è analizzare fatture e bolle con precisione chirurgica, estraendo i prodotti e classificandoli in modo LOGICO.

LOGICA DI CLASSIFICAZIONE (CATEGORY):
Devi assegnare ogni riga a una di queste categorie predefinite. Non inventare nuove categorie a meno che non sia strettamente necessario.
- 'Frutta': Agrumi, frutti di bosco, frutta esotica, mele, pere, ecc.
- 'Verdura': Ortaggi freschi, insalate, tuberi, pomodori, verdure a foglia.
- 'Carne': Bovino, suino, ovino, pollame, selvaggina, sia fresco che lavorato (esclusi salumi).
- 'Pesce': Pesce fresco o surgelato, crostacei, molluschi.
- 'Latticini': Formaggi freschi e stagionati, latte, panna, burro, yogurt, uova.
- 'Salumi': Prosciutti, salami, insaccati, bresaola, pancetta.
- 'Dolci': Zucchero, cioccolato, semilavorati per pasticceria, dessert pronti.
- 'Panetteria': Pane, focacce, grissini, prodotti da forno salati, basi pizza.
- 'Bevande': Acqua, bibite gassate, succhi di frutta, vino, birra, alcolici.
- 'Alimentari': Pasta, riso, farina, olio, aceto, spezie, conserve, scatolame secco.
- 'Surgelati': Qualsiasi prodotto chiaramente indicato come surgelato (se non è carne o pesce).
- 'Gastronomia': Piatti pronti, sughi pronti, basi per cucina professionale.
- 'Pulizia': Detersivi, saponi, sanificanti, attrezzatura per pulizia.
- 'Packaging': Contenitori, vaschette, pellicola, carta paglia, scatole pizza, tovaglioli.
- 'Tasse ed oneri': Bollo in fattura, spese di trasporto, contributi CONAI, spese incasso.

REGOLE MANDATORIE:
1. Se un prodotto è 'Salmone Affumicato', va in 'Pesce', non 'Salumi'.
2. Se un prodotto è 'Olio Extravergine', va in 'Alimentari'.
3. Se vedi 'Contributo Ambientale' o 'Spese Trasporto', usa 'Tasse ed oneri'.
4. Il FORNITORE è sempre il 'Cedente'. Ignora i dati del destinatario/cliente.
5. Formato date: YYYY-MM-DD.

Restituisci esclusivamente un oggetto JSON valido secondo lo schema fornito.`;

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
            { text: "Estrai prodotti e totali in JSON. Assicurati che ogni prodotto sia assegnato alla categoria merceologica più logica (es. carne, pesce, alimentari, ecc.)." }
          ]
        }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: DOCUMENT_RESPONSE_SCHEMA,
        temperature: 0,
        topP: 1,
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
