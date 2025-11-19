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
      deselectAll: "მონიშვნის მოხსნა",
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
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      
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
      <header className="bg-slate-900/50 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <CameraIcon />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">{text.title}</h1>
              <p className="text-xs text-slate-400">{text.subtitle}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
             <button 
               onClick={() => setLanguage(l => l === 'ka' ? 'en' : 'ka')}
               className="px-3 py-1 rounded border border-slate-700 hover:bg-slate-800 text-xs font-mono uppercase"
             >
               {language}
             </button>
             {videoQueue.length > 0 && (
               <button 
                 onClick={() => fileInputRef.current?.click()}
                 className="text-sm bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors flex gap-2"
               >
                 <UploadIcon /> {text.selectAnother}
               </button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        
        {/* INITIAL STATE */}
        {videoQueue.length === 0 && (
          <div className="flex flex-col items-center justify-center h-[60vh] border-2 border-dashed border-slate-700 rounded-3xl bg-slate-900/30 hover:bg-slate-900/50 transition-all cursor-pointer group"
               onClick={() => fileInputRef.current?.click()}>
            <div className="p-6 bg-slate-800 rounded-full mb-6 group-hover:scale-110 transition-transform duration-300 shadow-2xl">
              <div className="text-blue-500">
                <UploadIcon />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{text.uploadTitle}</h2>
            <p className="text-slate-400 max-w-md text-center">
              {text.uploadDesc}
            </p>
          </div>
        )}

        {/* PROCESSING DASHBOARD */}
        {videoQueue.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* LEFT: Settings & Queue */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Settings Panel */}
              <div className="bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-800">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="w-1 h-6 bg-blue-500 rounded-full"></span>
                  {text.settings}
                </h3>

                <div className="space-y-5">
                  {/* Mode Selector */}
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">{text.mode}</label>
                    <select 
                      value={extractionMode}
                      onChange={(e) => setExtractionMode(e.target.value as ExtractionMode)}
                      disabled={status === AppState.PROCESSING}
                      className="w-full bg-slate-800 text-white border border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value={ExtractionMode.INTERVAL}>{text.modes.interval}</option>
                      <option value={ExtractionMode.NTH_FRAME}>{text.modes.nth}</option>
                      <option value={ExtractionMode.SCENE_CHANGE}>{text.modes.scene}</option>
                    </select>
                  </div>

                   {/* Output Format */}
                   <div>
                    <label className="block text-sm text-slate-400 mb-2">{text.outputFormat}</label>
                    <div className="flex gap-2">
                        <button 
                          onClick={() => setOutputFormat('image/jpeg')}
                          disabled={status === AppState.PROCESSING}
                          className={`flex-1 py-2 rounded border text-sm transition-colors ${outputFormat === 'image/jpeg' ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}
                        >
                          JPG
                        </button>
                        <button 
                          onClick={() => setOutputFormat('image/png')}
                          disabled={status === AppState.PROCESSING}
                          className={`flex-1 py-2 rounded border text-sm transition-colors ${outputFormat === 'image/png' ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}
                        >
                          PNG
                        </button>
                    </div>
                  </div>

                  {/* Conditional Inputs */}
                  {extractionMode === ExtractionMode.INTERVAL && (
                    <div>
                      <label className="block text-sm text-slate-400 mb-2">{text.intervalLabel}</label>
                      <div className="flex items-center gap-3">
                        <input 
                          type="range" min="0.01" max="60" step="0.01"
                          value={intervalSec}
                          onChange={(e) => setIntervalSec(parseFloat(e.target.value))}
                          disabled={status === AppState.PROCESSING}
                          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <input 
                           type="number"
                           value={intervalSec}
                           onChange={(e) => setIntervalSec(parseFloat(e.target.value))}
                           className="w-20 bg-slate-800 border border-slate-700 rounded p-1 text-center text-sm"
                        />
                      </div>
                    </div>
                  )}

                  {extractionMode === ExtractionMode.NTH_FRAME && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">{text.nthLabel} (N)</label>
                        <input 
                          type="number" min="1"
                          value={nthFrame}
                          onChange={(e) => setNthFrame(parseInt(e.target.value))}
                          disabled={status === AppState.PROCESSING}
                          className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">{text.fpsLabel}</label>
                        <input 
                          type="number" min="1" max="120"
                          value={estimatedFps}
                          onChange={(e) => setEstimatedFps(parseInt(e.target.value))}
                          disabled={status === AppState.PROCESSING}
                          className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white"
                        />
                      </div>
                    </div>
                  )}

                  {extractionMode === ExtractionMode.SCENE_CHANGE && (
                    <div>
                      <label className="block text-sm text-slate-400 mb-2">{text.thresholdLabel} {sceneThreshold}%</label>
                      <input 
                        type="range" min="1" max="50" step="1"
                        value={sceneThreshold}
                        onChange={(e) => setSceneThreshold(parseInt(e.target.value))}
                        disabled={status === AppState.PROCESSING}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                      <p className="text-xs text-slate-500 mt-1">{text.thresholdDesc}</p>
                    </div>
                  )}

                  {/* Control Buttons */}
                  {status === AppState.PROCESSING ? (
                    <button
                      onClick={stopProcessing}
                      className="w-full py-3 px-6 rounded-xl font-bold text-white shadow-lg bg-red-600 hover:bg-red-500 transition-all flex items-center justify-center gap-2"
                    >
                       <StopIcon /> {text.stopBtn}
                    </button>
                  ) : (
                    <button
                      onClick={processQueue}
                      className="w-full py-3 px-6 rounded-xl font-bold text-white shadow-lg bg-blue-600 hover:bg-blue-500 hover:shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
                    >
                      {text.startBtn}
                    </button>
                  )}
                  
                  {status === AppState.PROCESSING && (
                     <div className="text-center text-xs text-blue-400 animate-pulse">{text.processing}</div>
                  )}
                </div>
              </div>

              {/* Queue Panel */}
              <div className="bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-800 overflow-hidden">
                 <h3 className="text-lg font-semibold text-white mb-4">{text.queue}</h3>
                 <div className="max-h-60 overflow-y-auto space-y-3 pr-2">
                   {videoQueue.map(item => (
                     <div key={item.id} className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                       <div className="flex justify-between items-start mb-2">
                         <span className="text-sm font-medium text-white truncate max-w-[70%]">{item.file.name}</span>
                         <span className={`text-xs px-2 py-1 rounded ${
                           item.status === 'completed' ? 'bg-green-900/50 text-green-400' : 
                           item.status === 'processing' ? 'bg-blue-900/50 text-blue-400' : 
                           item.status === 'stopped' ? 'bg-red-900/50 text-red-400' :
                           'bg-slate-700 text-slate-400'
                         }`}>
                           {text.status[item.status]}
                         </span>
                       </div>
                       <div className="w-full bg-slate-700 rounded-full h-1.5">
                         <div 
                           className={`h-1.5 rounded-full transition-all duration-300 ${item.status === 'stopped' ? 'bg-red-500' : 'bg-blue-500'}`}
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
               <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-slate-900 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-bold text-white">{text.gallery}</h3>
                  <span className="bg-slate-800 px-2 py-0.5 rounded text-sm font-mono text-blue-400 border border-slate-700">
                    {frames.length}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {frames.length > 0 && (
                    <>
                      <button onClick={() => selectAllFrames(true)} className="text-xs text-slate-400 hover:text-white px-3 py-1 rounded border border-slate-700">{text.selectAll}</button>
                      <button onClick={() => selectAllFrames(false)} className="text-xs text-slate-400 hover:text-white px-3 py-1 rounded border border-slate-700">{text.deselectAll}</button>
                      
                      <button 
                        onClick={downloadSingleSelected} 
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded border border-slate-600 transition-colors"
                      >
                        {text.downloadSelected}
                      </button>
                      <button 
                        onClick={downloadZip} 
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded shadow-lg shadow-blue-500/20 transition-colors"
                      >
                        <DownloadIcon /> {text.downloadAll}
                      </button>
                    </>
                  )}
                </div>
               </div>

               <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {frames.map((frame) => (
                    <div key={frame.id} className="relative group">
                      <div 
                        className={`aspect-video bg-black rounded-lg overflow-hidden border-2 transition-all cursor-pointer
                          ${frame.selected ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'border-slate-800 hover:border-slate-600'}
                        `}
                        onClick={() => setSelectedFrame(frame)}
                      >
                        <img 
                          src={frame.dataUrl} 
                          alt="Frame" 
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      
                      {/* Selection Checkbox */}
                      <div 
                        className="absolute top-2 right-2 z-10"
                        onClick={(e) => { e.stopPropagation(); toggleFrameSelection(frame.id); }}
                      >
                        <div className={`w-5 h-5 rounded border cursor-pointer flex items-center justify-center transition-colors ${frame.selected ? 'bg-blue-500 border-blue-500' : 'bg-black/50 border-white/50 hover:bg-black/70'}`}>
                          {frame.selected && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                        </div>
                      </div>

                      {/* Meta */}
                      <div className="absolute bottom-1 left-1 right-1 flex justify-between items-end pointer-events-none">
                         <span className="text-[10px] bg-black/60 text-white px-1 rounded font-mono backdrop-blur-sm">
                           {frame.timestamp.toFixed(2)}s
                         </span>
                         <span className="text-[8px] bg-slate-700 text-slate-300 px-1 rounded uppercase">
                           {frame.format.split('/')[1]}
                         </span>
                      </div>
                    </div>
                  ))}

                  {frames.length === 0 && status !== AppState.PROCESSING && (
                    <div className="col-span-full h-64 flex items-center justify-center border-2 border-dashed border-slate-800 rounded-2xl text-slate-500">
                      {text.emptyGallery}
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