/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { OfficerProfile, TAJournal, JourneyRow, TARateRule } from '../types';
import QRCode from 'qrcode';
import { auth } from '../firebase';
import { 
  getSuggestedRate, 
  calculateAbsenceSlab, 
  recalculateJournalTotals, 
  numberToIndianWords,
  recalculateJourneysWithSameDayLogic
} from '../utils';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Save, 
  AlertCircle, 
  HelpCircle, 
  Undo, 
  Sparkles, 
  ArrowRight, 
  CalendarClock,
  Copy,
  Info,
  Printer,
  Cloud,
  X,
  Layers,
  QrCode,
  Share2,
  Check,
  Download,
  FileText,
  FileUp,
  Upload
} from 'lucide-react';
import PdfTaImportModal from './PdfTaImportModal';

const TimeDropdownPicker = ({ 
  value, 
  onChange 
}: { 
  value: string; 
  onChange: (val: string) => void; 
}) => {
  const [hh, mm] = value && value.includes(':') ? value.split(':') : ['', ''];
  
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  const handleHourChange = (newHour: string) => {
    if (!newHour) {
      onChange('');
      return;
    }
    const currentMin = mm || '00';
    onChange(`${newHour}:${currentMin}`);
  };

  const handleMinuteChange = (newMin: string) => {
    if (!newMin) {
      onChange('');
      return;
    }
    const currentHour = hh || '00';
    onChange(`${currentHour}:${newMin}`);
  };

  return (
    <div className="flex items-center gap-0.5 border border-slate-200 rounded px-1 py-0.5 bg-white shrink-0 shadow-sm">
      <select
        value={hh}
        onChange={(e) => handleHourChange(e.target.value)}
        className="bg-transparent border-none text-[11px] font-mono focus:outline-none cursor-pointer p-0 font-bold text-slate-800"
      >
        <option value="">HH</option>
        {hours.map(h => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-slate-400 font-mono text-[11px] font-extrabold select-none">:</span>
      <select
        value={mm}
        onChange={(e) => handleMinuteChange(e.target.value)}
        className="bg-transparent border-none text-[11px] font-mono focus:outline-none cursor-pointer p-0 font-bold text-slate-800"
      >
        <option value="">MM</option>
        {minutes.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
};

interface ClaimBuilderProps {
  profiles: OfficerProfile[];
  rateRules: TARateRule[];
  existingJournalId?: string; // If editing
  journals: TAJournal[];
  onSaveJournal: (journal: TAJournal) => void;
  onSaveAndPrint?: (journal: TAJournal) => void;
  onBack: () => void;
  currentUser?: any;
  activeUserProfile?: OfficerProfile | null;
}

export default function ClaimBuilder({
  profiles,
  rateRules,
  existingJournalId,
  journals,
  onSaveJournal,
  onSaveAndPrint,
  onBack,
  currentUser,
  activeUserProfile
}: ClaimBuilderProps) {
  // -----------------------------------------------------
  // 1. Initialize State
  // -----------------------------------------------------
  const [profileId, setProfileId] = useState('');
  const [monthClaimed, setMonthClaimed] = useState(() => {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    return `${today.getFullYear()}-${mm}`;
  });
  const [freePassAllowed, setFreePassAllowed] = useState<'Allowed' | 'Not Allowed' | 'None'>('Allowed');
  const [useHqSplitLogic, setUseHqSplitLogic] = useState<boolean>(false);
  const [taRateOption, setTaRateOption] = useState<string>('auto'); // 'auto', '625', '1000', '1250', 'custom'
  const [taRateCustomValue, setTaRateCustomValue] = useState<number>(625);
  const [journeys, setJourneys] = useState<JourneyRow[]>([]);
  const [activeJournalId] = useState<string>(() => existingJournalId || 'journal_' + Date.now() + '_' + Math.floor(Math.random() * 1000000));
  
  // --- Share via QR Code States ---
  const [showQRModal, setShowQRModal] = useState(false);
  const [claimQrCodeUrl, setClaimQrCodeUrl] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  
  // --- PDF Import Modal State ---
  const [showPdfModal, setShowPdfModal] = useState(false);

  const setJourneysAndRegroup = (newJourneys: JourneyRow[] | ((prev: JourneyRow[]) => JourneyRow[])) => {
    const activeProfile = profiles.find(p => p.id === profileId);
    const hq = activeProfile?.headquarter;
    if (typeof newJourneys === 'function') {
      setJourneys(prev => recalculateJourneysWithSameDayLogic(newJourneys(prev), useHqSplitLogic, hq));
    } else {
      setJourneys(recalculateJourneysWithSameDayLogic(newJourneys, useHqSplitLogic, hq));
    }
  };

  useEffect(() => {
    const activeProfile = profiles.find(p => p.id === profileId);
    const hq = activeProfile?.headquarter;
    setJourneys(prev => recalculateJourneysWithSameDayLogic(prev, useHqSplitLogic, hq));
  }, [useHqSplitLogic, profileId, profiles]);

  // --- A4 Landscape Print Optimization Mechanics ---
  const getJourneyHeightScore = (j: JourneyRow): number => {
    if (!j) return 1.0;
    if (j.mode === 'Halted') {
      return 3.0; // occupies exactly 3 normal entries space
    }
    if (j.objectOfJourney && j.objectOfJourney.length > 80) {
      return 2.0; // Non-halted row with >80 chars takes height of 2 normal entries
    }
    return 1.0;
  };

  const getCapacityScoreForPages = (p: number) => {
    if (p <= 1) return 22.0;
    if (p === 2) return 34.0;
    if (p === 3) return 56.0;
    return 78.0; // Max limit of 4 pages (22 + 22 + 22 + 12)
  };

  // Max Pages allowed: up to 3 A4 landscape pages (Page 1 = 22, Page 2 = 22, Page 3 = 12 with summary & signatures)
  const maxPagesLimit = 3;

  const MAX_CAPACITY_SCORE = 56.0; // 22 rows on first page, 22 on second page, 12 on third page
  const MAX_CAPACITY_ROWS = MAX_CAPACITY_SCORE; // since each normal entry is 1.0

  const currentCount = journeys.length;
  const currentScore = journeys.reduce((sum, j) => sum + getJourneyHeightScore(j), 0);
  const isLimitReached = currentScore >= MAX_CAPACITY_SCORE;

  const [isDraft, setIsDraft] = useState(true);
  const [allowanceType, setAllowanceType] = useState('TA');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // States for Halt Range generator
  const [showHaltRangeForm, setShowHaltRangeForm] = useState(false);
  const [haltStartDate, setHaltStartDate] = useState('');
  const [haltEndDate, setHaltEndDate] = useState('');
  const [haltStation, setHaltStation] = useState('');
  const [haltPurpose, setHaltPurpose] = useState('Halted on duty');

  // -----------------------------------------------------
  // 1b. Auto-save & Restore State Logic
  // -----------------------------------------------------
  const [autosaveToRestore, setAutosaveToRestore] = useState<any | null>(null);
  const [lastAutoSaved, setLastAutoSaved] = useState<string>('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Auto-dismiss toast notification after 4 seconds
  useEffect(() => {
    if (lastAutoSaved) {
      setShowToast(true);
      const timer = setTimeout(() => {
        setShowToast(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [lastAutoSaved]);

  const formattedAutosaveTime = autosaveToRestore?.timestamp
    ? new Date(autosaveToRestore.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const stateRef = React.useRef({
    profileId,
    monthClaimed,
    freePassAllowed,
    journeys,
    allowanceType,
    existingJournalId,
    useHqSplitLogic,
    taRateOption,
    taRateCustomValue
  });

  useEffect(() => {
    stateRef.current = {
      profileId,
      monthClaimed,
      freePassAllowed,
      journeys,
      allowanceType,
      existingJournalId,
      useHqSplitLogic,
      taRateOption,
      taRateCustomValue
    };
  }, [profileId, monthClaimed, freePassAllowed, journeys, allowanceType, existingJournalId, useHqSplitLogic, taRateOption, taRateCustomValue]);

  // Robust background auto-save synchronization directly with database (IndexedDB and Firestore)
  useEffect(() => {
    if (!profileId) return;
    // Do not save completely empty sheets
    if (journeys.length === 0) return;

    const timer = setTimeout(() => {
      const totalsVal = recalculateJournalTotals(journeys);
      const currProf = profiles.find(p => p.id === profileId);
      const resolvedOfficerName = currProf?.name || activeUserProfile?.name || '';
      const resolvedPfNumber = currProf?.pfNumber || activeUserProfile?.pfNumber || '';
      const resolvedOwnerId = (currentUser && currentUser.uid) || activeUserProfile?.id || currProf?.adminOwnerId || 'anon_user';
      const resolvedOwnerEmail = (currentUser && currentUser.email) || activeUserProfile?.email || activeUserProfile?.mobileNumber || currProf?.email || '';
      const resolvedAccountName = activeUserProfile?.name || (currentUser && currentUser.displayName) || resolvedOfficerName;

      const finalJournal: TAJournal = {
        id: activeJournalId,
        profileId,
        monthClaimed,
        journeys,
        isDraft,
        freePassAllowed,
        allowanceType,
        useHqSplitLogic,
        createdAt: existingJournalId ? (journals.find(j => j.id === existingJournalId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        percentage30Days: totalsVal.p30Days,
        percentage70Days: totalsVal.p70Days,
        percentage100Days: totalsVal.p100Days,
        totalDays: totalsVal.totalDays,
        totalAmount: totalsVal.totalAmount,
        officerName: resolvedOfficerName,
        pfNumber: resolvedPfNumber,
        adminOwnerId: resolvedOwnerId,
        adminOwnerEmail: resolvedOwnerEmail,
        accountHolderName: resolvedAccountName
      };

      // Perform silent sync
      onSaveJournal(finalJournal);
      
      const now = new Date();
      const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastAutoSaved(timeString);
    }, 2500);

    return () => clearTimeout(timer);
  }, [profileId, monthClaimed, journeys, freePassAllowed, allowanceType, useHqSplitLogic, isDraft, activeJournalId]);

  // Interval timer for 30s auto-save to prevent data loss
  useEffect(() => {
    const interval = setInterval(() => {
      const currentData = stateRef.current;
      // Only auto-save if we have selected an officer profile or have some journeys entered
      if (currentData.profileId || currentData.journeys.length > 0) {
        const payload = {
          existingJournalId: currentData.existingJournalId,
          profileId: currentData.profileId,
          monthClaimed: currentData.monthClaimed,
          freePassAllowed: currentData.freePassAllowed,
          allowanceType: currentData.allowanceType,
          journeys: currentData.journeys,
          useHqSplitLogic: currentData.useHqSplitLogic,
          taRateOption: currentData.taRateOption,
          taRateCustomValue: currentData.taRateCustomValue,
          timestamp: Date.now()
        };
        localStorage.setItem(`rpf_claim_autosave_${currentData.profileId || 'anon'}`, JSON.stringify(payload));
        
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastAutoSaved(timeString);
        setToastMessage(`Draft auto-saved successfully at ${timeString}`);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Check if there is an autosave available to restore on mount or profile change
  useEffect(() => {
    if (!profileId) return;
    const saved = localStorage.getItem(`rpf_claim_autosave_${profileId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && (parsed.profileId || (parsed.journeys && parsed.journeys.length > 0))) {
          // Double-check alignment: make sure autosave belongs to the current journal being edited
          if (parsed.existingJournalId === existingJournalId) {
            setAutosaveToRestore(parsed);
          }
        }
      } catch (e) {
        console.error('Error parsing autosave state:', e);
      }
    } else {
      setAutosaveToRestore(null);
    }
  }, [existingJournalId, profileId]);

  const handleRestoreAutosave = () => {
    if (autosaveToRestore) {
      if (autosaveToRestore.profileId) setProfileId(autosaveToRestore.profileId);
      if (autosaveToRestore.monthClaimed) setMonthClaimed(autosaveToRestore.monthClaimed);
      if (autosaveToRestore.freePassAllowed) setFreePassAllowed(autosaveToRestore.freePassAllowed);
      if (autosaveToRestore.allowanceType) setAllowanceType(autosaveToRestore.allowanceType);
      if (autosaveToRestore.useHqSplitLogic !== undefined) setUseHqSplitLogic(autosaveToRestore.useHqSplitLogic);
      if (autosaveToRestore.taRateOption) setTaRateOption(autosaveToRestore.taRateOption);
      if (autosaveToRestore.taRateCustomValue !== undefined) setTaRateCustomValue(autosaveToRestore.taRateCustomValue);
      if (autosaveToRestore.journeys) {
        setJourneysAndRegroup(autosaveToRestore.journeys);
      }
      setAutosaveToRestore(null);
    }
  };

  const handleDiscardAutosave = () => {
    if (profileId) {
      localStorage.removeItem(`rpf_claim_autosave_${profileId}`);
    }
    setAutosaveToRestore(null);
  };

  // -----------------------------------------------------
  // 2. Load existing claim if editing
  // -----------------------------------------------------
  useEffect(() => {
    if (existingJournalId) {
      const match = journals.find(j => j.id === existingJournalId);
      if (match) {
        setProfileId(match.profileId);
        setMonthClaimed(match.monthClaimed);
        setFreePassAllowed(match.freePassAllowed || 'Allowed');
        setUseHqSplitLogic(!!match.useHqSplitLogic);
        setJourneysAndRegroup(JSON.parse(JSON.stringify(match.journeys)));
        setIsDraft(match.isDraft);
        setAllowanceType(match.allowanceType || 'TA');

        // Match the TA daily rate option to display nicely in the form
        if (match.journeys && match.journeys.length > 0) {
          const firstRate = match.journeys[0].dailyRate;
          if (firstRate === 625) {
            setTaRateOption('625');
          } else if (firstRate === 1000) {
            setTaRateOption('1000');
          } else if (firstRate === 1250) {
            setTaRateOption('1250');
          } else {
            setTaRateOption('custom');
            setTaRateCustomValue(firstRate);
          }
        }
      }
    } else {
      // If creating new: default to activeUserProfile's profile if available, else first matching profile
      setProfileId(prev => {
        if (prev && profiles.some(p => p.id === prev)) {
          return prev;
        }
        if (activeUserProfile?.id && profiles.some(p => p.id === activeUserProfile.id)) {
          return activeUserProfile.id;
        }
        if (activeUserProfile?.pfNumber) {
          const matchByPf = profiles.find(p => p.pfNumber && p.pfNumber.trim() === activeUserProfile.pfNumber.trim());
          if (matchByPf) return matchByPf.id;
        }
        if (activeUserProfile?.name) {
          const matchByName = profiles.find(p => p.name && p.name.trim().toLowerCase() === activeUserProfile.name.trim().toLowerCase());
          if (matchByName) return matchByName.id;
        }
        return profiles.length > 0 ? profiles[0].id : '';
      });
    }
  }, [existingJournalId, journals, profiles, activeUserProfile]);

  // -----------------------------------------------------
  // 3. Auto-adjust rates if Selected Profile changes
  // -----------------------------------------------------
  useEffect(() => {
    if (!existingJournalId && profileId) {
      // Get selected officer
      const currentOfficer = profiles.find(p => p.id === profileId);
      if (currentOfficer) {
        const baseRate = getSuggestedRate(currentOfficer.basicPay, rateRules, currentOfficer.designation);
        
        let rateToUse = baseRate;
        if (taRateOption === '625') {
          rateToUse = 625;
        } else if (taRateOption === '1000') {
          rateToUse = 1000;
        } else if (taRateOption === '1250') {
          rateToUse = 1250;
        } else if (taRateOption === 'custom') {
          rateToUse = taRateCustomValue;
        }

        // If we have an empty journey list, we can prepopulating one row
        if (journeys.length === 0) {
          handleAddRow(rateToUse);
        } else {
          // Update existing journey rows rates with new base rate if appropriate
          setJourneysAndRegroup(prev => prev.map(row => ({
            ...row,
            dailyRate: rateToUse,
            calculatedAmount: computeCalculatedAmount(
              row.timeLeft,
              row.timeArrived,
              row.overrideSlab,
              rateToUse,
              row.autoSlab,
              row.mode,
              row.date,
              row.dateEnd,
              row.manualAmount
            )
          })));
        }
      }
    }
  }, [profileId, rateRules, taRateOption, taRateCustomValue]);

  // -----------------------------------------------------
  // 4. Computation helper for row amount
  // -----------------------------------------------------
  const computeCalculatedAmount = (
    start: string, 
    end: string, 
    override: string, 
    rate: number, 
    autoVal: number,
    mode?: string,
    dateFrom?: string,
    dateTo?: string,
    manualAmt?: number
  ): number => {
    if (mode === 'TA Journey continue from previous month' || mode === 'TA journey continue to next month') {
      return 0;
    }

    let daysCount = 1;
    if (mode === 'Halted' && dateFrom && dateTo && dateTo >= dateFrom) {
      try {
        const d1 = new Date(dateFrom);
        const d2 = new Date(dateTo);
        const diffTime = Math.abs(d2.getTime() - d1.getTime());
        const calculated = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
        if (!isNaN(calculated) && calculated > 0) {
          daysCount = calculated;
        }
      } catch {
        daysCount = 1;
      }
    }

    if (override === 'Manual') {
      return manualAmt !== undefined ? manualAmt : 0;
    }

    let activePercent = 100;
    if (override === 'Auto') {
      activePercent = autoVal;
    } else if (override === 'Same Day (Nil)') {
      activePercent = 0;
    } else {
      activePercent = Number(override);
    }

    return Number((rate * (activePercent / 100) * daysCount).toFixed(2));
  };

  // -----------------------------------------------------
  // 5. Actions: Add / Edit / Delete / Copy Row
  // -----------------------------------------------------
  const handleAddRow = (specifiedRate?: number) => {
    if (currentScore + 1.0 > MAX_CAPACITY_SCORE) {
      alert(`Maximum printable capacity (${MAX_CAPACITY_SCORE} normal entries equivalent across 3 A4 pages: Page 1=22, Page 2=22, Page 3=12) reached. (अधिकतम 3 पृष्ठों की सीमा पूर्ण - 56 प्रविष्टियाँ) Halted entries occupy 3 normal entries space.`);
      return;
    }

    // Determine rate to use
    let rateToUse = 625;
    const selectedOfficer = profiles.find(p => p.id === profileId);
    if (selectedOfficer) {
      rateToUse = getSuggestedRate(selectedOfficer.basicPay, rateRules, selectedOfficer.designation);
    }
    
    if (taRateOption === '625') {
      rateToUse = 625;
    } else if (taRateOption === '1000') {
      rateToUse = 1000;
    } else if (taRateOption === '1250') {
      rateToUse = 1250;
    } else if (taRateOption === 'custom') {
      rateToUse = taRateCustomValue;
    }

    if (specifiedRate !== undefined) rateToUse = specifiedRate;

    // Suggest a date: the day after the last entry, or first of the month
    let suggestedDate = '';
    if (journeys.length > 0) {
      const lastDate = journeys[journeys.length - 1].date;
      try {
        const d = new Date(lastDate);
        d.setDate(d.getDate() + 1);
        suggestedDate = d.toISOString().split('T')[0];
      } catch {
        suggestedDate = '';
      }
    } else if (monthClaimed) {
      suggestedDate = `${monthClaimed}-01`;
    }

    const newRow: JourneyRow = {
      id: 'row_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      date: suggestedDate,
      mode: 'Train',
      trainNo: '',
      timeLeft: '',
      timeArrived: '',
      fromStation: '',
      toStation: '',
      kms: 0,
      dayNight: 'Day',
      objectOfJourney: '',
      dailyRate: rateToUse,
      overrideSlab: 'Auto',
      autoSlab: 100, // Empty times default to full 100% slab
      calculatedAmount: Number((rateToUse).toFixed(2))
    };

    setJourneysAndRegroup([...journeys, newRow]);
  };

  const handleAddObjectOnlyRow = () => {
    const totalScore = journeys.reduce((sum, r) => sum + getJourneyHeightScore(r), 0);
    if (totalScore >= MAX_CAPACITY_SCORE) {
      alert(`Maximum printable capacity (${MAX_CAPACITY_SCORE} normal entries across 3 A4 pages: Page 1=22, Page 2=22, Page 3=12) has been reached. You cannot add more rows.`);
      return;
    }

    let rateToUse = 625;
    const selectedOfficer = profiles.find(p => p.id === profileId);
    if (selectedOfficer) {
      rateToUse = getSuggestedRate(selectedOfficer.basicPay, rateRules, selectedOfficer.designation);
    }
    let suggestedDate = '';
    if (journeys.length > 0) {
      const lastRow = journeys[journeys.length - 1];
      const lastDate = lastRow.dateEnd || lastRow.date;
      try {
        const d = new Date(lastDate);
        d.setDate(d.getDate() + 1);
        suggestedDate = d.toISOString().split('T')[0];
      } catch {
        suggestedDate = '';
      }
    } else if (monthClaimed) {
      suggestedDate = `${monthClaimed}-01`;
    }

    const newRow: JourneyRow = {
      id: 'row_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      date: '--',
      mode: 'Train',
      trainNo: '--',
      timeLeft: '',
      timeArrived: '',
      fromStation: '--',
      toStation: '--',
      kms: 0,
      dayNight: 'Day',
      objectOfJourney: '',
      dailyRate: rateToUse,
      overrideSlab: 'Same Day (Nil)',
      autoSlab: 0,
      calculatedAmount: 0
    };

    setJourneysAndRegroup([...journeys, newRow]);
  };

  const handleFillDashesRow = (rowId: string) => {
    setJourneysAndRegroup(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      return {
        ...row,
        date: '--',
        trainNo: '--',
        fromStation: '--',
        toStation: '--',
        timeLeft: '',
        timeArrived: '',
        overrideSlab: 'Same Day (Nil)',
        autoSlab: 0,
        calculatedAmount: 0
      };
    }));
  };

  const handleRowChange = (rowId: string, field: keyof JourneyRow, value: any) => {
    const proposedJourneys = journeys.map(row => {
      if (row.id !== rowId) return row;
      return { ...row, [field]: value };
    });

    const proposedScore = proposedJourneys.reduce((sum, r) => sum + getJourneyHeightScore(r), 0);
    if (proposedScore > MAX_CAPACITY_SCORE) {
      alert(`Cannot make this change. Converting this row to Halted would make the total space equivalent to ${proposedScore} rows, which exceeds the maximum capacity limit of 3 A4 pages (${MAX_CAPACITY_SCORE} normal entries equivalent: Page 1=22, Page 2=22, Page 3=12). Halted entries occupy 3 normal entries space.`);
      return;
    }

    setJourneysAndRegroup(prev => prev.map(row => {
      if (row.id !== rowId) return row;

      // Make a fresh copy
      const updatedRow = { ...row, [field]: value };

      // Set dateEnd same as date initially if we change to Halted and dateEnd is not set yet
      if (updatedRow.mode === 'Halted' && !updatedRow.dateEnd) {
        updatedRow.dateEnd = updatedRow.date;
      }

      // Reset values if mode changes away from Halted to standard travel modes
      if (field === 'mode') {
        const prevMode = row.mode;
        const newMode = value;
        if (newMode === 'TA Journey continue from previous month' || newMode === 'TA journey continue to next month') {
          updatedRow.date = '';
          updatedRow.trainNo = '';
          updatedRow.timeLeft = '';
          updatedRow.timeArrived = '';
          updatedRow.fromStation = '';
          updatedRow.toStation = '';
          updatedRow.objectOfJourney = '';
          updatedRow.overrideSlab = 'Auto';
          updatedRow.dateEnd = undefined;
        } else if (prevMode === 'Halted' && newMode !== 'Halted') {
          if (updatedRow.trainNo === 'HALTED ON DUTY AT BXF' || (updatedRow.trainNo && updatedRow.trainNo.toUpperCase().includes('HALT'))) {
            updatedRow.trainNo = '';
          }
          if (updatedRow.fromStation === 'HALT' || (updatedRow.fromStation && updatedRow.fromStation.toUpperCase().includes('HALT'))) {
            updatedRow.fromStation = '';
          }
          if (updatedRow.toStation === 'HALT' || (updatedRow.toStation && updatedRow.toStation.toUpperCase().includes('HALT'))) {
            updatedRow.toStation = '';
          }
          if (updatedRow.timeLeft === '' || updatedRow.timeLeft === '00:00' || !updatedRow.timeLeft) {
            updatedRow.timeLeft = '08:00';
          }
          if (updatedRow.timeArrived === '' || updatedRow.timeArrived === '00:00' || !updatedRow.timeArrived) {
            updatedRow.timeArrived = '18:00';
          }
          updatedRow.dateEnd = undefined;
        }
      }

      // Re-evaluate autoSlab if times alter
      if (field === 'timeLeft' || field === 'timeArrived' || field === 'mode') {
        if (updatedRow.mode === 'Halted') {
          updatedRow.autoSlab = 100;
        } else if (updatedRow.mode === 'TA Journey continue from previous month' || updatedRow.mode === 'TA journey continue to next month') {
          updatedRow.autoSlab = 0;
          updatedRow.calculatedAmount = 0;
        } else {
          const slab = calculateAbsenceSlab(updatedRow.timeLeft, updatedRow.timeArrived);
          updatedRow.autoSlab = slab;
        }
      }

      if (field === 'overrideSlab' && value === 'Manual') {
        if (updatedRow.manualAmount === undefined) {
          updatedRow.manualAmount = updatedRow.calculatedAmount || updatedRow.dailyRate || 625;
        }
      }

      if (field === 'manualAmount') {
        const amt = Number(value) || 0;
        updatedRow.manualAmount = amt;
        updatedRow.calculatedAmount = amt;
      }

      // Re-evaluate calculatedAmount if times, rate, or slab selection alters
      if (
        field === 'timeLeft' || 
        field === 'timeArrived' || 
        field === 'overrideSlab' || 
        field === 'manualAmount' ||
        field === 'dailyRate' ||
        field === 'mode' ||
        field === 'date' ||
        field === 'dateEnd'
      ) {
        updatedRow.calculatedAmount = computeCalculatedAmount(
          updatedRow.timeLeft,
          updatedRow.timeArrived,
          updatedRow.overrideSlab,
          updatedRow.dailyRate,
          updatedRow.autoSlab,
          updatedRow.mode,
          updatedRow.date,
          updatedRow.dateEnd,
          updatedRow.manualAmount
        );
      }

      return updatedRow;
    }));
  };

  const handleDeleteRow = (rowId: string) => {
    if (journeys.length === 1) {
      alert('Your TA Journal must contain at least 1 journey entry.');
      return;
    }
    setJourneysAndRegroup(prev => prev.filter(r => r.id !== rowId));
  };

  /**
   * Helper action to auto-fill From Station using To Station from previous row
   */
  const handleAutoFillFromStation = (idx: number) => {
    if (idx === 0) return;
    const prevToStation = journeys[idx - 1].toStation;
    if (prevToStation) {
      handleRowChange(journeys[idx].id, 'fromStation', prevToStation);
    }
  };

  /**
   * Copy/Clone an entire row inline with identical data (exact duplicate) and add it just below the selected row!
   */
  const handleDuplicateRow = (row: JourneyRow) => {
    const rowScore = getJourneyHeightScore(row);
    if (currentScore + rowScore > MAX_CAPACITY_SCORE) {
      alert(`Cannot copy. Adding this row (space/score: ${rowScore}) would exceed the maximum capacity limit of 3 A4 pages (${MAX_CAPACITY_SCORE} normal entries equivalent: Page 1=22, Page 2=22, Page 3=12). (अधिकतम 3 पृष्ठों की सीमा पूर्ण - 56 सामान्य प्रविष्टियाँ)`);
      return;
    }
    // Create an exact literal duplicate, preserving all fields (fromStation, toStation, timeLeft, etc.) completely.
    const cloned: JourneyRow = {
      ...JSON.parse(JSON.stringify(row)),
      id: 'row_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    };

    const index = journeys.findIndex(r => r.id === row.id);
    if (index === -1) {
      setJourneysAndRegroup([...journeys, cloned]);
    } else {
      const updated = [...journeys];
      updated.splice(index + 1, 0, cloned);
      setJourneysAndRegroup(updated);
    }
  };

  /**
   * Insert a new blank/semi-prefilled journey row directly underneath the clicked row
   */
  const handleAddRowBelow = (row: JourneyRow) => {
    if (currentScore + 1.0 > MAX_CAPACITY_SCORE) {
      alert(`Cannot insert row. Adding this entry would exceed the maximum capacity limit of 3 A4 pages (${MAX_CAPACITY_SCORE} normal entries equivalent: Page 1=22, Page 2=22, Page 3=12). (अधिकतम 3 पृष्ठों की सीमा पूर्ण - 56 सामान्य प्रविष्टियाँ)`);
      return;
    }
    let rateToUse = row.dailyRate || 500;
    const index = journeys.findIndex(r => r.id === row.id);
    if (index === -1) return;

    const newRow: JourneyRow = {
      id: 'row_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      date: row.date,
      mode: row.mode || 'Train',
      trainNo: row.trainNo || '',
      timeLeft: '',
      timeArrived: '',
      fromStation: row.toStation || '', // Smart transition: previous destination is the new start station
      toStation: '',
      kms: 0,
      dayNight: 'Day',
      objectOfJourney: '',
      dailyRate: rateToUse,
      overrideSlab: 'Auto',
      autoSlab: 100, // Empty times default to full 100% slab
      calculatedAmount: Number((rateToUse).toFixed(2))
    };

    const updated = [...journeys];
    updated.splice(index + 1, 0, newRow);
    setJourneysAndRegroup(updated);
  };

  // When showing the form, pre-fill start/end dates from the last row or claim month to save clicks!
  useEffect(() => {
    if (showHaltRangeForm) {
      if (journeys.length > 0) {
        const lastRow = journeys[journeys.length - 1];
        if (lastRow.date) {
          // Add 1 day to suggest halt start date
          try {
            const d = new Date(lastRow.date);
            d.setDate(d.getDate() + 1);
            const nextDayStr = d.toISOString().split('T')[0];
            setHaltStartDate(nextDayStr);
            setHaltEndDate(nextDayStr);
          } catch {
            setHaltStartDate(lastRow.date);
            setHaltEndDate(lastRow.date);
          }
        }
        if (lastRow.toStation) {
          setHaltStation(lastRow.toStation);
        }
      } else if (monthClaimed) {
        setHaltStartDate(`${monthClaimed}-01`);
        setHaltEndDate(`${monthClaimed}-10`);
      }
    }
  }, [showHaltRangeForm, journeys, monthClaimed]);

  /**
   * Generates a separate 'Halt' row for each date within [fromDate, toDate] inclusive
   */
  const handleGenerateHaltRows = (fromDate: string, toDate: string, station: string, purpose: string) => {
    if (!fromDate || !toDate || !station) {
      alert("Please enter Start Date, End Date, and Halt Station.");
      return;
    }
    const start = new Date(fromDate);
    const end = new Date(toDate);
    if (end < start) {
      alert("End Date cannot be before Start Date.");
      return;
    }

    const calculatedRowsCount = Math.floor(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const haltRowsScoreAdded = calculatedRowsCount * 3.0;
    if (currentScore + haltRowsScoreAdded > MAX_CAPACITY_SCORE) {
      alert(`Maximum 3-page limit exceeded. Generating ${calculatedRowsCount} Halt rows (equivalent to ${haltRowsScoreAdded} normal rows) would exceed the maximum 3-page capacity of ${MAX_CAPACITY_SCORE} normal rows.`);
      return;
    }

    // Determine basic pay / daily rate per day (same as what handleAddRow does for prefill)
    let rateToUse = 625;
    const selectedOfficer = profiles.find(p => p.id === profileId);
    if (selectedOfficer) {
      rateToUse = getSuggestedRate(selectedOfficer.basicPay, rateRules, selectedOfficer.designation);
    }

    if (taRateOption === '625') {
      rateToUse = 625;
    } else if (taRateOption === '1000') {
      rateToUse = 1000;
    } else if (taRateOption === '1250') {
      rateToUse = 1250;
    } else if (taRateOption === 'custom') {
      rateToUse = taRateCustomValue;
    }

    const generatedRows: JourneyRow[] = [];
    const loopDate = new Date(start);
    while (loopDate <= end) {
      const dateStr = loopDate.toISOString().split('T')[0];
      
      const newRow: JourneyRow = {
        id: 'row_halt_' + Date.now() + '_' + Math.floor(Math.random() * 10000) + '_' + loopDate.getDate(),
        date: dateStr,
        mode: 'Train',
        trainNo: 'HALT',
        timeLeft: '00:00', // start of day halt
        timeArrived: '00:00', // end of day halt
        fromStation: station.trim().toUpperCase(),
        toStation: station.trim().toUpperCase(),
        kms: 0,
        dayNight: 'Day',
        objectOfJourney: purpose || `Halted at ${station.trim().toUpperCase()}`,
        dailyRate: rateToUse,
        overrideSlab: 'Auto', // Since it is away from HQ (fromStation === station !== HQ), automatic slab will compute it as 100% slab!
        autoSlab: 100,
        calculatedAmount: rateToUse // 100% of daily rate
      };
      
      generatedRows.push(newRow);
      // increment loopDate safely
      loopDate.setDate(loopDate.getDate() + 1);
    }

    // Sort existing and new rows together by date and time
    const merged = [...journeys, ...generatedRows];
    merged.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return a.timeLeft.localeCompare(b.timeLeft);
    });

    setJourneysAndRegroup(merged);
    setShowHaltRangeForm(false);
    alert(`Successfully generated ${generatedRows.length} Halt rows from ${fromDate} to ${toDate}!`);
  };

  // -----------------------------------------------------
  // 6. Running totals summary calculation
  // -----------------------------------------------------
  const totals = recalculateJournalTotals(journeys);

  // -----------------------------------------------------
  // 7. Core Save and Validation
  // -----------------------------------------------------
  const validateForm = (): boolean => {
    const list: string[] = [];
    
    if (!profileId) {
      list.push('Please select a valid Officer/Staff Profile.');
    }
    if (!monthClaimed) {
      list.push('Please set the claiming Month.');
    }
    if (journeys.length === 0) {
      list.push('Please add at least 1 journey entry.');
    }

    journeys.forEach((j, idx) => {
      const rowNum = idx + 1;
      const isHalt = j.mode === 'Halted';
      const isContinuance = j.mode === 'TA Journey continue from previous month' || j.mode === 'TA journey continue to next month';

      if (!isContinuance && !j.date) {
        list.push(`Row #${rowNum}: Date is missing.`);
      }
      if (!isHalt && !isContinuance && !j.fromStation.trim()) {
        list.push(`Row #${rowNum}: From Station is empty.`);
      }
      if (!isHalt && !isContinuance && !j.toStation.trim()) {
        list.push(`Row #${rowNum}: To Station is empty.`);
      }
      if (j.mode === 'Train' && !j.trainNo?.trim()) {
        list.push(`Row #${rowNum}: Mode is Train, but Rail/Train No. is empty.`);
      }
      if (isHalt && !j.trainNo?.trim()) {
        list.push(`Row #${rowNum}: Halt Details of location/dates are empty.`);
      }
      if (!isContinuance && !j.objectOfJourney.trim()) {
        list.push(`Row #${rowNum}: Purpose/Object of journey is empty.`);
      } else if (!isHalt && !isContinuance && j.objectOfJourney.length > 160) {
        list.push(`Row #${rowNum}: Purpose/Object of journey is too long. Maximum 160 characters allowed (spans 2 rows height when >80 chars).`);
      } else if (isHalt && !isContinuance && j.objectOfJourney.length > 165) {
        list.push(`Row #${rowNum}: Purpose/Object of journey is too long. Maximum 165 characters allowed.`);
      }
    });

    setValidationErrors(list);
    return list.length === 0;
  };

  const handleSave = (submitAsDraft: boolean) => {
    setIsDraft(submitAsDraft);
    const isValid = validateForm();
    
    if (!submitAsDraft && !isValid) {
      // Show alerts on strict validation failure
      alert('Your TA Journal has incomplete fields. Please look at the error list shown above the save buttons!');
      return;
    }

    // Prepare complete payload
    const currProf = profiles.find(p => p.id === profileId);
    const resolvedOfficerName = currProf?.name || activeUserProfile?.name || '';
    const resolvedPfNumber = currProf?.pfNumber || activeUserProfile?.pfNumber || '';
    const resolvedOwnerId = (currentUser && currentUser.uid) || activeUserProfile?.id || currProf?.adminOwnerId || 'anon_user';
    const resolvedOwnerEmail = (currentUser && currentUser.email) || activeUserProfile?.email || activeUserProfile?.mobileNumber || currProf?.email || '';
    const resolvedAccountName = activeUserProfile?.name || (currentUser && currentUser.displayName) || resolvedOfficerName;

    const finalJournal: TAJournal = {
      id: activeJournalId,
      profileId,
      monthClaimed,
      journeys,
      isDraft: submitAsDraft,
      freePassAllowed,
      allowanceType,
      useHqSplitLogic,
      createdAt: existingJournalId ? (journals.find(j => j.id === existingJournalId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      percentage30Days: totals.p30Days,
      percentage70Days: totals.p70Days,
      percentage100Days: totals.p100Days,
      totalDays: totals.totalDays,
      totalAmount: totals.totalAmount,
      officerName: resolvedOfficerName,
      pfNumber: resolvedPfNumber,
      adminOwnerId: resolvedOwnerId,
      adminOwnerEmail: resolvedOwnerEmail,
      accountHolderName: resolvedAccountName
    };

    onSaveJournal(finalJournal);
    // Clear auto-saved draft from localStorage to prevent stale restore prompts
    if (profileId) {
      localStorage.removeItem(`rpf_claim_autosave_${profileId}`);
    }
    alert(submitAsDraft ? 'Draft saved successfully!' : 'TA Claim compiled and finalized successfully!');
    onBack();
  };

  const handleSaveAndPrintAction = () => {
    const isValid = validateForm();
    if (!isValid) {
      alert('Your TA Journal has incomplete fields. Please look at the error list shown above the save buttons!');
      return;
    }

    const currProf = profiles.find(p => p.id === profileId);
    const resolvedOfficerName = currProf?.name || activeUserProfile?.name || '';
    const resolvedPfNumber = currProf?.pfNumber || activeUserProfile?.pfNumber || '';
    const resolvedOwnerId = (currentUser && currentUser.uid) || activeUserProfile?.id || currProf?.adminOwnerId || 'anon_user';
    const resolvedOwnerEmail = (currentUser && currentUser.email) || activeUserProfile?.email || activeUserProfile?.mobileNumber || currProf?.email || '';
    const resolvedAccountName = activeUserProfile?.name || (currentUser && currentUser.displayName) || resolvedOfficerName;

    const finalJournal: TAJournal = {
      id: activeJournalId,
      profileId,
      monthClaimed,
      journeys,
      isDraft: false,
      freePassAllowed,
      allowanceType,
      useHqSplitLogic,
      createdAt: existingJournalId ? (journals.find(j => j.id === existingJournalId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      percentage30Days: totals.p30Days,
      percentage70Days: totals.p70Days,
      percentage100Days: totals.p100Days,
      totalDays: totals.totalDays,
      totalAmount: totals.totalAmount,
      officerName: resolvedOfficerName,
      pfNumber: resolvedPfNumber,
      adminOwnerId: resolvedOwnerId,
      adminOwnerEmail: resolvedOwnerEmail,
      accountHolderName: resolvedAccountName
    };

    // Clear auto-saved draft from localStorage to prevent stale restore prompts
    if (profileId) {
      localStorage.removeItem(`rpf_claim_autosave_${profileId}`);
    }

    if (onSaveAndPrint) {
      onSaveAndPrint(finalJournal);
    } else {
      onSaveJournal(finalJournal);
      onBack();
    }
  };

  const handleShareQR = async () => {
    // 1. Silent Save as draft to Firestore and Local IndexedDB so scanning works immediately!
    const currProf = profiles.find(p => p.id === profileId);
    const resolvedOfficerName = currProf?.name || activeUserProfile?.name || '';
    const resolvedPfNumber = currProf?.pfNumber || activeUserProfile?.pfNumber || '';
    const resolvedOwnerId = (currentUser && currentUser.uid) || activeUserProfile?.id || currProf?.adminOwnerId || 'anon_user';
    const resolvedOwnerEmail = (currentUser && currentUser.email) || activeUserProfile?.email || activeUserProfile?.mobileNumber || currProf?.email || '';
    const resolvedAccountName = activeUserProfile?.name || (currentUser && currentUser.displayName) || resolvedOfficerName;

    const finalJournal: TAJournal = {
      id: activeJournalId,
      profileId,
      monthClaimed,
      journeys,
      isDraft: true,
      allowanceType: allowanceType,
      freePassAllowed,
      useHqSplitLogic,
      createdAt: existingJournalId ? (journals.find(j => j.id === existingJournalId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      percentage30Days: totals.p30Days,
      percentage70Days: totals.p70Days,
      percentage100Days: totals.p100Days,
      totalDays: totals.totalDays,
      totalAmount: totals.totalAmount,
      officerName: resolvedOfficerName,
      pfNumber: resolvedPfNumber,
      adminOwnerId: resolvedOwnerId,
      adminOwnerEmail: resolvedOwnerEmail,
      accountHolderName: resolvedAccountName
    };

    onSaveJournal(finalJournal);
    // Clear auto-saved draft from localStorage to prevent stale restore prompts
    if (profileId) {
      localStorage.removeItem(`rpf_claim_autosave_${profileId}`);
    }

    // 2. Generate the QR Code containing the link
    try {
      const ownerId = auth.currentUser?.uid || 'anon';
      const shareUrl = `${window.location.origin}${window.location.pathname}?journalId=${activeJournalId}&ownerId=${ownerId}`;
      const url = await QRCode.toDataURL(shareUrl, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 350,
        color: {
          dark: '#1e1b4b', // Elegant deep indigo/navy
          light: '#ffffff'
        }
      });
      setClaimQrCodeUrl(url);
      setShowQRModal(true);
    } catch (err) {
      console.error('QR code generation failed:', err);
    }
  };

  const handleCopyShareLink = () => {
    const ownerId = auth.currentUser?.uid || 'anon';
    const shareUrl = `${window.location.origin}${window.location.pathname}?journalId=${activeJournalId}&ownerId=${ownerId}`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      })
      .catch(err => {
        console.error('Failed to copy share link:', err);
      });
  };

  const handleDownloadClaimQR = () => {
    if (!claimQrCodeUrl) return;
    const link = document.createElement('a');
    link.href = claimQrCodeUrl;
    link.download = `RPF_TA_Share_QR_${activeJournalId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const partitionJourneysIntoPages = () => {
    const scores = journeys.map(j => getJourneyHeightScore(j));
    const totalCount = journeys.length;
    const totalScore = scores.reduce((sum, s) => sum + s, 0);
    
    interface DynamicPage {
      pageIndex: number;
      startIndex: number;
      journeys: any[];
    }

    const pagesList: DynamicPage[] = [];

    // General Multi-page Dynamic Partitioning Strategy
    if (totalScore > 34.0) {
      // 3 or more pages are needed!
      // Page 1: exactly 22.0 capacity
      let p1Index = 0;
      let p1ScoreAccum = 0;
      while (p1Index < totalCount) {
        const s = scores[p1Index] || 1.0;
        if (p1ScoreAccum + s > 22.0) break;
        p1ScoreAccum += s;
        p1Index++;
      }
      if (p1Index === 0 && totalCount > 0) p1Index = 1;
      
      pagesList.push({
        pageIndex: 0,
        startIndex: 0,
        journeys: journeys.slice(0, p1Index),
      });

      let currentOffset = p1Index;

      while (true) {
        const remainingScores = scores.slice(currentOffset);
        const remainingSum = remainingScores.reduce((sum, s) => sum + s, 0);

        if (currentOffset >= totalCount) {
          pagesList.push({
            pageIndex: pagesList.length,
            startIndex: currentOffset,
            journeys: [],
          });
          break;
        }

        // Can remaining items fit on the last page? Last page capacity is 12.0
        const lastPageCap = 12.0;
        if (remainingSum <= lastPageCap) {
          pagesList.push({
            pageIndex: pagesList.length,
            startIndex: currentOffset,
            journeys: journeys.slice(currentOffset),
          });
          break;
        }

        // Cannot fit on last page. MUST create a middle page with capacity up to 22.0
        // When remaining items span across middle page and last page, reserve entries for last page (up to 12.0)
        // so that Page 3 always receives journey entries and Page 2 can hold up to 22 entries matching Page 1
        const targetLastScore = remainingSum > 22.0 
          ? Math.min(12.0, remainingSum - 22.0) 
          : Math.min(12.0, Math.max(1.0, remainingSum - 12.0));
        const targetMidCapacity = Math.min(22.0, Math.max(1.0, remainingSum - targetLastScore));

        let midScoreAccum = 0;
        let midIndex = currentOffset;
        while (midIndex < totalCount) {
          const s = scores[midIndex] || 1.0;
          if (midScoreAccum + s > targetMidCapacity && midIndex > currentOffset) {
            break;
          }
          midScoreAccum += s;
          midIndex++;
        }

        // Guarantee forward progress by forcing at least 1 journey
        if (midIndex === currentOffset) {
          midIndex++;
        }

        pagesList.push({
          pageIndex: pagesList.length,
          startIndex: currentOffset,
          journeys: journeys.slice(currentOffset, midIndex),
        });
        currentOffset = midIndex;
      }

      return pagesList;
    }

    // Standard 1 or 2 page partitioning logic when totalScore <= 34.0:
    // Always pack Page 1 (up to 22.0 capacity)
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

    if (p1Index === 0 && totalCount > 0) {
      p1Index = 1;
    }

    pagesList.push({
      pageIndex: 0,
      startIndex: 0,
      journeys: journeys.slice(0, p1Index),
    });

    let currentOffset = p1Index;

    // Remaining scores for page 2 (as last page)
    // We ALWAYS want a second page for standard journals to hold the official declaration, signatures and summary on Page 2!
    // So even if currentOffset >= totalCount, we still push Page 2 (as an empty or partially prefilled sheet) to remain double-sided/2-page compliant!
    pagesList.push({
      pageIndex: 1,
      startIndex: currentOffset,
      journeys: journeys.slice(currentOffset),
    });

    return pagesList;
  };

  const getEstimatedPagesCount = () => {
    if (journeys.length === 0) return 0;
    return partitionJourneysIntoPages().length;
  };

  // Helpers to calculate visual page boundaries for the edit table
  const getPageBreakPositions = () => {
    const breaks: { [key: number]: number } = {};
    const pages = partitionJourneysIntoPages();
    pages.forEach((p, idx) => {
      if (idx > 0 && p.startIndex < journeys.length) {
        breaks[p.startIndex] = idx + 1;
      }
    });
    return breaks;
  };

  // Check if we have entries overflowing to Page 3 or above
  const hasEntriesOnPage3 = getEstimatedPagesCount() >= 3;

  return (
    <div className="space-y-6 animate-fade-in text-left">
      
      {/* Header element */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {existingJournalId ? 'Modify TA Journal Entry' : 'Prepare Travelling Allowance Journal'}
            </h1>
            <p className="text-slate-500 text-xs mt-0.5">Auto-compiles rates and duration thresholds automatically</p>
          </div>
        </div>

        {/* Quiet professional server/draft sync status */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-600 text-xs rounded-lg border border-slate-200 self-start sm:self-center font-medium shadow-3xs">
          <Cloud className="w-3.5 h-3.5 text-slate-400" />
          <span>Draft Secure</span>
          {lastAutoSaved ? (
            <span className="text-[10px] text-slate-400 font-mono ml-1 font-sans">(Synced {lastAutoSaved})</span>
          ) : (
            <span className="text-[10px] text-slate-400 font-mono ml-1 font-sans">(Idle)</span>
          )}
        </div>
      </div>

      {/* Recover Autosave Prompt Banner */}
      {autosaveToRestore && (
        <div className="p-4 bg-indigo-50 border border-indigo-150 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-250">
          <div className="flex items-start gap-2.5 text-indigo-900">
            <Sparkles className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">Unsaved draft detected / ड्राफ्ट मिला</p>
              <p className="text-indigo-700 text-xs mt-0.5">We found an auto-saved draft of journey entries from {formattedAutosaveTime}. Would you like to recover it?</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={handleDiscardAutosave}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-rose-600 font-semibold hover:bg-rose-50 rounded-lg transition"
            >
              Discard / हटाएं
            </button>
            <button
              onClick={handleRestoreAutosave}
              className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm transition"
            >
              Restore / पुनर्प्राप्त करें
            </button>
          </div>
        </div>
      )}

      {/* Main Form Fields Container */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 animate-in fade-in duration-300">
        
        {/* Officer Select */}
        <div>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Select Officer / Staff Claiming *
            </label>
            {(activeUserProfile?.name || currentUser?.displayName) && (
              <span className="text-[9.5px] font-bold text-indigo-750 bg-indigo-50/90 px-1.5 py-0.5 rounded border border-indigo-200" title="Active login account submitting this claim">
                👤 खाता: {activeUserProfile?.name || currentUser?.displayName}
              </span>
            )}
          </div>
          <select
            className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition h-10"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
          >
            <option value="" disabled>-- Choose RPF Personnel --</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.designation} - PF {p.pfNumber})</option>
            ))}
          </select>
          {profiles.length === 0 && (
            <p className="text-[11px] text-rose-500 font-medium mt-1">No profiles defined. Please register a staff member profile first.</p>
          )}
        </div>
        
        {/* Claim Month */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Claiming Month *
          </label>
          <input
            type="month"
            className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition font-mono h-10"
            value={monthClaimed}
            onChange={(e) => setMonthClaimed(e.target.value)}
          />
        </div>

        {/* TA Daily Rate Selection right after Month Selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-550 uppercase tracking-wider mb-2 text-indigo-950 font-bold">
            TA Rate / टीए दर *
          </label>
          <div className="space-y-1.5">
            <select
              className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition h-10 font-bold text-indigo-750"
              value={taRateOption}
              onChange={(e) => {
                const opt = e.target.value;
                setTaRateOption(opt);
                
                let valToApply = 625;
                if (opt === 'auto') {
                  const currentOfficer = profiles.find(p => p.id === profileId);
                  if (currentOfficer) {
                    valToApply = getSuggestedRate(currentOfficer.basicPay, rateRules, currentOfficer.designation);
                  }
                } else if (opt === '625') {
                  valToApply = 625;
                } else if (opt === '1000') {
                  valToApply = 1000;
                } else if (opt === '1250') {
                  valToApply = 1250;
                } else if (opt === 'custom') {
                  valToApply = taRateCustomValue;
                }

                setJourneysAndRegroup(prev => prev.map(row => ({
                  ...row,
                  dailyRate: valToApply,
                  calculatedAmount: computeCalculatedAmount(
                    row.timeLeft,
                    row.timeArrived,
                    row.overrideSlab,
                    valToApply,
                    row.autoSlab,
                    row.mode,
                    row.date,
                    row.dateEnd,
                    row.manualAmount
                  )
                })));
              }}
            >
              <option value="auto">Auto Suggested / स्वचालित</option>
              <option value="625">₹625 (Constable, HC)</option>
              <option value="1000">₹1000 (SI, Inspector)</option>
              <option value="1250">₹1250 (IPF & more)</option>
              <option value="custom">Other Rate / अन्य दर ...</option>
            </select>
            {taRateOption === 'custom' && (
              <div className="relative animate-in zoom-in-95 duration-150">
                <span className="absolute left-3 top-2 text-xs font-bold text-indigo-400">₹</span>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  className="block w-full pl-6 pr-2 py-1 border border-indigo-200 rounded-lg text-xs bg-indigo-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition h-8 font-extrabold text-indigo-900"
                  value={taRateCustomValue}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    setTaRateCustomValue(val);
                    
                    setJourneysAndRegroup(prev => prev.map(row => ({
                      ...row,
                      dailyRate: val,
                      calculatedAmount: computeCalculatedAmount(
                        row.timeLeft,
                        row.timeArrived,
                        row.overrideSlab,
                        val,
                        row.autoSlab,
                        row.mode,
                        row.date,
                        row.dateEnd,
                        row.manualAmount
                      )
                    })));
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Free Pass Allowance */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Free Pass / Locomotion Allowed?
          </label>
          <select
            className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition h-10"
            value={freePassAllowed}
            onChange={(e) => setFreePassAllowed(e.target.value as any)}
          >
            <option value="Allowed">Yes, Allowed / Granted</option>
            <option value="Not Allowed">No, Not Allowed</option>
            <option value="None">Not Applicable</option>
          </select>
        </div>

        {/* Same-Day HQ Return Logic select */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Same-Day HQ Return Logic
          </label>
          <select
            className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition h-10 font-bold text-[#1e3b2b]"
            value={useHqSplitLogic ? 'split' : 'standard'}
            onChange={(e) => setUseHqSplitLogic(e.target.value === 'split')}
          >
            <option value="standard">Standard Unified / सामान्य</option>
            <option value="split">Split HQ Tour (30%/70%) / विभाजित नियम</option>
          </select>
        </div>

        {/* TA Claim Type */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Allowance Category
          </label>
          <input
            type="text"
            className="block w-full px-3 py-2 border border-slate-200 bg-slate-100 rounded-lg text-sm text-slate-500 cursor-not-allowed font-medium h-10"
            value={allowanceType}
            disabled
          />
        </div>

      </div>

      {/* Halt Range Form Panel */}
      {showHaltRangeForm && (
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-5 shadow-xs space-y-4 animate-in fade-in slide-in-from-top-3 duration-200 text-left">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#1e3f20] text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              Quickly Add Halt Date Range / पड़ाव समय अवधि दर्ज करें
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5">
                From Date * (प्रारंभ तिथि)
              </label>
              <input
                type="date"
                className="block w-full px-3 py-1.5 border border-slate-250 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                value={haltStartDate}
                onChange={(e) => setHaltStartDate(e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5">
                To Date * (अंतिम तिथि)
              </label>
              <input
                type="date"
                className="block w-full px-3 py-1.5 border border-slate-250 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                value={haltEndDate}
                onChange={(e) => setHaltEndDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5">
                Halt Station * (पड़ाव स्टेशन)
              </label>
              <input
                type="text"
                placeholder="e.g. BXF"
                className="block w-full px-3 py-1.5 border border-slate-250 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase font-semibold text-slate-805"
                value={haltStation}
                onChange={(e) => setHaltStation(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5">
                Purpose / Remarks (उद्देश्य / टिप्पणी)
              </label>
              <input
                type="text"
                placeholder="e.g. HALT ON DUTY"
                className="block w-full px-3 py-1.5 border border-slate-250 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase font-semibold text-slate-805"
                value={haltPurpose}
                onChange={(e) => setHaltPurpose(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => handleGenerateHaltRows(haltStartDate, haltEndDate, haltStation, haltPurpose)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs transition cursor-pointer"
            >
              Generate Halt Rows (विवरण दर्ज करें)
            </button>
            <p className="text-[11px] text-slate-500 font-medium">
              यह ऑटोमैटिक रूप से चुनी गई तिथि सीमा के लिए प्रत्येक दिन की 'Halt' एंट्री (पड़ाव विवरण) बना देगा।
            </p>
          </div>
        </div>
      )}

      {/* Dynamic Print Optimization Dashboard */}
      <div className="bg-gradient-to-r from-indigo-50/70 via-white to-slate-50 border border-indigo-100 rounded-xl p-5 shadow-xs flex flex-col relative overflow-hidden">
        {/* Subtle background decoration */}
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-48 h-48 bg-indigo-50/40 rounded-full blur-2xl pointer-events-none" />
        
        <div className="space-y-1.5 relative z-10 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-indigo-600 text-white text-[10px] uppercase font-black px-2 py-0.5 rounded tracking-widest">
              Print Optimizer
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 bg-indigo-100 text-indigo-805">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              Estimated Print Pages: {getEstimatedPagesCount() === 0 ? '0 Pages' : `${getEstimatedPagesCount()} Page${getEstimatedPagesCount() > 1 ? 's' : ''} (A4)`}
            </span>
          </div>
          <h4 className="text-slate-800 font-bold text-sm tracking-tight pt-1">
            Official Railway Multi-Page Layout Guide (मल्टी-पेज लेआउट गाइड)
          </h4>
          <p className="text-[11px] text-slate-500 leading-normal max-w-xl font-medium">
            To maintain structural integrity for direct landscape A4 submission: If data fits in 2 pages (up to 34 entries), Page 1 holds up to 22 entries and Page 2 holds up to 12 entries with summary and signatures. When entries exceed normal 2 pages (&gt; 34 entries), Page 3 is automatically added, allowing Page 2 to hold up to 22 entries (same as Page 1), with summary, certificate, and signatures shifted cleanly to Page 3!
          </p>
        </div>
      </div>

      {/* Dynamic 3rd Page Info Warning Notice */}
      {hasEntriesOnPage3 && (
        <div className="bg-amber-50 border border-amber-250 p-4 rounded-xl flex items-start gap-4 shadow-3xs animate-fade-in text-left">
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">
            <h5 className="font-extrabold text-xs uppercase tracking-wide text-amber-800 flex items-center gap-1.5">
              <span>📄 Multi-Page Active: 3+ Sheets Detected (2 से अधिक पृष्ठ सक्रिय)</span>
            </h5>
            <p className="text-[11px] text-amber-900 leading-normal font-bold">
              You are currently typing/entering data that spills onto page 3 or above. 
            </p>
            <ul className="text-[10.5px] text-amber-850 list-disc pl-5 font-semibold space-y-0.5 mt-1 leading-relaxed">
              <li>Our smart layout engine automatically compiles and distributes additional items across A4 Sheets seamlessly.</li>
              <li>Declaration note, signature fields, and summary tables will automatically slide to the very last page for direct submission without cutting!</li>
              <li>Ensure print scaling in your browser landscape settings is set to 95%-100% for optimum fits.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Journeys Table Header & Action */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs mt-3">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-sm text-slate-900">
              Absence &amp; Journey Slabs Table
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isLimitReached}
              onClick={() => handleAddRow()}
              className={`inline-flex items-center gap-1.5 font-semibold px-3 py-1.5 border rounded-lg text-xs transition-all ${
                isLimitReached
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50'
                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 cursor-pointer'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Journey Row
            </button>
            <button
              type="button"
              disabled={isLimitReached}
              onClick={() => handleAddObjectOnlyRow()}
              title="Add a row pre-filled with '--' in train, stations, and times for typing Object of Journey only"
              className={`inline-flex items-center gap-1.5 font-semibold px-3 py-1.5 border rounded-lg text-xs transition-all ${
                isLimitReached
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200 cursor-pointer'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-amber-600" />
              Only Object of Journey (-- Row)
            </button>
            <button
              type="button"
              disabled={isLimitReached}
              onClick={() => setShowHaltRangeForm(!showHaltRangeForm)}
              className={`inline-flex items-center gap-1.5 font-semibold px-3 py-1.5 border rounded-lg text-xs transition-all ${
                isLimitReached
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50'
                  : showHaltRangeForm 
                    ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 cursor-pointer' 
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 cursor-pointer'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Add Halt Range (पड़ाव अवधि)
            </button>
            <button
              type="button"
              onClick={() => setShowPdfModal(true)}
              title="Upload TA Journal PDF to import journey rows / पीडीएफ से यात्राएं जोड़ें"
              className="inline-flex items-center gap-1.5 font-bold px-3 py-1.5 border border-purple-300 rounded-lg text-xs bg-purple-50 hover:bg-purple-100 text-purple-900 transition-all cursor-pointer shadow-3xs"
            >
              <FileUp className="w-3.5 h-3.5 text-purple-600" />
              Import from PDF / पीडीएफ से जोड़ें
            </button>
          </div>
        </div>

        {/* Scrollable journeys table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <th className="px-4 py-3 w-32">Date</th>
                <th className="px-3 py-3 w-28">Mode</th>
                <th className="px-3 py-3 w-24">Train / Veh No</th>
                <th className="px-3 py-3 w-24">Time Left</th>
                <th className="px-3 py-3 w-24">Time Arrive</th>
                <th className="px-4 py-3 min-w-[140px]">From Station</th>
                <th className="px-4 py-3 min-w-[140px]">To Station</th>
                <th className="px-4 py-3 min-w-[140px]">Object of Journey / remarks</th>
                <th className="px-3 py-3 w-24">DA Rate</th>
                <th className="px-4 py-3 min-w-[150px]">Days/Night & Slab</th>
                <th className="px-4 py-3 w-24 text-right">TA (Rs.)</th>
                <th className="px-4 py-3 w-24 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {journeys.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-slate-400">
                    No journeys entered yet. Click the "Add Journey Row" button above to register a tour/duty movement.
                  </td>
                </tr>
              ) : (
                journeys.map((row, idx) => {
                  const activePercent = row.overrideSlab === 'Auto' ? row.autoSlab : (row.overrideSlab === 'Same Day (Nil)' ? 0 : Number(row.overrideSlab));
                  const isSecondaryRow = journeys.some((r, idx2) => r.date === row.date && r.date !== '' && idx2 < idx);
                  
                  let daysCount = 1;
                  if (row.mode === 'Halted' && row.date && row.dateEnd && row.dateEnd >= row.date) {
                    try {
                      const d1 = new Date(row.date);
                      const d2 = new Date(row.dateEnd);
                      const diffTime = Math.abs(d2.getTime() - d1.getTime());
                      const calculated = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
                      if (!isNaN(calculated) && calculated > 0) {
                        daysCount = calculated;
                      }
                    } catch {
                      daysCount = 1;
                    }
                  }
                  
                  const pageBreaks = getPageBreakPositions();
                  const startsPageNum = pageBreaks[idx];
                  
                  const rowContent = (
                    <tr key={row.id} className="animate-fade-in-row hover:bg-slate-50/50 transition">
                      {/* Date */}
                      <td className="px-3 py-2.5">
                        {row.mode === 'Halted' ? (
                          <div className="flex flex-col gap-1 w-[165px] bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                             <div className="flex items-center gap-1">
                              <span className="text-[11.5px] text-slate-500 font-bold w-[42px] uppercase tracking-wider shrink-0">From:</span>
                              <input
                                type="date"
                                className="w-full px-2 py-1 border border-slate-200 bg-white rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-[13px] font-semibold text-slate-800"
                                value={row.date}
                                onChange={(e) => handleRowChange(row.id, 'date', e.target.value)}
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[11.5px] text-slate-500 font-bold w-[42px] uppercase tracking-wider shrink-0">To:</span>
                              <input
                                type="date"
                                className="w-full px-2 py-1 border border-slate-200 bg-white rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-[13px] font-semibold text-slate-800"
                                value={row.dateEnd || ''}
                                onChange={(e) => handleRowChange(row.id, 'dateEnd', e.target.value)}
                              />
                            </div>
                          </div>
                        ) : row.mode === 'TA Journey continue from previous month' || row.mode === 'TA journey continue to next month' ? (
                          <div className="w-[110px] text-center py-2 text-slate-400 font-mono font-bold text-xs bg-slate-100/70 border border-dashed border-slate-300 rounded-lg select-none">
                            N/A
                          </div>
                        ) : row.date === '--' ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              className="w-full px-2 py-1.5 border border-amber-300 bg-amber-50/40 rounded focus:outline-none font-mono text-xs font-bold text-slate-800 text-center"
                              value={row.date}
                              onChange={(e) => handleRowChange(row.id, 'date', e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                let suggestedDate = '';
                                if (monthClaimed) suggestedDate = `${monthClaimed}-01`;
                                handleRowChange(row.id, 'date', suggestedDate);
                              }}
                              title="Switch to Date Picker / तारीख चुनें"
                              className="px-1.5 py-1 text-xs text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 rounded bg-white shrink-0 cursor-pointer transition-colors shadow-3xs"
                            >
                              📅
                            </button>
                          </div>
                        ) : (
                          <input
                            type="date"
                            className="w-full px-2 py-1.5 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                            value={row.date}
                            onChange={(e) => handleRowChange(row.id, 'date', e.target.value)}
                          />
                        )}
                      </td>

                      {/* Mode */}
                      <td className="px-2 py-2.5 min-w-[150px]">
                        {row.mode === 'Train' || row.mode === 'Road' || row.mode === 'Halted' || row.mode === 'TA Journey continue from previous month' || row.mode === 'TA journey continue to next month' ? (
                          <select
                            className="w-full px-2 py-1.5 border border-slate-200 rounded focus:outline-none bg-white font-medium font-sans text-xs"
                            value={row.mode}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                handleRowChange(row.id, 'mode', 'BY FOOT');
                              } else {
                                handleRowChange(row.id, 'mode', val);
                                if (val === 'Halted') {
                                  // Pre-fill clean values for outstation halt to help calculations
                                  handleRowChange(row.id, 'trainNo', 'HALTED ON DUTY AT BXF');
                                  handleRowChange(row.id, 'timeLeft', '');
                                  handleRowChange(row.id, 'timeArrived', '');
                                  handleRowChange(row.id, 'fromStation', 'HALT');
                                  handleRowChange(row.id, 'toStation', 'HALT');
                                  handleRowChange(row.id, 'overrideSlab', 'Auto');
                                }
                              }
                            }}
                          >
                            <option value="Train">BY TRAIN</option>
                            <option value="Road">BY ROAD</option>
                            <option value="Halted">🏨 HALTED (पड़ाव)</option>
                            <option value="TA Journey continue from previous month">TA Journey continue from previous month</option>
                            <option value="TA journey continue to next month">TA journey continue to next month</option>
                            <option value="custom">✍️ Manual Type...</option>
                          </select>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={row.mode}
                              onChange={(e) => handleRowChange(row.id, 'mode', e.target.value)}
                              placeholder="e.g. BY AIR / BY FOOT"
                              className="w-full px-2 py-1 border border-indigo-300 bg-indigo-50/50 rounded focus:outline-none font-bold text-xs uppercase"
                            />
                            <button
                              type="button"
                              onClick={() => handleRowChange(row.id, 'mode', 'Train')}
                              title="Reset / वापस बदलें"
                              className="p-1 text-slate-400 hover:text-slate-600 border border-slate-200 hover:bg-slate-50 rounded flex items-center justify-center cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </td>

                      {row.mode === 'TA Journey continue from previous month' || row.mode === 'TA journey continue to next month' ? (
                        <td colSpan={9} className="px-4 py-2.5 bg-slate-50 text-stone-500 font-extrabold font-mono text-center tracking-wide italic text-[11px] select-none border border-slate-200">
                          {row.mode === 'TA Journey continue from previous month' 
                            ? '◀◀ TA JOURNEY CONTINUE FROM PREVIOUS MONTH / पिछली यात्रा जारी (NO TA) ▶▶' 
                            : '◀◀ TA JOURNEY CONTINUE TO NEXT MONTH / यात्रा अगले महीने जारी रहेगी (NO TA) ▶▶'}
                        </td>
                      ) : row.mode === 'Halted' ? (
                        <td colSpan={5} className="px-2 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-emerald-800 font-extrabold uppercase tracking-wide shrink-0 bg-emerald-100/80 px-2 py-1 rounded border border-emerald-300">
                              Halt Details
                            </span>
                            <input
                              type="text"
                              placeholder="e.g. 20.05.2026 to 25.05.2026 Halted at BXF"
                              className="w-full px-3 py-1.5 border border-emerald-300 bg-emerald-50/20 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-slate-800 text-xs uppercase placeholder:normal-case placeholder:font-normal"
                              value={row.trainNo || ''}
                              onChange={(e) => {
                                handleRowChange(row.id, 'trainNo', e.target.value);
                                // Set supporting fields to ensure correct validation and displays
                                if (!row.timeLeft) handleRowChange(row.id, 'timeLeft', '');
                                if (!row.timeArrived) handleRowChange(row.id, 'timeArrived', '');
                                if (!row.fromStation) handleRowChange(row.id, 'fromStation', 'HALT');
                                if (!row.toStation) handleRowChange(row.id, 'toStation', 'HALT');
                              }}
                            />
                          </div>
                        </td>
                      ) : (
                        <>
                          {/* Train No */}
                          <td className="px-2 py-2.5">
                            <input
                              type="text"
                              placeholder={row.mode === 'Train' ? 'e.g. 12810' : row.mode === 'Road' ? 'Vehicle No' : 'Ref/Ticket No'}
                              className="w-full px-2 py-1.5 border border-slate-200 rounded focus:outline-none font-medium font-mono text-xs"
                              value={row.trainNo || ''}
                              onChange={(e) => handleRowChange(row.id, 'trainNo', e.target.value)}
                            />
                          </td>

                          {/* Time Left */}
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-1 select-none">
                              <TimeDropdownPicker
                                value={row.timeLeft || ''}
                                onChange={(val) => handleRowChange(row.id, 'timeLeft', val)}
                              />
                              <button
                                type="button"
                                onClick={() => handleRowChange(row.id, 'timeLeft', '')}
                                className={`px-1.5 py-1.5 rounded text-[10px] font-extrabold border transition-all cursor-pointer ${
                                  !row.timeLeft 
                                    ? 'bg-amber-100 border-amber-300 text-amber-800 font-bold' 
                                    : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                                }`}
                                title="No departure time / प्रस्थान समय खाली करें (--)"
                              >
                                --
                              </button>
                            </div>
                          </td>

                          {/* Time Arrived */}
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-1 select-none">
                              <TimeDropdownPicker
                                value={row.timeArrived || ''}
                                onChange={(val) => handleRowChange(row.id, 'timeArrived', val)}
                              />
                              <button
                                type="button"
                                onClick={() => handleRowChange(row.id, 'timeArrived', '')}
                                className={`px-1.5 py-1.5 rounded text-[10px] font-extrabold border transition-all cursor-pointer ${
                                  !row.timeArrived 
                                    ? 'bg-amber-100 border-amber-300 text-amber-800 font-bold' 
                                    : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                                }`}
                                title="No arrival time / आगमन समय खाली करें (--)"
                              >
                                --
                              </button>
                            </div>
                          </td>

                          {/* From Station */}
                          <td className="px-2 py-2.5">
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                placeholder="e.g. BUF"
                                className="w-full pl-2 pr-6 py-1.5 border border-slate-200 rounded focus:outline-none font-semibold uppercase"
                                value={row.fromStation}
                                onChange={(e) => handleRowChange(row.id, 'fromStation', e.target.value)}
                              />
                              {idx > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleAutoFillFromStation(idx)}
                                  title="Set same as previous destination"
                                  className="absolute right-1 text-slate-400 hover:text-indigo-600 transition"
                                >
                                  <Undo className="w-3.5 h-3.5 rotate-180" />
                                </button>
                              )}
                            </div>
                          </td>

                          {/* To Station */}
                          <td className="px-2 py-2.5">
                            <input
                              type="text"
                              placeholder="e.g. CKP"
                              className="w-full px-2 py-1.5 border border-slate-200 rounded focus:outline-none font-semibold uppercase"
                              value={row.toStation}
                              onChange={(e) => handleRowChange(row.id, 'toStation', e.target.value)}
                            />
                          </td>
                        </>
                      )}

                      {row.mode !== 'TA Journey continue from previous month' && row.mode !== 'TA journey continue to next month' && (
                        <>
                          {/* remarks */}
                      <td className="px-2 py-2.5 relative">
                        <input
                          type="text"
                          placeholder="e.g. Conduct search/Halt"
                          className={`w-full px-2 py-1.5 border rounded focus:outline-none ${
                            ((row.mode !== 'Halted' && row.objectOfJourney && row.objectOfJourney.length > 55) ||
                             (row.mode === 'Halted' && row.objectOfJourney && row.objectOfJourney.length > 110))
                              ? 'border-amber-500 focus:ring-1 focus:ring-amber-500 bg-amber-50/20 font-medium'
                              : 'border-slate-200'
                          }`}
                          value={row.objectOfJourney}
                          maxLength={row.mode !== 'Halted' ? 160 : 165}
                          onChange={(e) => handleRowChange(row.id, 'objectOfJourney', e.target.value)}
                        />
                        {((row.mode !== 'Halted' && row.objectOfJourney && row.objectOfJourney.length > 80) ||
                          (row.mode === 'Halted' && row.objectOfJourney && row.objectOfJourney.length > 110)) && (
                          <div className="absolute left-1 -bottom-1.5 text-[9px] text-amber-700 font-extrabold bg-amber-50 px-1 border border-amber-300 rounded leading-none shrink-0 z-10 shadow-sm animate-pulse">
                            ⚠️ 80+ chars: A4 Print me 2 rows ki jagah merge ho legi / Spans 2 rows height
                          </div>
                        )}
                      </td>

                      {/* Rate */}
                      <td className="px-2 py-2.5">
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-1.5 flex items-center text-slate-400 text-[10px]">₹</span>
                          <input
                            type="number"
                            className="w-full pl-4 pr-1 py-1.5 border border-slate-200 rounded focus:outline-none font-mono"
                            value={row.dailyRate}
                            onChange={(e) => handleRowChange(row.id, 'dailyRate', Number(e.target.value) || 0)}
                          />
                        </div>
                      </td>

                      {/* Days/Night & Slab option */}
                      <td className="px-2 py-2.5">
                        <select
                          className="w-full px-1.5 py-1.5 border border-slate-200 rounded focus:outline-none bg-white text-[11px]"
                          value={row.overrideSlab}
                          onChange={(e) => handleRowChange(row.id, 'overrideSlab', e.target.value)}
                        >
                          <option value="Auto">Auto ({row.autoSlab}%) {row.mode === 'Halted' && daysCount > 1 ? `× ${daysCount} Days` : ''}</option>
                          <option value="100">100% Rate (₹{(row.dailyRate * 1.0 * daysCount).toFixed(2)}) {daysCount > 1 ? `[${daysCount} Days]` : ''}</option>
                          <option value="70">70% Rate (₹{(row.dailyRate * 0.70 * daysCount).toFixed(2)}) {daysCount > 1 ? `[${daysCount} Days]` : ''}</option>
                          <option value="30">30% Rate (₹{(row.dailyRate * 0.30 * daysCount).toFixed(2)}) {daysCount > 1 ? `[${daysCount} Days]` : ''}</option>
                          <option value="0">0% Rate (No TA)</option>
                          <option value="Same Day (Nil)">Same Day (Nil)</option>
                          <option value="Manual">Manual / कस्टम एंट्री (Days/Night & ₹)</option>
                        </select>

                        {/* Keyboard manual entry input for Days/Night text */}
                        {(row.overrideSlab === 'Manual' || row.customDaysNight !== undefined) && (
                          <div className="mt-1 flex flex-col gap-1">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                placeholder="Days/Night text (e.g. 01 Day*100%)"
                                className="w-full px-1.5 py-1 border border-indigo-300 rounded text-[11px] font-mono bg-indigo-50/70 text-indigo-950 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                value={row.customDaysNight || ''}
                                onChange={(e) => handleRowChange(row.id, 'customDaysNight', e.target.value)}
                                title="Type manual Days/Night text using keyboard (Days/Night मैन्युअल टाइपिंग)"
                              />
                              {row.customDaysNight !== undefined && (
                                <button
                                  type="button"
                                  onClick={() => handleRowChange(row.id, 'customDaysNight', undefined)}
                                  className="text-[10px] text-rose-600 hover:text-rose-800 font-bold px-1 bg-rose-50 border border-rose-200 rounded shrink-0"
                                  title="Clear custom Days/Night text"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                            <span className="text-[9.5px] text-indigo-700 font-semibold leading-none flex items-center gap-0.5">
                              ⌨️ Days/Night manual text
                            </span>
                          </div>
                        )}

                        {row.overrideSlab !== 'Manual' && row.customDaysNight === undefined && (
                          <button
                            type="button"
                            onClick={() => {
                              const defaultStr = row.autoSlab > 0 ? `${daysCount === 1 ? '01 Day' : `${String(daysCount).padStart(2, '0')} Days`}*${row.overrideSlab === 'Auto' ? row.autoSlab : row.overrideSlab}%` : '--';
                              handleRowChange(row.id, 'customDaysNight', defaultStr);
                            }}
                            className="mt-1 text-[9.5px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-0.5 underline decoration-dotted"
                          >
                            ⌨️ Custom Days/Night text
                          </button>
                        )}
                      </td>

                      {/* TA (Rs.) amount column */}
                      <td className="px-3 py-2.5 text-right font-semibold font-mono text-slate-800 bg-slate-50/25 text-xs border border-slate-200">
                        {row.overrideSlab === 'Manual' ? (
                          <div className="relative flex items-center">
                            <span className="absolute left-1.5 text-slate-400 text-[10px]">₹</span>
                            <input
                              type="number"
                              min="0"
                              max="10000"
                              className="w-full pl-3.5 pr-1 py-1 text-xs border border-indigo-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono font-bold text-indigo-900 bg-indigo-50/30 text-right h-7"
                              value={row.manualAmount !== undefined ? row.manualAmount : row.calculatedAmount}
                              onChange={(e) => handleRowChange(row.id, 'manualAmount', Number(e.target.value) || 0)}
                              title="Enter manual TA rate/amount (कस्टम टीए दर दर्ज करें)"
                            />
                          </div>
                        ) : (
                          <span>₹{(row.calculatedAmount || 0).toFixed(2)}</span>
                        )}
                      </td>
                    </>
                  )}

                      {/* Actions */}
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-1 justify-center">
                          <button
                            type="button"
                            onClick={() => handleFillDashesRow(row.id)}
                            title="Fill '--' in Train No, Stations, and Times (अन्य फ़ील्ड्स में '--' भरें)"
                            className="px-1.5 py-1 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded text-[10.5px] font-bold transition cursor-pointer"
                          >
                            --
                          </button>
                          <button
                            type="button"
                            disabled={isLimitReached}
                            onClick={() => handleAddRowBelow(row)}
                            title={isLimitReached ? "Maximum printable limit reached for 3 A4 pages" : "Add row below (नीचे पंक्ति जोड़ें)"}
                            className={`p-1.5 border rounded transition ${
                              isLimitReached
                                ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed opacity-50'
                                : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-emerald-600 cursor-pointer'
                            }`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isLimitReached}
                            onClick={() => handleDuplicateRow(row)}
                            title={isLimitReached ? "Maximum printable limit reached for 3 A4 pages" : "Duplicate this exact row (समान पंक्ति कॉपी करें)"}
                            className={`p-1.5 border rounded transition ${
                              isLimitReached
                                ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed opacity-50'
                                : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-indigo-600 cursor-pointer'
                            }`}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(row.id)}
                            title="Delete journey"
                            className="p-1.5 border border-slate-100 hover:border-red-200 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );

                  if (startsPageNum) {
                    return (
                      <React.Fragment key={`pagebreak-${row.id}`}>
                        <tr className="bg-indigo-50/50 select-none border-y-[2px] border-indigo-200/50">
                          <td colSpan={12} className="py-2.5 px-4 font-bold text-xs text-indigo-950">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 font-sans uppercase tracking-wider text-[11px] font-extrabold text-indigo-900">
                                <Layers className="w-4 h-4 text-indigo-500/80" />
                                <span>🖨️ LANDSCAPE PAGE BREAK &rarr; PAGE {startsPageNum} BEGINS HERE (पेज {startsPageNum} यहाँ से शुरू)</span>
                              </span>
                              <span className="text-[10.5px] text-indigo-600 bg-white font-mono px-2 py-0.5 border border-indigo-200 rounded font-semibold">
                                Note note summary & signatures automatically move down to page {startsPageNum} in print output.
                              </span>
                            </div>
                          </td>
                        </tr>
                        {rowContent}
                      </React.Fragment>
                    );
                  }
                  return rowContent;
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info box with automated copy capability */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-slate-600 xs:text-xs">
          <div className="flex items-center gap-2">
            <span className="p-1 bg-amber-100 rounded text-amber-800 text-[10px] font-bold">PRO-TIP</span>
            <span className="text-[11px] text-slate-500">
              Auto calculates hours. Under 6h absence is 30% allowance, 6-12h is 70%, over 12h is 100%. If multiple entries reside on the same date, they are automatically merged into a single-day claim, showing the calculated rate on the first entry (upar wali line) and nil on return/subsequent entries.
            </span>
          </div>
          <button
            type="button"
            disabled={isLimitReached}
            onClick={() => handleAddRow()}
            className={`self-end sm:self-center font-bold flex items-center gap-1 text-xs transition-all ${
              isLimitReached
                ? 'text-slate-450 cursor-not-allowed opacity-50'
                : 'text-indigo-500 hover:text-indigo-600 cursor-pointer'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            Add New Row at End / नई पंक्ति जोड़ें
          </button>
        </div>
      </div>

      {/* Verification alerts or warnings list */}
      {validationErrors.length > 0 && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-rose-800 font-semibold text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Please complete these requirements before saving / finalizing:
          </div>
          <ul className="list-disc pl-5 space-y-1 text-xs text-rose-700">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* TA Claim Slabs and Total summary block (Fitted for mobile too) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Slabs calculation detail */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h4 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-400" />
            Claim Summary Breakdowns
          </h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-medium">
            <div className="p-3 border border-slate-100 rounded-lg bg-slate-50/50">
              <span className="text-slate-400 block mb-1">100% Slabs Claims</span>
              <span className="font-mono text-base font-bold text-slate-700">{totals.p100Days} Day(s)</span>
            </div>
            <div className="p-3 border border-slate-100 rounded-lg bg-slate-50/50">
              <span className="text-slate-400 block mb-1">70% Slabs Claims</span>
              <span className="font-mono text-base font-bold text-slate-700">{totals.p70Days} Day(s)</span>
            </div>
            <div className="p-3 border border-slate-100 rounded-lg bg-slate-50/50">
              <span className="text-slate-400 block mb-1">30% Slabs Claims</span>
              <span className="font-mono text-base font-bold text-slate-700">{totals.p30Days} Day(s)</span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <span className="text-slate-400 block mb-1 text-xs">Total In Words (Indian Style)</span>
            <p className="font-semibold text-xs text-indigo-900 bg-indigo-50/60 p-2.5 rounded-lg border border-indigo-100/50">
              {numberToIndianWords(totals.totalAmount)}
            </p>
          </div>
        </div>

        {/* Big Total Panel */}
        <div className="bg-indigo-950 text-white rounded-xl p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <span className="font-mono text-xs uppercase tracking-wider text-indigo-300 block">Net Payable Amount</span>
            <div className="flex items-baseline gap-1 mt-1 font-mono">
              <span className="text-3xl font-extrabold text-white">₹{Math.floor(totals.totalAmount).toLocaleString('en-IN')}</span>
              <span className="text-indigo-300 text-sm">.{Math.round((totals.totalAmount % 1) * 100).toString().padStart(2, '0')}</span>
            </div>
            <div className="text-xs text-indigo-300 font-mono mt-3">
              Calculated across <strong>{totals.totalDays}</strong> total duty days.
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-indigo-900/60 font-medium">
            <div className="flex gap-2">
              <button
                onClick={() => handleSave(true)}
                className="flex-1 bg-white/10 hover:bg-white/15 text-indigo-100 border border-indigo-750/50 py-2 rounded-lg text-xs font-semibold tracking-wide transition text-center cursor-pointer"
                title="Save as draft layout to modify later"
              >
                Keep as Draft
              </button>
              <button
                onClick={() => handleSave(false)}
                className="flex-1 bg-white hover:bg-slate-100 text-indigo-950 py-2 rounded-lg text-xs font-bold tracking-wide transition text-center cursor-pointer"
                title="Finalize data and head back to list"
              >
                Compile &amp; Lock
              </button>
            </div>
            <button
              onClick={handleShareQR}
              type="button"
              className="w-full inline-flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-200 py-2 rounded-lg text-xs font-semibold tracking-wide transition text-center cursor-pointer border border-slate-700"
              title="Save draft and generate share QR code for other officers to instantly scan & load"
            >
              <QrCode className="w-3.5 h-3.5 text-indigo-400" />
              Share via QR Code / क्यूआर साझा करें
            </button>
            <button
              onClick={handleSaveAndPrintAction}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-lg text-xs font-extrabold tracking-wide shadow-sm transition text-center"
              title="Save, finalize with official format, and print"
              id="compile-and-print-button"
            >
              <Printer className="w-3.5 h-3.5" />
              Compile &amp; Print / प्रिंट करें
            </button>
          </div>
        </div>

      </div>

       {/* --- Dynamic Professional Toast Notification & Row Animations --- */}
      <style>{`
        @keyframes shrinkWidth {
          from { width: 100%; }
          to { width: 0%; }
        }
        .animate-toast-progress {
          animation: shrinkWidth 4000ms linear forwards;
        }
        @keyframes fadeInRow {
          from {
            opacity: 0;
            transform: translateY(6px);
            background-color: rgba(224, 242, 254, 0.4);
          }
          to {
            opacity: 1;
            transform: translateY(0);
            background-color: transparent;
          }
        }
        .animate-fade-in-row {
          animation: fadeInRow 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
          will-change: opacity, transform, background-color;
        }
      `}</style>
      <div 
        className={`fixed top-20 right-5 z-[100] max-w-sm w-80 bg-[#2d302a] text-white border border-[#c8d4a5]/30 rounded-xl shadow-2xl p-4 transition-all duration-500 transform ${
          showToast ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-10 scale-95 pointer-events-none'
        }`}
      >
        <div className="flex gap-3">
          <div className="p-2 bg-[#c8d4a5]/10 text-[#c8d4a5] rounded-lg shrink-0 flex items-center justify-center">
            <Cloud className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-100">Draft Protected / सुरक्षित ड्राफ्ट</p>
            <p className="text-[11px] text-[#c8d4a5]/90 mt-0.5 font-medium leading-relaxed font-sans">{toastMessage}</p>
            {lastAutoSaved && (
              <div className="mt-2 flex items-center gap-1.5 text-[9px] text-[#c8d4a5]/60 font-semibold font-sans tracking-tight">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>
                  Last saved at {(() => {
                    const match = lastAutoSaved.match(/(\d+):(\d+)/);
                    if (!match) return lastAutoSaved;
                    const suffix = lastAutoSaved.toLowerCase().includes('pm') 
                      ? ' PM' 
                      : lastAutoSaved.toLowerCase().includes('am') 
                        ? ' AM' 
                        : '';
                    return `${match[1]}:${match[2]}${suffix}`;
                  })()}
                </span>
              </div>
            )}
          </div>
          <button 
            type="button" 
            onClick={() => setShowToast(false)}
            className="text-[#c8d4a5]/60 hover:text-[#c8d4a5] p-1 hover:bg-[#c8d4a5]/5 rounded-md transition self-start cursor-pointer font-sans"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* Progress bar */}
        {showToast && (
          <div className="absolute bottom-0 left-0 h-1 bg-[#c8d4a5] rounded-b-xl animate-toast-progress" />
        )}
      </div>

      {/* --- Interactive QR Code Sharing Modal --- */}
      {showQRModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl relative animate-fade-in border border-slate-100 text-slate-800 space-y-4 text-center">
            {/* Modal Header */}
            <div className="flex flex-col items-center">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full mb-3">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-950">Share TA Claim / यात्रा भत्ता साझा करें</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1 font-sans">
                Other officers can scan this QR code to instantly pull up and view this compiled record on their devices.
              </p>
            </div>

            {/* QR Code Graphic Frame */}
            <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-2xl inline-block max-w-[200px] mx-auto shadow-2xs">
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

            {/* Info Badge */}
            <div className="bg-emerald-50 text-emerald-800 text-[10px] py-1.5 px-3 rounded-lg font-semibold inline-flex items-center gap-1 mx-auto font-mono">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
              Claim Saved &amp; Live on Firestore Cloud / लाइव सुरक्षित
            </div>

            {/* Copyable URL bar */}
            <div className="space-y-2 text-left">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide font-mono">Direct Share Link</label>
              <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
                <input 
                  type="text" 
                  readOnly 
                  value={`${window.location.origin}${window.location.pathname}?journalId=${activeJournalId}&ownerId=${auth.currentUser?.uid || 'anon'}`} 
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
            <div className="grid grid-cols-2 gap-2 pt-2">
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

      {/* PDF TA Importer Modal inside ClaimBuilder */}
      {showPdfModal && (
        <PdfTaImportModal
          isOpen={showPdfModal}
          onClose={() => setShowPdfModal(false)}
          existingProfiles={profiles}
          currentEditingJournal={existingJournalId ? journals.find(j => j.id === existingJournalId) : null}
          onSaveNewJournal={(newJournal) => {
            onSaveJournal(newJournal);
            onBack();
          }}
          onAppendRowsToCurrentClaim={(importedRows, importedProfile) => {
            if (importedProfile && (!profileId || profileId === 'prof-ramesh')) {
              const matched = profiles.find(p => p.id === importedProfile.id || p.pfNumber === importedProfile.pfNumber);
              if (matched) {
                setProfileId(matched.id);
              }
            }

            // If current rows are only 1 empty row, replace it
            const isInitialEmpty = journeys.length <= 1 && journeys.every(j => (!j.fromStation || j.fromStation === '--') && (!j.timeLeft || j.timeLeft === ''));
            if (isInitialEmpty) {
              setJourneysAndRegroup(importedRows);
            } else {
              setJourneysAndRegroup(prev => [...prev, ...importedRows]);
            }
          }}
        />
      )}

    </div>
  );
}
