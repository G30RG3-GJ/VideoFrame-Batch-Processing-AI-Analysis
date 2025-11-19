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
      responseTitle: "GEMINI-ის პასუხი:",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row shadow-2xl border border-slate-700">
        
        {/* Image Section */}
        <div className="relative w-full md:w-2/3 bg-black flex items-center justify-center p-4">
          <img 
            src={frame.dataUrl} 
            alt="Selected Frame" 
            className="max-w-full max-h-[60vh] md:max-h-[80vh] object-contain rounded-md"
          />
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-slate-900/50 hover:bg-slate-900/80 text-white rounded-full transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Controls & Analysis Section */}
        <div className="w-full md:w-1/3 p-6 flex flex-col bg-slate-800 border-l border-slate-700 overflow-y-auto">
          <h3 className="text-xl font-bold text-white mb-4">{text.details}</h3>
          
          <div className="mb-6 space-y-1">
            <p className="text-slate-400 text-sm">{text.source}: <span className="text-white truncate block">{frame.sourceVideoName}</span></p>
            <p className="text-slate-400 text-sm mb-2">{text.time}: <span className="text-white font-mono">{frame.timestamp.toFixed(2)} {text.sec}</span></p>
            <button 
              onClick={downloadImage}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-all w-full justify-center"
            >
              <DownloadIcon /> {text.download}
            </button>
          </div>

          <hr className="border-slate-700 mb-6" />

          <div className="flex-1 flex flex-col">
            <h4 className="text-lg font-semibold text-blue-400 flex items-center gap-2 mb-3">
              <SparklesIcon /> {text.aiTitle}
            </h4>
            
            <div className="space-y-3 mb-4">
              <label className="block text-xs text-slate-400 uppercase tracking-wide font-semibold">{text.question}</label>
              <textarea 
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none h-20"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>

            <button 
              onClick={handleAnalyze}
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
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
              <div className="mt-6 p-4 bg-slate-900/50 rounded-xl border border-slate-700 animate-fadeIn flex-1 overflow-y-auto min-h-[100px]">
                <h5 className="text-xs text-slate-500 uppercase mb-2">{text.responseTitle}</h5>
                <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{analysis}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};