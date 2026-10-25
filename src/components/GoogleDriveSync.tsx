import React, { useState, useEffect } from 'react';
import { 
  connectGoogleDrive, 
  isDriveConnected, 
  getCachedDriveToken, 
  clearDriveToken,
  listDriveJournals, 
  uploadFileToDrive, 
  downloadDriveFileText, 
  deleteDriveFile, 
  DriveFileItem 
} from '../services/googleDrive';
import { TAJournal, OfficerProfile } from '../types';
import { 
  Cloud, 
  Upload, 
  Download, 
  Trash2, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  FolderCheck, 
  FileText, 
  FileSpreadsheet, 
  ShieldCheck,
  Lock,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface GoogleDriveSyncProps {
  journals: TAJournal[];
  activeProfile: OfficerProfile | null;
  onRestoreJournal?: (journal: TAJournal) => void;
  onRestoreAllBackup?: (journals: TAJournal[]) => void;
}

export default function GoogleDriveSync({
  journals,
  activeProfile,
  onRestoreJournal,
  onRestoreAllBackup
}: GoogleDriveSyncProps) {
  const [isConnected, setIsConnected] = useState<boolean>(isDriveConnected());
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  
  // Confirmation Modal for Destructive Delete Operation (Mandatory by Skill)
  const [fileToDelete, setFileToDelete] = useState<DriveFileItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  useEffect(() => {
    setIsConnected(isDriveConnected());
    if (isDriveConnected()) {
      fetchDriveFiles();
    }
  }, []);

  const fetchDriveFiles = async () => {
    const token = getCachedDriveToken();
    if (!token) {
      setIsConnected(false);
      return;
    }
    setLoadingFiles(true);
    setError(null);
    try {
      const files = await listDriveJournals(token);
      setDriveFiles(files);
    } catch (err: any) {
      console.error('Error fetching Drive files:', err);
      const msg = err.message || '';
      if (msg.includes('401') || msg.includes('403') || msg.includes('insufficient') || msg.includes('expired')) {
        clearDriveToken();
        setIsConnected(false);
        setError('Google Drive अनुमति अधूरी है या सत्र समाप्त हो गया है। कृपया दोबारा "Connect Google Drive" पर क्लिक करें और अनुमति चेकबॉक्स (Drive access checkbox) को अवश्य चुनें।');
      } else {
        setError(msg || 'Failed to list files from Google Drive.');
      }
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const result = await connectGoogleDrive();
      setIsConnected(true);
      setSuccessMsg(`Google Drive connected successfully as ${result.user.email || 'Authorized User'}!`);
      await fetchDriveFiles();
    } catch (err: any) {
      console.error('Drive connection error:', err);
      setError(err.message || 'Failed to connect Google Drive.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    clearDriveToken();
    setIsConnected(false);
    setDriveFiles([]);
    setSuccessMsg('Google Drive disconnected.');
  };

  // Upload Complete JSON Backup to Google Drive
  const handleBackupAllToDrive = async () => {
    const token = getCachedDriveToken();
    if (!token) {
      setError('Please connect Google Drive first.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = now.toTimeString().slice(0, 5).replace(':', '-');
      const staffName = activeProfile?.name ? activeProfile.name.replace(/[^a-zA-Z0-9]/g, '_') : 'RPF_Staff';
      const fileName = `RPF_TA_Backup_${staffName}_${dateStr}_${timeStr}.json`;

      const backupPayload = {
        app: 'RPF TA Companion',
        version: '1.0',
        exportedAt: now.toISOString(),
        profile: activeProfile,
        journalsCount: journals.length,
        journals: journals
      };

      await uploadFileToDrive(
        token,
        fileName,
        JSON.stringify(backupPayload, null, 2),
        'application/json'
      );

      setSuccessMsg(`Successfully backed up ${journals.length} journal(s) to "RPF TA Journals" folder on Google Drive!`);
      await fetchDriveFiles();
    } catch (err: any) {
      console.error('Backup upload error:', err);
      setError(err.message || 'Failed to backup journals to Google Drive.');
    } finally {
      setLoading(false);
    }
  };

  // Upload an individual journal to Drive
  const handleUploadSingleJournal = async (journal: TAJournal) => {
    const token = getCachedDriveToken();
    if (!token) return;

    setLoading(true);
    setError(null);
    try {
      const safeMonth = journal.monthClaimed || 'Unknown_Month';
      const fileName = `TA_Journal_${safeMonth}_${journal.id.slice(-6)}.json`;
      
      const payload = {
        app: 'RPF TA Companion',
        exportedAt: new Date().toISOString(),
        profile: activeProfile,
        journal: journal
      };

      await uploadFileToDrive(
        token,
        fileName,
        JSON.stringify(payload, null, 2),
        'application/json'
      );

      setSuccessMsg(`Uploaded Journal for ${journal.monthClaimed} to Google Drive!`);
      await fetchDriveFiles();
    } catch (err: any) {
      setError(err.message || 'Failed to upload journal.');
    } finally {
      setLoading(false);
    }
  };

  // Restore file content from Drive
  const handleRestoreFile = async (file: DriveFileItem) => {
    const token = getCachedDriveToken();
    if (!token) return;

    if (!window.confirm(`Do you want to restore and import "${file.name}" into your local journal records?`)) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const text = await downloadDriveFileText(token, file.id);
      const parsed = JSON.parse(text);

      if (parsed.journals && Array.isArray(parsed.journals) && onRestoreAllBackup) {
        onRestoreAllBackup(parsed.journals);
        setSuccessMsg(`Restored ${parsed.journals.length} journal(s) from "${file.name}"!`);
      } else if (parsed.journal && onRestoreJournal) {
        onRestoreJournal(parsed.journal);
        setSuccessMsg(`Restored journal for month ${parsed.journal.monthClaimed} successfully!`);
      } else {
        setError('The file format could not be recognized as a valid RPF TA backup.');
      }
    } catch (err: any) {
      setError(`Failed to read/restore file: ${err.message || 'Invalid format'}`);
    } finally {
      setLoading(false);
    }
  };

  // Execute deletion after explicit user confirmation
  const executeDeleteFile = async () => {
    if (!fileToDelete) return;
    const token = getCachedDriveToken();
    if (!token) return;

    setIsDeleting(true);
    setError(null);
    try {
      await deleteDriveFile(token, fileToDelete.id, fileToDelete.name, true);
      setSuccessMsg(`Permanently removed "${fileToDelete.name}" from Google Drive.`);
      setFileToDelete(null);
      await fetchDriveFiles();
    } catch (err: any) {
      setError(err.message || 'Failed to delete file from Google Drive.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-200/80 shadow-xs p-6 space-y-6">
      
      {/* Header with Google Drive Branding */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center p-2.5 shrink-0 shadow-xs">
            <svg viewBox="0 0 87.3 78" className="w-full h-full">
              <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
              <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
              <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
              <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
              <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
              <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-black text-stone-900 tracking-tight flex items-center gap-2">
              <span>Google Drive Cloud Storage</span>
              {isConnected && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Connected
                </span>
              )}
            </h2>
            <p className="text-xs text-stone-500 font-medium mt-0.5">
              Securely archive, synchronize, and restore official TA Journals in your personal Google Drive account.
            </p>
          </div>
        </div>

        {/* Connect / Disconnect Buttons */}
        <div>
          {!isConnected ? (
            <button
              type="button"
              onClick={handleConnect}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-60"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Cloud className="w-4 h-4" />
              )}
              <span>Connect Google Drive / गूगल ड्राइव जोड़ें</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchDriveFiles}
                disabled={loadingFiles}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-bold transition cursor-pointer"
                title="Refresh Google Drive files"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition cursor-pointer border border-rose-200"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Alert Notices */}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2 font-medium">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Content Area when Connected */}
      {isConnected ? (
        <div className="space-y-6">
          
          {/* Action Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Quick 1-Click Backup Card */}
            <div className="p-4 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-blue-900 font-extrabold text-sm mb-1">
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span>1-Click Cloud Backup to Drive</span>
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Backs up all <strong>{journals.length}</strong> journal(s) & officer profile directly into an auto-created <strong>"RPF TA Journals"</strong> folder in your Google Drive.
                </p>
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleBackupAllToDrive}
                  disabled={loading || journals.length === 0}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>Save Full Backup to Drive ({journals.length} Journals)</span>
                </button>
              </div>
            </div>

            {/* Folder Destination Info */}
            <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-stone-900 font-extrabold text-sm mb-1">
                  <FolderCheck className="w-4 h-4 text-emerald-600" />
                  <span>Auto-Synced Folder: "RPF TA Journals"</span>
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  All PDF downloads and JSON backups are organized under the <strong>RPF TA Journals</strong> folder on your Google Drive. You can access them from any computer or mobile phone.
                </p>
              </div>

              <div className="pt-4 flex items-center justify-between text-[11px] text-stone-500 font-mono">
                <span>Drive Status: Active</span>
                <a
                  href="https://drive.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline font-bold"
                >
                  <span>Open drive.google.com</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

          </div>

          {/* Files Listed in Google Drive Folder */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-stone-900 uppercase tracking-wide flex items-center gap-2">
                <span>Files in your "RPF TA Journals" Drive Folder</span>
                <span className="text-xs font-mono font-bold bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full">
                  {driveFiles.length}
                </span>
              </h3>
            </div>

            {loadingFiles ? (
              <div className="flex flex-col items-center justify-center p-8 bg-stone-50 rounded-xl border border-dashed border-stone-200">
                <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mb-2" />
                <p className="text-xs text-stone-500 font-medium">Fetching files from Google Drive...</p>
              </div>
            ) : driveFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 bg-stone-50 rounded-xl border border-dashed border-stone-200 text-center">
                <FileText className="w-8 h-8 text-stone-400 mb-2" />
                <p className="text-xs text-stone-600 font-bold">No journals or backups uploaded to Drive yet.</p>
                <p className="text-[11px] text-stone-500 mt-0.5">Click "Save Full Backup to Drive" above to create your first cloud archive.</p>
              </div>
            ) : (
              <div className="border border-stone-200 rounded-xl overflow-hidden divide-y divide-stone-100">
                {driveFiles.map((file) => {
                  const isJson = file.name.endsWith('.json') || file.mimeType.includes('json');
                  const isPdf = file.name.endsWith('.pdf') || file.mimeType.includes('pdf');
                  
                  return (
                    <div 
                      key={file.id}
                      className="p-3.5 hover:bg-stone-50/80 transition flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isPdf ? 'bg-red-50 text-red-600' : (isJson ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600')
                        }`}>
                          {isPdf ? <FileText className="w-4 h-4" /> : <FileSpreadsheet className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-stone-900 truncate" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-[10px] text-stone-500 font-mono mt-0.5">
                            Modified: {new Date(file.modifiedTime).toLocaleDateString('en-GB')} {new Date(file.modifiedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>

                      {/* File Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-stone-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="View in Google Drive"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}

                        {isJson && (
                          <button
                            type="button"
                            onClick={() => handleRestoreFile(file)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-bold border border-emerald-200 transition cursor-pointer"
                            title="Restore this backup into the app"
                          >
                            <Download className="w-3 h-3 text-emerald-600" />
                            <span>Restore</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setFileToDelete(file)}
                          className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Delete from Google Drive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      ) : (
        /* Not Connected Explanatory Banner */
        <div className="bg-stone-50 rounded-xl p-6 border border-stone-200 text-center space-y-4">
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-sm font-black text-stone-900">अपने Google Drive को RPF TA Companion से जोड़ें</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Google Drive कनेक्ट करने के बाद आप अपने सभी यात्रा दावों (TA Journals) और ऑफिशियल PDF प्रतियों को सुरक्षित रूप से अपने ड्राइव पर बैकअप ले सकते हैं और किसी भी समय रीस्टोर कर सकते हैं।
            </p>
          </div>
          <button
            type="button"
            onClick={handleConnect}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
            <span>Sign in & Authorize Google Drive</span>
          </button>
        </div>
      )}

      {/* --- Mandatory User Confirmation Dialog Before Permanent Drive File Deletion --- */}
      <AnimatePresence>
        {fileToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-stone-200 space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>

              <div className="text-center space-y-1">
                <h4 className="font-extrabold text-base text-stone-900">Delete File from Google Drive?</h4>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Are you sure you want to permanently delete <strong className="text-stone-900 block truncate my-1">"{fileToDelete.name}"</strong> from your Google Drive? This action cannot be undone.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFileToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 py-2 px-3 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeDeleteFile}
                  disabled={isDeleting}
                  className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>Confirm Delete</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
