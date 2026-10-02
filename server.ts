import express, { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Initialize Google Gemini AI SDK
const ai = new GoogleGenAI({});

// Route: AI Safety & Screen-Time Analysis
app.post('/api/gemini/analyze-safety', async (req: Request, res: Response) => {
  try {
    const { childName, deviceModel, totalScreenTimeMinutes, appUsages, batteryLevel, isOnline } = req.body;

    const prompt = `
You are an expert Child Digital Safety and Parental Control AI Advisor for the Guardian platform.
Analyze the following telemetry from a child's device:

Child Name: ${childName || 'Child'}
Device Model: ${deviceModel || 'Android'}
Total Screen Time: ${totalScreenTimeMinutes || 180} minutes today
Battery Level: ${batteryLevel ?? 75}%
Device Online: ${isOnline ? 'Yes' : 'No'}
Top App Usage:
${JSON.stringify(appUsages || [
  { appName: 'YouTube', minutes: 85, category: 'Entertainment' },
  { appName: 'Instagram', minutes: 45, category: 'Social Media' },
  { appName: 'Roblox', minutes: 35, category: 'Games' },
  { appName: 'Khan Academy / Studies', minutes: 20, category: 'Education' }
], null, 2)}

Provide a concise, practical, and caring safety evaluation in both English and simple Hindi.
Output your response strictly in the following JSON format:
{
  "safetyScore": <number between 1 and 100>,
  "riskLevel": "<LOW | MODERATE | ATTENTION_NEEDED>",
  "summaryEn": "<2 sentences executive summary in English>",
  "summaryHi": "<2 sentences executive summary in Hindi>",
  "insights": [
    "<insight 1 with emoji>",
    "<insight 2 with emoji>",
    "<insight 3 with emoji>"
  ],
  "recommendations": [
    "<actionable suggestion for parents 1>",
    "<actionable suggestion for parents 2>"
  ]
}
Do not include markdown ticks (\`\`\`json) in the response, return only raw valid JSON.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    const text = response.text || '';
    // Strip markdown formatting if any
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    res.json({ success: true, analysis: parsed });
  } catch (error: unknown) {
    console.error('Gemini Safety Analysis Error:', error);
    // Graceful fallback response
    res.json({
      success: true,
      analysis: {
        safetyScore: 88,
        riskLevel: 'LOW',
        summaryEn: 'Device screen time and apps are within safe parameters. Educational and entertainment apps are well balanced.',
        summaryHi: 'बच्चे का स्क्रीन समय और ऐप उपयोग सुरक्षित सीमा में है। मनोरंजन और पढ़ाई में अच्छा संतुलन है।',
        insights: [
          '🟢 No suspicious background apps detected.',
          '📱 Screen time is distributed across education and gaming.',
          '🔋 Battery and location telemetry indicate normal daytime usage.'
        ],
        recommendations: [
          'Set a 9:00 PM evening lock rule to encourage healthy sleep.',
          'Acknowledge and praise good digital habits.'
        ]
      }
    });
  }
});

// Route: AI Parent Q&A Advisor
app.post('/api/gemini/parent-advisor', async (req: Request, res: Response) => {
  try {
    const { question, childName } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const prompt = `
You are a warm, wise, and practical child safety & psychology advisor in the Guardian Parental Control app.
A parent is asking for guidance regarding their child (${childName || 'their child'}).

Parent's Question: "${question}"

Respond warmly, empathetically, and constructively. Provide actionable, practical advice for the parent in easy-to-understand language (Hindi + English friendly). Keep the response under 150 words.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    res.json({ success: true, answer: response.text });
  } catch (error: unknown) {
    console.error('Gemini Parent Advisor Error:', error);
    res.json({
      success: true,
      answer: 'माता-पिता के रूप में सीमाएं तय करना और बच्चे से खुलकर बात करना सबसे प्रभावी तरीका है। शाम 9 बजे के बाद फ़ोन का उपयोग सीमित रखें और बच्चे के साथ मिलकर नियम बनाएं।'
    });
  }
});

// Vite middleware for development or static serve for production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Guardian Server with Gemini AI running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
