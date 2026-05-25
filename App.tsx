import React, { useState, useRef } from 'react';
import { UploadIcon, CameraIcon, DownloadIcon, StopIcon } from './components/Icons';
import { VideoFrame, AppState, Language, ExtractionMode, VideoQueueItem, OutputFormat } from './types';
import { AnalysisModal } from './components/AnalysisModal';
import JSZip from 'jszip';

const App: React.FC = () => {
  // --- STATE ---
  const [language, setLanguage] = useState<Language>('ka');
  const [videoQueue, setVideoQueue] = useState<VideoQueueItem[]>([]);
  const [frames, setFrames] = useState<VideoFrame[]>([]);
  const [status, setStatus] = useState<AppState>(AppState.IDLE);
  const [selectedFrame, setSelectedFrame] = useState<VideoFrame | null>(null);
  
  // Settings
  const [extractionMode, setExtractionMode] = useState<ExtractionMode>(ExtractionMode.INTERVAL);
  const [intervalSec, setIntervalSec] = useState<number>(1);
  const [nthFrame, setNthFrame] = useState<number>(30);
  const [estimatedFps, setEstimatedFps] = useState<number>(30);
  const [sceneThreshold, setSceneThreshold] = useState<number>(15); // Percentage difference
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('image/jpeg');

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef<boolean>(false);
  const stopSignalRef = useRef<boolean>(false);

  // --- TRANSLATIONS ---
  const t = {
    ka: {
      title: "VideoFrame AI",
      subtitle: "ბეჩ პროცესინგი და AI ანალიზი",
      uploadTitle: "აირჩიეთ ვიდეო ფაილები",
      uploadDesc: "ატვირთეთ ერთი ან რამდენიმე ვიდეო. ჩვენ დავყოფთ მათ ფოტოებად თქვენი პარამეტრებით.",
      selectAnother: "დაამატე ვიდეოები",
      settings: "პარამეტრები",
      mode: "ამოღების მეთოდი",
      outputFormat: "ფორმატი",
      modes: {
        interval: "დროის ინტერვალით",
        nth: "ყოველ მე-N კადრზე",
        scene: "სცენის ცვლილება (Smart)",
      },
      intervalLabel: "ინტერვალი (წამებში):",
      nthLabel: "ყოველ მე-",
      nthLabelEnd: "კადრი",
      fpsLabel: "სავარაუდო FPS:",
      thresholdLabel: "ცვლილების ზღვარი (%):",
      thresholdDesc: "დაბალი = მეტი კადრი, მაღალი = მხოლოდ მკვეთრი ცვლილებები",
      startBtn: "დაწყება",
      stopBtn: "შეჩერება",
      processing: "მუშავდება...",
      queue: "რიგი",
      gallery: "გალერეა",
      emptyGallery: "დააჭირეთ დაწყებას კადრების ამოსაღებად",
      downloadSelected: "მონიშნულის ჩამოტვირთვა",
      downloadAll: "ყველას ჩამოტვირთვა (ZIP)",
      selectAll: "ყველას მონიშვნა",
      deselectAll: "მონიშნვის მოხსნა",
      status: {
        pending: "ელოდება",
        processing: "მუშავდება",
        completed: "დასრულდა",
        error: "შეცდომა",
        stopped: "შეჩერდა"
      }
    },
    en: {
      title: "VideoFrame AI",
      subtitle: "Batch Processing & AI Analysis",
      uploadTitle: "Select Video Files",
      uploadDesc: "Upload one or multiple videos. We will extract frames based on your settings.",
      selectAnother: "Add Videos",
      settings: "Settings",
      mode: "Extraction Method",
      outputFormat: "Output Format",
      modes: {
        interval: "Time Interval",
        nth: "Every Nth Frame",
        scene: "Scene Change (Smart)",
      },
      intervalLabel: "Interval (seconds):",
      nthLabel: "Every",
      nthLabelEnd: "th Frame",
      fpsLabel: "Estimated FPS:",
      thresholdLabel: "Change Threshold (%):",
      thresholdDesc: "Low = More frames, High = Only sharp changes",
      startBtn: "Start Processing",
      stopBtn: "Stop",
      processing: "Processing...",
      queue: "Queue",
      gallery: "Gallery",
      emptyGallery: "Press Start to extract frames",
      downloadSelected: "Download Selected",
      downloadAll: "Download All (ZIP)",
      selectAll: "Select All",
      deselectAll: "Deselect All",
      status: {
        pending: "Pending",
        processing: "Processing",
        completed: "Completed",
        error: "Error",
        stopped: "Stopped"
      }
    }
  };

  const text = t[language];

  // --- HANDLERS ---

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const newItems: VideoQueueItem[] = Array.from(files).map(file => ({
        id: crypto.randomUUID(),
        file,
        objectUrl: URL.createObjectURL(file),
        status: 'pending',
        progress: 0,
        duration: 0
      }));
      setVideoQueue(prev => [...prev, ...newItems]);
      setStatus(AppState.IDLE);
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateQueueItem = (id: string, updates: Partial<VideoQueueItem>) => {
    setVideoQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const stopProcessing = () => {
    stopSignalRef.current = true;
  };

  // --- EXTRACTION LOGIC ---

  const getPixelDiff = (ctx: CanvasRenderingContext2D, width: number, height: number, prevData: Uint8ClampedArray | null): number => {
    if (!prevData) return 100; // First frame is always "different"
    
    const currentData = ctx.getImageData(0, 0, width, height).data;
    let diff = 0;
    const totalPixels = width * height;
    
    // Simple loop: check every 4th pixel (performance optimization)
    for (let i = 0; i < currentData.length; i += 4 * 4) {
      const rDiff = Math.abs(currentData[i] - prevData[i]);
      const gDiff = Math.abs(currentData[i+1] - prevData[i+1]);
      const bDiff = Math.abs(currentData[i+2] - prevData[i+2]);
      
      if (rDiff + gDiff + bDiff > 100) { // Sensitivity for single pixel
        diff++;
      }
    }
    
    return (diff / (totalPixels / 4)) * 100;
  };

  const processQueue = async () => {
    if (processingRef.current) return;
    
    processingRef.current = true;
    stopSignalRef.current = false;
    setStatus(AppState.PROCESSING);
    setFrames([]); // Clear previous frames or keep them? Let's clear for new batch run

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    for (const item of videoQueue) {
      // Check stop signal at video level
      if (stopSignalRef.current) {
         break;
      }

      if (item.status === 'completed' || item.status === 'error') continue;

      updateQueueItem(item.id, { status: 'processing', progress: 0 });
      video.src = item.objectUrl;
      
      // Wait for metadata
      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          updateQueueItem(item.id, { duration: video.duration });
          resolve(true);
        };
      });

      // Setup processing params
      let currentTime = 0;
      const duration = video.duration;
      let step = 1;
      
      if (extractionMode === ExtractionMode.INTERVAL) {
        step = intervalSec;
      } else if (extractionMode === ExtractionMode.NTH_FRAME) {
        step = nthFrame / estimatedFps;
      } else {
        step = 0.1; // Scene detection needs frequent checks, smaller step is more accurate but slower
      }

      // Small canvas for scene detection performance
      const analysisW = 64;
      const analysisH = 64;
      let prevFrameData: Uint8ClampedArray | null = null;
      
      // Logic for SCENE_CHANGE: minimum duration between captures to avoid burst
      let lastCaptureTime = -100; 

      // SEEK & CAPTURE LOOP
      while (currentTime < duration) {
        // Check stop signal inside loop
        if (stopSignalRef.current) {
           updateQueueItem(item.id, { status: 'stopped' });
           setStatus(AppState.STOPPED);
           processingRef.current = false;
           return;
        }

        await new Promise(r => {
          video.currentTime = currentTime;
          const onSeek = () => {
            video.removeEventListener('seeked', onSeek);
            r(true);
          };
          video.addEventListener('seeked', onSeek);
        });

        let shouldKeep = false;

        // Logic based on mode
        if (extractionMode === ExtractionMode.SCENE_CHANGE) {
          // Draw to small canvas for analysis
          canvas.width = analysisW;
          canvas.height = analysisH;
          ctx.drawImage(video, 0, 0, analysisW, analysisH);
          
          const diff = getPixelDiff(ctx, analysisW, analysisH, prevFrameData);
          
          // Update prev data every check
          prevFrameData = ctx.getImageData(0, 0, analysisW, analysisH).data;

          // Only keep if enough time passed since last capture AND diff is high
          if (diff > sceneThreshold && (currentTime - lastCaptureTime) > 0.5) {
            shouldKeep = true;
            lastCaptureTime = currentTime;
          }
        } else {
          // Interval or Nth frame -> Always keep (time calculated by step)
          shouldKeep = true;
        }

        if (shouldKeep) {
          // Full res capture
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          const quality = outputFormat === 'image/png' ? undefined : 0.85;
          const dataUrl = canvas.toDataURL(outputFormat, quality);
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, outputFormat, quality));
          
          if (blob) {
            const newFrame: VideoFrame = {
              id: crypto.randomUUID(),
              timestamp: currentTime,
              dataUrl,
              blob,
              selected: true,
              sourceVideoName: item.file.name,
              format: outputFormat
            };
            // Add to main list progressively
            setFrames(prev => [...prev, newFrame]);
          }
        }

        // Update Progress
        const prog = Math.min(100, Math.round((currentTime / duration) * 100));
        updateQueueItem(item.id, { progress: prog });

        currentTime += step;
      }

      updateQueueItem(item.id, { status: 'completed', progress: 100 });
    }

    setStatus(AppState.COMPLETE);
    processingRef.current = false;
  };

  // --- DOWNLOAD LOGIC ---

  const toggleFrameSelection = (id: string) => {
    setFrames(prev => prev.map(f => f.id === id ? { ...f, selected: !f.selected } : f));
  };

  const selectAllFrames = (select: boolean) => {
    setFrames(prev => prev.map(f => ({ ...f, selected: select })));
  };

  const downloadZip = async () => {
    const selectedFrames = frames.filter(f => f.selected);
    if (selectedFrames.length === 0) return;

    const zip = new JSZip();
    const folder = zip.folder("frames");
    
    selectedFrames.forEach(frame => {
      const ext = frame.format === 'image/png' ? 'png' : 'jpg';
      const filename = `${frame.sourceVideoName}_${frame.timestamp.toFixed(2)}s.${ext}`;
      if (folder) folder.file(filename, frame.blob);
    });

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = "video_frames.zip";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSingleSelected = () => {
     const selectedFrames = frames.filter(f => f.selected);
     selectedFrames.forEach(frame => {
        const link = document.createElement('a');
        link.href = frame.dataUrl;
        const ext = frame.format === 'image/png' ? 'png' : 'jpg';
        link.download = `frame-${frame.sourceVideoName}-${frame.timestamp.toFixed(2)}.${ext}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
     });
  };

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans relative overflow-hidden">
      {/* Background Decorative Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/10 blur-[120px] rounded-full pointer-events-none"></div>

      {/* Helper Canvas & Video */}
      <canvas ref={canvasRef} className="hidden"></canvas>
      <video ref={videoRef} className="hidden" muted playsInline></video>
      <input 
          type="file" 
          accept="video/*" 
          multiple
          ref={fileInputRef} 
          onChange={handleFileChange} 
          className="hidden" 
      />

      {/* Header */}
      <header className="bg-slate-900/40 backdrop-blur-xl border-b border-slate-800/80 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <CameraIcon />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white tracking-tight">{text.title}</h1>
              <p className="text-xs text-slate-400 font-medium">{text.subtitle}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
             <button 
               onClick={() => setLanguage(l => l === 'ka' ? 'en' : 'ka')}
               className="px-3 py-1.5 rounded-lg border border-slate-700/80 bg-slate-800/40 hover:bg-slate-800 text-xs font-bold font-mono uppercase tracking-wider transition-all"
             >
               {language}
             </button>
             {videoQueue.length > 0 && (
               <button 
                 onClick={() => fileInputRef.current?.click()}
                 className="text-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 flex gap-2 items-center"
               >
                 <UploadIcon /> {text.selectAnother}
               </button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 relative z-10">
        
        {/* INITIAL STATE */}
        {videoQueue.length === 0 && (
          <div className="relative group max-w-2xl mx-auto my-12">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-3xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative flex flex-col items-center justify-center h-[50vh] rounded-3xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 hover:border-slate-700/80 transition-all cursor-pointer p-8 text-center"
                 onClick={() => fileInputRef.current?.click()}>
              <div className="p-6 bg-slate-800/50 backdrop-blur-md rounded-2xl mb-6 border border-slate-700/50 group-hover:scale-110 group-hover:border-blue-500/50 group-hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] transition-all duration-500 shadow-2xl">
                <div className="text-blue-400 group-hover:text-blue-300">
                  <UploadIcon />
                </div>
              </div>
              <h2 className="text-2xl font-extrabold text-white mb-2 tracking-tight group-hover:text-blue-400 transition-colors">{text.uploadTitle}</h2>
              <p className="text-slate-400 max-w-sm text-sm leading-relaxed">
                {text.uploadDesc}
              </p>
            </div>
          </div>
        )}

        {/* PROCESSING DASHBOARD */}
        {videoQueue.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* LEFT: Settings & Queue */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Settings Panel */}
              <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-slate-800/80 space-y-6">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-gradient-to-b from-blue-500 to-purple-600 rounded-full"></span>
                  {text.settings}
                </h3>

                <div className="space-y-5">
                  {/* Mode Selector */}
                  <div>
                    <label className="block text-sm text-slate-400 mb-2 font-medium">{text.mode}</label>
                    <select 
                      value={extractionMode}
                      onChange={(e) => setExtractionMode(e.target.value as ExtractionMode)}
                      disabled={status === AppState.PROCESSING}
                      className="w-full bg-slate-800/60 border border-slate-700/85 rounded-xl p-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all disabled:opacity-50"
                    >
                      <option value={ExtractionMode.INTERVAL}>{text.modes.interval}</option>
                      <option value={ExtractionMode.NTH_FRAME}>{text.modes.nth}</option>
                      <option value={ExtractionMode.SCENE_CHANGE}>{text.modes.scene}</option>
                    </select>
                  </div>

                   {/* Output Format */}
                   <div>
                    <label className="block text-sm text-slate-400 mb-2 font-medium">{text.outputFormat}</label>
                    <div className="flex gap-2">
                        <button 
                          onClick={() => setOutputFormat('image/jpeg')}
                          disabled={status === AppState.PROCESSING}
                          className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all ${outputFormat === 'image/jpeg' ? 'bg-gradient-to-r from-blue-600 to-blue-500 border-transparent text-white shadow-lg shadow-blue-500/25' : 'bg-slate-800/60 border-slate-700 hover:bg-slate-700/80 hover:border-slate-600 text-slate-300'}`}
                        >
                          JPG
                        </button>
                        <button 
                          onClick={() => setOutputFormat('image/png')}
                          disabled={status === AppState.PROCESSING}
                          className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all ${outputFormat === 'image/png' ? 'bg-gradient-to-r from-blue-600 to-blue-500 border-transparent text-white shadow-lg shadow-blue-500/25' : 'bg-slate-800/60 border-slate-700 hover:bg-slate-700/80 hover:border-slate-600 text-slate-300'}`}
                        >
                          PNG
                        </button>
                    </div>
                  </div>

                  {/* Conditional Inputs */}
                  {extractionMode === ExtractionMode.INTERVAL && (
                    <div>
                      <label className="block text-sm text-slate-400 mb-2 font-medium">{text.intervalLabel}</label>
                      <div className="flex items-center gap-3">
                        <input 
                          type="range" min="0.01" max="60" step="0.01"
                          value={intervalSec}
                          onChange={(e) => setIntervalSec(parseFloat(e.target.value))}
                          disabled={status === AppState.PROCESSING}
                          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-50"
                        />
                        <input 
                           type="number"
                           value={intervalSec}
                           onChange={(e) => setIntervalSec(parseFloat(e.target.value))}
                           disabled={status === AppState.PROCESSING}
                           className="w-20 bg-slate-800/80 border border-slate-700 rounded-lg p-1.5 text-center text-sm font-mono text-blue-400 focus:border-blue-500 outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {extractionMode === ExtractionMode.NTH_FRAME && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1.5 font-medium">{text.nthLabel} (N)</label>
                        <input 
                          type="number" min="1"
                          value={nthFrame}
                          onChange={(e) => setNthFrame(parseInt(e.target.value))}
                          disabled={status === AppState.PROCESSING}
                          className="w-full bg-slate-800/60 border border-slate-700/85 rounded-xl p-2.5 text-sm text-white focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1.5 font-medium">{text.fpsLabel}</label>
                        <input 
                          type="number" min="1" max="120"
                          value={estimatedFps}
                          onChange={(e) => setEstimatedFps(parseInt(e.target.value))}
                          disabled={status === AppState.PROCESSING}
                          className="w-full bg-slate-800/60 border border-slate-700/85 rounded-xl p-2.5 text-sm text-white focus:border-blue-500 outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {extractionMode === ExtractionMode.SCENE_CHANGE && (
                    <div>
                      <label className="block text-sm text-slate-400 mb-2 font-medium">{text.thresholdLabel} {sceneThreshold}%</label>
                      <input 
                        type="range" min="1" max="50" step="1"
                        value={sceneThreshold}
                        onChange={(e) => setSceneThreshold(parseInt(e.target.value))}
                        disabled={status === AppState.PROCESSING}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{text.thresholdDesc}</p>
                    </div>
                  )}

                  {/* Control Buttons */}
                  {status === AppState.PROCESSING ? (
                    <button
                      onClick={stopProcessing}
                      className="w-full py-3.5 px-6 rounded-xl font-bold text-white shadow-lg bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 hover:shadow-red-500/25 transition-all flex items-center justify-center gap-2 active:scale-95"
                    >
                       <StopIcon /> {text.stopBtn}
                    </button>
                  ) : (
                    <button
                      onClick={processQueue}
                      className="w-full py-3.5 px-6 rounded-xl font-bold text-white shadow-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 hover:shadow-blue-500/25 transition-all flex items-center justify-center gap-2 active:scale-95"
                    >
                      {text.startBtn}
                    </button>
                  )}
                  
                  {status === AppState.PROCESSING && (
                     <div className="text-center text-xs text-blue-400 font-semibold animate-pulse">{text.processing}</div>
                  )}
                </div>
              </div>

              {/* Queue Panel */}
              <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-slate-800/80 overflow-hidden">
                 <h3 className="text-lg font-bold text-white mb-4">{text.queue}</h3>
                 <div className="max-h-60 overflow-y-auto space-y-3 pr-2">
                   {videoQueue.map(item => (
                     <div key={item.id} className="bg-slate-800/40 backdrop-blur-sm p-3.5 rounded-xl border border-slate-700/50">
                       <div className="flex justify-between items-start mb-2.5">
                         <span className="text-xs font-semibold text-white truncate max-w-[70%]">{item.file.name}</span>
                         <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                           item.status === 'completed' ? 'bg-green-900/40 text-green-400 border border-green-800/50' : 
                           item.status === 'processing' ? 'bg-blue-900/40 text-blue-400 border border-blue-800/50' : 
                           item.status === 'stopped' ? 'bg-red-900/40 text-red-400 border border-red-800/50' :
                           'bg-slate-700/40 text-slate-400 border border-slate-600/50'
                         }`}>
                           {text.status[item.status]}
                         </span>
                       </div>
                       <div className="w-full bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
                         <div 
                           className={`h-1.5 rounded-full transition-all duration-300 ${item.status === 'stopped' ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}`}
                           style={{ width: `${item.progress}%` }}
                         ></div>
                       </div>
                     </div>
                   ))}
                 </div>
              </div>
            </div>

            {/* RIGHT: Gallery */}
            <div className="lg:col-span-8">
               <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-slate-900/60 backdrop-blur-xl p-4 rounded-2xl border border-slate-800/80">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-white">{text.gallery}</h3>
                  <span className="bg-slate-800/80 px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold text-blue-400 border border-slate-700/80 shadow-inner">
                    {frames.length}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {frames.length > 0 && (
                    <>
                      <button onClick={() => selectAllFrames(true)} className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-850 hover:bg-slate-800/50 font-semibold transition-all">{text.selectAll}</button>
                      <button onClick={() => selectAllFrames(false)} className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-850 hover:bg-slate-800/50 font-semibold transition-all">{text.deselectAll}</button>
                      
                      <button 
                        onClick={downloadSingleSelected} 
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/60 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg border border-slate-700/80 transition-colors shadow-sm active:scale-95"
                      >
                        {text.downloadSelected}
                      </button>
                      <button 
                        onClick={downloadZip} 
                        className="flex items-center gap-2 px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-lg shadow-md active:scale-95 transition-all"
                      >
                        <DownloadIcon /> {text.downloadAll}
                      </button>
                    </>
                  )}
                </div>
               </div>

               <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                  {frames.map((frame) => (
                    <div key={frame.id} className="relative group/card rounded-xl overflow-hidden bg-slate-900/60 backdrop-blur-sm border border-slate-850 hover:border-slate-700/80 transition-all duration-300 shadow-md">
                      <div 
                        className={`aspect-video bg-black overflow-hidden border-b transition-all duration-300 cursor-pointer relative
                          ${frame.selected ? 'border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]' : 'border-slate-800/80 group-hover/card:border-slate-700'}
                        `}
                        onClick={() => setSelectedFrame(frame)}
                      >
                        <img 
                          src={frame.dataUrl} 
                          alt="Frame" 
                          className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setSelectedFrame(frame); }}
                            className="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full border border-white/20 text-white transition-all transform scale-90 group-hover/card:scale-100 duration-300"
                          >
                            <CameraIcon />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const link = document.createElement('a');
                              link.href = frame.dataUrl;
                              const ext = frame.format === 'image/png' ? 'png' : 'jpg';
                              link.download = `frame-${frame.sourceVideoName}-${frame.timestamp.toFixed(2)}.${ext}`;
                              link.click();
                            }}
                            className="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full border border-white/20 text-white transition-all transform scale-90 group-hover/card:scale-100 duration-300"
                          >
                            <DownloadIcon />
                          </button>
                        </div>
                      </div>
                      
                      {/* Frame details at the bottom of the card */}
                      <div className="p-3 flex items-center justify-between bg-slate-900/60 backdrop-blur-sm">
                        <div className="flex flex-col min-w-0">
                          <span className="text-[10px] text-slate-400 font-mono truncate max-w-[100px]">{frame.sourceVideoName}</span>
                          <span className="text-xs font-bold text-white font-mono">{frame.timestamp.toFixed(2)}s</span>
                        </div>
                        <span className="text-[9px] bg-slate-800 text-blue-400 px-1.5 py-0.5 rounded-md font-semibold border border-slate-700 uppercase">
                          {frame.format.split('/')[1]}
                        </span>
                      </div>

                      {/* Selection Checkbox (always visible but styled premium) */}
                      <div 
                        className="absolute top-2.5 right-2.5 z-10"
                        onClick={(e) => { e.stopPropagation(); toggleFrameSelection(frame.id); }}
                      >
                        <div className={`w-5.5 h-5.5 rounded-lg border cursor-pointer flex items-center justify-center transition-all duration-300 shadow-md ${frame.selected ? 'bg-blue-500 border-blue-500 shadow-blue-500/20' : 'bg-black/50 border-white/30 backdrop-blur-sm hover:border-white/60'}`}>
                          {frame.selected && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                        </div>
                      </div>
                    </div>
                  ))}

                  {frames.length === 0 && status !== AppState.PROCESSING && (
                    <div className="col-span-full h-64 flex flex-col items-center justify-center border border-dashed border-slate-800/80 rounded-2xl text-slate-500 gap-2">
                      <CameraIcon />
                      <span className="text-sm font-medium">{text.emptyGallery}</span>
                    </div>
                  )}
               </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal */}
      {selectedFrame && (
        <AnalysisModal 
          frame={selectedFrame} 
          lang={language}
          onClose={() => setSelectedFrame(null)} 
        />
      )}
    </div>
  );
};

export default App;