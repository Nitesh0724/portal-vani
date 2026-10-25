/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { JourneyRow, TAJournal, OfficerProfile, TARateRule } from './types';

/**
 * Calculates the percentage rate (30, 70, 100, 0) based on time left and time arrived.
 * Rule:
 * - Difference <= 6 hours = 30%
 * - Difference > 6 hours and <= 12 hours = 70%
 * - Difference > 12 hours = 100%
 * If times are invalid or empty, defaults to 100% or 0% depending on entries.
 */
export function calculateAbsenceSlab(timeLeft: string, timeArrived: string): 30 | 70 | 100 | 0 {
  const leftEmpty = !timeLeft || timeLeft === '--';
  const arrivedEmpty = !timeArrived || timeArrived === '--';

  if (leftEmpty && arrivedEmpty) return 100; // Default when not specified, e.g. full day halt
  
  try {
    if (!leftEmpty && arrivedEmpty) {
      const [h1, m1] = timeLeft.split(':').map(Number);
      if (isNaN(h1) || isNaN(m1)) return 100;
      
      const activeMinutes = 1440 - (h1 * 60 + m1);
      const activeHours = activeMinutes / 60;
      
      if (activeHours <= 6) {
        return 30;
      } else if (activeHours <= 12) {
        return 70;
      } else {
        return 100;
      }
    }
    
    if (leftEmpty && !arrivedEmpty) {
      const [h2, m2] = timeArrived.split(':').map(Number);
      if (isNaN(h2) || isNaN(m2)) return 100;
      
      const activeMinutes = h2 * 60 + m2;
      const activeHours = activeMinutes / 60;
      
      if (activeHours <= 6) {
        return 30;
      } else if (activeHours <= 12) {
        return 70;
      } else {
        return 100;
      }
    }

    const [h1, m1] = timeLeft.split(':').map(Number);
    const [h2, m2] = timeArrived.split(':').map(Number);
    
    if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) {
      return 100;
    }

    const t1 = h1 * 60 + m1;
    const t2 = h2 * 60 + m2;
    
    let diffMins = 0;
    if (t2 >= t1) {
      diffMins = t2 - t1;
    } else {
      // Crosses midnight (24 hours wrap)
      diffMins = (1440 - t1) + t2;
    }

    const diffHours = diffMins / 60;
    
    if (diffHours === 0) {
      // E.g. 00:00 to 00:00 (Halt out of station is 24 hours absence)
      return 100;
    }
    
    if (diffHours <= 6) {
      return 30;
    } else if (diffHours <= 12) {
      return 70;
    } else {
      return 100;
    }
  } catch (e) {
    return 100;
  }
}

/**
 * Convert number to words in Indian Currency Style
 */
export function numberToIndianWords(num: number): string {
  if (num === 0) return 'Zero Rupees Only';
  
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  function convertLessThanOneThousand(n: number): string {
    if (n === 0) return '';
    let temp = '';
    
    if (n >= 100) {
      temp += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    
    if (n >= 20) {
      temp += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    }
    
    if (n > 0) {
      temp += ones[n] + ' ';
    }
    
    return temp.trim();
  }
  
  let remainder = Math.floor(num);
  let result = '';
  
  // Crores
  if (remainder >= 10000000) {
    result += convertLessThanOneThousand(Math.floor(remainder / 10000000)) + ' Crore ';
    remainder %= 10000000;
  }
  
  // Lakhs
  if (remainder >= 100000) {
    result += convertLessThanOneThousand(Math.floor(remainder / 100000)) + ' Lakh ';
    remainder %= 100000;
  }
  
  // Thousands
  if (remainder >= 1000) {
    result += convertLessThanOneThousand(Math.floor(remainder / 1000)) + ' Thousand ';
    remainder %= 1000;
  }
  
  // Hundreds & Decimals
  if (remainder > 0) {
    result += convertLessThanOneThousand(remainder) + ' ';
  }
  
  result = result.trim();
  
  // Handle paise if any
  const paise = Math.round((num - Math.floor(num)) * 100);
  if (paise > 0) {
    return `${result} Rupees and ${convertLessThanOneThousand(paise)} Paise Only`;
  }
  
  return `${result} Rupees Only`;
}

/**
 * Default Indian Railway standard rates for different Pay slabs
 * Constable Basic Pay is normally around 21,700 - 29,200 (Level 3), rate is normally Rs. 500 or 800 per day.
 * Let's provide standard default rules.
 */
export const DEFAULT_RATE_RULES: TARateRule[] = [
  { id: '1', name: 'Constable / Head Constable (Level 1 to 5)', basicPayMin: 0, basicPayMax: 35400, ratePerDay: 625 },
  { id: '2', name: 'Sub-Inspector / Inspector (Level 6 to 8)', basicPayMin: 35401, basicPayMax: 56100, ratePerDay: 1000 },
  { id: '3', name: 'Officers / Gazetted (Level 9 to 11)', basicPayMin: 56101, basicPayMax: 78800, ratePerDay: 1125 },
  { id: '4', name: 'Senior Officers (Level 12 & 13)', basicPayMin: 78801, basicPayMax: 144200, ratePerDay: 1250 },
  { id: '5', name: 'Commandant / DIG (Level 14 & above)', basicPayMin: 144201, basicPayMax: 9999999, ratePerDay: 1500 }
];

/**
 * Helper to suggest a base rate per day given basic pay or designation
 */
export function getSuggestedRate(basicPay: number, rules: TARateRule[], designation?: string): number {
  if (designation) {
    const dLower = designation.toLowerCase().trim();
    if (dLower === 'constable' || dLower === 'head constable' || dLower.includes('constable') || dLower === 'hc') {
      return 625;
    }
    if (dLower.includes('sub-inspector') || dLower.includes('inspector') || dLower === 'si' || dLower === 'asi' || dLower.includes('sub inspector') || dLower.includes('assistant sub-inspector')) {
      return 1000;
    }
  }
  const matchingRule = rules.find(r => basicPay >= r.basicPayMin && basicPay <= r.basicPayMax);
  return matchingRule ? matchingRule.ratePerDay : 625;
}

/**
 * Ganesh Chandra Malik - Sub-Inspector (SI) Official Profile
 */
export const GANESH_CHANDRA_MALIK_PROFILE: OfficerProfile = {
  id: 'prof-ganesh-chandra-malik',
  pfNumber: '1200384',
  name: 'Ganesh Chandra Malik',
  designation: 'Sub-Inspector (SI)',
  branch: 'Security Branch',
  division: 'CKP Division',
  headquarter: 'RPF/POST/BUF',
  basicPay: 44900,
  scaleOfPay: '9,300-34,800',
  dateOfAppointment: '2018-06-15',
  ruleGoverned: 'S. Rule',
  billUnit: '0703215',
  gradePay: 4200,
  mobileNumber: '9876543210',
  email: 'ganesh.malik@rpf.gov.in'
};

/**
 * Standard TA Claim Journal for Sub-Inspector Ganesh Chandra Malik
 */
export const GANESH_CHANDRA_MALIK_JOURNAL: TAJournal = {
  id: 'ta-ganesh-chandra-malik-2026-05',
  profileId: 'prof-ganesh-chandra-malik',
  pfNumber: '1200384',
  officerName: 'Ganesh Chandra Malik',
  monthClaimed: '2026-05',
  journeys: [
    {
      id: 'gcm-1',
      date: '2026-05-02',
      mode: 'Train',
      trainNo: '18030',
      timeLeft: '08:30',
      timeArrived: '13:00',
      fromStation: 'BUF',
      toStation: 'CKP',
      kms: 110,
      dayNight: 'Day',
      objectOfJourney: 'Law & order inspection duty at CKP Division HQ',
      dailyRate: 1000,
      overrideSlab: 'Auto',
      autoSlab: 70,
      calculatedAmount: 700
    },
    {
      id: 'gcm-2',
      date: '2026-05-02',
      mode: 'Train',
      trainNo: '18029',
      timeLeft: '19:00',
      timeArrived: '22:30',
      fromStation: 'CKP',
      toStation: 'BUF',
      kms: 110,
      dayNight: 'Night',
      objectOfJourney: 'Return to Post after divisional meeting',
      dailyRate: 1000,
      overrideSlab: 'Same Day (Nil)',
      autoSlab: 0,
      calculatedAmount: 0
    },
    {
      id: 'gcm-3',
      date: '2026-05-08',
      mode: 'Train',
      trainNo: '18477',
      timeLeft: '07:00',
      timeArrived: '11:30',
      fromStation: 'BUF',
      toStation: 'ROU',
      kms: 105,
      dayNight: 'Day',
      objectOfJourney: 'Special crime detection drive at ROU station',
      dailyRate: 1000,
      overrideSlab: 'Auto',
      autoSlab: 70,
      calculatedAmount: 700
    },
    {
      id: 'gcm-4',
      date: '2026-05-08',
      mode: 'Train',
      trainNo: '18478',
      timeLeft: '18:30',
      timeArrived: '23:15',
      fromStation: 'ROU',
      toStation: 'BUF',
      kms: 105,
      dayNight: 'Night',
      objectOfJourney: 'Return to Post BUF after escort inspection',
      dailyRate: 1000,
      overrideSlab: 'Same Day (Nil)',
      autoSlab: 0,
      calculatedAmount: 0
    },
    {
      id: 'gcm-5',
      date: '2026-05-15',
      mode: 'Train',
      trainNo: '12871',
      timeLeft: '06:15',
      timeArrived: '14:45',
      fromStation: 'BUF',
      toStation: 'TATA',
      kms: 175,
      dayNight: 'Day',
      objectOfJourney: 'Escort inspection & bandobast duty at TATA station',
      dailyRate: 1000,
      overrideSlab: 'Auto',
      autoSlab: 70,
      calculatedAmount: 700
    },
    {
      id: 'gcm-6',
      date: '2026-05-16',
      mode: 'Train',
      trainNo: '12872',
      timeLeft: '09:00',
      timeArrived: '16:30',
      fromStation: 'TATA',
      toStation: 'BUF',
      kms: 175,
      dayNight: 'Day',
      objectOfJourney: 'Return to HQ BUF after completion of duty',
      dailyRate: 1000,
      overrideSlab: 'Auto',
      autoSlab: 70,
      calculatedAmount: 700
    },
    {
      id: 'gcm-7',
      date: '2026-05-22',
      mode: 'Train',
      trainNo: '18109',
      timeLeft: '05:30',
      timeArrived: '18:45',
      fromStation: 'BUF',
      toStation: 'JSG',
      kms: 215,
      dayNight: 'Day',
      objectOfJourney: 'Investigation of railway property theft case at JSG',
      dailyRate: 1000,
      overrideSlab: 'Auto',
      autoSlab: 100,
      calculatedAmount: 1000
    },
    {
      id: 'gcm-8',
      date: '2026-05-23',
      mode: 'Train',
      trainNo: '18110',
      timeLeft: '08:00',
      timeArrived: '21:15',
      fromStation: 'JSG',
      toStation: 'BUF',
      kms: 215,
      dayNight: 'Day',
      objectOfJourney: 'Return to BUF with case investigation records',
      dailyRate: 1000,
      overrideSlab: 'Auto',
      autoSlab: 100,
      calculatedAmount: 1000
    }
  ],
  isDraft: false,
  createdAt: '2026-05-31T10:00:00.000Z',
  updatedAt: '2026-05-31T10:00:00.000Z',
  allowanceType: 'TA',
  freePassAllowed: 'Allowed',
  percentage30Days: 0,
  percentage70Days: 4,
  percentage100Days: 2,
  totalDays: 6,
  totalAmount: 4800
};

/**
 * Sample Initial Officer Profiles
 */
export const DEFAULT_PROFILES: OfficerProfile[] = [
  GANESH_CHANDRA_MALIK_PROFILE
];

/**
 * Generate a list of sample journeys for initial testing
 */
export function getSampleJourneys(dailyRate: number): JourneyRow[] {
  return [
    {
      id: 'j-1',
      date: '2026-05-10',
      mode: 'Train',
      trainNo: '12810',
      timeLeft: '06:00',
      timeArrived: '14:00',
      fromStation: 'BUF',
      toStation: 'CKP',
      kms: 80,
      dayNight: 'Day',
      objectOfJourney: 'Patrolling Duty in Train',
      dailyRate: dailyRate,
      overrideSlab: 'Auto',
      autoSlab: 70, // 8 hours absence is 70%
      calculatedAmount: dailyRate * 0.70
    },
    {
      id: 'j-2',
      date: '2026-05-11',
      mode: 'Train',
      trainNo: '12809',
      timeLeft: '18:00',
      timeArrived: '21:00',
      fromStation: 'CKP',
      toStation: 'BUF',
      kms: 80,
      dayNight: 'Night',
      objectOfJourney: 'Return to Headquarters',
      dailyRate: dailyRate,
      overrideSlab: 'Auto',
      autoSlab: 30, // 3 hours is 30%
      calculatedAmount: dailyRate * 0.30
    },
    {
      id: 'j-3',
      date: '2026-05-15',
      mode: 'Road',
      timeLeft: '08:00',
      timeArrived: '21:30',
      fromStation: 'BUF',
      toStation: 'Outpost Patrol',
      kms: 45,
      dayNight: 'Both',
      objectOfJourney: 'Search and Raid duty with SI Ramesh',
      dailyRate: dailyRate,
      overrideSlab: 'Auto',
      autoSlab: 100, // 13.5 hours is 100%
      calculatedAmount: dailyRate
    }
  ];
}

/**
 * Master mock data setup
 */
export function initializeLocalStorage(): void {
  const existingProfiles = localStorage.getItem('rpf_profiles');
  if (!existingProfiles) {
    localStorage.setItem('rpf_profiles', JSON.stringify(DEFAULT_PROFILES));
  } else {
    try {
      const parsed: OfficerProfile[] = JSON.parse(existingProfiles);
      const hasGanesh = parsed.some(p => p.id === GANESH_CHANDRA_MALIK_PROFILE.id || p.name.trim().toLowerCase() === 'ganesh chandra malik');
      if (!hasGanesh) {
        localStorage.setItem('rpf_profiles', JSON.stringify([GANESH_CHANDRA_MALIK_PROFILE, ...parsed]));
      }
    } catch (_) {
      localStorage.setItem('rpf_profiles', JSON.stringify(DEFAULT_PROFILES));
    }
  }
  
  const existingRates = localStorage.getItem('rpf_rates');
  if (!existingRates) {
    localStorage.setItem('rpf_rates', JSON.stringify(DEFAULT_RATE_RULES));
  } else {
    // Check if browser has old RPF rates (e.g. ratePerDay: 500 or 800) and perform silent upgrade
    try {
      const parsed: TARateRule[] = JSON.parse(existingRates);
      let upgraded = false;
      const upgradedRates = parsed.map(r => {
        if (r.id === '1' && r.ratePerDay === 500) { r.ratePerDay = 625; upgraded = true; }
        if (r.id === '2' && r.ratePerDay === 800) { r.ratePerDay = 1000; upgraded = true; }
        if (r.id === '3' && r.ratePerDay === 900) { r.ratePerDay = 1125; upgraded = true; }
        if (r.id === '4' && r.ratePerDay === 1000) { r.ratePerDay = 1250; upgraded = true; }
        if (r.id === '5' && r.ratePerDay === 1200) { r.ratePerDay = 1500; upgraded = true; }
        return r;
      });
      if (upgraded) {
        localStorage.setItem('rpf_rates', JSON.stringify(upgradedRates));
      }
    } catch (e) {
      localStorage.setItem('rpf_rates', JSON.stringify(DEFAULT_RATE_RULES));
    }
  }

  const existingJournals = localStorage.getItem('rpf_journals');
  if (!existingJournals) {
    localStorage.setItem('rpf_journals', JSON.stringify([GANESH_CHANDRA_MALIK_JOURNAL]));
  } else {
    try {
      const parsed: TAJournal[] = JSON.parse(existingJournals);
      const hasGaneshJ = parsed.some(j => j.id === GANESH_CHANDRA_MALIK_JOURNAL.id || (j.officerName && j.officerName.toLowerCase().trim() === 'ganesh chandra malik'));
      if (!hasGaneshJ) {
        localStorage.setItem('rpf_journals', JSON.stringify([GANESH_CHANDRA_MALIK_JOURNAL, ...parsed]));
      }
    } catch (_) {
      localStorage.setItem('rpf_journals', JSON.stringify([GANESH_CHANDRA_MALIK_JOURNAL]));
    }
  }
}

/**
 * Calculate totals for a full journal
 */
export function recalculateJournalTotals(journeys: JourneyRow[]): {
  p30Days: number;
  p70Days: number;
  p100Days: number;
  totalDays: number;
  totalAmount: number;
} {
  let p30Days = 0;
  let p70Days = 0;
  let p100Days = 0;
  let totalAmount = 0;

  journeys.forEach(j => {
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

    let slabPercent = 100;
    if (j.mode === 'TA Journey continue from previous month' || j.mode === 'TA journey continue to next month') {
      slabPercent = 0;
    } else if (j.overrideSlab === 'Auto') {
      slabPercent = j.autoSlab;
    } else if (j.overrideSlab === 'Same Day (Nil)') {
      slabPercent = 0;
    } else if (j.overrideSlab === 'Manual') {
      const rate = j.dailyRate || 625;
      slabPercent = rate > 0 ? Math.round(((j.calculatedAmount || 0) / (rate * daysCount)) * 100) : 0;
    } else {
      slabPercent = Number(j.overrideSlab) as 0 | 30 | 70 | 100;
    }

    if (slabPercent === 30) {
      p30Days += daysCount;
    } else if (slabPercent === 70) {
      p70Days += daysCount;
    } else if (slabPercent === 100) {
      p100Days += daysCount;
    }
    
    totalAmount += j.calculatedAmount;
  });

  return {
    p30Days,
    p70Days,
    p100Days,
    totalDays: p30Days + p70Days + p100Days,
    totalAmount: Number(totalAmount.toFixed(2))
  };
}

/**
 * Compares two time strings in "HH:MM" format.
 */
export function compareTimeStrings(t1: string, t2: string): number {
  const empty1 = !t1 || t1 === '--';
  const empty2 = !t2 || t2 === '--';
  if (empty1 && empty2) return 0;
  if (empty1) return 1;
  if (empty2) return -1;
  const [h1, m1] = t1.split(':').map(Number);
  const [h2, m2] = t2.split(':').map(Number);
  if (isNaN(h1) || isNaN(m1)) return 1;
  if (isNaN(h2) || isNaN(m2)) return -1;
  return (h1 * 60 + m1) - (h2 * 60 + m2);
}

/**
 * Compares departure times.
 * Treat empty departure (which means started before today/away from HQ) as earliest (00:00).
 */
export function compareDepartureTimes(t1: string, t2: string): number {
  const empty1 = !t1 || t1 === '--';
  const empty2 = !t2 || t2 === '--';
  if (empty1 && empty2) return 0;
  if (empty1) return -1;
  if (empty2) return 1;
  const [h1, m1] = t1.split(':').map(Number);
  const [h2, m2] = t2.split(':').map(Number);
  if (isNaN(h1) || isNaN(m1)) return -1;
  if (isNaN(h2) || isNaN(m2)) return 1;
  return (h1 * 60 + m1) - (h2 * 60 + m2);
}

/**
 * Compares arrival times.
 * Treat empty arrival (which means stays away overnight/ends after today) as latest (24:00).
 */
export function compareArrivalTimes(t1: string, t2: string): number {
  const empty1 = !t1 || t1 === '--';
  const empty2 = !t2 || t2 === '--';
  if (empty1 && empty2) return 0;
  if (empty1) return 1;
  if (empty2) return -1;
  const [h1, m1] = t1.split(':').map(Number);
  const [h2, m2] = t2.split(':').map(Number);
  if (isNaN(h1) || isNaN(m1)) return 1;
  if (isNaN(h2) || isNaN(m2)) return -1;
  return (h1 * 60 + m1) - (h2 * 60 + m2);
}

/**
 * Helper to extract and normalize a station code or name for comparison.
 * Removes extra spaces, symbols, and handles nested formats like RPF/POST/BUF.
 */
function cleanStation(station: string): string {
  if (!station) return '';
  // Split by slashes, spaces, dots, dashes
  const parts = station.toUpperCase().split(/[\s\/.-]+/);
  // Filter out noise elements
  const noise = new Set(['RPF', 'POST', 'BRANCH', 'DIVISION', 'DIV', 'SEC', 'SECURITY', 'COY', 'COMPANY', 'OUTPOST', 'OP', 'STATION', 'STN']);
  const cleanParts = parts.filter(p => p && !noise.has(p));
  if (cleanParts.length === 0) {
    return station.trim().toUpperCase();
  }
  // Try to use the last remaining part as the core station code/name
  const core = cleanParts[cleanParts.length - 1];
  
  // Normalize HQ identifiers
  if (core === 'HQ' || core === 'HEADQUARTER' || core === 'HEADQUARTERS') {
    return 'HQ';
  }
  return core;
}

/**
 * Check if a station is the headquarters station.
 */
function isStationHq(station: string, hqStation: string): boolean {
  const cleanS = cleanStation(station);
  if (!cleanS) return false;
  if (cleanS === 'HQ') return true;
  
  const cleanH = cleanStation(hqStation);
  return cleanS === cleanH;
}

/**
 * Sweeps the entire list of journey rows to enforce unique same-day calculation logic.
 * If multiple journeys occur on the same date:
 * - Finds the earliest departure and latest arrival among all rows on that date.
 * - Computes the total-day daily absence slab based on this range.
 * - Restricts the daily allowance to the first row of that date (main row).
 * - Forces subsequent rows on that date to 0 slab and 0 amount (descriptive/same-day linked rows).
 */
export function recalculateJourneysWithSameDayLogic(
  journeys: JourneyRow[], 
  useHqSplitLogic: boolean = false,
  officerHq?: string
): JourneyRow[] {
  // Group rows by Date
  const dateGroups: { [date: string]: JourneyRow[] } = {};
  
  journeys.forEach(j => {
    if (!j.date) return;
    if (!dateGroups[j.date]) {
      dateGroups[j.date] = [];
    }
    dateGroups[j.date].push(j);
  });

  const uniqueDatesSorted = Object.keys(dateGroups).sort();

  // Find HQ station code dynamically based on the first journey's starting station of the journal
  let hqStation = 'BUF'; // Default fallback
  if (officerHq) {
    hqStation = cleanStation(officerHq);
  } else if (uniqueDatesSorted.length > 0) {
    const firstDateRows = dateGroups[uniqueDatesSorted[0]];
    const sortedDay0 = [...firstDateRows].sort((a, b) => compareDepartureTimes(a.timeLeft, b.timeLeft));
    if (sortedDay0[0] && sortedDay0[0].fromStation) {
      hqStation = cleanStation(sortedDay0[0].fromStation);
    }
  }

  // Calculate and map correct outputs
  const updatedValueMap = new Map<string, { autoSlab: 30 | 70 | 100 | 0; calculatedAmount: number }>();
  const mainRowIds = new Set<string>();

  Object.entries(dateGroups).forEach(([date, rows]) => {
    // Separate rows that are manually overridden as 'Same Day (Nil)' or are special travel continuance rows from merging calculations
    const manualNilRows = rows.filter(r => r.overrideSlab === 'Same Day (Nil)' || r.mode === 'TA Journey continue from previous month' || r.mode === 'TA journey continue to next month');
    const mergeableRows = rows.filter(r => r.overrideSlab !== 'Same Day (Nil)' && r.mode !== 'TA Journey continue from previous month' && r.mode !== 'TA journey continue to next month');

    // For manual Nil rows, set autoSlab = 0 and calculatedAmount = 0 immediately
    manualNilRows.forEach(row => {
      updatedValueMap.set(row.id, { autoSlab: 0, calculatedAmount: 0 });
    });

    if (mergeableRows.length === 0) {
      return;
    }

    // Sort rows of the day to identify starting and ending destinations
    const sortedDayRows = [...mergeableRows].sort((a, b) => compareDepartureTimes(a.timeLeft, b.timeLeft));
    if (sortedDayRows.length > 0) {
      mainRowIds.add(sortedDayRows[0].id);
    }
    const firstRowOfDay = sortedDayRows[0];
    const lastRowOfDay = sortedDayRows[sortedDayRows.length - 1];

    const dayStartStation = cleanStation(firstRowOfDay.fromStation);
    const dayEndStation = cleanStation(lastRowOfDay.toStation);

    const calculateSingleRowSlabAndAmount = (singleRow: JourneyRow) => {
      const isStartHq = isStationHq(singleRow.fromStation, hqStation);
      const effectiveTimeLeft = isStartHq ? singleRow.timeLeft : '00:00';
      let slab = singleRow.mode === 'Halted' ? 100 : calculateAbsenceSlab(effectiveTimeLeft, singleRow.timeArrived);
      
      // Multi-day/Overnight continuous tour analysis
      if (singleRow.mode !== 'Halted') {
        const isEndHq = isStationHq(singleRow.toStation, hqStation);
        const isArrivalFromAway = (!effectiveTimeLeft || effectiveTimeLeft === '--') && (singleRow.timeArrived && singleRow.timeArrived !== '--') && isEndHq;
        const isIntermediateDay = !isStartHq && !isEndHq && !isArrivalFromAway;
        const isDepartureDayOut = isStartHq && !isEndHq;

        if (isDepartureDayOut) {
          // Started from HQ but did not return today (continues overnight / next day)
          slab = 100;
        } else if (isIntermediateDay) {
          // Entire calendar day spent away from HQ: 100% full day halt allowance
          const hasArrivalToday = singleRow.timeArrived && singleRow.timeArrived !== '--';
          if (!hasArrivalToday) {
            slab = 100;
          }
        }
      }

      let daysCount = 1;
      if (singleRow.mode === 'Halted' && singleRow.date && singleRow.dateEnd && singleRow.dateEnd >= singleRow.date) {
        try {
          const d1 = new Date(singleRow.date);
          const d2 = new Date(singleRow.dateEnd);
          const diffTime = Math.abs(d2.getTime() - d1.getTime());
          const calculated = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
          if (!isNaN(calculated) && calculated > 0) {
            daysCount = calculated;
          }
        } catch {
          daysCount = 1;
        }
      }

      let amount = 0;
      if (singleRow.overrideSlab === 'Manual') {
        amount = singleRow.manualAmount !== undefined ? singleRow.manualAmount : (singleRow.calculatedAmount || 0);
      } else {
        const activePercent = singleRow.overrideSlab === 'Auto' ? slab : (singleRow.overrideSlab === 'Same Day (Nil)' ? 0 : Number(singleRow.overrideSlab));
        amount = Number((singleRow.dailyRate * (activePercent / 100) * daysCount).toFixed(2));
      }
      return { autoSlab: slab as 30 | 70 | 100 | 0, calculatedAmount: amount };
    };

    if (useHqSplitLogic) {
      // --- SPECIALLY DESIGNED HQ RETURN & DEPART SAME DAY PERCENTAGE ADDITION LOGIC ---
      let cumulativeEarned = 0;
      
      sortedDayRows.forEach((row) => {
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

        const isRowStartHq = isStationHq(row.fromStation, hqStation);
        const effectiveTimeLeft = isRowStartHq ? row.timeLeft : '00:00';
        let legSlab = row.mode === 'Halted' ? 100 : calculateAbsenceSlab(effectiveTimeLeft, row.timeArrived);
        
        let autoSlab: 30 | 70 | 100 | 0 = 0;
        if (cumulativeEarned >= 100) {
          autoSlab = 0;
        } else if (cumulativeEarned === 70) {
          autoSlab = 30; // "agar same day me pahle 70% TA ban chuka hai to baki jitna bhi time kyu na lage usi din me 30% hi TA banega"
        } else if (cumulativeEarned === 30) {
          // "aur agar pahle 30% TA ban chuka hai to baki bache time ke hisab se TA ka % banega"
          // "jaise less than 6 hours ke liye 30% aur less than 12 hour and more than 06 hours ke liye 70% TA banega"
          if (legSlab <= 30) {
            autoSlab = 30;
          } else {
            autoSlab = 70; // 6h to 12h or more gets capped at remaining 70% to complete 100%
          }
        } else if (cumulativeEarned === 0) {
          autoSlab = legSlab;
        } else {
          // Generative fallback for any other custom numbers
          const maxRemaining = 100 - cumulativeEarned;
          if (maxRemaining > 0) {
            autoSlab = Math.min(legSlab, maxRemaining) as any;
          } else {
            autoSlab = 0;
          }
        }

        let amount = 0;
        let activePercent = 0;
        if (row.overrideSlab === 'Manual') {
          amount = row.manualAmount !== undefined ? row.manualAmount : (row.calculatedAmount || 0);
          activePercent = row.dailyRate > 0 ? Math.round((amount / (row.dailyRate * daysCount)) * 100) : 0;
        } else {
          activePercent = row.overrideSlab === 'Auto' ? autoSlab : (row.overrideSlab === 'Same Day (Nil)' ? 0 : Number(row.overrideSlab));
          amount = Number((row.dailyRate * (activePercent / 100) * daysCount).toFixed(2));
        }
        updatedValueMap.set(row.id, { autoSlab: autoSlab, calculatedAmount: amount });

        // Accumulate percentage earned on this day
        cumulativeEarned += activePercent;
      });
    } else {
      // Treat each same-day row as a completely normal individual journey
      mergeableRows.forEach((row) => {
        const result = calculateSingleRowSlabAndAmount(row);
        updatedValueMap.set(row.id, result);
      });
    }
  });

  // Re-map the journeys state
  return journeys.map(j => {
    const updated = updatedValueMap.get(j.id);
    if (updated) {
      if (j.overrideSlab === 'Same Day (Nil)') {
        return {
          ...j,
          autoSlab: 0,
          calculatedAmount: 0,
          overrideSlab: 'Same Day (Nil)'
        };
      }
      return {
        ...j,
        autoSlab: updated.autoSlab,
        calculatedAmount: updated.calculatedAmount,
        overrideSlab: j.overrideSlab
      };
    }
    return j;
  });
}

/**
 * Resolves the real account owner name and contact for a TA Journal.
 * Ensures that if a claim was submitted from or for a specific staff member (e.g., Shalu Kumari, Munna Kumar Ray),
 * it shows their own account name and never shows an unrelated account like "Mantosh Kumar".
 */
export function resolveJournalAccountOwner(
  journal: TAJournal,
  profiles: OfficerProfile[] = [],
  adminUsers: { id: string; name: string; email?: string; pfNumber?: string }[] = []
): { name: string; email?: string; id?: string } {
  const profile = profiles.find(p => p.id === journal.profileId)
    || (journal.pfNumber ? profiles.find(p => p.pfNumber && p.pfNumber.trim() === journal.pfNumber.trim()) : undefined)
    || (journal.officerName ? profiles.find(p => p.name && p.name.trim().toLowerCase() === journal.officerName.trim().toLowerCase()) : undefined);

  const officerName = (journal.officerName || profile?.name || '').trim();
  const pfNumber = (journal.pfNumber || profile?.pfNumber || '').trim();

  // 1. If explicit accountHolderName exists on the journal
  if (journal.accountHolderName && journal.accountHolderName.trim()) {
    const rawAccount = journal.accountHolderName.trim();
    // Guard against stale "Mantosh Kumar" stamp on claims that actually belong to another officer
    if (rawAccount.toLowerCase() === 'mantosh kumar' && officerName && officerName.toLowerCase() !== 'mantosh kumar') {
      return {
        name: officerName,
        email: journal.adminOwnerEmail && journal.adminOwnerEmail.includes('@') ? journal.adminOwnerEmail : undefined,
        id: journal.adminOwnerId
      };
    }
    return {
      name: rawAccount,
      email: journal.adminOwnerEmail && journal.adminOwnerEmail.includes('@') ? journal.adminOwnerEmail : undefined,
      id: journal.adminOwnerId
    };
  }

  // 2. Look for matching registered user account by PF or Name
  if (adminUsers && adminUsers.length > 0) {
    if (pfNumber) {
      const matchByPf = adminUsers.find(u => u.pfNumber && u.pfNumber.trim() === pfNumber);
      if (matchByPf && matchByPf.name && !matchByPf.name.startsWith('Officer (') && !matchByPf.name.startsWith('User (')) {
        return { name: matchByPf.name, email: matchByPf.email, id: matchByPf.id };
      }
    }
    if (officerName) {
      const matchByName = adminUsers.find(u => u.name && u.name.trim().toLowerCase() === officerName.toLowerCase());
      if (matchByName && matchByName.name) {
        return { name: matchByName.name, email: matchByName.email, id: matchByName.id };
      }
    }
    if (journal.adminOwnerEmail && journal.adminOwnerEmail.includes('@')) {
      const matchByEmail = adminUsers.find(u => u.email && u.email.toLowerCase() === journal.adminOwnerEmail?.toLowerCase());
      if (matchByEmail && matchByEmail.name) {
        return { name: matchByEmail.name, email: matchByEmail.email, id: matchByEmail.id };
      }
    }
  }

  // 3. Check adminOwnerId
  if (journal.adminOwnerId && adminUsers && adminUsers.length > 0) {
    const owner = adminUsers.find(u => u.id === journal.adminOwnerId);
    if (owner && owner.name) {
      const isOwnerAdmin = owner.email?.toLowerCase() === 'nitesh0724@gmail.com' || owner.id === 'admin';
      const namesMatch = officerName && owner.name.trim().toLowerCase() === officerName.toLowerCase();
      
      // If names match or the owner is the main developer/admin account, use owner's name
      if (isOwnerAdmin || namesMatch) {
        return { name: owner.name, email: owner.email, id: owner.id };
      }
      // If owner is "Mantosh Kumar" (or any other user) but the journal's officer is "Shalu Kumari" / "Munna Kumar Ray",
      // do NOT display Mantosh Kumar! Return officerName!
    }
  }

  // 4. Default: The account of the claimant officer who filled this TA journal
  if (officerName) {
    return {
      name: officerName,
      email: journal.adminOwnerEmail && journal.adminOwnerEmail.includes('@') ? journal.adminOwnerEmail : undefined,
      id: journal.adminOwnerId
    };
  }

  if (profile && profile.name) {
    return {
      name: profile.name,
      email: profile.email || profile.mobileNumber,
      id: profile.adminOwnerId || profile.id
    };
  }

  return {
    name: (journal.adminOwnerEmail && !journal.adminOwnerEmail.toLowerCase().includes('mantosh')) ? journal.adminOwnerEmail : 'Staff Account',
    email: journal.adminOwnerEmail,
    id: journal.adminOwnerId
  };
}
