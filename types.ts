export interface VideoFrame {
  id: string;
  dataUrl: string;
  timestamp: number;
  blob: Blob;
  selected: boolean;
  sourceVideoName: string;
  format: 'image/jpeg' | 'image/png';
}

export interface AnalysisResult {
  text: string;
  loading: boolean;
  error: string | null;
}

export enum AppState {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  COMPLETE = 'COMPLETE',
  STOPPED = 'STOPPED',
}

export type Language = 'ka' | 'en';

export enum ExtractionMode {
  INTERVAL = 'INTERVAL',
  NTH_FRAME = 'NTH_FRAME',
  SCENE_CHANGE = 'SCENE_CHANGE',
}

export type OutputFormat = 'image/jpeg' | 'image/png';

export interface VideoQueueItem {
  id: string;
  file: File;
  objectUrl: string;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'stopped';
  progress: number;
  duration: number;
}