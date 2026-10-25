/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { OfficerProfile, TAJournal, JourneyRow } from '../types';
import { recalculateJournalTotals } from '../utils';
import { 
  Upload, 
  FileText, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Plus, 
  Trash2, 
  Save, 
  Check, 
  Calendar, 
  Clock, 
  Train, 
  MapPin, 
  Sparkles,
  ArrowRight,
  Filter,
  DollarSign
} from 'lucide-react';

interface PdfTaImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveNewJournal: (journal: TAJournal, profile: OfficerProfile) => void;
  onAppendRowsToCurrentClaim?: (newRows: JourneyRow[], importedProfile?: OfficerProfile) => void;
  existingProfiles: OfficerProfile[];
  currentEditingJournal?: TAJournal | null;
}

export default function PdfTaImportModal({
  isOpen,
  onClose,
  onSaveNewJournal,
  onAppendRowsToCurrentClaim,
  existingProfiles,
  currentEditingJournal
}: PdfTaImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Extracted data state
  const [extractedOfficer, setExtractedOfficer] = useState<Partial<OfficerProfile>>({
    name: '',
    pfNumber: '',
    designation: 'Sub-Inspector (SI)',
    branch: 'Security Branch',
    division: 'CKP Division',
    headquarter: 'RPF/POST/DRC',
    basicPay: 47600,
    scaleOfPay: '9,300-34,800',
    dateOfAppointment: '2000-01-29',
    ruleGoverned: 'S. Rule',
    billUnit: '0704284',
    gradePay: 4200
  });

  const [extractedMonth, setExtractedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [extractedJourneys, setExtractedJourneys] = useState<JourneyRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [hasExtracted, setHasExtracted] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  // Process PDF payload via backend API
  const processPdfFile = async (base64Data?: string, isSample = false) => {
    setIsLoading(true);
    setError(null);
    setLoadingStep('Uploading & reading PDF document...');

    try {
      const payload: any = {};
      if (isSample) {
        payload.sample = true;
      } else if (base64Data) {
        payload.pdfBase64 = base64Data;
      } else {
        throw new Error('No PDF file provided');
      }

      setLoadingStep('Analyzing Indian Railways TA structure...');
      const response = await fetch('/api/parse-ta-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || 'Failed to extract TA data from PDF.');
      }

      const { officer, monthClaimed, journeys } = result.data;

      setLoadingStep('Structuring entries and verifying calculations...');

      if (officer) {
        setExtractedOfficer(prev => ({
          ...prev,
          name: officer.name || prev.name,
          pfNumber: officer.pfNumber || prev.pfNumber,
          designation: officer.designation || prev.designation,
          branch: officer.branch || prev.branch,
          division: officer.division || prev.division,
          headquarter: officer.headquarter || prev.headquarter,
          basicPay: Number(officer.basicPay) || prev.basicPay || 47600,
          scaleOfPay: officer.scaleOfPay || prev.scaleOfPay,
          billUnit: officer.billUnit || prev.billUnit,
          gradePay: Number(officer.gradePay) || prev.gradePay || 4200,
        }));
      }

      if (monthClaimed) {
        setExtractedMonth(monthClaimed);
      }

      const cleanJourneys: JourneyRow[] = (journeys || []).map((j: any, idx: number) => {
        const dailyRate = Number(j.dailyRate) || 1000;
        let calculatedAmount = Number(j.calculatedAmount) || 0;
        let autoSlab: 30 | 70 | 100 | 0 = 100;
        let overrideSlab: any = 'Auto';

        if (j.overrideSlab && ['30', '70', '100', '0'].includes(String(j.overrideSlab))) {
          overrideSlab = String(j.overrideSlab);
          autoSlab = Number(j.overrideSlab) as any;
        } else if (calculatedAmount > 0 && dailyRate > 0) {
          const pct = Math.round((calculatedAmount / dailyRate) * 100);
          if ([30, 70, 100].includes(pct)) {
            autoSlab = pct as any;
            overrideSlab = String(pct);
          }
        }

        return {
          id: j.id || `pdf_row_${Date.now()}_${idx}`,
          date: j.date || '',
          dateEnd: j.dateEnd || undefined,
          mode: j.mode === 'Road' ? 'Road' : (j.mode === 'Halted' ? 'Halted' : 'Train'),
          trainNo: j.trainNo || '',
          timeLeft: j.timeLeft || '00:00',
          timeArrived: j.timeArrived || '00:00',
          fromStation: j.fromStation || '',
          toStation: j.toStation || '',
          kms: Number(j.kms) || 0,
          dayNight: j.dayNight === 'Night' ? 'Night' : (j.dayNight === 'Both' ? 'Both' : 'Day'),
          objectOfJourney: j.objectOfJourney || 'RPF Duty',
          dailyRate,
          autoSlab,
          overrideSlab,
          calculatedAmount
        };
      });

      setExtractedJourneys(cleanJourneys);
      setSelectedRowIds(new Set(cleanJourneys.map(j => j.id)));
      setHasExtracted(true);
    } catch (err: any) {
      console.error('PDF parsing failure:', err);
      setError(err?.message || 'Could not parse the PDF file. Please ensure it is a valid TA Journal document.');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        processPdfFile(base64, false);
      };
      reader.readAsDataURL(selected);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const dropped = e.dataTransfer.files[0];
      if (dropped.type === 'application/pdf' || dropped.name.toLowerCase().endsWith('.pdf')) {
        setFile(dropped);
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          processPdfFile(base64, false);
        };
        reader.readAsDataURL(dropped);
      } else {
        setError('Please drop a valid .pdf file / कृपया पीडीएफ फाइल ड्रॉप करें।');
      }
    }
  };

  const handleUseSample = () => {
    processPdfFile(undefined, true);
  };

  const handleToggleSelectAll = () => {
    if (selectedRowIds.size === extractedJourneys.length) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(extractedJourneys.map(j => j.id)));
    }
  };

  const handleToggleRow = (id: string) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleUpdateRow = (id: string, field: keyof JourneyRow, value: any) => {
    setExtractedJourneys(prev => prev.map(row => {
      if (row.id !== id) return row;
      const updated = { ...row, [field]: value };

      // Recalculate amount if rate or slab changes
      if (field === 'dailyRate' || field === 'overrideSlab') {
        const rate = field === 'dailyRate' ? Number(value) : row.dailyRate;
        const slabStr = field === 'overrideSlab' ? value : row.overrideSlab;
        if (slabStr === '100') {
          updated.calculatedAmount = updated.mode === 'Halted' && updated.dateEnd ? rate * 2 : rate;
        } else if (slabStr === '70') {
          updated.calculatedAmount = Math.round(rate * 0.7);
        } else if (slabStr === '30') {
          updated.calculatedAmount = Math.round(rate * 0.3);
        } else if (slabStr === '0' || slabStr === 'Same Day (Nil)') {
          updated.calculatedAmount = 0;
        }
      }
      return updated;
    }));
  };

  const handleDeleteRow = (id: string) => {
    setExtractedJourneys(prev => prev.filter(r => r.id !== id));
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleAddManualRow = () => {
    const newId = `pdf_manual_${Date.now()}`;
    const newRow: JourneyRow = {
      id: newId,
      date: `${extractedMonth}-01`,
      mode: 'Train',
      trainNo: '',
      timeLeft: '08:00',
      timeArrived: '12:00',
      fromStation: extractedOfficer.headquarter?.split('/')[0] || 'CKP',
      toStation: 'ROU',
      kms: 0,
      dayNight: 'Day',
      objectOfJourney: 'RPF Duty',
      dailyRate: 1000,
      autoSlab: 70,
      overrideSlab: '70',
      calculatedAmount: 700
    };
    setExtractedJourneys(prev => [...prev, newRow]);
    setSelectedRowIds(prev => new Set(prev).add(newId));
  };

  // Compute selected totals
  const selectedJourneys = extractedJourneys.filter(j => selectedRowIds.has(j.id));
  const selectedAmount = selectedJourneys.reduce((sum, j) => sum + (j.calculatedAmount || 0), 0);
  const selectedCount = selectedJourneys.length;

  // Actions
  const handleConfirmSaveAsNewJournal = () => {
    if (selectedJourneys.length === 0) {
      alert('Please select at least one journey row to import / कृपया कम से कम एक यात्रा चुनें।');
      return;
    }

    // Match or create profile
    let matchedProfile = existingProfiles.find(p => 
      (extractedOfficer.pfNumber && p.pfNumber === extractedOfficer.pfNumber.trim()) ||
      (extractedOfficer.name && p.name.trim().toLowerCase() === extractedOfficer.name.trim().toLowerCase())
    );

    if (!matchedProfile) {
      matchedProfile = {
        id: `prof_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        pfNumber: extractedOfficer.pfNumber?.trim() || '50709641403',
        name: extractedOfficer.name?.trim() || 'RPF Officer',
        designation: extractedOfficer.designation?.trim() || 'Sub-Inspector (SI)',
        branch: extractedOfficer.branch?.trim() || 'Security Branch',
        division: extractedOfficer.division?.trim() || 'CKP Division',
        headquarter: extractedOfficer.headquarter?.trim() || 'RPF/POST/DRC',
        basicPay: extractedOfficer.basicPay || 47600,
        scaleOfPay: extractedOfficer.scaleOfPay || '9,300-34,800',
        dateOfAppointment: extractedOfficer.dateOfAppointment || '2000-01-29',
        ruleGoverned: extractedOfficer.ruleGoverned || 'S. Rule',
        billUnit: extractedOfficer.billUnit || '0704284',
        gradePay: extractedOfficer.gradePay || 4200
      };
    }

    const totals = recalculateJournalTotals(selectedJourneys);
    const newJournalId = `journal_pdf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const freshJournal: TAJournal = {
      id: newJournalId,
      profileId: matchedProfile.id,
      monthClaimed: extractedMonth,
      journeys: selectedJourneys,
      isDraft: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      allowanceType: 'TA',
      freePassAllowed: 'Allowed',
      officerName: matchedProfile.name,
      pfNumber: matchedProfile.pfNumber,
      totalAmount: totals.totalAmount,
      totalDays: totals.totalDays,
      percentage30Days: totals.p30Days,
      percentage70Days: totals.p70Days,
      percentage100Days: totals.p100Days
    };

    onSaveNewJournal(freshJournal, matchedProfile);
    setSaveSuccessMsg(`Successfully created TA Journal with ${selectedCount} journeys for ${matchedProfile.name}!`);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const handleConfirmAppendToClaim = () => {
    if (selectedJourneys.length === 0) {
      alert('Please select at least one journey row to append / कृपया कम से कम एक यात्रा चुनें।');
      return;
    }

    if (onAppendRowsToCurrentClaim) {
      let matchedProfile = existingProfiles.find(p => 
        (extractedOfficer.pfNumber && p.pfNumber === extractedOfficer.pfNumber.trim()) ||
        (extractedOfficer.name && p.name.trim().toLowerCase() === extractedOfficer.name.trim().toLowerCase())
      );
      onAppendRowsToCurrentClaim(selectedJourneys, matchedProfile);
      setSaveSuccessMsg(`Added ${selectedCount} journey entries into current claim!`);
      setTimeout(() => {
        onClose();
      }, 1000);
    }
  };

  const filteredDisplayJourneys = extractedJourneys.filter(j => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      j.date.toLowerCase().includes(q) ||
      (j.trainNo && j.trainNo.toLowerCase().includes(q)) ||
      j.fromStation.toLowerCase().includes(q) ||
      j.toStation.toLowerCase().includes(q) ||
      (j.objectOfJourney && j.objectOfJourney.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1e1b4b] via-[#2e1065] to-[#450a0a] text-white px-6 py-4 flex items-center justify-between border-b-2 border-amber-500 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 rounded-xl border border-amber-400/30 text-amber-300">
              <Upload className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-amber-300 font-mono text-[11px] font-black uppercase tracking-wider">
                  📄 Indian Railways TA PDF Importer
                </span>
                <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full font-bold border border-emerald-400/40">
                  Form GA-31 / SRC/G 1677
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                Upload TA Journal PDF / पीडीएफ से टीए डेटा जोड़ें
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
            title="Close / बंद करें"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Success toast if completed */}
        <AnimatePresence>
          {saveSuccessMsg && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-emerald-600 text-white px-6 py-3 flex items-center gap-2 font-bold text-sm shrink-0"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0" />
              <span>{saveSuccessMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50">
          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">Extraction Warning / त्रुटि:</p>
                <p className="text-xs mt-1 text-red-700">{error}</p>
                <button
                  onClick={handleUseSample}
                  className="mt-2 text-xs font-bold text-red-900 underline hover:no-underline"
                >
                  Try parsing with official sample RPF TA Journal instead →
                </button>
              </div>
            </div>
          )}

          {/* STEP 1: Upload Dropzone (When not extracted yet or to upload another) */}
          {!hasExtracted ? (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-3 border-dashed rounded-2xl p-8 sm:p-12 text-center transition cursor-pointer ${
                  isDragging 
                    ? 'border-amber-500 bg-amber-50/70 scale-[1.01]' 
                    : 'border-slate-300 hover:border-amber-500 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-amber-100 text-indigo-900 flex items-center justify-center mb-4 shadow-inner">
                  {isLoading ? (
                    <RefreshCw className="w-8 h-8 text-amber-600 animate-spin" />
                  ) : (
                    <FileText className="w-8 h-8 text-indigo-700" />
                  )}
                </div>

                {isLoading ? (
                  <div className="space-y-3 max-w-md mx-auto">
                    <h3 className="text-lg font-bold text-slate-800">
                      Processing PDF Document / विश्लेषण किया जा रहा है...
                    </h3>
                    <p className="text-xs text-amber-700 font-mono font-bold animate-pulse">
                      {loadingStep || 'Extracting TA table rows and calculations...'}
                    </p>
                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-gradient-to-r from-amber-500 to-indigo-600 h-full animate-[shimmer_1.5s_infinite] w-3/4 rounded-full"></div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <h3 className="text-lg font-black text-slate-800">
                      Drag & Drop your TA Journal PDF here, or <span className="text-amber-600 underline">Browse</span>
                    </h3>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Supports all Indian Railways RPF TA bills, Form GA-31, SRC/G 1677, multi-page travel allowance records.
                    </p>
                    <p className="text-[11px] font-mono text-slate-400">
                      Format: .PDF • Max file size: 25MB
                    </p>
                  </div>
                )}
              </div>

              {/* Sample PDF quick-action button */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      Want to test with a pre-configured official PDF?
                    </h4>
                    <p className="text-xs text-slate-500">
                      Load official RPF TA Journal (Oct-2026, 30 journeys, ₹15,500 total) with 1 click.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleUseSample}
                  disabled={isLoading}
                  className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <FileText className="w-4 h-4" />
                  Load Sample RPF TA PDF / टेस्ट सैंपल लोड करें
                </button>
              </div>
            </div>
          ) : (
            /* STEP 2: Preview & Editing Screen */
            <div className="space-y-6">
              {/* Top Banner: Status & Re-upload button */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                  <div>
                    <h3 className="text-sm font-black text-emerald-950">
                      TA Data Extracted Successfully! / डेटा सफलतापूर्वक निकाला गया!
                    </h3>
                    <p className="text-xs text-emerald-800">
                      Extracted <span className="font-bold font-mono">{extractedJourneys.length}</span> journey entries totaling <span className="font-bold font-mono">₹{selectedAmount.toLocaleString('en-IN')}</span>. You can review and edit any field before adding.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setHasExtracted(false); setFile(null); }}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 text-xs font-bold transition cursor-pointer self-start sm:self-auto shrink-0"
                >
                  Upload Different PDF
                </button>
              </div>

              {/* Extracted Officer & Claim Details (Editable Card) */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2 text-indigo-950 font-bold text-sm">
                    <MapPin className="w-4 h-4 text-amber-500" />
                    Officer & Claim Header / अधिकारी एवं क्लेम विवरण
                  </div>
                  <span className="text-[11px] text-slate-400 italic">
                    Editable values extracted from PDF header
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">Officer Name / नाम</label>
                    <input
                      type="text"
                      value={extractedOfficer.name || ''}
                      onChange={(e) => setExtractedOfficer(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-bold mb-1">PF / HRMS No.</label>
                    <input
                      type="text"
                      value={extractedOfficer.pfNumber || ''}
                      onChange={(e) => setExtractedOfficer(prev => ({ ...prev, pfNumber: e.target.value }))}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-bold mb-1">Designation / पद</label>
                    <input
                      type="text"
                      value={extractedOfficer.designation || ''}
                      onChange={(e) => setExtractedOfficer(prev => ({ ...prev, designation: e.target.value }))}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-bold mb-1">Claim Month / माह</label>
                    <input
                      type="month"
                      value={extractedMonth}
                      onChange={(e) => setExtractedMonth(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-bold mb-1">Headquarter / मुख्यालय</label>
                    <input
                      type="text"
                      value={extractedOfficer.headquarter || ''}
                      onChange={(e) => setExtractedOfficer(prev => ({ ...prev, headquarter: e.target.value }))}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-bold mb-1">Division / मंडल</label>
                    <input
                      type="text"
                      value={extractedOfficer.division || ''}
                      onChange={(e) => setExtractedOfficer(prev => ({ ...prev, division: e.target.value }))}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-bold mb-1">Basic Pay (₹)</label>
                    <input
                      type="number"
                      value={extractedOfficer.basicPay || ''}
                      onChange={(e) => setExtractedOfficer(prev => ({ ...prev, basicPay: Number(e.target.value) }))}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-bold mb-1">Bill Unit</label>
                    <input
                      type="text"
                      value={extractedOfficer.billUnit || ''}
                      onChange={(e) => setExtractedOfficer(prev => ({ ...prev, billUnit: e.target.value }))}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Table Controls & Summary Badges */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold border border-slate-300 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {selectedRowIds.size === extractedJourneys.length ? 'Deselect All' : 'Select All'}
                  </button>

                  <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-950 text-xs font-bold font-mono">
                    <span>Selected: {selectedCount} / {extractedJourneys.length}</span>
                  </div>

                  <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-950 text-xs font-bold font-mono">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Total: ₹{selectedAmount.toLocaleString('en-IN')}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddManualRow}
                    className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Extra Row
                  </button>
                </div>

                <div className="w-full md:w-64">
                  <div className="relative">
                    <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Filter stations, dates, trains..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Editable Journeys Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto max-h-[50vh]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={selectedRowIds.size > 0 && selectedRowIds.size === extractedJourneys.length}
                            onChange={handleToggleSelectAll}
                            className="rounded text-amber-600 cursor-pointer"
                          />
                        </th>
                        <th className="p-2.5 min-w-[105px]">Date</th>
                        <th className="p-2.5 min-w-[90px]">Mode</th>
                        <th className="p-2.5 min-w-[85px]">Train No.</th>
                        <th className="p-2.5 min-w-[75px]">Dep.</th>
                        <th className="p-2.5 min-w-[75px]">Arr.</th>
                        <th className="p-2.5 min-w-[75px]">From</th>
                        <th className="p-2.5 min-w-[75px]">To</th>
                        <th className="p-2.5 min-w-[160px]">Purpose / Object</th>
                        <th className="p-2.5 min-w-[70px]">Rate</th>
                        <th className="p-2.5 min-w-[75px]">Slab %</th>
                        <th className="p-2.5 min-w-[80px]">Amount</th>
                        <th className="p-2.5 w-10 text-center">Act</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredDisplayJourneys.map((row, index) => {
                        const isSelected = selectedRowIds.has(row.id);
                        return (
                          <tr 
                            key={row.id}
                            className={`hover:bg-amber-50/40 transition ${!isSelected ? 'opacity-50 bg-slate-50/60' : 'bg-white'}`}
                          >
                            <td className="p-2 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleRow(row.id)}
                                className="rounded text-amber-600 cursor-pointer"
                              />
                            </td>

                            <td className="p-1.5 font-mono">
                              <input
                                type="date"
                                value={row.date}
                                onChange={(e) => handleUpdateRow(row.id, 'date', e.target.value)}
                                className="w-full px-1.5 py-1 text-[11px] font-mono border border-slate-200 rounded font-bold text-slate-800"
                              />
                              {row.mode === 'Halted' && row.dateEnd && (
                                <input
                                  type="date"
                                  value={row.dateEnd}
                                  onChange={(e) => handleUpdateRow(row.id, 'dateEnd', e.target.value)}
                                  className="w-full px-1.5 py-1 text-[11px] font-mono border border-slate-200 rounded font-bold text-slate-800 mt-0.5"
                                  title="End date of halt"
                                />
                              )}
                            </td>

                            <td className="p-1.5">
                              <select
                                value={row.mode}
                                onChange={(e) => handleUpdateRow(row.id, 'mode', e.target.value)}
                                className="w-full px-1.5 py-1 text-[11px] font-bold border border-slate-200 rounded bg-white text-slate-800"
                              >
                                <option value="Train">Train</option>
                                <option value="Road">Road</option>
                                <option value="Halted">Halted</option>
                              </select>
                            </td>

                            <td className="p-1.5 font-mono">
                              <input
                                type="text"
                                value={row.trainNo || ''}
                                onChange={(e) => handleUpdateRow(row.id, 'trainNo', e.target.value)}
                                className="w-full px-1.5 py-1 text-[11px] font-mono border border-slate-200 rounded font-bold text-slate-800"
                                placeholder="12871"
                              />
                            </td>

                            <td className="p-1.5 font-mono">
                              <input
                                type="text"
                                value={row.timeLeft || '00:00'}
                                onChange={(e) => handleUpdateRow(row.id, 'timeLeft', e.target.value)}
                                className="w-full px-1.5 py-1 text-[11px] font-mono border border-slate-200 rounded text-slate-800"
                                placeholder="08:30"
                              />
                            </td>

                            <td className="p-1.5 font-mono">
                              <input
                                type="text"
                                value={row.timeArrived || '00:00'}
                                onChange={(e) => handleUpdateRow(row.id, 'timeArrived', e.target.value)}
                                className="w-full px-1.5 py-1 text-[11px] font-mono border border-slate-200 rounded text-slate-800"
                                placeholder="14:00"
                              />
                            </td>

                            <td className="p-1.5">
                              <input
                                type="text"
                                value={row.fromStation || ''}
                                onChange={(e) => handleUpdateRow(row.id, 'fromStation', e.target.value.toUpperCase())}
                                className="w-full px-1.5 py-1 text-[11px] font-bold font-mono border border-slate-200 rounded uppercase text-slate-800"
                                placeholder="CKP"
                              />
                            </td>

                            <td className="p-1.5">
                              <input
                                type="text"
                                value={row.toStation || ''}
                                onChange={(e) => handleUpdateRow(row.id, 'toStation', e.target.value.toUpperCase())}
                                className="w-full px-1.5 py-1 text-[11px] font-bold font-mono border border-slate-200 rounded uppercase text-slate-800"
                                placeholder="ROU"
                              />
                            </td>

                            <td className="p-1.5">
                              <input
                                type="text"
                                value={row.objectOfJourney || ''}
                                onChange={(e) => handleUpdateRow(row.id, 'objectOfJourney', e.target.value)}
                                className="w-full px-2 py-1 text-[11px] border border-slate-200 rounded text-slate-800"
                                placeholder="Law & Order duty"
                              />
                            </td>

                            <td className="p-1.5 font-mono">
                              <input
                                type="number"
                                value={row.dailyRate || 1000}
                                onChange={(e) => handleUpdateRow(row.id, 'dailyRate', Number(e.target.value))}
                                className="w-full px-1.5 py-1 text-[11px] font-mono border border-slate-200 rounded text-slate-800 font-bold"
                              />
                            </td>

                            <td className="p-1.5">
                              <select
                                value={row.overrideSlab || 'Auto'}
                                onChange={(e) => handleUpdateRow(row.id, 'overrideSlab', e.target.value)}
                                className="w-full px-1.5 py-1 text-[11px] font-bold border border-slate-200 rounded bg-white text-slate-800"
                              >
                                <option value="100">100%</option>
                                <option value="70">70%</option>
                                <option value="30">30%</option>
                                <option value="0">0%</option>
                                <option value="Auto">Auto</option>
                              </select>
                            </td>

                            <td className="p-1.5 font-mono">
                              <input
                                type="number"
                                value={row.calculatedAmount || 0}
                                onChange={(e) => handleUpdateRow(row.id, 'calculatedAmount', Number(e.target.value))}
                                className="w-full px-1.5 py-1 text-[11px] font-mono font-black border border-slate-200 rounded text-emerald-800 bg-emerald-50/50"
                              />
                            </td>

                            <td className="p-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(row.id)}
                                className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                                title="Delete row"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="bg-slate-100 px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 bg-white hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-300 transition cursor-pointer"
          >
            Cancel / रद्द करें
          </button>

          {hasExtracted && (
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              {/* Option to append to current open claim if called from ClaimBuilder */}
              {onAppendRowsToCurrentClaim && currentEditingJournal && (
                <button
                  type="button"
                  onClick={handleConfirmAppendToClaim}
                  disabled={selectedCount === 0}
                  className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Append ({selectedCount}) to Active Claim / वर्तमान क्लेम में जोड़ें
                </button>
              )}

              {/* Primary action: Create brand new TA Journal */}
              <button
                type="button"
                onClick={handleConfirmSaveAsNewJournal}
                disabled={selectedCount === 0}
                className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-amber-500 via-orange-600 to-red-600 hover:from-amber-600 hover:to-red-700 text-white rounded-xl text-xs font-black transition shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Save as New TA Journal ({selectedCount} entries • ₹{selectedAmount.toLocaleString('en-IN')})
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
