import React, { useState } from 'react';
import { Sparkles, ShieldCheck, AlertTriangle, Send, Loader2, Lightbulb, ChevronRight, HelpCircle } from 'lucide-react';
import { ChildDevice } from '../types';
import { requestGeminiSafetyAnalysis, askGeminiParentAdvisor, GeminiSafetyAnalysis } from '../services/geminiService';

interface GeminiSafetyAdvisorCardProps {
  device: ChildDevice;
}

export const GeminiSafetyAdvisorCard: React.FC<GeminiSafetyAdvisorCardProps> = ({ device }) => {
  const [analysis, setAnalysis] = useState<GeminiSafetyAnalysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [parentQuestion, setParentQuestion] = useState('');
  const [advisorAnswer, setAdvisorAnswer] = useState<string | null>(null);
  const [loadingAdvisor, setLoadingAdvisor] = useState(false);

  const handleRunAnalysis = async () => {
    setLoadingAnalysis(true);
    try {
      const res = await requestGeminiSafetyAnalysis({
        childName: device.childName,
        deviceModel: device.deviceModel,
        batteryLevel: device.batteryLevel,
        isOnline: device.isOnline,
        totalScreenTimeMinutes: 165,
      });
      setAnalysis(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const handleAskAdvisor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentQuestion.trim()) return;

    setLoadingAdvisor(true);
    try {
      const answer = await askGeminiParentAdvisor(parentQuestion.trim(), device.childName);
      setAdvisorAnswer(answer);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAdvisor(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-purple-100 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-purple-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 text-sm">GEMINI AI SMART SAFETY ADVISOR</h3>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                AI Active
              </span>
            </div>
            <p className="text-xs text-slate-500">Google Gemini AI safety analysis for {device.childName}</p>
          </div>
        </div>

        <button
          onClick={handleRunAnalysis}
          disabled={loadingAnalysis}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 active:scale-95 disabled:opacity-50 transition-all shadow-xs"
        >
          {loadingAnalysis ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          <span>{analysis ? 'Re-Analyze' : 'Analyze Safety'}</span>
        </button>
      </div>

      {/* Analysis Results */}
      {analysis ? (
        <div className="space-y-3">
          <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-700 text-white flex flex-col items-center justify-center font-black shadow-xs">
                <span className="text-base leading-none">{analysis.safetyScore}</span>
                <span className="text-[9px] uppercase font-semibold text-purple-200">Score</span>
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Safety Status: {analysis.riskLevel} RISK</span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">{analysis.summaryHi || analysis.summaryEn}</p>
              </div>
            </div>
          </div>

          {/* Key Insights */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-xs space-y-1.5">
            <div className="font-bold text-slate-700 text-[11px] flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
              <span>KEY AI INSIGHTS & HABITS</span>
            </div>
            <ul className="space-y-1 text-slate-600 text-[11px] pl-1">
              {analysis.insights.map((ins, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-purple-600">•</span>
                  <span>{ins}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Actionable Recommendations */}
          <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/70 text-xs space-y-1.5">
            <div className="font-bold text-emerald-800 text-[11px]">
              RECOMMENDATIONS FOR PARENTS (अभिभावकों के लिए सुझाव)
            </div>
            <ul className="space-y-1 text-emerald-900 text-[11px] pl-1">
              {analysis.recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <ChevronRight className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-purple-50/40 border border-dashed border-purple-200 text-center space-y-2">
          <p className="text-xs text-slate-600">
            Click <strong>"Analyze Safety"</strong> to get a real-time Gemini AI report on {device.childName}'s app habits and safety score.
          </p>
          <button
            onClick={handleRunAnalysis}
            disabled={loadingAnalysis}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 transition-all shadow-2xs"
          >
            {loadingAnalysis ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-purple-600" />}
            Generate AI Safety Report
          </button>
        </div>
      )}

      {/* Ask Gemini Advisor Question Box */}
      <div className="pt-2 border-t border-purple-100 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <HelpCircle className="w-3.5 h-3.5 text-purple-600" />
          <span>Ask Gemini AI Safety Advisor (AI से बच्चे की सुरक्षा से जुड़ा सवाल पूछें):</span>
        </div>

        <form onSubmit={handleAskAdvisor} className="flex gap-2">
          <input
            type="text"
            value={parentQuestion}
            onChange={(e) => setParentQuestion(e.target.value)}
            placeholder="उदा. 10 साल के बच्चे के लिए कितने घंटे स्क्रीन-टाइम ठीक है?"
            className="flex-1 text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-purple-600"
          />
          <button
            type="submit"
            disabled={loadingAdvisor || !parentQuestion.trim()}
            className="px-3 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-50 transition-all"
          >
            {loadingAdvisor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Ask AI</span>
          </button>
        </form>

        {advisorAnswer && (
          <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200/80 text-xs text-indigo-950 leading-relaxed mt-2">
            <span className="font-bold text-purple-800 block mb-1">🤖 Gemini AI Advisor:</span>
            {advisorAnswer}
          </div>
        )}
      </div>
    </div>
  );
};
