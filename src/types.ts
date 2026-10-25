/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface OfficerProfile {
  id: string;
  pfNumber: string;
  name: string;
  designation: string;
  branch: string;
  division: string;
  headquarter: string;
  basicPay: number;
  scaleOfPay: string;
  dateOfAppointment: string;
  ruleGoverned: string;
  billUnit?: string;
  gradePay: number;
  photoUrl?: string | null;
  mobileNumber?: string;
  email?: string;
  darkMode?: boolean;
  adminOwnerId?: string;
  adminOwnerEmail?: string;
}

export type JourneyMode = 'Train' | 'Road' | string;
export type DayNightType = 'Day' | 'Night' | 'Both' | 'None';

export interface JourneyRow {
  id: string;
  date: string; // YYYY-MM-DD
  dateEnd?: string; // YYYY-MM-DD (Optional, for 'Halted' mode ranges)
  mode: JourneyMode;
  trainNo?: string;
  timeLeft: string; // HH:MM (24h format)
  timeArrived: string; // HH:MM (24h format)
  fromStation: string;
  toStation: string;
  kms: number;
  dayNight: DayNightType;
  objectOfJourney: string;
  dailyRate: number; // Configured base rate for this officer/staff
  overrideSlab: '30' | '70' | '100' | '0' | 'Same Day (Nil)' | 'Auto' | 'Manual'; // Option to override automatic calculations
  autoSlab: 30 | 70 | 100 | 0; // The calculated slab based on absence time
  calculatedAmount: number; // The computed TA amount for this row
  manualAmount?: number; // Custom manually entered amount for this row
  customDaysNight?: string; // Custom manual keyboard entry for Days/Night column
}

export interface TAJournal {
  id: string;
  profileId: string; // links to OfficerProfile
  monthClaimed: string; // YYYY-MM
  journeys: JourneyRow[];
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  allowanceType: string; // Usually "TA"
  freePassAllowed: 'Allowed' | 'Not Allowed' | 'None';
  useHqSplitLogic?: boolean;
  
  // Quick pre-computed totals for display/history
  percentage30Days: number;
  percentage70Days: number;
  percentage100Days: number;
  totalDays: number;
  totalAmount: number;
  adminOwnerId?: string;
  adminOwnerEmail?: string;
  officerName?: string;
  pfNumber?: string;
  accountHolderName?: string; // Name of account holder who filled/submitted this claim
}

export interface TARateRule {
  id: string;
  name: string; // e.g. "Constable / Head Constable / Level 1-5"
  basicPayMin: number;
  basicPayMax: number;
  ratePerDay: number;
}

export interface FeedbackEntry {
  id: string;
  userId: string;
  type: 'complaint' | 'experience';
  title: string;
  description: string;
  senderName: string;
  senderPfNumber: string;
  senderEmail: string;
  createdAt: string;
  reply?: string;
  repliedAt?: string;
}

export interface ContactConfig {
  email: string;
  phone: string;
  updatedAt?: string;
}
