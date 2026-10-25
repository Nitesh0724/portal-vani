/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { OfficerProfile, TAJournal } from '../types';
import { resolveJournalAccountOwner } from '../utils';
import PdfTaImportModal from './PdfTaImportModal';
import { 
  FileText, 
  Users, 
  Sliders, 
  Plus, 
  Search, 
  Copy, 
  Trash2, 
  Printer, 
  Edit3, 
  Coins, 
  Calendar,
  ShieldCheck,
  Languages,
  CheckCircle2,
  FileSpreadsheet,
  QrCode,
  Camera,
  X,
  Upload,
  FileUp,
  ExternalLink,
  Share2,
  Clock,
  Sparkles,
  Radio,
  Cloud
} from 'lucide-react';

interface DashboardProps {
  profiles: OfficerProfile[];
  journals: TAJournal[];
  onViewChange: (view: string, targetId?: string, action?: 'share' | 'download' | 'print') => void;
  onDeleteJournal: (id: string) => void;
  onCloneJournal: (id: string) => void;
  onImportSharedJournal?: (journal: TAJournal) => void;
  isAdmin?: boolean;
  adminEmail?: string;
  onSaveJournal?: (journal: TAJournal) => void;
  onSaveProfile?: (profile: OfficerProfile) => void;
}

export default function Dashboard({
  profiles,
  journals,
  onViewChange,
  onDeleteJournal,
  onCloneJournal,
  onImportSharedJournal,
  isAdmin,
  adminEmail,
  onSaveJournal,
  onSaveProfile
}: DashboardProps) {
  // --- PDF Import Modal State ---
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  // --- QR Scanner State & Refs ---
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [isScanProcessing, setIsScanProcessing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const isScannerActiveRef = React.useRef(false);

  // Success beep using standard browser AudioContext
  const playSuccessBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch (A5)
      gainNode.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (err) {
      console.warn('Audio beep failed:', err);
    }
  };

  const startCamera = async () => {
    setScannerError('');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setScannerError('Camera is not supported or restricted in this browser frame. Please open in a new tab or upload a QR image.');
        return;
      }
      const mStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      setStream(mStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mStream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play().catch(e => console.warn('Video play prevented or paused:', e));
      }
    } catch (err: any) {
      console.warn('Camera access unavailable or permission denied:', err?.message || err);
      const isDenied =
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        err?.message?.toLowerCase().includes('permission') ||
        err?.message?.toLowerCase().includes('denied');

      if (isDenied) {
        setScannerError('Camera permission was denied / कैमरा अनुमति अस्वीकृत हुई। Iframe restrictions may block camera. Click "Open in New Tab" or use QR Image Upload below.');
      } else {
        setScannerError('Could not open device camera. Please grant permission or use QR Image upload / कृपया कैमरा अनुमति दें या क्यूआर फोटो अपलोड करें।');
      }
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  React.useEffect(() => {
    isScannerActiveRef.current = isScannerOpen;
    if (isScannerOpen) {
      setIsScanProcessing(false);
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      isScannerActiveRef.current = false;
      stopCamera();
    };
  }, [isScannerOpen]);

  const tickScanner = () => {
    if (!isScannerActiveRef.current || isScanProcessing) return;
    
    const video = videoRef.current;
    if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current || document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
        if (code && code.data) {
          handleScannedValue(code.data);
          return;
        }
      }
    }
    
    if (isScannerActiveRef.current) {
      requestAnimationFrame(tickScanner);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsScanProcessing(true);
    setScannerError('');

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            });
            if (code && code.data) {
              setIsScanProcessing(false);
              handleScannedValue(code.data);
            } else {
              alert('Could not find any QR code in this image. Please make sure the QR is clearly visible and try again. / इस फोटो में क्यूआर कोड नहीं मिला। कृपया स्पष्ट फोटो अपलोड करें।');
              setIsScanProcessing(false);
            }
          } catch (err: any) {
            console.error('Error decoding uploaded image:', err);
            alert('Failed to process image file. / फोटो फाइल को प्रोसेस नहीं किया जा सका।');
            setIsScanProcessing(false);
          }
        }
      };
      img.onerror = () => {
        alert('Could not load image file. / फोटो फाइल लोड नहीं हो सकी।');
        setIsScanProcessing(false);
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      alert('Could not read image file. / फोटो फाइल नहीं पढ़ी जा सकी।');
      setIsScanProcessing(false);
    };
    reader.readAsDataURL(file);
  };

  const handleScannedValue = async (val: string) => {
    if (isScanProcessing) return;
    setIsScanProcessing(true);
    playSuccessBeep();

    try {
      console.log('Scanned QR text:', val);
      
      let targetJournalId = '';
      let targetOwnerId = '';

      if (val.startsWith('http://') || val.startsWith('https://')) {
        try {
          const urlObj = new URL(val);
          targetJournalId = urlObj.searchParams.get('journalId') || urlObj.searchParams.get('id') || '';
          targetOwnerId = urlObj.searchParams.get('ownerId') || urlObj.searchParams.get('userId') || '';
        } catch (e) {
          const jIdMatch = val.match(/journalId=([^&]+)/);
          const ownerIdMatch = val.match(/ownerId=([^&]+)/);
          if (jIdMatch) targetJournalId = jIdMatch[1];
          if (ownerIdMatch) targetOwnerId = ownerIdMatch[1];
        }
      } else if (val.startsWith('{')) {
        try {
          const parsed = JSON.parse(val);
          targetJournalId = parsed.journalId || parsed.id || '';
          targetOwnerId = parsed.ownerId || parsed.userId || '';
        } catch (e) {}
      }

      if (!targetJournalId && val.length > 5 && !val.includes(' ')) {
        targetJournalId = val;
      }

      if (!targetJournalId) {
        alert('Invalid QR code format. Could not load Travelling Allowance Journal / यात्रा का विवरण लोड नहीं किया जा सका।');
        setIsScanProcessing(false);
        return;
      }

      const locallyFound = journals.find(j => j.id === targetJournalId);
      if (locallyFound) {
        setIsScannerOpen(false);
        onViewChange('print', targetJournalId);
        setIsScanProcessing(false);
        return;
      }

      if (targetOwnerId) {
        const { fetchSingleJournalDirectly } = await import('../firebase');
        const shared = await fetchSingleJournalDirectly(targetOwnerId, targetJournalId);
        if (shared) {
          if (onImportSharedJournal) {
            onImportSharedJournal(shared);
          }
          setIsScannerOpen(false);
          onViewChange('print', targetJournalId);
        } else {
          alert('Travelling Allowance Journal document not found or lacks permissions / वह जर्नल क्लाउड डेटाबेस में नहीं मिला।');
        }
      } else {
        alert('Travelling Allowance Journal was not found in your list, and no owner information was present in the QR code. / यह जर्नल आपकी सूची में नहीं मिला तथा क्यूआर में अधिकारित विवरण उपलब्ध नहीं है।');
      }
    } catch (err: any) {
      console.error('Error handling scanned QR:', err);
      alert('Scanning error / त्रुटि: ' + err.message);
    } finally {
      setIsScanProcessing(false);
    }
  };

  // Search and Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState('');

  // Custom Delete Confirm Dialog State
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    journalId: string | null;
    officerName: string;
    monthStr: string;
  }>({
    isOpen: false,
    journalId: null,
    officerName: '',
    monthStr: '',
  });

  // Shareable QR Code Modal State
  const [qrModalState, setQrModalState] = useState<{
    isOpen: boolean;
    journal: TAJournal | null;
    profile: OfficerProfile | null;
    qrDataUrl: string;
    shareUrl: string;
  }>({
    isOpen: false,
    journal: null,
    profile: null,
    qrDataUrl: '',
    shareUrl: '',
  });
  const [copiedLink, setCopiedLink] = useState(false);

  const handleGenerateQR = async (journal: TAJournal, profile?: OfficerProfile) => {
    try {
      const ownerId = journal.adminOwnerId || profile?.adminOwnerId || profile?.id || 'anon';
      const shareUrl = `${window.location.origin}${window.location.pathname}?journalId=${journal.id}&ownerId=${ownerId}`;
      const url = await QRCode.toDataURL(shareUrl, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 350,
        color: {
          dark: '#1e1b4b',
          light: '#ffffff'
        }
      });
      setCopiedLink(false);
      setQrModalState({
        isOpen: true,
        journal,
        profile: profile || null,
        qrDataUrl: url,
        shareUrl
      });
    } catch (err) {
      console.error('QR code generation failed:', err);
      alert('Could not generate QR code / क्यूआर कोड जनरेट नहीं हो सका।');
    }
  };

  // Helper to format submission/update timestamp
  const formatEntryTime = (dateStr?: string) => {
    if (!dateStr) return 'Recently';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Recently';
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now / अभी';
      if (diffMins < 60) return `${diffMins} min ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24 && d.getDate() === now.getDate()) {
        return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Recently';
    }
  };

  const formatEntryDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  };

  // Keep ALL journals - resilient profile lookup ensures no staff journal is hidden
  const allJournalsList = journals;

  // Extract unique claim months for filtration
  const uniqueMonths = Array.from(new Set(allJournalsList.map(j => j.monthClaimed).filter(Boolean))).sort().reverse();

  // Filter journals list
  const filteredJournals = allJournalsList.filter(journal => {
    const profile = profiles.find(p => p.id === journal.profileId)
      || (journal.pfNumber ? profiles.find(p => p.pfNumber && p.pfNumber.trim() === journal.pfNumber.trim()) : undefined)
      || (journal.officerName ? profiles.find(p => p.name && p.name.trim().toLowerCase() === journal.officerName.trim().toLowerCase()) : undefined);
    
    // Filter matches
    const nameMatch = profile ? profile.name.toLowerCase().includes(searchTerm.toLowerCase()) : (journal.officerName ? journal.officerName.toLowerCase().includes(searchTerm.toLowerCase()) : false);
    const pfMatch = profile ? profile.pfNumber.includes(searchTerm) : (journal.pfNumber ? journal.pfNumber.includes(searchTerm) : false);
    const designMatch = profile ? profile.designation.toLowerCase().includes(searchTerm.toLowerCase()) : false;
    const emailMatch = journal.adminOwnerEmail ? journal.adminOwnerEmail.toLowerCase().includes(searchTerm.toLowerCase()) : false;
    const matchesSearch = searchTerm === '' || nameMatch || pfMatch || designMatch || emailMatch;
    const matchesMonth = selectedMonth === '' || journal.monthClaimed === selectedMonth;
    const selectedProfile = selectedProfileId ? profiles.find(p => p.id === selectedProfileId) : null;
    const matchesProfile = selectedProfileId === '' 
      || journal.profileId === selectedProfileId 
      || (profile && profile.id === selectedProfileId)
      || (selectedProfile && journal.pfNumber && selectedProfile.pfNumber.trim() === journal.pfNumber.trim())
      || (selectedProfile && journal.officerName && selectedProfile.name.toLowerCase().trim() === journal.officerName.toLowerCase().trim());
    
    return matchesSearch && matchesMonth && matchesProfile;
  });

  // SORT: LATEST FIRST (latest created/updated on top, oldest last)
  const sortedJournals = useMemo(() => {
    return [...filteredJournals].sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || (a.monthClaimed ? `${a.monthClaimed}-01` : 0)).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || (b.monthClaimed ? `${b.monthClaimed}-01` : 0)).getTime();
      return timeB - timeA;
    });
  }, [filteredJournals]);

  // KPI calculations
  const totalClaims = allJournalsList.length;
  const draftClaimsCount = allJournalsList.filter(j => j.isDraft).length;
  const finalizedClaimsCount = allJournalsList.filter(j => !j.isDraft).length;
  const totalTAAmount = allJournalsList.reduce((sum, j) => sum + (j.totalAmount || 0), 0);

  // Helper to format Month (e.g. 2026-05 to "May 2026")
  const formatMonth = (monthString: string) => {
    if (!monthString) return '';
    try {
      const [year, month] = monthString.split('-');
      const date = new Date(Number(year), Number(month) - 1, 1);
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch {
      return monthString;
    }
  };

  // Helper to get custom colorful themes for each month (all 12 months)
  const getMonthTheme = (monthString: string) => {
    if (!monthString) return { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300/60', iconColor: 'text-slate-500' };
    const monthNum = parseInt(monthString.split('-')[1], 10) || 1;
    
    // Handcrafted 12 rich color themes representing different seasons
    const themes: Record<number, { bg: string; text: string; border: string; iconColor: string }> = {
      1: { bg: 'bg-blue-100/90', text: 'text-blue-900', border: 'border-blue-300/80', iconColor: 'text-blue-700' },       // January
      2: { bg: 'bg-cyan-100/90', text: 'text-cyan-900', border: 'border-cyan-300/80', iconColor: 'text-cyan-700' },       // February
      3: { bg: 'bg-teal-100/90', text: 'text-teal-900', border: 'border-teal-300/80', iconColor: 'text-teal-700' },       // March
      4: { bg: 'bg-emerald-100/90', text: 'text-emerald-950', border: 'border-emerald-300/80', iconColor: 'text-emerald-700' }, // April
      5: { bg: 'bg-amber-100/90', text: 'text-amber-950', border: 'border-amber-400/80', iconColor: 'text-amber-700' },   // May
      6: { bg: 'bg-orange-100/90', text: 'text-orange-950', border: 'border-orange-300/80', iconColor: 'text-orange-700' }, // June
      7: { bg: 'bg-red-100/90', text: 'text-red-950', border: 'border-red-300/80', iconColor: 'text-red-700' },          // July
      8: { bg: 'bg-rose-100/90', text: 'text-rose-950', border: 'border-rose-350/80', iconColor: 'text-rose-700' },       // August
      9: { bg: 'bg-fuchsia-100/90', text: 'text-fuchsia-950', border: 'border-fuchsia-300/80', iconColor: 'text-fuchsia-700' }, // September
      10: { bg: 'bg-purple-100/90', text: 'text-purple-950', border: 'border-purple-300/80', iconColor: 'text-purple-700' }, // October
      11: { bg: 'bg-violet-100/90', text: 'text-violet-955', border: 'border-violet-300/80', iconColor: 'text-violet-700' }, // November
      12: { bg: 'bg-indigo-100/90', text: 'text-indigo-950', border: 'border-indigo-300/80', iconColor: 'text-indigo-700' }, // December
    };

    return themes[monthNum] || { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300', iconColor: 'text-slate-500' };
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="space-y-6"
    >
      
      {/* Header welcome badge */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="bg-gradient-to-r from-[#1e1b4b] via-[#311042] to-[#450a0a] text-white rounded-2xl p-6 sm:p-8 shadow-md relative overflow-hidden border-b-4 border-amber-500"
      >
        <div className="absolute right-0 top-0 h-full w-1/3 opacity-15 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-amber-400 to-transparent pointer-events-none"></div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 z-10 relative">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div>
              <div className="flex items-center gap-2 text-amber-300 font-mono text-xs uppercase tracking-wider mb-2 font-black">
                ⚔️ Railway Protection Force • RPF TA Portal 🛡️
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight font-sans text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-100 to-white">
                Traveling Allowance Portal
              </h1>
              <p className="text-slate-200 text-sm mt-2 max-w-xl font-medium leading-relaxed">
                Compile, calculate, and print official TA Journals automatically. Optimized for RPF posts, divisions, and security branches with full automated calculators.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsScannerOpen(true)}
              id="scan-ta-journal-btn"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-stone-100 font-bold px-4 py-3 rounded-lg shadow-lg hover:text-white hover:border-amber-400/50 hover:shadow-amber-500/10 transition border border-slate-600/50 cursor-pointer h-12"
            >
              <QrCode className="w-5 h-5 text-amber-300 animate-pulse" />
              Scan Journal / देखें
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsPdfModalOpen(true)}
              id="upload-ta-pdf-btn"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 hover:from-emerald-500 hover:to-teal-500 text-white font-black px-4 py-3 rounded-lg shadow-lg shadow-emerald-950/40 hover:shadow-emerald-500/20 transition border border-emerald-400/40 cursor-pointer h-12"
              title="Upload any TA Journal PDF file to parse all entries / पीडीएफ से टीए डेटा जोड़ें"
            >
              <FileUp className="w-5 h-5 text-emerald-200 animate-bounce" />
              Upload TA PDF / पीडीएफ से जोड़ें
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onViewChange('google-drive')}
              id="google-drive-header-btn"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-700/80 hover:bg-blue-600 text-white font-bold px-4 py-3 rounded-lg shadow-lg hover:shadow-blue-500/20 transition border border-blue-400/40 cursor-pointer h-12"
              title="Google Drive Cloud Backup & Sync"
            >
              <Cloud className="w-5 h-5 text-blue-200" />
              Google Drive / बैकअप
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onViewChange('new-claim')}
              id="new-ta-claim-btn"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 via-orange-600 to-red-650 hover:from-amber-600 hover:to-red-700 text-white font-bold px-5 py-3 rounded-lg shadow-lg shadow-orange-950/40 transition h-12 cursor-pointer border border-amber-300/30"
            >
              <Plus className="w-5 h-5 animate-bounce text-amber-100" />
              Prepare New TA Journal
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* KPI Stats Grid with Hover & Slide-In Motion */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Claims Card - Sophisticated Indigo Theme */}
        <motion.div 
          whileHover={{ scale: 1.03, y: -4, shadow: "0 20px 25px -5px rgba(99, 102, 241, 0.15)" }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="bg-gradient-to-br from-indigo-50/95 to-indigo-100/40 border-2 border-indigo-200 rounded-2xl p-4 shadow-xs hover:border-indigo-400 transition-all duration-300 group cursor-pointer"
        >
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-800 text-white shadow-lg shadow-indigo-600/20 group-hover:scale-110 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-indigo-900/70 font-black uppercase tracking-widest leading-none">Total Claims</p>
              <p className="text-2xl sm:text-3xl font-black font-mono text-indigo-950 mt-1">{totalClaims}</p>
            </div>
          </div>
        </motion.div>
        
        {/* Total Claimed Card - Prestige Emerald Theme */}
        <motion.div 
          whileHover={{ scale: 1.03, y: -4, shadow: "0 20px 25px -5px rgba(16, 185, 129, 0.15)" }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="bg-gradient-to-br from-emerald-50/95 to-emerald-100/40 border-2 border-emerald-200 rounded-2xl p-4 shadow-xs hover:border-emerald-400 transition-all duration-300 group cursor-pointer"
        >
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-lg shadow-emerald-600/20 group-hover:scale-110 transition-transform">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-emerald-950/70 font-black uppercase tracking-widest leading-none">Total Claimed</p>
              <p className="text-2xl sm:text-3xl font-black font-mono text-emerald-800 mt-1">₹{totalTAAmount.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </motion.div>

        {/* Draft Journals Card - Warm Amber/Orange Theme */}
        <motion.div 
          whileHover={{ scale: 1.03, y: -4, shadow: "0 20px 25px -5px rgba(245, 158, 11, 0.15)" }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="bg-gradient-to-br from-amber-50/95 to-amber-100/40 border-2 border-amber-200 rounded-2xl p-4 shadow-xs hover:border-amber-400 transition-all duration-300 group cursor-pointer"
        >
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-amber-955/70 font-black uppercase tracking-widest leading-none">Draft Journals</p>
              <p className="text-2xl sm:text-3xl font-black font-mono text-amber-700 mt-1">{draftClaimsCount}</p>
            </div>
          </div>
        </motion.div>

        {/* Active Staff Card - Cool Cyan/Blue Theme */}
        <motion.div 
          whileHover={{ scale: 1.03, y: -4, shadow: "0 20px 25px -5px rgba(6, 182, 212, 0.15)" }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="bg-gradient-to-br from-cyan-50/95 to-cyan-100/40 border-2 border-cyan-200 rounded-2xl p-4 shadow-xs hover:border-cyan-400 transition-all duration-300 group cursor-pointer"
        >
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-xl bg-gradient-to-br from-cyan-600 to-cyan-800 text-white shadow-lg shadow-cyan-600/20 group-hover:scale-110 transition-transform">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-cyan-950/70 font-black uppercase tracking-widest leading-none">Active Staff</p>
              <p className="text-2xl sm:text-3xl font-black font-mono text-cyan-850 mt-1">{profiles.length}</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Main Filter Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-base font-extrabold text-slate-800 mb-4 flex items-center gap-2 font-sans tracking-tight">
          <Calendar className="w-4 h-4 text-blue-500" />
          Filter Journeys &amp; Claims / यात्रा और दावा फिल्टर करें
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Text Search */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search by Name, PF No, Designation..."
              className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all h-10 shadow-3xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Profile Filter Dropdown */}
          <div>
            <select
              className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all h-10 shadow-3xs"
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
            >
              <option value="">All RPF Personnel</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.designation} - PF: {p.pfNumber})</option>
              ))}
            </select>
          </div>

          {/* Month Filter Dropdown */}
          <div>
            <select
              className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all h-10 shadow-3xs"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              <option value="">All Months</option>
              {uniqueMonths.map(m => (
                <option key={m} value={m}>{formatMonth(m)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Admin Real-Time Live Monitor Banner (Visible for Admin parent) */}
      {isAdmin && (
        <motion.div 
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm border border-emerald-500/40 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
        >
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-3.5 w-3.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  Admin Real-Time Dashboard / लाइव एडमिन डैशबोर्ड
                </span>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-500/40">
                  LIVE SYNC ON
                </span>
                <span className="bg-indigo-500/30 text-indigo-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-400/30">
                  Latest Entries First (क्र.सं. अनुसार)
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 font-medium">
                किसी भी स्टाफ द्वारा भरा गया नया TA जर्नल यहाँ तुरंत रियल-टाइम में सबसे ऊपर क्र.सं. 1 पर दिखेगा।
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onViewChange('admin-console')}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl transition shadow-xs cursor-pointer active:scale-95"
            >
              <ShieldCheck className="w-4 h-4" />
              Central Admin Console / एडमिन कंसोल
            </button>
          </div>
        </motion.div>
      )}

      {/* Claims List Table Container */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-extrabold text-slate-900 font-sans tracking-tight">
                Journeys &amp; Claims History / यात्रा एवं दावा विवरण
              </h3>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span>
                Latest First (नवीनतम पहले • क्र.सं. वार)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing {sortedJournals.length} record{sortedJournals.length !== 1 ? 's' : ''} • Sorted with newest staff submissions first
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onViewChange('profiles')}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 hover:border-blue-500 hover:bg-blue-500/10 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-blue-500" />
              Manage Staff Profiles
            </button>
            <button
              onClick={() => onViewChange('rates')}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 hover:border-blue-500 hover:bg-blue-500/10 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-blue-500" />
              Admin Rate Slabs
            </button>
          </div>
        </div>

        {sortedJournals.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center p-4 bg-slate-50 text-slate-400 rounded-full mb-3">
              <FileText className="w-10 h-10 stroke-1" />
            </div>
            <h4 className="font-semibold text-slate-800 text-sm">No TA Journals Found</h4>
            <p className="text-slate-500 text-xs mt-1 max-w-md mx-auto">
              There are no created journals matching your active search filters or date selection. Create a new journal or adjust your filters.
            </p>
            {(searchTerm || selectedMonth || selectedProfileId) && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedMonth('');
                  setSelectedProfileId('');
                }}
                className="mt-4 text-xs font-semibold text-indigo-500 hover:text-indigo-600"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                  <th className="px-4 py-3.5 text-center w-16">Sl. No. / क्र.सं.</th>
                  <th className="px-6 py-3.5">PF Number &amp; Claimant</th>
                  <th className="px-6 py-3.5">Assigned Post &amp; Div</th>
                  <th className="px-6 py-3.5">Month Requested</th>
                  <th className="px-5 py-3.5">Submission / समय</th>
                  <th className="px-6 py-3.5 text-center">Duty Days</th>
                  <th className="px-6 py-3.5 text-right">Net TA (Rs.)</th>
                  <th className="px-6 py-3.5 text-center">Status</th>
                  <th className="px-6 py-3.5 text-right">Claims Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedJournals.map((journal, index) => {
                  const profile = profiles.find(p => p.id === journal.profileId)
                    || (journal.pfNumber ? profiles.find(p => p.pfNumber && p.pfNumber.trim() === journal.pfNumber.trim()) : undefined)
                    || (journal.officerName ? profiles.find(p => p.name && p.name.trim().toLowerCase() === journal.officerName.trim().toLowerCase()) : undefined)
                    || {
                      id: journal.profileId || 'prof-fallback',
                      name: journal.officerName || 'RPF Personnel',
                      pfNumber: journal.pfNumber || 'N/A',
                      designation: 'Staff',
                      headquarter: 'HQ',
                      division: 'Division',
                      basicPay: 21700,
                      gradePay: 2000,
                      scaleOfPay: '5,200-20,200',
                      dateOfAppointment: '',
                      ruleGoverned: 'S. Rule',
                      branch: 'Security'
                    };
                  
                  const isTopEntry = index === 0;
                  const displayOfficerName = journal.officerName || profile.name;
                  const displayPfNumber = journal.pfNumber || profile.pfNumber;
                  const accountOwner = resolveJournalAccountOwner(journal, profiles, []);

                  return (
                    <tr 
                      key={journal.id} 
                      className={`transition ${isTopEntry ? 'bg-indigo-50/20 hover:bg-indigo-50/50' : 'hover:bg-slate-50/50'}`}
                    >
                      {/* Sl. No. / क्र.सं. Column */}
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg font-mono font-bold text-xs shadow-xs ${
                            isTopEntry
                              ? 'bg-indigo-600 text-white font-black ring-2 ring-indigo-300 ring-offset-1'
                              : 'bg-slate-100 text-slate-800 border border-slate-200'
                          }`}>
                            {index + 1}
                          </span>
                          {isTopEntry && (
                            <span className="text-[8px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 px-1 py-0.2 rounded shadow-xs animate-pulse">
                              LATEST
                            </span>
                          )}
                        </div>
                      </td>

                      {/* PF Number & Claimant */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-slate-900 text-sm">{displayOfficerName}</span>
                        </div>
                        {/* Account from which this TA was filled */}
                        <div className="text-[11px] font-medium text-slate-600 flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] text-slate-400">खाता / Acc:</span>
                          <span className="font-bold text-indigo-900 bg-indigo-50 border border-indigo-200/80 px-1.5 py-0.2 rounded text-[10.5px]">
                            {accountOwner.name}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                          <span className="font-semibold text-slate-700">PF: {displayPfNumber}</span>
                          <span className="text-slate-300">•</span>
                          <span>{profile.designation}</span>
                        </div>
                      </td>

                      {/* Assigned Post & Div */}
                      <td className="px-6 py-4">
                        <div className="text-slate-800 text-xs font-semibold">{profile.headquarter}</div>
                        <div className="text-slate-400 text-[10px] uppercase font-mono mt-0.5">{profile.division}</div>
                      </td>

                      {/* Month Requested */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {(() => {
                          const theme = getMonthTheme(journal.monthClaimed);
                          return (
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold ${theme.bg} ${theme.text} border ${theme.border} shadow-3xs`}>
                              <Calendar className={`w-3.5 h-3.5 ${theme.iconColor}`} />
                              <span>{formatMonth(journal.monthClaimed)}</span>
                            </span>
                          );
                        })()}
                      </td>

                      {/* Submission Date & Time */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span>{formatEntryTime(journal.updatedAt || journal.createdAt)}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5 pl-5">
                          {formatEntryDate(journal.updatedAt || journal.createdAt)}
                        </div>
                      </td>

                      {/* Duty Days */}
                      <td className="px-6 py-4 text-center text-sm font-mono font-medium text-slate-600">
                        {journal.totalDays} Days
                      </td>

                      {/* Net TA */}
                      <td className="px-6 py-4 text-right text-sm font-black text-slate-900 font-mono">
                        ₹{journal.totalAmount.toLocaleString('en-IN')}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 text-center">
                        {journal.isDraft ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-3xs uppercase tracking-wider">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0"></span>
                            Draft / ड्राफ्ट
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-3xs uppercase tracking-wider">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                            Final / फाइनल
                          </span>
                        )}
                      </td>

                      {/* Claims Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2.5">
                          {/* Rich High-Visibility Print Button */}
                          <button
                            onClick={() => onViewChange('print', journal.id, 'print')}
                            title="Print / View A4 Bilingual PDF"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                            id={`print-direct-btn-${journal.id}`}
                          >
                            <Printer className="w-3.5 h-3.5 text-blue-100" />
                            Print / प्रिंट
                          </button>

                          {/* Direct Social Media / PDF Share Button */}
                          <button
                            onClick={() => onViewChange('print', journal.id, 'share')}
                            title="Share exact 2-Page A4 PDF on WhatsApp or Social Media / सोशल मीडिया पर शेयर करें"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                            id={`share-pdf-btn-${journal.id}`}
                          >
                            <Share2 className="w-3.5 h-3.5 text-emerald-100" />
                            Share / शेयर
                          </button>
                          
                          <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                            {/* Generate Shareable QR Code */}
                            <button
                              onClick={() => handleGenerateQR(journal, profile)}
                              title="Generate Shareable QR Code / शेयर योग्य क्यूआर कोड बनाएं"
                              className="p-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                              id={`share-qr-btn-${journal.id}`}
                            >
                              <QrCode className="w-4 h-4" />
                            </button>

                            {/* Clone/Duplicate */}
                            <button
                              onClick={() => onCloneJournal(journal.id)}
                              title="Duplicate format for next month"
                              className="p-2 text-slate-500 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition cursor-pointer"
                            >
                              <Copy className="w-4 h-4" />
                            </button>

                            {/* Edit */}
                            <button
                              onClick={() => onViewChange('edit-claim', journal.id)}
                              title="Edit entries"
                              className="p-2 text-slate-500 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => {
                                setDeleteConfirm({
                                  isOpen: true,
                                  journalId: journal.id,
                                  officerName: profile ? profile.name : 'RPF Officer',
                                  monthStr: formatMonth(journal.monthClaimed)
                                });
                              }}
                              title="Delete claim"
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RPF Guide Note block */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 text-amber-900 flex gap-4 text-sm">
        <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500 self-start hidden sm:block">
          <ShieldCheck className="w-5 h-5 animate-pulse" />
        </div>
        <div className="space-y-1">
          <h4 className="font-semibold text-slate-900">RPF Journal Prep Reminders</h4>
          <ul className="list-disc pl-4 space-y-1 text-xs text-slate-700 mt-2">
            <li><strong>Time Absence Check</strong>: Departure time &amp; return time calculated automatically. Returns &gt; 12 hours yield 100%, 6-12 hours yield 70%, under 6 hours yield 30% of standard DA.</li>
            <li><strong>Official Format</strong>: Use the print view to download the perfect A4-aligned formal bilingual countersign columns paper sheet, just like physical RPF Post books.</li>
            <li><strong>Duplication</strong>: For personnel making similar train route escorts month after month, use the <strong>Duplicate Code</strong> tool to clone and shift dates with 1-click.</li>
          </ul>
        </div>
      </div>

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" id="delete-confirm-modal">
          <div className="bg-[#f8f7f4] rounded-xl shadow-xl border border-stone-200 p-6 max-w-sm w-full text-left">
            <h3 className="text-xs font-black uppercase tracking-wider text-red-600 border-b border-stone-200 pb-2 mb-3">
              Delete TA Claim / दावा हटाएं
            </h3>
            <p className="text-xs text-stone-700 leading-relaxed mb-6">
              Are you sure you want to delete the TA Claim for <strong className="text-stone-900">{deleteConfirm.officerName}</strong> ({deleteConfirm.monthStr})? This action is permanent and cannot be undone.
            </p>
            <div className="flex gap-2.5 justify-end text-xs font-bold leading-none">
              <button
                type="button"
                onClick={() => setDeleteConfirm({ isOpen: false, journalId: null, officerName: '', monthStr: '' })}
                className="px-4 py-2 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg text-stone-700 transition"
              >
                Cancel / निरस्त करें
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteConfirm.journalId) {
                    onDeleteJournal(deleteConfirm.journalId);
                  }
                  setDeleteConfirm({ isOpen: false, journalId: null, officerName: '', monthStr: '' });
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Scanner Modal Overlay */}
      {isScannerOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-md p-4" id="qr-scanner-modal">
          <div className="bg-[#0e1726] border-2 border-slate-700/80 rounded-2xl p-6 max-w-md w-full relative text-center text-white shadow-2xl">
            {/* Header info */}
            <h3 className="text-sm font-black uppercase tracking-wider text-amber-400 border-b border-slate-705/10 pb-3 mb-4 flex items-center justify-center gap-2">
              <QrCode className="w-5 h-5 text-amber-400 animate-pulse" />
              Scan TA Journal QR Code / क्यूआर स्कैन
            </h3>
            
            {/* Close button */}
            <button
              type="button"
              onClick={() => setIsScannerOpen(false)}
              className="absolute top-4 right-4 text-slate-300 hover:text-white p-1 rounded-full hover:bg-slate-850/50 transition cursor-pointer"
              title="Close Scanner"
            >
              <X className="w-5 h-5" />
            </button>
            
            {/* Video preview or error info */}
            {scannerError ? (
              <div className="p-6 bg-red-950/40 border border-red-900/60 rounded-xl text-xs text-red-200 leading-relaxed mb-4 flex flex-col items-center gap-3">
                <p className="font-semibold text-red-300">{scannerError}</p>
                <div className="flex flex-col sm:flex-row gap-2 mt-1 w-full justify-center">
                  <button
                    type="button"
                    onClick={() => startCamera()}
                    className="px-4 py-2 bg-red-900/60 hover:bg-red-900 text-white rounded-lg font-bold transition cursor-pointer text-xs"
                  >
                    Retry / पुनः प्रयास करें
                  </button>
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg font-bold transition inline-flex items-center justify-center gap-1.5 text-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in New Tab / नए टैब में खोलें</span>
                  </a>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 max-w-xs text-center leading-normal">
                  Note: Safe preview iframe restricts device camera permissions in some browsers. Open the app in a new tab to grant direct camera permission, or use the QR Image Upload option below!
                </p>
              </div>
            ) : (
              <div className="relative aspect-video w-full overflow-hidden bg-black rounded-xl border-2 border-slate-650/80 mb-4 shadow-inner">
                {/* Live video */}
                <video
                  ref={videoRef}
                  onPlay={tickScanner}
                  className="w-full h-full object-cover"
                />
                
                {/* Viewfinder crosshairs and scanning line */}
                <div className="absolute inset-0 pointer-events-none border-4 border-transparent flex items-center justify-center">
                  <div className="absolute w-48 h-28 border-2 border-dashed border-amber-400/80 rounded flex items-center justify-center transition-all duration-300">
                    <motion.div
                      animate={{ y: [-50, 50, -50] }}
                      transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
                      className="absolute left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-amber-300 to-transparent shadow-[0_0_8px_rgba(245,158,11,0.8)]"
                    />
                  </div>
                </div>
                
                {isScanProcessing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-xs">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
                  </div>
                )}
              </div>
            )}

            {/* OR separator */}
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-700/60"></div>
              <span className="flex-shrink mx-3 text-slate-400 text-[10px] uppercase font-bold tracking-wider">or / अथवा</span>
              <div className="flex-grow border-t border-slate-700/60"></div>
            </div>

            {/* QR Image File Upload Fallback */}
            <div className="mb-4">
              <label htmlFor="qr-file-input" className="group flex flex-col items-center justify-center border border-dashed border-slate-600/70 hover:border-amber-400 bg-slate-900/50 hover:bg-slate-900/80 transition-all rounded-xl p-3.5 cursor-pointer">
                <Upload className="w-5 h-5 text-slate-400 group-hover:text-amber-400 mb-1.5 transition-colors" />
                <span className="text-[12px] font-bold text-slate-200 group-hover:text-white transition-colors">
                  Upload QR Image / क्यूआर फोटो चुनें
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">
                  Choose or drag a screenshot of the journal's QR code
                </span>
              </label>
              <input
                id="qr-file-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
            </div>
            
            {/* Canvas for processing */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Bottom help text */}
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Scan with camera or upload a clear picture of the journal's QR code to open or import it instantly.
            </p>
            <p className="text-[10px] text-amber-400/90 font-hindi mt-1 font-bold">
              कैमरा से स्कैन करें या तुरंत खोलने/इम्पोर्ट करने के लिए जर्नल के क्यूआर का स्पष्ट चित्र अपलोड करें।
            </p>
          </div>
        </div>
      )}

      {/* Shareable QR Code Modal */}
      {qrModalState.isOpen && qrModalState.journal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4" id="shareable-qr-modal">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 max-w-md w-full text-center relative overflow-hidden">
            {/* Close button */}
            <button
              type="button"
              onClick={() => setQrModalState({ isOpen: false, journal: null, profile: null, qrDataUrl: '', shareUrl: '' })}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 transition cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="inline-flex items-center justify-center p-3 bg-amber-100 text-amber-700 rounded-2xl mb-3 shadow-inner">
              <QrCode className="w-7 h-7" />
            </div>

            <h3 className="text-base font-extrabold text-slate-900 font-sans tracking-tight">
              Shareable TA Journal QR Code
            </h3>
            <p className="text-xs text-slate-600 mt-1 font-medium">
              {qrModalState.profile?.name ? `${qrModalState.profile.name} • ` : ''}
              {formatMonth(qrModalState.journal.monthClaimed)} (₹{qrModalState.journal.totalAmount.toLocaleString('en-IN')})
            </p>

            {/* QR Image Display */}
            <div className="my-5 flex flex-col items-center justify-center">
              <div className="p-3 bg-white border-2 border-slate-200 rounded-2xl shadow-sm inline-block">
                <img
                  src={qrModalState.qrDataUrl}
                  alt="Shareable Journal QR Code"
                  className="w-56 h-56 object-contain rounded-lg"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-2.5 max-w-xs leading-relaxed font-medium">
                Other officers can scan this QR code using <strong>"Scan Journal"</strong> to view or import this TA claim.
              </p>
            </div>

            {/* Shareable Link Box */}
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 mb-5 flex items-center gap-2 text-left">
              <input
                type="text"
                readOnly
                value={qrModalState.shareUrl}
                className="bg-transparent text-[11px] font-mono text-slate-700 flex-1 outline-none truncate px-1"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(qrModalState.shareUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2500);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shrink-0 cursor-pointer shadow-xs active:scale-95"
              >
                {copiedLink ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={() => setQrModalState({ isOpen: false, journal: null, profile: null, qrDataUrl: '', shareUrl: '' })}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition cursor-pointer font-bold text-xs"
            >
              Close / बंद करें
            </button>
          </div>
        </div>
      )}

      {/* PDF TA Importer Modal */}
      {isPdfModalOpen && (
        <PdfTaImportModal
          isOpen={isPdfModalOpen}
          onClose={() => setIsPdfModalOpen(false)}
          existingProfiles={profiles}
          onSaveNewJournal={(newJournal, newProfile) => {
            if (onSaveProfile && newProfile) {
              onSaveProfile(newProfile);
            }
            if (onSaveJournal) {
              onSaveJournal(newJournal);
            }
            // Navigate to dashboard or print
            onViewChange('dashboard');
          }}
        />
      )}
    </motion.div>
  );
}
