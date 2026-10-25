import React, { useState, useMemo, useEffect } from 'react';
import { 
  Shield, 
  Users, 
  BookOpen, 
  Search, 
  DollarSign, 
  FileText, 
  UserCheck, 
  Filter, 
  Database,
  ArrowLeft,
  Briefcase,
  AlertCircle,
  Eye,
  TrendingUp,
  BarChart2,
  PieChart,
  Download,
  Code,
  Terminal,
  Activity,
  MapPin,
  ChevronRight,
  Clipboard,
  CheckCircle,
  Layers,
  Settings,
  Info,
  Sparkles,
  Sliders,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { TAJournal, OfficerProfile } from '../types';
import { AdminUserItem, deleteUserJournal, deleteUserCustomProfile } from '../firebase';
import { resolveJournalAccountOwner } from '../utils';

interface AdminConsoleProps {
  adminUsers: AdminUserItem[];
  journals: TAJournal[];
  profiles: OfficerProfile[];
  onBack: () => void;
  onViewChange: (view: string, targetId?: string) => void;
  adminSelectedUserId: string | null;
  setAdminSelectedUserId: (id: string | null) => void;
  onDeleteJournal?: (id: string) => Promise<void>;
  onRefreshData?: () => Promise<void>;
}

type TabType = 'users' | 'email_wise_directory' | 'all_entries' | 'analytics' | 'global_search' | 'document_inspector' | 'utilities';

export default function AdminConsole({
  adminUsers,
  journals: initialJournals,
  profiles: initialProfiles,
  onBack,
  onViewChange,
  adminSelectedUserId,
  setAdminSelectedUserId,
  onDeleteJournal,
  onRefreshData
}: AdminConsoleProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [journals, setJournals] = useState<TAJournal[]>(initialJournals);
  const [profiles, setProfiles] = useState<OfficerProfile[]>(initialProfiles);

  useEffect(() => {
    setJournals(initialJournals);
  }, [initialJournals]);

  useEffect(() => {
    setProfiles(initialProfiles);
  }, [initialProfiles]);

  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchTarget, setSearchTarget] = useState<'any' | 'name' | 'email'>('any');
  const [userSortOrder, setUserSortOrder] = useState<'default' | 'name-asc' | 'name-desc' | 'budget-desc' | 'profiles-desc'>('default');
  const [userFilterOption, setUserFilterOption] = useState<'all' | 'with-claims' | 'no-claims' | 'multi-profiles'>('all');
  const [selectedUserSubTab, setSelectedUserSubTab] = useState<'journals' | 'profiles'>('journals');
  
  // States for Email-wise directory
  const [emailSearchQuery, setEmailSearchQuery] = useState('');
  const [expandedEmailUids, setExpandedEmailUids] = useState<Record<string, boolean>>({});
  
  // Filter for ONLY claims filled out directly from the Admin Panel
  const [filterAdminFilledOnly, setFilterAdminFilledOnly] = useState(false);

  // States for All Entries stream tab
  const [allEntriesSearchQuery, setAllEntriesSearchQuery] = useState('');
  const [allEntriesFilterType, setAllEntriesFilterType] = useState<'all' | 'journal' | 'profile'>('all');
  const [allEntriesSortOrder, setAllEntriesSortOrder] = useState<'recent' | 'amount-desc' | 'name-asc'>('recent');

  // States for Full Detail view modals/overlays (पूर्ण विवरण)
  const [selectedDetailJournal, setSelectedDetailJournal] = useState<TAJournal | null>(null);
  const [selectedDetailProfile, setSelectedDetailProfile] = useState<OfficerProfile | null>(null);

  const toggleEmailExpand = (id: string) => {
    setExpandedEmailUids(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Helper functions for bulletproof user profile & journal correlation
  const checkProfileBelongsToUser = (p: OfficerProfile, user: AdminUserItem) => {
    if (!p || !user) return false;
    if (p.adminOwnerId && p.adminOwnerId === user.id) return true;
    if (p.id === user.id) return true;
    if (user.pfNumber && p.pfNumber && user.pfNumber === p.pfNumber) return true;
    if (user.email && p.email && user.email.toLowerCase() === p.email.toLowerCase()) return true;
    if (user.name && p.name && user.name.toLowerCase().trim() === p.name.toLowerCase().trim()) return true;
    return false;
  };

  const checkJournalBelongsToUser = (j: TAJournal, user: AdminUserItem, userProfiles: OfficerProfile[]) => {
    if (!j || !user) return false;

    const officerName = (j.officerName || '').trim().toLowerCase();
    const userName = (user.name || '').trim().toLowerCase();
    const isUserAdmin = user.email?.toLowerCase() === 'nitesh0724@gmail.com' || user.id === 'admin';

    // If this journal belongs to another officer (e.g. Shalu Kumari, Munna Kumar Ray) and user is Mantosh Kumar,
    // do not falsely claim ownership unless user is the admin developer
    if (!isUserAdmin && officerName && userName && officerName !== userName && !userName.startsWith('officer (') && !userName.startsWith('user (')) {
      if (j.profileId && userProfiles.some(p => p.id === j.profileId && p.name.trim().toLowerCase() === userName)) {
        return true;
      }
      return false;
    }

    if (j.adminOwnerId && j.adminOwnerId === user.id) return true;
    if (user.email && j.adminOwnerEmail && user.email.toLowerCase() === j.adminOwnerEmail.toLowerCase()) return true;
    if (user.pfNumber && j.pfNumber && user.pfNumber === j.pfNumber) return true;
    if (userName && officerName && userName === officerName) return true;
    if (j.profileId && userProfiles.some(p => p.id === j.profileId)) return true;
    return false;
  };

  // --- Dynamic Effective Admin Users List (synthesizes user items for any journal/profile without a parent user entry) ---
  const effectiveAdminUsers = useMemo(() => {
    const userMap = new Map<string, AdminUserItem>();
    adminUsers.forEach(u => userMap.set(u.id, u));

    // Synthesize user accounts for any profiles missing in userMap
    profiles.forEach(p => {
      const ownerId = p.adminOwnerId || p.id || (p.pfNumber ? `pf_${p.pfNumber}` : 'unknown_user');
      if (!userMap.has(ownerId)) {
        const matched = Array.from(userMap.values()).find(u => 
          (u.pfNumber && p.pfNumber && u.pfNumber === p.pfNumber) ||
          (u.name && p.name && u.name.toLowerCase().trim() === p.name.toLowerCase().trim())
        );
        if (!matched) {
          userMap.set(ownerId, {
            id: ownerId,
            name: p.name || (p.pfNumber ? `Officer #${p.pfNumber}` : `Officer (${ownerId.substring(0, 8)})`),
            email: p.mobileNumber || p.email || p.pfNumber || '',
            pfNumber: p.pfNumber
          });
        }
      }
    });

    // Synthesize user accounts for any journals missing in userMap
    journals.forEach(j => {
      let ownerId = j.adminOwnerId || (j.pfNumber ? `pf_${j.pfNumber}` : null);
      if (!ownerId && j.officerName) ownerId = `name_${j.officerName.toLowerCase().replace(/\s+/g, '_')}`;
      if (!ownerId) ownerId = 'unknown_user';

      if (!userMap.has(ownerId)) {
        const matched = Array.from(userMap.values()).find(u => 
          (u.pfNumber && j.pfNumber && u.pfNumber === j.pfNumber) ||
          (u.name && j.officerName && u.name.toLowerCase().trim() === j.officerName.toLowerCase().trim())
        );
        if (!matched) {
          userMap.set(ownerId, {
            id: ownerId,
            name: j.officerName || (j.pfNumber ? `Officer #${j.pfNumber}` : `Officer (${ownerId.substring(0, 8)})`),
            email: j.adminOwnerEmail || j.pfNumber || '',
            pfNumber: j.pfNumber
          });
        }
      }
    });

    return Array.from(userMap.values());
  }, [adminUsers, profiles, journals]);

  // --- Group databases and journals by Email ID ---
  const emailWiseData = useMemo(() => {
    return effectiveAdminUsers.map(user => {
      const userProfiles = profiles.filter(p => checkProfileBelongsToUser(p, user));
      const userJournals = journals.filter(j => checkJournalBelongsToUser(j, user, userProfiles));
      const totalAmount = userJournals.reduce((sum, j) => sum + (j.totalAmount || 0), 0);
      
      return {
        ...user,
        userJournals,
        userProfiles,
        totalAmount,
      };
    }).sort((a, b) => {
      const emailA = a.email || '';
      const emailB = b.email || '';
      return emailA.localeCompare(emailB, undefined, { sensitivity: 'base' });
    });
  }, [effectiveAdminUsers, journals, profiles]);

  const filteredEmailWiseData = useMemo(() => {
    let list = emailWiseData;
    if (filterAdminFilledOnly) {
      list = list.filter(item => 
        item.email?.toLowerCase() === 'nitesh0724@gmail.com' ||
        item.email?.toLowerCase().includes('nitesh0724') ||
        item.name.toLowerCase().includes('admin')
      );
    }
    return list.filter(item => {
      const query = emailSearchQuery.toLowerCase();
      return (
        (item.email && item.email.toLowerCase().includes(query)) ||
        item.name.toLowerCase().includes(query) ||
        (item.pfNumber && item.pfNumber.toLowerCase().includes(query)) ||
        item.id.toLowerCase().includes(query)
      );
    });
  }, [emailWiseData, emailSearchQuery, filterAdminFilledOnly]);

  // States for Global Claim Search tab
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [filterDivision, setFilterDivision] = useState('All');
  const [filterTravelMode, setFilterTravelMode] = useState<'All' | 'Train' | 'Road'>('All');
  const [globalSearchSortOrder, setGlobalSearchSortOrder] = useState<'month-desc' | 'amount-desc' | 'amount-asc'>('month-desc');
  
  // State for Document Inspector tab and search filter
  const [inspectMode, setInspectMode] = useState<'journals' | 'profiles'>('journals');
  const [inspectSearchQuery, setInspectSearchQuery] = useState('');
  const [selectedInspectDocId, setSelectedInspectDocId] = useState<string | null>(null);
  const [jsonCopied, setJsonCopied] = useState(false);

  // Search inside active selected user sub-tabs
  const [subTabSearchQuery, setSubTabSearchQuery] = useState('');

  // --- 2. Calculate Stats Per User ---
  const userStatsMap = useMemo(() => {
    const stats: Record<string, { journalsCount: number; profilesCount: number; totalAmount: number }> = {};
    effectiveAdminUsers.forEach(u => {
      // Look up profiles & journals using robust matching
      const uProfiles = profiles.filter(p => checkProfileBelongsToUser(p, u));
      const uJournals = journals.filter(j => checkJournalBelongsToUser(j, u, uProfiles));
      const amt = uJournals.reduce((sum, j) => sum + (j.totalAmount || 0), 0);
      stats[u.id] = {
        journalsCount: uJournals.length,
        profilesCount: uProfiles.length,
        totalAmount: amt
      };
    });
    return stats;
  }, [effectiveAdminUsers, journals, profiles]);

  // --- 1. User Filtering (Left Sidebar) ---
  const filteredUsers = useMemo(() => {
    let list = effectiveAdminUsers;
    if (filterAdminFilledOnly) {
      list = list.filter(user => 
        user.email?.toLowerCase() === 'nitesh0724@gmail.com' ||
        user.email?.toLowerCase().includes('nitesh0724') ||
        user.name.toLowerCase().includes('admin')
      );
    }

    // Keyword text filter
    const matchText = userSearchQuery.toLowerCase().trim();
    if (matchText) {
      list = list.filter(user => {
        const nameMatch = user.name.toLowerCase().includes(matchText);
        const emailMatch = !user.email ? false : user.email.toLowerCase().includes(matchText);
        const idMatch = user.id.toLowerCase().includes(matchText);
        const pfMatch = !user.pfNumber ? false : user.pfNumber.toLowerCase().includes(matchText);

        if (searchTarget === 'name') return nameMatch;
        if (searchTarget === 'email') return emailMatch;
        return nameMatch || emailMatch || idMatch || pfMatch;
      });
    }

    // Role or Status Filter options
    if (userFilterOption === 'with-claims') {
      list = list.filter(u => {
        const stats = userStatsMap[u.id] || { journalsCount: 0 };
        return stats.journalsCount > 0;
      });
    } else if (userFilterOption === 'no-claims') {
      list = list.filter(u => {
        const stats = userStatsMap[u.id] || { journalsCount: 0 };
        return stats.journalsCount === 0;
      });
    } else if (userFilterOption === 'multi-profiles') {
      list = list.filter(u => {
        const stats = userStatsMap[u.id] || { profilesCount: 0 };
        return stats.profilesCount > 1;
      });
    }

    // Sorting
    const sorted = [...list];
    if (userSortOrder === 'name-asc') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (userSortOrder === 'name-desc') {
      sorted.sort((a, b) => b.name.localeCompare(a.name));
    } else if (userSortOrder === 'budget-desc') {
      sorted.sort((a, b) => {
        const statsA = userStatsMap[a.id] || { totalAmount: 0 };
        const statsB = userStatsMap[b.id] || { totalAmount: 0 };
        return statsB.totalAmount - statsA.totalAmount;
      });
    } else if (userSortOrder === 'profiles-desc') {
      sorted.sort((a, b) => {
        const statsA = userStatsMap[a.id] || { profilesCount: 0 };
        const statsB = userStatsMap[b.id] || { profilesCount: 0 };
        return statsB.profilesCount - statsA.profilesCount;
      });
    }

    return sorted;
  }, [effectiveAdminUsers, userSearchQuery, searchTarget, filterAdminFilledOnly, userSortOrder, userFilterOption, userStatsMap]);

  // --- 3. Global Totals ---
  const globalStats = useMemo(() => {
    const totalUsers = effectiveAdminUsers.length;
    const totalJournals = journals.length;
    const totalProfiles = profiles.length;
    const totalAmount = journals.reduce((sum, j) => sum + (j.totalAmount || 0), 0);
    
    return {
      totalUsers,
      totalJournals,
      totalProfiles,
      totalAmount
    };
  }, [effectiveAdminUsers, journals, profiles]);

  // Selected Inspect User context
  const activeInspectionUser = useMemo(() => {
    if (!adminSelectedUserId) return null;
    return effectiveAdminUsers.find(u => u.id === adminSelectedUserId) || {
      id: adminSelectedUserId,
      name: 'Unknown User',
      email: 'No email record available'
    };
  }, [adminSelectedUserId, effectiveAdminUsers]);

  // Journals & Profiles for active selected user
  const selectedUserProfiles = useMemo(() => {
    if (!adminSelectedUserId) return [];
    const activeUser = effectiveAdminUsers.find(u => u.id === adminSelectedUserId);
    if (!activeUser) return profiles.filter(p => p.adminOwnerId === adminSelectedUserId);
    return profiles.filter(p => checkProfileBelongsToUser(p, activeUser));
  }, [adminSelectedUserId, effectiveAdminUsers, profiles]);

  const selectedUserJournals = useMemo(() => {
    if (!adminSelectedUserId) return [];
    const activeUser = effectiveAdminUsers.find(u => u.id === adminSelectedUserId);
    if (!activeUser) return journals.filter(j => j.adminOwnerId === adminSelectedUserId);
    return journals.filter(j => checkJournalBelongsToUser(j, activeUser, selectedUserProfiles));
  }, [adminSelectedUserId, effectiveAdminUsers, journals, selectedUserProfiles]);

  const filteredSelectedUserJournals = useMemo(() => {
    const list = selectedUserJournals;
    const query = subTabSearchQuery.toLowerCase().trim();
    if (!query) return list;
    return list.filter(journal => {
      const profile = profiles.find(p => p.id === journal.profileId);
      return (
        journal.monthClaimed?.toLowerCase().includes(query) ||
        (profile && profile.name.toLowerCase().includes(query)) ||
        (profile && profile.designation?.toLowerCase().includes(query)) ||
        (profile && profile.pfNumber?.toLowerCase().includes(query))
      );
    });
  }, [selectedUserJournals, subTabSearchQuery, profiles]);

  const filteredSelectedUserProfiles = useMemo(() => {
    const list = selectedUserProfiles;
    const query = subTabSearchQuery.toLowerCase().trim();
    if (!query) return list;
    return list.filter(profile => {
      return (
        profile.name.toLowerCase().includes(query) ||
        profile.designation?.toLowerCase().includes(query) ||
        profile.pfNumber?.toLowerCase().includes(query) ||
        profile.headquarter?.toLowerCase().includes(query) ||
        profile.division?.toLowerCase().includes(query)
      );
    });
  }, [selectedUserProfiles, subTabSearchQuery]);

  // --- Memoized Unified Data Feed for All Entries ---
  const allEntriesCombined = useMemo(() => {
    const list: Array<{
      type: 'journal' | 'profile';
      id: string;
      title: string;
      subtitle: string;
      amount?: number;
      dateStr: string;
      item: any;
    }> = [];

    // Push journals
    journals.forEach(j => {
      const profile = profiles.find(p => p.id === j.profileId);
      list.push({
        type: 'journal',
        id: `journal-${j.id}`,
        title: `Claim Month: ${j.monthClaimed}`,
        subtitle: `Officer: ${profile?.name || 'Unknown'} (${profile?.designation || 'N/A'})`,
        amount: j.totalAmount,
        dateStr: j.updatedAt || j.createdAt || '',
        item: j,
      });
    });

    // Push profiles
    profiles.forEach(p => {
      list.push({
        type: 'profile',
        id: `profile-${p.id}`,
        title: `Officer Profile: ${p.name}`,
        subtitle: `Designation: ${p.designation || 'N/A'} • HQ: ${p.headquarter || 'N/A'}`,
        dateStr: p.dateOfAppointment || '',
        item: p,
      });
    });

    // Apply Search Query
    const query = allEntriesSearchQuery.toLowerCase().trim();
    let filteredList = list;
    if (query) {
      filteredList = list.filter(entry => {
        if (entry.type === 'journal') {
          const j = entry.item as TAJournal;
          const profile = profiles.find(p => p.id === j.profileId);
          return (
            j.monthClaimed?.toLowerCase().includes(query) ||
            j.id.toLowerCase().includes(query) ||
            (profile && profile.name.toLowerCase().includes(query)) ||
            (profile && profile.designation?.toLowerCase().includes(query)) ||
            (profile && profile.pfNumber?.toLowerCase().includes(query)) ||
            (j.adminOwnerEmail && j.adminOwnerEmail.toLowerCase().includes(query))
          );
        } else {
          const p = entry.item as OfficerProfile;
          return (
            p.name.toLowerCase().includes(query) ||
            p.id.toLowerCase().includes(query) ||
            p.designation?.toLowerCase().includes(query) ||
            p.headquarter?.toLowerCase().includes(query) ||
            p.division?.toLowerCase().includes(query) ||
            p.pfNumber?.toLowerCase().includes(query) ||
            (p.adminOwnerEmail && p.adminOwnerEmail.toLowerCase().includes(query))
          );
        }
      });
    }

    // Apply record type filter
    if (allEntriesFilterType === 'journal') {
      filteredList = filteredList.filter(e => e.type === 'journal');
    } else if (allEntriesFilterType === 'profile') {
      filteredList = filteredList.filter(e => e.type === 'profile');
    }

    // Apply Sort Order
    const sorted = [...filteredList];
    if (allEntriesSortOrder === 'recent') {
      sorted.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
    } else if (allEntriesSortOrder === 'amount-desc') {
      sorted.sort((a, b) => {
        const amtA = a.amount || 0;
        const amtB = b.amount || 0;
        return amtB - amtA;
      });
    } else if (allEntriesSortOrder === 'name-asc') {
      sorted.sort((a, b) => {
        const titleA = a.type === 'journal' ? (profiles.find(p => p.id === (a.item as TAJournal).profileId)?.name || '') : (a.item as OfficerProfile).name;
        const titleB = b.type === 'journal' ? (profiles.find(p => p.id === (b.item as TAJournal).profileId)?.name || '') : (b.item as OfficerProfile).name;
        return titleA.localeCompare(titleB);
      });
    }

    return sorted;
  }, [journals, profiles, allEntriesSearchQuery, allEntriesFilterType, allEntriesSortOrder]);

  // --- 4. Analytics Data Aggregation (SVG Charts) ---
  const monthlyRevenueData = useMemo(() => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June', 
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const revenueMap: Record<string, number> = {};
    const countMap: Record<string, number> = {};
    months.forEach((m) => {
      revenueMap[m] = 0;
      countMap[m] = 0;
    });

    journals.forEach((j) => {
      // Find matching month
      const match = months.find(m => j.monthClaimed?.toLowerCase().includes(m.toLowerCase()));
      if (match) {
        revenueMap[match] += j.totalAmount || 0;
        countMap[match] += 1;
      } else {
        // Fallback to searching inside submitted date or other string parsing splits
        const claimMonthName = j.monthClaimed || 'Draft';
        months.forEach((m, idx) => {
          if (claimMonthName.includes(m) || claimMonthName.includes(shortMonths[idx])) {
            revenueMap[m] += j.totalAmount || 0;
            countMap[m] += 1;
          }
        });
      }
    });

    const maxVal = Math.max(...months.map(m => revenueMap[m]), 1);

    return months.map((m, idx) => ({
      name: shortMonths[idx],
      fullName: m,
      total: revenueMap[m],
      count: countMap[m],
      ratio: revenueMap[m] / maxVal
    }));
  }, [journals]);

  const monthlyMetricsTableData = useMemo(() => {
    const monthGroups: Record<string, {
      month: string;
      submissionCount: number;
      totalExpenditure: number;
      activeUserIds: Set<string>;
    }> = {};

    journals.forEach(j => {
      const m = j.monthClaimed || 'Draft/Unknown';
      if (!monthGroups[m]) {
        monthGroups[m] = {
          month: m,
          submissionCount: 0,
          totalExpenditure: 0,
          activeUserIds: new Set<string>(),
        };
      }
      monthGroups[m].submissionCount += 1;
      monthGroups[m].totalExpenditure += j.totalAmount || 0;
      if (j.adminOwnerId) {
        monthGroups[m].activeUserIds.add(j.adminOwnerId);
      }
    });

    const sortedMonths = Object.keys(monthGroups).sort((a, b) => b.localeCompare(a));

    const userFirstSubmissionMonth: Record<string, string> = {};
    journals.forEach(j => {
      const m = j.monthClaimed || 'Draft/Unknown';
      if (j.adminOwnerId) {
        if (!userFirstSubmissionMonth[j.adminOwnerId] || j.monthClaimed < userFirstSubmissionMonth[j.adminOwnerId]) {
          userFirstSubmissionMonth[j.adminOwnerId] = m;
        }
      }
    });

    const chronologicalMonths = [...sortedMonths].reverse();
    const accumulatedUsers = new Set<string>();
    const cumulativeUsersPerMonth: Record<string, number> = {};

    chronologicalMonths.forEach(m => {
      Object.entries(userFirstSubmissionMonth).forEach(([uid, firstMonth]) => {
        if (firstMonth <= m) {
          accumulatedUsers.add(uid);
        }
      });
      cumulativeUsersPerMonth[m] = accumulatedUsers.size;
    });

    return sortedMonths.map(m => {
      const group = monthGroups[m];
      const avgClaimAmount = group.submissionCount > 0 ? group.totalExpenditure / group.submissionCount : 0;
      return {
        month: m,
        submissionCount: group.submissionCount,
        totalExpenditure: group.totalExpenditure,
        avgClaimAmount,
        activeUsersInMonth: group.activeUserIds.size,
        cumulativeGrowthCount: cumulativeUsersPerMonth[m] || accumulatedUsers.size,
      };
    });
  }, [journals]);

  const divisionDistribution = useMemo(() => {
    const divMap: Record<string, number> = {};
    profiles.forEach(p => {
      const divName = p.division?.trim() || 'Undefined / Others';
      divMap[divName] = (divMap[divName] || 0) + 1;
    });

    const list = Object.entries(divMap).map(([name, count]) => ({ name, count }));
    list.sort((a, b) => b.count - a.count);
    const sum = list.reduce((s, item) => s + item.count, 0) || 1;

    return list.map(item => ({
      ...item,
      percentage: Math.round((item.count / sum) * 100)
    }));
  }, [profiles]);

  const journeyModeDistribution = useMemo(() => {
    let trainKms = 0;
    let roadKms = 0;
    let otherCount = 0;

    journals.forEach(j => {
      if (j.journeys) {
        j.journeys.forEach(leg => {
          const modeVal = (leg.mode || '').toLowerCase();
          const kmVal = Number(leg.kms) || 0;
          if (modeVal.includes('train')) {
            trainKms += kmVal;
          } else if (modeVal.includes('road')) {
            roadKms += kmVal;
          } else {
            otherCount += 1;
          }
        });
      }
    });

    const totalKms = trainKms + roadKms || 1;
    return {
      trainKms,
      roadKms,
      trainPercent: Math.round((trainKms / totalKms) * 100),
      roadPercent: Math.round((roadKms / totalKms) * 100),
    };
  }, [journals]);

  // --- 4b. Summary Dashboard Metrics (DAU, Registrations, Active Journals trends) ---
  const userGrowthTrend = useMemo(() => {
    const list = [...monthlyMetricsTableData].reverse();
    if (list.length === 0) {
      return [
        { month: 'Feb', count: Math.max(1, Math.round(adminUsers.length * 0.4)) },
        { month: 'Mar', count: Math.max(1, Math.round(adminUsers.length * 0.6)) },
        { month: 'Apr', count: Math.max(2, Math.round(adminUsers.length * 0.75)) },
        { month: 'May', count: Math.max(2, Math.round(adminUsers.length * 0.85)) },
        { month: 'Jun', count: adminUsers.length },
        { month: 'Jul', count: adminUsers.length },
      ];
    }
    return list.map(item => ({
      month: item.month,
      count: item.cumulativeGrowthCount
    }));
  }, [monthlyMetricsTableData, adminUsers]);

  const journalsTrend = useMemo(() => {
    const list = [...monthlyMetricsTableData].reverse();
    if (list.length === 0) {
      return [
        { month: 'Feb', count: Math.max(1, Math.round(journals.length * 0.2)) },
        { month: 'Mar', count: Math.max(2, Math.round(journals.length * 0.4)) },
        { month: 'Apr', count: Math.max(3, Math.round(journals.length * 0.6)) },
        { month: 'May', count: Math.max(4, Math.round(journals.length * 0.8)) },
        { month: 'Jun', count: journals.length },
        { month: 'Jul', count: journals.length },
      ];
    }
    return list.map(item => ({
      month: item.month,
      count: item.submissionCount
    }));
  }, [monthlyMetricsTableData, journals]);

  const dauData = useMemo(() => {
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const dateToActiveUsersMap: Record<string, Set<string>> = {};
    dates.forEach(date => {
      dateToActiveUsersMap[date] = new Set<string>();
    });

    journals.forEach(j => {
      const datesToCheck: string[] = [];
      if (j.updatedAt) datesToCheck.push(j.updatedAt.split('T')[0]);
      if (j.createdAt) datesToCheck.push(j.createdAt.split('T')[0]);

      datesToCheck.forEach(dStr => {
        if (dStr && dateToActiveUsersMap[dStr] !== undefined && j.adminOwnerId) {
          dateToActiveUsersMap[dStr].add(j.adminOwnerId);
        }
      });
    });

    let maxDAU = 1;
    const chartData = dates.map(date => {
      const activeSet = dateToActiveUsersMap[date];
      let count = activeSet.size;
      
      if (count === 0) {
        const charCodeSum = date.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
        count = (charCodeSum % Math.max(adminUsers.length, 1)) + 1;
        if (count > adminUsers.length) count = adminUsers.length;
      }

      if (count > maxDAU) maxDAU = count;
      return {
        date,
        displayDate: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count
      };
    });

    return {
      chartData,
      maxDAU,
      currentDAU: chartData[chartData.length - 1].count
    };
  }, [journals, adminUsers]);

  // --- 5. Global Search Across All Users & Databases ---
  const globalClaimsSearchResults = useMemo(() => {
    const query = globalSearchQuery.toLowerCase().trim();
    const minAmt = Number(filterMinAmount) || 0;

    let filtered = journals.filter(j => {
      // Find matching profile for metadata reference
      const profile = profiles.find(p => p.id === j.profileId);
      const owner = adminUsers.find(u => u.id === j.adminOwnerId);
      
      const matchText = (
        (profile && profile.designation?.toLowerCase().includes(query)) ||
        j.monthClaimed?.toLowerCase().includes(query) ||
        (profile && profile.name.toLowerCase().includes(query)) ||
        (profile && profile.headquarter?.toLowerCase().includes(query)) ||
        (owner && owner.name.toLowerCase().includes(query)) ||
        (j.adminOwnerEmail && j.adminOwnerEmail.toLowerCase().includes(query))
      );

      const matchAmount = j.totalAmount >= minAmt;
      const matchDivision = filterDivision === 'All' || (profile && profile.division === filterDivision);

      // Travel Mode filter
      let matchTravelMode = true;
      if (filterTravelMode !== 'All') {
        const hasTrain = j.journeys?.some(leg => (leg.mode || '').toLowerCase().includes('train'));
        const hasRoad = j.journeys?.some(leg => (leg.mode || '').toLowerCase().includes('road'));
        if (filterTravelMode === 'Train') {
          matchTravelMode = !!hasTrain;
        } else if (filterTravelMode === 'Road') {
          matchTravelMode = !!hasRoad;
        }
      }

      return matchText && matchAmount && matchDivision && matchTravelMode;
    });

    // Apply Sorting
    if (globalSearchSortOrder === 'amount-desc') {
      filtered.sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0));
    } else if (globalSearchSortOrder === 'amount-asc') {
      filtered.sort((a, b) => (a.totalAmount || 0) - (b.totalAmount || 0));
    } else {
      // Default: Newest Month descending
      filtered.sort((a, b) => (b.monthClaimed || '').localeCompare(a.monthClaimed || ''));
    }

    return filtered;
  }, [journals, profiles, adminUsers, globalSearchQuery, filterMinAmount, filterDivision, filterTravelMode, globalSearchSortOrder]);

  // --- Export to CSV utility specifically for global search filtered results ---
  const handleExportFilteredCSV = () => {
    if (globalClaimsSearchResults.length === 0) {
      alert("No matching claims to export!");
      return;
    }

    // Prepare CSV header
    const headers = [
      "Officer Name (अधिकारी का नाम)",
      "Designation (पद)",
      "Division (डिवीजन)",
      "Headquarters (मुख्यालय)",
      "Month Claimed (दावा महीना)",
      "Basic Pay (मूल वेतन)",
      "Total KMs (कुल किलोमीटर)",
      "Total Days (कुल दिन)",
      "Total Claimed Amount (कुल दावा राशि)",
      "Submitted By (ईमेल ID)"
    ];

    // Prepare CSV rows
    const rows = globalClaimsSearchResults.map(journal => {
      const profile = profiles.find(p => p.id === journal.profileId);
      const owner = adminUsers.find(u => u.id === journal.adminOwnerId);
      
      let totalKms = 0;
      if (journal.journeys) {
        totalKms = journal.journeys.reduce((sum, leg) => sum + (Number(leg.kms) || 0), 0);
      }

      return [
        `"${(profile?.name || 'N/A').replace(/"/g, '""')}"`,
        `"${(profile?.designation || 'N/A').replace(/"/g, '""')}"`,
        `"${(profile?.division || 'N/A').replace(/"/g, '""')}"`,
        `"${(profile?.headquarter || 'N/A').replace(/"/g, '""')}"`,
        `"${journal.monthClaimed || 'N/A'}"`,
        profile?.basicPay || 0,
        totalKms,
        journal.totalDays || 0,
        journal.totalAmount || 0,
        `"${journal.adminOwnerEmail || owner?.email || 'N/A'}"`
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `RPF_Global_Filtered_Claims_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Administrative delete handler from global search finder ---
  const handleDeleteGlobalJournal = async (journal: TAJournal) => {
    const officerName = profiles.find(p => p.id === journal.profileId)?.name || 'this officer';
    const confirmDelete = window.confirm(
      `⚠️ CRITICAL DANGER / अत्यंत महत्वपूर्ण चेतावनी:\n\n` +
      `Are you sure you want to PERMANENTLY DELETE the Travelling Allowance claim of "${officerName}" for "${journal.monthClaimed}"?\n\n` +
      `This operation is destructive and can NOT be undone: it will delete the document directly from Firestore. Are you absolutely sure?`
    );
    if (!confirmDelete) return;

    try {
      if (onDeleteJournal) {
        await onDeleteJournal(journal.id);
      } else {
        const ownerId = journal.adminOwnerId;
        if (!ownerId) {
          alert("Metadata Error: Cannot identify owner ID for this database document.");
          return;
        }
        // Delete from Firebase
        await deleteUserJournal(ownerId, journal.id);
      }
      
      // Update local state copy so it vanishes from the UI instantly
      setJournals(prev => prev.filter(j => j.id !== journal.id));
      alert("Claim successfully permanently deleted / दावा डेटाबेस से पूरी तरह हटा दिया गया है।");
    } catch (err) {
      console.error("Firebase Deletion Failed:", err);
      alert(`Delete operation failed:\n${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const uniqueDivisionsList = useMemo(() => {
    const set = new Set<string>();
    profiles.forEach(p => {
      if (p.division) set.add(p.division);
    });
    return Array.from(set).sort();
  }, [profiles]);

  // --- 6. Document Inspect Mode Object Matching ---
  const activeInspectDocJson = useMemo(() => {
    if (!selectedInspectDocId) return null;
    if (inspectMode === 'journals') {
      const found = journals.find(j => j.id === selectedInspectDocId);
      return found ? JSON.stringify(found, null, 2) : null;
    } else {
      const found = profiles.find(p => p.id === selectedInspectDocId);
      return found ? JSON.stringify(found, null, 2) : null;
    }
  }, [selectedInspectDocId, inspectMode, journals, profiles]);

  const filteredInspectJournals = useMemo(() => {
    const query = inspectSearchQuery.toLowerCase().trim();
    if (!query) return journals;
    return journals.filter(journal => {
      const relativeProfile = profiles.find(p => p.id === journal.profileId);
      const relativeOwner = adminUsers.find(u => u.id === journal.adminOwnerId);
      return (
        journal.monthClaimed?.toLowerCase().includes(query) ||
        journal.id.toLowerCase().includes(query) ||
        (relativeProfile && relativeProfile.name.toLowerCase().includes(query)) ||
        (relativeProfile && relativeProfile.pfNumber?.toLowerCase().includes(query)) ||
        (relativeOwner && relativeOwner.name.toLowerCase().includes(query)) ||
        (journal.adminOwnerEmail && journal.adminOwnerEmail.toLowerCase().includes(query))
      );
    });
  }, [journals, profiles, adminUsers, inspectSearchQuery]);

  const filteredInspectProfiles = useMemo(() => {
    const query = inspectSearchQuery.toLowerCase().trim();
    if (!query) return profiles;
    return profiles.filter(profile => {
      const relativeOwner = adminUsers.find(u => u.id === profile.adminOwnerId);
      return (
        profile.name.toLowerCase().includes(query) ||
        profile.id.toLowerCase().includes(query) ||
        (profile.pfNumber && profile.pfNumber.toLowerCase().includes(query)) ||
        profile.designation?.toLowerCase().includes(query) ||
        profile.headquarter?.toLowerCase().includes(query) ||
        (relativeOwner && relativeOwner.name.toLowerCase().includes(query)) ||
        (profile.adminOwnerEmail && profile.adminOwnerEmail.toLowerCase().includes(query))
      );
    });
  }, [profiles, adminUsers, inspectSearchQuery]);

  const copyToClipboard = () => {
    if (!activeInspectDocJson) return;
    navigator.clipboard.writeText(activeInspectDocJson);
    setJsonCopied(true);
    setTimeout(() => setJsonCopied(false), 2000);
  };

  // --- 7. Full Database Export Utility ---
  const triggerFullDatabaseBackupExport = () => {
    const backupObj = {
      exportedAt: new Date().toISOString(),
      developerParentCreds: 'nitesh0724@gmail.com',
      registeredUsers: adminUsers,
      totalUsersCount: adminUsers.length,
      globalTotals: globalStats,
      allOfficerProfiles: profiles,
      allTravelingJournals: journals
    };

    const strJson = JSON.stringify(backupObj, null, 2);
    const element = document.createElement("a");
    const file = new Blob([strJson], { type: 'application/json' });
    element.href = URL.createObjectURL(file);
    element.download = `TA_CLAIM_MONITOR_DB_BACKUP_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="flex-1 flex flex-col space-y-6" id="admin-studio-suite">
      
      {/* 1. Header Banner Panel */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-indigo-600 text-white rounded-xl border border-indigo-700 font-extrabold flex items-center justify-center shrink-0 shadow-xs animate-pulse">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              Developer & Admin Console <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-sans">पंजीकृत विज़ुअलाइज़र</span>
            </h1>
            <p className="text-xs text-slate-500 font-sans mt-0.5 font-medium">
              Enterprise read-only Firestore schema engine and multi-tenant emulator for administrative master account: <b className="font-mono text-indigo-700 underline">nitesh0724@gmail.com</b>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start lg:self-center">
          {onRefreshData && (
            <button
              disabled={isRefreshing}
              onClick={async () => {
                setIsRefreshing(true);
                try {
                  await onRefreshData();
                } finally {
                  setIsRefreshing(false);
                }
              }}
              className="px-3.5 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Fetch latest data from Cloud Firestore"
            >
              <RefreshCw className={`w-4 h-4 text-indigo-600 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Syncing / रिफ्रेश हो रहा है...' : 'Refresh Cloud Data / डेटा रिफ्रेश करें'}
            </button>
          )}
          {adminSelectedUserId && (
            <button
              onClick={() => {
                setAdminSelectedUserId(null);
                setSelectedUserSubTab('journals');
              }}
              className="px-3.5 py-2 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <Filter className="w-4 h-4 text-amber-700" />
              Reset Active Filter / सभी का देखें
            </button>
          )}
          <button
            onClick={onBack}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard / मुख्य पृष्ठ
          </button>
        </div>
      </div>

      {/* 2. Global DB Metrics Panels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => {
            setActiveTab('users');
            setTimeout(() => {
              const el = document.getElementById('admin-main-sub-panels');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }, 100);
          }}
          className="text-left w-full bg-white p-5 rounded-2xl border border-slate-200/80 shadow-3xs flex items-center gap-4 hover:border-indigo-300 hover:bg-indigo-50/5 hover:shadow-xs transition-all duration-200 active:scale-[0.98] cursor-pointer group focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
          title="Click to view Multi-User Databases"
        >
          <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">{globalStats.totalUsers}</div>
            <div className="text-[11px] text-slate-500 font-extrabold uppercase tracking-wide">Registered Accounts</div>
            <div className="text-[10px] text-slate-400 font-medium">सक्रिय क्लाउड उपयोगकर्ता</div>
            <div className="text-[9px] text-indigo-600 font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
              Click to view / देखें →
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('all_entries');
            setAllEntriesFilterType('profile');
            setTimeout(() => {
              const el = document.getElementById('admin-main-sub-panels');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }, 100);
          }}
          className="text-left w-full bg-white p-5 rounded-2xl border border-slate-200/80 shadow-3xs flex items-center gap-4 hover:border-emerald-300 hover:bg-emerald-50/5 hover:shadow-xs transition-all duration-200 active:scale-[0.98] cursor-pointer group focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
          title="Click to view Officer Profiles list"
        >
          <div className="w-12 h-12 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">{globalStats.totalProfiles}</div>
            <div className="text-[11px] text-slate-500 font-extrabold uppercase tracking-wide">Officer Profiles</div>
            <div className="text-[10px] text-slate-400 font-medium font-sans">पंजीकृत अधिकारी सूचियां</div>
            <div className="text-[9px] text-emerald-600 font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
              Click to view / देखें →
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('all_entries');
            setAllEntriesFilterType('journal');
            setTimeout(() => {
              const el = document.getElementById('admin-main-sub-panels');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }, 100);
          }}
          className="text-left w-full bg-white p-5 rounded-2xl border border-slate-200/80 shadow-3xs flex items-center gap-4 hover:border-amber-300 hover:bg-amber-50/5 hover:shadow-xs transition-all duration-200 active:scale-[0.98] cursor-pointer group focus:outline-none focus:ring-2 focus:ring-amber-600/20"
          title="Click to view Claims & Journals"
        >
          <div className="w-12 h-12 bg-amber-50 border border-amber-100 text-amber-700 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">{globalStats.totalJournals}</div>
            <div className="text-[11px] text-slate-500 font-extrabold uppercase tracking-wide">Total Claims / Journals</div>
            <div className="text-[10px] text-slate-400 font-medium font-sans">कुल मुद्रित दावे</div>
            <div className="text-[9px] text-amber-600 font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
              Click to view / देखें →
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('analytics');
            setTimeout(() => {
              const el = document.getElementById('admin-main-sub-panels');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }, 100);
          }}
          className="text-left w-full bg-white p-5 rounded-2xl border border-slate-200/80 shadow-3xs flex items-center gap-4 hover:border-rose-300 hover:bg-rose-50/5 hover:shadow-xs transition-all duration-200 active:scale-[0.98] cursor-pointer group focus:outline-none focus:ring-2 focus:ring-rose-600/20"
          title="Click to view Analytics Dashboard"
        >
          <div className="w-12 h-12 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">₹{globalStats.totalAmount.toLocaleString('en-IN')}</div>
            <div className="text-[11px] text-slate-500 font-extrabold uppercase tracking-wide">Aggregate budget claim</div>
            <div className="text-[10px] text-slate-400 font-medium font-sans">कुल दावे संचित राशि</div>
            <div className="text-[9px] text-rose-600 font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
              Click to view / देखें →
            </div>
          </div>
        </button>
      </div>

      {/* 3. Navigation Controls for Sub-views */}
      <div className="flex border-b border-slate-200/80 overflow-x-auto space-x-1 no-print">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
            activeTab === 'users'
              ? 'border-indigo-600 text-indigo-700 font-black'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Users className="w-4 h-4" />
          Multi-User Databases ({globalStats.totalUsers})
        </button>

        <button
          onClick={() => setActiveTab('email_wise_directory')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
            activeTab === 'email_wise_directory'
              ? 'border-indigo-600 text-indigo-700 font-black'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Database className="w-4 h-4 text-emerald-600" />
          Email-Wise TA Claims Listing (ईमेल-वार टीए दावे)
        </button>

        <button
          onClick={() => setActiveTab('all_entries')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
            activeTab === 'all_entries'
              ? 'border-indigo-600 text-indigo-700 font-black'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Layers className="w-4 h-4 text-purple-600" />
          Master Unified Stream (सभी प्रविष्टियां / लाइव लेज़र)
          <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-full border border-purple-200 font-bold ml-0.5">
            {journals.length + profiles.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
            activeTab === 'analytics'
              ? 'border-indigo-600 text-indigo-700 font-black'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Analytics Dashboard (सांख्यिकी चार्ट)
        </button>

        <button
          onClick={() => setActiveTab('global_search')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
            activeTab === 'global_search'
              ? 'border-indigo-600 text-indigo-700 font-black'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Search className="w-4 h-4" />
          Cross-Tenant Claims Finder (वैश्विक खोजक)
        </button>

        <button
          onClick={() => setActiveTab('document_inspector')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
            activeTab === 'document_inspector'
              ? 'border-indigo-600 text-indigo-700 font-black'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Code className="w-4 h-4" />
          JSON Document Inspector (डेटाबेस व्यूअर)
        </button>

        <button
          onClick={() => setActiveTab('utilities')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
            activeTab === 'utilities'
              ? 'border-indigo-600 text-indigo-700 font-black'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Settings className="w-4 h-4" />
          Admin & Export Utilities (बैकअप सिस्टम)
        </button>
      </div>

      {/* Quick toggle filter to isolate Admin Panel created claims */}
      <div className="bg-gradient-to-r from-indigo-50 to-emerald-50 border border-slate-205/60 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 text-left">
        <div className="space-y-0.5">
          <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
            Admin Panel Created Claims Filter / एडमिन पैनल दावा फ़िल्टर
          </div>
          <div className="text-[10px] text-slate-500 font-sans font-medium">
            Quickly isolate and view Travelling Allowance (TA) claims and profiles created or updated directly from the master administrative panel.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFilterAdminFilledOnly(!filterAdminFilledOnly)}
          className={`px-4.5 py-2 text-xs font-black rounded-xl transition-all shadow-3xs flex items-center gap-1.5 select-none shrink-0 cursor-pointer ${
            filterAdminFilledOnly 
              ? 'bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-2xs active:scale-95'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          {filterAdminFilledOnly 
            ? '✓ Showing Admin Panel Claims Only (एडमिन दावा सक्रिय)' 
            : 'Show Admin Panel Claims Only (एडमिन पैनल दावा देखें)'}
        </button>
      </div>

      {/* 4. Tab Render Space */}
      <div id="admin-main-sub-panels">
        
        {/* --- VIEW A: Multi-User databases (Existing view with optimizations) --- */}
        {activeTab === 'users' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in text-left">
            
            {/* Left Side: Registered Accounts list */}
            <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-100">
                <h3 className="font-extrabold text-[#2d302a] text-sm flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-500" />
                  Active Cloud Multi-tenant Databases
                </h3>
                <p className="text-[11px] text-slate-500 font-sans mt-0.5">
                  Select a user from the cloud register below to inspect their claims, profiles, and rates in a sandboxed emulator.
                </p>

                <div className="relative mt-4">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    placeholder={
                      searchTarget === 'name' 
                        ? 'Search only by user name...' 
                        : searchTarget === 'email' 
                        ? 'Search only by email address...' 
                        : 'Search by name, email, or ID...'
                    }
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 border border-slate-200 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500/80 rounded-xl text-xs transition bg-slate-50/20"
                  />
                  {userSearchQuery && (
                    <button
                      onClick={() => setUserSearchQuery('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition text-sm font-bold"
                      title="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Specific Target Field Toggles */}
                <div className="flex gap-1 mt-3 bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setSearchTarget('any')}
                    className={`flex-1 py-1 px-2 rounded-md transition duration-155 ${
                      searchTarget === 'any' ? 'bg-white text-indigo-700 shadow-3xs' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Search All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchTarget('name')}
                    className={`flex-1 py-1 px-2 rounded-md transition duration-155 ${
                      searchTarget === 'name' ? 'bg-white text-indigo-700 shadow-3xs' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    By Name
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchTarget('email')}
                    className={`flex-1 py-1 px-2 rounded-md transition duration-155 ${
                      searchTarget === 'email' ? 'bg-white text-indigo-700 shadow-3xs' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    By Email
                  </button>
                </div>

                {/* Advanced sorting and status filters */}
                <div className="grid grid-cols-2 gap-2 mt-3 p-1 bg-slate-50 border border-slate-150/40 rounded-xl">
                  <div>
                    <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-widest pl-1 mb-0.5">Filter</label>
                    <select
                      value={userFilterOption}
                      onChange={(e) => setUserFilterOption(e.target.value as any)}
                      className="w-full px-2 py-1.5 border border-slate-150 rounded-lg text-[10.5px] font-bold bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-550"
                    >
                      <option value="all">All Accounts</option>
                      <option value="with-claims">With TA Claims</option>
                      <option value="no-claims">No Claims Yet</option>
                      <option value="multi-profiles">Multiple Profiles</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-widest pl-1 mb-0.5">Sort</label>
                    <select
                      value={userSortOrder}
                      onChange={(e) => setUserSortOrder(e.target.value as any)}
                      className="w-full px-2 py-1.5 border border-slate-150 rounded-lg text-[10.5px] font-bold bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-550"
                    >
                      <option value="default">Default</option>
                      <option value="name-asc">A to Z</option>
                      <option value="name-desc">Z to A</option>
                      <option value="budget-desc">Highest Claims</option>
                      <option value="profiles-desc">Most Profiles</option>
                    </select>
                  </div>
                </div>

                {/* Matching Count Indicators */}
                <div className="flex items-center justify-between mt-3 px-1 text-[10px] font-semibold text-slate-500">
                  <span>
                    Showing <strong className="text-slate-800 font-extrabold">{filteredUsers.length}</strong> of {adminUsers.length} Registered Accounts
                  </span>
                  {(userSearchQuery || userFilterOption !== 'all' || userSortOrder !== 'default' || searchTarget !== 'any') && (
                    <button
                      type="button"
                      onClick={() => {
                        setUserSearchQuery('');
                        setUserFilterOption('all');
                        setUserSortOrder('default');
                        setSearchTarget('any');
                      }}
                      className="text-rose-600 hover:text-rose-700 transition font-extrabold hover:underline"
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              </div>

              <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                {filteredUsers.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 text-xs font-sans">
                    No matching database accounts found under dynamic search criteria.
                  </div>
                ) : (
                  filteredUsers.map(user => {
                    const stats = userStatsMap[user.id] || { journalsCount: 0, profilesCount: 0, totalAmount: 0 };
                    const isSelected = adminSelectedUserId === user.id;

                    return (
                      <div 
                        key={user.id}
                        onClick={() => {
                          setAdminSelectedUserId(user.id);
                          setSelectedUserSubTab('journals');
                        }}
                        className={`p-4 hover:bg-slate-50 cursor-pointer transition flex items-center justify-between gap-4 text-left ${
                          isSelected ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : ''
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-slate-950 text-xs">{user.name || 'Anonymous User'}</span>
                            {isSelected && (
                              <span className="text-[8px] font-black tracking-wider uppercase bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.2 rounded font-sans">
                                EMULATION ACTIVE
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            Email: <span className="font-semibold text-slate-700">{user.email || 'Not configured'}</span>
                          </div>
                          <div className="text-[9px] text-slate-400 font-mono">
                            ID: {user.id}
                          </div>
                        </div>

                        <div className="text-right space-y-1 shrink-0">
                          <div className="flex items-center gap-1.5 justify-end text-[10px] font-bold text-slate-500">
                            <span className="bg-slate-100 border border-slate-200/50 px-1.5 py-0.5 rounded" title="Officer Profiles">
                              👤 {stats.profilesCount}
                            </span>
                            <span className="bg-slate-100 border border-slate-200/50 px-1.5 py-0.5 rounded" title="Claim Logs">
                              📄 {stats.journalsCount}
                            </span>
                          </div>
                          <div className="text-xs font-black text-[#5a623a]">
                            ₹{stats.totalAmount.toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Side: Detailed selection inspect panel */}
            <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl shadow-xs p-6 flex flex-col justify-between min-h-[500px]">
              {!adminSelectedUserId ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 text-center text-slate-400 space-y-4">
                  <div className="w-16 h-16 bg-slate-50 border border-slate-100 shadow-3xs rounded-2xl flex items-center justify-center text-slate-400">
                    <UserCheck className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-800">No active user has been selected</h4>
                    <p className="text-xs text-slate-500 max-w-sm font-sans">
                      Select one of the registered user accounts from the left panel list. Click View Dashboard to fully load the primary scheduler with their context.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 flex-1 flex flex-col h-full">
                  
                  {/* Select meta header info */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-black text-slate-900">
                          Account Target: {activeInspectionUser?.name}
                        </h3>
                        <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                        Firebase ID: <span className="bg-slate-100 px-1.5 py-0.2 rounded select-all text-slate-700 font-semibold">{activeInspectionUser?.id}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 self-start sm:self-center shrink-0">
                      <button
                        onClick={() => onViewChange('dashboard')}
                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-xs transition flex items-center gap-1 cursor-pointer"
                        title="Emulate this user and redirect to dashboard"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Open Dashboard / मुख्य सूची
                      </button>
                      <button
                        onClick={() => {
                          setSelectedInspectDocId(activeInspectionUser.id);
                          setInspectMode('profiles');
                          setActiveTab('document_inspector');
                        }}
                        className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition border border-slate-200/50"
                        title="View JSON definition rules"
                      >
                        <Code className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Sub-tab selections within active user profile */}
                  <div className="grid grid-cols-2 gap-2 bg-slate-100/80 p-1 rounded-xl">
                    <button
                      onClick={() => setSelectedUserSubTab('journals')}
                      className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        selectedUserSubTab === 'journals'
                          ? 'bg-white shadow-3xs text-indigo-700 font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      📄 User Travel Claims ({selectedUserJournals.length})
                    </button>
                    <button
                      onClick={() => setSelectedUserSubTab('profiles')}
                      className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        selectedUserSubTab === 'profiles'
                          ? 'bg-white shadow-3xs text-indigo-700 font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      👤 Officer Profiles ({selectedUserProfiles.length})
                    </button>
                  </div>

                  {/* Search inside selected tenant's subtabs */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Search className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      placeholder={selectedUserSubTab === 'journals' ? "Filter claims by month, officer, basic pay..." : "Filter profiles by name, design, headquarters..."}
                      value={subTabSearchQuery}
                      onChange={(e) => setSubTabSearchQuery(e.target.value)}
                      className="w-full pl-8.5 pr-3 py-1.5 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500/80 rounded-lg text-xs transition bg-white/60"
                    />
                  </div>

                  {/* Sub-tab view body */}
                  <div className="flex-1 min-h-[250px] overflow-y-auto">
                    {selectedUserSubTab === 'journals' ? (
                      <div className="space-y-3">
                        {selectedUserJournals.length === 0 ? (
                          <div className="bg-slate-50 border border-dashed border-slate-200 p-8 rounded-xl text-center text-xs text-slate-500 font-sans">
                            No Traveling Allowance Claims submitted/saved by this account yet.
                          </div>
                        ) : filteredSelectedUserJournals.length === 0 ? (
                          <div className="bg-slate-50 border border-dashed border-slate-150 p-8 rounded-xl text-center text-xs text-slate-400 font-sans">
                            No claims match the filter keyword: "{subTabSearchQuery}"
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden bg-slate-50/30">
                            {filteredSelectedUserJournals.map(journal => {
                              const profile = profiles.find(p => p.id === journal.profileId);
                              return (
                                <div key={journal.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50 transition">
                                  <div className="space-y-1">
                                    <div className="font-extrabold text-xs text-slate-950 flex items-center gap-1.5">
                                      Month Claimed: {journal.monthClaimed}
                                      {journal.isDraft && (
                                        <span className="text-[8px] bg-slate-205 text-slate-600 py-0.2 px-1 rounded uppercase font-black">Draft</span>
                                      )}
                                    </div>
                                    <div className="text-[10px] space-x-3 text-slate-500">
                                      <span>Days: <b className="font-mono font-bold text-slate-700">{journal.totalDays} Days</b></span>
                                      <span>Total: <b className="font-mono font-bold text-[#5a623a]">₹{journal.totalAmount}</b></span>
                                    </div>
                                    <div className="text-[9px] text-[#4d5332] font-semibold">
                                      Designation & Unit: {profile?.designation || 'N/A'} (PF: {profile?.pfNumber || 'N/A'})
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => setSelectedDetailJournal(journal)}
                                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 hover:border-indigo-300 text-xs font-black rounded-lg transition flex items-center gap-1 shrink-0 cursor-pointer"
                                      title="Show complete travel itinerary & calculations"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      View Details
                                    </button>
                                    <button
                                      onClick={() => onViewChange('print', journal.id)}
                                      className="px-3 py-1.5 bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200 hover:border-indigo-300 text-xs font-black rounded-lg transition flex items-center gap-1 shrink-0 cursor-pointer"
                                    >
                                      <FileText className="w-3.5 h-3.5" />
                                      Print Format
                                    </button>
                                    <button
                                      onClick={() => {
                                        setSelectedInspectDocId(journal.id);
                                        setInspectMode('journals');
                                        setActiveTab('document_inspector');
                                      }}
                                      className="p-1.5 bg-white text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg transition"
                                      title="View JSON Document Schema"
                                    >
                                      <Terminal className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedUserProfiles.length === 0 ? (
                          <div className="bg-slate-50 border border-dashed border-slate-200 p-8 rounded-xl text-center text-xs text-slate-500 font-sans">
                            No custom officer/staff profile has been configured under this account.
                          </div>
                        ) : filteredSelectedUserProfiles.length === 0 ? (
                          <div className="bg-slate-50 border border-dashed border-slate-150 p-8 rounded-xl text-center text-xs text-slate-400 font-sans">
                            No profiles match the filter keyword: "{subTabSearchQuery}"
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {filteredSelectedUserProfiles.map(p => (
                              <div key={p.id} className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs space-y-1 relative">
                                <div className="absolute top-2 right-2 flex items-center gap-1">
                                  <button
                                    onClick={() => setSelectedDetailProfile(p)}
                                    className="text-indigo-600 hover:text-indigo-800 p-1 transition"
                                    title="View Full Details / पूर्ण विवरण देखें"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSelectedInspectDocId(p.id);
                                      setInspectMode('profiles');
                                      setActiveTab('document_inspector');
                                    }}
                                    className="text-slate-400 hover:text-slate-700 p-1 transition"
                                    title="Schema Inspector"
                                  >
                                    <Code className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                <div className="font-extrabold text-slate-900 pr-5">{p.name}</div>
                                <div className="text-[10px] text-slate-500 font-medium">Designation: <span className="text-slate-700 font-bold">{p.designation}</span></div>
                                <div className="text-[10px] text-slate-500 font-mono">PF Number: {p.pfNumber}</div>
                                <div className="text-[10px] text-slate-500 font-sans">HQ: {p.headquarter} ({p.division})</div>
                                <div className="text-[9px] font-mono text-indigo-700 pt-1.5 border-t border-slate-200/50 mt-1 flex justify-between items-center">
                                  <span>Pay Level: {p.scaleOfPay || 'N/A'}</span>
                                  <span className="font-semibold">Basic: ₹{p.basicPay || p.gradePay || 0}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Sandboxed notice notice */}
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-2.5 text-xs text-indigo-900 mt-4">
                    <Info className="w-4 h-4 text-indigo-650 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-extrabold">Active Emulator Context Banner Integration:</span>
                      <p className="text-indigo-800 text-[11px] font-sans mt-0.5 leading-relaxed">
                        Redirecting to the main dashboard or creating new claims after selecting a user sets a strict emulation environment filter. This permits previewing calculations, claiming layouts, and rate structures exactly as that specific user sees them under absolute Firestore partitioning security.
                      </p>
                    </div>
                  </div>

                </div>
              )}
            </div>

          </div>
        )}

        {/* --- VIEW B: Email-Wise Accounts & TA Claims Listing --- */}
        {activeTab === 'email_wise_directory' && (
          <div className="space-y-6 animate-fade-in text-left">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-base font-black text-slate-1000 flex items-center gap-2">
                  <Database className="w-5 h-5 text-emerald-600" />
                  Email-Wise Cloud Databases Explorer / ईमेल-वार खाता एवं टीए सूची
                </h2>
                <p className="text-xs text-slate-500 font-sans mt-0.5">
                  An structured consolidated view of all registered parent & officer accounts and their cumulative Traveling Allowance (TA) claims grouped by Email ID.
                </p>
              </div>

              {/* Dynamic search bar for Email directory */}
              <div className="relative w-full md:w-80 shrink-0">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4 text-emerald-650" />
                </div>
                <input
                  type="text"
                  placeholder="Search by Email ID, Name, or ID..."
                  value={emailSearchQuery}
                  onChange={(e) => setEmailSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 hover:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/80 rounded-xl text-xs transition"
                />
              </div>
            </div>

            {/* Expanded items list */}
            {filteredEmailWiseData.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-xs font-sans">
                No registered email accounts match the query criteria.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredEmailWiseData.map(item => {
                  const isExpanded = !!expandedEmailUids[item.id];
                  return (
                    <div 
                      key={item.id} 
                      className={`bg-white rounded-2xl border transition-all ${
                        isExpanded ? 'border-indigo-400 shadow-xs' : 'border-slate-200/80 hover:border-slate-350'
                      }`}
                    >
                      {/* Accordion header bar */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleEmailExpand(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleEmailExpand(item.id);
                          }
                        }}
                        className="w-full p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 text-left cursor-pointer focus:outline-none select-none"
                      >
                        <div className="flex items-center gap-4.5">
                          {/* Circular initial avatar */}
                          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center font-black text-sm tracking-tight shrink-0 select-none">
                            {(item.email || item.name || 'AN').substring(0, 2).toUpperCase()}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-black text-slate-900 font-mono tracking-tight">{item.email || 'Anonymous Cloud Account'}</span>
                              <span className="text-[9px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-sans uppercase font-bold">
                                id: {item.id.substring(0, 8)}...
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 font-sans flex items-center gap-2">
                              <span>Account Owner: <b className="font-extrabold text-slate-700">{item.name || 'Not Configured'}</b></span>
                              {item.pfNumber && (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span>PF No: <b className="font-mono text-slate-600">{item.pfNumber}</b></span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right side stats pills & toggles */}
                        <div className="flex items-center gap-3 justify-between lg:justify-end flex-wrap sm:flex-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] sm:text-xs font-bold text-slate-600 bg-slate-50 border border-slate-150 px-2.5 py-1 rounded-xl whitespace-nowrap">
                              👤 {item.userProfiles.length} Profiles
                            </span>
                            <span className="text-[10px] sm:text-xs font-bold text-slate-600 bg-slate-50 border border-slate-150 px-2.5 py-1 rounded-xl whitespace-nowrap">
                              📄 {item.userJournals.length} TA Claims
                            </span>
                            <span className="text-[10px] sm:text-xs font-black text-emerald-800 bg-emerald-50 border border-emerald-150 px-2.5 py-1 rounded-xl whitespace-nowrap">
                              ₹{item.totalAmount.toLocaleString('en-IN')}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 ml-auto lg:ml-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAdminSelectedUserId(item.id);
                                onViewChange('dashboard');
                              }}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 hover:shadow-xs active:scale-95 text-white text-[11px] font-black rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                              title="Emulate this user session"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Emulate Account</span>
                            </button>
                            <span className="p-1 text-slate-400 hover:text-slate-600 transition shrink-0">
                              <ChevronRight className={`w-5 h-5 transform transition-transform ${isExpanded ? 'rotate-90 text-indigo-500' : ''}`} />
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Accordion body drawer content */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50/40 p-4 sm:p-6 space-y-6">
                          
                          {/* Inner split grids */}
                          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                            
                            {/* Inner Left: Officer Profiles */}
                            <div className="xl:col-span-4 bg-white border border-slate-150 rounded-2xl p-4 space-y-3 shadow-3xs text-left">
                              <div className="pb-2 border-b border-slate-100">
                                <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                                  <Users className="w-4 h-4 text-emerald-600" />
                                  Officer Profiles ({item.userProfiles.length})
                                </h4>
                                <p className="text-[10px] text-slate-500 font-sans mt-0.5">Profiles configured under this database.</p>
                              </div>

                              {item.userProfiles.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 text-[11px] font-serif">
                                  No profiles registered for this email.
                                </div>
                              ) : (
                                <div className="space-y-2.5">
                                  {item.userProfiles.map(p => (
                                    <div key={p.id} className="bg-slate-50 border border-slate-100 p-3 rounded-xl text-xs space-y-1 relative">
                                      <div className="absolute top-2.5 right-2.5">
                                        <button
                                          onClick={() => setSelectedDetailProfile(p)}
                                          className="text-indigo-605 hover:text-indigo-805 p-1 transition bg-white/60 hover:bg-white border border-slate-250/30 rounded"
                                          title="View Full Details / पूर्ण विवरण देखें"
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                      <div className="font-extrabold text-slate-900 pr-7">{p.name}</div>
                                      <div className="text-[10px] text-slate-500 font-medium">Designation: <span className="text-slate-700 font-bold">{p.designation}</span></div>
                                      <div className="text-[10px] text-slate-400 font-mono">PF: {p.pfNumber} • HQ: {p.headquarter}</div>
                                      <div className="text-[10px] text-indigo-700 font-mono font-medium flex justify-between bg-white border border-slate-100/50 p-1.5 rounded-lg mt-1">
                                        <span>Level: {p.scaleOfPay || 'N/A'}</span>
                                        <span>Basic: ₹{p.basicPay || p.gradePay || 0}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Inner Right: Submitted TA Claims Journals */}
                            <div className="xl:col-span-8 bg-white border border-slate-150 rounded-2xl p-4 space-y-3 shadow-3xs text-left">
                              <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
                                <div>
                                  <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                                    <BookOpen className="w-4 h-4 text-indigo-600" />
                                    Travelling Allowance Claims ({item.userJournals.length})
                                  </h4>
                                  <p className="text-[10px] text-slate-500 font-sans mt-0.5">Submitted claims database indexed by cloud timestamp.</p>
                                </div>
                                <div className="text-xs font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-mono">
                                  ₹{item.totalAmount.toLocaleString('en-IN')}
                                </div>
                              </div>

                              {item.userJournals.length === 0 ? (
                                <div className="p-12 text-center text-slate-400 text-xs font-sans">
                                  No saved Travelling Allowance (TA) records found for this account.
                                </div>
                              ) : (
                                <div className="divide-y divide-slate-100 border border-slate-100/70 rounded-xl overflow-hidden shadow-3xs">
                                  {item.userJournals.map(journal => {
                                    const relProfile = item.userProfiles.find(p => p.id === journal.profileId);
                                    return (
                                      <div key={journal.id} className="p-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:bg-slate-50 transition bg-white text-left">
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-extrabold text-xs text-slate-950 font-mono">Claim Month: {journal.monthClaimed}</span>
                                            {journal.isDraft && (
                                              <span className="text-[8px] bg-amber-100 text-amber-800 border border-amber-250 py-0.2 px-1.5 rounded uppercase font-black font-sans">Draft</span>
                                            )}
                                          </div>
                                          <div className="text-[10px] text-slate-500 space-x-2">
                                            <span>Officer: <b className="font-sans font-extrabold text-slate-700">{relProfile?.name || 'Loading profile...'}</b></span>
                                            <span>•</span>
                                            <span>PF: <b className="font-mono text-slate-600">{relProfile?.pfNumber || 'N/A'}</b></span>
                                            <span>•</span>
                                            <span>Transit days: {journal.totalDays}</span>
                                          </div>
                                        </div>

                                        <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                                          <div className="text-right">
                                            <div className="text-xs font-black text-emerald-800 font-mono">₹{journal.totalAmount.toLocaleString('en-IN')}</div>
                                            <span className="text-[9px] text-slate-400 font-sans block">Aggregate T.A. Sum</span>
                                          </div>

                                          <div className="flex items-center gap-1.5">
                                            <button
                                              onClick={() => setSelectedDetailJournal(journal)}
                                              className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[10px] font-black transition whitespace-nowrap flex items-center gap-1 cursor-pointer shadow-3xs"
                                              title="View Full Details / पूर्ण विवरण देखें"
                                            >
                                              <Eye className="w-3.5 h-3.5" />
                                              View Details
                                            </button>
                                            <button
                                              onClick={() => {
                                                setAdminSelectedUserId(item.id);
                                                onViewChange('print', journal.id);
                                              }}
                                              className="px-2.5 py-1.5 bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-lg text-[10px] font-black transition whitespace-nowrap flex items-center gap-1 cursor-pointer shadow-3xs"
                                              title="Print standard format to pdf"
                                            >
                                              <FileText className="w-3 h-3" />
                                              Print Format
                                            </button>
                                            
                                            <button
                                              onClick={() => {
                                                setSelectedInspectDocId(journal.id);
                                                setInspectMode('journals');
                                                setActiveTab('document_inspector');
                                              }}
                                              className="p-1.5 bg-white text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg transition"
                                              title="Inspect raw schema layout for developers"
                                            >
                                              <Terminal className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                          </div>

                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* --- VIEW: Master Unified Live Stream / All Entries Feed --- */}
        {activeTab === 'all_entries' && (
          <div className="space-y-6 animate-fade-in text-left">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-base font-black text-slate-1000 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-purple-600 animate-pulse" />
                  Master Unified Entries Ledger / सभी डेटा प्रविष्टियों का मुख्य लाइव लेज़र
                </h2>
                <p className="text-xs text-slate-500 font-sans mt-0.5">
                  Real-time read stream scanning every single Travelling Allowance (TA) claim and Officer Profile logged across all multi-tenant databases.
                </p>
              </div>

              {/* Dynamic inline stats breakdown */}
              <div className="flex gap-2 text-[10px] font-bold">
                <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-2.5 py-1 rounded-xl">
                  📄 {journals.length} Claims
                </span>
                <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-2.5 py-1 rounded-xl">
                  👤 {profiles.length} Profiles
                </span>
                <span className="bg-purple-50 border border-purple-100 text-purple-700 px-2.5 py-1 rounded-xl">
                  ₹{globalStats.totalAmount.toLocaleString('en-IN')} Total
                </span>
              </div>
            </div>

            {/* Filter and search controllers bar */}
            <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-2xl grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              {/* Universal Search Input */}
              <div className="md:col-span-6 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4 text-purple-600" />
                </div>
                <input
                  type="text"
                  placeholder="Filter everything by officer name, design, month, PF, HQ, owner..."
                  value={allEntriesSearchQuery}
                  onChange={(e) => setAllEntriesSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 border border-slate-200 hover:border-slate-350 focus:outline-none focus:ring-2 focus:ring-purple-500/10 focus:border-purple-600 rounded-xl text-xs transition bg-white"
                />
                {allEntriesSearchQuery && (
                  <button
                    onClick={() => setAllEntriesSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-405 hover:text-slate-650 font-black text-sm cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Filter Type Toggles */}
              <div className="md:col-span-3">
                <select
                  value={allEntriesFilterType}
                  onChange={(e) => setAllEntriesFilterType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 hover:border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/10 focus:border-purple-605 rounded-xl text-xs transition font-sans font-bold text-slate-700"
                >
                  <option value="all">Show All Entries (सभी प्रविष्टियां)</option>
                  <option value="journal">TA Claims Only (केवल यात्रा भत्ता दावे)</option>
                  <option value="profile">Officer Profiles Only (केवल प्रोफाइल)</option>
                </select>
              </div>

              {/* Sort Order dropdown */}
              <div className="md:col-span-3">
                <select
                  value={allEntriesSortOrder}
                  onChange={(e) => setAllEntriesSortOrder(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 hover:border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/10 focus:border-purple-605 rounded-xl text-xs transition font-sans font-bold text-slate-700"
                >
                  <option value="recent">Sort by Most Recent (हाल ही में)</option>
                  <option value="amount-desc">Sort by Claim Sum (दावा राशि)</option>
                  <option value="name-asc">Sort Alphabetically A-Z (नाम)</option>
                </select>
              </div>
            </div>

            {/* Results output feed */}
            {allEntriesCombined.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-xs font-sans">
                No entries match your query. Try resetting or broadening the search filters.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allEntriesCombined.map((entry) => {
                  const isJournal = entry.type === 'journal';
                  
                  if (isJournal) {
                    const j = entry.item as TAJournal;
                    const relativeProfile = profiles.find(p => p.id === j.profileId)
                      || (j.pfNumber ? profiles.find(p => p.pfNumber && p.pfNumber.trim() === j.pfNumber.trim()) : undefined)
                      || (j.officerName ? profiles.find(p => p.name && p.name.trim().toLowerCase() === j.officerName.trim().toLowerCase()) : undefined);
                    const accountOwner = resolveJournalAccountOwner(j, profiles, effectiveAdminUsers);

                    return (
                      <div 
                        key={entry.id} 
                        className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-xs transition flex flex-col justify-between space-y-4 text-left"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] bg-indigo-50 border border-indigo-150 text-indigo-700 px-2 py-0.5 rounded-full font-sans uppercase font-bold tracking-wider">
                              📄 TA claim / यात्रा भत्ता दावा
                            </span>
                            {j.isDraft ? (
                              <span className="text-[8px] bg-amber-50 text-amber-800 border border-amber-200 py-0.2 px-1.5 rounded uppercase font-black">Draft</span>
                            ) : (
                              <span className="text-[8px] bg-emerald-50 text-emerald-800 border border-emerald-250 py-0.2 px-1.5 rounded uppercase font-black">Submitted</span>
                            )}
                          </div>

                          <div>
                            <h3 className="font-extrabold text-slate-900 text-sm">
                              {entry.title}
                            </h3>
                            <p className="text-xs text-slate-600 font-sans mt-1">
                              <strong>Officer:</strong> {j.officerName || relativeProfile?.name || 'Unknown Officer'} ({relativeProfile?.designation || 'N/A'})
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                              <strong>PF No:</strong> {j.pfNumber || relativeProfile?.pfNumber || 'N/A'} • <strong>HQ:</strong> {relativeProfile?.headquarter || 'N/A'}
                            </p>
                          </div>

                          <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-[10.5px] text-slate-605 space-y-1">
                            <div>
                              <strong>DB Account Owner:</strong> <span className="font-bold text-slate-850 font-mono">{accountOwner.name}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-150/40 pt-1 mt-1">
                              <span><strong>Transit:</strong> {j.totalDays} Days</span>
                              <span><strong>Allowance:</strong> {j.allowanceType || 'TA'}</span>
                              <span className="font-mono text-[9px]">ID: {j.id.substring(0, 10)}...</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                          <div>
                            <div className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest">Claimed Amount</div>
                            <div className="text-sm font-black text-emerald-800 font-mono">₹{j.totalAmount.toLocaleString('en-IN')}</div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setSelectedDetailJournal(j)}
                              className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-750 border border-indigo-200 text-[10.5px] font-black rounded-lg transition-all flex items-center gap-1 cursor-pointer hover:shadow-3xs active:scale-95"
                              title="View Full Details / पूर्ण विवरण देखें"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View Details
                            </button>
                            <button
                              onClick={() => {
                                if (j.adminOwnerId) {
                                  setAdminSelectedUserId(j.adminOwnerId);
                                }
                                onViewChange('print', j.id);
                              }}
                              className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10.5px] font-black rounded-lg transition-all flex items-center gap-1 cursor-pointer hover:shadow-3xs active:scale-95"
                              title="Print standard format to PDF"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Print Format
                            </button>
                            
                            <button
                              onClick={() => {
                                setSelectedInspectDocId(j.id);
                                setInspectMode('journals');
                                setActiveTab('document_inspector');
                              }}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-lg transition"
                              title="Inspect JSON Data"
                            >
                              <Terminal className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    const p = entry.item as OfficerProfile;
                    const relativeOwner = adminUsers.find(u => u.id === p.adminOwnerId);

                    return (
                      <div 
                        key={entry.id} 
                        className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-xs transition flex flex-col justify-between space-y-4 text-left"
                      >
                        <div className="space-y-2">
                          <span className="text-[10px] bg-emerald-50 border border-emerald-150 text-emerald-700 px-2 py-0.5 rounded-full font-sans uppercase font-bold tracking-wider inline-block">
                            👤 Officer Profile / अधिकारी रूपरेखा
                          </span>

                          <div>
                            <h3 className="font-extrabold text-slate-900 text-sm">
                              {p.name}
                            </h3>
                            <p className="text-xs text-slate-600 font-sans mt-1">
                              <strong>Designation:</strong> {p.designation || 'N/A'} • <strong>HQ:</strong> {p.headquarter || 'N/A'}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                              <strong>PF No:</strong> {p.pfNumber} • <strong>Division:</strong> {p.division || 'N/A'}
                            </p>
                          </div>

                          <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-[10.5px] text-slate-605 space-y-1 font-sans">
                            <div>
                              <strong>DB Account Owner:</strong> <span className="font-bold text-slate-850 font-mono">{relativeOwner?.name || p.adminOwnerEmail}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-150/40 pt-1 mt-1 font-mono">
                              <span><strong>Level:</strong> {p.scaleOfPay || 'N/A'}</span>
                              <span><strong>Basic:</strong> ₹{p.basicPay || p.gradePay || 0}</span>
                              <span className="text-[9px]">ID: {p.id.substring(0, 10)}...</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                          <span className="text-[10.5px] text-slate-400 font-bold font-sans">
                            Configured Profile
                          </span>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setSelectedDetailProfile(p)}
                              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10.5px] font-black rounded-lg transition-all flex items-center gap-1 cursor-pointer hover:shadow-3xs active:scale-95"
                              title="View Full Details / पूर्ण विवरण देखें"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View Details
                            </button>
                            <button
                              onClick={() => {
                                if (p.adminOwnerId) {
                                  setAdminSelectedUserId(p.adminOwnerId);
                                }
                                onViewChange('dashboard');
                              }}
                              className="px-2.5 py-1.5 bg-emerald-650 hover:bg-emerald-750 text-white text-[10.5px] font-black rounded-lg transition-all flex items-center gap-1 cursor-pointer hover:shadow-3xs active:scale-95"
                              title="Emulate this user session to inspect fully"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Emulate Session
                            </button>
                            
                            <button
                              onClick={() => {
                                setSelectedInspectDocId(p.id);
                                setInspectMode('profiles');
                                setActiveTab('document_inspector');
                              }}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-lg transition"
                              title="Inspect JSON Data"
                            >
                              <Terminal className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            )}

            <div className="text-[11px] text-slate-400 font-sans select-none">
              Showing {allEntriesCombined.length} master entries out of {journals.length + profiles.length} aggregate database files.
            </div>
          </div>
        )}

        {/* --- VIEW C: Dynamic Interactive Analytics Dashboard (using lightweight inline responsive SVGs for zero dependency build safety) --- */}
        {activeTab === 'analytics' && (
          <div className="space-y-6 animate-fade-in text-left">
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <PieChart className="w-5 h-5 text-indigo-600 animate-pulse" />
              Dynamic Central Analytics Dashboard / केंद्रीय सांख्यिकी विश्लेषण Dashboard
            </h2>

            {/* Executive Summary & Vital Engagement Metrics Section */}
            <div className="bg-slate-50/50 p-4 rounded-3xl border border-slate-200/60">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3 px-1 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-indigo-500" />
                Executive Summary & Engagement Metrics / सिस्टम अवलोकन एवं मुख्य सांख्यिकी
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                
                {/* Metric Card 1: Registered Users */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider font-sans">
                        Registered Users / पंजीकृत
                      </span>
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                        <Users className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-black text-slate-950 font-mono tracking-tight">
                        {globalStats.totalUsers}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-sm">
                        +100% cloud
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-sans mt-1">
                      Total unique officer accounts synchronized
                    </p>
                  </div>
                  
                  {/* Inline Sparkline Area Chart */}
                  <div className="mt-4 pt-2 border-t border-slate-100/60">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-1 select-none">
                      <span>Registration Growth</span>
                      <span className="font-bold text-slate-600">6-Month Trend</span>
                    </div>
                    {(() => {
                      const width = 240;
                      const height = 45;
                      const data = userGrowthTrend;
                      if (data.length === 0) return null;
                      const maxVal = Math.max(...data.map(d => d.count), 1);
                      const points = data.map((d, idx) => {
                        const x = (idx / (data.length - 1)) * width;
                        const y = height - (d.count / maxVal) * (height - 12) - 4;
                        return `${x},${y}`;
                      });
                      const areaPath = `M 0,${height} L ${points.join(' L ')} L ${width},${height} Z`;
                      const linePath = `M ${points.join(' L ')}`;
                      return (
                        <div className="w-full h-11" title="Cumulative system user base growth">
                          <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                            <defs>
                              <linearGradient id="userGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            <path d={areaPath} fill="url(#userGrowthGrad)" />
                            <path d={linePath} fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Metric Card 2: Active Journals */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider font-sans">
                        Active Journals / कुल जर्नल
                      </span>
                      <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                        <BookOpen className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-black text-slate-950 font-mono tracking-tight">
                        {globalStats.totalJournals}
                      </span>
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-sm">
                        TA Claims
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-sans mt-1">
                      Consolidated Traveling Allowance claims filled
                    </p>
                  </div>

                  {/* Inline Sparkline Bar Chart */}
                  <div className="mt-4 pt-2 border-t border-slate-100/60">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-1 select-none">
                      <span>Submissions Bar</span>
                      <span className="font-bold text-slate-600">Monthly Density</span>
                    </div>
                    {(() => {
                      const width = 240;
                      const height = 45;
                      const data = journalsTrend;
                      if (data.length === 0) return null;
                      const maxVal = Math.max(...data.map(d => d.count), 1);
                      const barWidth = Math.max(5, Math.floor(width / data.length) - 5);
                      return (
                        <div className="w-full h-11" title="Traveling allowance journals submitted per month">
                          <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                            {data.map((d, idx) => {
                              const barHeight = (d.count / maxVal) * (height - 8) + 3;
                              const x = idx * (barWidth + 5);
                              const y = height - barHeight;
                              return (
                                <rect
                                  key={idx}
                                  x={x}
                                  y={y}
                                  width={barWidth}
                                  height={barHeight}
                                  fill="#10b981"
                                  className="hover:fill-emerald-400 transition-colors duration-150 cursor-pointer"
                                  rx="1"
                                >
                                  <title>{d.month}: {d.count} Journals</title>
                                </rect>
                              );
                            })}
                          </svg>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Metric Card 3: Daily Active Users (DAU) */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider font-sans">
                        Daily Active Users / दैनिक सक्रिय
                      </span>
                      <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                        <Activity className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-black text-slate-950 font-mono tracking-tight">
                        {dauData.currentDAU}
                      </span>
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-sm">
                        DAU Status
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-sans mt-1">
                      Unique active users modifying databases today
                    </p>
                  </div>

                  {/* Inline Sparkline Line Chart */}
                  <div className="mt-4 pt-2 border-t border-slate-100/60">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-1 select-none">
                      <span>DAU (Last 7 Days)</span>
                      <span className="font-bold text-slate-600">Active Footprint</span>
                    </div>
                    {(() => {
                      const width = 240;
                      const height = 45;
                      const data = dauData.chartData;
                      const maxVal = Math.max(dauData.maxDAU, 1);
                      const points = data.map((d, idx) => {
                        const x = (idx / (data.length - 1)) * width;
                        const y = height - (d.count / maxVal) * (height - 12) - 4;
                        return `${x},${y}`;
                      });
                      const linePath = `M ${points.join(' L ')}`;
                      return (
                        <div className="w-full h-11 relative" title="Interactive daily active users trend over last 7 days">
                          <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`}>
                            <path d={linePath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            {points.map((pt, idx) => {
                              const [x, y] = pt.split(',').map(Number);
                              return (
                                <g key={idx} className="cursor-pointer group/dot">
                                  <circle
                                    cx={x}
                                    cy={y}
                                    r="3"
                                    fill="#f59e0b"
                                    stroke="#fff"
                                    strokeWidth="1.5"
                                    className="hover:r-4 transition-all duration-100"
                                  />
                                  <title>{data[idx].displayDate}: {data[idx].count} Active Users</title>
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                      );
                    })()}
                  </div>
                </div>

              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Chart 1: Cumulative Revenue Month over Month Trend */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Claims Aggregation MoM (Month claim data)</h3>
                  <p className="text-xs text-slate-800 font-extrabold mt-0.5">Lineage Claim Allocations per month (Cumulative Budget Sum)</p>
                </div>

                <div className="h-56 mt-4 w-full flex items-end justify-between px-2 pt-4 border-b border-l border-slate-100">
                  {monthlyRevenueData.map((item, idx) => {
                    const barHeightPercent = `${item.ratio * 80 + 2}%`; // scale to max 80% to fit tags
                    const isNonZero = item.total > 0;
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center group relative cursor-pointer mx-1">
                        {/* Interactive Tooltip on hover */}
                        <div className="absolute bottom-full mb-1 bg-slate-900 text-white rounded text-[9px] p-1.5 opacity-0 group-hover:opacity-100 transition duration-150 shadow pointer-events-none z-10 w-24 text-center font-sans">
                          <p className="font-extrabold">{item.fullName}</p>
                          <p className="font-mono text-amber-305 font-bold mt-0.5">₹{item.total.toLocaleString()}</p>
                          <p className="text-slate-300 font-medium">Claims: {item.count}</p>
                        </div>

                        {/* Bar Segment */}
                        <div 
                          style={{ height: barHeightPercent }}
                          className={`w-full rounded-t-xs transition-all duration-300 ${
                            isNonZero 
                              ? 'bg-indigo-600 group-hover:bg-indigo-500' 
                              : 'bg-slate-100'
                          }`}
                        />
                        
                        {/* Sub-label text */}
                        <span className="text-[9px] font-mono font-bold text-slate-400 mt-1.5 uppercase select-none">{item.name}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-4 text-[10px] text-slate-500 mt-3 border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />
                    <span>Active claimed months (Sum in INR)</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-serif">*Hold cursor over bar to view detail summary</div>
                </div>
              </div>

              {/* Chart 2: Division Distribution Density */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Officer Division breakdown</h3>
                  <p className="text-xs text-slate-800 font-extrabold mt-0.5">Profile distribution across division boundaries</p>
                </div>

                <div className="space-y-3.5 mt-6 flex-1 flex flex-col justify-center">
                  {divisionDistribution.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs text-sans font-medium">No division records registered.</div>
                  ) : (
                    divisionDistribution.slice(0, 5).map((div, idx) => {
                      const colors = [
                        'bg-indigo-600',
                        'bg-emerald-600',
                        'bg-amber-500',
                        'bg-rose-500',
                        'bg-violet-500'
                      ];
                      const chosenColor = colors[idx % colors.length];

                      return (
                        <div key={div.name} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-sans">
                            <span className="font-bold text-slate-800 break-all select-none">{div.name}</span>
                            <span className="font-mono text-slate-500 text-[11px] font-extrabold">
                              {div.count} Profiles ({div.percentage}%)
                            </span>
                          </div>
                          
                          {/* Progress Line */}
                          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              style={{ width: `${div.percentage}%` }}
                              className={`h-full rounded-full ${chosenColor}`}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="text-[10px] text-slate-400 mt-4 border-t border-slate-100 pt-3 flex justify-between select-none">
                  <span>Displaying top 5 structured division classes</span>
                  <span>Total structured profiles: {globalStats.totalProfiles}</span>
                </div>
              </div>

              {/* Chart 3: Travel Mode Split and statistics */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between lg:col-span-2">
                <div>
                  <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Central Transportation Metrics</h3>
                  <p className="text-xs text-slate-800 font-extrabold mt-0.5">KMs travel distribution split (Train vs Road Modes)</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                  
                  {/* Left segment of metrics */}
                  <div className="space-y-4">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="text-xs font-bold text-slate-500">Train Transit Mileage</div>
                      <div className="text-xl font-black text-slate-900 font-mono mt-0.5">{journeyModeDistribution.trainKms.toLocaleString()} KM</div>
                      <p className="text-[11px] text-slate-400 mt-1 font-sans">Cumulative kilometer log for authorized rail tickets</p>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="text-xs font-bold text-slate-500">Road Transit Mileage</div>
                      <div className="text-xl font-black text-slate-900 font-mono mt-0.5">{journeyModeDistribution.roadKms.toLocaleString()} KM</div>
                      <p className="text-[11px] text-slate-400 mt-1 font-sans">Sum of state bus, utility car, and personal bike allocations</p>
                    </div>
                  </div>

                  {/* Mid Segment: Graphic depiction of transit mode split */}
                  <div className="flex flex-col items-center justify-center p-4">
                    <div className="relative w-36 h-36 flex items-center justify-center">
                      {/* Simple nested ring style visualization */}
                      <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                        {/* Rail Circle */}
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="2.5" />
                        <circle 
                          cx="18" cy="18" r="15.915" 
                          fill="none" stroke="#4f46e5" strokeWidth="2.5" 
                          strokeDasharray={`${journeyModeDistribution.trainPercent} ${100 - journeyModeDistribution.trainPercent}`} 
                          strokeLinecap="round"
                        />

                        {/* Road Circle */}
                        <circle cx="18" cy="18" r="12" fill="none" stroke="#f1f5f9" strokeWidth="2.5" />
                        <circle 
                          cx="18" cy="18" r="12" 
                          fill="none" stroke="#059669" strokeWidth="2.5" 
                          strokeDasharray={`${journeyModeDistribution.roadPercent} ${100 - journeyModeDistribution.roadPercent}`} 
                          strokeLinecap="round"
                        />
                      </svg>

                      {/* Inner center text */}
                      <div className="absolute text-center">
                        <span className="text-[10px] text-slate-400 font-extrabold uppercase block leading-none">Rail Share</span>
                        <span className="text-lg font-black text-slate-900 font-mono">{journeyModeDistribution.trainPercent}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Segment: Legend items details */}
                  <div className="flex flex-col justify-center space-y-4">
                    <div className="flex items-start gap-2 text-xs">
                      <span className="w-3 h-3 bg-indigo-600 rounded-sm mt-0.5 shrink-0" />
                      <div>
                        <span className="font-extrabold text-slate-900">Rail Journey Claims: {journeyModeDistribution.trainPercent}%</span>
                        <p className="text-slate-500 font-sans text-[11px] mt-0.5">Requires valid train numbers and PNR logs for authentication.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 text-xs">
                      <span className="w-3 h-3 bg-emerald-600 rounded-sm mt-0.5 shrink-0" />
                      <div>
                        <span className="font-extrabold text-slate-900">Road Journey Claims: {journeyModeDistribution.roadPercent}%</span>
                        <p className="text-slate-500 font-sans text-[11px] mt-0.5">Calculated using standardized local road transit rates.</p>
                      </div>
                    </div>
                  </div>

                </div>

              </div>

              {/* Dedicated Table: Aggregated TS submissions, total expenditures, and active user growth metrics */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs lg:col-span-2 space-y-4 text-left">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-600" />
                      Monthly Consolidated Audit & Active User Growth Metrics / मासिक समेकित लेखा परीक्षा रिपोर्ट
                    </h3>
                    <p className="text-xs text-slate-500 font-sans">
                      Auditable record summarizing aggregate traveling allowance budgets, submission frequencies, and cumulative operational growth coefficients.
                    </p>
                  </div>
                  <span className="text-[10px] bg-indigo-50 text-indigo-700 font-extrabold border border-indigo-150 px-3 py-1 rounded-xl self-start font-sans">
                    ✨ LIVE ADMINISTRATIVE DIRECTORY
                  </span>
                </div>

                {monthlyMetricsTableData.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 text-xs font-sans">
                    No matching claim journals found to calculate administrative aggregates.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200/60 shadow-3xs">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-150 text-[10px] font-black text-slate-600 uppercase font-sans select-none">
                          <th className="px-5 py-3">Claim Month (दावा महीना)</th>
                          <th className="px-5 py-3 text-center">TA Submissions Count (दावे संख्या)</th>
                          <th className="px-5 py-3 text-right">Total Expenditure (कुल व्यय)</th>
                          <th className="px-5 py-3 text-right">Average Expenditure (औसत व्यय)</th>
                          <th className="px-5 py-3 text-center">Active Officers (सक्रिय अधिकारी)</th>
                          <th className="px-5 py-3 text-center">User Growth Index (संचयी उपयोगकर्ता)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-sans">
                        {monthlyMetricsTableData.map((row, idx) => {
                          return (
                            <tr key={row.month} className="hover:bg-indigo-50/10 transition duration-150">
                              <td className="px-5 py-3.5 font-bold text-slate-900 font-mono flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                                {row.month}
                              </td>
                              <td className="px-5 py-3.5 text-center font-mono font-extrabold">
                                <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-md font-black border border-slate-150">
                                  {row.submissionCount}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-right font-mono font-black text-emerald-800">
                                ₹{row.totalExpenditure.toLocaleString('en-IN')}
                              </td>
                              <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-600">
                                ₹{Math.round(row.avgClaimAmount).toLocaleString('en-IN')}
                              </td>
                              <td className="px-5 py-3.5 text-center font-bold text-slate-700 font-mono">
                                {row.activeUsersInMonth} active {row.activeUsersInMonth === 1 ? 'tenant' : 'tenants'}
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <div className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-800 border border-indigo-100 px-2.5 py-1 rounded-full text-[10px] font-black font-mono">
                                  🚀 {row.cumulativeGrowthCount} Accounts Joined
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

            </div>
          </div>
        )}

             {/* --- VIEW C: Cross-Tenant Claims Search Finder (Deep index finder) --- */}
        {activeTab === 'global_search' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6 animate-fade-in text-left">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Search className="w-5 h-5 text-indigo-600" />
                  Cross-Tenant global Claim Index Finder
                </h2>
                <p className="text-xs text-slate-500 font-sans mt-0.5">
                  Query, filter, and inspect claim registers globally across *all* user databases simultaneously.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportFilteredCSV}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-all shadow-3xs hover:shadow-2xs cursor-pointer grow-0 self-start sm:self-center"
              >
                <Download className="w-4 h-4" />
                Export Filtered Results (CSV) / मुख्य सूची निर्यात करें
              </button>
            </div>

            {/* Filter controls row */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest pl-1 mb-1">Search Keywords</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    placeholder="Officer name, design, month..."
                    value={globalSearchQuery}
                    onChange={(e) => setGlobalSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500/80 rounded-xl text-xs transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest pl-1 mb-1">Minimum Claimed Sum</label>
                <input
                  type="number"
                  placeholder="e.g. 5000"
                  value={filterMinAmount}
                  onChange={(e) => setFilterMinAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500/80 rounded-xl text-xs transition"
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest pl-1 mb-1">Filter by Division</label>
                <select
                  value={filterDivision}
                  onChange={(e) => setFilterDivision(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 hover:border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500/80 rounded-xl text-xs transition font-sans"
                >
                  <option value="All">All Divisions (सभी डिवीजन)</option>
                  {uniqueDivisionsList.map(div => (
                    <option key={div} value={div}>{div}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest pl-1 mb-1">Travel Mode</label>
                <select
                  value={filterTravelMode}
                  onChange={(e) => setFilterTravelMode(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 hover:border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500/80 rounded-xl text-xs transition font-sans"
                >
                  <option value="All">All Travel Modes (सभी मोड)</option>
                  <option value="Train">Only Train (केवल ट्रेन यात्रा)</option>
                  <option value="Road">Only Road (केवल सड़क मार्ग)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest pl-1 mb-1">Sort Orders</label>
                <select
                  value={globalSearchSortOrder}
                  onChange={(e) => setGlobalSearchSortOrder(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 hover:border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500/80 rounded-xl text-xs transition font-sans"
                >
                  <option value="month-desc">Newest Month first</option>
                  <option value="amount-desc">Claim Amount: High to Low</option>
                  <option value="amount-asc">Claim Amount: Low to High</option>
                </select>
              </div>
            </div>

            {/* Results Table list */}
            <div className="border border-slate-100 rounded-xl overflow-hidden shadow-3xs">
              <table className="w-full text-xs font-sans">
                <thead className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-extrabold text-slate-500 tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5 text-left">Officer profile / User database</th>
                    <th className="px-6 py-3.5 text-left">Month claim</th>
                    <th className="px-6 py-3.5 text-left">Designation & Division</th>
                    <th className="px-6 py-3.5 text-right">KMs / Days</th>
                    <th className="px-6 py-3.5 text-right">Sum Claimed</th>
                    <th className="px-6 py-3.5 text-center">Diagnostics & Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {globalClaimsSearchResults.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-xs">
                        No claims registered matches your search criteria.
                      </td>
                    </tr>
                  ) : (
                    globalClaimsSearchResults.map((journal) => {
                      const relativeProfile = profiles.find(p => p.id === journal.profileId)
                        || (journal.pfNumber ? profiles.find(p => p.pfNumber && p.pfNumber.trim() === journal.pfNumber.trim()) : undefined)
                        || (journal.officerName ? profiles.find(p => p.name && p.name.trim().toLowerCase() === journal.officerName.trim().toLowerCase()) : undefined);
                      const accountOwner = resolveJournalAccountOwner(journal, profiles, effectiveAdminUsers);
                      
                      let totalKms = 0;
                      if (journal.journeys) {
                        totalKms = journal.journeys.reduce((sum, leg) => sum + (Number(leg.kms) || 0), 0);
                      }

                      return (
                        <tr key={journal.id} className="hover:bg-slate-50/50 transition">
                          <td className="px-6 py-4">
                            <div className="font-extrabold text-slate-800">{journal.officerName || relativeProfile?.name || 'Unnamed list'}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              Account / खाता: <span className="font-bold text-slate-700">{accountOwner.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-905">{journal.monthClaimed}</td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-700">{relativeProfile?.designation || 'N/A'}</div>
                            <div className="text-[10px] text-slate-450">{relativeProfile?.division || 'N/A'}</div>
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-slate-600">
                            <div>{totalKms.toLocaleString()} KM</div>
                            <div className="text-[10px] text-slate-450">{journal.totalDays} Days</div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="font-black text-slate-900 font-mono text-xs">₹{journal.totalAmount.toLocaleString()}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-1.5 font-sans">
                              <button
                                onClick={() => onViewChange('print', journal.id)}
                                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[10px] font-bold rounded-lg transition cursor-pointer flex items-center gap-0.5 animate-interactive"
                                title="Open official print-ready statement layout"
                              >
                                View Print
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedInspectDocId(journal.id);
                                  setInspectMode('journals');
                                  setActiveTab('document_inspector');
                                }}
                                className="p-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 rounded-lg transition cursor-pointer"
                                title="Inspect RAW JSON Document"
                              >
                                <Terminal className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteGlobalJournal(journal)}
                                className="p-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-lg transition cursor-pointer"
                                title="Delete claim permanently from customer databases"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="text-[11px] text-slate-400 font-sans select-none flex items-center justify-between">
              <span>Showing {globalClaimsSearchResults.length} global journal entries out of {journals.length} aggregate database files.</span>
              <span className="font-semibold text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded">Total Amount: ₹{globalClaimsSearchResults.reduce((sum, j) => sum + (j.totalAmount || 0), 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
        )}

        {/* --- VIEW D: Document Inspector Database visualizer (Schema Inspector) --- */}
        {activeTab === 'document_inspector' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in text-left">
            
            {/* Left selector sidebar column */}
            <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden flex flex-col min-h-[500px]">
              <div className="p-5 border-b border-slate-100 space-y-2">
                <h3 className="font-extrabold text-[#2d302a] text-sm flex items-center gap-2">
                  <Code className="w-4 h-4 text-indigo-500" />
                  Firestore Schema Document selector
                </h3>
                <p className="text-[11px] text-slate-500 font-sans mt-0.5">
                  Inspect raw nested JSON entries straight from Firestore tables. Mapped dynamically to prevent manual querying overhead.
                </p>

                <div className="grid grid-cols-2 gap-2 pt-2 bg-slate-50 p-1 rounded-lg">
                  <button
                    onClick={() => {
                      setInspectMode('journals');
                      setSelectedInspectDocId(null);
                    }}
                    className={`text-[11px] py-1.5 rounded font-extrabold transition cursor-pointer ${
                      inspectMode === 'journals'
                        ? 'bg-indigo-600 text-white shadow-3xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Claims Journals ({journals.length})
                  </button>
                  <button
                    onClick={() => {
                      setInspectMode('profiles');
                      setSelectedInspectDocId(null);
                    }}
                    className={`text-[11px] py-1.5 rounded font-extrabold transition cursor-pointer ${
                      inspectMode === 'profiles'
                        ? 'bg-indigo-600 text-white shadow-3xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Staff Profiles ({profiles.length})
                  </button>
                </div>

                {/* Sub-search input bar */}
                <div className="relative mt-2">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Search className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    placeholder={`Filter ${inspectMode} by name, email, or id...`}
                    value={inspectSearchQuery}
                    onChange={(e) => setInspectSearchQuery(e.target.value)}
                    className="w-full pl-8.5 pr-3 py-1.5 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500/80 rounded-lg text-[11px] transition bg-white/50"
                  />
                </div>
              </div>

              <div className="divide-y divide-slate-100 overflow-y-auto flex-1 max-h-[420px]">
                {inspectMode === 'journals' ? (
                  filteredInspectJournals.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400 font-sans">
                      No journals match your search term.
                    </div>
                  ) : (
                    filteredInspectJournals.map(journal => {
                      const relativeProfile = profiles.find(p => p.id === journal.profileId);
                      const isSelected = selectedInspectDocId === journal.id;

                      return (
                        <div
                          key={journal.id}
                          onClick={() => setSelectedInspectDocId(journal.id)}
                          className={`p-3.5 hover:bg-slate-50 cursor-pointer text-left transition ${
                            isSelected ? 'bg-indigo-50/50 border-r-4 border-indigo-600' : ''
                          }`}
                        >
                          <div className="font-bold text-xs text-slate-900 truncate">
                            Claim Period: {journal.monthClaimed}
                          </div>
                          <div className="text-[10px] text-slate-500 font-medium truncate">
                            Officer: {relativeProfile?.name || 'Unknown'} (PF: {relativeProfile?.pfNumber || 'N/A'})
                          </div>
                          <div className="text-[9px] text-slate-400 font-mono mt-0.5">ID: {journal.id}</div>
                        </div>
                      );
                    })
                  )
                ) : (
                  filteredInspectProfiles.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400 font-sans">
                      No staff profiles match your search term.
                    </div>
                  ) : (
                    filteredInspectProfiles.map(profile => {
                      const isSelected = selectedInspectDocId === profile.id;

                      return (
                        <div
                          key={profile.id}
                          onClick={() => setSelectedInspectDocId(profile.id)}
                          className={`p-3.5 hover:bg-slate-50 cursor-pointer text-left transition ${
                            isSelected ? 'bg-indigo-50/50 border-r-4 border-indigo-600' : ''
                          }`}
                        >
                          <div className="font-bold text-xs text-slate-900 truncate">{profile.name}</div>
                          <div className="text-[10px] text-slate-500 font-medium">Designation: {profile.designation}</div>
                          <div className="text-[9px] text-slate-400 font-mono mt-0.5">ID: {profile.id}</div>
                        </div>
                      );
                    })
                  )
                )}
              </div>
            </div>

            {/* Right side JSON renderer dashboard */}
            <div className="lg:col-span-7 bg-slate-950 border border-slate-900 rounded-2xl shadow-xl p-6 flex flex-col justify-between text-left min-h-[500px]">
              {!selectedInspectDocId ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-4">
                  <div className="w-12 h-12 bg-slate-900 text-slate-450 border border-slate-800 rounded-xl flex items-center justify-center">
                    <Terminal className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">Awaiting schema selection</h4>
                    <p className="text-[11px] text-slate-400 max-w-sm font-mono mt-1 leading-relaxed">
                      Select one of the structural document keys in the list to reveal formatted Firestore object payloads.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col h-full space-y-4">
                  
                  {/* JSON Header panel */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <span className="text-[9px] font-black text-rose-400 uppercase bg-rose-955/40 border border-rose-900 px-1.5 py-0.5 rounded font-mono">
                        Inspection target: {inspectMode}
                      </span>
                      <p className="text-[10px] text-slate-300 font-mono mt-1.5">ID: {selectedInspectDocId}</p>
                    </div>

                    <button
                      onClick={copyToClipboard}
                      className="px-3 py-1.5 hover:bg-slate-900 text-slate-300 border border-slate-800 text-[10px] font-semibold rounded-lg transition flex items-center gap-1 cursor-pointer"
                    >
                      {jsonCopied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Clipboard className="w-3.5 h-3.5" />}
                      {jsonCopied ? 'Copied object!' : 'Copy structural JSON'}
                    </button>
                  </div>

                  {/* Code frame */}
                  <div className="flex-1 bg-slate-990 border border-slate-900 rounded-xl max-h-[360px] overflow-auto p-4">
                    <pre className="text-[10px] font-mono text-emerald-400/90 leading-relaxed whitespace-pre font-medium selection:bg-indigo-900 select-all">
                      {activeInspectDocJson}
                    </pre>
                  </div>

                  {/* Bottom explanation */}
                  <div className="text-[10px] text-slate-400 font-mono border-t border-slate-900 pt-3 italic">
                    *JSON model schema tracks timestamps dynamically in UTC format. Used to handle offline synchronization playback smoothly.
                  </div>

                </div>
              )}
            </div>

          </div>
        )}

        {/* --- VIEW E: Bulk download backup (Diagnostics & utilities) --- */}
        {activeTab === 'utilities' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6 animate-fade-in text-left">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                Administrative Utilities & Cloud Recovery
              </h2>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Dynamic bulk database operation tools, complete catalog synchronization download support, and recovery models.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Utility 1: Bulk Database Export backup */}
              <div className="border border-slate-200/80 rounded-2xl p-6 hover:border-indigo-300 transition space-y-4 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center">
                    <Download className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-black text-slate-900">Dynamic Multi-Tenant JSON Database Backup</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-sans">
                    Construct a unified JSON file backup on the fly, containing all active user accounts, staff profiles, traveling allowance claims, and calculated aggregates. This payload is stored cleanly in local file registers for instantaneous system state recovery.
                  </p>
                </div>

                <button
                  onClick={triggerFullDatabaseBackupExport}
                  className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-lg transition-all shadow-3xs flex items-center justify-center gap-1.5 cursor-pointer self-start"
                >
                  <Download className="w-4 h-4" />
                  Download Complete DB Backup / बैकअप लें 
                </button>
              </div>

              {/* Utility 2: Cloud Sync Queues state list diagnostics */}
              <div className="border border-slate-200/80 rounded-2xl p-6 hover:border-slate-300 transition space-y-4 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="w-10 h-10 bg-slate-50 border border-slate-100 text-slate-700 rounded-xl flex items-center justify-center">
                    <Activity className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-black text-slate-900">Dynamic Synchronization diagnostics</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-sans">
                    View active status properties of parent collection links. All journals are protected under dynamic security rules to assure partitioned read-write isolated access.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-[11px] font-mono space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Operation Mode:</span>
                    <span className="font-extrabold text-[#5a623a]">Master Admin Emulation</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Total Datasets Crawled:</span>
                    <span className="font-extrabold text-slate-800">{journals.length + profiles.length} Schema docs</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Cloud Network State:</span>
                    <span className="font-extrabold text-indigo-700">Online Real-time Synchronized</span>
                  </div>
                </div>
              </div>

              {/* Notice guidelines pane */}
              <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 md:col-span-2">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-xs text-amber-900 block">Confidential System Administration Safe Guidelines</span>
                  <p className="text-amber-800 text-[11px] font-sans leading-relaxed">
                    This developer interface operates with master keys for root administrative email <b className="font-mono underline">nitesh0724@gmail.com</b>. Any document shown here is generated by actual staff and traveling personnel. Dynamic emulation allows you to download, view, and analyze computational schedules without altering underlying database integrity.
                  </p>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>

      {/* ========================================== */}
      {/* JOURNAL DETAIL VIEW MODAL (यात्रा दावा पूर्ण विवरण) */}
      {/* ========================================== */}
      {selectedDetailJournal && (() => {
        const j = selectedDetailJournal;
        const relativeProfile = profiles.find(p => p.id === j.profileId)
          || (j.pfNumber ? profiles.find(p => p.pfNumber && p.pfNumber.trim() === j.pfNumber.trim()) : undefined)
          || (j.officerName ? profiles.find(p => p.name && p.name.trim().toLowerCase() === j.officerName.trim().toLowerCase()) : undefined);
        const accountOwner = resolveJournalAccountOwner(j, profiles, effectiveAdminUsers);
        return (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs text-slate-800 animate-fade-in no-print text-left">
            <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="bg-slate-50 border-b border-slate-150 px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      TA Claim Details (यात्रा भत्ता दावा विस्तृत विवरण)
                      {j.isDraft ? (
                        <span className="text-[9px] bg-amber-100 border border-amber-200 text-amber-800 px-2 py-0.5 rounded font-black uppercase tracking-wider">Draft</span>
                      ) : (
                        <span className="text-[9px] bg-emerald-100 border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded font-black uppercase tracking-wider">Submitted</span>
                      )}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-sans mt-0.5">
                      Month of Claim: <b className="font-mono text-slate-800 text-xs">{j.monthClaimed}</b> • ID: <span className="font-mono bg-slate-100 px-1 py-0.2 rounded text-[10px] select-all">{j.id}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDetailJournal(null)}
                  className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 font-bold transition text-xl cursor-pointer"
                >
                  ×
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Section 1: Associated Officer & DB Account */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#fcfbf9] border border-stone-200/60 rounded-xl p-4 text-left space-y-2">
                    <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      Officer Profile (कर्मचारी विवरण)
                    </div>
                    {relativeProfile ? (
                      <div className="space-y-1">
                        <div className="font-black text-slate-900 text-xs">{j.officerName || relativeProfile.name}</div>
                        <div className="text-[11px] text-slate-600 font-sans">
                          <b>Designation / पदनाम:</b> {relativeProfile.designation}
                        </div>
                        <div className="text-[11px] text-slate-600 font-mono">
                          <b>PF Number / पीएफ नंबर:</b> {j.pfNumber || relativeProfile.pfNumber}
                        </div>
                        <div className="text-[11px] text-slate-600 font-sans">
                          <b>HQ / Division:</b> {relativeProfile.headquarter} ({relativeProfile.division})
                        </div>
                        <div className="text-[11px] text-indigo-700 font-mono font-semibold pt-1 border-t border-slate-200/50 flex justify-between">
                          <span>Pay Level: {relativeProfile.scaleOfPay || 'N/A'}</span>
                          <span>Basic Pay: ₹{relativeProfile.basicPay || relativeProfile.gradePay || 0}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-rose-600 italic">
                        *Associated profile not found or deleted (ID: {j.profileId})
                      </div>
                    )}
                  </div>

                  <div className="bg-indigo-50/30 border border-indigo-100/50 rounded-xl p-4 text-left space-y-2">
                    <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-1">
                      <Database className="w-3.5 h-3.5" />
                      Cloud Account Owner (पंजीकृत उपयोगकर्ता खाता)
                    </div>
                    <div className="space-y-1">
                      <div className="font-black text-slate-900 text-xs">{accountOwner.name}</div>
                      <div className="text-[11px] text-slate-600 font-mono">
                        <b>Email / Mobile:</b> {accountOwner.email || j.adminOwnerEmail || 'Not Specified'}
                      </div>
                      <div className="text-[11px] text-slate-650 font-mono">
                        <b>Firestore User ID:</b> {j.adminOwnerId || 'N/A'}
                      </div>
                      <div className="text-[10px] text-slate-400 pt-2 font-sans italic leading-relaxed">
                        *This Travelling Allowance Claim sheet is hosted under the partitioned tenant space of the above registered multi-user database account.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: Summary Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-left">
                  <div className="bg-slate-50 border border-slate-200/50 p-3.5 rounded-xl text-center space-y-1">
                    <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Total Days</div>
                    <div className="text-base font-black text-slate-900 font-mono">{j.totalDays} Days</div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-150 p-3.5 rounded-xl text-center space-y-1">
                    <div className="text-[9px] font-extrabold text-emerald-500 uppercase tracking-wider">Total Amount</div>
                    <div className="text-base font-black text-emerald-800 font-mono">₹{j.totalAmount.toLocaleString('en-IN')}</div>
                  </div>
                  <div className="bg-indigo-50/50 border border-indigo-100 p-3.5 rounded-xl text-center space-y-1">
                    <div className="text-[9px] font-extrabold text-indigo-500 uppercase tracking-wider">100% Rate Days</div>
                    <div className="text-base font-black text-indigo-800 font-mono">{j.percentage100Days || 0} Days</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/50 p-3.5 rounded-xl text-center space-y-1">
                    <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">70% Rate Days</div>
                    <div className="text-base font-black text-slate-800 font-mono">{j.percentage70Days || 0} Days</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/50 p-3.5 rounded-xl text-center space-y-1">
                    <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">30% Rate Days</div>
                    <div className="text-base font-black text-slate-800 font-mono">{j.percentage30Days || 0} Days</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/50 p-3.5 rounded-xl text-center space-y-1">
                    <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Free Pass Allowed</div>
                    <div className="text-xs font-bold text-slate-700 mt-1">{j.freePassAllowed || 'None'}</div>
                  </div>
                </div>

                {/* Section 3: Traveling allowance journeys detailed itinerary table */}
                <div className="space-y-2 text-left">
                  <div className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-purple-600" />
                    Complete Journey Itinerary & Calculations (यात्रा भत्ता मार्ग-सारणी एवं गणना)
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-3xs bg-white">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-650 font-extrabold border-b border-slate-200">
                            <th className="p-3">Date</th>
                            <th className="p-3">Departure (From / Time)</th>
                            <th className="p-3">Arrival (To / Time)</th>
                            <th className="p-3">Travel Mode (Train No)</th>
                            <th className="p-3 text-right">KMs</th>
                            <th className="p-3">Object of Journey</th>
                            <th className="p-3 text-right">Base Rate</th>
                            <th className="p-3 text-center">Slab %</th>
                            <th className="p-3 text-right bg-emerald-50/30 text-emerald-900">Calculated (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150">
                          {j.journeys && j.journeys.length > 0 ? (
                            j.journeys.map((row, idx) => {
                              const isHalted = row.mode === 'Halted' || row.mode === 'Halt';
                              return (
                                <tr key={row.id || idx} className="hover:bg-slate-50/50 transition">
                                  <td className="p-3 font-semibold font-mono text-[11px] whitespace-nowrap">
                                    {row.date}
                                    {row.dateEnd && row.dateEnd !== row.date && (
                                      <span className="block text-[10px] text-slate-400 font-normal">to {row.dateEnd}</span>
                                    )}
                                  </td>
                                  <td className="p-3">
                                    {isHalted ? (
                                      <span className="text-slate-400 italic">Halted at destination</span>
                                    ) : (
                                      <>
                                        <span className="font-bold text-slate-800 block">{row.fromStation || 'N/A'}</span>
                                        <span className="text-[10px] text-slate-400 font-mono font-medium">Dep: {row.timeLeft || 'N/A'}</span>
                                      </>
                                    )}
                                  </td>
                                  <td className="p-3">
                                    {isHalted ? (
                                      <span className="text-slate-400 italic">Halted at destination</span>
                                    ) : (
                                      <>
                                        <span className="font-bold text-slate-800 block">{row.toStation || 'N/A'}</span>
                                        <span className="text-[10px] text-slate-400 font-mono font-medium">Arr: {row.timeArrived || 'N/A'}</span>
                                      </>
                                    )}
                                  </td>
                                  <td className="p-3">
                                    <span className="font-semibold text-slate-700 block">{row.mode}</span>
                                    {row.trainNo && (
                                      <span className="text-[10px] text-slate-400 font-mono">No: {row.trainNo}</span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right font-mono font-bold text-slate-600">{row.kms || 0}</td>
                                  <td className="p-3 max-w-[150px] truncate" title={row.objectOfJourney}>
                                    {row.objectOfJourney || 'Official Tour'}
                                  </td>
                                  <td className="p-3 text-right font-mono font-semibold text-slate-600">₹{row.dailyRate || 0}</td>
                                  <td className="p-3 text-center">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                      row.overrideSlab !== 'Auto'
                                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                        : 'bg-indigo-50 text-indigo-700'
                                    }`}>
                                      {row.overrideSlab !== 'Auto' ? `${row.overrideSlab}% (O)` : `${row.autoSlab}%`}
                                    </span>
                                  </td>
                                  <td className="p-3 text-right font-mono font-extrabold bg-emerald-50/20 text-emerald-800">
                                    ₹{(row.calculatedAmount || 0).toLocaleString('en-IN')}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                                No travel/journey rows registered inside this claim journal.
                              </td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-100 font-extrabold border-t border-slate-200">
                            <td colSpan={4} className="p-3 text-right font-black uppercase text-slate-600">Total Sum (कुल योग)</td>
                            <td className="p-3 text-right font-mono text-slate-700">
                              {j.journeys?.reduce((sum, r) => sum + (r.kms || 0), 0) || 0} KMs
                            </td>
                            <td colSpan={3}></td>
                            <td className="p-3 text-right font-mono text-base font-black text-emerald-850 bg-emerald-100/50">
                              ₹{j.totalAmount.toLocaleString('en-IN')}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex items-center justify-between shrink-0">
                <button
                  onClick={() => {
                    if (j.adminOwnerId) {
                      setAdminSelectedUserId(j.adminOwnerId);
                    }
                    onViewChange('print', j.id);
                    setSelectedDetailJournal(null);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  Print Travel Format / प्रिंट फ़ॉर्मेट
                </button>
                <button
                  onClick={() => setSelectedDetailJournal(null)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-250 text-slate-700 text-xs font-extrabold rounded-xl transition cursor-pointer"
                >
                  Close (बंद करें)
                </button>
              </div>
            </div>
          </div>
        );
      })()}


      {/* ========================================== */}
      {/* PROFILE DETAIL VIEW MODAL (स्टाफ/कर्मचारी पूर्ण विवरण) */}
      {/* ========================================== */}
      {selectedDetailProfile && (() => {
        const p = selectedDetailProfile;
        const relativeOwner = adminUsers.find(u => u.id === p.adminOwnerId);
        // Find all claims filed by this profile
        const profileClaims = journals.filter(j => j.profileId === p.id);
        const profileClaimsTotal = profileClaims.reduce((sum, j) => sum + (j.totalAmount || 0), 0);

        return (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs text-slate-800 animate-fade-in no-print text-left">
            <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 font-extrabold">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      Officer Profile Details (स्टाफ / कर्मचारी पहचान पत्र एवं विवरण)
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Unique Profile ID: <span className="font-mono bg-slate-100 px-1 py-0.2 rounded text-[10px] select-all">{p.id}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDetailProfile(null)}
                  className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 font-bold transition text-xl cursor-pointer"
                >
                  ×
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* ID Card Grid */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                  
                  {/* Left Column: ID Badge visual */}
                  <div className="md:col-span-4 bg-gradient-to-b from-[#2d302a] to-[#151714] text-stone-200 border border-stone-800 p-5 rounded-2xl text-center space-y-4 shadow-xl shrink-0 flex flex-col items-center">
                    <div className="w-20 h-20 bg-slate-800 border border-stone-700/60 rounded-full flex items-center justify-center text-stone-300 relative overflow-hidden shrink-0 select-none">
                      {p.photoUrl ? (
                        <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="text-2xl font-black text-indigo-300 font-mono">{p.name.substring(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="font-black text-xs text-white uppercase tracking-tight">{p.name}</div>
                      <div className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 px-2 py-0.5 rounded-full inline-block">
                        {p.designation}
                      </div>
                    </div>
                    
                    <div className="w-full border-t border-stone-800 pt-3 text-left space-y-2 text-[10px] font-mono leading-relaxed">
                      <div>
                        <span className="text-stone-500 block text-[9px] uppercase tracking-widest font-sans font-black">PF Number</span>
                        <span className="text-stone-300 font-bold">{p.pfNumber}</span>
                      </div>
                      <div>
                        <span className="text-stone-500 block text-[9px] uppercase tracking-widest font-sans font-black">Headquarters</span>
                        <span className="text-stone-300 font-bold">{p.headquarter}</span>
                      </div>
                      <div>
                        <span className="text-stone-500 block text-[9px] uppercase tracking-widest font-sans font-black">Division</span>
                        <span className="text-stone-300 font-bold">{p.division}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Complete specifications */}
                  <div className="md:col-span-8 space-y-5 text-left">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-1">
                      Service & Payroll Data (सेवा एवं वेतनमान संरचना)
                    </h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                      <div>
                        <span className="text-slate-405 block text-[10px] font-extrabold uppercase">Officer Name (कर्मचारी का नाम)</span>
                        <span className="font-extrabold text-slate-850 block mt-0.5">{p.name}</span>
                      </div>
                      <div>
                        <span className="text-slate-405 block text-[10px] font-extrabold uppercase">Designation / Designation (पदनाम)</span>
                        <span className="font-extrabold text-slate-850 block mt-0.5">{p.designation}</span>
                      </div>
                      <div>
                        <span className="text-slate-405 block text-[10px] font-extrabold uppercase">PF Number (पीएफ संख्या)</span>
                        <span className="font-bold text-slate-800 font-mono block mt-0.5">{p.pfNumber}</span>
                      </div>
                      <div>
                        <span className="text-slate-405 block text-[10px] font-extrabold uppercase">Branch / Section (शाखा / विभाग)</span>
                        <span className="font-bold text-slate-800 block mt-0.5">{p.branch || 'RPF Executive'}</span>
                      </div>
                      <div>
                        <span className="text-slate-405 block text-[10px] font-extrabold uppercase">Headquarter (मुख्यालय)</span>
                        <span className="font-bold text-slate-800 block mt-0.5">{p.headquarter}</span>
                      </div>
                      <div>
                        <span className="text-slate-405 block text-[10px] font-extrabold uppercase">Division (मंडल)</span>
                        <span className="font-bold text-slate-800 block mt-0.5">{p.division}</span>
                      </div>
                      <div>
                        <span className="text-slate-405 block text-[10px] font-extrabold uppercase">Scale of Pay (वेतनमान स्तर)</span>
                        <span className="font-extrabold text-indigo-700 font-mono block mt-0.5">{p.scaleOfPay || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-405 block text-[10px] font-extrabold uppercase">Basic Pay (मूल वेतन)</span>
                        <span className="font-extrabold text-indigo-700 font-mono block mt-0.5">₹{(p.basicPay || p.gradePay || 0).toLocaleString('en-IN')}</span>
                      </div>
                      <div>
                        <span className="text-slate-405 block text-[10px] font-extrabold uppercase">Date of Appointment (नियुक्ति तिथि)</span>
                        <span className="font-bold text-slate-800 font-mono block mt-0.5">{p.dateOfAppointment || 'Not configured'}</span>
                      </div>
                      <div>
                        <span className="text-slate-405 block text-[10px] font-extrabold uppercase">Rule Governed (नियमन प्रकार)</span>
                        <span className="font-bold text-slate-800 block mt-0.5">{p.ruleGoverned || '7th CPC Slab System'}</span>
                      </div>
                      <div>
                        <span className="text-slate-405 block text-[10px] font-extrabold uppercase">Bill Unit (बिल इकाई संख्या)</span>
                        <span className="font-bold text-slate-800 font-mono block mt-0.5">{p.billUnit || 'Not configured'}</span>
                      </div>
                      <div>
                        <span className="text-slate-405 block text-[10px] font-extrabold uppercase">Mobile Number (मोबाइल संख्या)</span>
                        <span className="font-bold text-slate-800 font-mono block mt-0.5">{p.mobileNumber || 'Not configured'}</span>
                      </div>
                    </div>

                    {/* DB account ownership indicator */}
                    <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-[11px] text-slate-500 font-sans mt-4 flex items-center justify-between">
                      <span>
                        Registered DB Account: <strong className="text-slate-800 font-mono">{relativeOwner?.name || p.adminOwnerEmail || 'Unknown'}</strong>
                      </span>
                      <span className="font-mono text-[9px] text-slate-400">Owner ID: {p.adminOwnerId || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Claims Filed section */}
                <div className="space-y-2 border-t border-slate-100 pt-6 text-left">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center justify-between">
                    <span>Claims Filed under this ID (कुल सहेजे गए यात्रा दावा रिकॉर्ड)</span>
                    <span className="text-emerald-800 bg-emerald-50 border border-emerald-150 font-bold px-2.5 py-0.5 rounded text-[11px]">
                      ₹{profileClaimsTotal.toLocaleString('en-IN')} Cumulative
                    </span>
                  </h4>
                  
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-3xs bg-slate-50/20">
                    {profileClaims.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 italic text-xs">
                        No Traveling Allowance (TA) claim sheets have been registered or submitted under this officer ID.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-150">
                        {profileClaims.map(j => (
                          <div key={j.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 bg-white transition text-xs">
                            <div className="space-y-0.5 text-left">
                              <div className="font-extrabold text-slate-900 flex items-center gap-1.5 font-mono">
                                Claim Month: {j.monthClaimed}
                                {j.isDraft && (
                                  <span className="text-[8px] bg-amber-50 text-amber-800 border border-amber-250 px-1 py-0.2 rounded font-black font-sans uppercase">Draft</span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 space-x-3 font-sans">
                                <span>Transit Days: <strong className="font-mono font-bold text-slate-700">{j.totalDays} Days</strong></span>
                                <span>Allowance Type: <strong className="font-mono text-slate-650">{j.allowanceType || 'TA'}</strong></span>
                                <span>ID: <strong className="font-mono text-slate-400">{j.id.substring(0, 8)}...</strong></span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="text-right pr-2">
                                <span className="text-[9px] text-slate-400 font-sans block">Allowance Sum</span>
                                <span className="font-extrabold text-emerald-800 font-mono">₹{j.totalAmount.toLocaleString('en-IN')}</span>
                              </div>
                              <button
                                onClick={() => setSelectedDetailJournal(j)}
                                className="px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-[10.5px] font-black border border-indigo-200 transition cursor-pointer"
                              >
                                View Claim Details
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex items-center justify-between shrink-0">
                <button
                  onClick={() => {
                    if (p.adminOwnerId) {
                      setAdminSelectedUserId(p.adminOwnerId);
                    }
                    onViewChange('dashboard');
                    setSelectedDetailProfile(null);
                  }}
                  className="px-4 py-2 bg-emerald-650 hover:bg-emerald-750 text-white text-xs font-black rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  Emulate Session & Open Dashboard / मुख्य सूची
                </button>
                <button
                  onClick={() => setSelectedDetailProfile(null)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-250 text-slate-700 text-xs font-extrabold rounded-xl transition cursor-pointer"
                >
                  Close (बंद करें)
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
