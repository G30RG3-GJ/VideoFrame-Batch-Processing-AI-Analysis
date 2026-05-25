import React, { useState, useEffect } from 'react';
import { VideoFrame, Language } from '../types';
import { analyzeFrame } from '../services/geminiService';
import { CloseIcon, SparklesIcon, DownloadIcon } from './Icons';

interface AnalysisModalProps {
  frame: VideoFrame;
  onClose: () => void;
  lang: Language;
}

export const AnalysisModal: React.FC<AnalysisModalProps> = ({ frame, onClose, lang }) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const defaultPrompt = lang === 'ka' ? "აღწერე დეტალურად რა ხდება ამ კადრში." : "Describe in detail what is happening in this frame.";
  const [prompt, setPrompt] = useState(defaultPrompt);

  // Reset prompt when language changes
  useEffect(() => {
     setPrompt(lang === 'ka' ? "აღწერე დეტალურად რა ხდება ამ კადრში." : "Describe in detail what is happening in this frame.");
  }, [lang]);

  const handleAnalyze = async () => {
    setLoading(true);
    setAnalysis(null);
    try {
      const result = await analyzeFrame(frame.dataUrl, prompt);
      setAnalysis(result);
    } catch (err) {
      setAnalysis(lang === 'ka' ? "შეცდომა ანალიზის დროს." : "Error during analysis.");
    } finally {
      setLoading(false);
    }
  };

  const downloadImage = () => {
    const link = document.createElement('a');
    link.href = frame.dataUrl;
    const ext = frame.format === 'image/png' ? 'png' : 'jpg';
    link.download = `frame-${frame.sourceVideoName}-${frame.timestamp.toFixed(2)}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const t = {
    ka: {
      details: "კადრის დეტალები",
      time: "დრო",
      sec: "წამი",
      download: `ჩამოტვირთვა (${frame.format === 'image/png' ? 'PNG' : 'JPG'})`,
      aiTitle: "AI ანალიზი",
      question: "კითხვა AI-ს",
      analyzeBtn: "გააანალიზე კადრი",
      processing: "მუშავდება...",
      responseTitle: "GEMINI RESPONSE:",
      source: "წყარო",
    },
    en: {
      details: "Frame Details",
      time: "Time",
      sec: "sec",
      download: `Download (${frame.format === 'image/png' ? 'PNG' : 'JPG'})`,
      aiTitle: "AI Analysis",
      question: "Ask AI",
      analyzeBtn: "Analyze Frame",
      processing: "Processing...",
      responseTitle: "GEMINI RESPONSE:",
      source: "Source",
    }
  };

  const text = t[lang];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 transition-all duration-300 animate-fadeIn">
      <div className="bg-slate-900/90 backdrop-blur-xl rounded-3xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row shadow-2xl border border-slate-800/80">
        
        {/* Image Section */}
        <div className="relative w-full md:w-2/3 bg-black/40 flex items-center justify-center p-6 border-b md:border-b-0 md:border-r border-slate-800/80">
          <img 
            src={frame.dataUrl} 
            alt="Selected Frame" 
            className="max-w-full max-h-[45vh] md:max-h-[75vh] object-contain rounded-2xl shadow-2xl"
          />
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2.5 bg-slate-900/80 hover:bg-slate-800 text-white rounded-full border border-slate-800 shadow-lg transition-all hover:scale-105 active:scale-95"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Controls & Analysis Section */}
        <div className="w-full md:w-1/3 p-6 flex flex-col bg-slate-900/20 overflow-y-auto max-h-[45vh] md:max-h-none">
          <h3 className="text-xl font-extrabold text-white tracking-tight mb-4">{text.details}</h3>
          
          <div className="mb-6 space-y-3">
            <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/40 space-y-1">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{text.source}</p>
              <p className="text-white text-sm truncate font-medium">{frame.sourceVideoName}</p>
            </div>
            <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/40 space-y-1">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{text.time}</p>
              <p className="text-white text-sm font-mono font-bold">{frame.timestamp.toFixed(2)} {text.sec}</p>
            </div>
            <button 
              onClick={downloadImage}
              className="flex items-center gap-2 px-4 py-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-all w-full justify-center border border-slate-700/60 shadow-md active:scale-95"
            >
              <DownloadIcon /> {text.download}
            </button>
          </div>

          <hr className="border-slate-800/80 mb-6" />

          <div className="flex-1 flex flex-col space-y-4">
            <h4 className="text-md font-bold text-blue-400 flex items-center gap-2">
              <SparklesIcon /> {text.aiTitle}
            </h4>
            
            <div className="space-y-2">
              <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold">{text.question}</label>
              <textarea 
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none h-20 transition-all placeholder-slate-750"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>

            <button 
              onClick={handleAnalyze}
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  {text.processing}
                </>
              ) : (
                <>
                  <SparklesIcon /> {text.analyzeBtn}
                </>
              )}
            </button>

            {analysis && (
              <div className="mt-2 p-4 bg-slate-950/80 rounded-xl border border-slate-850 flex-1 overflow-y-auto min-h-[120px] transition-all">
                <h5 className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">{text.responseTitle}</h5>
                <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{analysis}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};