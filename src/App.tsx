/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { OfficerProfile, TAJournal, TARateRule } from './types';
import { 
  initializeLocalStorage, 
  recalculateJournalTotals,
  GANESH_CHANDRA_MALIK_PROFILE,
  GANESH_CHANDRA_MALIK_JOURNAL
} from './utils';
import { 
  auth, 
  fetchUserProfile, 
  saveUserProfile,
  updateUserProfileFields,
  testConnection, 
  fetchUserJournals, 
  saveUserJournal, 
  deleteUserJournal, 
  fetchUserProfiles, 
  saveUserCustomProfile, 
  deleteUserCustomProfile,
  fetchAllUsersDataForAdmin,
  subscribeToAdminRealtimeData,
  broadcastJournalSaved,
  fetchSingleJournalDirectly,
  AdminUserItem,
  isQuotaExhausted
} from './firebase';
import { 
  saveLocalJournal,
  deleteLocalJournal,
  saveLocalProfile,
  deleteLocalProfile,
  getPendingSyncQueue,
  addPendingSyncItem,
  removePendingSyncItem,
  getLocalJournals,
  getLocalProfiles
} from './indexedDB';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { 
  ShieldAlert, 
  Users, 
  Sliders, 
  LayoutDashboard, 
  Menu, 
  X,
  User,
  Plus,
  LogOut,
  UserCheck,
  CloudCheck,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  Cloud,
  CloudOff,
  Shield,
  Fingerprint,
  Lock,
  HelpCircle,
  Train,
  Download,
  Sun,
  Moon,
  Palette,
  Bell
} from 'lucide-react';

const Dashboard = React.lazy(() => import('./components/Dashboard'));
const OfficerProfilesList = React.lazy(() => import('./components/OfficerProfilesList'));
const TARateSettings = React.lazy(() => import('./components/TARateSettings'));
const ClaimBuilder = React.lazy(() => import('./components/ClaimBuilder'));
const JournalPrintView = React.lazy(() => import('./components/JournalPrintView'));
const Auth = React.lazy(() => import('./components/Auth'));
const MyProfile = React.lazy(() => import('./components/MyProfile'));
const ContactSupport = React.lazy(() => import('./components/ContactSupport').then(m => ({ default: m.ContactSupport })));
const AdminConsole = React.lazy(() => import('./components/AdminConsole'));
const GoogleDriveSync = React.lazy(() => import('./components/GoogleDriveSync'));

function ComponentLoader() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-24 px-6 bg-slate-50 border border-dashed border-slate-200 rounded-2xl my-4">
      <div className="animate-spin rounded-full h-8 w-8 border-3 border-amber-500 border-t-transparent mb-3.5"></div>
      <p className="text-slate-500 text-xs font-mono tracking-wider animate-pulse font-bold uppercase">LOADING SYSTEM CONTROL / लोड हो रहा है...</p>
    </div>
  );
}

export default function App() {
  // --- Authentication States ---
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [activeUserProfile, setActiveUserProfile] = useState<OfficerProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [syncingProfile, setSyncingProfile] = useState<boolean>(false);

  // --- Scoped LocalStorage Key Generator To Partition User Data ---
  const getScopedKey = (baseKey: string, specificUser?: FirebaseUser | null) => {
    const user = specificUser !== undefined ? specificUser : authUser;
    if (user) {
      return `${baseKey}_${user.uid}`;
    }
    return `${baseKey}_anon`;
  };

  // --- Splendid Splash Welcome Intro state ---
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [splashStep, setSplashStep] = useState<number>(0);
  const [splashProgress, setSplashProgress] = useState<number>(0);



  // --- PWA Installation State ---
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(false);
  const [showInstallGuideModal, setShowInstallGuideModal] = useState<boolean>(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsAppInstalled(true);
    }

    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleTriggerInstall = async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        setIsAppInstalled(true);
      }
      setDeferredInstallPrompt(null);
    } else {
      setShowInstallGuideModal(true);
    }
  };

  // --- Core Application States ---
  const [profilesRaw, setProfilesRaw] = useState<OfficerProfile[]>([]);
  
  // Memoized deduplicated profiles
  const profiles = useMemo(() => {
    const clean = profilesRaw.filter(p => p.id !== 'prof-ramesh' && p.name.toLowerCase().trim() !== 'ramesh singh');
    const deletedProfilesStr = localStorage.getItem(getScopedKey('rpf_deleted_profiles'));
    const deletedProfileSet = new Set<string>(deletedProfilesStr ? JSON.parse(deletedProfilesStr) : []);

    const hasGanesh = clean.some(p => 
      p.id === GANESH_CHANDRA_MALIK_PROFILE.id || 
      p.name.trim().toLowerCase() === 'ganesh chandra malik' ||
      (p.pfNumber && p.pfNumber.trim() === GANESH_CHANDRA_MALIK_PROFILE.pfNumber)
    );

    const merged = (!hasGanesh && !deletedProfileSet.has(GANESH_CHANDRA_MALIK_PROFILE.id))
      ? [GANESH_CHANDRA_MALIK_PROFILE, ...clean]
      : clean;

    const seen = new Set<string>();
    return merged.filter(p => {
      if (!p.id) return false;
      if (seen.has(p.id)) return false;
      if (deletedProfileSet.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [profilesRaw, authUser]);

  const setProfiles = (val: OfficerProfile[] | ((prev: OfficerProfile[]) => OfficerProfile[])) => {
    const filterAndDeduplicate = (list: OfficerProfile[]) => {
      const clean = list.filter(p => p.id !== 'prof-ramesh' && p.name.toLowerCase().trim() !== 'ramesh singh');
      const seen = new Set<string>();
      return clean.filter(p => {
        if (!p.id) return false;
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
    };

    if (typeof val === 'function') {
      setProfilesRaw(prev => filterAndDeduplicate(val(prev)));
    } else {
      setProfilesRaw(filterAndDeduplicate(val));
    }
  };

  const [journalsRaw, setJournalsRaw] = useState<TAJournal[]>([]);
  
  // Memoized deduplicated journals
  const journals = useMemo(() => {
    const seen = new Set<string>();
    const deletedStr = localStorage.getItem(getScopedKey('rpf_deleted_journals'));
    const deletedList: string[] = deletedStr ? JSON.parse(deletedStr) : [];
    const deletedSet = new Set(deletedList);

    const clean = journalsRaw.filter(j => {
      if (!j.id) return false;
      if (seen.has(j.id)) return false;
      if (deletedSet.has(j.id)) return false;
      seen.add(j.id);
      return true;
    });

    const hasGaneshJ = clean.some(j => 
      j.id === GANESH_CHANDRA_MALIK_JOURNAL.id || 
      (j.officerName && j.officerName.toLowerCase().trim() === 'ganesh chandra malik') ||
      j.profileId === GANESH_CHANDRA_MALIK_PROFILE.id
    );

    if (!hasGaneshJ && !deletedSet.has(GANESH_CHANDRA_MALIK_JOURNAL.id)) {
      return [GANESH_CHANDRA_MALIK_JOURNAL, ...clean];
    }

    return clean;
  }, [journalsRaw, authUser]);

  const setJournals = (val: TAJournal[] | ((prev: TAJournal[]) => TAJournal[])) => {
    const deduplicate = (list: TAJournal[]) => {
      const seen = new Set<string>();
      const deletedStr = localStorage.getItem(getScopedKey('rpf_deleted_journals'));
      const deletedList: string[] = deletedStr ? JSON.parse(deletedStr) : [];
      const deletedSet = new Set(deletedList);

      return list.filter(j => {
        if (!j.id) return false;
        if (seen.has(j.id)) return false;
        if (deletedSet.has(j.id)) return false;
        seen.add(j.id);
        return true;
      });
    };

    if (typeof val === 'function') {
      setJournalsRaw(prev => deduplicate(val(prev)));
    } else {
      setJournalsRaw(deduplicate(val));
    }
  };

  const [rateRules, setRateRules] = useState<TARateRule[]>([]);
  
  // --- Admin Console user states ---
  const [adminUsers, setAdminUsers] = useState<AdminUserItem[]>([]);
  const [adminSelectedUserId, setAdminSelectedUserId] = useState<string | null>(null);

  // --- View controller ---
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [selectedJournalId, setSelectedJournalId] = useState<string | undefined>(undefined);
  const [selectedJournalForPrint, setSelectedJournalForPrint] = useState<TAJournal | undefined>(undefined);
  
  // --- Mobile responsive sidebar/menu ---
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- Sign Out Confirmation Modal ---
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  // --- Dark Mode disabled as requested ---
  const isDarkMode = false;

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('rpf_dark_mode');
  }, []);

  // Splash Screen Sequence Timer
  useEffect(() => {
    // Increment progress smoothly
    const progressInterval = setInterval(() => {
      setSplashProgress(prev => {
        if (prev >= 98) return 98; // Hold around 98 until auth is loaded
        const inc = Math.floor(Math.random() * 8) + 3; // increment between 3 and 10
        return Math.min(prev + inc, 98);
      });
    }, 110);

    // Increment log steps
    const stepInterval = setInterval(() => {
      setSplashStep(prev => {
        if (prev < 4) return prev + 1;
        return prev;
      });
    }, 700);

    // Resolve booting after minimum 2.5 seconds AND authentication is done, or fallback after 5 seconds
    const startTimeResult = Date.now();
    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - startTimeResult;
      if ((elapsed >= 2500 && !authLoading) || elapsed >= 5000) {
        setSplashProgress(100);
        setSplashStep(5);
        setTimeout(() => {
          setShowSplash(false);
        }, 400); // Wait for final feedback state
        clearInterval(checkInterval);
        clearInterval(progressInterval);
        clearInterval(stepInterval);
      }
    }, 100);

    return () => {
      clearInterval(progressInterval);
      clearInterval(stepInterval);
      clearInterval(checkInterval);
    };
  }, [authLoading]);

  // --- Offline Detection & IndexedDB Synchronization Sync States ---
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [showSyncSuccessToast, setShowSyncSuccessToast] = useState<boolean>(false);
  const [showAlreadySyncedToast, setShowAlreadySyncedToast] = useState<boolean>(false);

  // Floating Synchronizer Badge State
  const [lastConnectionState, setLastConnectionState] = useState<'online' | 'offline' | 'just-reconnected'>(
    navigator.onLine ? 'online' : 'offline'
  );
  const [showSyncBadge, setShowSyncBadge] = useState<boolean>(!navigator.onLine);

  const updatePendingCount = async () => {
    try {
      const queue = await getPendingSyncQueue();
      setPendingSyncCount(queue.length);
    } catch (e) {
      console.error('Error updating pending count:', e);
    }
  };

  // Listen for online status changes
  useEffect(() => {
    let reconnectTimer: NodeJS.Timeout;

    const handleOnline = () => {
      setIsOnline(true);
      setLastConnectionState('just-reconnected');
      setShowSyncBadge(true);
      
      // Auto-hide the "Synchronized" badge after 4 seconds
      reconnectTimer = setTimeout(() => {
        setShowSyncBadge(false);
        setLastConnectionState('online');
      }, 4000);
    };

    const handleOffline = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      setIsOnline(false);
      setLastConnectionState('offline');
      setShowSyncBadge(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Run initial pending sync check
    updatePendingCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  // --- Load scoped user data from Local DB or Firebase Cloud ---
  const loadCloudAndCacheData = async () => {
    if (authUser) {
      const pKey = getScopedKey('rpf_profiles');
      const jKey = getScopedKey('rpf_journals');
      const rKey = getScopedKey('rpf_rates');

      // Check for offline local configurations or journals
      const storedJournals = localStorage.getItem(jKey);
      const storedProfiles = localStorage.getItem(pKey);

      let activeJourneys: TAJournal[] = [];
      let activeProfilesList: OfficerProfile[] = [];

      // Unified fast start from local IndexedDB for speed
      try {
        const dbJourneys = await getLocalJournals();
        const dbProfiles = await getLocalProfiles();
        if (dbJourneys.length > 0) {
          activeJourneys = dbJourneys;
          setJournals(dbJourneys);
        } else if (storedJournals) {
          activeJourneys = JSON.parse(storedJournals);
          setJournals(activeJourneys);
        }

        if (dbProfiles.length > 0) {
          activeProfilesList = dbProfiles;
          setProfiles(dbProfiles);
        } else if (storedProfiles) {
          activeProfilesList = JSON.parse(storedProfiles);
          setProfiles(activeProfilesList);
        }
      } catch (err) {
        console.error("Failed to pre-load from IndexedDB:", err);
      }

      // Ensure user profile document exists/synced in Cloud Firestore (only if not already synced and quota allows)
      if (isOnline && authUser && authUser.uid && !isQuotaExhausted()) {
        const syncKey = `rpf_profile_init_synced_${authUser.uid}`;
        if (!localStorage.getItem(syncKey)) {
          if (activeUserProfile) {
            saveUserProfile(authUser.uid, {
              ...activeUserProfile,
              id: authUser.uid,
              email: authUser.email || activeUserProfile.email || ''
            }).then(() => {
              localStorage.setItem(syncKey, 'true');
            }).catch(e => console.warn("Cloud user profile sync:", e));
          } else {
            saveUserProfile(authUser.uid, {
              id: authUser.uid,
              name: authUser.displayName || authUser.email?.split('@')[0] || 'RPF Officer',
              email: authUser.email || '',
              pfNumber: authUser.email ? authUser.email.split('@')[0] : '1200384',
              designation: 'Sub-Inspector (SI)',
              branch: 'Security Branch',
              division: 'CKP Division',
              headquarter: 'RPF/POST/BUF',
              basicPay: 44900,
              scaleOfPay: '9,300-34,800',
              dateOfAppointment: '2020-04-12',
              ruleGoverned: 'S. Rule',
              gradePay: 4200,
              mobileNumber: '9876543210'
            }).then(() => {
              localStorage.setItem(syncKey, 'true');
            }).catch(e => console.warn("Cloud user profile sync:", e));
          }
        }
      }

      // Check if current user is the admin parent account
      const localProfStr = localStorage.getItem('rpf_profile');
      let localProf: OfficerProfile | null = null;
      try { if (localProfStr) localProf = JSON.parse(localProfStr); } catch (e) {}

      const isParent = authUser?.email?.toLowerCase() === 'nitesh0724@gmail.com';

      if (isOnline && isParent) {
        try {
          console.log("Admin parent user detected. Querying all users' data across the database in real-time...");
          const allUsersData = await fetchAllUsersDataForAdmin(authUser.email || authUser.uid);
          if (allUsersData) {
            const { journals: cloudJournals, profiles: cloudProfiles, users: cloudUsers } = allUsersData;
            
            if (cloudUsers && cloudUsers.length > 0) {
              setAdminUsers(cloudUsers);
            }

            // Overwrite/Hydrate local views with full dataset
            if (cloudJournals && cloudJournals.length > 0) {
              activeJourneys = cloudJournals;
              setJournals(cloudJournals);
              localStorage.setItem(jKey, JSON.stringify(cloudJournals));
              for (const j of cloudJournals) {
                await saveLocalJournal(j);
              }
            } else {
              setJournals([]);
              localStorage.setItem(jKey, JSON.stringify([]));
            }
            
            if (cloudProfiles && cloudProfiles.length > 0) {
              activeProfilesList = cloudProfiles;
              setProfiles(cloudProfiles);
              localStorage.setItem(pKey, JSON.stringify(cloudProfiles));
              for (const p of cloudProfiles) {
                await saveLocalProfile(p);
              }
            } else {
              setProfiles([]);
              localStorage.setItem(pKey, JSON.stringify([]));
            }
          }
        } catch (err) {
          console.warn("Could not load All Users Cloud data for parent (using local):", err);
        }
      } else {
        // --- 1. Standard single-user flow: Load ONLY this user's journals from Cloud ---
        if (isOnline) {
          try {
            const cloudJournals = await fetchUserJournals(authUser.uid);
            if (cloudJournals && cloudJournals.length > 0) {
              const userOnlyJournals = cloudJournals.map(j => ({
                ...j,
                adminOwnerId: j.adminOwnerId || authUser.uid
              }));
              activeJourneys = userOnlyJournals;
              setJournals(userOnlyJournals);
              localStorage.setItem(jKey, JSON.stringify(userOnlyJournals));
              for (const j of userOnlyJournals) {
                await saveLocalJournal(j);
              }
            } else {
              // Empty cloud: check stored user-scoped journals, and migrate legacy if needed
              let candidateJournals: TAJournal[] = [];
              if (storedJournals) {
                try { candidateJournals = JSON.parse(storedJournals); } catch (_) {}
              }
              if (!candidateJournals || candidateJournals.length === 0) {
                const legacyJ = localStorage.getItem('rpf_journals');
                if (legacyJ) {
                  try { candidateJournals = JSON.parse(legacyJ); } catch (_) {}
                }
              }

              if (candidateJournals && candidateJournals.length > 0) {
                const userOnlyLocal = candidateJournals.map(j => ({
                  ...j,
                  adminOwnerId: j.adminOwnerId || authUser.uid
                }));
                activeJourneys = userOnlyLocal;
                setJournals(userOnlyLocal);
                localStorage.setItem(jKey, JSON.stringify(userOnlyLocal));
                for (const j of userOnlyLocal) {
                  await saveLocalJournal(j);
                }
              } else {
                setJournals([]);
                localStorage.setItem(jKey, JSON.stringify([]));
              }
            }
          } catch (err) {
            console.warn("Could not load Cloud journals for user (using local):", err);
          }
        } else {
          // Offline journals loading
          if (storedJournals) {
            try {
              const parsedLocal: TAJournal[] = JSON.parse(storedJournals);
              const userOnlyLocal = parsedLocal.map(j => ({
                ...j,
                adminOwnerId: j.adminOwnerId || authUser.uid
              }));
              activeJourneys = userOnlyLocal;
              setJournals(userOnlyLocal);
            } catch (_) {}
          }
        }

        // --- 2. Standard single-user flow: Load ONLY this user's profiles from Cloud ---
        if (isOnline) {
          try {
            const cloudProfiles = await fetchUserProfiles(authUser.uid);
            if (cloudProfiles && cloudProfiles.length > 0) {
              const userOnlyProfiles = cloudProfiles.map(p => ({
                ...p,
                adminOwnerId: p.adminOwnerId || authUser.uid
              }));
              activeProfilesList = userOnlyProfiles;
              setProfiles(userOnlyProfiles);
              localStorage.setItem(pKey, JSON.stringify(userOnlyProfiles));
              for (const p of userOnlyProfiles) {
                await saveLocalProfile(p);
              }
            } else {
              let candidateProfiles: OfficerProfile[] = [];
              if (storedProfiles) {
                try { candidateProfiles = JSON.parse(storedProfiles); } catch (_) {}
              }
              if (!candidateProfiles || candidateProfiles.length === 0) {
                const legacyP = localStorage.getItem('rpf_profiles');
                if (legacyP) {
                  try { candidateProfiles = JSON.parse(legacyP); } catch (_) {}
                }
              }

              if (candidateProfiles && candidateProfiles.length > 0) {
                const userOnlyProf = candidateProfiles.map(p => ({
                  ...p,
                  adminOwnerId: p.adminOwnerId || authUser.uid
                }));
                activeProfilesList = userOnlyProf;
                setProfiles(userOnlyProf);
                localStorage.setItem(pKey, JSON.stringify(userOnlyProf));
                for (const p of userOnlyProf) {
                  await saveLocalProfile(p);
                }
              } else {
                setProfiles([]);
                localStorage.setItem(pKey, JSON.stringify([]));
              }
            }
          } catch (err) {
            console.warn("Could not load Cloud profiles for user (using local):", err);
          }
        } else {
          // Offline profiles loading
          if (storedProfiles) {
            try {
              const parsedProf: OfficerProfile[] = JSON.parse(storedProfiles);
              const userOnlyProf = parsedProf.map(p => ({
                ...p,
                adminOwnerId: p.adminOwnerId || authUser.uid
              }));
              activeProfilesList = userOnlyProf;
              setProfiles(userOnlyProf);
            } catch (_) {}
          }
        }
      }

      // Sync active profile match
      if (activeUserProfile) {
        const matchProfile = activeProfilesList.find(p => p.id === activeUserProfile.id);
        if (matchProfile) {
          setActiveUserProfile(matchProfile);
        }
      }

      // --- 3. Rates Loading ---
      const storedRates = localStorage.getItem(rKey);
      if (storedRates) {
        setRateRules(JSON.parse(storedRates));
      } else {
        const globalRates = localStorage.getItem('rpf_rates');
        const defaultRules = globalRates ? JSON.parse(globalRates) : [];
        setRateRules(defaultRules);
        localStorage.setItem(rKey, JSON.stringify(defaultRules));
      }
    } else {
      setProfiles([]);
      setJournals([]);
      setRateRules([]);
    }
  };

  // --- Reusable Cloud Synchronization Playback Function ---
  const triggerPlaybackSync = async () => {
    if (!isOnline || isSyncing) return;
    if (isQuotaExhausted()) return;
    try {
      const queue = await getPendingSyncQueue();
      if (queue.length === 0) return;

      setIsSyncing(true);
      let successCount = 0;

      // Sequential loop to preserve chronological correctness of user actions
      for (const item of queue) {
        if (isQuotaExhausted()) break;
        try {
          const targetOwnerId = item.targetOwnerId || authUser?.uid || activeUserProfile?.id || 'anon_user';
          if (item.dataType === 'JOURNALS') {
            if (item.action === 'SAVE') {
              if (item.payload) {
                await saveUserJournal(targetOwnerId, item.payload);
              }
            } else if (item.action === 'DELETE') {
              await deleteUserJournal(targetOwnerId, item.dataId);
            }
          } else if (item.dataType === 'PROFILES') {
            if (item.action === 'SAVE') {
              if (item.payload) {
                await saveUserCustomProfile(targetOwnerId, item.payload);
              }
            } else if (item.action === 'DELETE') {
              await deleteUserCustomProfile(targetOwnerId, item.dataId);
            }
          }

          // Dequeue successfully synchronized item
          await removePendingSyncItem(item.id);
          successCount++;
        } catch (error) {
          console.warn(`Sync item deferred for ID ${item.id}:`, error);
          break;
        }
      }

      if (successCount > 0) {
        // Trigger visual highlight toast
        setShowSyncSuccessToast(true);
        setTimeout(() => {
          setShowSyncSuccessToast(false);
        }, 5000);

        // Re-fetch states using our unified data loading logic
        try {
          await loadCloudAndCacheData();
        } catch (e) {
          console.error("Failed post-synced fresh pull:", e);
        }
      }
    } catch (e) {
      console.warn("Playback synchronization cycle deferred:", e);
    } finally {
      setIsSyncing(false);
      updatePendingCount();
    }
  };

  // --- Automatic Synchronization Playback on Online Connect ---
  useEffect(() => {
    if (isOnline && authUser) {
      triggerPlaybackSync();
    }
  }, [isOnline, authUser]);

  // --- Load scoped user data whenever authUser changes or comes online ---
  useEffect(() => {
    loadCloudAndCacheData();
  }, [authUser, isOnline]);

  // --- 1. Load LocalStorage and auth listener ---
  useEffect(() => {
    initializeLocalStorage();
    
    // Load local rates (anon / fallback bootstrap)
    const storedRates = localStorage.getItem(getScopedKey('rpf_rates'));
    if (storedRates) {
      setRateRules(JSON.parse(storedRates));
    }

    // Load local journals/claims (anon / fallback bootstrap)
    const storedJournals = localStorage.getItem(getScopedKey('rpf_journals'));
    if (storedJournals) {
      setJournals(JSON.parse(storedJournals));
    }

    // Connect probe test
    testConnection().catch(() => {});

    // Setup Auth change listener
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Clear any offline session if they successfully login via standard online service
        localStorage.removeItem('rpf_offline_session');
        setAuthUser(user);
        setSyncingProfile(true);
        // Load user profile from firestore
        try {
          const profile = await fetchUserProfile(user.uid);
          if (profile) {
            setActiveUserProfile(profile);

            
            // Sync with local profiles array so that it's selectable in other dropdown sheets
            const storedProfiles = localStorage.getItem(getScopedKey('rpf_profiles', user));
            let localList: OfficerProfile[] = storedProfiles ? JSON.parse(storedProfiles) : [];
            
            const deletedStr = localStorage.getItem(getScopedKey('rpf_deleted_profiles', user));
            const deletedList: string[] = deletedStr ? JSON.parse(deletedStr) : [];
            const isExplicitlyDeleted = deletedList.includes(profile.id);

            const exists = localList.some(p => p.id === profile.id);
            if (!exists) {
              if (!isExplicitlyDeleted) {
                localList = [profile, ...localList];
                localStorage.setItem(getScopedKey('rpf_profiles', user), JSON.stringify(localList));
              }
            } else {
              // update local profile in case edited elsewhere
              localList = localList.map(p => p.id === profile.id ? profile : p);
              localStorage.setItem(getScopedKey('rpf_profiles', user), JSON.stringify(localList));
            }
            setProfiles(localList);
          } else {
            // New user without a profile doc yet (handled in Auth.tsx or on first save)
            setActiveUserProfile(null);
            
            const storedProfiles = localStorage.getItem(getScopedKey('rpf_profiles', user));
            if (storedProfiles) {
              const parsedProfiles = JSON.parse(storedProfiles);
              setProfiles(parsedProfiles);
              const match = parsedProfiles.find((p: any) => p.id === user.uid);
            } else {
              setProfiles([]);
            }
          }
        } catch (error) {
          console.warn("Could not load Cloud profile info (using local):", error);
          // Fallback to local
          const storedProfiles = localStorage.getItem(getScopedKey('rpf_profiles', user));
          if (storedProfiles) {
            const parsedProfiles = JSON.parse(storedProfiles);
            setProfiles(parsedProfiles);
            const match = parsedProfiles.find((p: any) => p.id === user.uid);
          }
        } finally {
          setSyncingProfile(false);
          setAuthLoading(false);
        }
      } else {
        // No firebase user is active. Let's check for cached offline bypass session
        const savedOffline = localStorage.getItem('rpf_offline_session');
        if (savedOffline) {
          try {
            const parsed = JSON.parse(savedOffline);
            if (parsed && parsed.user) {
              setAuthUser(parsed.user);
              setActiveUserProfile(parsed.profile || null);

              
              // Sync local profiles listing
              const storedProfiles = localStorage.getItem(getScopedKey('rpf_profiles', parsed.user as any));
              if (storedProfiles) {
                setProfiles(JSON.parse(storedProfiles));
              } else if (parsed.profile) {
                setProfiles([parsed.profile]);
              }
            } else {
              setActiveUserProfile(null);
              setProfiles([]);
              setAuthUser(null);
            }
          } catch (e) {
            console.error("Failed parsing offline session storage:", e);
            setActiveUserProfile(null);
            setProfiles([]);
            setAuthUser(null);
          }
        } else {
          // Logged out
          setActiveUserProfile(null);
          setProfiles([]);
          setAuthUser(null);
        }
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // --- Load Journal for QR Code or Link Verification ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jId = params.get('journalId') || params.get('id');
    const ownerId = params.get('ownerId') || params.get('userId');
    if (jId) {
      // Check if this journal actually exists in our state
      const found = journals.find(j => j.id === jId);
      if (found) {
        setSelectedJournalId(jId);
        setCurrentView('print');
      } else if (ownerId) {
        // Fallback: Fetch from database across user-folders if not found in current user's list
        fetchSingleJournalDirectly(ownerId, jId)
          .then((sharedJournal) => {
            if (sharedJournal) {
              setJournals(prev => {
                if (prev.some(j => j.id === jId)) return prev;
                return [...prev, sharedJournal];
              });
              setSelectedJournalId(jId);
              setCurrentView('print');
            }
          })
          .catch((err) => {
            console.error("Failed to load shared journal from Firestore link:", err);
          });
      }
    }
  }, [journals]);

  const handleRefreshAdminData = async () => {
    try {
      const allUsersData = await fetchAllUsersDataForAdmin(authUser?.uid);
      if (allUsersData) {
        const { journals: cloudJournals, profiles: cloudProfiles, users: cloudUsers } = allUsersData;
        if (cloudUsers && cloudUsers.length > 0) {
          setAdminUsers(cloudUsers);
        }
        if (cloudJournals && cloudJournals.length > 0) {
          setJournals(cloudJournals);
          localStorage.setItem(getScopedKey('rpf_journals'), JSON.stringify(cloudJournals));
        }
        if (cloudProfiles && cloudProfiles.length > 0) {
          setProfiles(cloudProfiles);
          localStorage.setItem(getScopedKey('rpf_profiles_list'), JSON.stringify(cloudProfiles));
        }
      }
    } catch (err) {
      console.error("Failed to refresh admin data", err);
    }
  };

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    if (authUser) {
      // Perform initial refresh
      handleRefreshAdminData();

      // Subscribe to real-time Firestore & BroadcastChannel updates so staff entries reflect live immediately
      unsubscribe = subscribeToAdminRealtimeData((data) => {
        if (data.users && data.users.length > 0) setAdminUsers(data.users);
        if (data.journals && data.journals.length > 0) {
          // Sort latest first (descending by timestamp)
          const sorted = [...data.journals].sort((a, b) => {
            const timeA = new Date(a.updatedAt || a.createdAt || (a.monthClaimed ? `${a.monthClaimed}-01` : 0)).getTime();
            const timeB = new Date(b.updatedAt || b.createdAt || (b.monthClaimed ? `${b.monthClaimed}-01` : 0)).getTime();
            return timeB - timeA;
          });
          setJournals(sorted);
          localStorage.setItem(getScopedKey('rpf_journals'), JSON.stringify(sorted));
        }
        if (data.profiles && data.profiles.length > 0) {
          setProfiles(data.profiles);
          localStorage.setItem(getScopedKey('rpf_profiles_list'), JSON.stringify(data.profiles));
        }
      }, authUser.email || authUser.uid);
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [currentView, authUser]);

  // --- Helper to update and persist states ---
  const persistProfiles = async (updated: OfficerProfile[], singleToSync?: OfficerProfile) => {
    setProfiles(updated);
    localStorage.setItem(getScopedKey('rpf_profiles'), JSON.stringify(updated));
    
    // Always replicate locally in IndexedDB as resilient data-redundancy baseline
    if (singleToSync) {
      await saveLocalProfile(singleToSync);
    } else {
      for (const p of updated) {
        await saveLocalProfile(p);
      }
    }

    // Only sync to cloud if a specific item was modified AND quota is not exhausted
    if (singleToSync && isOnline && authUser?.uid && !isQuotaExhausted()) {
      const defaultOwnerId = authUser?.uid || activeUserProfile?.id || (activeUserProfile?.pfNumber ? `pf_${activeUserProfile.pfNumber}` : 'anon_user');
      const itemOwnerId = singleToSync.adminOwnerId || defaultOwnerId;
      saveUserCustomProfile(itemOwnerId, singleToSync).catch((err) => {
        console.warn("Cloud custom profile write deferred to local IndexedDB:", err);
      });
    }
  };

  const persistJournals = async (updated: TAJournal[], singleToSync?: TAJournal) => {
    setJournals(updated);
    localStorage.setItem(getScopedKey('rpf_journals'), JSON.stringify(updated));

    // Always replicate locally in IndexedDB as robust local fallback
    if (singleToSync) {
      await saveLocalJournal(singleToSync);
    } else {
      for (const j of updated) {
        await saveLocalJournal(j);
      }
    }

    // Only sync to cloud if a specific item was modified AND quota is not exhausted
    if (singleToSync && isOnline && authUser?.uid && !isQuotaExhausted()) {
      const defaultOwnerId = authUser?.uid || activeUserProfile?.id || (activeUserProfile?.pfNumber ? `pf_${activeUserProfile.pfNumber}` : 'anon_user');
      const itemOwnerId = singleToSync.adminOwnerId || defaultOwnerId;
      saveUserJournal(itemOwnerId, singleToSync).catch((err) => {
        console.warn("Cloud journal write deferred to local IndexedDB:", err);
      });
    }
  };

  const persistRatesSetting = (updated: TARateRule[]) => {
    setRateRules(updated);
    localStorage.setItem(getScopedKey('rpf_rates'), JSON.stringify(updated));
  };

  // -----------------------------------------------------
  // Profile Handlers
  // -----------------------------------------------------
  const handleSaveProfile = (profile: OfficerProfile) => {
    const defaultOwnerId = (isAppParent && adminSelectedUserId ? adminSelectedUserId : authUser?.uid) || activeUserProfile?.id || 'anon_user';
    const profileToSave: OfficerProfile = {
      ...profile,
      adminOwnerId: profile.adminOwnerId || defaultOwnerId,
      adminOwnerEmail: profile.adminOwnerEmail || authUser?.email || undefined
    };

    const exists = profiles.some(p => p.id === profileToSave.id);
    let updated: OfficerProfile[] = [];
    if (exists) {
      updated = profiles.map(p => p.id === profileToSave.id ? profileToSave : p);
    } else {
      updated = [...profiles, profileToSave];
    }
    persistProfiles(updated, profileToSave);

    // Remove from deleted list if saving/updating it
    const deletedStr = localStorage.getItem(getScopedKey('rpf_deleted_profiles'));
    if (deletedStr) {
      const deletedList: string[] = JSON.parse(deletedStr);
      const filtered = deletedList.filter(id => id !== profileToSave.id);
      localStorage.setItem(getScopedKey('rpf_deleted_profiles'), JSON.stringify(filtered));
    }

    // If they updated themselves in the profiles list, synchronize to activeUserProfile state
    if (activeUserProfile && profileToSave.id === activeUserProfile.id) {
      setActiveUserProfile(profileToSave);
    }
  };

  const handleImportProfiles = (importedProfiles: OfficerProfile[]) => {
    const defaultOwnerId = (isAppParent && adminSelectedUserId ? adminSelectedUserId : authUser?.uid) || activeUserProfile?.id || 'anon_user';
    const updated = [...profiles];
    let importedCount = 0;
    let updatedCount = 0;

    importedProfiles.forEach(imported => {
      if (!imported.pfNumber || !imported.name) return;
      
      const cleanProfile: OfficerProfile = {
        id: imported.id || 'prof_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
        pfNumber: String(imported.pfNumber).trim(),
        name: String(imported.name).trim(),
        designation: String(imported.designation || 'Constable').trim(),
        branch: String(imported.branch || '').trim(),
        division: String(imported.division || '').trim(),
        headquarter: String(imported.headquarter || '').trim(),
        basicPay: Number(imported.basicPay) || 0,
        scaleOfPay: String(imported.scaleOfPay || '').trim(),
        dateOfAppointment: String(imported.dateOfAppointment || '').trim(),
        ruleGoverned: String(imported.ruleGoverned || '').trim(),
        billUnit: String(imported.billUnit || '').trim(),
        gradePay: Number(imported.gradePay) || 0,
        adminOwnerId: imported.adminOwnerId || defaultOwnerId,
        adminOwnerEmail: imported.adminOwnerEmail || authUser?.email || undefined
      };

      const existingIndex = updated.findIndex(p => p.id === cleanProfile.id || p.pfNumber === cleanProfile.pfNumber);
      if (existingIndex !== -1) {
        updated[existingIndex] = { ...updated[existingIndex], ...cleanProfile };
        updatedCount++;
      } else {
        updated.push(cleanProfile);
        importedCount++;
      }
    });

    persistProfiles(updated);
  };

  const handleDeleteProfile = async (id: string) => {
    const profileToDelete = profiles.find(p => p.id === id);
    const targetOwnerId = (profileToDelete && profileToDelete.adminOwnerId) || (authUser && authUser.uid) || 'anon';

    const updated = profiles.filter(p => p.id !== id);
    // Remove from local IndexedDB cache store
    await deleteLocalProfile(id);
    await persistProfiles(updated);

    // Also delete any journals belonging to this profile from Local Cache & Cloud
    const remainingJournals = journals.filter(j => j.profileId !== id);
    const deletedJournals = journals.filter(j => j.profileId === id);
    
    for (const dj of deletedJournals) {
      await deleteLocalJournal(dj.id);
      if (authUser && authUser.uid) {
        const djOwnerId = dj.adminOwnerId || authUser.uid;
        if (isOnline) {
          deleteUserJournal(djOwnerId, dj.id).catch((err) => {
            console.error("Cloud journal delete failed for orphaned profile journal:", err);
          });
        } else {
          await addPendingSyncItem({
            action: 'DELETE',
            dataType: 'JOURNALS',
            dataId: dj.id,
            targetOwnerId: djOwnerId
          });
        }
      }
    }
    
    // Persist remaining journals to local storage & online/queue
    setJournals(remainingJournals);
    localStorage.setItem(getScopedKey('rpf_journals'), JSON.stringify(remainingJournals));

    if (authUser && authUser.uid && targetOwnerId !== 'anon') {
      if (isOnline) {
        deleteUserCustomProfile(targetOwnerId, id).catch(async (err) => {
          console.error("Cloud profile delete failed, queueing in IndexedDB sync queue:", err);
          await addPendingSyncItem({
            action: 'DELETE',
            dataType: 'PROFILES',
            dataId: id,
            targetOwnerId: targetOwnerId
          });
          updatePendingCount();
        });
      } else {
        await addPendingSyncItem({
          action: 'DELETE',
          dataType: 'PROFILES',
          dataId: id,
          targetOwnerId: targetOwnerId
        });
        updatePendingCount();
      }
    }

    // Track as deleted to prevent auto-add on auth state re-syncs
    const deletedStr = localStorage.getItem(getScopedKey('rpf_deleted_profiles'));
    const deletedList: string[] = deletedStr ? JSON.parse(deletedStr) : [];
    if (!deletedList.includes(id)) {
      deletedList.push(id);
      localStorage.setItem(getScopedKey('rpf_deleted_profiles'), JSON.stringify(deletedList));
    }

    if (activeUserProfile && activeUserProfile.id === id) {
      // If deleting currently logged-in account profile fallback to null
      setActiveUserProfile(null);
    }
  };

  // Callback from successful registration
  const handleAuthSuccess = (userId: string, profile: OfficerProfile) => {
    setActiveUserProfile(profile);
    // Add to local list
    const exists = profiles.some(p => p.id === profile.id);
    const updated = exists 
      ? profiles.map(p => p.id === profile.id ? profile : p)
      : [profile, ...profiles];
    persistProfiles(updated, profile);

    // Remove from deleted list
    const deletedStr = localStorage.getItem(getScopedKey('rpf_deleted_profiles'));
    if (deletedStr) {
      const deletedList: string[] = JSON.parse(deletedStr);
      const filtered = deletedList.filter(id => id !== profile.id);
      localStorage.setItem(getScopedKey('rpf_deleted_profiles'), JSON.stringify(filtered));
    }
  };

  // Callback when active user profile is updated in MyProfile component
  const handleActiveProfileUpdated = (updatedProfile: OfficerProfile) => {
    setActiveUserProfile(updatedProfile);
    
    // update local list as well
    const exists = profiles.some(p => p.id === updatedProfile.id);
    const updated = exists 
      ? profiles.map(p => p.id === updatedProfile.id ? updatedProfile : p)
      : [updatedProfile, ...profiles];
    persistProfiles(updated, updatedProfile);

    // Remove from deleted list if updated
    const deletedStr = localStorage.getItem(getScopedKey('rpf_deleted_profiles'));
    if (deletedStr) {
      const deletedList: string[] = JSON.parse(deletedStr);
      const filtered = deletedList.filter(id => id !== updatedProfile.id);
      localStorage.setItem(getScopedKey('rpf_deleted_profiles'), JSON.stringify(filtered));
    }

    // Keep active offline session synchronized in storage
    const savedOffline = localStorage.getItem('rpf_offline_session');
    if (savedOffline) {
      try {
        const parsed = JSON.parse(savedOffline);
        if (parsed && parsed.user) {
          parsed.profile = updatedProfile;
          localStorage.setItem('rpf_offline_session', JSON.stringify(parsed));
        }
      } catch (e) {
        console.error("Error keeping offline session synchronity on update Profile:", e);
      }
    }
  };

  // -----------------------------------------------------
  // Rate Rules Handlers
  // -----------------------------------------------------
  const handleSaveRateRules = (rules: TARateRule[]) => {
    persistRatesSetting(rules);
  };

  // -----------------------------------------------------
  // TA Journal Claims Handlers
  // -----------------------------------------------------
  const handleSaveJournal = (journal: TAJournal) => {
    const currentAccountUid = (isAppParent && adminSelectedUserId ? adminSelectedUserId : authUser?.uid);
    const currentAccountName = (isAppParent && adminSelectedUserId 
      ? adminUsers.find(u => u.id === adminSelectedUserId)?.name 
      : (activeUserProfile?.name || authUser?.displayName || journal.accountHolderName || journal.officerName));
    const currentAccountEmail = (isAppParent && adminSelectedUserId 
      ? adminUsers.find(u => u.id === adminSelectedUserId)?.email 
      : (authUser?.email || activeUserProfile?.email || journal.adminOwnerEmail));

    const finalOwnerId = (isAppParent && adminSelectedUserId)
      ? adminSelectedUserId
      : (authUser?.uid || journal.adminOwnerId || activeUserProfile?.id || 'anon_user');

    const nowIso = new Date().toISOString();
    const journalToSave: TAJournal = {
      ...journal,
      adminOwnerId: finalOwnerId,
      adminOwnerEmail: currentAccountEmail || journal.adminOwnerEmail || undefined,
      accountHolderName: currentAccountName || journal.accountHolderName || journal.officerName,
      officerName: journal.officerName || activeUserProfile?.name || undefined,
      pfNumber: journal.pfNumber || activeUserProfile?.pfNumber || undefined,
      createdAt: journal.createdAt || nowIso,
      updatedAt: nowIso
    };

    // Ensure newly saved/updated journal is placed right at the beginning (latest first)
    const exists = journals.some(j => j.id === journalToSave.id);
    let updated: TAJournal[] = [];
    if (exists) {
      updated = [journalToSave, ...journals.filter(j => j.id !== journalToSave.id)];
    } else {
      updated = [journalToSave, ...journals];
    }

    // Remove from deleted list if saving/updating it to prevent any masking
    try {
      const deletedStr = localStorage.getItem(getScopedKey('rpf_deleted_journals'));
      if (deletedStr) {
        const deletedList: string[] = JSON.parse(deletedStr);
        const filtered = deletedList.filter(id => id !== journalToSave.id);
        localStorage.setItem(getScopedKey('rpf_deleted_journals'), JSON.stringify(filtered));
      }
    } catch (e) {
      console.error("Error clearing deleted list for journal:", e);
    }

    persistJournals(updated, journalToSave);

    // Instant real-time broadcast so admin dashboard receives it live without reload
    const matchingProfile = profiles.find(p => p.id === journalToSave.profileId);
    broadcastJournalSaved(journalToSave, matchingProfile);
  };

  const handleSaveAndPrintJournal = (journal: TAJournal) => {
    handleSaveJournal(journal);
    setSelectedJournalForPrint(journal);
    handleViewChange('print', journal.id, 'print');
  };

  const handleDeleteJournal = async (id: string) => {
    const journalToDelete = journals.find(j => j.id === id);
    const targetOwnerId = (journalToDelete && journalToDelete.adminOwnerId) || (authUser && authUser.uid) || 'anon';

    const updated = journals.filter(j => j.id !== id);
    // Remove from local IndexedDB cache
    await deleteLocalJournal(id);
    await persistJournals(updated);

    // Track as deleted to prevent auto-add on auth state re-syncs
    try {
      const deletedStr = localStorage.getItem(getScopedKey('rpf_deleted_journals'));
      const deletedList: string[] = deletedStr ? JSON.parse(deletedStr) : [];
      if (!deletedList.includes(id)) {
        deletedList.push(id);
        localStorage.setItem(getScopedKey('rpf_deleted_journals'), JSON.stringify(deletedList));
      }
    } catch (e) {
      console.error("Error saving deleted journal tracking list:", e);
    }

    if (authUser && authUser.uid && targetOwnerId !== 'anon') {
      if (isOnline) {
        deleteUserJournal(targetOwnerId, id).catch(async (err) => {
          console.error("Cloud journal delete failed, queueing in IndexedDB sync queue:", err);
          await addPendingSyncItem({
            action: 'DELETE',
            dataType: 'JOURNALS',
            dataId: id,
            targetOwnerId: targetOwnerId
          });
          updatePendingCount();
        });
      } else {
        await addPendingSyncItem({
          action: 'DELETE',
          dataType: 'JOURNALS',
          dataId: id,
          targetOwnerId: targetOwnerId
        });
        updatePendingCount();
      }
    }
  };

  /**
   * Duplicate claim to a different month (1-Click template duplicate!)
   * If journal contains entries for 2026-05, duplicate will set dates to 2026-06 automatically!
   */
  const handleCloneJournal = (id: string) => {
    const source = journals.find(j => j.id === id);
    if (!source) return;

    // Shift month claimed (+1 month)
    const [year, month] = source.monthClaimed.split('-').map(Number);
    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    const nextMonthStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;

    // Duplicate all journeys, shifting the day component
    const clonedJourneys = source.journeys.map(j => {
      const dayComponent = j.date.split('-')[2] || '01';
      return {
        ...j,
        id: 'row_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
        date: `${nextMonthStr}-${dayComponent}`
      };
    });

    const totalsObj = recalculateJournalTotals(clonedJourneys);

    const clonedJournal: TAJournal = {
      ...JSON.parse(JSON.stringify(source)),
      id: 'journal_clone_' + Date.now() + '_' + Math.floor(Math.random() * 1000000),
      monthClaimed: nextMonthStr,
      journeys: clonedJourneys,
      isDraft: true, // cloned should start as a draft!
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      percentage30Days: totalsObj.p30Days,
      percentage70Days: totalsObj.p70Days,
      percentage100Days: totalsObj.p100Days,
      totalDays: totalsObj.totalDays,
      totalAmount: totalsObj.totalAmount
    };

    const updated = [clonedJournal, ...journals];
    persistJournals(updated, clonedJournal);
    
    // Redirect claimant to edit this newly duplicated draft immediately
    setSelectedJournalId(clonedJournal.id);
    setCurrentView('edit-claim');
    alert(`Successfully duplicated claims template format to ${nextMonthStr}! Loading draft edit view...`);
  };

  // --- Log Out Handler ---
  const handleSignOut = () => {
    setShowSignOutConfirm(true);
  };

  const confirmSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear offline session on manual user logout
      localStorage.removeItem('rpf_offline_session');
      setAuthUser(null);
      setCurrentView('dashboard');
      setSelectedJournalId(undefined);
      setShowSignOutConfirm(false);
    }
  };

  // --- View Changer Router ---
  const [printViewAction, setPrintViewAction] = useState<'share' | 'download' | 'print' | undefined>();

  const handleViewChange = (view: string, targetId?: string, action?: 'share' | 'download' | 'print') => {
    setCurrentView(view);
    setSelectedJournalId(targetId);
    setPrintViewAction(action);
    if (view !== 'print') {
      setSelectedJournalForPrint(undefined);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setIsMobileMenuOpen(false); // Close mobile sidebar if open
  };

  // --- Beautiful Animated Indian Railways RPF TA Companion Splash Screen ---
  if (showSplash) {
    const splashMessages = [
      { en: "🛡️ Booting Secure Security Core & Auth Protocols", hi: "सुरक्षा मॉड्यूल और रक्षा प्रमाणीकरण प्रारंभ" },
      { en: "📦 Synchronizing Local Offline Database Caching (IndexedDB)", hi: "स्थानीकृत ऑफलाइन डेटाबेस सिंक सक्रिय" },
      { en: "📡 Spawning Secure SSL Channel to Firebase Cloud Firestore", hi: "क्लाउड डेटाबेस से सुरक्षित संपर्क स्थापित" },
      { en: "🔑 Authorizing Cryptographic Officer Session Token", hi: "सत्र क्रेडेंशियल सुरक्षा सत्यापन एवं प्राधिकरण" },
      { en: "🧬 Verifying RPF TA Ledger Alignment Indexes", hi: "आरपीएफ यात्रा जर्नल लेजर इंडेक्स संरेखण" },
      { en: "🇮🇳 Jay Hind! Welcome to TA Companion. App Ready!", hi: "जय हिन्द! आर.पी.एफ. जर्नल कम्पाइलर तैयार है।" }
    ];

    const currentMsg = splashMessages[splashStep] || splashMessages[0];

    return (
      <AnimatePresence>
        <motion.div 
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-start md:justify-center p-4 sm:p-6 bg-[#0c0d0a] text-stone-100 overflow-y-auto select-none pt-12 md:pt-6 md:pb-6"
        >
          {/* Decorative Security Grid Background */}
          <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

          {/* Golden Corner Guards */}
          <div className="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-amber-500/30 rounded-tl-lg pointer-events-none hidden sm:block" />
          <div className="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-amber-500/30 rounded-tr-lg pointer-events-none hidden sm:block" />
          <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-amber-500/30 rounded-bl-lg pointer-events-none hidden sm:block" />
          <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-amber-500/30 rounded-br-lg pointer-events-none hidden sm:block" />

          {/* Floating Railway / Tactical details in corners */}
          <div className="absolute top-6 left-6 text-[10px] font-mono opacity-40 text-stone-400 tracking-widest leading-normal uppercase text-left font-bold hidden md:block">
            OFFICER CONSOLE
          </div>
          <div className="absolute top-6 right-6 text-[10px] font-mono opacity-40 text-stone-400 tracking-widest leading-normal uppercase text-right font-bold hidden md:block">
            DB: CLOUD SQL FIRESTORE<br />
            SECURE PORT: 443 HTTPS
          </div>

          <div className="relative flex flex-col items-center max-w-lg w-full text-center space-y-6 md:space-y-8 z-10 my-auto md:my-0">
            {/* Simplified opening emblem - Elegant Golden Shield */}
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="relative flex items-center justify-center bg-white p-2 border-2 border-amber-500/30 rounded-full w-24 h-24 sm:w-28 sm:h-28 mb-1 shadow-lg select-none pointer-events-none"
            >
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/8/84/Logo_of_RPF.jpg"
                alt="RPF Official Emblem"
                className="w-20 h-20 sm:w-24 sm:h-24 object-contain rounded-full"
                referrerPolicy="no-referrer"
              />
            </motion.div>

            {/* Typography with Golden Indian Emblem Theme */}
            <div className="space-y-4 w-full">
              <motion.h1 
                initial={{ letterSpacing: "0.1em", y: 15, opacity: 0 }}
                animate={{ letterSpacing: "0.15em", y: 0, opacity: 1 }}
                transition={{ duration: 0.8 }}
                className="text-stone-100 text-lg md:text-xl font-black uppercase tracking-widest font-sans drop-shadow-md flex flex-col gap-1"
              >
                <span>रेलवे सुरक्षा बल</span>
                <span className="text-amber-400 text-xs md:text-sm tracking-[0.22em] font-extrabold text-[#d2ab5e]">RAILWAY PROTECTION FORCE</span>
              </motion.h1>

              {/* PROJECT VANI - Dynamic Animated Indian Railways Centerpiece */}
              <div className="flex justify-center py-1">
                <motion.div 
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.25, duration: 0.8, type: "spring", stiffness: 120 }}
                  className="relative p-[1.5px] bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-500 rounded-2xl shadow-[0_0_35px_rgba(245,158,11,0.3)] overflow-hidden max-w-sm w-full"
                >
                  {/* Slow moving rainbow sweep */}
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-indigo-500/20 animate-pulse pointer-events-none" />
                  
                  <div className="bg-[#0b0c09] rounded-2xl px-6 py-5 relative z-10 border border-amber-500/10">
                    <div className="text-[9px] uppercase font-mono tracking-[0.3em] text-amber-400 font-extrabold mb-2 flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      SECURE DIGITAL INITIATIVE
                    </div>
                    
                    <div className="flex justify-center items-center gap-1 select-none">
                      {"PROJECT VANI".split("").map((letter, idx) => (
                        <motion.span
                          key={idx}
                          initial={{ opacity: 0, scale: 0.1, y: 10 }}
                          animate={{ 
                            opacity: [0.7, 1, 0.7], 
                            scale: [0.93, 1.11, 0.93],
                            y: [0, -3, 0],
                            filter: [
                              "drop-shadow(0 2px 4px rgba(245, 158, 11, 0.3))",
                              "drop-shadow(0 6px 20px rgba(245, 158, 11, 0.85))",
                              "drop-shadow(0 2px 4px rgba(245, 158, 11, 0.3))"
                            ]
                          }}
                          whileHover={{
                            scale: 1.38,
                            y: -8,
                            rotate: [0, -5, 5, 0],
                            filter: "brightness(1.5) drop-shadow(0 0 14px rgba(245, 158, 11, 0.95))",
                          }}
                          whileTap={{ 
                            scale: 0.88, 
                            y: 2 
                          }}
                          transition={{
                            opacity: {
                              repeat: Infinity,
                              duration: 2.5,
                              ease: "easeInOut",
                              delay: idx * 0.15
                            },
                            scale: {
                              repeat: Infinity,
                              duration: 2.5,
                              ease: "easeInOut",
                              delay: idx * 0.15
                            },
                            y: {
                              repeat: Infinity,
                              duration: 2.5,
                              ease: "easeInOut",
                              delay: idx * 0.15
                            },
                            filter: {
                              repeat: Infinity,
                              duration: 2.5,
                              ease: "easeInOut",
                              delay: idx * 0.15
                            }
                          }}
                          className={`text-2xl md:text-3xl font-black tracking-wider inline-block cursor-pointer select-none transition-all duration-150 ${
                            letter === ' ' ? 'mx-1' : ''
                          } bg-clip-text text-transparent bg-gradient-to-b from-white via-amber-200 to-amber-500 filter contrast-125 font-sans`}
                        >
                          {letter === ' ' ? '\u00A0' : letter}
                        </motion.span>
                      ))}
                    </div>

                    {/* Welcome indicator under PROJECT VANI */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8, y: 10 }}
                      animate={{ 
                        opacity: 1,
                        scale: 1, 
                        y: 0,
                      }}
                      transition={{ 
                        delay: 0.8,
                        duration: 0.8,
                        type: "spring"
                      }}
                      className="mt-4 flex justify-center"
                    >
                      <motion.div
                        animate={{
                          boxShadow: [
                            "0 0 4px rgba(245, 158, 11, 0.15), inset 0 0 2px rgba(245, 158, 11, 0.05)",
                            "0 0 10px rgba(245, 158, 11, 0.4), inset 0 0 5px rgba(245, 158, 11, 0.2)",
                            "0 0 4px rgba(245, 158, 11, 0.15), inset 0 0 2px rgba(245, 158, 11, 0.05)"
                          ],
                          borderColor: [
                            "rgba(245, 158, 11, 0.2)",
                            "rgba(245, 158, 11, 0.5)",
                            "rgba(245, 158, 11, 0.2)"
                          ]
                        }}
                        transition={{
                          duration: 2.5,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                        className="px-6 py-2 rounded-full bg-black/50 border backdrop-blur-sm flex items-center gap-2.5 select-none"
                      >
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400/60 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500/80"></span>
                        </span>
                        <motion.span
                          animate={{
                            textShadow: [
                              "0 0 1px #fff, 0 0 3px rgba(245, 158, 11, 0.5), 0 0 6px rgba(217, 119, 6, 0.3)",
                              "0 0 2px #fff, 0 0 5px rgba(245, 158, 11, 0.85), 0 0 10px rgba(217, 119, 6, 0.5)",
                              "0 0 1px #fff, 0 0 3px rgba(245, 158, 11, 0.5), 0 0 6px rgba(217, 119, 6, 0.3)"
                            ]
                          }}
                          transition={{
                            duration: 2.5,
                            repeat: Infinity,
                            ease: "easeInOut"
                          }}
                          className="text-[13px] md:text-sm uppercase font-mono tracking-[0.32em] font-black text-amber-100"
                        >
                          BY NITESH
                        </motion.span>
                      </motion.div>
                    </motion.div>

                    <div className="mt-3.5 pt-3 border-t border-stone-800/80 flex items-center justify-center gap-2">
                      <motion.span 
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                        className="px-2.5 py-0.5 rounded-sm bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 text-[10px] font-black tracking-widest uppercase border border-amber-500/30"
                      >
                        प्रोजेक्ट वाणी
                      </motion.span>
                      <span className="w-1.5 h-1.5 rounded-full bg-stone-700" />
                      <span className="text-[10px] text-[#c8d4a5] font-mono tracking-wider font-extrabold uppercase">
                        v2.0 ONLINE
                      </span>
                    </div>
                  </div>
                </motion.div>
              </div>

              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.8 }}
                transition={{ delay: 0.55 }}
                className="text-[#c8d4a5] text-[11px] uppercase font-mono tracking-[0.2em] font-bold shrink-0"
              >
                ⭐ Travel Allowance Journal Compiler ⭐
              </motion.p>

            </div>

            {/* Elegant Modern Glassmorphism Loading Track */}
            <div className="w-full space-y-4">
              <div className="flex justify-between items-end px-1 text-stone-400 font-mono text-[10.5px] font-bold">
                <span className="text-amber-400/80">ALIGNED SECURITY PROTOCOLS</span>
                <span className="text-blue-400 font-black">{Math.round(splashProgress)}%</span>
              </div>

              <div className="w-full h-2.5 bg-stone-950 border border-[#3c4137] rounded-full overflow-hidden p-[2px] shadow-sm relative">
                <motion.div 
                  initial={{ width: "0%" }}
                  animate={{ width: `${splashProgress}%` }}
                  transition={{ ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 via-blue-500 to-emerald-500 relative shadow-inner"
                >
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[size:10px_10px]" />
                </motion.div>
              </div>

              {/* Unique Interactive Indian Railways Route Tracker (Change 1) */}
              <div className="relative pt-2 pb-1.5 px-3 bg-stone-950/40 border border-stone-800/60 rounded-xl">
                {/* Rails Track Background Line */}
                <div className="absolute top-6 left-6 right-6 h-[2px] bg-stone-800" />
                <div 
                  className="absolute top-6 left-6 h-[2px] bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-300" 
                  style={{ width: `calc(${splashProgress}% - 12px)` }} 
                />

                {/* Sliding Modern Bullet Train / बुलेट ट्रेन (Vande Bharat Style) with glowing speed trails */}
                <div 
                  className="absolute top-[8px] transition-all duration-300 flex flex-col items-center select-none pointer-events-none"
                  style={{ left: `calc(${splashProgress}% - 14px)` }}
                >
                  <div className="relative w-11 h-6">
                    {/* Glowing High-Speed Motion/Speed Trail (Chamakta hua nishan behind the train) */}
                    <div className="absolute top-[8px] right-[40px] left-[-24px] h-[3px] overflow-hidden pointer-events-none flex gap-[2px] items-center justify-end opacity-85">
                      <motion.div
                        animate={{ opacity: [1, 0.2, 1], scaleX: [1, 1.5, 1] }}
                        transition={{ repeat: Infinity, duration: 0.6, ease: "linear" }}
                        className="w-8 h-[2px] bg-gradient-to-l from-blue-400 via-sky-400 to-transparent rounded-full shadow-[0_0_6px_rgba(56,189,248,0.7)]"
                      />
                      <motion.div
                        animate={{ opacity: [0.3, 0.9, 0.3], x: [-5, 5, -5] }}
                        transition={{ repeat: Infinity, duration: 0.4, ease: "linear" }}
                        className="w-4 h-[1.5px] bg-gradient-to-l from-orange-400 via-amber-300 to-transparent rounded-full shadow-[0_0_4px_rgba(245,158,11,0.5)]"
                      />
                      <motion.div
                        animate={{ opacity: [0.8, 0.1, 0.8], scaleX: [0.8, 1.3, 0.8] }}
                        transition={{ repeat: Infinity, duration: 0.5, ease: "linear", delay: 0.2 }}
                        className="w-6 h-[1px] bg-sky-200/50 rounded-full"
                      />
                    </div>

                    {/* Sleek Aerodynamic Vande Bharat SVG */}
                    <svg viewBox="0 0 28 16" className="w-11 h-6 drop-shadow-[0_0_10px_rgba(56,189,248,0.7)]">
                      {/* Train Body Shadow/Base */}
                      <path d="M 1 L 12.5 h 13.5 C 27.5 12.5 , 28 11.5 , 28 10 C 28 8.5 , 25 5.5 , 24 5.5 C 22.8 4.2 , 21 4 , 19 4 H 1 Z" className="fill-blue-900" />
                      
                      {/* Main White Lower Body */}
                      <path d="M 1.5 4.5 H 19 C 20.5 4.5 , 22 4.7 , 23 5.7 L 26 8.7 C 26.6 9.3 , 26.8 10.2 , 26.5 10.8 C 26.2 11.4 , 25.4 12 , 24.5 12 H 1.5 Z" className="fill-slate-50" />
                      
                      {/* Signature Deep Blue Dynamic Side Pattern / S-Band */}
                      <path d="M 1.5 7 H 15 C 17.5 7 , 19.5 7.5 , 21.5 9 L 24.5 11 C 25.2 11.5 , 25.5 12 , 24.5 12 H 11 C 8.5 12 , 6 10 , 4 9 Z" className="fill-blue-600" />

                      {/* Accent Tricolor Trim (Saffron/Orange dynamic wave) */}
                      <path d="M 1.5 6 H 16 C 18 6 , 19.5 6.3 , 21 7.2 L 23.5 8.7 L 24 9.2 C 24.2 9.5 , 24.5 9.7 , 23.8 9.7 H 12 C 9.5 9.7 , 7.5 8.2 , 5.5 7.5 Z" className="fill-orange-500" />

                      {/* Aerodynamic Sleek Driver Windshield glass (Dark glass front) */}
                      <path d="M 22.2 5.8 L 24.8 8.4 C 25.2 8.8 , 25.3 9.4 , 24.9 9.6 H 22.8 C 22.2 9.6 , 21.4 9 , 21.2 8.4 L 20.8 6.5 C 20.6 5.9 , 21 5.8 , 21.5 5.8 Z" className="fill-stone-900" />
                      
                      {/* Passenger Coach Windows */}
                      <rect x="3" y="5.5" width="2.5" height="1.8" rx="0.3" className="fill-stone-800" />
                      <rect x="6.5" y="5.5" width="2.5" height="1.8" rx="0.3" className="fill-stone-800" />
                      <rect x="10" y="5.5" width="2.5" height="1.8" rx="0.3" className="fill-stone-800" />
                      <rect x="13.5" y="5.5" width="2.5" height="1.8" rx="0.3" className="fill-stone-800" />
                      <rect x="17" y="5.5" width="1.8" height="1.8" rx="0.3" className="fill-stone-800" />

                      {/* Glowing Front Headlight */}
                      <circle cx="25.4" cy="10.2" r="0.75" className="fill-yellow-300 animate-pulse" />
                      {/* Futuristic Light Beam */}
                      <polygon points="25.5,10 27.8,9.2 27.8,11.2 25.5,10.4" className="fill-yellow-200/35" />

                      {/* Bullet Train wheels (hidden or tiny sleek dark discs) */}
                      <circle cx="5" cy="12.5" r="1.1" className="fill-stone-700" />
                      <circle cx="9" cy="12.5" r="1.1" className="fill-stone-700" />
                      <circle cx="15" cy="12.5" r="1.1" className="fill-stone-700" />
                      <circle cx="19" cy="12.5" r="1.1" className="fill-stone-700" />
                    </svg>
                  </div>
                </div>

                {/* Stations row */}
                <div className="flex justify-between items-center relative z-10 pt-4">
                  {[
                    { code: 'HWH', min: 0 },
                    { code: 'KGP', min: 25 },
                    { code: 'CKP', min: 50 },
                    { code: 'TATA', min: 75 },
                    { code: 'ROU', min: 95 }
                  ].map((station) => {
                    const isReached = splashProgress >= station.min;
                    return (
                      <div key={station.code} className="flex flex-col items-center">
                        <div 
                          className={`w-2.5 h-2.5 rounded-full border-2 transition-all duration-500 ${
                            isReached 
                              ? 'bg-emerald-500 border-white ring-4 ring-emerald-500/25 scale-110' 
                              : 'bg-stone-950 border-stone-800'
                          }`} 
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bilingual Log status box updating in a terminal ticker */}
            <div className="w-full min-h-[72px] bg-[#161814] border border-stone-800 p-3.5 rounded-xl font-mono text-left flex items-start gap-3 relative shadow-md">
              <div className="flex flex-col items-center justify-center shrink-0 mt-0.5">
                {splashProgress === 100 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 animate-bounce" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-amber-500 animate-spin shrink-0" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-amber-300 font-bold text-[11px] leading-snug">
                  {currentMsg.en}
                </p>
                <p className="text-stone-400 text-[10.5px] leading-relaxed font-semibold">
                  {currentMsg.hi}
                </p>
              </div>
            </div>

            {/* Security Notice Footer */}
            <div className="pt-2 text-[9px] font-mono tracking-wider opacity-40 text-center text-stone-400 uppercase">
              SECURE SESSION ID: TA-{(Math.floor(splashProgress * 12389 + 1) * 3).toString(16).toUpperCase()} • SECURED FOR INDIAN RAILWAYS
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Fallback boot block if authLoading takes much longer for slow network
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0c0d0a] flex flex-col items-center justify-center p-6 text-stone-100">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-amber-500 border-t-transparent mb-4"></div>
        <p className="text-amber-400 text-xs font-bold tracking-wider font-mono">Loading App Context / लोड हो रहा है...</p>
      </div>
    );
  }

  // If user is not logged in / unauthenticated, enforce Auth component
  if (!authUser) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex flex-col justify-between">
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex items-center justify-center">
          <React.Suspense fallback={
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-md w-full">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-amber-400 border-t-transparent mb-4"></div>
              <p className="text-slate-600 text-xs font-mono font-bold uppercase tracking-wider animate-pulse text-center">Loading Security System / लोड हो रहा है...</p>
            </div>
          }>
            <Auth 
            onAuthSuccess={handleAuthSuccess} 
            onOfflineBypass={(mockUser, profile) => {
              const defaultProfile: OfficerProfile = profile || {
                id: mockUser.uid,
                pfNumber: '9991200',
                name: mockUser.displayName,
                designation: 'Sub-Inspector (SI)',
                branch: 'Security Branch',
                division: 'CKP Division',
                headquarter: 'RPF/POST/BUF',
                basicPay: 44900,
                scaleOfPay: '9,300-34,800',
                dateOfAppointment: '2020-04-12',
                ruleGoverned: 'S. Rule',
                billUnit: '',
                gradePay: 4200
              };
              
              // Persist the offline bypass session configuration
              localStorage.setItem('rpf_offline_session', JSON.stringify({
                user: mockUser,
                profile: defaultProfile
              }));

              setAuthUser(mockUser as any);
              setActiveUserProfile(defaultProfile);
              
              // Sync local profiles listing
              const userProfilesKey = `rpf_profiles_${mockUser.uid}`;
              const storedProfiles = localStorage.getItem(userProfilesKey);
              let localList: OfficerProfile[] = storedProfiles ? JSON.parse(storedProfiles) : [];
              
              const deletedKey = `rpf_deleted_profiles_${mockUser.uid}`;
              const deletedStr = localStorage.getItem(deletedKey);
              const deletedList: string[] = deletedStr ? JSON.parse(deletedStr) : [];
              const isExplicitlyDeleted = deletedList.includes(defaultProfile.id);

              const exists = localList.some(p => p.id === defaultProfile.id);
              if (!exists) {
                if (!isExplicitlyDeleted) {
                  localList = [defaultProfile, ...localList];
                  localStorage.setItem(userProfilesKey, JSON.stringify(localList));
                }
              } else {
                // update local listing
                localList = localList.map(p => p.id === defaultProfile.id ? defaultProfile : p);
                localStorage.setItem(userProfilesKey, JSON.stringify(localList));
              }
              setProfiles(localList);
            }} 
          />
          </React.Suspense>
        </main>
        
        {/* Simple Footer under Auth */}
        <footer className="py-6 border-t border-slate-200/60 text-slate-400 text-xs text-center bg-white/50">
          <div className="max-w-7xl mx-auto px-4">
            <p className="font-semibold text-slate-500">RPF Travelling Allowance Journal Automated Compiler</p>
            <p className="text-slate-400 mt-1">Built with Zero-Trust Secure Identity.</p>
          </div>
        </footer>
      </div>
    );
  }

  // Fallback profile if user logged in but Firestore doc sync is still loading or doesn't exist
  const finalProfile: OfficerProfile = activeUserProfile || {
    id: authUser.uid,
    pfNumber: 'Pending setup',
    name: authUser.displayName || authUser.email?.split('@')[0] || 'RPF Member',
    designation: 'Constable',
    branch: 'Security Branch',
    division: 'CKP Division',
    headquarter: 'RPF/POST/BUF',
    basicPay: 21700,
    scaleOfPay: '5,200-20,200',
    dateOfAppointment: '',
    ruleGoverned: 'S. Rule',
    billUnit: '',
    gradePay: 2000
  };

  // Check if current user is the app parent / developer (STRICT email check only)
  const isAppParent = authUser?.email?.toLowerCase() === 'nitesh0724@gmail.com';

  const displayedJournals = isAppParent 
    ? (adminSelectedUserId ? journals.filter(j => j.adminOwnerId === adminSelectedUserId || j.id === GANESH_CHANDRA_MALIK_JOURNAL.id) : journals) 
    : journals.filter(j => !j.adminOwnerId || j.adminOwnerId === authUser.uid || j.profileId === activeUserProfile?.id || j.id === GANESH_CHANDRA_MALIK_JOURNAL.id || (j.officerName && j.officerName.toLowerCase().trim() === 'ganesh chandra malik'));

  const displayedProfiles = isAppParent 
    ? (adminSelectedUserId ? profiles.filter(p => p.adminOwnerId === adminSelectedUserId || p.id === GANESH_CHANDRA_MALIK_PROFILE.id) : profiles) 
    : profiles.filter(p => !p.adminOwnerId || p.adminOwnerId === authUser.uid || p.id === activeUserProfile?.id || p.id === GANESH_CHANDRA_MALIK_PROFILE.id || p.name.toLowerCase().trim() === 'ganesh chandra malik');

  return (
    <div className="min-h-screen flex flex-col bg-[#f8f7f4] text-[#2d302a]">
      
      {/* Top Main Navigation Header Banner styled with Natural Tones */}
      <header className="bg-[#2d302a] text-stone-100 border-b border-[#c8d4a5]/10 shadow-sm sticky top-0 z-50 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Branding Shield Logo */}
            <div 
              onClick={() => handleViewChange('dashboard')}
              className="flex items-center gap-3 cursor-pointer select-none group"
            >
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-white p-0.5 flex items-center justify-center overflow-hidden border border-[#c8d4a5]/30 shadow-md group-hover:scale-105 transition-transform duration-200">
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/8/84/Logo_of_RPF.jpg"
                  alt="RPF Logo"
                  className="w-8 h-8 object-contain rounded-full"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="text-left">
                <div id="branding-title" className="font-extrabold text-sm tracking-tight font-sans text-white group-hover:text-[#c8d4a5] transition-colors duration-150">RPF TA-Companion</div>
                <div className="text-[9px] text-[#c8d4a5] font-mono tracking-widest uppercase font-bold">INDIAN RAILWAYS</div>
              </div>
            </div>

            {/* Desktop Nav Items */}
            <nav className="hidden xl:flex items-center gap-2 text-xs font-semibold">
              <button
                onClick={() => handleViewChange('dashboard')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  currentView === 'dashboard' 
                    ? 'bg-[#c8d4a5] text-[#2d302a] shadow-xs' 
                    : 'text-stone-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 text-current" />
                Dashboard / मुख्य पृष्ठ
              </button>
              
              <button
                onClick={() => handleViewChange('profiles')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  currentView === 'profiles' 
                    ? 'bg-[#c8d4a5] text-[#2d302a] shadow-xs' 
                    : 'text-stone-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Users className="w-4 h-4 text-current" />
                Staff Profiles / कर्मचारी सूची
              </button>

              <button
                onClick={() => handleViewChange('rates')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  currentView === 'rates' 
                    ? 'bg-[#c8d4a5] text-[#2d302a] shadow-xs' 
                    : 'text-stone-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Sliders className="w-4 h-4 text-current" />
                Rate Settings / दर नियम
              </button>

              <button
                onClick={() => handleViewChange('my-profile')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  currentView === 'my-profile' 
                    ? 'bg-[#c8d4a5] text-[#2d302a] shadow-xs' 
                    : 'text-stone-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <User className="w-4 h-4 text-current" />
                My Profile / मेरी प्रोफाइल
              </button>

              <button
                onClick={() => handleViewChange('support')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  currentView === 'support' 
                    ? 'bg-[#c8d4a5] text-[#2d302a] shadow-xs' 
                    : 'text-stone-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <HelpCircle className="w-4 h-4 text-current" />
                Contact & Support / सहायता एवं शिकायत
              </button>

              <button
                onClick={() => handleViewChange('google-drive')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  currentView === 'google-drive' 
                    ? 'bg-[#c8d4a5] text-[#2d302a] shadow-xs' 
                    : 'text-stone-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Cloud className="w-4 h-4 text-blue-400" />
                Google Drive / गूगल ड्राइव
              </button>

              {isAppParent && (
                <button
                  type="button"
                  onClick={() => handleViewChange('admin-console')}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all border shrink-0 cursor-pointer ${
                    currentView === 'admin-console' 
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' 
                      : 'text-amber-300 hover:text-amber-100 hover:bg-white/5 border-transparent'
                  }`}
                >
                  <Shield className="w-4 h-4 text-amber-400" />
                  Admin Console / एडमिन कंसोल
                </button>
              )}

              <button
                onClick={() => handleViewChange('new-claim')}
                className="inline-flex items-center gap-1.5 bg-[#c8d4a5] hover:bg-[#b0bf88] text-[#2d302a] px-3.5 py-2 rounded-lg shadow-sm transition ml-2 font-bold hover:shadow-md cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Prepare Journal / नया दावा
              </button>

              {!isAppInstalled && (
                <button
                  type="button"
                  onClick={handleTriggerInstall}
                  className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-950 px-3 py-2 rounded-lg shadow-sm transition ml-1.5 font-black text-xs cursor-pointer active:scale-95 border border-amber-300/40"
                  title="Install RPF TA Journal as an App on Android or PC (मोबाइल या कंप्यूटर में ऐप इंस्टॉल करें)"
                >
                  <Download className="w-4 h-4 text-stone-950 shrink-0 animate-bounce" />
                  <span>Install App / ऐप इंस्टॉल</span>
                </button>
              )}

              {/* Connection & Sync Pending Badge / Status */}
              <div id="sync-connectivity-badge" className="flex items-center gap-2 ml-2">
                {(() => {
                  const isLocalUser = authUser?.uid ? (authUser.uid.startsWith('local_') || authUser.uid === 'offline_local_user') : true;

                  if (!isOnline) {
                    if (pendingSyncCount > 0) {
                      return (
                        <div 
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10.5px] uppercase font-black bg-gradient-to-r from-red-650/30 to-amber-600/20 text-amber-300 border border-amber-500/60 tracking-wider animate-pulse hover:scale-105 transition-all cursor-help"
                          title={`OFFLINE WARNING: You have ${pendingSyncCount} changes save locally in IndexedDB but NOT synchronized. Connect to internet to sync.`}
                        >
                          <span className="w-2 h-2 bg-amber-400 rounded-full animate-ping shrink-0"></span>
                          <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Offline: {pendingSyncCount} Pending Sync</span>
                        </div>
                      );
                    }
                    return (
                      <div 
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10.5px] uppercase font-bold bg-[#2d302a] text-stone-300 border border-stone-800 tracking-wider"
                        title="OFFLINE: Internet disconnected. Cache is clean & ready for edits."
                      >
                        <WifiOff className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                        <span>Offline</span>
                      </div>
                    );
                  }

                  if (isLocalUser) {
                    return (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div 
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10.5px] uppercase font-extrabold bg-[#2d302a] border border-stone-850 text-amber-400 tracking-wider"
                          title="TRIAL / GUEST USER: Data is NOT saved on Cloud. Sign out & log in with Email or Google to protect sync."
                        >
                          <CloudOff className="w-3.5 h-3.5 text-amber-400 shrink-0 mr-1 animate-bounce" />
                          <span>Local Sandbox</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const backupData: Record<string, string | null> = {};
                            for (let i = 0; i < localStorage.length; i++) {
                              const key = localStorage.key(i);
                              if (key && (key.startsWith('rpf_') || key === 'rpf_offline_session')) {
                                backupData[key] = localStorage.getItem(key);
                              }
                            }
                            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `RPF_TA_TransferBackup_${new Date().toISOString().split('T')[0]}.json`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer select-none"
                          title="Click here to backup your offline data so you can restore it in the direct new tab! / तुरंत बैकअप लें"
                        >
                          <Download className="w-3 h-3 text-current shrink-0" />
                          <span>Backup</span>
                        </button>
                      </div>
                    );
                  }

                  if (pendingSyncCount > 0) {
                    return (
                      <button 
                        onClick={() => triggerPlaybackSync()}
                        disabled={isSyncing}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10.5px] uppercase font-black tracking-wider transition-all cursor-pointer active:scale-95 border hover:brightness-110 shadow-sm bg-gradient-to-r from-red-650 to-red-600 text-white border-red-500 hover:shadow-red-500/20 hover:shadow-md animate-pulse`}
                        title={isSyncing ? `Running cloud upload playback...` : `${pendingSyncCount} offline modifications waiting to upload. Click to FORCE SYNC now!`}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-white shrink-0 ${isSyncing ? 'animate-spin' : 'animate-bounce'}`} />
                        <span>{isSyncing ? 'Syncing...' : `SYNC NOW (${pendingSyncCount})`}</span>
                      </button>
                    );
                  }

                  return (
                    <div className="flex items-center gap-1.5">
                      <div 
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10.5px] font-black tracking-wide text-stone-100 bg-[#474c41] border border-stone-700/50 shadow-md hover:brightness-105 transition-all"
                        title="Direct secure pipeline to Firebase Cloud Firestore. Synced!"
                      >
                        <span className="w-2 h-2 bg-[#c8d4a5] rounded-full animate-ping shrink-0"></span>
                        <Cloud className="w-4 h-4 text-stone-200 shrink-0" />
                        <span>Cloud Active ✓</span>
                      </div>
                      <button
                        onClick={async () => {
                          if (isSyncing) return;
                          setIsSyncing(true);
                          try {
                            const queue = await getPendingSyncQueue();
                            if (queue.length === 0) {
                              await loadCloudAndCacheData();
                              setShowSyncSuccessToast(true);
                              setTimeout(() => setShowSyncSuccessToast(false), 3000);
                            } else {
                              await triggerPlaybackSync();
                            }
                          } catch (e) {
                            console.error("Manual sync click error:", e);
                          } finally {
                            setIsSyncing(false);
                          }
                        }}
                        disabled={isSyncing}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-stone-800 hover:bg-stone-750 text-stone-200 hover:text-white rounded-lg text-[10.5px] font-extrabold uppercase border border-stone-750 transition active:scale-95 cursor-pointer shadow-sm"
                        title="Manually force database upload check / तुरंत सिंक करें"
                      >
                        <RefreshCw className={`w-3 h-3 text-current shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
                        <span>Sync</span>
                      </button>
                    </div>
                  );
                })()}
              </div>
            </nav>

            {/* Authenticated User Profile Summary Card */}
            <div className="hidden xl:flex items-center gap-2.5 border-l border-stone-800 pl-6 text-xs text-left">
              <button 
                onClick={() => handleViewChange('my-profile')}
                className="flex items-center gap-2 text-left hover:opacity-85"
                title="Manage active account profile"
              >
                <div className="p-1.5 rounded-full bg-stone-800 text-[#c8d4a5] hover:bg-stone-750 border border-stone-750">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-stone-100 flex items-center gap-1.5 flex-wrap">
                    {finalProfile.name}
                    {isAppParent && (
                      <span className="text-[8px] font-black text-amber-500 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded tracking-wide animate-pulse shrink-0" title="Verified App Owner / Developer Parent Access Ready">PARENT</span>
                    )}
                    {authUser.uid.startsWith('local_') || authUser.uid === 'offline_local_user' ? (
                      <span className="text-[8px] font-black text-[#c8d4a5] bg-[#c8d4a5]/10 border border-[#c8d4a5]/20 px-1 py-0.5 rounded uppercase tracking-widest scale-95 shrink-0" title="Auto-Save Offline Mode / सुरक्षित रूप से स्थानीय संचित हो रहा है">LOCAL</span>
                    ) : (
                      <CloudCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" title="Cloud Profile Synchronized" />
                    )}
                  </div>
                  <div className="text-[9px] text-stone-400 font-mono leading-none">{finalProfile.designation} (PF: {finalProfile.pfNumber || 'Pending Setup'})</div>
                </div>
              </button>

              <button
                onClick={handleSignOut}
                id="signout-button"
                className="ml-4 p-2 text-stone-400 hover:text-red-400 hover:bg-white/5 rounded-lg transition cursor-pointer"
                title="Sign Out of Session"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile menu triggers */}
            <div className="flex xl:hidden items-center gap-2">
              <button
                onClick={handleSignOut}
                className="p-1.5 text-stone-300 hover:text-red-400 rounded-lg cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
              
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 text-stone-300 hover:text-white focus:outline-none cursor-pointer"
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>

          </div>
        </div>

        {/* Mobile dropdown sidebar */}
        {isMobileMenuOpen && (
          <div className="xl:hidden border-t border-white/5 bg-stone-900 py-3.5 px-4 space-y-2.5 text-sm text-left font-bold tracking-wide transition-all duration-150">
            
            {/* Authenticated User Profile Summary Card (Mobile Dropdown View) */}
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-white/5 border border-white/10 text-xs">
              <div className="p-1.5 rounded-full bg-white/10 text-[#c8d4a5]">
                <UserCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-stone-100 flex items-center gap-1.5 flex-wrap">
                  {finalProfile.name}
                  {isAppParent && (
                    <span className="text-[7px] font-black text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 py-0.5 rounded tracking-wide animate-pulse" title="Verified App Owner Ready">PARENT</span>
                  )}
                  {authUser.uid.startsWith('local_') || authUser.uid === 'offline_local_user' ? (
                    <span className="text-[7px] font-black text-[#c8d4a5] bg-[#c8d4a5]/10 border border-[#c8d4a5]/20 px-1 py-0.5 rounded uppercase tracking-wider">LOCAL</span>
                  ) : (
                    <CloudCheck className="w-3 h-3 text-blue-400" title="Cloud Profile Synchronized" />
                  )}
                </div>
                <div className="text-[9px] text-[#c8d4a5] font-mono leading-none truncate mt-0.5">{finalProfile.designation} (PF: {finalProfile.pfNumber || 'Pending Setup'})</div>
              </div>
            </div>

            {/* Mobile Connection / Sync Pending Display Bar */}
            <div className="pb-2 border-b border-white/5 text-[11px] font-semibold text-stone-300">
              {(() => {
                const isLocalUser = authUser?.uid ? (authUser.uid.startsWith('local_') || authUser.uid === 'offline_local_user') : true;

                if (!isOnline) {
                  if (pendingSyncCount > 0) {
                    return (
                      <div className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-gradient-to-r from-red-650/40 to-amber-600/20 border border-amber-500/45 text-amber-300">
                        <span className="flex items-center gap-2 font-black uppercase text-[10px]">
                          <WifiOff className="w-3.5 h-3.5 text-amber-400 animate-pulse animate-bounce" />
                          <span>Offline: {pendingSyncCount} Saved Locally</span>
                        </span>
                        <span className="text-[9px] uppercase font-black text-amber-200 bg-amber-655/50 px-2 py-0.5 rounded tracking-wider animate-pulse">Pending Sync</span>
                      </div>
                    );
                  }
                  return (
                    <div className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-red-650/20 border border-red-500/40 text-red-400">
                      <span className="flex items-center gap-2 font-extrabold uppercase text-[10px]">
                        <WifiOff className="w-3.5 h-3.5 text-red-400" />
                        <span>Offline Mode</span>
                      </span>
                      <span className="text-[9px] uppercase font-black text-white bg-red-600 px-2 py-0.5 rounded tracking-wider">Local Only</span>
                    </div>
                  );
                }

                if (isLocalUser) {
                  return (
                    <div className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-red-650/25 border border-red-500/50 text-red-400">
                      <span className="flex items-center gap-2 font-extrabold uppercase text-[10px]">
                        <CloudOff className="w-3.5 h-3.5 text-red-400" />
                        <span>Sandbox Mode (No Cloud)</span>
                      </span>
                      <span className="text-[9px] uppercase font-black text-white bg-red-600 px-2 py-0.5 rounded tracking-wider">No Cloud</span>
                    </div>
                  );
                }

                if (pendingSyncCount > 0) {
                  return (
                    <button 
                      onClick={() => triggerPlaybackSync()}
                      disabled={isSyncing}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-gradient-to-r from-red-600 to-red-550 border border-red-400 text-white shadow-md active:scale-98 transition-all"
                    >
                      <span className="flex items-center gap-2 font-bold uppercase text-[10px]">
                        <RefreshCw className={`w-3.5 h-3.5 text-white ${isSyncing ? 'animate-spin' : 'animate-bounce'}`} />
                        <span>{isSyncing ? 'Syncing...' : `Unsynced changes (${pendingSyncCount})`}</span>
                      </span>
                      <span className="text-[9px] uppercase font-black text-red-900 bg-white px-2 py-0.5 rounded tracking-wider animate-pulse">
                        {isSyncing ? 'Uploading' : 'Tap to Sync'}
                      </span>
                    </button>
                  );
                }

                return (
                  <div className="w-full flex flex-col gap-2">
                    <div className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-[#474c41] border border-stone-700 text-stone-100 shadow-sm shadow-blue-950/10">
                      <span className="flex items-center gap-2 font-black text-[11px]">
                        <span className="w-2 h-2 rounded-full bg-[#c8d4a5] animate-ping"></span>
                        <Cloud className="w-3.5 h-3.5 text-stone-200" />
                        <span>Cloud Live Synced ✓</span>
                      </span>
                      <span className="text-[9.5px] uppercase font-black text-[#c8d4a5] bg-stone-700 px-2 py-0.5 rounded tracking-wider">Synced</span>
                    </div>
                    <button
                      onClick={async () => {
                        if (isSyncing) return;
                        const queue = await getPendingSyncQueue();
                        if (queue.length === 0) {
                          setShowAlreadySyncedToast(true);
                          setTimeout(() => setShowAlreadySyncedToast(false), 3000);
                        } else {
                          triggerPlaybackSync();
                        }
                      }}
                      disabled={isSyncing}
                      className="w-full flex items-center justify-center gap-2 px-3.5 py-2 bg-stone-800 hover:bg-stone-750 text-stone-200 hover:text-white rounded-lg text-xs font-bold border border-stone-750 active:scale-95 transition cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>Sync Now / तुरंत सिंक करें</span>
                    </button>
                  </div>
                );
              })()}
            </div>

            {!isAppInstalled && (
              <button
                type="button"
                onClick={() => {
                  handleTriggerInstall();
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 active:from-amber-600 active:to-amber-700 text-stone-950 font-black rounded-lg text-xs shadow-md transition cursor-pointer mb-1 border border-amber-300/40"
              >
                <Download className="w-4 h-4 text-stone-950 shrink-0 animate-bounce" />
                <span>📲 Install App (मोबाइल में ऐप इंस्टॉल करें)</span>
              </button>
            )}

            <button
              onClick={() => handleViewChange('dashboard')}
              className="w-full flex items-center gap-2 px-3 py-2 text-stone-300 hover:text-white hover:bg-white/5 rounded-lg transition cursor-pointer"
            >
              <LayoutDashboard className="w-4 h-4 text-[#c8d4a5]" />
              Dashboard / मुख्य पृष्ठ
            </button>
            <button
              onClick={() => handleViewChange('profiles')}
              className="w-full flex items-center gap-2 px-3 py-2 text-stone-300 hover:text-white hover:bg-white/5 rounded-lg transition cursor-pointer"
            >
              <Users className="w-4 h-4 text-[#c8d4a5]" />
              Staff Profiles / कर्मचारी सूची
            </button>
            <button
              onClick={() => handleViewChange('rates')}
              className="w-full flex items-center gap-2 px-3 py-2 text-stone-300 hover:text-white hover:bg-white/5 rounded-lg transition cursor-pointer"
            >
              <Sliders className="w-4 h-4 text-[#c8d4a5]" />
              Rate Settings / दर नियम
            </button>
            <button
              onClick={() => handleViewChange('my-profile')}
              className="w-full flex items-center gap-2 px-3 py-2 text-stone-300 hover:text-white hover:bg-white/5 rounded-lg transition cursor-pointer"
            >
              <User className="w-4 h-4 text-[#c8d4a5]" />
              My Profile / मेरी प्रोफाइल
            </button>
            <button
              onClick={() => {
                handleViewChange('support');
                setIsMobileMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-stone-300 hover:text-white hover:bg-white/5 rounded-lg transition cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 text-[#c8d4a5]" />
              Contact & Support / सहायता एवं शिकायत
            </button>
            <button
              onClick={() => {
                handleViewChange('google-drive');
                setIsMobileMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-stone-300 hover:text-white hover:bg-white/5 rounded-lg transition cursor-pointer"
            >
              <Cloud className="w-4 h-4 text-blue-400" />
              Google Drive / गूगल ड्राइव
            </button>
            {isAppParent && (
              <button
                onClick={() => {
                  handleViewChange('admin-console');
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-amber-300 hover:text-amber-100 hover:bg-white/5 border border-amber-500/20 rounded-lg transition cursor-pointer"
              >
                <Shield className="w-4 h-4 text-amber-400" />
                Admin Console / एडमिन कंसोल
              </button>
            )}
            <button
              onClick={() => handleViewChange('new-claim')}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#c8d4a5] hover:bg-[#b0bf88] text-[#2d302a] rounded-lg transition font-bold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Prepare Journal / नया दावा
            </button>

            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                handleSignOut();
              }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-red-400 hover:text-white hover:bg-red-650 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 rounded-lg transition text-xs font-black uppercase tracking-wider justify-center mt-2.5 shadow-sm cursor-pointer"
              title="Sign Out of Session / लॉगआउट करें"
            >
              <LogOut className="w-4 h-4" />
              Sign Out / लॉगआउट करें
            </button>
          </div>
        )}
      </header>

      {/* Admin Context Banner */}
      {isAppParent && adminSelectedUserId && (
        <div className="bg-amber-500 text-stone-950 border-b border-amber-600 font-sans font-extrabold text-[11px] py-1.5 px-4 shadow-sm flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 bg-stone-950 text-amber-500 rounded-full font-black text-[10px] flex items-center justify-center shrink-0">i</span>
            <span>
              EMULATOR ACTIVE: Viewing data of user <b className="underline font-black text-stone-900">{adminUsers.find(u => u.id === adminSelectedUserId)?.name || 'UID: ' + adminSelectedUserId}</b> in strict read-only sandboxed scope.
            </span>
          </div>
          <button 
            onClick={() => setAdminSelectedUserId(null)}
            className="px-2 py-0.5 bg-stone-950 hover:bg-stone-900 text-white font-extrabold text-[9px] uppercase tracking-wider rounded border border-stone-800 transition active:scale-95 cursor-pointer shrink-0"
          >
            Reset Context / सभी का डाटा देखें
          </button>
        </div>
      )}

      {/* Main Container Content */}
      <main className={`flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col ${currentView !== 'print' ? 'no-print' : ''}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="w-full flex-1 flex flex-col"
          >
            <React.Suspense fallback={<ComponentLoader />}>
              {currentView === 'dashboard' && (
                <Dashboard
                  profiles={displayedProfiles}
                  journals={displayedJournals}
                  onViewChange={handleViewChange}
                  onDeleteJournal={handleDeleteJournal}
                  onCloneJournal={handleCloneJournal}
                  onSaveJournal={handleSaveJournal}
                  onSaveProfile={handleSaveProfile}
                  isAdmin={isAppParent}
                  adminEmail={authUser?.email || undefined}
                  onImportSharedJournal={(shared) => {
                    setJournals(prev => {
                      if (prev.some(j => j.id === shared.id)) return prev;
                      return [shared, ...prev];
                    });
                  }}
                />
              )}

              {currentView === 'profiles' && (
                <OfficerProfilesList
                  profiles={displayedProfiles}
                  onSaveProfile={handleSaveProfile}
                  onDeleteProfile={handleDeleteProfile}
                  onBack={() => handleViewChange('dashboard')}
                  onImportProfiles={handleImportProfiles}
                />
              )}

              {currentView === 'rates' && (
                <TARateSettings
                  rules={rateRules}
                  onSaveRules={handleSaveRateRules}
                  onBack={() => handleViewChange('dashboard')}
                />
              )}

              {currentView === 'my-profile' && (
                <MyProfile
                  userId={authUser.uid}
                  initialProfile={finalProfile}
                  onProfileUpdated={handleActiveProfileUpdated}
                  onBack={() => handleViewChange('dashboard')}
                />
              )}

              {currentView === 'new-claim' && (
                <ClaimBuilder
                  profiles={displayedProfiles}
                  rateRules={rateRules}
                  journals={displayedJournals}
                  onSaveJournal={handleSaveJournal}
                  onSaveAndPrint={handleSaveAndPrintJournal}
                  onBack={() => handleViewChange('dashboard')}
                  currentUser={authUser}
                  activeUserProfile={activeUserProfile || finalProfile}
                />
              )}

              {currentView === 'edit-claim' && selectedJournalId && (
                <ClaimBuilder
                  profiles={displayedProfiles}
                  rateRules={rateRules}
                  existingJournalId={selectedJournalId}
                  journals={displayedJournals}
                  onSaveJournal={handleSaveJournal}
                  onSaveAndPrint={handleSaveAndPrintJournal}
                  onBack={() => handleViewChange('dashboard')}
                  currentUser={authUser}
                  activeUserProfile={activeUserProfile || finalProfile}
                />
              )}

              {currentView === 'print' && selectedJournalId && (
                (() => {
                  const targetJournal = journals.find(j => j.id === selectedJournalId) || selectedJournalForPrint;
                  if (!targetJournal) {
                    return (
                      <div className="p-8 text-center bg-white rounded-xl shadow border border-slate-200 my-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-3 border-indigo-600 border-t-transparent mx-auto mb-3"></div>
                        <p className="text-slate-600 text-sm font-semibold">Loading TA Journal / जर्नल लोड हो रहा है...</p>
                        <button
                          onClick={() => handleViewChange('dashboard')}
                          className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold"
                        >
                          Back to Claims
                        </button>
                      </div>
                    );
                  }
                  return (
                    <JournalPrintView
                      journal={targetJournal}
                      profiles={profiles}
                      onBack={() => handleViewChange('dashboard')}
                      initialAction={printViewAction}
                    />
                  );
                })()
              )}

              {currentView === 'support' && (
                <ContactSupport
                  authUser={authUser}
                  profile={finalProfile}
                  onBack={() => handleViewChange('dashboard')}
                />
              )}

              {currentView === 'admin-console' && isAppParent && (
                <AdminConsole
                  adminUsers={adminUsers}
                  journals={journals}
                  profiles={profiles}
                  onBack={() => handleViewChange('dashboard')}
                  onViewChange={handleViewChange}
                  adminSelectedUserId={adminSelectedUserId}
                  setAdminSelectedUserId={setAdminSelectedUserId}
                  onDeleteJournal={handleDeleteJournal}
                  onRefreshData={handleRefreshAdminData}
                />
              )}

              {currentView === 'google-drive' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => handleViewChange('dashboard')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 hover:text-stone-900 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                    >
                      ← Back to Dashboard / मुख्य पृष्ठ
                    </button>
                  </div>
                  <GoogleDriveSync
                    journals={displayedJournals}
                    activeProfile={activeUserProfile || finalProfile}
                    onRestoreJournal={(j) => {
                      const updated = [j, ...journals.filter(x => x.id !== j.id)];
                      persistJournals(updated, j);
                      alert(`Successfully restored claim for ${j.monthClaimed}!`);
                      handleViewChange('dashboard');
                    }}
                    onRestoreAllBackup={(restoredJournals) => {
                      const map = new Map<string, TAJournal>();
                      journals.forEach(j => map.set(j.id, j));
                      restoredJournals.forEach(j => map.set(j.id, j));
                      const merged = Array.from(map.values());
                      persistJournals(merged);
                      alert(`Successfully restored ${restoredJournals.length} claims from Google Drive!`);
                      handleViewChange('dashboard');
                    }}
                  />
                </div>
              )}
            </React.Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer Banner */}
      <footer className="py-6 border-t border-slate-200/60 text-slate-400 text-xs text-center mt-auto bg-white/50 no-print">
        <div className="max-w-7xl mx-auto px-4">
          <p className="font-semibold text-slate-500">RPF Travelling Allowance Journal Automated Compiler</p>
          <p className="text-slate-400 mt-1">
            Built for Indian Railways. Supports 7th CPC slab calculations rules.
          </p>
        </div>
      </footer>

      {/* Custom Sign Out Confirm Modal */}
      {showSignOutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" id="signout-modal">
          <div className="bg-[#f8f7f4] rounded-xl shadow-xl border border-stone-200 p-6 max-w-sm w-full text-left">
            <h3 className="text-xs font-black uppercase tracking-wider text-stone-900 border-b border-stone-200 pb-2 mb-3">
              Confirm Sign Out / लॉग आउट पुष्टि करें
            </h3>
            <p className="text-xs text-stone-700 leading-relaxed mb-6">
              Are you sure you want to sign out of your RPF TA-Companion session? Unsaved live edits on draft lists may be cleared.
            </p>
            <div className="flex gap-2.5 justify-end text-xs font-bold leading-none">
              <button
                type="button"
                onClick={() => setShowSignOutConfirm(false)}
                className="px-4 py-2 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg text-stone-700 transition"
              >
                No, Keep Session
              </button>
              <button
                type="button"
                onClick={confirmSignOut}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Synchronicity Success Banner Toast */}
      {showSyncSuccessToast && (
        <div className="fixed bottom-6 right-6 z-[100] max-w-sm bg-neutral-900 border-l-4 border-emerald-500 text-stone-100 p-4 rounded-lg shadow-2xl flex items-start gap-3 transform translate-y-0 transition-transform duration-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 animate-bounce" />
          <div className="text-left text-xs">
            <div className="font-extrabold text-[13px] text-stone-500 hover:text-stone-100 tracking-tight text-white uppercase">Reconnected Ready!</div>
            <div className="font-semibold text-stone-300 mt-0.5">सिंक पूरा हुआ / Sync Complete</div>
            <p className="text-stone-400 mt-1 leading-relaxed text-[11px]">
              All local offline changes stored in your IndexedDB sync queue have been uploaded and secured on your Firebase cloud database.
            </p>
          </div>
        </div>
      )}

      {/* Already Synced Info Toast */}
      {showAlreadySyncedToast && (
        <div className="fixed bottom-6 right-6 z-[100] max-w-sm bg-neutral-900 border-l-4 border-blue-500 text-stone-100 p-4 rounded-lg shadow-2xl flex items-start gap-3 transform translate-y-0 transition-transform duration-300">
          <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0 mt-0.5 animate-pulse" />
          <div className="text-left text-xs">
            <div className="font-extrabold text-[13px] tracking-tight text-blue-400 uppercase">Database Up-to-date!</div>
            <div className="font-semibold text-stone-300 mt-0.5">डेटा पूरी तरह से सिंक है / Already Synced</div>
            <p className="text-stone-400 mt-1 leading-relaxed text-[11px]">
              All of your TA journal drafts and officer profiles match with the secure cloud database. No pending changes found.
            </p>
          </div>
        </div>
      )}

      {/* Floating Network Sync Indicator Badge */}
      <AnimatePresence>
        {showSyncBadge && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className={`fixed bottom-6 left-6 z-[99] max-w-sm rounded-2xl p-3.5 shadow-xl flex items-center gap-3.5 border transition-all duration-300 backdrop-blur-md ${
              lastConnectionState === 'offline'
                ? 'bg-[#181a17]/95 text-amber-300 border-amber-500/30'
                : 'bg-emerald-950/95 text-emerald-100 border-emerald-500/40'
            }`}
          >
            <div className={`p-2 rounded-xl shrink-0 flex items-center justify-center ${
              lastConnectionState === 'offline' 
                ? 'bg-amber-550/10 text-amber-400 animate-pulse' 
                : 'bg-emerald-500/20 text-emerald-300'
            }`}>
              {lastConnectionState === 'offline' ? (
                <WifiOff className="w-5 h-5" />
              ) : (
                <Wifi className="w-5 h-5 animate-pulse" />
              )}
            </div>

            <div className="flex-1 text-left min-w-0 font-sans">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  lastConnectionState === 'offline' || isQuotaExhausted() ? 'bg-amber-400 animate-ping' : 'bg-emerald-400 animate-pulse'
                }`} />
                <span className="font-black text-[10px] tracking-wider uppercase font-mono">
                  {lastConnectionState === 'offline' ? 'Offline Mode Active' : isQuotaExhausted() ? 'Local Storage Mode' : 'Synchronized'}
                </span>
              </div>
              
              <h4 className="text-[11px] font-black text-stone-100 mt-1 truncate">
                {lastConnectionState === 'offline' 
                  ? 'ऑफ़लाइन मोड एक्टिव (स्थानीय रूप से सुरक्षित)' 
                  : isQuotaExhausted()
                    ? 'लोकल स्टोरेज मोड (डेटा 100% सुरक्षित)'
                    : '✓ डेटा पूरी तरह से सिंक और सुरक्षित है'
                }
              </h4>
              <p className="text-[9px] text-stone-300 mt-1 leading-relaxed max-w-[240px]">
                {lastConnectionState === 'offline' 
                  ? 'इंटरनेट डिस्कनेक्ट है। परिवर्तन सुरक्षित रूप से IndexedDB हार्डवेयर में सहेज लिए गए हैं।' 
                  : isQuotaExhausted()
                    ? 'दैनिक मुफ़्त क्लाउड कोटा पूरा होने पर भी आपका डेटा IndexedDB में 100% सुरक्षित सहेजा जा रहा है।'
                    : 'आपका डिवाइस क्लाउड डेटाबेस के साथ वास्तविक समय में पूरी तरह से सिंक्रोनाइज़ हो गया है!'
                }
              </p>
            </div>
            
            <button
              type="button"
              onClick={() => setShowSyncBadge(false)}
              className="text-stone-400 hover:text-white p-1 hover:bg-white/10 rounded-lg transition cursor-pointer shrink-0"
              aria-label="Dismiss Synchronization Status"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- PWA In-App Install Guide Modal --- */}
      <AnimatePresence>
        {showInstallGuideModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 text-stone-900 relative"
            >
              <button
                type="button"
                onClick={() => setShowInstallGuideModal(false)}
                className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 p-1.5 rounded-full hover:bg-stone-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center p-1.5 shrink-0">
                  <img
                    src="https://upload.wikimedia.org/wikipedia/commons/8/84/Logo_of_RPF.jpg"
                    alt="RPF Logo"
                    className="w-full h-full object-contain rounded-lg"
                  />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-stone-900 leading-tight">RPF TA Journal App</h3>
                  <p className="text-xs text-amber-700 font-bold">मोबाइल में सीधे इंस्टॉल करने का तरीका</p>
                </div>
              </div>

              <div className="space-y-3 text-xs text-stone-700 mb-6 bg-amber-50/60 p-4 rounded-xl border border-amber-200/60">
                <div className="flex items-start gap-2">
                  <span className="font-black text-amber-700 bg-amber-200/80 w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[11px]">1</span>
                  <p><strong>Android (Chrome):</strong> ऊपर दाईं ओर <strong>3 डॉट्स (⋮)</strong> पर टैप करें और <strong>"Install app"</strong> या <strong>"Add to Home screen"</strong> चुनें।</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-black text-amber-700 bg-amber-200/80 w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[11px]">2</span>
                  <p><strong>iPhone (Safari):</strong> नीचे शेयर बटन <strong>(↑)</strong> पर टैप करें और <strong>"Add to Home Screen"</strong> चुनें।</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-black text-amber-700 bg-amber-200/80 w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[11px]">3</span>
                  <p><strong>Laptop/PC (Chrome/Edge):</strong> एड्रेस बार में ऊपर <strong>Install (⊕)</strong> आइकन पर क्लिक करें।</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowInstallGuideModal(false)}
                className="w-full py-2.5 bg-stone-900 hover:bg-stone-850 text-white rounded-xl font-bold text-xs shadow-md transition cursor-pointer"
              >
                समझ गया (Close)
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
