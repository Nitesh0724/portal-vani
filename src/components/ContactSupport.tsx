import React, { useState, useEffect } from 'react';
import { 
  fetchContactConfig, 
  saveContactConfig, 
  submitFeedback, 
  fetchUserFeedbacks, 
  fetchAllFeedbacks, 
  replyToFeedback,
  deleteFeedbackRecord
} from '../firebase';
import { FeedbackEntry, ContactConfig, OfficerProfile } from '../types';
import { 
  Mail, 
  Phone, 
  Send, 
  CheckCircle, 
  AlertCircle, 
  Trash2, 
  Settings, 
  ShieldCheck, 
  HelpCircle, 
  CornerDownRight, 
  ArrowLeft,
  MessageSquare,
  Wrench,
  UserCheck,
  RefreshCw
} from 'lucide-react';

interface ContactSupportProps {
  authUser: { uid: string; email?: string | null };
  profile: OfficerProfile;
  onBack: () => void;
}

export const ContactSupport: React.FC<ContactSupportProps> = ({ authUser, profile, onBack }) => {
  const [activeTab, setActiveTab] = useState<'contact' | 'admin-feedbacks' | 'admin-settings'>('contact');
  const [contactConfig, setContactConfig] = useState<ContactConfig>({
    email: 'nitesh0724@gmail.com',
    phone: '7250322223'
  });
  
  // Feedback form state
  const [feedbackType, setFeedbackType] = useState<'complaint' | 'experience'>('complaint');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // User submitted Feedbacks history
  const [userFeedbacks, setUserFeedbacks] = useState<FeedbackEntry[]>([]);
  const [userLoaded, setUserLoaded] = useState(false);

  // Admin feed / config edit states
  const [allFeedbacks, setAllFeedbacks] = useState<FeedbackEntry[]>([]);
  const [adminLoaded, setAdminLoaded] = useState(false);
  const [replyTextInput, setReplyTextInput] = useState<{ [id: string]: string }>({});
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyLoading, setReplyLoading] = useState(false);

  // Editable Contact Config (Admin panel)
  const [editEmail, setEditEmail] = useState('nitesh0724@gmail.com');
  const [editPhone, setEditPhone] = useState('7250322223');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedSuccess, setSettingsSavedSuccess] = useState(false);

  // Check if current user is the app parent / developer (Email or Mobile match)
  const isAdmin = 
    authUser?.email?.toLowerCase() === 'nitesh0724@gmail.com' ||
    profile?.mobileNumber?.trim() === '7250322223' ||
    profile?.pfNumber?.trim() === '7250322223' ||
    (authUser?.email && authUser.email.toLowerCase().includes('nitesh0724'));

  // Load Contact config and feed on mount
  useEffect(() => {
    async function loadData() {
      try {
        const config = await fetchContactConfig();
        setContactConfig(config);
        setEditEmail(config.email);
        setEditPhone(config.phone);
      } catch (err) {
        console.warn("Failed to load initial contact configurations:", err);
      }

      try {
        const feedbacks = await fetchUserFeedbacks(authUser.uid);
        setUserFeedbacks(feedbacks);
      } catch (err) {
        console.warn("Failed to load user feedbacks, using local cached history:", err);
      } finally {
        setUserLoaded(true);
      }

      if (isAdmin) {
        try {
          const globalFeedbacks = await fetchAllFeedbacks();
          setAllFeedbacks(globalFeedbacks);
        } catch (err) {
          console.warn("Failed to load global feedbacks list:", err);
        } finally {
          setAdminLoaded(true);
        }
      }
    }
    loadData();
  }, [authUser.uid, isAdmin]);

  // Handle support request / experience submission
  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setErrorMsg('Please enter a valid title and details. / कृपया विषय और संदेश प्रविष्ट करें।');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const newFeedback: FeedbackEntry = {
      id: 'fdb_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      userId: authUser.uid,
      type: feedbackType,
      title: title.trim(),
      description: description.trim(),
      senderName: profile.name || 'Anonymous Officer',
      senderPfNumber: profile.pfNumber || 'N/A',
      senderEmail: authUser.email || 'no-email@rpf.gov',
      createdAt: new Date().toISOString()
    };

    try {
      await submitFeedback(newFeedback);
      setSubmitSuccess(true);
      setTitle('');
      setDescription('');
      
      // Reload user history list
      const freshUserFeedbacks = await fetchUserFeedbacks(authUser.uid);
      setUserFeedbacks(freshUserFeedbacks);
      
      // If admin submitted, reload admin view too
      if (isAdmin) {
        const freshGlobalFeedbacks = await fetchAllFeedbacks();
        setAllFeedbacks(freshGlobalFeedbacks);
      }

      setTimeout(() => {
        setSubmitSuccess(false);
      }, 5000);
    } catch (err) {
      setErrorMsg('Submission failed. Please check connection. / भेजने में असमर्थ, पुनः प्रयास करें।');
    } finally {
      setSubmitting(false);
    }
  };

  // Admin reply submission
  const handleSendReply = async (feedbackId: string) => {
    const text = replyTextInput[feedbackId];
    if (!text || !text.trim()) return;

    setReplyLoading(true);
    try {
      await replyToFeedback(feedbackId, text.trim());
      
      // Clear reply state
      setReplyTextInput(prev => ({ ...prev, [feedbackId]: '' }));
      setReplyingId(null);

      // Refresh listings
      const freshFeedbacks = await fetchAllFeedbacks();
      setAllFeedbacks(freshFeedbacks);
      
      const freshUserList = await fetchUserFeedbacks(authUser.uid);
      setUserFeedbacks(freshUserList);
    } catch (err) {
      alert('Failed to save reply.');
    } finally {
      setReplyLoading(false);
    }
  };

  // Save new contact configurations inside settings collection (Admin)
  const handleSaveContactConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEmail.trim() || !editPhone.trim()) {
      alert('Please fill email and phone settings.');
      return;
    }

    setSavingSettings(true);
    setSettingsSavedSuccess(false);

    try {
      const newSettings: ContactConfig = {
        email: editEmail.trim(),
        phone: editPhone.trim()
      };
      await saveContactConfig(newSettings);
      setContactConfig(newSettings);
      setSettingsSavedSuccess(true);
      setTimeout(() => setSettingsSavedSuccess(false), 3000);
    } catch (err) {
      alert('Failed to save contact configurations.');
    } finally {
      setSavingSettings(false);
    }
  };

  // Delete feedback entry (Admin utility)
  const handleDeleteFeedback = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this ticket?')) return;
    try {
      await deleteFeedbackRecord(id);
      setAllFeedbacks(prev => prev.filter(f => f.id !== id));
      setUserFeedbacks(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      alert('Failed to delete ticket.');
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-[#fcfbf9] text-stone-850 rounded-2xl border border-stone-200/80 shadow-md p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full transition-all">
      {/* Upper header action area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-stone-200/80 pb-5 mb-6 gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-stone-900 tracking-tight font-sans flex items-center gap-2">
            <HelpCircle className="w-6 h-6 text-amber-600 shrink-0" />
            <span>Contact Us & Experiences / सहायता केंद्र एवं शिकायत</span>
          </h1>
          <p className="text-xs text-stone-500 font-medium mt-1">
            Submit bugs, request calculation corrections, or share your valuable experience with the parent developer.
          </p>
        </div>
        
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 text-xs font-bold hover:bg-stone-50 transition active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard / मुख्य पृष्ठ</span>
        </button>
      </div>

      {/* Nav tab row for Regular vs Admin views */}
      {isAdmin && (
        <div className="flex bg-stone-100 p-1 rounded-xl mb-6 max-w-lg border border-stone-200">
          <button
            onClick={() => setActiveTab('contact')}
            className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'contact' 
                ? 'bg-amber-600 text-white shadow-xs' 
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            💬 Contact & Ticket Form
          </button>
          <button
            onClick={() => setActiveTab('admin-feedbacks')}
            className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
              activeTab === 'admin-feedbacks' 
                ? 'bg-amber-600 text-white shadow-xs' 
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Parent Admin Feed ({allFeedbacks.length})
          </button>
          <button
            onClick={() => setActiveTab('admin-settings')}
            className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
              activeTab === 'admin-settings' 
                ? 'bg-amber-600 text-white shadow-xs' 
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Config Settings
          </button>
        </div>
      )}

      {/* Tab Switch Body */}
      {activeTab === 'contact' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Main Submission Form (Left side) */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white rounded-xl border border-stone-200/60 p-5 sm:p-6 shadow-xs">
              <h2 className="text-sm font-bold uppercase tracking-wider text-stone-800 mb-4 pb-2 border-b border-stone-100">
                📥 Send feedback or File a Complaint / शिकायत या अनुभव भेजें
              </h2>
              
              <form onSubmit={handleSubmitFeedback} className="space-y-4">
                {/* Type Selection Tabs */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wide mb-1.5">
                    What are you reporting? (रिपोर्ट का प्रकार)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFeedbackType('complaint')}
                      className={`py-2 px-4 text-xs font-bold rounded-lg border text-center transition-all ${
                        feedbackType === 'complaint'
                          ? 'bg-[#ffebee] text-red-800 border-red-300 shadow-2xs'
                          : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      ⚠️ Complaint / Bug / शिकायत / त्रुटि
                    </button>
                    <button
                      type="button"
                      onClick={() => setFeedbackType('experience')}
                      className={`py-2 px-4 text-xs font-bold rounded-lg border text-center transition-all ${
                        feedbackType === 'experience'
                          ? 'bg-[#e8f5e9] text-emerald-800 border-emerald-300 shadow-2xs'
                          : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      🌟 Share Experience / Review / अनुभव / सुझाव
                    </button>
                  </div>
                </div>

                {/* Submitter Details Indicator */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-stone-50 p-2.5 rounded-lg border border-stone-200/60 text-xs">
                  <div className="flex items-center gap-1.5 text-stone-600 font-semibold">
                    <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                    <span>Sender: <b>{profile.name} (PF: {profile.pfNumber})</b></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-stone-600 font-semibold sm:justify-end">
                    <Mail className="w-3.5 h-3.5 text-amber-600" />
                    <span>Email: <span className="font-mono">{authUser.email || 'Guest Client'}</span></span>
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label htmlFor="feedback-title" className="block text-[11px] font-bold text-stone-700 uppercase tracking-wide mb-1">
                    Subject / Title (विषय)
                  </label>
                  <input
                    id="feedback-title"
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter short summary of issue..."
                    className="w-full text-xs px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                  />
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="feedback-details" className="block text-[11px] font-bold text-stone-700 uppercase tracking-wide mb-1">
                    Detailed Message & Relevant Rules (विस्तृत शिकायत या सलाह)
                  </label>
                  <textarea
                    id="feedback-details"
                    required
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide details about the issue context, dates, calculation discrepancies, train lists, or review..."
                    className="w-full text-xs px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                  />
                </div>

                {/* Success Banner */}
                {submitSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5 text-emerald-800 text-xs">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Sent successfully! / संदेश सफलतापूर्वक भेजा गया!</p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">Your ticket is submitted. Our developer parent will inspect the details and reply shortly.</p>
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {errorMsg && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2.5 text-red-800 text-xs text-left">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-stone-300 text-white font-bold text-xs rounded-lg transition active:scale-98 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Submitting...' : 'Submit Message / संदेश प्रेषित करें'}</span>
                </button>
              </form>
            </div>

            {/* Ticket Logs History */}
            <div className="bg-white rounded-xl border border-stone-200/60 p-5 shadow-xs">
              <h2 className="text-sm font-bold uppercase tracking-wider text-stone-800 mb-4 pb-2 border-b border-stone-100">
                📋 Your Filed Queries ({userFeedbacks.length}) / पूर्व प्रस्तुत शिकायत एवं समीक्षा
              </h2>

              {!userLoaded ? (
                <div className="text-center py-6 text-stone-400 text-xs font-bold animate-pulse">
                  Loading tickets cache...
                </div>
              ) : userFeedbacks.length === 0 ? (
                <div className="text-center py-8 text-stone-400 text-xs font-medium">
                  No submitted complains or experiences logged yet. Feel free to send one above!
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                  {userFeedbacks.map((fdb) => (
                    <div 
                      key={fdb.id} 
                      className={`p-3.5 rounded-lg border text-left transition-all relative ${
                        fdb.type === 'complaint' 
                          ? 'bg-rose-500/5 border-rose-500/15' 
                          : 'bg-emerald-500/5 border-emerald-500/15'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-black tracking-widest ${
                          fdb.type === 'complaint' 
                            ? 'bg-red-100 text-red-800 border border-red-200' 
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {fdb.type === 'complaint' ? 'COMPLAINT' : 'EXPERIENCE'}
                        </span>
                        <span className="text-[10px] text-stone-400 font-mono">
                          {new Date(fdb.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>

                      <h3 className="font-bold text-xs text-stone-800 leading-tight">{fdb.title}</h3>
                      <p className="text-xs text-stone-600 mt-1 whitespace-pre-wrap leading-relaxed">{fdb.description}</p>

                      {/* Admin Reply nested inside */}
                      {fdb.reply ? (
                        <div className="mt-3 p-2.5 bg-amber-50/50 border border-amber-500/20 rounded-md text-xs relative overflow-hidden">
                          <div className="flex items-center gap-1.5 text-amber-800 font-bold mb-1">
                            <CornerDownRight className="w-3.5 h-3.5 text-amber-600 animate-bounce" />
                            <span>Developer Parent Reply (प्रशासक का उत्तर):</span>
                          </div>
                          <p className="text-stone-700 italic pl-5 leading-normal">{fdb.reply}</p>
                          {fdb.repliedAt && (
                            <span className="absolute bottom-1 right-2 text-[8px] font-mono text-stone-400">
                              Replied: {new Date(fdb.repliedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2.5 text-[10px] font-black text-amber-700 bg-amber-500/5 border border-amber-500/10 px-2 py-1.5 rounded flex items-center gap-1.5 self-start w-fit">
                          <RefreshCw className="w-3 h-3 text-amber-600 animate-spin shrink-0" />
                          <span>Awaiting admin review & reply / समीक्षा प्रगति पर है ...</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Contact Details Panel (Right side) */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-stone-550 bg-[#1e201b] text-stone-100 rounded-xl border border-stone-800 p-5 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[#c8d4a5] mb-4 pb-2 border-b border-stone-800 flex items-center gap-1">
                <HelpCircle className="w-4 h-4 shrink-0 text-amber-500" />
                <span>OFFICIAL CONTACT / अधिकारी संपर्क</span>
              </h2>

              <p className="text-xs text-stone-300 leading-relaxed mb-6">
                If you are facing calculation blocks, missing allowance regulations, or want immediate support, you can directly reach out to our Parent Administrator.
              </p>

              <div className="space-y-4 text-xs">
                {/* Email container block */}
                <a 
                  href={`mailto:${contactConfig.email}`}
                  className="flex items-start gap-3.5 p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition group text-left"
                >
                  <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400 group-hover:scale-105 transition-all">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-[#c8d4a5] uppercase text-[10px] tracking-wider leading-none mb-1">Email Helpline</div>
                    <div className="font-mono text-stone-200 select-all font-semibold break-all text-xs">{contactConfig.email}</div>
                    <div className="text-[10px] text-stone-400 mt-1">Direct query support</div>
                  </div>
                </a>

                {/* WhatsApp call to action */}
                <a 
                  href={`https://wa.me/${contactConfig.phone.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3.5 p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition group text-left"
                >
                  <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400 group-hover:scale-105 transition-all">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-emerald-400 uppercase text-[10px] tracking-wider leading-none mb-1">WhatsApp helpline</div>
                    <div className="font-mono text-stone-200 font-bold select-all text-sm">{contactConfig.phone}</div>
                    <div className="text-[10px] text-emerald-400/90 font-bold mt-1">WhatsApp message only (!)</div>
                  </div>
                </a>
              </div>

              {/* Verified Badge */}
              <div className="mt-8 pt-4 border-t border-stone-800 text-center">
                <div className="inline-flex items-center gap-1.5 text-[10px] uppercase font-bold text-[#c8d4a5] bg-[#c8d4a5]/10 border border-[#c8d4a5]/25 px-2.5 py-1 rounded-full">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>Authenticated RPF Portal Helper</span>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-500/20 p-4 rounded-xl text-stone-750 text-xs leading-relaxed text-left">
              <h3 className="font-bold text-amber-800 flex items-center gap-1.5 mb-1 text-[11px] uppercase tracking-wider">
                <Wrench className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                Frequently asked rules
              </h3>
              <p className="text-[11px] text-stone-600 mt-1">
                Your submitted experience feed goes straight to the supervisor/parent. Active complaints or layout settings are updated live instantly during online sessions.
              </p>
            </div>
          </div>

        </div>
      )}

      {/* Admin Panel: View Feedbacks & Reply (Tab 2) */}
      {activeTab === 'admin-feedbacks' && isAdmin && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-stone-200/60 p-5 shadow-xs text-left">
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-900 mb-4 flex items-center gap-2 pb-2 border-b border-stone-100">
              <MessageSquare className="w-4 h-4 text-amber-600" />
              <span>All Logged Complaints & Experiences ({allFeedbacks.length})</span>
            </h2>

            {!adminLoaded ? (
              <div className="text-center py-6 text-stone-400 text-xs font-bold animate-pulse">
                Loading all feedback documents from Firebase...
              </div>
            ) : allFeedbacks.length === 0 ? (
              <div className="text-center py-8 text-stone-400 text-xs font-medium">
                No tickets submitted yet. All silence is golden!
              </div>
            ) : (
              <div className="space-y-4">
                {allFeedbacks.map((fdb) => (
                  <div 
                    key={fdb.id} 
                    className={`p-4 rounded-xl border relative transition-all ${
                      fdb.type === 'complaint' 
                        ? fdb.reply ? 'bg-stone-50/50 border-stone-200/80' : 'bg-red-500/5 border-red-300' 
                        : fdb.reply ? 'bg-stone-50/50 border-stone-200/80' : 'bg-green-500/5 border-emerald-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-widest ${
                          fdb.type === 'complaint' 
                            ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {fdb.type === 'complaint' ? 'COMPLAINT' : 'EXPERIENCE'}
                        </span>
                        
                        {fdb.reply ? (
                          <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-stone-200 text-stone-700">Replied</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-amber-500 text-white animate-pulse">Pending Reply</span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2.5">
                        <span className="text-[10px] text-stone-400 font-mono">
                          {new Date(fdb.createdAt).toLocaleString()}
                        </span>
                        <button
                          onClick={() => handleDeleteFeedback(fdb.id)}
                          className="p-1 text-stone-400 hover:text-red-600 rounded hover:bg-stone-100 transition"
                          title="Delete Ticket"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Submitter Details */}
                    <div className="bg-stone-100/80 p-2 rounded-lg border border-stone-200/40 text-[11px] text-stone-600 font-medium mb-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>Name: <b className="text-stone-800">{fdb.senderName}</b></div>
                      <div>PF Number: <b className="text-stone-800">{fdb.senderPfNumber}</b></div>
                      <div>Email: <span className="font-mono text-stone-800 break-all">{fdb.senderEmail}</span></div>
                    </div>

                    <h3 className="font-bold text-xs text-stone-900 leading-tight mb-1">{fdb.title}</h3>
                    <p className="text-xs text-stone-700 whitespace-pre-wrap leading-relaxed bg-white/70 p-3 rounded-lg border border-stone-200/30">{fdb.description}</p>

                    {/* Replies */}
                    {fdb.reply && (
                      <div className="mt-3 p-3 bg-amber-100/40 border border-amber-500/15 rounded-lg text-xs relative text-left">
                        <div className="font-bold text-amber-800 mb-1 flex items-center gap-1">
                          <CornerDownRight className="w-3.5 h-3.5 text-amber-600" />
                          <span>Admin Reply:</span>
                        </div>
                        <p className="text-stone-700 italic leading-normal">{fdb.reply}</p>
                        {fdb.repliedAt && (
                          <span className="absolute bottom-1 right-2 text-[8px] font-mono text-stone-450">
                            Replied: {new Date(fdb.repliedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Write/Edit Reply section */}
                    <div className="mt-3">
                      {replyingId === fdb.id ? (
                        <div className="space-y-2 mt-2">
                          <textarea
                            rows={3}
                            value={replyTextInput[fdb.id] || ''}
                            onChange={(e) => setReplyTextInput(prev => ({ ...prev, [fdb.id]: e.target.value }))}
                            placeholder="Type official reply / update status..."
                            className="w-full text-xs p-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 bg-stone-50"
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => {
                                setReplyingId(null);
                                setReplyTextInput(prev => ({ ...prev, [fdb.id]: '' }));
                              }}
                              className="px-3 py-1.5 font-bold text-[10.5px] rounded border border-stone-200 text-stone-600 bg-white hover:bg-stone-50 transition"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSendReply(fdb.id)}
                              disabled={replyLoading || !(replyTextInput[fdb.id] || '').trim()}
                              className="px-3.5 py-1.5 font-extrabold text-[10.5px] rounded bg-amber-600 text-white hover:bg-amber-700 disabled:bg-stone-300 transition shadow-xs"
                            >
                              {replyLoading ? 'Saving...' : 'Post Reply'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setReplyingId(fdb.id);
                            setReplyTextInput(prev => ({ ...prev, [fdb.id]: fdb.reply || '' }));
                          }}
                          className="mt-2 inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-700 hover:text-amber-800 bg-amber-550 bg-amber-50 border border-amber-500/15 px-3 py-1 rounded transition"
                        >
                          {fdb.reply ? '✍️ Edit Reply / उत्तर बदलें' : '✉️ Reply / उत्तर प्रेषित करें'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin Panel: Contact Configurations (Tab 3) */}
      {activeTab === 'admin-settings' && isAdmin && (
        <div className="max-w-xl mx-auto w-full">
          <div className="bg-white rounded-xl border border-stone-200/60 p-5 sm:p-6 shadow-xs text-left">
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-900 mb-4 pb-2 border-b border-stone-100 flex items-center gap-2">
              <Settings className="w-4 h-4 text-amber-600" />
              <span>Update App Contact Details (संपर्क बदले)</span>
            </h2>
            
            <p className="text-xs text-stone-500 leading-normal mb-5 bg-amber-50/50 p-2.5 rounded-lg border border-amber-500/10">
              Only you (parent developer logged in as <b className="font-mono text-amber-800">nitesh0724@gmail.com</b>) can modify these values. Any updates here alter the support cards in real-time across all user dashboards instantly!
            </p>

            <form onSubmit={handleSaveContactConfig} className="space-y-4">
              {/* Email Input */}
              <div>
                <label htmlFor="settings-email" className="block text-[11px] font-bold text-stone-700 uppercase tracking-wide mb-1">
                  Support Email Address
                </label>
                <input
                  id="settings-email"
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="e.g. nitesh0724@gmail.com"
                  className="w-full text-xs px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 bg-stone-50/50 font-mono"
                />
              </div>

              {/* Whatsapp Phone Input */}
              <div>
                <label htmlFor="settings-phone" className="block text-[11px] font-bold text-stone-700 uppercase tracking-wide mb-1">
                  WhatsApp Helpline Number
                </label>
                <input
                  id="settings-phone"
                  type="text"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="e.g. 7250322223"
                  className="w-full text-xs px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 bg-stone-50/50 font-mono"
                />
                <span className="text-[10px] text-stone-400 mt-1 block">Specify raw number or with country code, styled for simple display.</span>
              </div>

              {settingsSavedSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 font-bold text-xs flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Settings updated successfully! Details updated live.</span>
                </div>
              )}

              <button
                type="submit"
                disabled={savingSettings}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-stone-300 text-white font-bold text-xs rounded-lg transition active:scale-98 shadow-xs"
              >
                {savingSettings ? 'Saving Configuration...' : 'Save Config Details'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Simple Rotating status block spinner */}
      {!isAdmin && (
        <div className="mt-8 text-[11px] text-stone-400 bg-stone-100 p-2.5 rounded-lg text-center flex items-center justify-center gap-2.5 max-w-sm mx-auto select-none border border-stone-200/30">
          <span>Your submitted logs are private, secured & verified.</span>
        </div>
      )}
    </div>
  );
};
