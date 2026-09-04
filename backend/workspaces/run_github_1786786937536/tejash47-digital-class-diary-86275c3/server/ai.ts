import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini client on the server.
// Using 'aistudio-build' User-Agent for standard telemetry as per guidelines
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ GEMINI_API_KEY is not defined. AI summaries will be generated using a rich local template fallback.");
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      }
    }
  });
};

export interface MultilingualSummary {
  en: { summary: string; keyPoints: string[]; concepts: string[] };
  hi: { summary: string; keyPoints: string[]; concepts: string[] };
  te: { summary: string; keyPoints: string[]; concepts: string[] };
}

export async function generateLessonSummary(chapter: string, topic: string, content: string): Promise<MultilingualSummary> {
  const ai = getAiClient();
  if (!ai) {
    return generateFallbackSummary(chapter, topic, content);
  }

  try {
    const prompt = `Analyze this school lesson content:
Chapter: "${chapter}"
Topic: "${topic}"
Content: "${content}"

Generate a smart learning diary metadata summary in three languages: English (en), Hindi (hi), and Telugu (te).
Include a matching 3-sentence summary, 3 key points, and 4 learning concept tags for each language.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an expert educator. Generate multilingual summaries in English, Hindi, and Telugu. Present only objective facts from the lesson.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            en: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING, description: "Detailed summary in English" },
                keyPoints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3 core takeaway bullets in English" },
                concepts: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4 terminology/concept tags in English" }
              },
              required: ["summary", "keyPoints", "concepts"]
            },
            hi: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING, description: "Detailed summary in Hindi" },
                keyPoints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3 core takeaway bullets in Hindi" },
                concepts: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4 terminology/concept tags in Hindi" }
              },
              required: ["summary", "keyPoints", "concepts"]
            },
            te: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING, description: "Detailed summary in Telugu" },
                keyPoints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3 core takeaway bullets in Telugu" },
                concepts: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4 terminology/concept tags in Telugu" }
              },
              required: ["summary", "keyPoints", "concepts"]
            }
          },
          required: ["en", "hi", "te"]
        }
      }
    });

    const text = response.text;
    if (text) {
      return JSON.parse(text);
    }
    throw new Error("No text returned by Gemini");
  } catch (error) {
    console.error("❌ Gemini API summary generation failed:", error);
    return generateFallbackSummary(chapter, topic, content);
  }
}

// Local template generator if the API key is not specified, preventing empty/mock crashes
function generateFallbackSummary(chapter: string, topic: string, content: string): MultilingualSummary {
  const snippets = content.split(".").slice(0, 3).join(".") + ".";
  
  return {
    en: {
      summary: `In this session of ${chapter}, we studied ${topic} in detail. ${snippets}`,
      keyPoints: [
        `Understand the core definitions and context established in ${topic}.`,
        "Explore applications, proofs, and contextual exercises regarding these topics.",
        `Review the recommended classroom resources for ${chapter} prior to the next lecture.`
      ],
      concepts: [topic, chapter, "Theory", "Core Formula"]
    },
    hi: {
      summary: `इस सत्र में हमने ${chapter} के अंतर्गत "${topic}" का विस्तार से अध्ययन किया। ${topic} के बुनियादी सिद्धांतों और व्यापक अनुप्रयोगों को रेखांकित किया गया।`,
      keyPoints: [
        `विषय "${topic}" की मूल परिभाषा और आवश्यक अवधारणाओं को आत्मसात करें।`,
        "असाइनमेंट और क्लासवर्क में बताए गए महत्वपूर्ण प्रश्नों का बार-बार अभ्यास करें।",
        "अगली कक्षा से पहले अध्याय के महत्वपूर्ण बिंदु पढ़ कर आएं।"
      ],
      concepts: [topic, chapter, "सिद्धांत", "मूल सूत्र"]
    },
    te: {
      summary: `ఈ రోజు పాఠ్యాంశంలో ${chapter} లోని రికార్డులను, ప్రత్యేకించి "${topic}" గురించి క్షుణ్ణంగా అభ్యసించాము. దీని పరిధిలో గల ముఖ్య విషయాలపై విశ్లేషణ చేశాము.`,
      keyPoints: [
        `ముఖ్య గుణకాలు మరియు గమ్యస్థానాల గురించి "${topic}" లో పొందుపరిచిన విషయాలను తెలుసుకోండి.`,
        "కేటాయించిన సబ్జెక్టుల సాధన సమస్యలను మరియు సిలబస్‌ను క్రమం తప్పకుండా ప్రాక్టీస్ చేయండి.",
        "రాబోయే పరీక్షల దృష్ట్యా క్లాస్ డైరీలోని సూత్రాలను పునశ్చరణ చేసుకోండి."
      ],
      concepts: [topic, chapter, "సూత్రం", "ముఖ్య సిద్ధాంతం"]
    }
  };
}
