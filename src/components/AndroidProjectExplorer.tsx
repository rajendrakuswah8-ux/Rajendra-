import React, { useState } from 'react';
import {
  Download,
  FileCode,
  Folder,
  ChevronRight,
  Copy,
  Check,
  Smartphone,
  ShieldAlert,
  Terminal,
  CheckCircle2,
  X,
  Loader2,
} from 'lucide-react';
import { ANDROID_PROJECT_FILES, AndroidFile } from '../services/androidProjectFiles';
import { downloadAndroidProjectZip } from '../services/zipExporter';

interface AndroidProjectExplorerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AndroidProjectExplorer: React.FC<AndroidProjectExplorerProps> = ({
  isOpen,
  onClose,
}) => {
  const [selectedFile, setSelectedFile] = useState<AndroidFile>(
    ANDROID_PROJECT_FILES.find((f) => f.path.includes('AndroidManifest.xml')) || ANDROID_PROJECT_FILES[0]
  );
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!isOpen) return null;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadAndroidProjectZip();
    } catch (err) {
      console.error('Failed to download project zip:', err);
    } finally {
      setDownloading(false);
    }
  };

  const copyContent = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 text-slate-100 rounded-3xl max-w-5xl w-full h-[90vh] shadow-2xl border border-slate-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-600/30 text-purple-400 border border-purple-500/30 flex items-center justify-center font-bold">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-white text-base flex items-center gap-2">
                Guardian Native Android Studio Project
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                  Ready to Build
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Package: <code>com.guardian.parentalcontrol</code> • Kotlin & Jetpack Compose
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 active:scale-95 text-white transition-all shadow-md shadow-purple-600/30 disabled:opacity-50"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating ZIP...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download Android Studio Project (.ZIP)
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body: Sidebar tree + Code editor */}
        <div className="flex-1 flex overflow-hidden">
          {/* File sidebar */}
          <div className="w-72 border-r border-slate-800 bg-slate-950/60 p-3 overflow-y-auto space-y-1 shrink-0">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1 mb-1">
              Project Structure
            </div>

            {ANDROID_PROJECT_FILES.map((file) => {
              const isSelected = selectedFile.path === file.path;
              return (
                <button
                  key={file.path}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full text-left px-2.5 py-2 rounded-xl text-xs flex items-center gap-2 transition-all ${
                    isSelected
                      ? 'bg-purple-600/20 text-purple-300 font-semibold border border-purple-500/40'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  <FileCode className="w-4 h-4 shrink-0 text-slate-500" />
                  <span className="truncate">{file.path}</span>
                </button>
              );
            })}
          </div>

          {/* Code Viewer */}
          <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
            {/* File info bar */}
            <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono text-purple-300 font-bold">{selectedFile.path}</span>
                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  — {selectedFile.description}
                </span>
              </div>
              <button
                onClick={copyContent}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Code pre */}
            <div className="flex-1 overflow-auto p-4 font-mono text-xs text-slate-200 leading-relaxed bg-[#0d1117]">
              <pre>
                <code>{selectedFile.content}</code>
              </pre>
            </div>
          </div>
        </div>

        {/* Footer: Android compilation instructions */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-purple-400" />
            <span>To compile: Extract zip &gt; Open in Android Studio &gt; <code>./gradlew assembleDebug</code></span>
          </div>
          <span className="text-[11px] text-slate-500">Android SDK 26 - 34 supported</span>
        </div>
      </div>
    </div>
  );
};
