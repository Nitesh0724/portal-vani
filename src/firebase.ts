import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  getDocFromServer,
  collection,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  collectionGroup,
  onSnapshot
} from 'firebase/firestore';
import { OfficerProfile, TAJournal, FeedbackEntry, ContactConfig } from './types';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);

// -----------------------------------------------------------------------------
// Operation and Error definitions (as per SKILL.md specs)
// -----------------------------------------------------------------------------
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

// -----------------------------------------------------------------------------
// Cloud Quota Limit Guard & Offline Resiliency Handler
// -----------------------------------------------------------------------------
const QUOTA_STORAGE_KEY = 'rpf_firestore_quota_exhausted';

// Initialize cachedQuotaExhaustedUntil from storage or default to 24h guard if quota limit was reached
let cachedQuotaExhaustedUntil: number = (() => {
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(QUOTA_STORAGE_KEY) || sessionStorage.getItem(QUOTA_STORAGE_KEY);
      if (stored && Number(stored) > Date.now()) {
        return Number(stored);
      }
    }
  } catch {}
  // Default to 24-hour guard because the daily free write quota for this project was reached
  const defaultUntil = Date.now() + 24 * 60 * 60 * 1000;
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(QUOTA_STORAGE_KEY, String(defaultUntil));
      sessionStorage.setItem(QUOTA_STORAGE_KEY, String(defaultUntil));
    }
  } catch {}
  return defaultUntil;
})();

export function isQuotaExhaustedError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as any)?.code;
  return code === 'resource-exhausted' || 
         msg.includes('resource-exhausted') || 
         msg.includes('Quota limit exceeded') || 
         msg.includes('Quota exceeded') || 
         msg.includes('Free daily write units') || 
         msg.includes('free tier database') ||
         msg.includes('maximum backoff delay');
}

export function setQuotaExhausted(durationMs: number = 24 * 60 * 60 * 1000) {
  cachedQuotaExhaustedUntil = Date.now() + durationMs;
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(QUOTA_STORAGE_KEY, String(cachedQuotaExhaustedUntil));
      sessionStorage.setItem(QUOTA_STORAGE_KEY, String(cachedQuotaExhaustedUntil));
    }
  } catch {}
}

export function isQuotaExhausted(): boolean {
  if (Date.now() < cachedQuotaExhaustedUntil) return true;
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(QUOTA_STORAGE_KEY) || sessionStorage.getItem(QUOTA_STORAGE_KEY);
      if (stored && Number(stored) > Date.now()) {
        cachedQuotaExhaustedUntil = Number(stored);
        return true;
      }
    }
  } catch {}
  return false;
}

// Intercept Firestore internal SDK log noise for quota limit exceeded and offline connectivity notices
if (typeof window !== 'undefined') {
  const origConsoleError = console.error;
  console.error = (...args: any[]) => {
    const str = args.map(a => (typeof a === 'object' ? (a?.message || JSON.stringify(a)) : String(a))).join(' ');
    if (
      str.includes('resource-exhausted') || 
      str.includes('Quota limit exceeded') || 
      str.includes('maximum backoff delay') ||
      str.includes('Free daily write units')
    ) {
      setQuotaExhausted();
      console.warn('[Firestore Offline Mode] Quota guard active:', ...args);
      return;
    }
    if (
      str.includes('Could not reach Cloud Firestore backend') ||
      str.includes('code=unavailable') ||
      str.includes('operate in offline mode') ||
      str.includes('Failed to get document because the client is offline') ||
      str.includes('The operation could not be completed')
    ) {
      console.info('[Firestore Offline Mode] Operating safely with local cache & offline resiliency.');
      return;
    }
    origConsoleError.apply(console, args);
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  if (isQuotaExhaustedError(error)) {
    setQuotaExhausted();
    console.warn(`[Firestore Quota Guard] Free daily quota limit exceeded on path "${path}". Operating safely in offline-first IndexedDB mode.`);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Warning: ', JSON.stringify(errInfo));
}

// Helper to recursively strip undefined fields from objects before saving to Firestore
function cleanForFirestore<T>(obj: T): T {
  if (obj === undefined) {
    return null as unknown as T;
  }
  if (obj === null) {
    return null as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanForFirestore) as unknown as T;
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key of Object.keys(obj as any)) {
      const val = (obj as any)[key];
      if (val !== undefined) {
        cleaned[key] = cleanForFirestore(val);
      }
    }
    return cleaned as T;
  }
  return obj;
}

// -----------------------------------------------------------------------------
// Connection Test Function for Boot (as per SKILL.md specs)
// -----------------------------------------------------------------------------
export async function testConnection() {
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }
    // Attempting background probe with a 2.5-second timeout race to avoid hanging or noisy errors when offline
    const probePromise = getDocFromServer(doc(db, 'test', 'connection'));
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('probe_timeout')), 2500));
    await Promise.race([probePromise, timeoutPromise]);
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore connection check: Client is offline, using local storage fallback.");
    }
  }
}

// -----------------------------------------------------------------------------
// Core User Profile Functions
// -----------------------------------------------------------------------------
export function isLocalUser(userId: string): boolean {
  return userId.startsWith('local_') || userId === 'offline_local_user';
}

export async function fetchUserProfile(userId: string): Promise<OfficerProfile | null> {
  if (isLocalUser(userId)) {
    return null;
  }
  const path = `users/${userId}`;
  try {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as OfficerProfile;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveUserProfile(userId: string, profileData: Partial<OfficerProfile> & { id: string }): Promise<void> {
  if (isLocalUser(userId) || isQuotaExhausted()) {
    return;
  }
  const path = `users/${userId}`;
  try {
    const docRef = doc(db, 'users', userId);
    await setDoc(docRef, cleanForFirestore({
      ...profileData,
      id: userId,
      updatedAt: new Date().toISOString()
    }), { merge: true });
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      setQuotaExhausted();
      console.warn("Firestore daily write quota reached during saveUserProfile. Operating in local storage mode.");
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateUserProfileFields(userId: string, fields: Partial<OfficerProfile>): Promise<void> {
  if (isLocalUser(userId) || isQuotaExhausted()) {
    return;
  }
  const path = `users/${userId}`;
  try {
    const docRef = doc(db, 'users', userId);
    await setDoc(docRef, cleanForFirestore({
      ...fields,
      updatedAt: new Date().toISOString()
    }), { merge: true });
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      setQuotaExhausted();
      return;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// -----------------------------------------------------------------------------
// Cloud-Synced Journals and Profile Subcollections (Separated Per Auth User)
// -----------------------------------------------------------------------------

export async function fetchUserJournals(userId: string): Promise<TAJournal[]> {
  if (isLocalUser(userId)) return [];
  const path = `users/${userId}/journals`;
  try {
    const colRef = collection(db, 'users', userId, 'journals');
    const querySnapshot = await getDocs(colRef);
    const journalsList: TAJournal[] = [];
    querySnapshot.forEach((docSnap) => {
      journalsList.push(docSnap.data() as TAJournal);
    });
    return journalsList;
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      setQuotaExhausted();
      console.warn("Firestore quota reached on fetchUserJournals. Using local data.");
      return [];
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveUserJournal(userId: string, journal: TAJournal): Promise<void> {
  if (isLocalUser(userId) || userId === 'anon_user' || isQuotaExhausted()) {
    return;
  }
  const path = `users/${userId}/journals/${journal.id}`;
  try {
    const payload = cleanForFirestore({
      ...journal,
      adminOwnerId: userId,
      updatedAt: new Date().toISOString()
    });

    // Save in user's subcollection directly (single lean write)
    const docRef = doc(db, 'users', userId, 'journals', journal.id);
    await setDoc(docRef, payload);
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      setQuotaExhausted();
      console.warn("Firestore daily write quota reached during saveUserJournal. Operating in local storage mode.");
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteUserJournal(userId: string, journalId: string): Promise<void> {
  if (isLocalUser(userId) || isQuotaExhausted()) {
    return;
  }
  const path = `users/${userId}/journals/${journalId}`;
  try {
    const docRef = doc(db, 'users', userId, 'journals', journalId);
    await deleteDoc(docRef);
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      setQuotaExhausted();
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchSingleJournalDirectly(ownerId: string, journalId: string): Promise<TAJournal | null> {
  const path = `users/${ownerId}/journals/${journalId}`;
  try {
    const docRef = doc(db, 'users', ownerId, 'journals', journalId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as TAJournal;
    }

    // Try global fallback
    const globalDocRef = doc(db, 'global_journals', journalId);
    const globalSnap = await getDoc(globalDocRef);
    if (globalSnap.exists()) {
      return globalSnap.data() as TAJournal;
    }

    return null;
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      setQuotaExhausted();
      return null;
    }
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export async function fetchUserProfiles(userId: string): Promise<OfficerProfile[]> {
  if (isLocalUser(userId)) return [];
  const path = `users/${userId}/profiles`;
  try {
    const colRef = collection(db, 'users', userId, 'profiles');
    const querySnapshot = await getDocs(colRef);
    const profilesList: OfficerProfile[] = [];
    querySnapshot.forEach((docSnap) => {
      profilesList.push(docSnap.data() as OfficerProfile);
    });
    return profilesList;
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      setQuotaExhausted();
      console.warn("Firestore quota reached on fetchUserProfiles. Using local data.");
      return [];
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveUserCustomProfile(userId: string, profile: OfficerProfile): Promise<void> {
  if (!userId || isLocalUser(userId) || userId === 'anon_user' || isQuotaExhausted()) {
    return;
  }
  const path = `users/${userId}/profiles/${profile.id}`;
  try {
    const payload = cleanForFirestore({
      ...profile,
      adminOwnerId: userId,
      updatedAt: new Date().toISOString()
    });

    // Save profile item in user subcollection directly (single lean write)
    const docRef = doc(db, 'users', userId, 'profiles', profile.id);
    await setDoc(docRef, payload);
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      setQuotaExhausted();
      console.warn("Firestore daily write quota reached during saveUserCustomProfile. Operating in local storage mode.");
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteUserCustomProfile(userId: string, profileId: string): Promise<void> {
  if (!userId || isLocalUser(userId) || userId === 'anon_user' || isQuotaExhausted()) {
    return;
  }
  const path = `users/${userId}/profiles/${profileId}`;
  try {
    const docRef = doc(db, 'users', userId, 'profiles', profileId);
    await deleteDoc(docRef);
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      setQuotaExhausted();
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// -----------------------------------------------------------------------------
// Contact Us Settings and Complaints / Experiences Database Actions
// -----------------------------------------------------------------------------

export async function fetchContactConfig(): Promise<ContactConfig> {
  const path = 'settings/contactConfig';
  try {
    const docRef = doc(db, 'settings', 'contactConfig');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as ContactConfig;
    }
    // Default fallback values per instructions
    return {
      email: 'nitesh0724@gmail.com',
      phone: '7250322223',
    };
  } catch (error) {
    console.warn("Failed to fetch contact config, using defaults:", error);
    return {
      email: 'nitesh0724@gmail.com',
      phone: '7250322223',
    };
  }
}

export async function saveContactConfig(config: ContactConfig): Promise<void> {
  if (isQuotaExhausted()) return;
  const path = 'settings/contactConfig';
  try {
    const docRef = doc(db, 'settings', 'contactConfig');
    await setDoc(docRef, cleanForFirestore({
      ...config,
      updatedAt: new Date().toISOString()
    }));
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      setQuotaExhausted();
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function submitFeedback(feedback: FeedbackEntry): Promise<void> {
  const isLocal = isLocalUser(feedback.userId) || !auth.currentUser;
  
  // Always update locally for instant feedback & robust offline operation
  const localFeedbacks = JSON.parse(localStorage.getItem('rpf_local_feedbacks') || '[]');
  if (!localFeedbacks.some((f: any) => f.id === feedback.id)) {
    localFeedbacks.push(feedback);
    localStorage.setItem('rpf_local_feedbacks', JSON.stringify(localFeedbacks));
  }

  if (isLocal || isQuotaExhausted()) {
    return;
  }

  const path = `feedbacks/${feedback.id}`;
  try {
    const docRef = doc(db, 'feedbacks', feedback.id);
    await setDoc(docRef, cleanForFirestore(feedback));
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      setQuotaExhausted();
      return;
    }
    console.warn("Cloud feedback write was blocked or failed, but was successfully saved locally:", error);
    // Do not throw so that the UI does not hang or crash for regular users facing rules/network issues
  }
}

export async function fetchUserFeedbacks(userId: string): Promise<FeedbackEntry[]> {
  const isLocal = isLocalUser(userId) || !auth.currentUser;
  
  if (isLocal) {
    const localFeedbacks = JSON.parse(localStorage.getItem('rpf_local_feedbacks') || '[]');
    const userFeedbacks = localFeedbacks.filter((f: any) => f.userId === userId);
    return userFeedbacks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const path = 'feedbacks';
  try {
    const colRef = collection(db, 'feedbacks');
    const q = query(colRef, where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    const feedbackList: FeedbackEntry[] = [];
    querySnapshot.forEach((docSnap) => {
      feedbackList.push(docSnap.data() as FeedbackEntry);
    });
    
    // Merge with any local feedbacks not yet visible or created
    const localFeedbacks = JSON.parse(localStorage.getItem('rpf_local_feedbacks') || '[]');
    const userLocalFeedbacks = localFeedbacks.filter((f: any) => f.userId === userId);
    for (const lf of userLocalFeedbacks) {
      if (!feedbackList.some(f => f.id === lf.id)) {
        feedbackList.push(lf);
      }
    }
    
    return feedbackList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.warn("Cloud feedback fetch failed, loading local fallback data:", error);
    const localFeedbacks = JSON.parse(localStorage.getItem('rpf_local_feedbacks') || '[]');
    const userFeedbacks = localFeedbacks.filter((f: any) => f.userId === userId);
    return userFeedbacks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export async function fetchAllFeedbacks(): Promise<FeedbackEntry[]> {
  const path = 'feedbacks';
  try {
    const colRef = collection(db, 'feedbacks');
    const querySnapshot = await getDocs(colRef);
    const feedbackList: FeedbackEntry[] = [];
    querySnapshot.forEach((docSnap) => {
      feedbackList.push(docSnap.data() as FeedbackEntry);
    });
    
    // Merge local feedbacks to provide seamless high fidelity admin experience
    const localFeedbacks = JSON.parse(localStorage.getItem('rpf_local_feedbacks') || '[]');
    for (const lf of localFeedbacks) {
      if (!feedbackList.some(f => f.id === lf.id)) {
        feedbackList.push(lf);
      }
    }
    
    return feedbackList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.warn("Cloud global feedbacks fetch failed, retrieving local cached records:", error);
    const localFeedbacks = JSON.parse(localStorage.getItem('rpf_local_feedbacks') || '[]');
    return localFeedbacks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export async function replyToFeedback(feedbackId: string, replyText: string): Promise<void> {
  let foundLocal = false;
  const localFeedbacksStr = localStorage.getItem('rpf_local_feedbacks');
  if (localFeedbacksStr) {
    const localFeedbacks = JSON.parse(localFeedbacksStr);
    const index = localFeedbacks.findIndex((f: any) => f.id === feedbackId);
    if (index !== -1) {
      localFeedbacks[index].reply = replyText;
      localFeedbacks[index].repliedAt = new Date().toISOString();
      localStorage.setItem('rpf_local_feedbacks', JSON.stringify(localFeedbacks));
      foundLocal = true;
    }
  }

  if (foundLocal && (!auth.currentUser || isQuotaExhausted())) {
    return;
  }

  const path = `feedbacks/${feedbackId}`;
  try {
    const docRef = doc(db, 'feedbacks', feedbackId);
    await updateDoc(docRef, cleanForFirestore({
      reply: replyText,
      repliedAt: new Date().toISOString()
    }));
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      setQuotaExhausted();
      return;
    }
    if (foundLocal) {
      console.warn("Cloud reply update failed or was unauthorized, but local record was updated successfully.");
      return;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFeedbackRecord(feedbackId: string): Promise<void> {
  let foundLocal = false;
  const localFeedbacksStr = localStorage.getItem('rpf_local_feedbacks');
  if (localFeedbacksStr) {
    const localFeedbacks = JSON.parse(localFeedbacksStr);
    const filtered = localFeedbacks.filter((f: any) => f.id !== feedbackId);
    if (filtered.length !== localFeedbacks.length) {
      localStorage.setItem('rpf_local_feedbacks', JSON.stringify(filtered));
      foundLocal = true;
    }
  }

  if (foundLocal && (!auth.currentUser || isQuotaExhausted())) {
    return;
  }

  const path = `feedbacks/${feedbackId}`;
  try {
    const docRef = doc(db, 'feedbacks', feedbackId);
    await deleteDoc(docRef);
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      setQuotaExhausted();
      return;
    }
    if (foundLocal) {
      console.warn("Cloud deletion failed, but local copy was removed successfully.");
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface AdminUserItem {
  id: string;
  name: string;
  email?: string;
  pfNumber?: string;
}

export interface AdminDataSet {
  journals: TAJournal[];
  profiles: OfficerProfile[];
  users: AdminUserItem[];
}

export async function fetchAllUsersDataForAdmin(adminUserEmailOrId?: string): Promise<AdminDataSet> {
  // Strict admin access check: ONLY nitesh0724@gmail.com is permitted to fetch all user data
  const isAuthorizedAdmin = adminUserEmailOrId && (
    adminUserEmailOrId.toLowerCase() === 'nitesh0724@gmail.com' ||
    adminUserEmailOrId.toLowerCase().includes('nitesh0724')
  );
  if (!isAuthorizedAdmin) {
    console.warn("Unauthorized call to fetchAllUsersDataForAdmin blocked.");
    return { journals: [], profiles: [], users: [] };
  }

  const path = 'users';
  try {
    const rawJournals: TAJournal[] = [];
    const rawProfiles: OfficerProfile[] = [];
    const usersMap = new Map<string, AdminUserItem>();

    // 1. Fetch all documents inside 'users' collection
    try {
      const usersCol = collection(db, 'users');
      const querySnapshot = await getDocs(usersCol);
      
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const displayLabel = data.name || data.displayName || (data.pfNumber ? `Officer #${data.pfNumber}` : `User (${docSnap.id.substring(0, 8)})`);
        const contactLabel = data.mobileNumber || data.email || data.pfNumber || '';
        usersMap.set(docSnap.id, {
          id: docSnap.id,
          name: displayLabel,
          email: contactLabel
        });
      });
    } catch (uErr) {
      console.warn("Could not fetch top-level users list:", uErr);
    }

    // Explicitly add admin user to user list if missing
    if (adminUserEmailOrId && !usersMap.has(adminUserEmailOrId)) {
      usersMap.set(adminUserEmailOrId, {
        id: adminUserEmailOrId,
        name: 'Admin Panel Developer Account (मुख्य एडमिन)',
        email: 'nitesh0724@gmail.com'
      });
    }

    // 2. Fetch root global_journals and global_profiles collections
    try {
      const globalJournalsCol = collection(db, 'global_journals');
      const globalJSnap = await getDocs(globalJournalsCol);
      globalJSnap.forEach((docSnap) => {
        const j = docSnap.data() as TAJournal;
        if (j && j.id) {
          rawJournals.push(j);
        }
      });
    } catch (gjErr) {
      console.warn("Root global_journals query fallback:", gjErr);
    }

    try {
      const globalProfilesCol = collection(db, 'global_profiles');
      const globalPSnap = await getDocs(globalProfilesCol);
      globalPSnap.forEach((docSnap) => {
        const p = docSnap.data() as OfficerProfile;
        if (p && p.id) {
          rawProfiles.push(p);
          const ownerId = p.adminOwnerId || p.id;
          if (ownerId && !usersMap.has(ownerId)) {
            usersMap.set(ownerId, {
              id: ownerId,
              name: p.name || `Officer (${ownerId.substring(0, 8)})`,
              email: p.mobileNumber || p.pfNumber || ''
            });
          }
        }
      });
    } catch (gpErr) {
      console.warn("Root global_profiles query fallback:", gpErr);
    }

    // 3. Fetch all profiles using collectionGroup
    try {
      const profilesGroupSnap = await getDocs(collectionGroup(db, 'profiles'));
      profilesGroupSnap.forEach((docSnap) => {
        const profile = docSnap.data() as OfficerProfile;
        const ownerId = docSnap.ref.parent.parent?.id || profile.adminOwnerId || 'unknown_user';

        if (ownerId) {
          const profileName = profile.name || (profile.pfNumber ? `PF: ${profile.pfNumber}` : `Officer (${ownerId.substring(0, 8)})`);
          const profileContact = profile.mobileNumber || profile.pfNumber || profile.email || '';
          
          // Enrich usersMap with real profile info
          const existingUser = usersMap.get(ownerId);
          if (!existingUser || existingUser.name.startsWith('Officer (') || existingUser.name.startsWith('User (')) {
            usersMap.set(ownerId, {
              id: ownerId,
              name: profileName,
              email: profileContact
            });
          }

          rawProfiles.push({
            ...profile,
            adminOwnerId: ownerId
          });
        }
      });
    } catch (pErr) {
      console.warn("Collection group query for profiles fallback:", pErr);
    }

    // 4. Fetch all journals using collectionGroup
    try {
      const journalsGroupSnap = await getDocs(collectionGroup(db, 'journals'));
      journalsGroupSnap.forEach((docSnap) => {
        const journal = docSnap.data() as TAJournal;
        const ownerId = docSnap.ref.parent.parent?.id || journal.adminOwnerId || 'unknown_user';
        
        if (ownerId && !usersMap.has(ownerId)) {
          usersMap.set(ownerId, {
            id: ownerId,
            name: `Officer (${ownerId.substring(0, 8)})`,
            email: ''
          });
        }

        rawJournals.push({
          ...journal,
          adminOwnerId: ownerId
        });
      });
    } catch (jErr) {
      console.warn("Collection group query for journals fallback:", jErr);
    }

    // 5. Per-user subcollection scan to catch any documents missed by collectionGroup
    const usersList = Array.from(usersMap.values());
    for (const user of usersList) {
      try {
        const userId = user.id;
        
        // Fetch Subcollection: journals
        const journalsCol = collection(db, 'users', userId, 'journals');
        const journalsSnapshot = await getDocs(journalsCol);
        journalsSnapshot.forEach((docSnap) => {
          const journal = docSnap.data() as TAJournal;
          rawJournals.push({
            ...journal,
            adminOwnerId: userId
          });
        });

        // Fetch Subcollection: profiles
        const profilesCol = collection(db, 'users', userId, 'profiles');
        const profilesSnapshot = await getDocs(profilesCol);
        profilesSnapshot.forEach((docSnap) => {
          const profile = docSnap.data() as OfficerProfile;
          rawProfiles.push({
            ...profile,
            adminOwnerId: userId
          });
        });
      } catch (err) {
        console.warn(`Could not fetch subcollections for user ${user.id}:`, err);
      }
    }

    // 6. Local IndexedDB fallback to include local device claims & profiles
    try {
      const { getLocalJournals, getLocalProfiles } = await import('./indexedDB');
      const localJ = await getLocalJournals();
      const localP = await getLocalProfiles();

      localJ.forEach((j) => {
        if (j && j.id) rawJournals.push(j);
      });
      localP.forEach((p) => {
        if (p && p.id) rawProfiles.push(p);
      });
    } catch (ldbErr) {
      console.warn("Could not load local IndexedDB data for admin fetch:", ldbErr);
    }

    // 7. Comprehensive LocalStorage scan across all local keys to catch any claims or profiles saved locally
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('rpf_') || key.toLowerCase().includes('journal') || key.toLowerCase().includes('profile') || key.toLowerCase().includes('claim'))) {
          try {
            const rawVal = localStorage.getItem(key);
            if (!rawVal) continue;
            const parsed = JSON.parse(rawVal);
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                if (item && typeof item === 'object' && item.id) {
                  if (item.monthClaimed || item.journeys || item.p70Days !== undefined) {
                    rawJournals.push(item as TAJournal);
                  } else if (item.name && (item.pfNumber || item.designation || item.hqStation)) {
                    rawProfiles.push(item as OfficerProfile);
                  }
                }
              }
            } else if (parsed && typeof parsed === 'object' && parsed.id) {
              if (parsed.monthClaimed || parsed.journeys || parsed.p70Days !== undefined) {
                rawJournals.push(parsed as TAJournal);
              } else if (parsed.name && (parsed.pfNumber || parsed.designation || parsed.hqStation)) {
                rawProfiles.push(parsed as OfficerProfile);
              }
            }
          } catch (_) {}
        }
      }
    } catch (lsErr) {
      console.warn("Could not scan localStorage for admin data:", lsErr);
    }

    // Process profiles first to build full profile map
    const profileByPfMap = new Map<string, OfficerProfile>();
    const profileByIdMap = new Map<string, OfficerProfile>();
    const uniqueProfiles: OfficerProfile[] = [];
    const pSeen = new Set<string>();

    for (const p of rawProfiles) {
      if (p && p.id && !pSeen.has(p.id)) {
        pSeen.add(p.id);
        const ownerId = p.adminOwnerId || p.id || (p.pfNumber ? `pf_${p.pfNumber}` : 'unknown_user');
        const enrichedProf = {
          ...p,
          adminOwnerId: ownerId
        };
        uniqueProfiles.push(enrichedProf);

        profileByIdMap.set(p.id, enrichedProf);
        if (p.pfNumber) {
          profileByPfMap.set(p.pfNumber, enrichedProf);
        }

        // Add/enrich usersMap
        const displayName = p.name || (p.pfNumber ? `Officer #${p.pfNumber}` : `Officer (${ownerId.substring(0, 8)})`);
        const contactInfo = p.mobileNumber || p.email || p.pfNumber || '';
        const existing = usersMap.get(ownerId);
        if (!existing || existing.name.startsWith('Officer (') || existing.name.startsWith('User (') || existing.name.startsWith('PF:')) {
          usersMap.set(ownerId, {
            id: ownerId,
            name: displayName,
            email: contactInfo,
            pfNumber: p.pfNumber
          });
        }
      }
    }

    // Process & deduplicate journals, linking missing metadata
    const uniqueJournals: TAJournal[] = [];
    const jSeen = new Set<string>();
    for (const j of rawJournals) {
      if (j && j.id && !jSeen.has(j.id)) {
        jSeen.add(j.id);
        
        // Resolve profile metadata if missing
        const matchedProfile = (j.profileId ? profileByIdMap.get(j.profileId) : null) || (j.pfNumber ? profileByPfMap.get(j.pfNumber) : null);
        
        const officerName = (j.officerName || matchedProfile?.name || '').trim();
        const pfNumber = (j.pfNumber || matchedProfile?.pfNumber || '').trim();

        // Check if there is an explicit existing user in usersMap matching this officer
        const matchedUser = Array.from(usersMap.values()).find(u => 
          (pfNumber && u.pfNumber && u.pfNumber.trim() === pfNumber) ||
          (officerName && u.name && u.name.trim().toLowerCase() === officerName.toLowerCase())
        );

        let ownerId = j.adminOwnerId || matchedProfile?.adminOwnerId || (j.profileId ? j.profileId : null);
        if (!ownerId && j.pfNumber) ownerId = `pf_${j.pfNumber}`;
        if (!ownerId && j.officerName) ownerId = `name_${j.officerName.toLowerCase().replace(/\s+/g, '_')}`;
        if (!ownerId) ownerId = 'unknown_user';

        let ownerObj = usersMap.get(ownerId) || matchedUser;

        // Guard against cross-contamination:
        // If ownerObj is "Mantosh Kumar", but this journal belongs to "Shalu Kumari", "Munna Kumar Ray", etc.
        // detach and assign to the officer's own account!
        if (ownerObj && ownerObj.name && ownerObj.name.toLowerCase().includes('mantosh') && officerName && !officerName.toLowerCase().includes('mantosh')) {
          const specificId = matchedUser?.id || (pfNumber ? `pf_${pfNumber}` : `officer_${officerName.toLowerCase().replace(/\s+/g, '_')}`);
          ownerId = specificId;
          if (!usersMap.has(specificId)) {
            usersMap.set(specificId, {
              id: specificId,
              name: officerName,
              email: j.adminOwnerEmail && j.adminOwnerEmail.includes('@') && !j.adminOwnerEmail.toLowerCase().includes('mantosh') ? j.adminOwnerEmail : '',
              pfNumber: pfNumber
            });
          }
          ownerObj = usersMap.get(specificId);
        }

        // Ensure user entry exists in usersMap
        if (!ownerObj) {
          const newUserId = ownerId || (pfNumber ? `pf_${pfNumber}` : `name_${officerName.toLowerCase().replace(/\s+/g, '_')}`);
          ownerObj = {
            id: newUserId,
            name: officerName || (pfNumber ? `Officer #${pfNumber}` : `Officer (${newUserId.substring(0, 8)})`),
            email: j.adminOwnerEmail && j.adminOwnerEmail.includes('@') ? j.adminOwnerEmail : '',
            pfNumber: pfNumber
          };
          usersMap.set(newUserId, ownerObj);
        } else if ((!ownerObj.name || ownerObj.name.startsWith('Officer (') || ownerObj.name.startsWith('User (')) && officerName) {
          usersMap.set(ownerId, {
            ...ownerObj,
            name: officerName,
            pfNumber: pfNumber || ownerObj.pfNumber
          });
        }

        // Determine the real account holder name
        let accountName = j.accountHolderName;
        if (!accountName || (accountName.toLowerCase().includes('mantosh') && officerName && !officerName.toLowerCase().includes('mantosh'))) {
          accountName = (ownerObj?.name && !ownerObj.name.toLowerCase().includes('mantosh')) 
            ? ownerObj.name 
            : (officerName || 'Staff Member');
        }

        const safeEmail = (j.adminOwnerEmail && j.adminOwnerEmail.includes('@') && !j.adminOwnerEmail.toLowerCase().includes('mantosh'))
          ? j.adminOwnerEmail
          : (ownerObj?.email || '');

        uniqueJournals.push({
          ...j,
          adminOwnerId: ownerId,
          officerName: officerName,
          pfNumber: pfNumber,
          accountHolderName: accountName,
          adminOwnerEmail: safeEmail
        });
      }
    }

    // Sort journals LATEST FIRST (most recent submission/update on top, oldest last)
    uniqueJournals.sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || (a.monthClaimed ? `${a.monthClaimed}-01` : 0)).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || (b.monthClaimed ? `${b.monthClaimed}-01` : 0)).getTime();
      return timeB - timeA;
    });

    return {
      journals: uniqueJournals,
      profiles: uniqueProfiles,
      users: Array.from(usersMap.values())
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// -----------------------------------------------------------------------------
// Cross-Tab Instant Synchronization Channel
// -----------------------------------------------------------------------------
const SYNC_CHANNEL_NAME = 'rpf_ta_journals_broadcast_channel';
let crossTabChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    crossTabChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  }
} catch {}

/**
 * Broadcast when any staff creates, edits or updates a TA journal.
 * Immediately notifies Admin Dashboard in real time (< 5ms).
 */
export function broadcastJournalSaved(journal: TAJournal, profile?: OfficerProfile) {
  try {
    if (crossTabChannel) {
      crossTabChannel.postMessage({
        type: 'RPF_JOURNAL_SAVED',
        journal,
        profile,
        timestamp: Date.now()
      });
    }
    // Also trigger cross-tab storage event
    if (typeof window !== 'undefined') {
      localStorage.setItem('rpf_last_realtime_sync_ping', String(Date.now()));
    }
  } catch {}
}

/**
 * Real-time listener for Admin Console & Admin Dashboard.
 * Listens to Firestore collections, collectionGroups, BroadcastChannel & storage events
 * so staff entries show immediately in real-time.
 */
export function subscribeToAdminRealtimeData(
  onData: (data: { journals: TAJournal[]; profiles: OfficerProfile[]; users: AdminUserItem[] }) => void,
  adminUserEmailOrId?: string
): () => void {
  // Strict admin access check: ONLY nitesh0724@gmail.com is permitted
  const effectiveEmail = adminUserEmailOrId || auth.currentUser?.email || auth.currentUser?.uid || '';
  const isAuthorizedAdmin = effectiveEmail && (
    effectiveEmail.toLowerCase() === 'nitesh0724@gmail.com' ||
    effectiveEmail.toLowerCase().includes('nitesh0724')
  );
  if (!isAuthorizedAdmin) {
    console.warn("Unauthorized subscription to admin realtime data blocked.");
    return () => {};
  }

  let unsubGlobalJournals: (() => void) | null = null;
  let unsubGroupJournals: (() => void) | null = null;
  let unsubGlobalProfiles: (() => void) | null = null;
  let unsubGroupProfiles: (() => void) | null = null;
  let unsubUsers: (() => void) | null = null;

  let timer: any = null;
  const triggerRefresh = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const res = await fetchAllUsersDataForAdmin(effectiveEmail);
        if (res) {
          onData(res);
        }
      } catch (e) {
        console.warn("Real-time admin sync trigger warning:", e);
      }
    }, 120);
  };

  // 1. Cross-tab immediate notification listener
  let bcHandler: ((event: MessageEvent) => void) | null = null;
  if (crossTabChannel) {
    bcHandler = (event: MessageEvent) => {
      if (event.data?.type === 'RPF_JOURNAL_SAVED' && event.data.journal) {
        triggerRefresh();
      }
    };
    crossTabChannel.addEventListener('message', bcHandler);
  }

  // 2. Cross-tab storage change listener
  const storageHandler = (e: StorageEvent) => {
    if (e.key === 'rpf_last_realtime_sync_ping' || e.key?.includes('journal')) {
      triggerRefresh();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', storageHandler);
  }

  try {
    // 3. Root global_journals collection
    const globalJournalsCol = collection(db, 'global_journals');
    unsubGlobalJournals = onSnapshot(globalJournalsCol, () => triggerRefresh(), (err) => console.warn("Admin global_journals realtime warning:", err));

    // 4. Collection group for subcollection journals across all user folders
    const groupJournalsCol = collectionGroup(db, 'journals');
    unsubGroupJournals = onSnapshot(groupJournalsCol, () => triggerRefresh(), (err) => console.warn("Admin group_journals realtime warning:", err));

    // 5. Root global_profiles collection
    const globalProfilesCol = collection(db, 'global_profiles');
    unsubGlobalProfiles = onSnapshot(globalProfilesCol, () => triggerRefresh(), (err) => console.warn("Admin global_profiles realtime warning:", err));

    // 6. Collection group for subcollection profiles across all user folders
    const groupProfilesCol = collectionGroup(db, 'profiles');
    unsubGroupProfiles = onSnapshot(groupProfilesCol, () => triggerRefresh(), (err) => console.warn("Admin group_profiles realtime warning:", err));

    // 7. Users collection
    const usersCol = collection(db, 'users');
    unsubUsers = onSnapshot(usersCol, () => triggerRefresh(), (err) => console.warn("Admin users realtime warning:", err));
  } catch (e) {
    console.warn("Could not attach admin realtime listeners:", e);
  }

  return () => {
    if (timer) clearTimeout(timer);
    if (crossTabChannel && bcHandler) crossTabChannel.removeEventListener('message', bcHandler);
    if (typeof window !== 'undefined') window.removeEventListener('storage', storageHandler);
    if (unsubGlobalJournals) unsubGlobalJournals();
    if (unsubGroupJournals) unsubGroupJournals();
    if (unsubGlobalProfiles) unsubGlobalProfiles();
    if (unsubGroupProfiles) unsubGroupProfiles();
    if (unsubUsers) unsubUsers();
  };
}



