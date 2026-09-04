'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  Upload,
  FolderGit2,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Layers,
  Sparkles,
  Loader2,
  FolderTree,
  AlertCircle
} from 'lucide-react';
import {
  uploadProjectZip,
  selectProjectCandidate,
  type ProjectUploadResponse,
  type DetectedProjectCandidate
} from '../lib/api';
import { useAuth } from '../lib/authContext';

interface ProjectIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectReady?: (project: ProjectUploadResponse) => void;
}

type IntakeStep = 'UPLOAD' | 'SCANNING' | 'DETECTED' | 'SELECT_PROJECT' | 'WORKSPACE_READY';

export default function ProjectIntakeModal({
  isOpen,
  onClose,
  onProjectReady
}: ProjectIntakeModalProps) {
  const { token } = useAuth();
  const [currentStep, setCurrentStep] = useState<IntakeStep>('UPLOAD');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [scanMessage, setScanMessage] = useState('Uploading archive...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<ProjectUploadResponse | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [isSubmittingSelection, setIsSubmittingSelection] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setCurrentStep('UPLOAD');
    setSelectedFile(null);
    setIsDragging(false);
    setScanMessage('Uploading archive...');
    setErrorMsg(null);
    setUploadResult(null);
    setSelectedCandidateId(null);
    setIsSubmittingSelection(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleModalClose = () => {
    resetState();
    onClose();
  };

  const processFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setErrorMsg('Invalid file format: please upload a .zip archive.');
      return;
    }

    setSelectedFile(file);
    setErrorMsg(null);
    setCurrentStep('SCANNING');
    setScanMessage('Uploading archive to isolated storage...');

    try {
      setScanMessage('Extracting archive safely & enforcing traversal gates...');
      const res = await uploadProjectZip(file, token);

      setUploadResult(res);

      if (res.multipleDetected && res.detectedProjects.length > 1) {
        setSelectedCandidateId(res.detectedProjects[0]?.id || null);
        setCurrentStep('SELECT_PROJECT');
      } else {
        setCurrentStep('DETECTED');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to process project archive.');
      setCurrentStep('UPLOAD');
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleCandidateSelection = async () => {
    if (!uploadResult || !selectedCandidateId) return;

    const candidate = uploadResult.detectedProjects.find(c => c.id === selectedCandidateId);
    if (!candidate) return;

    setIsSubmittingSelection(true);
    setErrorMsg(null);

    try {
      const updated = await selectProjectCandidate(
        uploadResult.projectId,
        candidate.id,
        candidate.relativePath,
        token
      );
      setUploadResult(updated);
      setCurrentStep('WORKSPACE_READY');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to initialize selected project workspace.');
    } finally {
      setIsSubmittingSelection(false);
    }
  };

  const handleFinish = () => {
    if (uploadResult && onProjectReady) {
      onProjectReady(uploadResult);
    }
    handleModalClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 font-sans">
      <div className="relative w-full max-w-2xl rounded-2xl border border-panelBorder bg-panel shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-panelBorder bg-bg/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <FolderGit2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white font-mono tracking-tight uppercase">
                Project Intake & Discovery
              </h2>
              <p className="text-[11px] text-gray-400 font-mono">
                PHASE 2 // IMMUTABLE WORKSPACE PIPELINE
              </p>
            </div>
          </div>

          <button
            onClick={handleModalClose}
            className="p-1.5 rounded-lg border border-panelBorder bg-bg/80 text-gray-400 hover:text-white transition-all"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Step Indicator */}
        <div className="px-6 py-3 border-b border-panelBorder/70 bg-bg/30 flex items-center justify-between font-mono text-[10px] text-gray-400">
          {[
            { id: 'UPLOAD', label: '1. UPLOAD' },
            { id: 'SCANNING', label: '2. SCANNING' },
            { id: 'DETECTED', label: '3. DETECTED' },
            { id: 'WORKSPACE_READY', label: '4. READY' }
          ].map((st, idx) => {
            const isCurrent = currentStep === st.id || (st.id === 'DETECTED' && currentStep === 'SELECT_PROJECT');
            return (
              <div
                key={st.id}
                className={`flex items-center gap-1.5 ${
                  isCurrent ? 'text-indigo-400 font-bold' : 'text-gray-500'
                }`}
              >
                <span>{st.label}</span>
                {idx < 3 && <span className="text-gray-700">→</span>}
              </div>
            );
          })}
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-xs font-mono text-red-300">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold uppercase block">[INTAKE ERROR]</span>
              <span>{errorMsg}</span>
            </div>
          </div>
        )}

        {/* Body Content by Step */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs font-mono">
          {/* STEP 1: Upload Project */}
          {currentStep === 'UPLOAD' && (
            <div className="space-y-4">
              <input
                type="file"
                ref={fileInputRef}
                accept=".zip"
                onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
                className="hidden"
              />

              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-500/10 scale-[0.99]'
                    : 'border-panelBorder hover:border-indigo-500/50 bg-bg/40 hover:bg-bg/60'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 mx-auto flex items-center justify-center mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-white font-mono">
                  Drop your project ZIP archive here
                </h3>
                <p className="text-xs text-gray-400 mt-1 font-sans">
                  or click to browse from your computer
                </p>
                <span className="inline-block mt-3 text-[10px] text-gray-500 font-mono px-2 py-0.5 rounded border border-panelBorder bg-bg">
                  MAX ARCHIVE SIZE: 50MB · SUPPORTS NODE.JS & PYTHON
                </span>
              </div>

              {/* Security & Immutability Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded-lg border border-panelBorder bg-bg/50 flex items-center gap-2 text-gray-300 text-[11px]">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Zip Slip Traversal Blocked</span>
                </div>
                <div className="p-3 rounded-lg border border-panelBorder bg-bg/50 flex items-center gap-2 text-gray-300 text-[11px]">
                  <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Immutable Original Copy</span>
                </div>
                <div className="p-3 rounded-lg border border-panelBorder bg-bg/50 flex items-center gap-2 text-gray-300 text-[11px]">
                  <FolderTree className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Recursive Root Discovery</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Scanning Archive */}
          {currentStep === 'SCANNING' && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 animate-pulse">
                  <Loader2 className="w-7 h-7 animate-spin" />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wide">
                  Scanning Project Archive
                </h3>
                <p className="text-xs text-gray-400 mt-1 font-mono">{scanMessage}</p>
              </div>
              <div className="w-48 h-1.5 rounded-full bg-bg border border-panelBorder overflow-hidden">
                <div className="h-full bg-indigo-500 animate-indeterminate" />
              </div>
            </div>
          )}

          {/* STEP 3: Project Detected */}
          {currentStep === 'DETECTED' && uploadResult && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-3">
                <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-bold text-emerald-300 uppercase">
                      Project Detected
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {uploadResult.technologyDisplay} // {uploadResult.frameworkDisplay}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <span className="text-gray-500 block">PROJECT NAME</span>
                    <span className="text-white font-semibold">{uploadResult.projectName}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">PROJECT ROOT</span>
                    <span className="text-indigo-300">{uploadResult.projectRoot || '.'}/</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">DETECTED MANIFEST</span>
                    <span className="text-gray-300">{uploadResult.manifest} ✓</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">STRUCTURE GATES</span>
                    <span className="text-gray-300">
                      {uploadResult.hasSrc ? 'src/ ✓ ' : ''}
                      {uploadResult.hasTests ? 'tests/ ✓' : ''}
                      {!uploadResult.hasSrc && !uploadResult.hasTests ? 'Standard Layout ✓' : ''}
                    </span>
                  </div>
                </div>

                {!uploadResult.supported && (
                  <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300">
                    ⚠️ Python project detected. Static discovery is complete; autonomous execution sandbox is scheduled for a future phase.
                  </div>
                )}
              </div>

              {/* Workspace Layout Summary */}
              <div className="p-3.5 rounded-lg border border-panelBorder bg-bg/60 text-[11px] space-y-1.5">
                <div className="text-gray-400 font-semibold">IMMUTABLE WORKSPACE LAYOUT:</div>
                <div className="text-gray-500">
                  📁 <span className="text-gray-300">storage/projects/{uploadResult.projectId}/</span>
                </div>
                <div className="text-gray-500 pl-4">
                  🔒 <span className="text-emerald-400 font-semibold">original/</span> <span className="text-gray-500">(Immutable reference archive)</span>
                </div>
                <div className="text-gray-500 pl-4">
                  ⚡ <span className="text-indigo-400 font-semibold">working/</span> <span className="text-gray-500">(Active working copy)</span>
                </div>
                <div className="text-gray-500 pl-4">
                  📊 <span className="text-gray-400">runs/</span> <span className="text-gray-500">(Execution logs & metadata)</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  onClick={handleFinish}
                  className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-2"
                >
                  <span>Continue to Analysis</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Select Project (Multiple Candidates Detected) */}
          {currentStep === 'SELECT_PROJECT' && uploadResult && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                ⚠️ Multiple project roots detected in archive ({uploadResult.candidateCount} found). Please select the primary project to analyze:
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {uploadResult.detectedProjects.map((cand) => (
                  <div
                    key={cand.id}
                    onClick={() => setSelectedCandidateId(cand.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                      selectedCandidateId === cand.id
                        ? 'border-indigo-500 bg-indigo-600/15 shadow-md shadow-indigo-500/10'
                        : 'border-panelBorder bg-bg/50 hover:border-gray-500'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <FileCode className="w-4 h-4 text-indigo-400" />
                        <span className="font-bold text-white text-xs">{cand.name}</span>
                        <span className="text-[10px] text-indigo-300 font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 border border-indigo-500/30">
                          {cand.technologyDisplay} · {cand.frameworkDisplay}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-400">
                        Root Path: <span className="text-gray-200">{cand.relativePath}/</span> · Manifest: {cand.manifest}
                      </div>
                    </div>

                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      selectedCandidateId === cand.id
                        ? 'border-indigo-500 bg-indigo-600 text-white'
                        : 'border-gray-600'
                    }`}>
                      {selectedCandidateId === cand.id && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  disabled={!selectedCandidateId || isSubmittingSelection}
                  onClick={handleCandidateSelection}
                  className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-2"
                >
                  {isSubmittingSelection ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Preparing Workspace...</span>
                    </>
                  ) : (
                    <>
                      <span>Select & Initialize</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: Workspace Ready */}
          {currentStep === 'WORKSPACE_READY' && uploadResult && (
            <div className="space-y-4">
              <div className="p-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-emerald-300 uppercase tracking-wide font-mono">
                  Workspace Initialized & Ready
                </h3>
                <p className="text-xs text-gray-300 font-sans max-w-md mx-auto">
                  Original codebase extracted to immutable storage. Working copy created for autonomous analysis.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  onClick={handleFinish}
                  className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-emerald-600/30 flex items-center gap-2"
                >
                  <span>Open in Control Plane</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
