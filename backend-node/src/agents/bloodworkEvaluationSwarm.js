import Groq from 'groq-sdk';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = 'llama-3.1-8b-instant';
const TIMEOUT_MS = 5000;

let groq = null;
if (GROQ_API_KEY) {
  groq = new Groq({ apiKey: GROQ_API_KEY });
}

export async function evaluateBloodworkKnowledgeGap(userQuery, userLabResults, retrievedContext, finalResponse) {
  if (!groq) return null;

  const systemPrompt = `You are an AI medical auditor. Check if the 'Retrieved Context' contained the specific medical parameters/guidelines needed to interpret the patient's 'Lab Results' in relation to their 'Query'. If the context was missing these specific parameter guidelines and the AI had to guess, output STRICT JSON: { "knowledgeGapDetected": true, "missingInformation": "Briefly explain which blood work parameters were missing from the KB" }`;

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { 
          role: 'user', 
          content: JSON.stringify({
            userQuery,
            userLabResults,
            retrievedContext,
            finalResponse
          })
        },
      ],
      temperature: 0.3,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) return null;

    return JSON.parse(content);
  } catch (err) {
    console.error('[BloodworkEvaluationSwarm] Failed:', err.message);
    return null;
  }
}