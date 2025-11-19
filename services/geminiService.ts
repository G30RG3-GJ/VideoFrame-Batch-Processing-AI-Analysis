import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeFrame = async (base64Image: string, promptText: string = "აღწერე დეტალურად რა ჩანს ამ კადრში."): Promise<string> => {
  try {
    // Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
    const cleanBase64 = base64Image.split(',')[1] || base64Image;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64
            }
          },
          {
            text: promptText
          }
        ]
      }
    });

    return response.text || "ვერ მოხერხდა ინფორმაციის მიღება.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("AI ანალიზის დროს დაფიქსირდა შეცდომა.");
  }
};