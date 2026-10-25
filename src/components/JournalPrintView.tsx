/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { TAJournal, OfficerProfile } from '../types';
import QRCode from 'qrcode';
import { auth } from '../firebase';
import { numberToIndianWords } from '../utils';
import { 
  ArrowLeft, 
  ArrowLeftRight,
  Printer, 
  FileSpreadsheet, 
  Globe, 
  FileCheck2, 
  Info, 
  Eye, 
  EyeOff, 
  Sliders, 
  Settings, 
  Layers, 
  Maximize, 
  Minimize, 
  MoveHorizontal, 
  Type, 
  RotateCcw,
  Copy,
  ExternalLink,
  FileDown,
  PenTool,
  Check,
  Trash2,
  QrCode,
  Share2,
  Download,
  MessageCircle,
  Send,
  Mail,
  Cloud,
  X
} from 'lucide-react';
import { connectGoogleDrive, getCachedDriveToken, uploadFileToDrive } from '../services/googleDrive';

function oklabToRgbString(L: number, a: number, b: number, alpha: number): string {
  // Convert OKLAB to LMS
  const l_ = L + 0.3963377774 * a + 0.2158017502 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = Math.pow(Math.max(0, l_), 3);
  const m = Math.pow(Math.max(0, m_), 3);
  const s = Math.pow(Math.max(0, s_), 3);

  // Convert LMS to Linear sRGB
  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  // Linear sRGB to standard sRGB
  const convertChannel = (c: number) => {
    const clamped = Math.max(0, Math.min(1, c));
    const val = clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
    return Math.round(val * 255);
  };

  const rOut = convertChannel(rLin);
  const gOut = convertChannel(gLin);
  const bOut = convertChannel(bLin);

  if (alpha === 1) {
    return `rgb(${rOut}, ${gOut}, ${bOut})`;
  } else {
    return `rgba(${rOut}, ${gOut}, ${bOut}, ${alpha})`;
  }
}

function cleanColorString(val: string | null | undefined): string {
  if (!val || typeof val !== 'string') return val || '';

  let replaced = val;

  // Robust regex to match any oklch(...) including 'none' keywords, percentages, deg, and alpha
  const oklchRegex = /oklch\(\s*([^\s/]+)\s+([^\s/]+)\s+([^\s/)]+)(?:\s*\/\s*([^\s/)]+))?\s*\)/gi;
  replaced = replaced.replace(oklchRegex, (_match, lStr, cStr, hStr, aStr) => {
    try {
      const parseL = (s: string) => {
        if (!s || s === 'none') return 0;
        if (s.endsWith('%')) return parseFloat(s) / 100;
        return parseFloat(s);
      };
      const parseC = (s: string) => {
        if (!s || s === 'none') return 0;
        if (s.endsWith('%')) return parseFloat(s) / 100;
        return parseFloat(s);
      };
      const parseH = (s: string) => {
        if (!s || s === 'none') return 0;
        let hVal = s;
        if (hVal.endsWith('deg')) hVal = hVal.slice(0, -3);
        if (hVal.endsWith('%')) return (parseFloat(hVal) / 100) * 360;
        return parseFloat(hVal);
      };
      const parseAlpha = (s: string | undefined) => {
        if (!s || s === 'none') return 1;
        if (s.endsWith('%')) return parseFloat(s) / 100;
        const val = parseFloat(s);
        return isNaN(val) ? 1 : val;
      };

      const l = parseL(lStr);
      const c = parseC(cStr);
      const h = parseH(hStr);
      const alpha = parseAlpha(aStr);

      // Fast-path common black/white/gray values to guarantee true black/white
      if (l <= 0.05 && c <= 0.02) {
        return alpha === 1 ? 'rgb(0, 0, 0)' : `rgba(0, 0, 0, ${alpha})`;
      }
      if (l >= 0.98 && c <= 0.02) {
        return alpha === 1 ? 'rgb(255, 255, 255)' : `rgba(255, 255, 255, ${alpha})`;
      }

      // OKLCH to OKLAB
      const hRad = (h * Math.PI) / 180;
      const a = c * Math.cos(hRad);
      const b = c * Math.sin(hRad);

      return oklabToRgbString(l, a, b, alpha);
    } catch {
      return 'rgb(0, 0, 0)';
    }
  });

  // Robust regex to match any oklab(...) including 'none' keywords and alpha
  const oklabRegex = /oklab\(\s*([^\s/]+)\s+([^\s/]+)\s+([^\s/)]+)(?:\s*\/\s*([^\s/)]+))?\s*\)/gi;
  replaced = replaced.replace(oklabRegex, (_match, lStr, aStr, bStr, alphaStr) => {
    try {
      const parseVal = (s: string) => {
        if (!s || s === 'none') return 0;
        if (s.endsWith('%')) return parseFloat(s) / 100;
        return parseFloat(s);
      };
      const parseAlpha = (s: string | undefined) => {
        if (!s || s === 'none') return 1;
        if (s.endsWith('%')) return parseFloat(s) / 100;
        const val = parseFloat(s);
        return isNaN(val) ? 1 : val;
      };

      const l = parseVal(lStr);
      const a = parseVal(aStr);
      const b = parseVal(bStr);
      const alpha = parseAlpha(alphaStr);

      if (l <= 0.05 && Math.abs(a) <= 0.02 && Math.abs(b) <= 0.02) {
        return alpha === 1 ? 'rgb(0, 0, 0)' : `rgba(0, 0, 0, ${alpha})`;
      }
      if (l >= 0.98 && Math.abs(a) <= 0.02 && Math.abs(b) <= 0.02) {
        return alpha === 1 ? 'rgb(255, 255, 255)' : `rgba(255, 255, 255, ${alpha})`;
      }

      return oklabToRgbString(l, a, b, alpha);
    } catch {
      return 'rgb(0, 0, 0)';
    }
  });

  return replaced;
}

interface CurvedTextProps {
  text: string;
  cx: number;
  cy: number;
  r: number;
  startAngle: number;
  endAngle: number;
  className?: string;
  inlineStyle?: React.CSSProperties;
  basesInward?: boolean;
}

const CurvedText = ({
  text,
  cx,
  cy,
  r,
  startAngle,
  endAngle,
  className,
  inlineStyle,
  basesInward = true
}: CurvedTextProps) => {
  const chars = text.split('');
  const totalAngle = endAngle - startAngle;
  const step = chars.length > 1 ? totalAngle / (chars.length - 1) : 0;

  return (
    <>
      {chars.map((char, index) => {
        const angle = startAngle + index * step;
        const angleRad = (angle * Math.PI) / 180;
        const x = cx + r * Math.cos(angleRad);
        const y = cy + r * Math.sin(angleRad);
        const rotation = basesInward ? angle + 90 : angle - 90;

        return (
          <text
            key={index}
            x={x}
            y={y}
            transform={`rotate(${rotation}, ${x}, ${y})`}
            textAnchor="middle"
            dominantBaseline="middle"
            className={className}
            style={inlineStyle}
          >
            {char}
          </text>
        );
      })}
    </>
  );
};

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onClear: () => void;
}

const SignaturePadComponent = ({ onSave, onClear }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set up ink styling
    ctx.strokeStyle = '#020617'; // slate-950 dark ink
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    // Scale coordinates back according to bounding box vs. actual canvas size
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if ('touches' in e) {
      e.preventDefault();
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    if ('touches' in e) {
      e.preventDefault();
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      const canvas = canvasRef.current;
      if (canvas) {
        // Save signature data as PNG data URL
        const val = canvas.toDataURL('image/png');
        onSave(val);
      }
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onClear();
  };

  return (
    <div className="space-y-2">
      <div className="border border-slate-300 rounded-lg bg-slate-50/50 shadow-inner p-1 relative">
        <canvas
          ref={canvasRef}
          width={450}
          height={180}
          className="w-full h-[180px] bg-white cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        <div className="absolute bottom-2 left-3 text-[10px] text-slate-400 font-medium select-none pointer-events-none">
          Draw inside the box using mouse or path touch
        </div>
      </div>
      <div className="flex justify-between items-center text-xs">
        <span className="text-slate-500 font-medium">Stroke color: Black ink</span>
        <button
          type="button"
          onClick={clearCanvas}
          className="px-2.5 py-1.5 border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md font-semibold transition"
        >
          Clear Pad
        </button>
      </div>
    </div>
  );
};

// Format month to standard display: e.g. "May-2026"
const formatMonthClaimed = (monthClaimed: string) => {
  if (!monthClaimed) return '';
  const [year, month] = monthClaimed.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).replace(' ', '-');
};

// Helper to estimate height score of a journey row: Halted mode takes the space of 3 normal entries. >80 chars non-halted takes 2 normal entries space.
const getJourneyHeightScore = (j: any): number => {
  if (!j) return 1.0;
  if (j.mode === 'Halted') {
    return 3.0; // Halted mode occupies exactly 3 normal rows of space
  }
  if (j.objectOfJourney && j.objectOfJourney.length > 80) {
    return 2.0; // Non-halted row with >80 characters occupies 2 normal rows of space
  }
  return 1.0; // All other normal entries occupy exactly 1 normal row of space
};

// The PDF background watermark will now render the official, high-resolution transparent RPF emblem exactly matching the uploaded artwork.

interface JournalPrintViewProps {
  journal: TAJournal;
  profiles: OfficerProfile[];
  onBack: () => void;
  initialAction?: 'share' | 'download' | 'print';
}

export default function JournalPrintView({
  journal,
  profiles,
  onBack,
  initialAction
}: JournalPrintViewProps) {
  const [bilingual, setBilingual] = useState(true);
  const [prefill, setPrefill] = useState(true);
  const [isBlackWhite, setIsBlackWhite] = useState(false);
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.20); // fixed at 20% default for perfect balance / print visibility

  // Controlling Officer vs Head of Office swap state (persisted in localStorage)
  // Default: true (Controlling Officer first, then Head of Office) as requested by user
  const [swapOfficerOrder, setSwapOfficerOrder] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('rpf_ta_swap_officer_order');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true; // default: Controlling Officer first, then Head of Office
  });

  const toggleOfficerOrder = () => {
    setSwapOfficerOrder(prev => {
      const next = !prev;
      try {
        localStorage.setItem('rpf_ta_swap_officer_order', String(next));
      } catch {}
      return next;
    });
  };

  // Print Page Layout configuration
  const [marginTop, setMarginTop] = useState(5);       // top margin in mm (landscape needs tight vertical margins)
  const [marginBottom, setMarginBottom] = useState(5);    // bottom margin in mm
  const [marginLeft, setMarginLeft] = useState(5);      // left margin in mm
  const [marginRight, setMarginRight] = useState(5);     // right margin in mm
  const [rowHeight, setRowHeight] = useState(20);        // CSS table row height in px for landscape grid fit
  const [fontSize, setFontSize] = useState(10.5);         // CSS table font size in px
  const [printScale, setPrintScale] = useState(98);      // overall print scaling % (landscape works well at 100%)
  const [showConfig, setShowConfig] = useState(true);    // show layout configurations toolbar
  const [journalFont, setJournalFont] = useState<'standard' | 'high-contrast-serif'>('standard');

  // --- Inline Manual Days/Night Keyboard Entry States ---
  const [customDaysNightMap, setCustomDaysNightMap] = useState<Record<string, string>>({});
  const [editingDaysNightRowId, setEditingDaysNightRowId] = useState<string | null>(null);
  const [editingDaysNightText, setEditingDaysNightText] = useState<string>('');

  const handleSaveInlineDaysNight = (rowId: string) => {
    setCustomDaysNightMap(prev => ({
      ...prev,
      [rowId]: editingDaysNightText
    }));
    setEditingDaysNightRowId(null);
  };
  // --- Print Options Modal State (प्रिंट विकल्प) ---
  const [showPrintModal, setShowPrintModal] = useState(false);

  // --- Social Media PDF Share States ---
  const [isSharingPDF, setIsSharingPDF] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharedFileName, setSharedFileName] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const hasAutoSharedRef = useRef(false);

  // --- Share via QR Code States ---
  const [showQRModal, setShowQRModal] = useState(false);
  const [claimQrCodeUrl, setClaimQrCodeUrl] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [isGeneratingQR, setIsGeneratingQR] = useState(false);

  const handleShareQR = async () => {
    try {
      setIsGeneratingQR(true);
      const ownerId = journal.adminOwnerId || auth.currentUser?.uid || profile?.adminOwnerId || profile?.id || 'anon';
      const shareUrl = `${window.location.origin}${window.location.pathname}?journalId=${journal.id}&ownerId=${ownerId}`;

      // Automatically sync journal & profile to cloud if user is signed in and quota is available
      if (auth.currentUser) {
        try {
          const { saveUserJournal, saveUserCustomProfile, isQuotaExhausted } = await import('../firebase');
          if (!isQuotaExhausted()) {
            await saveUserJournal(auth.currentUser.uid, {
              ...journal,
              adminOwnerId: auth.currentUser.uid,
              officerName: profile.name,
              pfNumber: profile.pfNumber
            });
            if (profile) {
              await saveUserCustomProfile(auth.currentUser.uid, profile);
            }
          }
        } catch (syncErr) {
          console.warn("Silent sync to cloud before QR share:", syncErr);
        }
      }

      const url = await QRCode.toDataURL(shareUrl, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 400,
        color: {
          dark: '#1e1b4b', // Deep slate indigo/navy
          light: '#ffffff'
        }
      });
      setClaimQrCodeUrl(url);
      setShowQRModal(true);
    } catch (err) {
      console.error('QR code generation failed in Print View:', err);
    } finally {
      setIsGeneratingQR(false);
    }
  };

  const handleCopyShareLink = () => {
    const ownerId = journal.adminOwnerId || auth.currentUser?.uid || profile?.adminOwnerId || profile?.id || 'anon';
    const shareUrl = `${window.location.origin}${window.location.pathname}?journalId=${journal.id}&ownerId=${ownerId}`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      })
      .catch(err => {
        console.error('Failed to copy share link in Print View:', err);
      });
  };

  const handleDownloadClaimQR = () => {
    if (!claimQrCodeUrl) return;
    const link = document.createElement('a');
    link.href = claimQrCodeUrl;
    link.download = `TA_Journal_QR_${(profile?.name || 'Officer').replace(/[^a-zA-Z0-9]/g, '_')}_${journal.monthClaimed || 'Claim'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Dynamically initialize optimal rowHeight and fontSize depending on total active journeys score to guarantee proper A4 fit
  useEffect(() => {
    // Calculate precise total visual height score across all journeys
    const totalScore = journal.journeys.reduce((sum: number, j: any) => sum + getJourneyHeightScore(j), 0);
    
    // Always enforce a consistent 5mm margin on all sides for optimal printable surface area
    setMarginTop(5);
    setMarginBottom(5);
    setMarginLeft(5);
    setMarginRight(5);

    // Compute estimated sheets count to see if we are using dynamic multipage layout
    const scores = journal.journeys.map((j: any) => getJourneyHeightScore(j));
    const totalCount = journal.journeys.length;
    
    let tempPagesCount = 1;
    if (totalCount > 0) {
      let p1Index = 0;
      let p1ScoreAccum = 0;
      while (p1Index < totalCount) {
        const s = scores[p1Index] || 1.0;
        if (p1ScoreAccum + s > 22.0) {
          break;
        }
        p1ScoreAccum += s;
        p1Index++;
      }
      if (p1Index === 0) p1Index = 1;
      
      let currentOffset = p1Index;
      while (currentOffset < totalCount) {
        tempPagesCount++;
        const remainingScores = scores.slice(currentOffset);
        const remainingSum = remainingScores.reduce((sum: number, s: number) => sum + s, 0);
        
        const isNextPagePage2 = (tempPagesCount === 2);
        const lastPageCap = 12.0;
        
        if (remainingSum <= lastPageCap) {
          break;
        }
        
        let midScoreAccum = 0;
        let midIndex = currentOffset;
        while (midIndex < totalCount) {
          const s = scores[midIndex] || 1.0;
          if (midScoreAccum + s > 22.0) {
            break;
          }
          midScoreAccum += s;
          midIndex++;
        }
        if (midIndex === currentOffset) {
          midIndex++;
        }
        currentOffset = midIndex;
      }
    }

    // ONLY compress row heights & scale down if the document is exactly 2 sheets AND the total score is > 35.
    // If the document has 3+ page sheets, we have plenty of physical space so we do NOT shrink anything!
    if (tempPagesCount === 2 && totalScore > 35) {
      // Scale is proportional to how much we exceed standard 35-item limit
      let overflowFactor = totalScore / 35;
      
      // Specifically compress more aggressively when score exceeds 38 to guarantee no overflow/clipping
      if (totalScore > 38) {
        overflowFactor *= 1.10;
      }
      
      // Compute thresholds dynamically. Allow much tighter limits (down to 11px rowHeight and 6.2px font) for high counts.
      let minRowHeight = 14;
      let minFontSize = 7.5;
      let minPrintScale = 94;

      if (totalScore > 42) {
        minRowHeight = 11.0;
        minFontSize = 6.2;
        minPrintScale = 94;
      } else if (totalScore > 35) {
        minRowHeight = 12.0;
        minFontSize = 6.8;
        minPrintScale = 94;
      }

      const computedRowHeight = Math.max(minRowHeight, Math.floor(20 / overflowFactor));
      const computedFontSize = Math.max(minFontSize, Math.floor((10.5 / overflowFactor) * 10) / 10);
      const computedPrintScale = Math.max(minPrintScale, Math.floor(100 / overflowFactor));

      setRowHeight(computedRowHeight);
      setFontSize(computedFontSize);
      setPrintScale(computedPrintScale);
    } else {
      // Standard safe values that fit beautifully on exactly 2 pages with 22 standard rows on Page 1 and 12 rows on Page 2
      setRowHeight(20);
      setFontSize(10.5);
      setPrintScale(100);
    }
  }, [journal.id, journal.journeys]);

  // Helper function to monitor total row count and return custom padded styles for vintage-table cells to prevent exceed 2-page print capacity
  const getVintageTablePadding = (): { th: string; td: string } => {
    const totalScore = journal.journeys.reduce((sum: number, j: any) => sum + getJourneyHeightScore(j), 0);
    if (totalScore >= 28) {
      return { th: '0.4px 2px', td: '0.4px 2px' };
    } else if (totalScore > 22) {
      return { th: '1px 3px', td: '1px 3px' };
    } else {
      return { th: '1.5px 3px', td: '2px 4px' };
    }
  };

  const applyPreset = (preset: 'standard' | 'compact' | 'super-narrow' | 'wide') => {
    // Force consistent 5mm margins on all sides
    setMarginTop(5);
    setMarginBottom(5);
    setMarginLeft(5);
    setMarginRight(5);
    
    switch (preset) {
      case 'standard':
        setRowHeight(23);
        setFontSize(9);
        setPrintScale(98);
        break;
      case 'compact':
        setRowHeight(22);
        setFontSize(8.5);
        setPrintScale(96);
        break;
      case 'super-narrow':
        setRowHeight(20);
        setFontSize(8);
        setPrintScale(92);
        break;
      case 'wide':
        setRowHeight(26);
        setFontSize(9.5);
        setPrintScale(100);
        break;
    }
  };

  // Resilient multi-tier profile resolution so printing NEVER fails or shows an error screen
  const matchedProfile = useMemo<OfficerProfile>(() => {
    // 0. If journal has explicit officerName, try exact name match first
    if (journal.officerName) {
      const byName = profiles.find(p => p.name && p.name.trim().toLowerCase() === journal.officerName?.trim().toLowerCase());
      if (byName) return byName;
    }

    // 1. PF Number match
    if (journal.pfNumber) {
      const byPf = profiles.find(p => p.pfNumber && p.pfNumber.trim().toLowerCase() === journal.pfNumber?.trim().toLowerCase());
      if (byPf) return byPf;
    }

    // 2. Direct ID match (only if name doesn't contradict journal.officerName)
    if (journal.profileId) {
      const byId = profiles.find(p => p.id === journal.profileId);
      if (byId) {
        if (!journal.officerName || byId.name.trim().toLowerCase() === journal.officerName.trim().toLowerCase()) {
          return byId;
        }
      }
    }

    // 3. Admin owner match (only if name matches)
    if (journal.adminOwnerId) {
      const byAdmin = profiles.find(p => p.adminOwnerId === journal.adminOwnerId);
      if (byAdmin && (!journal.officerName || byAdmin.name.trim().toLowerCase() === journal.officerName.trim().toLowerCase())) {
        return byAdmin;
      }
    }

    // 4. Look in localStorage cached profiles or active profile
    try {
      const activeStr = localStorage.getItem('rpf_active_user_profile');
      if (activeStr) {
        const parsed = JSON.parse(activeStr);
        if (parsed && (
          (journal.officerName && parsed.name && parsed.name.trim().toLowerCase() === journal.officerName.trim().toLowerCase()) ||
          (journal.pfNumber && parsed.pfNumber && parsed.pfNumber.trim() === journal.pfNumber.trim())
        )) {
          return parsed;
        }
      }
      const allProfilesStr = localStorage.getItem('rpf_officer_profiles');
      if (allProfilesStr) {
        const list: OfficerProfile[] = JSON.parse(allProfilesStr);
        if (Array.isArray(list) && list.length > 0) {
          const inLocal = list.find(p => 
            (journal.officerName && p.name && p.name.trim().toLowerCase() === journal.officerName.trim().toLowerCase()) ||
            (journal.pfNumber && p.pfNumber && p.pfNumber.trim() === journal.pfNumber.trim())
          );
          if (inLocal) return inLocal;
        }
      }
    } catch (e) {
      console.warn("Could not read local profile cache:", e);
    }

    // 5. If journal has explicit officerName, return synthetic profile for that officer
    if (journal.officerName) {
      return {
        id: journal.profileId || 'custom-officer',
        name: journal.officerName,
        pfNumber: journal.pfNumber || 'N/A',
        designation: 'Staff',
        branch: 'Security',
        division: 'CKP',
        headquarter: 'HQ',
        basicPay: 21700,
        scaleOfPay: '5,200-20,200',
        dateOfAppointment: '',
        ruleGoverned: 'S. Rule',
        gradePay: 2000
      };
    }

    // 6. First profile in list if any exist
    if (profiles.length > 0) {
      return profiles[0];
    }

    // 7. Synthetic fallback officer profile constructed directly from journal fields so it NEVER blocks printing
    return {
      id: journal.profileId || 'default-officer',
      name: journal.officerName || 'RPF Personnel',
      pfNumber: journal.pfNumber || 'N/A',
      designation: 'Constable',
      branch: 'Security',
      division: 'CKP',
      headquarter: 'TATA',
      basicPay: 21700,
      scaleOfPay: '5,200-20,200',
      dateOfAppointment: '',
      ruleGoverned: 'S. Rule',
      gradePay: 2000
    };
  }, [profiles, journal]);

  const [selectedProfileOverrideId, setSelectedProfileOverrideId] = useState<string>('');

  const profile: OfficerProfile = useMemo(() => {
    if (selectedProfileOverrideId) {
      const override = profiles.find(p => p.id === selectedProfileOverrideId);
      if (override) return override;
    }
    return matchedProfile;
  }, [profiles, selectedProfileOverrideId, matchedProfile]);

  const [printError, setPrintError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Digital Signature States
  const [showSignModal, setShowSignModal] = useState(false);
  const [signatureType, setSignatureType] = useState<'type' | 'draw' | 'upload'>('type');
  const [signatureValue, setSignatureValue] = useState<string>('');
  const [typedName, setTypedName] = useState(profile.name || '');

  useEffect(() => {
    if (profile?.name) {
      setTypedName(profile.name);
    }
  }, [profile?.name]);

  const generateHighQualityPDFInstance = async (): Promise<{
    pdf: any;
    outputFilename: string;
    blob: Blob;
    file: File;
  } | null> => {
    const originalGetComputedStyle = window.getComputedStyle;
    const originalCssTextDescriptor = typeof CSSRule !== 'undefined' && CSSRule.prototype
      ? Object.getOwnPropertyDescriptor(CSSRule.prototype, 'cssText')
      : null;

    const styleElements = Array.from(document.querySelectorAll('style'));
    const styleBackups = styleElements.map((el) => ({
      element: el,
      originalContent: el.textContent,
    }));
    const linkElements = Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
    const linkBackups: { element: HTMLLinkElement; tempStyle?: HTMLStyleElement }[] = [];

    try {
      setIsGeneratingPDF(true);
      setPrintError(null);

      // Monkeypatch window.getComputedStyle to intercept oklch/oklab from CSS variable definitions
      window.getComputedStyle = function (elt, pseudoElt) {
        const style = originalGetComputedStyle.call(window, elt, pseudoElt);
        if (!style) return style;
        return new Proxy(style, {
          get(target, prop, receiver) {
            if (prop === 'getPropertyValue') {
              return function(propertyName: string) {
                const rawVal = target.getPropertyValue(propertyName);
                return cleanColorString(rawVal);
              };
            }
            const origValue = Reflect.get(target, prop, target);
            if (typeof origValue === 'function') {
              return origValue.bind(target);
            }
            if (typeof prop === 'string' && typeof origValue === 'string') {
              return cleanColorString(origValue);
            }
            return origValue;
          }
        });
      };

      // Monkeypatch CSSRule.prototype.cssText
      if (originalCssTextDescriptor && originalCssTextDescriptor.get) {
        Object.defineProperty(CSSRule.prototype, 'cssText', {
          get() {
            const rawText = originalCssTextDescriptor.get!.call(this);
            return cleanColorString(rawText);
          },
          configurable: true
        });
      }

      // Temporarily sanitize style elements to cleanly convert oklch and oklab (unsupported in html2canvas) to true RGB
      styleElements.forEach((el) => {
        let content = el.textContent || '';
        if (content.includes('oklch') || content.includes('oklab')) {
          el.textContent = cleanColorString(content);
        }
      });

      // Temporarily fetch, sanitize, and proxy same-origin link stylesheets
      for (const link of linkElements) {
        try {
          const href = link.href;
          if (href && (href.startsWith(window.location.origin) || !href.startsWith('http'))) {
            const res = await fetch(href);
            if (res.ok) {
              let cssText = await res.text();
              if (cssText.includes('oklch') || cssText.includes('oklab')) {
                cssText = cleanColorString(cssText);

                const tempStyle = document.createElement('style');
                tempStyle.textContent = cssText;
                document.head.appendChild(tempStyle);

                link.disabled = true;
                linkBackups.push({ element: link, tempStyle });
              }
            }
          }
        } catch (e) {
          console.warn("Failed to fetch/sanitize link stylesheet:", link.href, e);
        }
      }
      
      // Let React apply state and 'generating-pdf' CSS classes
      await new Promise((resolve) => setTimeout(resolve, 200));

      const { jsPDF } = await import('jspdf');
      const { default: html2canvas } = await import('html2canvas');
      
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true
      });
      
      const canvasOpts = {
        scale: 4, // 4x device pixel ratio for razor-sharp vector-like text and line reproduction (~384 DPI)
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc: Document) => {
          // 1. Watermark: Keep authentic, subtle and visible watermark matching screen preview
          const watermarks = clonedDoc.querySelectorAll('.pdf-watermark-container, .pdf-watermark-svg');
          watermarks.forEach((wm: Element) => {
            const htmlWm = wm as HTMLElement;
            htmlWm.style.opacity = String(watermarkOpacity || 0.16);
            htmlWm.style.filter = 'none';
            htmlWm.style.display = 'block';
            htmlWm.style.visibility = 'visible';
          });

          // 2. Hide all buttons, interactive controls, and .no-print elements
          const noPrint = clonedDoc.querySelectorAll('.no-print, button, .control-bar, [role="button"]');
          noPrint.forEach((el) => {
            (el as HTMLElement).style.display = 'none';
          });

          // 3. Page Container: Enforce strict A4 Landscape dimensions (297mm x 210mm) and pure white background
          const pages = clonedDoc.querySelectorAll('.a4-screen-page, .print-page');
          pages.forEach((p: Element) => {
            const pageEl = p as HTMLElement;
            pageEl.style.width = '297mm';
            pageEl.style.height = '210mm';
            pageEl.style.maxWidth = '297mm';
            pageEl.style.maxHeight = '210mm';
            pageEl.style.minWidth = '297mm';
            pageEl.style.minHeight = '210mm';
            pageEl.style.padding = '4mm';
            pageEl.style.boxSizing = 'border-box';
            pageEl.style.border = 'none';
            pageEl.style.boxShadow = 'none';
            pageEl.style.margin = '0';
            pageEl.style.backgroundColor = '#ffffff';
          });

          // 4. Table Borders & Alignment: Ensure deep black borders matching official print styling
          const tableBorders = clonedDoc.querySelectorAll('.vintage-table, .vintage-table th, .vintage-table td, .border-black');
          tableBorders.forEach((b: Element) => {
            const htmlB = b as HTMLElement;
            htmlB.style.borderColor = '#000000';
          });

          // Ensure table headers are vertically centered
          const headerCells = clonedDoc.querySelectorAll('.vintage-table th');
          headerCells.forEach((th: Element) => {
            const htmlTh = th as HTMLElement;
            htmlTh.style.verticalAlign = 'middle';
            htmlTh.style.textAlign = 'center';
          });

          // Perfect mathematical vertical centering for all data rows between top and bottom lines
          const allRows = clonedDoc.querySelectorAll('.vintage-table tbody tr');
          allRows.forEach((row: Element) => {
            const htmlRow = row as HTMLElement;
            const isHalted = htmlRow.classList.contains('halted-row');
            const isDouble = htmlRow.classList.contains('double-row');
            const isTotal = htmlRow.classList.contains('total-row');

            // Explicit target height in pixels
            let targetRowHeight = 22.0;
            if (isHalted) targetRowHeight = 66.0;
            else if (isDouble) targetRowHeight = 44.0;
            else if (isTotal) targetRowHeight = 36.0;

            const rect = htmlRow.getBoundingClientRect();
            const computedRowH = Math.max(targetRowHeight, rect.height || htmlRow.offsetHeight || targetRowHeight);

            htmlRow.style.height = `${computedRowH}px`;

            const cells = htmlRow.querySelectorAll('td');
            cells.forEach((cell: Element) => {
              const htmlCell = cell as HTMLElement;
              htmlCell.style.height = `${computedRowH}px`;
              htmlCell.style.verticalAlign = 'middle';
              htmlCell.style.overflow = 'visible';
              htmlCell.style.lineHeight = '1.25';
              htmlCell.style.boxSizing = 'border-box';
              htmlCell.style.borderColor = '#000000';
              htmlCell.style.color = '#000000';
              htmlCell.style.fontWeight = '700';

              const text = htmlCell.textContent?.trim();
              if (!text || text === '') {
                htmlCell.innerHTML = '&nbsp;';
                return;
              }

              const isRight = htmlCell.classList.contains('text-right') || htmlCell.getAttribute('align') === 'right';
              const isLeft = htmlCell.classList.contains('text-left') || htmlCell.getAttribute('align') === 'left';
              
              if (isRight) {
                htmlCell.style.textAlign = 'right';
                htmlCell.style.padding = '1px 6px 1px 2px';
              } else if (isLeft) {
                htmlCell.style.textAlign = 'left';
                htmlCell.style.padding = '1px 2px 1px 6px';
              } else {
                htmlCell.style.textAlign = 'center';
                htmlCell.style.padding = '1px 2px';
              }

              // Ensure inner wrappers or spans are also centered and never clipped
              const innerBlock = htmlCell.querySelector('.object-of-journey-inner');
              if (innerBlock) {
                const htmlInner = innerBlock as HTMLElement;
                htmlInner.style.textAlign = 'center';
                htmlInner.style.lineHeight = '1.25';
                htmlInner.style.overflow = 'visible';
                htmlInner.style.wordBreak = 'break-word';
                htmlInner.style.margin = '0 auto';
              }
            });
          });
        }
      };

      let addedPageCount = 0;
      // Capture each page (pdf-page-1, pdf-page-2, etc.)
      const pageElements = Array.from(document.querySelectorAll('.print-page'));
      const activePagesCount = pageElements.length > 0 ? pageElements.length : 2;

      for (let pIdx = 0; pIdx < activePagesCount; pIdx++) {
        const pageId = `pdf-page-${pIdx + 1}`;
        const pageElement = document.getElementById(pageId);
        if (!pageElement) {
          console.warn(`Page element with ID ${pageId} not found in DOM`);
          continue;
        }
        
        const canvas = await html2canvas(pageElement, canvasOpts);
        // Lossless PNG prevents JPEG compression ringing artifacts around numbers, text and lines
        const img = canvas.toDataURL('image/png');
        
        if (addedPageCount > 0) {
          pdf.addPage('a4', 'landscape');
        }
        // Exact A4 landscape dimensions: 297mm width, 210mm height, full-bleed 0 offset
        pdf.addImage(img, 'PNG', 0, 0, 297, 210, undefined, 'FAST');
        addedPageCount++;
      }
      
      if (addedPageCount === 0) {
        throw new Error("No A4 pages were successfully rendered.");
      }
      
      const formattedOfficerName = profile.name.trim().replace(/[^a-zA-Z0-9]/g, '_');
      const formattedMonth = journal.monthClaimed ? journal.monthClaimed : 'Claim';
      const outputFilename = `TA_Journal_${formattedOfficerName}_${formattedMonth}.pdf`;
      
      const blob = pdf.output('blob');
      const file = new File([blob], outputFilename, { type: 'application/pdf' });

      return { pdf, outputFilename, blob, file };
    } catch (err: any) {
      console.error("PDF generation error: ", err);
      setPrintError(
        `Fidelity rendering of A4 PDF failed. Please use standard 'Print Document' button as a backup. Error: ${err?.message || err}`
      );
      return null;
    } finally {
      setIsGeneratingPDF(false);

      // Restore window.getComputedStyle
      if (originalGetComputedStyle) {
        window.getComputedStyle = originalGetComputedStyle;
      }

      // Restore CSSRule.prototype.cssText
      if (originalCssTextDescriptor && typeof CSSRule !== 'undefined' && CSSRule.prototype) {
        Object.defineProperty(CSSRule.prototype, 'cssText', originalCssTextDescriptor);
      }
      
      // Restore style tag contents
      styleBackups.forEach(({ element, originalContent }) => {
        element.textContent = originalContent;
      });

      // Restore link tags and remove temporary styles
      linkBackups.forEach(({ element, tempStyle }) => {
        element.disabled = false;
        if (tempStyle && tempStyle.parentNode) {
          tempStyle.parentNode.removeChild(tempStyle);
        }
      });
    }
  };

  const handleDownloadPDF = async () => {
    const result = await generateHighQualityPDFInstance();
    if (result) {
      result.pdf.save(result.outputFilename);
    }
  };

  const handleSharePDF = async () => {
    setIsSharingPDF(true);
    setPrintError(null);
    try {
      const result = await generateHighQualityPDFInstance();
      if (!result) return;

      setSharedFileName(result.outputFilename);

      let sharedViaNative = false;
      // 1. Check if device supports native file sharing (Web Share API Level 2)
      if (typeof navigator !== 'undefined' && navigator.canShare && typeof navigator.share === 'function') {
        try {
          if (navigator.canShare({ files: [result.file] })) {
            await navigator.share({
              files: [result.file],
              title: `TA Journal - ${journal.monthClaimed} (${profile.name})`,
              text: `RPF Travelling Allowance Journal for ${journal.monthClaimed} - ${profile.name} (PF: ${profile.pfNumber}, HQ: ${profile.headquarter})`,
            });
            sharedViaNative = true;
          }
        } catch (nativeErr: any) {
          if (nativeErr.name === 'AbortError') {
            // User closed native share sheet
            return;
          }
          console.warn("Native file sharing error or dismissed, falling back to modal:", nativeErr);
        }
      }

      // 2. Fallback / supplementary modal for WhatsApp, Telegram, Email, and direct attachment
      if (!sharedViaNative) {
        // Automatically save the PDF so the user has the file in their downloads folder
        result.pdf.save(result.outputFilename);
        setShowShareModal(true);
      }
    } catch (err: any) {
      console.error("Share PDF error: ", err);
      setPrintError(`Failed to share PDF: ${err?.message || err}`);
    } finally {
      setIsSharingPDF(false);
    }
  };

  // Auto-trigger share when navigating directly with 'share' action
  useEffect(() => {
    if (initialAction === 'share' && !hasAutoSharedRef.current) {
      hasAutoSharedRef.current = true;
      const timer = setTimeout(() => {
        handleSharePDF();
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [initialAction]);

  const hasAutoPrintedRef = useRef(false);

  useEffect(() => {
    if (initialAction === 'print' && !hasAutoPrintedRef.current) {
      hasAutoPrintedRef.current = true;
      const timer = setTimeout(() => {
        handlePrint();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialAction]);

  // Auto-trigger print when navigating with 'print=true' in a clean new tab
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('print=true')) {
      const timer = setTimeout(() => {
        try {
          window.print();
        } catch {}
      }, 600);
      return () => clearTimeout(timer);
    }
  }, []);

  const getPrintDirectUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const ownerId = journal.adminOwnerId || auth.currentUser?.uid || profile?.adminOwnerId || profile?.id || 'anon';
    return `${origin}${pathname}?journalId=${journal.id}&ownerId=${ownerId}&print=true`;
  };

  const handlePrint = (e?: React.MouseEvent) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    setPrintError(null);
    setShowPrintModal(true);
    try {
      if (typeof window !== 'undefined') {
        window.print();
      }
    } catch (err: any) {
      console.warn("Direct window.print() call was restricted or failed:", err);
    }
  };

  const handleCopyUrl = () => {
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    const fullUrl = `${origin}${pathname}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Export to simple CSV format for Excel
  const handleExportCSV = () => {
    const csvRows = [
      ['Date', 'By Train/Road', 'Train No', 'Time Left', 'Time Arrived', 'From Station', 'To Station', 'Kms', 'Purpose', 'Rate per Day', 'Slab', 'Amount (Rs.)']
    ];

    journal.journeys.forEach(j => {
      let daysCountForCSV = 1;
      if (j.mode === 'Halted' && j.date && j.dateEnd && j.dateEnd >= j.date) {
        try {
          const d1 = new Date(j.date);
          const d2 = new Date(j.dateEnd);
          const diffTime = Math.abs(d2.getTime() - d1.getTime());
          const calculated = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
          if (!isNaN(calculated) && calculated > 0) {
            daysCountForCSV = calculated;
          }
        } catch {
          daysCountForCSV = 1;
        }
      }

      let slabPct = 0;
      if (j.overrideSlab === 'Auto') {
        slabPct = j.autoSlab;
      } else if (j.overrideSlab === 'Same Day (Nil)') {
        slabPct = 0;
      } else if (j.overrideSlab === 'Manual') {
        slabPct = j.dailyRate > 0 ? Math.round(((j.calculatedAmount || 0) / (j.dailyRate * daysCountForCSV)) * 100) : 0;
      } else {
        slabPct = Number(j.overrideSlab);
      }

      csvRows.push([
        j.date,
        j.mode,
        j.trainNo || 'N/A',
        j.timeLeft,
        j.timeArrived,
        j.fromStation,
        j.toStation,
        String(j.kms),
        j.objectOfJourney.replace(/,/g, ';'),
        String(j.dailyRate),
        `${slabPct}%`,
        String(j.calculatedAmount)
      ]);
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + csvRows.map(e => e.join(",")).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `TA_Journal_${profile.name}_${journal.monthClaimed}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Dynamic recalculation of totals and page breakdowns based on printed journeys to guarantee 100% alignment!
  let pct100DaysCount = 0;
  let pct70DaysCount = 0;
  let pct30DaysCount = 0;

  let totals30Raw = 0;
  let totals70Raw = 0;
  let totals100Raw = 0;

  const baseRate = journal.journeys[0]?.dailyRate || 625;

  journal.journeys.forEach((j: any, currentIdx: number) => {
    const isSameDaySub = false;

    if (isSameDaySub) return;

    let daysCount = 1;
    if (j.mode === 'Halted' && j.date && j.dateEnd && j.dateEnd >= j.date) {
      try {
        const d1 = new Date(j.date);
        const d2 = new Date(j.dateEnd);
        const diffTime = Math.abs(d2.getTime() - d1.getTime());
        const calculated = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
        if (!isNaN(calculated) && calculated > 0) {
          daysCount = calculated;
        }
      } catch {
        daysCount = 1;
      }
    }

    let slabPct = 0;
    if (j.overrideSlab === 'Auto') {
      slabPct = j.autoSlab;
    } else if (j.overrideSlab === 'Same Day (Nil)') {
      slabPct = 0;
    } else if (j.overrideSlab === 'Manual') {
      const rate = j.dailyRate || baseRate;
      slabPct = rate > 0 ? Math.round(((j.calculatedAmount || 0) / (rate * daysCount)) * 100) : 0;
    } else {
      slabPct = Number(j.overrideSlab);
    }

    const rAmount = j.calculatedAmount || 0;
    if (slabPct === 100) {
      pct100DaysCount += daysCount;
      totals100Raw += rAmount;
    } else if (slabPct === 70) {
      pct70DaysCount += daysCount;
      totals70Raw += rAmount;
    } else if (slabPct === 30) {
      pct30DaysCount += daysCount;
      totals30Raw += rAmount;
    }
  });

  const totals30Amount = Math.floor(totals30Raw);
  const totals30PaiseStr = Math.round((totals30Raw - totals30Amount) * 100).toString().padStart(2, '0');

  const totals70Amount = Math.floor(totals70Raw);
  const totals70PaiseStr = Math.round((totals70Raw - totals70Amount) * 100).toString().padStart(2, '0');

  const totals100Amount = Math.floor(totals100Raw);
  const totals100PaiseStr = Math.round((totals100Raw - totals100Amount) * 100).toString().padStart(2, '0');

  // Exact total amount split
  const dynamicTotalAmount = totals30Raw + totals70Raw + totals100Raw;
  const totalsSumAmount = Math.floor(dynamicTotalAmount);
  const totalsSumPaiseStr = Math.round((dynamicTotalAmount - totalsSumAmount) * 100).toString().padStart(2, '0');

  // ==================== DYNAMIC MULTI-PAGE LAYOUT ENGINE ====================
  // Calculate raw visual height scores for all journeys
  const journeyScores = journal.journeys.map(j => getJourneyHeightScore(j));
  const totalJourneysScore = journeyScores.reduce((sum, s) => sum + s, 0);

  // Capacities fixed as requested: Page 1 limit is 22 normal entries (22.0 score units); Page 2 / Last page is 12 normal entries (12.0 score units)
  interface DynamicPage {
    pageIndex: number;
    journeys: any[];
    startIndex: number;
    isFirst: boolean;
    isLast: boolean;
    isMid: boolean;
  }

  const partitionJourneysIntoPages = (): DynamicPage[] => {
    const journeys = journal.journeys;
    const scores = journeyScores;
    const totalCount = journeys.length;
    const totalScore = scores.reduce((sum, s) => sum + s, 0);
    
    const pagesList: DynamicPage[] = [];

    const FULL_PAGE_CAPACITY = 22.0;
    const LAST_PAGE_CAPACITY = 12.0;

    // Standard 1 or 2 page partitioning logic when totalScore <= 34.0:
    // Fits within 2 pages: Page 1 (up to 22.0) and Page 2 as the certificate/summary page (up to 12.0).
    if (totalScore <= 34.0) {
      let p1Index = 0;
      let p1ScoreAccum = 0;
      while (p1Index < totalCount) {
        const s = scores[p1Index] || 1.0;
        if (p1ScoreAccum + s > FULL_PAGE_CAPACITY) break;
        p1ScoreAccum += s;
        p1Index++;
      }
      if (p1Index === 0 && totalCount > 0) p1Index = 1;

      pagesList.push({
        pageIndex: 0,
        journeys: journeys.slice(0, p1Index),
        startIndex: 0,
        isFirst: true,
        isLast: false,
        isMid: false
      });

      pagesList.push({
        pageIndex: 1,
        journeys: journeys.slice(p1Index),
        startIndex: p1Index,
        isFirst: false,
        isLast: true,
        isMid: false
      });

      // Enforce boolean flags for safety
      pagesList.forEach((p, idx) => {
        p.isFirst = (idx === 0);
        p.isLast = (idx === pagesList.length - 1);
        p.isMid = (idx > 0 && idx < pagesList.length - 1);
      });

      return pagesList;
    }

    // =========================================================================
    // MULTI-PAGE STRATEGY (When totalScore > 34.0 -> Claim spans 3 or more pages)
    // User Rules:
    // 1. "pahle 2 page ko full capacity me fill karo":
    //    Page 1 capacity: 22 entries (22.0 score units)
    //    Page 2 capacity: 22 entries (22.0 score units)
    // 2. "aur jab bhi 2 page se 3 page me entry hone lagew tab second page me line ki sankhaya frist page jaisa hoga":
    //    Page 2 is a full table page (middle page) with 22 rows capacity, identical to Page 1!
    // 3. "fir bad me jab second page ka capacity full ho jai tab uske bad ki entry ko 3 page me lekar jao":
    //    Only after Page 2's capacity (22.0) is completely full, subsequent entries flow into Page 3!
    // =========================================================================

    // --- Page 1: Full Capacity (22.0) ---
    let p1Index = 0;
    let p1ScoreAccum = 0;
    while (p1Index < totalCount) {
      const s = scores[p1Index] || 1.0;
      if (p1ScoreAccum + s > FULL_PAGE_CAPACITY) break;
      p1ScoreAccum += s;
      p1Index++;
    }
    if (p1Index === 0 && totalCount > 0) p1Index = 1;

    pagesList.push({
      pageIndex: 0,
      journeys: journeys.slice(0, p1Index),
      startIndex: 0,
      isFirst: true,
      isLast: false,
      isMid: false
    });

    let currentOffset = p1Index;

    // --- Page 2: Full Capacity (22.0) - Line count identical to Page 1 (22 lines) ---
    let p2Index = currentOffset;
    let p2ScoreAccum = 0;
    while (p2Index < totalCount) {
      const s = scores[p2Index] || 1.0;
      if (p2ScoreAccum + s > FULL_PAGE_CAPACITY) break;
      p2ScoreAccum += s;
      p2Index++;
    }
    if (p2Index === currentOffset && currentOffset < totalCount) p2Index = currentOffset + 1;

    pagesList.push({
      pageIndex: 1,
      journeys: journeys.slice(currentOffset, p2Index),
      startIndex: currentOffset,
      isFirst: false,
      isLast: false,
      isMid: true
    });

    currentOffset = p2Index;

    // --- Page 3 and Beyond (Subsequent sheets) ---
    while (true) {
      const remainingScores = scores.slice(currentOffset);
      const remainingSum = remainingScores.reduce((sum, s) => sum + s, 0);

      // If no entries left, push the final certificate page
      if (currentOffset >= totalCount) {
        pagesList.push({
          pageIndex: pagesList.length,
          journeys: [],
          startIndex: currentOffset,
          isFirst: false,
          isLast: true,
          isMid: false
        });
        break;
      }

      // If remaining entries fit on the final certificate page (capacity <= 12.0)
      if (remainingSum <= LAST_PAGE_CAPACITY) {
        pagesList.push({
          pageIndex: pagesList.length,
          journeys: journeys.slice(currentOffset),
          startIndex: currentOffset,
          isFirst: false,
          isLast: true,
          isMid: false
        });
        break;
      }

      // If more than 12.0 remaining, fill another middle page with full 22.0 capacity
      let midScoreAccum = 0;
      let midIndex = currentOffset;
      while (midIndex < totalCount) {
        const s = scores[midIndex] || 1.0;
        if (midScoreAccum + s > FULL_PAGE_CAPACITY) break;
        midScoreAccum += s;
        midIndex++;
      }
      if (midIndex === currentOffset) midIndex = currentOffset + 1;

      pagesList.push({
        pageIndex: pagesList.length,
        journeys: journeys.slice(currentOffset, midIndex),
        startIndex: currentOffset,
        isFirst: false,
        isLast: false,
        isMid: true
      });
      currentOffset = midIndex;
    }

    // Explicitly enforce isFirst, isLast, isMid boolean flags for safety
    pagesList.forEach((p, idx) => {
      p.isFirst = (idx === 0);
      p.isLast = (idx === pagesList.length - 1);
      p.isMid = (idx > 0 && idx < pagesList.length - 1);
    });

    return pagesList;
  };

  const pages = partitionJourneysIntoPages();
  const totalPagesCount = pages.length;

  const PAGE1_CAPACITY = 22.0;
  const LASTPAGE_CAPACITY = 12.0;
  const MIDPAGE_CAPACITY = 22.0;

  const getPageCumulativeSums = (pIndex: number) => {
    let kmsSum = 0;
    let amountSum = 0;
    
    for (let i = 0; i <= pIndex; i++) {
      const p = pages[i];
      if (!p) continue;
      p.journeys.forEach((j: any) => {
        kmsSum += Number(j.kms) || 0;
        
        // same day subsequent deduction logic
        const globalIndex = journal.journeys.findIndex((item: any) => item.id === j.id);
        const isSameDaySub = false;
        
        amountSum += isSameDaySub ? 0 : (j?.calculatedAmount || 0);
      });
    }
    
    const amountFloor = Math.floor(amountSum);
    const amountPaise = Math.round((amountSum - amountFloor) * 100).toString().padStart(2, '0');
    
    return {
      kmsSum,
      amountSum,
      amountFloor,
      amountPaise
    };
  };

  // High-fidelity background watermarks for authentic document presentation
  const renderWatermark = (pageId: string) => {
    // 5 strategically arranged premium "Vani" watermark badges per page (Center & 4 Corners)
    const watermarkPositions = [
      { top: '50%', left: '50%', transform: 'translate(-50%, -52%) rotate(-15deg)', width: '280px', showText: true }, // Center (slightly larger with official sub-label)
      { top: '16%', left: '12%', transform: 'translate(-50%, -50%) rotate(-15deg)', width: '160px', showText: false }, // Top Left
      { top: '16%', left: '84%', transform: 'translate(-50%, -50%) rotate(-15deg)', width: '160px', showText: false }, // Top Right
      { top: '78%', left: '12%', transform: 'translate(-50%, -50%) rotate(-15deg)', width: '160px', showText: false }, // Bottom Left
      { top: '78%', left: '84%', transform: 'translate(-50%, -50%) rotate(-15deg)', width: '160px', showText: false },  // Bottom Right
    ];

    return (
      <div 
        className="absolute inset-0 pointer-events-none select-none z-0 overflow-hidden bg-transparent pdf-watermark-container"
        style={{ opacity: watermarkOpacity }}
      >
        {watermarkPositions.map((pos, idx) => (
          <div
            key={`watermark-badge-${pageId}-${idx}`}
            className="absolute pointer-events-none select-none text-slate-400 pdf-watermark-item"
            style={{
              top: pos.top,
              left: pos.left,
              transform: pos.transform,
              width: pos.width,
              mixBlendMode: 'multiply',
            }}
          >
            <svg
              viewBox="0 0 400 250"
              className="w-full h-auto select-none pointer-events-none pdf-watermark-svg"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Cursive Handwriting Vani */}
              <text
                x="110"
                y="120"
                fontSize="105"
                fontWeight="normal"
                fill="currentColor"
                className="select-none pointer-events-none"
                style={{
                  fontFamily: "'Great Vibes', 'Alex Brush', 'Brush Script MT', cursive",
                }}
              >
                Vani
              </text>

              {/* The elegant swooshes under Vani */}
              <path
                d="M 90,140 Q 180,110 320,115"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
                strokeDasharray="1 1"
              />
              <path
                d="M 80,152 Q 190,120 340,125"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                fill="none"
              />

              {/* Four-point stylish star on top right */}
              <g transform="translate(320, 50) scale(1.0)">
                {/* Glow */}
                <path
                  d="M 0,-18 Q 0,0 18,0 Q 0,0 0,18 Q 0,0 -18,0 Q 0,0 0,-18 Z"
                  fill="currentColor"
                  opacity="0.30"
                />
                {/* Core */}
                <path
                  d="M 0,-11 Q 0,0 11,0 Q 0,0 0,11 Q 0,0 -11,0 Q 0,0 0,-11 Z"
                  fill="currentColor"
                />
                <circle cx="0" cy="0" r="1.5" fill="white" />
              </g>

              {/* Center watermark gets the official authentication text for added realism! */}
              {pos.showText && (
                <>
                  <text
                    x="200"
                    y="185"
                    textAnchor="middle"
                    fontSize="9"
                    className="uppercase tracking-[0.35em] font-mono font-bold"
                    fill="currentColor"
                    opacity="0.8"
                  >
                    Official TA Verification
                  </text>
                  <text
                    x="200"
                    y="200"
                    textAnchor="middle"
                    fontSize="6.5"
                    className="uppercase tracking-[0.2em] font-sans font-semibold italic"
                    fill="currentColor"
                    opacity="0.6"
                  >
                    Security Branch • Indian Railways
                  </text>
                </>
              )}
            </svg>
          </div>
        ))}
      </div>
    );
  };

  // Shared Row Renderer
  const renderJourneyRow = (j: any, index: number, _pageStartIndex: number = 0) => {
    const pageRowIndex = Math.max(0, index - _pageStartIndex);
    const KMS_WATERMARK_CHARS = ['O', 'V', 'E', 'R', '-', '08', '-', 'K', 'm', 's'];
    const kmsWatermark = pageRowIndex < KMS_WATERMARK_CHARS.length ? KMS_WATERMARK_CHARS[pageRowIndex] : '';

    if (!j) {
      // Empty row filler
      return (
        <tr key={`empty-${index}`} className="h-[31px]">
          <td className="border-r border-black">&nbsp;</td>
          <td className="border-r border-black">&nbsp;</td>
          <td className="border-r border-black">&nbsp;</td>
          <td className="border-r border-black">&nbsp;</td>
          <td className="border-r border-black border-r-0">&nbsp;</td>
          <td className="border-r border-black">&nbsp;</td>
          <td className="border-r border-black text-center font-mono text-[11.5px] font-bold text-black select-none">
            {kmsWatermark || <>&nbsp;</>}
          </td>
          <td className="border-r border-black">&nbsp;</td>
          <td className="border-r border-black">&nbsp;</td>
          <td className="border-r border-black">&nbsp;</td>
          <td className="border-r border-black border-r-0">&nbsp;</td>
          <td className="border-black">&nbsp;</td>
        </tr>
      );
    }

    const displayDate = j.date ? (
      j.date === '--' ? '--' : (() => {
        const d = new Date(j.date);
        if (isNaN(d.getTime())) return j.date;
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        return `${dd}.${mm}.${yy}`;
      })()
    ) : '';

    const displayMode = j.mode === 'Train' ? (j.trainNo?.trim() ? j.trainNo.trim().toUpperCase() : 'BY TRAIN') : j.mode === 'Road' ? 'BY ROAD' : String(j.mode || '').toUpperCase();
    const timeLeft = j.timeLeft || (j.mode === 'Halted' ? 'Halt' : '--');
    const timeArrived = j.timeArrived || (j.mode === 'Halted' ? 'Halt' : '--');
    const fromStation = j.fromStation || '';
    const toStation = j.toStation || '';
    const kms = j.kms || '';
    
    let daysCount = 1;
    if (j.mode === 'Halted' && j.date && j.dateEnd && j.dateEnd >= j.date) {
      try {
        const d1 = new Date(j.date);
        const d2 = new Date(j.dateEnd);
        const diffTime = Math.abs(d2.getTime() - d1.getTime());
        const calculated = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
        if (!isNaN(calculated) && calculated > 0) {
          daysCount = calculated;
        }
      } catch {
        daysCount = 1;
      }
    }

    const customDaysNightText = customDaysNightMap[j.id] !== undefined ? customDaysNightMap[j.id] : j.customDaysNight;
    const slabPct = j.overrideSlab === 'Auto' ? j.autoSlab : (j.overrideSlab === 'Same Day (Nil)' ? 0 : (j.overrideSlab === 'Manual' ? ((j.dailyRate || baseRate) > 0 ? Math.round(((j.calculatedAmount || 0) / ((j.dailyRate || baseRate) * daysCount)) * 100) : 0) : Number(j.overrideSlab)));
    const daysStr = daysCount === 1 ? '01 Day' : `${String(daysCount).padStart(2, '0')} Days`;
    const computedDaysNightVal = slabPct > 0 ? `${daysStr}*${slabPct}%` : '';
    const daysNightVal = (customDaysNightText !== undefined && customDaysNightText.trim() !== '')
      ? customDaysNightText.trim()
      : computedDaysNightVal;
    
    const objectOfJourney = j.objectOfJourney || '';
    const rate = j.dailyRate || baseRate;
    const calculatedAmount = j.calculatedAmount || 0;

    const isSameDaySubsequent = false;

    const isHaltedMode = j.mode === 'Halted';
    const isContinuanceMode = j.mode === 'TA Journey continue from previous month' || j.mode === 'TA journey continue to next month';
    const isDoubleRow = !isHaltedMode && !isContinuanceMode && objectOfJourney.length > 80;

    return (
      <tr key={j.id} className={`text-[12px] font-mono h-[31px] ${isHaltedMode ? 'halted-row' : ''} ${isDoubleRow ? 'double-row' : ''}`}>
        <td className="border-r border-black text-center font-bold px-1">
          {prefill ? (
            isHaltedMode && j.dateEnd && j.dateEnd !== j.date ? (
              <div className="flex flex-col items-center justify-center leading-tight font-sans text-center py-0.5">
                <span className="text-[10.5px] font-bold text-black">
                  {(() => {
                    const d1 = new Date(j.date);
                    const dd1 = String(d1.getDate()).padStart(2, '0');
                    const mm1 = String(d1.getMonth() + 1).padStart(2, '0');
                    const yy1 = String(d1.getFullYear()).slice(-2);
                    return `${dd1}.${mm1}.${yy1}`;
                  })()}
                </span>
                <span className="text-[9px] font-black text-rose-800 uppercase leading-none my-0.5">to</span>
                <span className="text-[10.5px] font-bold text-black">
                  {(() => {
                    const d2 = new Date(j.dateEnd);
                    const dd2 = String(d2.getDate()).padStart(2, '0');
                    const mm2 = String(d2.getMonth() + 1).padStart(2, '0');
                    const yy2 = String(d2.getFullYear()).slice(-2);
                    return `${dd2}.${mm2}.${yy2}`;
                  })()}
                </span>
              </div>
            ) : (
              <span className="text-[11px] font-bold text-black font-sans leading-none tracking-tight whitespace-nowrap">
                {displayDate}
              </span>
            )
          ) : ''}
        </td>
        
        {isContinuanceMode ? (
          <td colSpan={11} className="text-center font-bold font-serif py-1 px-4 tracking-wide uppercase italic text-stone-800 text-[11px]">
            {prefill ? (j.mode === 'TA Journey continue from previous month' 
              ? '◀◀ TA JOURNEY CONTINUE FROM PREVIOUS MONTH / पिछली यात्रा जारी ▶▶' 
              : '◀◀ TA JOURNEY CONTINUE TO NEXT MONTH / यात्रा अगले महीने जारी रहेगी ▶▶') : ''}
          </td>
        ) : (
          <>
            <td className="border-r border-black text-center align-middle uppercase font-sans font-bold px-0.5 py-0.5 leading-tight" title={prefill ? (isHaltedMode ? 'HALTED' : displayMode) : ''}>
              {prefill ? (
                <span className={`inline-block text-center ${
                  displayMode.length > 10 ? 'text-[8.5px] tracking-tight' : (displayMode.length > 7 ? 'text-[9.5px]' : 'text-[10.5px]')
                }`}>
                  {isHaltedMode ? 'HALTED' : displayMode}
                </span>
              ) : ''}
            </td>
            
            {isHaltedMode ? (
              <>
                <td colSpan={4} className="border-r border-black text-center align-middle px-1 font-bold text-slate-800 tracking-wide uppercase text-[10.5px] leading-tight" title={prefill ? (j.trainNo || 'HALT AT OUTSTATION') : ''}>
                  {prefill ? (j.trainNo || 'HALT AT OUTSTATION') : ''}
                </td>
                <td className="border-r border-black text-center align-middle font-bold font-mono text-[11.5px] text-black whitespace-nowrap pr-0.5">
                  {kmsWatermark || (prefill ? (j.kms && j.kms > 0 ? j.kms : '--') : '')}
                </td>
              </>
            ) : (
              <>
                <td className="border-r border-black text-center align-middle font-bold text-[11px] whitespace-nowrap">{prefill ? timeLeft : ''}</td>
                <td className="border-r border-black text-center align-middle font-bold text-[11px] whitespace-nowrap">{prefill ? timeArrived : ''}</td>
                <td className="border-r border-black text-center align-middle px-0.5 py-0.5 uppercase font-sans font-bold leading-tight" title={fromStation}>
                  {prefill ? (
                    <span className={`inline-block text-center ${
                      fromStation.length > 10 ? 'text-[8.5px] tracking-tighter' : (fromStation.length > 7 ? 'text-[9.5px] tracking-tight' : 'text-[10.5px]')
                    }`}>
                      {fromStation}
                    </span>
                  ) : ''}
                </td>
                <td className="border-r border-black text-center align-middle px-0.5 py-0.5 uppercase font-sans font-bold leading-tight" title={toStation}>
                  {prefill ? (
                    <span className={`inline-block text-center ${
                      toStation.length > 10 ? 'text-[8.5px] tracking-tighter' : (toStation.length > 7 ? 'text-[9.5px] tracking-tight' : 'text-[10.5px]')
                    }`}>
                      {toStation}
                    </span>
                  ) : ''}
                </td>
                <td className="border-r border-black text-center align-middle font-bold font-mono text-[11.5px] text-black whitespace-nowrap pr-0.5">
                  {kmsWatermark || (prefill ? (j.kms && j.kms > 0 ? j.kms : '--') : '')}
                </td>
              </>
            )}
            <td className="border-r border-black text-center align-middle font-bold text-[11px] tracking-tight text-slate-800 whitespace-nowrap px-1">
              {prefill ? (
                editingDaysNightRowId === j.id ? (
                  <input
                    type="text"
                    autoFocus
                    className="w-full text-center font-bold text-[11px] bg-amber-100 border border-amber-500 rounded px-0.5 py-0 outline-none font-mono text-amber-950"
                    value={editingDaysNightText}
                    onChange={(e) => setEditingDaysNightText(e.target.value)}
                    onBlur={() => handleSaveInlineDaysNight(j.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveInlineDaysNight(j.id);
                      if (e.key === 'Escape') setEditingDaysNightRowId(null);
                    }}
                  />
                ) : (
                  <div
                    onClick={() => {
                      setEditingDaysNightRowId(j.id);
                      setEditingDaysNightText(daysNightVal || (calculatedAmount === 0 ? '--' : ''));
                    }}
                    className="inline-block px-1 py-0.5 rounded cursor-pointer hover:bg-amber-100/70 hover:text-amber-950 transition-colors group relative"
                    title="Click to manually edit Days/Night text using keyboard (कीबोर्ड से मैन्युअल टाइप करने के लिए क्लिक करें)"
                  >
                    <span>{isSameDaySubsequent || (calculatedAmount === 0 && (!customDaysNightText || customDaysNightText.trim() === '')) ? '--' : (daysNightVal || '--')}</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 text-[9px] text-amber-700">✏️</span>
                  </div>
                )
              ) : ''}
            </td>
            <td 
              className="border-r border-black text-center align-middle px-1.5 font-sans leading-tight text-[10.5px]"
              title={objectOfJourney}
            >
              {prefill ? (
                <div className="object-of-journey-inner text-center">
                  {objectOfJourney}
                </div>
              ) : ''}
            </td>
            <td className="border-r border-black text-center align-middle font-bold font-sans text-[11px] whitespace-nowrap">
              {prefill ? (isSameDaySubsequent || calculatedAmount === 0 ? '--' : rate) : ''}
            </td>
            <td className="border-r border-black text-right align-middle pr-2 font-bold font-sans text-[12px] text-indigo-950 whitespace-nowrap">
              {prefill ? (isSameDaySubsequent || calculatedAmount === 0 ? '--' : Math.floor(calculatedAmount)) : ''}
            </td>
            <td className="text-center align-middle text-[12px] text-slate-900 font-bold font-sans whitespace-nowrap">
              {prefill ? (isSameDaySubsequent || calculatedAmount === 0 ? '--' : Math.round((calculatedAmount - Math.floor(calculatedAmount)) * 100).toString().padStart(2, '0')) : ''}
            </td>
          </>
        )}
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* 2-Page Styling and Print Injection Block */}
      <style>{`
        @media print {
          /* Force page headers and default borders off */
          header, footer, nav, .no-print, button, .control-bar, .no-print-custom {
            display: none !important;
          }
          
          body, html {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            width: auto !important;
            height: auto !important;
            overflow: visible !important;
          }
          
          /* Strict Page Setup for 2 Sheets of A4 in Landscape */
          @page {
            size: A4 landscape;
            margin: 0 !important;
          }
          
          .print-page {
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            width: 297mm !important;
            height: 204mm !important; /* Fixed base landscape A4 height to prevent Chrome pagination splittings */
            max-width: 297mm !important;
            max-height: 204mm !important;
            padding-top: 5mm !important;
            padding-bottom: 5mm !important;
            padding-left: 5mm !important;
            padding-right: 5mm !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
            border: none !important;
            box-shadow: none !important;
            transform: scale(${printScale / 100});
            transform-origin: top left;
            overflow: hidden !important; /* Prevent spills completely */
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          
          .print-page:not(:last-child) {
            page-break-after: always !important;
            break-after: page !important;
          }
          
          .print-page:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          
          tr, td, th {
            border-color: #000000 !important;
          }

          /* Clear layout offsets from parent elements */
          .space-y-4, .space-y-6, .print-only, #root, main {
            margin: 0 !important;
            padding: 0 !important;
            gap: 0 !important;
          }

          /* Deactivate Tailwind's auto margin-top utilities for printing */
          .space-y-4 > :not([hidden]) ~ :not([hidden]) {
            --tw-space-y-reverse: 0 !important;
            margin-top: 0 !important;
            margin-bottom: 0 !important;
          }
          .space-y-6 > :not([hidden]) ~ :not([hidden]) {
            --tw-space-y-reverse: 0 !important;
            margin-top: 0 !important;
            margin-bottom: 0 !important;
          }
          .py-4 {
            padding-top: 0 !important;
            padding-bottom: 0 !important;
          }
          .min-h-screen {
            min-height: 0 !important;
          }
          .print-pages-container {
            width: 100% !important;
            max-width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            overflow: visible !important;
          }
          .print-pages-container-inner {
            min-width: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }

        /* Responsive Screen Emulator mimicking real A4 sheet sizes in Landscape orientation */
        .a4-screen-page {
          width: 297mm; /* Full standard A4 landscape width */
          height: 204mm; /* Adjusted container height to avoid page-break splits */
          padding: 5mm !important; /* Consistent 5mm margin on all sides */
          box-sizing: border-box;
          background: #ffffff;
          border: 1.5px solid #1e293b;
          margin: 1.5rem auto;
          box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          text-align: left;
        }

        .a4-screen-page.generating-pdf {
          width: 297mm !important;
          height: 210mm !important;
          max-width: 297mm !important;
          max-height: 210mm !important;
          min-width: 297mm !important;
          min-height: 210mm !important;
          padding: 5mm !important;
          box-sizing: border-box !important;
          background: #ffffff !important;
          border: none !important;
          box-shadow: none !important;
          margin: 0 !important;
          transform: none !important;
        }

        .generating-pdf .pdf-watermark-container,
        .generating-pdf .pdf-watermark-svg {
          opacity: 0.16 !important;
        }

        .generating-pdf .no-print,
        .generating-pdf button,
        .generating-pdf .control-bar {
          display: none !important;
        }

        .generating-pdf .vintage-table th,
        .generating-pdf .vintage-table td {
          border-color: #000000 !important;
        }

        /* High-fidelity custom watermark preservation rules */
        .pdf-watermark-container {
          display: block !important;
          visibility: visible !important;
          pointer-events: none !important;
        }
        .print-page .pdf-watermark-container *, .a4-screen-page .pdf-watermark-container * {
          color: #64748b !important; /* Normal elegant slate color for high-fidelity watermark look */
          fill: currentColor !important;
          border-color: transparent !important;
          background-color: transparent !important;
        }
        .pdf-watermark-svg {
          filter: none !important;
          opacity: 1 !important;
          display: block !important;
        }
        @media print {
          .pdf-watermark-container {
            opacity: 0.16 !important; /* Elegant visible subtle watermark on physical paper or printed PDF */
          }
          .pdf-watermark-svg {
            opacity: 0.16 !important; /* Extra guard for print rendering engines */
          }
        }

        /* Thin Vintage Table Styling */
        .vintage-table {
          table-layout: fixed !important;
          width: 100% !important;
          border-collapse: collapse !important;
        }

        .vintage-table th,
        .vintage-table th * {
          border-color: #000000;
          font-size: var(--page-font-size) !important;
          font-weight: 800 !important;
          color: #000000 !important;
        }

        .vintage-table th {
          border: 1px solid #000000;
          background-color: rgba(248, 250, 252, 0.45) !important;
          padding: var(--page-th-padding) !important;
        }

        .vintage-table td,
        .vintage-table td * {
          font-size: calc(var(--page-font-size) + 0.5px) !important; /* Slightly larger body text */
          font-weight: 700 !important; /* Bold weights for pristine print output */
          color: #000000 !important; /* Deep solid black */
        }

        .vintage-table tr.total-row td,
        .vintage-table tr.total-row td * {
          font-weight: 800 !important;
          background-color: rgba(241, 245, 249, 0.9) !important;
        }

        .vintage-table tbody tr.total-row {
          height: 38px !important;
        }

        .vintage-table tr.total-row td {
          line-height: 1.25 !important;
          padding-top: 3px !important;
          padding-bottom: 3px !important;
          vertical-align: middle !important;
          overflow: visible !important;
        }

        /* Explicit clean sizing for specific columns inside critical summary/total-rows */
        .vintage-table tr.total-row td[colspan="2"] {
          font-size: calc(var(--page-font-size) + 1.8px) !important;
          text-align: center !important;
          vertical-align: middle !important;
        }

        .vintage-table tr.total-row td[colspan="4"] {
          font-size: calc(var(--page-font-size) + 1.0px) !important;
          letter-spacing: -0.01em !important;
          text-align: center !important;
          vertical-align: middle !important;
        }

        /* 5th td is the Object of Journey column in total-row, handles the long text gracefully */
        .vintage-table tr.total-row td:nth-child(5) {
          font-size: calc(var(--page-font-size) + 0.8px) !important;
          letter-spacing: -0.01em !important;
          text-align: left !important;
          vertical-align: middle !important;
          padding-left: 6px !important;
          padding-right: 6px !important;
        }

        /* Kms, Rs, P numeric cells: kept clear and punchy */
        .vintage-table tr.total-row td:nth-child(3) {
          font-size: calc(var(--page-font-size) + 1.2px) !important;
          vertical-align: middle !important;
        }
        .vintage-table tr.total-row td:nth-child(7),
        .vintage-table tr.total-row td:nth-child(8) {
          font-size: calc(var(--page-font-size) + 2.5px) !important;
          vertical-align: middle !important;
        }

        .vintage-table th,
        .vintage-table td {
          vertical-align: middle !important;
          line-height: 1.25 !important;
          box-sizing: border-box !important;
        }

        .vintage-table th {
          text-align: center !important;
          vertical-align: middle !important;
        }

        .vintage-table td:not(.text-right):not(.text-left) {
          text-align: center !important;
          vertical-align: middle !important;
        }

        .vintage-table td.text-right {
          text-align: right !important;
          vertical-align: middle !important;
        }

        .vintage-table td.text-left {
          text-align: left !important;
          vertical-align: middle !important;
        }

        .vintage-table td {
          border: 1px solid #000000;
          padding: var(--page-td-padding) !important;
          vertical-align: middle !important;
          overflow: visible !important;
        }

        .vintage-table tbody tr {
          height: var(--page-row-height) !important;
        }

        .vintage-table tbody tr.halted-row {
          height: calc(var(--page-row-height) * 3) !important;
        }

        .vintage-table tbody tr.double-row {
          height: calc(var(--page-row-height) * 2) !important;
        }

        .vintage-table td .object-of-journey-inner {
          white-space: normal !important;
          word-break: break-word !important;
          overflow: visible !important;
          line-height: 1.25 !important;
          padding: 1px 3px !important;
          margin: 0 auto !important;
          display: block !important;
          vertical-align: middle !important;
          text-align: center !important;
          width: 100% !important;
        }

        .vintage-table thead tr.first-header-row {
          height: 28px !important;
        }

        .vintage-table thead tr.second-header-row {
          height: 20px !important;
        }

        .print-page, .a4-screen-page {
          font-family: ${journalFont === 'high-contrast-serif' ? "'Lora', 'Playfair Display', Georgia, Cambria, 'Times New Roman', serif" : "var(--font-sans)"} !important;
        }

        ${journalFont === 'high-contrast-serif' ? `
          .print-page *:not(.font-mono), .a4-screen-page *:not(.font-mono) {
            font-family: 'Lora', 'Playfair Display', Georgia, Cambria, 'Times New Roman', serif !important;
          }
        ` : ''}

        ${isBlackWhite ? `
          /* Black & White Ink Save mode overrides for both screen preview and printed document */
          @media print, screen {
            .print-page, .a4-screen-page {
              background-color: #ffffff !important;
              color: #000000 !important;
              border-color: #000005 !important;
            }
            .print-page *:not(.pdf-watermark-container):not(.pdf-watermark-container *), 
            .a4-screen-page *:not(.pdf-watermark-container):not(.pdf-watermark-container *) {
              background-color: transparent !important;
              color: #000000 !important;
              border-color: #000000 !important;
              text-shadow: none !important;
              box-shadow: none !important;
            }
            /* Render all text in pure, crisp solid black, excluding watermark */
            .print-page p:not(.pdf-watermark-container *), 
            .print-page span:not(.pdf-watermark-container *), 
            .print-page td:not(.pdf-watermark-container *), 
            .print-page th:not(.pdf-watermark-container *), 
            .print-page div:not(.pdf-watermark-container):not(.pdf-watermark-container *), 
            .print-page h1, .print-page h2, .print-page h3,
            .a4-screen-page p:not(.pdf-watermark-container *), 
            .a4-screen-page span:not(.pdf-watermark-container *), 
            .a4-screen-page td:not(.pdf-watermark-container *), 
            .a4-screen-page th:not(.pdf-watermark-container *), 
            .a4-screen-page div:not(.pdf-watermark-container):not(.pdf-watermark-container *), 
            .a4-screen-page h1, .a4-screen-page h2, .a4-screen-page h3 {
              color: #000000 !important;
            }
            /* Grayscale all images/SVGs like signatures and stamps to fit B&W printing, excluding watermarks */
            .print-page img:not(.pdf-watermark-logo), .a4-screen-page img:not(.pdf-watermark-logo),
            .print-page svg:not(.pdf-watermark-svg), .a4-screen-page svg:not(.pdf-watermark-svg) {
              filter: grayscale(100%) contrast(150%) brightness(100%) !important;
            }
            .print-page img.pdf-watermark-logo, .a4-screen-page img.pdf-watermark-logo {
              filter: grayscale(100%) brightness(105%) !important;
            }
            /* Excessively tone down non-watermark black svgs to save ink, keeping custom watermarks safe */
            .print-page svg.text-black:not(.pdf-watermark-svg), .a4-screen-page svg.text-black:not(.pdf-watermark-svg) {
              opacity: 0.005 !important;
            }
            /* Ensure table rows do not get colored background stripes */
            .print-page tr, .a4-screen-page tr {
              background-color: #ffffff !important;
            }
          }
        ` : ''}
      `}</style>
      
      {/* Printable Control bar (hidden during print) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print text-left">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 text-sm">Official A4 2-Page Landscape Print Layout</h3>
              <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold px-2 py-0.5 rounded-full font-mono">
                {profile.designation}
              </span>
            </div>
            <p className="text-slate-500 text-xs mt-0.5">
              Claimant: <strong className="text-slate-800">{profile.name}</strong> (PF: {profile.pfNumber} • HQ: {profile.headquarter})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Staff Profile Switcher if multiple profiles exist */}
          {profiles.length > 1 && (
            <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs">
              <span className="text-slate-600 font-semibold shrink-0">Staff Profile:</span>
              <select
                value={profile.id}
                onChange={(e) => setSelectedProfileOverrideId(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                title="Select officer profile to apply to this document"
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.designation} - PF {p.pfNumber})
                  </option>
                ))}
              </select>
            </div>
          )}


          {/* Prefill details toggle */}
          <button
            onClick={() => setPrefill(!prefill)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-semibold tracking-wide transition ${
              prefill 
                ? 'bg-emerald-600 border-emerald-600 text-white' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="Toggle between real data summary and an empty official document layout paper to fill by hand!"
          >
            {prefill ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {prefill ? 'Pre-filled Active' : 'Blank Document Mode'}
          </button>

          {/* Bilingual Toggle */}
          <button
            onClick={() => setBilingual(!bilingual)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-semibold tracking-wide transition ${
              bilingual 
                ? 'bg-slate-900 border-slate-900 text-white' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            {bilingual ? 'Bilingual labels active' : 'English Only'}
          </button>

          {/* Controlling Officer vs Head of Office Swap Toggle */}
          <button
            type="button"
            onClick={toggleOfficerOrder}
            className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-semibold tracking-wide transition cursor-pointer shadow-xs ${
              swapOfficerOrder
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-950 hover:bg-amber-500/20'
                : 'bg-indigo-50 border-indigo-200 text-indigo-950 hover:bg-indigo-100'
            }`}
            title="Click to toggle signature order between Controlling Officer and Head of Office"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span className="text-slate-650 font-normal">हस्ताक्षर क्रम:</span>
            <span className="font-extrabold px-1.5 py-0.5 rounded bg-white/90 border border-black/10 text-[11px] text-slate-900">
              {swapOfficerOrder ? '1. Controlling Officer → 2. Head of Office' : '1. Head of Office → 2. Controlling Officer'}
            </span>
          </button>

          {/* Export to CSV */}
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold tracking-wide transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Download Excel
          </button>

          {/* Add Digital Signature Trigger in toolbar */}
          <button
            onClick={() => {
              setShowSignModal(true);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-semibold tracking-wide transition ${
              signatureValue 
                ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800' 
                : 'bg-white border-slate-200 text-slate-750 hover:bg-slate-50'
            }`}
            title="Add cursive signature or draw hand signature to overlay on Page 2 claimants section"
          >
            <PenTool className={`w-3.5 h-3.5 ${signatureValue ? 'text-emerald-400' : 'text-indigo-600'}`} />
            {signatureValue ? 'Change Signature (हस्ताक्षर बदलें)' : 'Add Signature (हस्ताक्षर जोड़ें)'}
          </button>

          {/* Share via QR Code - For Peers and Supervisors */}
          <button
            onClick={handleShareQR}
            type="button"
            disabled={isGeneratingQR}
            className={`inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer ${
              isGeneratingQR ? 'opacity-70 cursor-not-allowed animate-pulse' : ''
            }`}
            title="Generate a dynamic shareable QR Code to easily share this TA journal with peers or supervisors via phone"
            id="share-via-qr-btn"
          >
            <QrCode className={`w-4 h-4 text-purple-100 ${isGeneratingQR ? 'animate-spin' : ''}`} />
            {isGeneratingQR ? 'Generating QR...' : 'Share via QR Code / क्यूआर कोड'}
          </button>

          {/* Share PDF on WhatsApp / Social Media - Exact 2-Page A4 Print Format */}
          <button
            onClick={handleSharePDF}
            disabled={isGeneratingPDF || isSharingPDF}
            className={`inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer ${
              isSharingPDF ? 'opacity-70 cursor-not-allowed animate-pulse' : ''
            }`}
            title="Share exact 2-page A4 PDF (Print Document format) on WhatsApp, Telegram, Gmail, or social media"
            id="share-pdf-toolbar-btn"
          >
            <Share2 className={`w-4 h-4 text-emerald-100 ${isSharingPDF ? 'animate-spin' : ''}`} />
            {isSharingPDF ? 'Preparing PDF...' : 'Share PDF / शेयर करें'}
          </button>

          {/* Download A4 PDF directly - High Visibility Custom Button */}
          <button
            onClick={handleDownloadPDF}
            disabled={isGeneratingPDF}
            className={`inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-md hover:shadow-lg transition-all ${
              isGeneratingPDF ? 'opacity-70 cursor-not-allowed animate-pulse' : ''
            }`}
            title="Download high-fidelity 2-page A4 landscape PDF document with watermarks and precise styling"
          >
            <FileDown className={`w-4 h-4 ${isGeneratingPDF ? 'animate-bounce' : ''}`} />
            {isGeneratingPDF ? 'Exporting PDF...' : 'Download PDF / पीडीएफ निर्यात करें'}
          </button>

          {/* Trigger browser print - Prominent Action Button */}
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
            title="Print Document / सीधे प्रिंट करें"
          >
            <Printer className="w-4 h-4 text-blue-100" />
            Print Document / प्रिंट करें
          </button>
        </div>
      </div>

      {/* Notice alert: shown only if print dialog is restricted or if an error occurs */}
      {printError && (
        <div id="iframe-print-warning" className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl shadow-xs text-left no-print flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5 text-xs text-amber-900 font-medium">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{printError}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={getPrintDirectUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#5a5a40] hover:bg-[#4a4a35] text-white rounded-lg text-xs font-bold transition shadow-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in New Tab
            </a>
            <button
              onClick={() => setPrintError(null)}
              className="text-xs px-2 py-1 bg-amber-200/70 hover:bg-amber-200 text-amber-900 rounded-lg font-semibold transition"
            >
              ✕ Dismiss
            </button>
          </div>
        </div>
      )}



      {/* Pages Container for Screen representation */}
      <div className="w-full overflow-x-auto pb-4 rounded-2xl border border-slate-100 bg-slate-50/40 p-4 print-pages-container">
        <div className="space-y-6 text-black min-w-[297mm] print-pages-container-inner">
        {pages.map((page, pIdx) => {
          const pageNum = pIdx + 1;
          const isFirst = page.isFirst;
          const isLast = page.isLast;
          const isMid = page.isMid;
          
          const cumulativeSums = getPageCumulativeSums(pIdx);
          const activeCount = page.journeys.length;
          const isCrowdedFinalPage = isLast && (activeCount > 6 || journal.journeys.length > 35);
          const hasSubsequentJourneys = pages.slice(pIdx + 1).some(p => p.journeys.length > 0);
          
          const activeVisualRowCount = page.journeys.reduce((sum: number, j: any) => sum + getJourneyHeightScore(j), 0);
          let emptyCount = 0;
          if (isFirst) {
            emptyCount = Math.max(0, 22 - activeVisualRowCount);
          } else if (isLast) {
            emptyCount = Math.max(0, 12 - activeVisualRowCount);
          } else {
            emptyCount = Math.max(0, 22 - activeVisualRowCount);
          }
          
          const pageTypeClass = isFirst 
            ? 'page-is-first' 
            : (isLast ? 'page-is-last' : 'page-is-mid');
          const totalPagesClass = totalPagesCount === 2 ? 'total-pages-2' : '';
          
          const totalScore = journal.journeys.reduce((sum: number, j: any) => sum + getJourneyHeightScore(j), 0);
          let computedRH = 22.0;
          let computedFS = 10.5;
          if (totalPagesCount === 2 && totalScore > 38) {
            computedRH = 19.5;
            computedFS = 9.5;
          } else if (totalPagesCount === 2 && totalScore > 34) {
            computedRH = 20.5;
            computedFS = 10.0;
          } else {
            computedRH = 22.0;
            computedFS = 10.5;
          }

          const thPadding = isFirst 
            ? '2px 4px' 
            : (isLast ? '2px 3px' : '2px 3.5px');
          const tdPadding = isFirst 
            ? '1.5px 3.5px' 
            : (isLast ? '1.5px 3px' : '1.5px 3.5px');

          const pageStyles = {
            '--page-row-height': `${computedRH}px`,
            '--page-font-size': `${computedFS}px`,
            '--page-th-padding': thPadding,
            '--page-td-padding': tdPadding,
          } as React.CSSProperties;

          return (
            <div 
              key={`page-${pageNum}`}
              id={`pdf-page-${pageNum}`} 
              className={`a4-screen-page print-page ${pageTypeClass} ${totalPagesClass} ${isGeneratingPDF ? 'generating-pdf' : ''}`}
              style={pageStyles}
            >
              <div className={`border-[1.5px] border-black ${isFirst ? 'pt-1.5 pb-2.5 px-3.5' : 'p-3.5'} flex-1 flex flex-col ${isLast ? 'justify-start' : 'justify-between'} relative overflow-hidden`}>
                {renderWatermark(pageNum.toString())}
                
                {/* --- PAGE HEADER --- */}
                {isFirst && (
                  <>
                    {/* Top Title Bar of Box */}
                    <div className="border-b border-black pb-1.5 flex items-center justify-between relative min-h-[38px]">
                      {/* Left Side: Logo and PF Number */}
                      <div className="flex items-center gap-3 min-w-[200px] justify-start">
                        <img
                          src="https://upload.wikimedia.org/wikipedia/commons/8/84/Logo_of_RPF.jpg"
                          alt="RPF Logo"
                          className="w-8 h-8 object-contain rounded-full shadow-xs border border-amber-500/20 bg-white"
                          style={{ mixBlendMode: 'multiply' }}
                          referrerPolicy="no-referrer"
                        />
                        <div className="text-left text-[13px] md:text-[14px] flex items-center gap-1">
                          <span className="font-extrabold bg-slate-100/90 px-1.5 py-0.5 rounded border border-slate-300 select-none text-stone-900 border-black/20">PF. No -</span>
                          <span className="underline font-black font-mono tracking-wider ml-1 text-sm md:text-base text-stone-950">{prefill ? profile.pfNumber : '_________________'}</span>
                        </div>
                      </div>

                      {/* Center Title */}
                      <div className="text-center flex-1 mx-4 flex flex-col items-center">
                        <div className="text-[10.5px] font-bold uppercase tracking-wider text-stone-800 leading-none mb-1">
                          {bilingual ? 'द. पू. रे. SER / पू. त. रे. ECoR / द. पू. म. रे. SECR' : 'SER / ECoR / SECR'}
                        </div>
                        <h1 className="text-[13px] md:text-[14px] font-black tracking-wide uppercase border-b border-black pb-0.5 inline-block leading-tight text-stone-900">
                          {bilingual ? 'TRAVELLING ALLOWANCE JOURNAL / यात्रा भत्ता रोजनामचा' : 'TRAVELLING ALLOWANCE JOURNAL'}
                        </h1>
                      </div>
                      
                      {/* Right Side: Official Journal Metadata */}
                      <div className="min-w-[220px] text-right text-[10px] leading-tight flex flex-col justify-center pr-2 text-stone-900">
                        <div className="whitespace-nowrap font-bold tracking-wider text-stone-950">
                          {bilingual ? 'जी.ए.-31 / GA-31' : 'GA-31'}
                        </div>
                        <div className="whitespace-nowrap font-semibold text-stone-800 font-sans">
                          {bilingual ? 'एस.आर.सी./जी 1677 / SRC/G 1677' : 'SRC/G 1677'}
                        </div>
                      </div>
                    </div>

                    {/* Official Bio Info Wrapper */}
                    <div className="border-b border-black py-1 text-[14px] leading-snug text-left text-black font-sans">
                      <p>
                        <span className="font-bold">Security</span> Branch, <span className="underline font-bold">{prefill ? (profile.division || 'CKP') : '______________'}</span> Division, Headquater at <span className="underline font-bold">{prefill ? (profile.headquarter || '_____________________') : '_____________________'}</span>, Journal of duties perfoumed by- <span className="underline font-bold text-slate-900">{prefill ? (profile.name || '____________________________________') : '____________________________________'}</span>, which allowance- <span className="underline font-bold">{prefill ? formatMonthClaimed(journal.monthClaimed) : '________________'}</span> is claimed <span className="font-bold">TA</span>, Designation- <span className="underline font-bold">{prefill ? (profile.designation || 'Constable') : '__________________'}</span>, Basic Pay- <span className="underline font-bold font-mono">{prefill ? `${(profile.basicPay || 21700).toLocaleString('en-IN')}/-` : '___________/-'}</span> Scale of pay- <span className="underline font-bold font-mono">{prefill ? (profile.scaleOfPay || '5,200-20,200') : '__________________'}</span>/- Date of appointment- <span className="underline font-bold font-mono">{prefill ? (profile.dateOfAppointment ? new Date(profile.dateOfAppointment).toLocaleDateString('en-GB').replace(/\//g, '.') : 'N/A') : '___________'}</span>, Rule by which groverned- <span className="underline font-bold">{prefill ? (profile.ruleGoverned || 'S. Rule') : '___________'}</span>{prefill && profile.billUnit ? <>, Bill Unit- <span className="underline font-bold font-mono">{profile.billUnit}</span></> : null}, G. Pay- <span className="underline font-bold font-mono">{prefill ? `${(profile.gradePay === 1998 || !profile.gradePay ? 2000 : profile.gradePay)}/-` : '___________/-'}</span>
                      </p>
                    </div>
                  </>
                )}

                {!isFirst && (
                  <div className="border-b border-black pb-2 flex items-center justify-between relative min-h-[40px]">
                    <div className="flex items-center gap-2">
                      <img
                        src="https://upload.wikimedia.org/wikipedia/commons/8/84/Logo_of_RPF.jpg"
                        alt="RPF Logo"
                        className="w-8 h-8 object-contain rounded-full bg-white border border-slate-300"
                        style={{ mixBlendMode: 'multiply' }}
                        referrerPolicy="no-referrer"
                      />
                      <span className="text-[11.5px] font-black uppercase text-stone-900">
                        {bilingual ? 'TA JOURNAL / यात्रा भत्ता रोजनामचा - CONTINUED' : 'TA JOURNAL - CONTINUED'}
                      </span>
                    </div>
                    <div className="text-[10px] font-bold text-stone-800 flex gap-4 mr-4">
                      <span>Name: <b className="underline mr-2">{profile.name}</b></span>
                      <span>HQ: <b className="underline mr-2">{profile.headquarter}</b></span>
                      <span>Month: <b className="underline">{formatMonthClaimed(journal.monthClaimed)}</b></span>
                    </div>
                    <div className="text-[12px] font-bold flex items-center gap-1">
                      <span className="bg-slate-100 border px-1.5 py-0.5 rounded font-extrabold select-none text-stone-900 border-black/20">PF. No -</span>
                      <span className="underline font-black font-mono ml-1 text-xs md:text-sm text-stone-950">{profile.pfNumber}</span>
                    </div>
                  </div>
                )}

                {/* --- TABLE CONTAINER & FINAL PAGE SUMMARY --- */}
                {!isLast ? (
                  /* Standard non-last pages have standard table taking up flex-1 and PTO footer */
                  <>
                    <div className={`flex-1 ${isFirst ? 'mt-1.5' : 'mt-2'} mb-5`}>
                      <table className="w-full text-center border-collapse vintage-table text-[11px]">
                        <thead>
                          {/* First Header Row */}
                          <tr className="first-header-row border-b border-black bg-slate-50/50 uppercase font-bold text-black text-[13px]">
                            <th className="p-1 text-center font-bold text-[13px]" style={{ width: '5.5%' }} rowSpan={2}>Date</th>
                            <th className="p-1 text-center font-bold text-[13px] leading-tight" style={{ width: '5.5%' }} rowSpan={2}>By Train<br/>/By Road</th>
                            <th className="p-1 text-center font-bold text-[13px] leading-tight" style={{ width: '4.5%' }} rowSpan={2}>Time<br/>Left</th>
                            <th className="p-1 text-center font-bold text-[13px] leading-tight" style={{ width: '4.5%' }} rowSpan={2}>Time<br/>Arrived</th>
                            <th className="p-0 font-bold border-b border-black" style={{ width: '12%' }} colSpan={2}>
                              <div className="h-[14px] flex items-center justify-center font-bold text-[13px] tracking-wide">
                                Station
                              </div>
                            </th>
                            <th className="p-0 text-center font-bold text-[13px] align-middle" style={{ width: '2.5%' }} rowSpan={2}>
                              <div className="flex items-center justify-center h-full w-full py-0.5">
                                <svg className="w-full h-11 overflow-visible select-none pointer-events-none" viewBox="0 0 20 44">
                                  <text
                                    x="10"
                                    y="22"
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    transform="rotate(-90 10 22)"
                                    fill="#000000"
                                    style={{ fontSize: '11.5px', fontWeight: 800, fontFamily: 'sans-serif' }}
                                  >
                                    Kms.
                                  </text>
                                </svg>
                              </div>
                            </th>
                            <th className="p-0.5 text-center font-bold text-[13px] leading-tight" style={{ width: '7.5%' }} rowSpan={2}>Days/<br/>Night</th>
                            <th className="p-1 text-center font-bold text-[13px]" style={{ width: '45%' }} rowSpan={2}>Object of journey</th>
                            <th className="p-0 text-center font-bold text-[13px] align-middle" style={{ width: '3%' }} rowSpan={2}>
                              <div className="flex items-center justify-center h-full w-full py-0.5">
                                <svg className="w-full h-11 overflow-visible select-none pointer-events-none" viewBox="0 0 20 44">
                                  <text
                                    x="10"
                                    y="22"
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    transform="rotate(-90 10 22)"
                                    fill="#000000"
                                    style={{ fontSize: '11.5px', fontWeight: 800, fontFamily: 'sans-serif' }}
                                  >
                                    Rate
                                  </text>
                                </svg>
                              </div>
                            </th>
                            <th className="p-1 text-center font-bold text-[13px]" style={{ width: '10%' }} colSpan={2}>Amount</th>
                          </tr>
                          {/* Second Header Row */}
                          <tr className="second-header-row border-b border-black bg-slate-50/50 text-[13px] uppercase font-bold text-black">
                            <th className="p-0.5 text-center font-extrabold w-[6%] border-r border-black text-[13px]">From</th>
                            <th className="p-0.5 text-center font-extrabold w-[6%] text-[13px]">To</th>
                            <th className="p-0.5 text-center font-bold w-[7.5%] border-r border-black text-[13px]">Rs.</th>
                            <th className="p-0.5 text-center font-bold w-[2.5%] text-[13px]">P.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Active Journeys for current Page */}
                          {page.journeys.map((j: any, relativeIdx: number) => 
                            renderJourneyRow(j, page.startIndex + relativeIdx, page.startIndex)
                          )}

                          {/* Subtotal or Grand total Row (rendered immediately after active journeys) */}
                          {/* Inline Carried Forward Subtotal Row for Non-Last Pages */}
                          <tr className="total-row border-y-[1.5px] border-black bg-slate-100/30 font-bold h-[34px] text-[13px] font-mono">
                            <td colSpan={6} className="border-r border-black text-center px-1 font-extrabold text-slate-950 tracking-wide uppercase text-[12.5px] !whitespace-normal">
                              {`CARRIED FORWARDED PAGE ${pageNum.toString().padStart(2, '0')} SUB TOTAL`}
                            </td>
                            <td className="border-r border-black text-center font-extrabold font-mono text-[12.5px] text-indigo-950">
                              {prefill ? (cumulativeSums.kmsSum || '--') : '--'}
                            </td>
                            <td className="border-r border-black text-center font-bold font-mono text-[11px] text-slate-500">
                              --
                            </td>
                            <td className="border-r border-black text-left px-2 font-sans leading-tight text-[11px] text-slate-700 font-semibold !whitespace-normal">
                              <div className="flex items-center justify-between w-full">
                                <span>Travelling Allowance Subtotal Carried Forward to Next Sheet</span>
                                <span className="font-extrabold font-mono text-[11px] text-black uppercase ml-2">TOTAL</span>
                              </div>
                            </td>
                            <td className="border-r border-black text-center font-bold font-mono text-[11px] text-slate-500">
                              --
                            </td>
                            <td className="border-r border-black text-right pr-2 font-extrabold font-sans text-[14px] text-indigo-950">
                              {prefill ? cumulativeSums.amountFloor : '--'}
                            </td>
                            <td className="text-center text-[14px] text-slate-900 font-bold font-sans">
                              {prefill ? cumulativeSums.amountPaise : '--'}
                            </td>
                          </tr>
                          
                          {/* Empty Spacer Rows calculated to fill out the remaining target list space */}
                          {Array.from({ length: emptyCount }).map((_, emptyIdx) => 
                            renderJourneyRow(null, page.startIndex + activeCount + emptyIdx, page.startIndex)
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Standard bottom PTO footer for non-last screens */}
                    <div className="absolute bottom-1.5 left-3.5 right-3.5 flex items-end justify-between text-[10.5px] pt-1.5 select-none bg-white">
                      <span className="italic text-slate-400 font-sans text-[9.5px]">RPF TA Companion compiler / Page {pageNum} of {totalPagesCount}</span>
                      <span className="font-extrabold text-xs tracking-widest font-mono text-black uppercase">P.T.O. / पृष्ठ उलटें</span>
                    </div>
                  </>
                ) : (
                  /* FINAL PAGE (isLast is true): Tightly coupled Table, Certificate, and Summary at the top, and signatures and note immediately following. No spacers or gaps, always fixed! */
                  <div className="flex flex-col flex-grow flex-1 w-full justify-start">
                    {/* Table Container */}
                    <div className={`${isFirst ? 'mt-1.5' : 'mt-2'}`}>
                      <table className="w-full text-center border-collapse vintage-table text-[11px]">
                        <thead>
                          {/* First Header Row */}
                          <tr className="first-header-row border-b border-black bg-slate-50/50 uppercase font-bold text-black text-[13px]">
                            <th className="p-1 text-center font-bold text-[13px]" style={{ width: '5.5%' }} rowSpan={2}>Date</th>
                            <th className="p-1 text-center font-bold text-[13px] leading-tight" style={{ width: '5.5%' }} rowSpan={2}>By Train<br/>/By Road</th>
                            <th className="p-1 text-center font-bold text-[13px] leading-tight" style={{ width: '4.5%' }} rowSpan={2}>Time<br/>Left</th>
                            <th className="p-1 text-center font-bold text-[13px] leading-tight" style={{ width: '4.5%' }} rowSpan={2}>Time<br/>Arrived</th>
                            <th className="p-0 font-bold border-b border-black" style={{ width: '12%' }} colSpan={2}>
                              <div className="h-[14px] flex items-center justify-center font-bold text-[13px] tracking-wide">
                                Station
                              </div>
                            </th>
                            <th className="p-0 text-center font-bold text-[13px] align-middle" style={{ width: '2.5%' }} rowSpan={2}>
                              <div className="flex items-center justify-center h-full w-full py-0.5">
                                <svg className="w-full h-11 overflow-visible select-none pointer-events-none" viewBox="0 0 20 44">
                                  <text
                                    x="10"
                                    y="22"
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    transform="rotate(-90 10 22)"
                                    fill="#000000"
                                    style={{ fontSize: '11.5px', fontWeight: 800, fontFamily: 'sans-serif' }}
                                  >
                                    Kms.
                                  </text>
                                </svg>
                              </div>
                            </th>
                            <th className="p-0.5 text-center font-bold text-[13px] leading-tight" style={{ width: '7.5%' }} rowSpan={2}>Days/<br/>Night</th>
                            <th className="p-1 text-center font-bold text-[13px]" style={{ width: '45%' }} rowSpan={2}>Object of journey</th>
                            <th className="p-0 text-center font-bold text-[13px] align-middle" style={{ width: '3%' }} rowSpan={2}>
                              <div className="flex items-center justify-center h-full w-full py-0.5">
                                <svg className="w-full h-11 overflow-visible select-none pointer-events-none" viewBox="0 0 20 44">
                                  <text
                                    x="10"
                                    y="22"
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    transform="rotate(-90 10 22)"
                                    fill="#000000"
                                    style={{ fontSize: '11.5px', fontWeight: 800, fontFamily: 'sans-serif' }}
                                  >
                                    Rate
                                  </text>
                                </svg>
                              </div>
                            </th>
                            <th className="p-1 text-center font-bold text-[13px]" style={{ width: '10%' }} colSpan={2}>Amount</th>
                          </tr>
                          {/* Second Header Row */}
                          <tr className="second-header-row border-b border-black bg-slate-50/50 text-[13px] uppercase font-bold text-black">
                            <th className="p-0.5 text-center font-extrabold w-[6%] border-r border-black text-[13px]">From</th>
                            <th className="p-0.5 text-center font-extrabold w-[6%] text-[13px]">To</th>
                            <th className="p-0.5 text-center font-bold w-[7.5%] border-r border-black text-[13px]">Rs.</th>
                            <th className="p-0.5 text-center font-bold w-[2.5%] text-[13px]">P.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Active Journeys for current Page */}
                          {page.journeys.map((j: any, relativeIdx: number) => 
                            renderJourneyRow(j, page.startIndex + relativeIdx, page.startIndex)
                          )}

                          {/* Inline Grand Total Row for the Last Page with Journey Data */}
                          <tr className="total-row border-y-[1.5px] border-black bg-slate-100/30 font-bold h-[34px] text-[13.5px] font-mono">
                            <td colSpan={3} className="border-r border-black text-center px-1 uppercase font-extrabold text-slate-950 text-[12.5px] leading-snug !whitespace-normal">
                              {pageNum === 1 ? 'TOTAL' : 'GRAND TOTAL'}
                            </td>
                            <td colSpan={3} className="border-r border-black text-center px-1 font-extrabold text-[#3a3a2a] tracking-wide uppercase text-[11px] !whitespace-normal">
                              {pageNum === 1 ? 'TOTAL / कुल योग' : 'कुल योग (INC. PREVIOUS SUB-TOTALS)'}
                            </td>
                            <td className="border-r border-black text-center font-extrabold font-mono text-[12.5px] text-indigo-950">
                              {prefill ? (cumulativeSums.kmsSum || '--') : '--'}
                            </td>
                            <td className="border-r border-black text-center font-bold font-mono text-[11px] text-slate-500">
                              --
                            </td>
                            <td className="border-r border-black text-left px-2 font-sans leading-tight text-[11px] text-slate-700 font-semibold !whitespace-normal">
                              <div className="flex items-center justify-between w-full">
                                <span>{pageNum === 1 ? 'Travelling Allowance Total' : 'Total Combined TA Claimed Across Pages'}</span>
                                <span className="font-extrabold font-mono text-[11px] text-black uppercase ml-2">TOTAL</span>
                              </div>
                            </td>
                            <td className="border-r border-black text-center font-bold font-mono text-[11px] text-slate-500">
                              --
                            </td>
                            <td className="border-r border-black text-right pr-2 font-extrabold font-sans text-[14px] text-indigo-950">
                              {prefill ? cumulativeSums.amountFloor : '--'}
                            </td>
                            <td className="text-center text-[14px] text-slate-900 font-bold font-sans">
                              {prefill ? cumulativeSums.amountPaise : '--'}
                            </td>
                          </tr>
                          
                          {/* Empty Spacer Rows calculated to fill out the remaining target list space */}
                          {Array.from({ length: emptyCount }).map((_, emptyIdx) => 
                            renderJourneyRow(null, page.startIndex + activeCount + emptyIdx, page.startIndex)
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Absence Certificate Text - tightly coupled under the Grand Total table row! */}
                    <div className={`${isCrowdedFinalPage ? 'py-0.5 mt-1 text-[8.5px] leading-snug' : 'py-1 mt-1.5 text-[10px] leading-normal'} text-left border-t border-black font-sans text-stone-900`}>
                      <p className="text-justify italic">
                        I hereby certify that the above mentioned Constable/Staff <strong>{prefill ? profile.name : '_______________________'}</strong> was absent from his/her headquarters station during the period for which traveling allowance is claimed in this bill on duty, and the concerned employee performed the journey by rail/road for the smooth execution of railway business and free pass or locomotion at government expense was {prefill && journal.freePassAllowed === 'Allowed' ? 'allowed' : 'not allowed'}.
                      </p>
                    </div>

                    {/* Grand Summary Row with left-side TA summary table and words on right - glued perfectly under certificate! */}
                    <div className="grid grid-cols-12 gap-2 pt-0.5 pb-0.5 mt-0.5 border-t border-black font-sans">
                      {/* Left Column: Traditional TA Summary Box matching Page 2 */}
                      <div className="col-span-5">
                        <table className="border border-black w-auto text-left text-[12px] font-sans">
                           <thead>
                            <tr className="border-b border-black font-extrabold bg-slate-100 text-[11px] h-[22px]">
                              <th className="py-1 px-2 uppercase leading-tight whitespace-nowrap">TA summary</th>
                              <th className="py-1 px-2 text-center w-12 border-l border-black leading-tight">Rs.</th>
                              <th className="py-1 px-2 text-center w-8 border-l border-black leading-tight">P.</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="text-[11.5px] border-b border-black h-[20px]">
                              <td className="py-0.5 px-2 font-mono leading-tight whitespace-nowrap">TA @ 100% (Rs. {baseRate.toFixed(2)}) x <b>{prefill ? pct100DaysCount : '--'}</b> days =</td>
                              <td className="py-0.5 px-2 text-right font-mono font-bold border-l border-black leading-tight w-12">{prefill ? totals100Amount : ''}</td>
                              <td className="py-0.5 px-2 text-center text-slate-700 font-mono border-l border-black leading-tight w-8">{prefill ? totals100PaiseStr : ''}</td>
                            </tr>
                            <tr className="text-[11.5px] border-b border-black h-[20px]">
                              <td className="py-0.5 px-2 font-mono leading-tight whitespace-nowrap">TA @ 70% (Rs. {(baseRate * 0.7).toFixed(2)}) x <b>{prefill ? pct70DaysCount : '--'}</b> days =</td>
                              <td className="py-0.5 px-2 text-right font-mono font-bold border-l border-black leading-tight w-12">{prefill ? totals70Amount : ''}</td>
                              <td className="py-0.5 px-2 text-center text-slate-700 font-mono border-l border-black leading-tight w-8">{prefill ? totals70PaiseStr : ''}</td>
                            </tr>
                            <tr className="text-[11.5px] border-b border-black h-[20px]">
                              <td className="py-0.5 px-2 font-mono leading-tight whitespace-nowrap">TA @ 30% (Rs. {(baseRate * 0.3).toFixed(2)}) x <b>{prefill ? pct30DaysCount : '--'}</b> days =</td>
                              <td className="py-0.5 px-2 text-right font-mono font-bold border-l border-black leading-tight w-12">{prefill ? totals30Amount : ''}</td>
                              <td className="py-0.5 px-2 text-center text-slate-700 font-mono border-l border-black leading-tight w-8">{prefill ? totals30PaiseStr : ''}</td>
                            </tr>
                            <tr className="font-black bg-slate-200/90 text-[12.5px] h-[26px] border-t-2 border-black">
                              <td className="py-1 px-2 font-mono uppercase tracking-tight text-black leading-tight whitespace-nowrap">
                                <div className="flex items-center justify-between w-full">
                                  <span className="text-[12px] font-bold">Total Days <b className="text-[13px]">{prefill ? (pct100DaysCount + pct70DaysCount + pct30DaysCount) : '--'}</b></span>
                                  <span className="text-[13px] font-black">Grand Total =</span>
                                </div>
                              </td>
                              <td className="py-1 px-2 text-right font-mono font-black border-l-2 border-black text-[15px] text-black leading-none w-12">{prefill ? totalsSumAmount : '0'}</td>
                              <td className="py-1 px-2 text-center border-l border-black font-mono font-black text-[13px] text-black leading-none w-8">{prefill ? totalsSumPaiseStr : '00'}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Right Column: Words text representation */}
                      <div className="col-span-7 flex flex-col justify-center text-left">
                        <div className="border border-black p-1 bg-slate-100/10 rounded-sm">
                          <span className="text-[7.5px] font-bold uppercase tracking-wide text-stone-700 block leading-tight">
                            Net TA Payable in words / शब्दों में कुल राशि :
                          </span>
                          <p className="bg-white px-2 py-1 border border-black/80 font-black text-[12px] min-h-[26px] text-zinc-950 mt-0.5 uppercase leading-snug flex items-center justify-center text-center">
                            {prefill ? numberToIndianWords(dynamicTotalAmount) : '_____________________________________________________ Rupees Only'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Dynamic flex spacer to push signatures down and leave stamp space in the middle */}
                    <div className="flex-grow min-h-[10px] print:min-h-[15px]" />

                    {/* Signatures Row */}
                    <div className="pt-3 pb-0.5 px-1 flex justify-between text-center font-bold text-[9.5px] text-black relative">
                      <div className="w-[18%] flex flex-col justify-end min-h-[44px]">
                        <div className="border-t border-black pt-1 uppercase tracking-tight">Countersigned</div>
                        <div className="text-[8px] font-mono mt-0.5 invisible select-none">&nbsp;</div>
                      </div>

                      {/* Floating quick toggle button right on the document between the two officer slots */}
                      <div className="no-print absolute -top-4 left-[38%] -translate-x-1/2 z-20">
                        <button
                          type="button"
                          onClick={toggleOfficerOrder}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-[8.5px] font-bold shadow-xs transition cursor-pointer whitespace-nowrap active:scale-95"
                          title="Click to toggle signature order between Controlling Officer and Head of Office"
                        >
                          <ArrowLeftRight className="w-2.5 h-2.5 text-amber-700" />
                          <span>क्रम: <b>{swapOfficerOrder ? 'Controlling Officer पहले' : 'Head of Office पहले'}</b> (क्लिक कर बदलें)</span>
                        </button>
                      </div>

                      <div className={`${swapOfficerOrder ? 'w-[22%]' : 'w-[18%]'} flex flex-col justify-end min-h-[44px] transition-all`}>
                        <div className="border-t border-black pt-1 uppercase tracking-tight">
                          {swapOfficerOrder ? 'Controlling Officer' : 'Head of Office'}
                        </div>
                        <div className="text-[8px] font-mono mt-0.5 invisible select-none">&nbsp;</div>
                      </div>
                      <div className={`${swapOfficerOrder ? 'w-[18%]' : 'w-[22%]'} flex flex-col justify-end min-h-[44px] transition-all`}>
                        <div className="border-t border-black pt-1 uppercase tracking-tight">
                          {swapOfficerOrder ? 'Head of Office' : 'Controlling Officer'}
                        </div>
                        <div className="text-[8px] font-mono mt-0.5 invisible select-none">&nbsp;</div>
                      </div>

                      <div className="w-[32%] text-indigo-950 font-extrabold relative flex flex-col justify-end min-h-[44px]">
                        {signatureValue && (
                          <div className="absolute left-1/2 -translate-x-1/2 bottom-[24px] h-10 flex items-center justify-center select-none pointer-events-none z-10">
                            {signatureType === 'draw' || signatureType === 'upload' ? (
                              <img 
                                src={signatureValue} 
                                alt="Signature" 
                                className="max-h-9 max-w-[140px] object-contain mix-blend-multiply" 
                              />
                            ) : (
                              <span 
                                className="italic text-[13px] tracking-wider text-indigo-900 font-bold select-none leading-none whitespace-nowrap"
                                style={{ fontFamily: "'Playfair Display', 'Georgia', 'Times New Roman', serif" }}
                              >
                                {signatureValue}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="border-t border-black pt-1 uppercase tracking-tight relative text-[9px] whitespace-nowrap">
                          {/* Clean floating direct action button (hidden in print) */}
                          <button
                            type="button"
                            onClick={() => setShowSignModal(true)}
                            className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] px-2 py-0.5 bg-slate-50 hover:bg-slate-100 text-indigo-700 hover:text-indigo-800 rounded-full border border-slate-300 shadow-xs no-print transition-all flex items-center gap-1 font-sans font-semibold tracking-wider whitespace-nowrap"
                          >
                            <PenTool className="w-2 h-2 text-indigo-600" />
                            {signatureValue ? 'CHANGE SIGN' : 'ADD SIGN'}
                          </button>
                          Signature of Officer/Staff claiming T.A.
                        </div>
                        <div className="text-[8px] font-mono mt-0.5 normal-case font-semibold truncate">({prefill ? profile.name : '_________________'})</div>
                      </div>
                    </div>

                    {/* Document Footnote separator line & notes */}
                    <div className={`border-t border-black ${isCrowdedFinalPage ? 'pt-1.5 text-[7.5px] leading-tight space-y-0.5' : 'pt-2 text-[8.5px] space-y-0.5'} select-none text-left text-zinc-650 font-sans font-medium`}>
                      <div>
                        <strong>Note:-</strong> 1. On TA bills on transfer from one Railway to another a certificate whether or not a free pass was allowed should be recorded.
                      </div>
                      <div>
                        2. Entries made by the claimant in Hindi/Regional language should be transliterated in English.
                      </div>
                    </div>
                  </div>
                )}
                
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {/* Signature Configuration Modal */}
      {showSignModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white rounded-2xl border border-slate-250 shadow-2xl max-w-lg w-full overflow-hidden animate-fade-in text-left">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Add Claimant Signature / हस्ताक्षर जोड़ें</h3>
                <p className="text-xs text-slate-500 mt-0.5">Choose how you want to sign the official TA document.</p>
              </div>
              <button
                onClick={() => setShowSignModal(false)}
                className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md font-semibold text-sm transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setSignatureType('type')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
                  signatureType === 'type'
                    ? 'border-indigo-600 text-indigo-700 bg-white'
                    : 'border-transparent text-slate-500 hover:bg-slate-100'
                }`}
              >
                📝 Type Name (लिखें)
              </button>
              <button
                type="button"
                onClick={() => setSignatureType('draw')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
                  signatureType === 'draw'
                    ? 'border-indigo-600 text-indigo-700 bg-white'
                    : 'border-transparent text-slate-500 hover:bg-slate-100'
                }`}
              >
                ✍️ Draw (बनाएं)
              </button>
              <button
                type="button"
                onClick={() => setSignatureType('upload')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
                  signatureType === 'upload'
                    ? 'border-indigo-600 text-indigo-700 bg-white'
                    : 'border-transparent text-slate-500 hover:bg-slate-100'
                }`}
              >
                📁 Upload (अपलोड)
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {signatureType === 'type' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 block">Enter Claimant Name / नाम दर्ज करें:</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-black font-semibold"
                      value={typedName}
                      onChange={(e) => setTypedName(e.target.value)}
                      placeholder="e.g. A. K. Mishra"
                    />
                  </div>
                  
                  {/* Digital Live Cursive Preview */}
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-slate-505 block">Cursive Style Preview / हस्ताक्षर प्रिव्यू:</span>
                    <div className="border border-slate-200 rounded-lg bg-indigo-50/20 p-6 flex items-center justify-center min-h-[100px] select-none">
                      {typedName.trim() ? (
                        <span 
                          className="italic text-2xl tracking-wider text-indigo-950 font-bold"
                          style={{ fontFamily: "'Playfair Display', 'Georgia', 'Times New Roman', serif" }}
                        >
                          {typedName}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Type above to see cursive mockup</span>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    {signatureValue && (
                      <button
                        type="button"
                        onClick={() => {
                          setSignatureValue('');
                          setShowSignModal(false);
                        }}
                        className="px-3 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove Sign
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!typedName.trim()}
                      onClick={() => {
                        setSignatureValue(typedName.trim());
                        setShowSignModal(false);
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
                    >
                      Use Typed Name
                    </button>
                  </div>
                </div>
              )}

              {signatureType === 'draw' && (
                <div className="space-y-4">
                  <SignaturePadComponent
                    onSave={(dataUrl) => {
                      setSignatureValue(dataUrl);
                    }}
                    onClear={() => {
                      setSignatureValue('');
                    }}
                  />
                  <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                    <div>
                      {signatureValue.startsWith('data:image') && (
                        <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 font-sans">
                          <Check className="w-3.5 h-3.5" /> Signature Recorded!
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {signatureValue && (
                        <button
                          type="button"
                          onClick={() => {
                            setSignatureValue('');
                            setShowSignModal(false);
                          }}
                          className="px-3 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold transition font-sans"
                        >
                          Clear &amp; Close
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!signatureValue.startsWith('data:image')}
                        onClick={() => {
                          setShowSignModal(false);
                        }}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition font-sans"
                      >
                        Apply Drawing
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {signatureType === 'upload' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700 block">Select Signature PNG/JPG file / हस्ताक्षर फ़ाइल चुनें:</label>
                    <div className="border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/50 rounded-xl p-6 text-center cursor-pointer transition relative">
                      <input
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              if (event.target?.result) {
                                setSignatureValue(event.target.result as string);
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      <PenTool className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <span className="text-xs font-bold text-slate-700 block">Click to Browse File / फ़ाइल चुनें</span>
                      <span className="text-[10px] text-slate-400 mt-1 block">Supports PNG, JPG with transparent or clean white background</span>
                    </div>
                  </div>

                  {signatureValue && signatureValue.startsWith('data:image') && (
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-slate-500 block">Uploaded Preview / अपलोड प्रिव्यू:</span>
                      <div className="border border-slate-200 rounded-lg bg-white p-4 flex items-center justify-center min-h-[90px]">
                        <img src={signatureValue} alt="Uploaded Sign" className="max-h-12 object-contain mix-blend-multiply" />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    {signatureValue && (
                      <button
                        type="button"
                        onClick={() => {
                          setSignatureValue('');
                          setShowSignModal(false);
                        }}
                        className="px-3 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold transition flex items-center gap-1.5 font-sans"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove Sign
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!signatureValue || !signatureValue.startsWith('data:image')}
                      onClick={() => setShowSignModal(false)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition font-sans"
                    >
                      Use Uploaded Image
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- Interactive QR Code Sharing Modal --- */}
      {showQRModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl relative animate-fade-in border border-slate-100 text-slate-800 space-y-4 text-center">
            {/* Modal Header */}
            <div className="flex flex-col items-center">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full mb-3 font-sans">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-950">Share TA Claim / यात्रा भत्ता साझा करें</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1 font-sans">
                Other officers can scan this QR code to instantly pull up and view this compiled record on their devices.
              </p>
            </div>

            {/* Claimant & Journal summary card */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-left space-y-1 font-sans text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">{profile.name}</span>
                <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">{profile.designation}</span>
              </div>
              <div className="text-slate-500 text-[11px] font-mono flex items-center justify-between">
                <span>PF: {profile.pfNumber}</span>
                <span>HQ: {profile.headquarter}</span>
              </div>
              <div className="text-slate-700 text-[11px] flex items-center justify-between pt-1 border-t border-slate-200/60 font-semibold">
                <span>Month: {formatMonthClaimed(journal.monthClaimed)}</span>
                <span className="text-emerald-700 font-bold font-mono">₹{journal.totalAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* QR Code Graphic Frame */}
            <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-2xl inline-block max-w-[200px] mx-auto shadow-2xs font-sans">
              {claimQrCodeUrl ? (
                <img 
                  src={claimQrCodeUrl} 
                  alt="Claim QR Code" 
                  className="w-40 h-40 object-contain block select-none"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-40 h-40 flex items-center justify-center">
                  <QrCode className="w-8 h-8 text-slate-400 animate-pulse" />
                </div>
              )}
            </div>

            {/* Direct WhatsApp Share Action */}
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                `*RPF Travelling Allowance Journal*\n👤 Officer: ${profile.name} (PF: ${profile.pfNumber})\n🎖️ Designation: ${profile.designation}, HQ: ${profile.headquarter}\n📅 Month: ${journal.monthClaimed}\n💰 Amount: ₹${journal.totalAmount.toLocaleString('en-IN')}\n\n🔗 Scan QR or click link to view journal:\n${window.location.origin}${window.location.pathname}?journalId=${journal.id}&ownerId=${journal.adminOwnerId || auth.currentUser?.uid || 'anon'}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-[#25D366] hover:bg-[#20ba5a] text-white font-bold py-2.5 px-3 rounded-xl text-xs shadow-xs transition tracking-wide flex items-center justify-center gap-2 cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              Share Link on WhatsApp / व्हाट्सएप पर साझा करें
            </a>

            {/* Copyable URL bar */}
            <div className="space-y-1.5 text-left font-sans">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide font-mono">Direct Share Link</label>
              <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200 font-mono">
                <input 
                  type="text" 
                  readOnly 
                  value={`${window.location.origin}${window.location.pathname}?journalId=${journal.id}&ownerId=${journal.adminOwnerId || auth.currentUser?.uid || 'anon'}`} 
                  className="bg-transparent border-none text-[11px] text-slate-700 font-mono font-medium focus:ring-0 flex-1 px-1 select-all select-text"
                />
                <button 
                  type="button" 
                  onClick={handleCopyShareLink}
                  className={`p-1.5 rounded-md transition duration-250 cursor-pointer ${
                    copySuccess 
                      ? 'bg-emerald-500 text-white' 
                      : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                  }`}
                  title="Copy link to clipboard"
                >
                  {copySuccess ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Actions Panel */}
            <div className="grid grid-cols-2 gap-2 pt-2 font-sans">
              <button 
                type="button" 
                onClick={() => setShowQRModal(false)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-xl text-xs transition tracking-wide cursor-pointer text-center border border-slate-200"
              >
                Close / बंद करें
              </button>
              <button 
                type="button" 
                onClick={handleDownloadClaimQR}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-xl text-xs shadow-sm transition tracking-wide flex items-center justify-center gap-1.5 cursor-pointer text-center"
              >
                <Download className="w-3.5 h-3.5" />
                Download PNG
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Social Media PDF Share Modal --- */}
      {showShareModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[160] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-fade-in border border-slate-100 text-slate-800 space-y-5 text-left font-sans">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    Share TA Journal PDF / सोशल मीडिया पर शेयर करें
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formatMonthClaimed(journal.monthClaimed)} • {profile.name} (PF: {profile.pfNumber})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                title="Close / बंद करें"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* PDF Ready Status Box */}
            <div className="bg-emerald-50/90 border border-emerald-200 p-3.5 rounded-xl space-y-1 text-left">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>100% ओरिजिनल प्रिंट फॉर्मेट PDF तैयार एवं सेव है!</span>
              </div>
              <p className="text-[11px] text-emerald-700 font-mono break-all pl-6">
                📄 {sharedFileName || `TA_Journal_${journal.monthClaimed}.pdf`}
              </p>
              <p className="text-[11px] text-emerald-900/80 leading-normal pl-6 pt-1">
                यह वही ओरिजिनल 2-पेज A4 PDF है जो "Print Document" वाले विकल्प में आती है। नीचे दिए गए किसी भी ऐप से सीधे शेयर करें।
              </p>
            </div>

            {/* Social Media Share Actions */}
            <div className="space-y-2.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Select App to Share / शेयर करने का माध्यम चुनें:
              </label>

              {/* WhatsApp */}
              <button
                type="button"
                onClick={() => {
                  const message = `*RPF Travelling Allowance Journal*\n👤 *Officer:* ${profile.name} (PF: ${profile.pfNumber})\n🎖️ *Designation:* ${profile.designation}, HQ: ${profile.headquarter}\n📅 *Claim Month:* ${journal.monthClaimed}\n💰 *Net Claim Amount:* ₹${journal.totalAmount.toLocaleString('en-IN')}\n\n✅ _The official 2-page A4 PDF journal has been saved to device. Please find the attached PDF document._`;
                  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
                  window.open(waUrl, '_blank');
                }}
                className="w-full flex items-center justify-between p-3 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-[0.98]"
              >
                <div className="flex items-center gap-2.5">
                  <MessageCircle className="w-4 h-4" />
                  <span>Share on WhatsApp / व्हाट्सएप पर भेजें</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </button>

              {/* Telegram */}
              <button
                type="button"
                onClick={() => {
                  const message = `*RPF Travelling Allowance Journal*\nOfficer: ${profile.name} (PF: ${profile.pfNumber})\nMonth: ${journal.monthClaimed}\nNet Claim: ₹${journal.totalAmount.toLocaleString('en-IN')}\nOfficial 2-Page A4 PDF journal generated.`;
                  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent(message)}`;
                  window.open(tgUrl, '_blank');
                }}
                className="w-full flex items-center justify-between p-3 bg-[#229ED9] hover:bg-[#1d8dc4] text-white rounded-xl font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-[0.98]"
              >
                <div className="flex items-center gap-2.5">
                  <Send className="w-4 h-4" />
                  <span>Share on Telegram / टेलीग्राम पर भेजें</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </button>

              {/* Email / Gmail */}
              <button
                type="button"
                onClick={() => {
                  const subject = `RPF TA Journal - ${journal.monthClaimed} - ${profile.name}`;
                  const body = `Dear Sir/Madam,\n\nPlease find the Travelling Allowance claim details for ${journal.monthClaimed}:\n\nOfficer Name: ${profile.name}\nPF Number: ${profile.pfNumber}\nDesignation: ${profile.designation}\nHeadquarter: ${profile.headquarter}, Division: ${profile.division}\nTotal Duty Days: ${journal.totalDays}\nTotal Amount Claimed: Rs. ${journal.totalAmount.toLocaleString('en-IN')}\n\nThe official 2-page A4 PDF journal file has been downloaded to device and is attached herewith.\n\nThank you.`;
                  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                }}
                className="w-full flex items-center justify-between p-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-[0.98]"
              >
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4" />
                  <span>Share via Email (Gmail) / ईमेल से भेजें</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </button>
            </div>

            {/* Re-Download and Copy actions */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
              <button
                type="button"
                onClick={handleDownloadPDF}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                title="Re-download PDF file to your phone or computer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Re-download PDF</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const summary = `RPF TA Journal - ${profile.name} (${profile.pfNumber}) | Month: ${journal.monthClaimed} | Amount: ₹${journal.totalAmount.toLocaleString('en-IN')}`;
                  navigator.clipboard.writeText(summary);
                  setShareCopied(true);
                  setTimeout(() => setShareCopied(false), 2000);
                }}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                title="Copy claim summary to clipboard"
              >
                {shareCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>Copy Summary</span>
                  </>
                )}
              </button>
            </div>

            {/* Helpful step guide in Hindi */}
            <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 text-left space-y-1">
              <h5 className="text-[11px] font-bold text-slate-700">सरल तरीका (PDF कैसे भेजें):</h5>
              <ol className="text-[11px] text-slate-600 list-decimal list-inside space-y-0.5 leading-relaxed">
                <li>ऊपर <strong>WhatsApp</strong> या <strong>Telegram</strong> बटन दबाएं।</li>
                <li>चैट खुलने पर <strong>Attach / पेपरक्लिप (📎)</strong> बटन दबाएं और <strong>Document (दस्तावेज़)</strong> चुनें।</li>
                <li>आपके <strong>Downloads</strong> फोल्डर में मौजूद यह PDF फाइल चुनकर सेंड कर दें।</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Print Options & Setup Helper Modal (प्रिंट विकल्प) */}
      {showPrintModal && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 no-print text-left animate-fade-in"
          onClick={() => setShowPrintModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden transform transition-all flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-800 px-6 py-4 text-white flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-xl backdrop-blur-xs">
                  <Printer className="w-5 h-5 text-blue-100" />
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight">Print Options / प्रिंट विकल्प</h3>
                  <p className="text-xs text-blue-100/90">
                    RPF Travelling Allowance Journal (A4 Landscape Official Layout)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
                title="Close / बंद करें"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              
              {/* Primary Actions Grid */}
              <div className="space-y-2.5">
                {/* 1. Direct Browser Print Button */}
                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.print();
                    } catch (err) {
                      console.warn("Direct window.print() failed:", err);
                    }
                  }}
                  className="w-full flex items-center justify-between p-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <Printer className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold flex items-center gap-2">
                        <span>सीधे प्रिंट करें (Direct Browser Print)</span>
                        <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono">Ctrl + P</span>
                      </div>
                      <div className="text-xs text-blue-100 font-normal">
                        ब्राउज़र का मूल प्रिंट डायलॉग खोलें
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 bg-white/20 rounded-md group-hover:bg-white/30 transition">
                    Print Now
                  </span>
                </button>

                {/* 2. Open Clean in New Tab to Print (Bypasses iframe sandbox) */}
                <a
                  href={getPrintDirectUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-between p-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-sm hover:shadow-md transition-all cursor-pointer group text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/10 rounded-lg text-emerald-400">
                      <ExternalLink className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold flex items-center gap-2 text-emerald-300">
                        <span>नए टैब में खोलकर तुरंत प्रिंट करें</span>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono">
                          Direct Tab
                        </span>
                      </div>
                      <div className="text-xs text-slate-300 font-normal">
                        फुल स्क्रीन नए टैब में खुलते ही स्वतः प्रिंट डायलॉग चालू हो जाएगा
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-white transition" />
                </a>

                {/* 3. Download Official High-Quality A4 PDF */}
                <button
                  type="button"
                  onClick={async () => {
                    await handleDownloadPDF();
                  }}
                  disabled={isGeneratingPDF}
                  className="w-full flex items-center justify-between p-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-sm hover:shadow-md transition-all cursor-pointer group disabled:opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <FileDown className={`w-5 h-5 text-white ${isGeneratingPDF ? 'animate-bounce' : ''}`} />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold">
                        {isGeneratingPDF ? 'Generating PDF...' : '2-पेज A4 PDF डाउनलोड करें (Official PDF)'}
                      </div>
                      <div className="text-xs text-indigo-100 font-normal">
                        हार्ड कॉपी या प्रिंट आउट निकालने के लिए सही A4 PDF फाइल
                      </div>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-indigo-200 group-hover:text-white transition" />
                </button>
              </div>

              {/* Print Scaling Controls */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-blue-600" />
                    प्रिंट स्केलिंग (Print Fit Scale): {printScale}%
                  </span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    (Standard A4: 98% - 100%)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {[95, 98, 100, 102].map(scale => (
                    <button
                      key={scale}
                      type="button"
                      onClick={() => setPrintScale(scale)}
                      className={`flex-1 py-1 text-xs font-semibold rounded-lg border transition ${
                        printScale === scale
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {scale}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Helpful Print Setting Guidelines */}
              <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl text-left space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                  <Info className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>सही 2-पेज प्रिंट के लिए प्रिंटर सेटिंग्स (Recommended Settings):</span>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-amber-950/85 pl-5">
                  <div>• <strong>Orientation:</strong> Landscape (आड़ा)</div>
                  <div>• <strong>Paper Size:</strong> A4</div>
                  <div>• <strong>Margins:</strong> None या Minimum</div>
                  <div>• <strong>Scale:</strong> 98% - 100% (Fit)</div>
                  <div className="col-span-2">• <strong>Background Graphics:</strong> अवश्य ON/Checked रखें</div>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                कुल प्रविष्टियाँ: {journal.journeys.length} | कुल पृष्ठ: {pages.length}
              </span>
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                बंद करें (Close)
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
