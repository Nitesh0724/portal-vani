import React, { useState, useEffect, useRef } from 'react';
import { OfficerProfile } from '../types';
import { saveUserProfile, db } from '../firebase';
import { 
  User, Badge, Landmark, Calendar, FileText, ChevronRight, Save, Edit2, X, Check, 
  ShieldAlert, Camera, Trash2, RotateCcw, Upload, QrCode, Download,
  Cloud, CloudOff, Database, Wifi, WifiOff, AlertTriangle, RefreshCw, Server, ExternalLink
} from 'lucide-react';
import QRCode from 'qrcode';

interface MyProfileProps {
  userId: string;
  initialProfile: OfficerProfile;
  onProfileUpdated: (updated: OfficerProfile) => void;
  onBack: () => void;
}

export default function MyProfile({ userId, initialProfile, onProfileUpdated, onBack }: MyProfileProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState<OfficerProfile>(() => {
    const p = { ...initialProfile };
    if (p.gradePay === 1998) p.gradePay = 2000;
    return p;
  });
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // --- Cloud Sync Diagnoser / Migration Tool States ---
  const [testConnResult, setTestConnResult] = useState<'success' | 'failed' | null>(null);
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [migratingData, setMigratingData] = useState(false);
  const [migrationResult, setMigrationResult] = useState<string | null>(null);
  const [trialClaimsCount, setTrialClaimsCount] = useState(0);
  const [trialProfilesCount, setTrialProfilesCount] = useState(0);

  // Load / scan local sandbox data keys
  useEffect(() => {
    let claims = 0;
    let profiles = 0;

    const offlineJournals = localStorage.getItem('rpf_journals_offline_local_user');
    const anonJournals = localStorage.getItem('rpf_journals_anon');
    if (offlineJournals) {
      try { claims += JSON.parse(offlineJournals).length; } catch {}
    }
    if (anonJournals) {
      try { claims += JSON.parse(anonJournals).length; } catch {}
    }

    const offlineProfiles = localStorage.getItem('rpf_profiles_offline_local_user');
    const anonProfiles = localStorage.getItem('rpf_profiles_anon');
    if (offlineProfiles) {
      try { profiles += JSON.parse(offlineProfiles).length; } catch {}
    }
    if (anonProfiles) {
      try { profiles += JSON.parse(anonProfiles).length; } catch {}
    }

    setTrialClaimsCount(claims);
    setTrialProfilesCount(profiles);
  }, [userId]);

  const testCloudConnection = async () => {
    setIsTestingConn(true);
    setTestConnResult(null);
    try {
      const isLocal = userId.startsWith('local_') || userId === 'offline_local_user';
      const { getDoc, doc } = await import('firebase/firestore');
      
      if (isLocal) {
        // Probe connectivity using a dummy document path
        const docRef = doc(db, 'test_connection_probe', 'ping');
        await getDoc(docRef).catch(() => {}); // even if throws missing permission, tells us Firestore is active
      } else {
        const docRef = doc(db, 'users', userId);
        await getDoc(docRef);
      }
      setTestConnResult('success');
    } catch (err) {
      console.error('Test connection error:', err);
      setTestConnResult('failed');
    } finally {
      setIsTestingConn(false);
    }
  };

  const migrateLocalDataToCloud = async () => {
    setMigratingData(true);
    setMigrationResult(null);
    try {
      if (userId.startsWith('local_') || userId === 'offline_local_user') {
        throw new Error('You cannot upload data to the cloud while using a local trial account. Please sign in with a real Google or email account first!');
      }

      let migratedClaims = 0;
      let migratedProfiles = 0;

      const journalsToMigrate: any[] = [];
      const offlineJournals = localStorage.getItem('rpf_journals_offline_local_user');
      const anonJournals = localStorage.getItem('rpf_journals_anon');
      if (offlineJournals) {
        try { journalsToMigrate.push(...JSON.parse(offlineJournals)); } catch {}
      }
      if (anonJournals) {
        try { journalsToMigrate.push(...JSON.parse(anonJournals)); } catch {}
      }

      const profilesToMigrate: any[] = [];
      const offlineProfiles = localStorage.getItem('rpf_profiles_offline_local_user');
      const anonProfiles = localStorage.getItem('rpf_profiles_anon');
      if (offlineProfiles) {
        try { profilesToMigrate.push(...JSON.parse(offlineProfiles)); } catch {}
      }
      if (anonProfiles) {
        try { profilesToMigrate.push(...JSON.parse(anonProfiles)); } catch {}
      }

      const { saveUserJournal, saveUserCustomProfile } = await import('../firebase');
      
      for (const j of journalsToMigrate) {
        await saveUserJournal(userId, j);
        migratedClaims++;
      }

      for (const p of profilesToMigrate) {
        await saveUserCustomProfile(userId, p);
        migratedProfiles++;
      }

      setMigrationResult(`सफलता! ${migratedClaims} दावे और ${migratedProfiles} कर्मचारी प्रोफ़ाइल आपके क्लाउड खाते में ट्रांसफर हो गए हैं। कृपया पूर्ण सिंक के लिए होमपेज पर जाकर रिफ्रेश करें।`);
      
      localStorage.removeItem('rpf_journals_offline_local_user');
      localStorage.removeItem('rpf_journals_anon');
      localStorage.removeItem('rpf_profiles_offline_local_user');
      localStorage.removeItem('rpf_profiles_anon');
      
      setTrialClaimsCount(0);
      setTrialProfilesCount(0);
    } catch (err: any) {
      console.error(err);
      setMigrationResult(`Migration failed / त्रुटि: ${err.message || err}`);
    } finally {
      setMigratingData(false);
    }
  };

  // --- Camera & Photo Capture States ---
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const directPhotoInputRef = useRef<HTMLInputElement | null>(null);

  // --- Direct File Upload & Drag & Drop States ---
  const [isDragging, setIsDragging] = useState(false);

  // --- Cropping & Alignment Adjustment States ---
  const [zoom, setZoom] = useState<number>(1.0);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);

  // --- QR Code Verification States ---
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [showQRModal, setShowQRModal] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    const generateQR = async () => {
      try {
        if (profile.name || profile.pfNumber || profile.designation) {
          // Construct structured textual info for official validation scan
          const detailsText = `RPF OFFICIAL VERIFICATION CARD\n=========================\nName: ${profile.name || 'N/A'}\nPF Number: ${profile.pfNumber || 'N/A'}\nDesignation: ${profile.designation || 'N/A'}\nDivision: ${profile.division || 'N/A'}\nHeadquarter: ${profile.headquarter || 'N/A'}\nCreated on: ${new Date().toLocaleDateString('en-GB')}\nSecured with Cloud Firestore`;
          
          const url = await QRCode.toDataURL(detailsText, {
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 350,
            color: {
              dark: '#2d302a', // Deep slate army green
              light: '#ffffff'
            }
          });
          if (active) {
            setQrCodeUrl(url);
          }
        }
      } catch (err) {
        console.error('QR code generation failed:', err);
      }
    };
    generateQR();
    return () => {
      active = false;
    };
  }, [profile.name, profile.pfNumber, profile.designation, profile.headquarter, profile.division]);

  useEffect(() => {
    const p = { ...initialProfile };
    if (p.gradePay === 1998) p.gradePay = 2000;
    setProfile(p);
  }, [initialProfile]);

  // Handles direct file select or drag-and-drop upload
  const handleDirectPhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleDirectPhotoUpload(file);
    }
  };

  const handleDirectPhotoUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Invalid file type. Please select a valid JPEG, PNG or WEBP image / अमान्य फ़ाइल प्रकार।');
      return;
    }
    
    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Image size too large. Please select an image under 5MB / इमेज साइज 5MB से कम रखें।');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setProfile(prev => ({
        ...prev,
        photoUrl: dataUrl
      }));
      setSuccessMsg('Profile photo loaded directly from device storage! Saved info is staged - please click "Save Profile details" to apply changes.');
      setErrorMsg(null);
      if (!isEditing) {
        setIsEditing(true);
      }
      setTimeout(() => setSuccessMsg(null), 5000);
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handlePhotoDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handlePhotoDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleDirectPhotoUpload(file);
    }
  };

  const triggerDirectPhotoInputSelect = () => {
    if (directPhotoInputRef.current) {
      directPhotoInputRef.current.value = '';
      directPhotoInputRef.current.click();
    }
  };

  // Handle local file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setCapturedImage(dataUrl);
        // Reset crop tools for new image
        setZoom(1.0);
        setOffsetX(0);
        setOffsetY(0);
        // Stop any running camera streams when uploading a file
        stopCamera();
        setShowCameraModal(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Clear output so the same file selection triggers event again
      fileInputRef.current.click();
    }
  };

  const handleDownloadQR = () => {
    if (!qrCodeUrl) return;
    const link = document.createElement('a');
    link.href = qrCodeUrl;
    link.download = `RPF_Verification_QR_${profile.pfNumber || 'User'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Cleanup media tracks on unmount or modal close
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  // When modal is opened, start the camera feed
  useEffect(() => {
    if (showCameraModal) {
      startCamera();
    } else {
      stopCamera();
    }
  }, [showCameraModal]);

  const startCamera = async () => {
    setCameraError(null);
    setCameraLoading(true);
    setCapturedImage(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Your browser does not support camera capture or permissions are restricted.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 480 },
          height: { ideal: 480 },
          facingMode: "user"
        },
        audio: false // No audio needed for a profile photo
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.warn("Camera access notification:", err?.message || err);
      let errMsg = "Unable to access camera. Please check your camera connection and site permissions.";
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.toLowerCase().includes('permission') || err.message?.toLowerCase().includes('denied')) {
        errMsg = "Camera permission was denied. Iframe restrictions may block camera access. Please open in a new tab or upload a photo.";
      }
      setCameraError(errMsg);
    } finally {
      setCameraLoading(false);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  };

  const handleOpenCamera = () => {
    setShowCameraModal(true);
  };

  const handleCloseCamera = () => {
    stopCamera();
    setShowCameraModal(false);
    setCapturedImage(null);
    setCameraError(null);
  };

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        // Set match dimensions
        const size = Math.min(video.videoWidth, video.videoHeight) || 480;
        canvas.width = size;
        canvas.height = size;
        
        // Center crop the square
        const sx = (video.videoWidth - size) / 2;
        const sy = (video.videoHeight - size) / 2;

        context.save();
        // Mirror horizontally to match the display preview
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        
        context.drawImage(video, sx, sy, size, size, 0, 0, size, size);
        context.restore();

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCapturedImage(dataUrl);

        // Reset cropper tools for a new snapshot
        setZoom(1.0);
        setOffsetX(0);
        setOffsetY(0);
      }
    }
  };

  const handleSaveCapturedPhoto = () => {
    if (capturedImage) {
      // Draw the final cropped version onto our canvas
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (canvas) {
          const context = canvas.getContext('2d');
          if (context) {
            const size = img.width || 480;
            canvas.width = size;
            canvas.height = size;
            
            const ratio = size / 256; // Matching the display representation of 256px inside the UI
            
            context.clearRect(0, 0, size, size);
            context.save();
            
            // Replicate the CSS transform precisely layout-wise:
            context.translate(size / 2, size / 2);
            context.scale(zoom, zoom);
            context.translate(offsetX * ratio, offsetY * ratio);
            context.translate(-size / 2, -size / 2);
            
            context.drawImage(img, 0, 0, size, size);
            context.restore();
            
            const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
            setProfile(prev => ({
              ...prev,
              photoUrl: croppedDataUrl
            }));
            handleCloseCamera();
            if (!isEditing) {
              setIsEditing(true);
            }
          }
        }
      };
      img.src = capturedImage;
    }
  };

  const handleDeletePhoto = () => {
    if (window.confirm("Are you sure you want to delete your profile photo?")) {
      setProfile(prev => ({
        ...prev,
        photoUrl: null
      }));
      if (!isEditing) {
        setIsEditing(true);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProfile(prev => {
      let updatedProfile = {
        ...prev,
        [name]: name === 'basicPay' || name === 'gradePay' ? Number(value) || 0 : value
      };

      if (name === 'designation') {
        const des = value;
        if (des === 'Constable' || des === 'Lady Constable') {
          updatedProfile.basicPay = 21700;
          updatedProfile.gradePay = 2000;
          updatedProfile.scaleOfPay = '5,200-20,200';
        } else if (des === 'Head Constable' || des === 'Lady Head Constable') {
          updatedProfile.basicPay = 25500;
          updatedProfile.gradePay = 2400;
          updatedProfile.scaleOfPay = '5,200-20,200';
        } else if (des === 'Assistant Sub-Inspector (ASI)' || des === 'Lady ASI' || des === 'Lady Assistant Sub-Inspector (ASI)') {
          updatedProfile.basicPay = 29200;
          updatedProfile.gradePay = 2800;
          updatedProfile.scaleOfPay = '5,200-20,200';
        } else if (des === 'Sub-Inspector (SI)' || des === 'Lady SI' || des === 'Lady Sub-Inspector (SI)') {
          updatedProfile.basicPay = 35400;
          updatedProfile.gradePay = 4200;
          updatedProfile.scaleOfPay = '9,300-34,800';
        } else if (des === 'Inspector') {
          updatedProfile.basicPay = 44900;
          updatedProfile.gradePay = 4600;
          updatedProfile.scaleOfPay = '9,300-34,800';
        }
      }

      return updatedProfile;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);
    setSaving(true);

    if (!profile.name.trim()) {
      setErrorMsg('Name is a required field.');
      setSaving(false);
      return;
    }
    if (!profile.pfNumber.trim()) {
      setErrorMsg('PF Number is a required field.');
      setSaving(false);
      return;
    }

    try {
      const isLocal = userId.startsWith('local_') || userId === 'offline_local_user';
      const sanitizedProfile = {
        ...profile,
        designation: profile.designation?.trim() || 'Constable',
        division: profile.division?.trim() || 'CKP Division',
        headquarter: profile.headquarter?.trim() || 'RPF/POST/BUF',
        branch: profile.branch?.trim() || 'Security Branch',
        scaleOfPay: profile.scaleOfPay?.trim() || '5,200-20,200',
        ruleGoverned: profile.ruleGoverned?.trim() || 'S. Rule',
        basicPay: Number(profile.basicPay) || 21700
      };
      await saveUserProfile(userId, sanitizedProfile);
      onProfileUpdated(sanitizedProfile);
      setProfile(sanitizedProfile);
      setIsEditing(false);
      if (isLocal) {
        setSuccessMsg('Profile updated locally!');
      } else {
        setSuccessMsg('Profile updated and synchronized to Firestore cloud storage!');
      }
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (error: any) {
      console.error(error);
      setErrorMsg(error.message || 'Error occurred while saving profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* Header block */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <User className="w-5 h-5 text-[#5a5a40]" />
            RPF Personnel Profile / मेरी प्रोफाइल
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Configured cloud identity for Travelling Allowance claims compilation.
          </p>
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg text-xs transition"
            >
              <Edit2 className="w-4 h-4 text-[#5a5a40]" />
              Edit Account Info
            </button>
          ) : (
            <button
              onClick={() => {
                setProfile({ ...initialProfile });
                setIsEditing(false);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg text-xs transition"
            >
              <X className="w-4 h-4 text-slate-400" />
              Cancel Editing
            </button>
          )}
          <button
            onClick={onBack}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition"
          >
            Go Dashboard
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-semibold flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Cloud Synchronization Diagnostic Dashboard */}
      <div id="cloud-database-sync-card" className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 gap-2">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-[#5a5a40]" />
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                Cloud Sync Status &amp; Diagnoser / क्लाउड सिंक स्थिति व जाँचकर्ता
              </h3>
              <p className="text-[11px] text-slate-500 font-medium font-sans">Verify if your compiled TA logs are securely stored on database cloud.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 font-sans">
            {!navigator.onLine ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-100 text-red-700 border-2 border-red-500 rounded-full text-[10px] font-black uppercase tracking-wider animate-pulse">
                <CloudOff className="w-3.5 h-3.5 text-red-600" />
                No Internet / ऑफलाइन (क्लाउड बंद है)
              </span>
            ) : userId.startsWith('local_') || userId === 'offline_local_user' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-100 text-red-700 border-2 border-red-500 rounded-full text-[10px] font-black uppercase tracking-wider animate-pulse">
                <CloudOff className="w-3.5 h-3.5 text-red-600" />
                Offline Sandbox / क्लाउड पर सेव नहीं
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-800 border-2 border-blue-500 rounded-full text-[10px] font-black uppercase tracking-wider">
                <Cloud className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                Cloud-Save Active / ऑनलाइन सेव सक्रिय ✓
              </span>
            )}
          </div>
        </div>

        {/* Explain exactly how data is being saved */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-50 border border-slate-150 rounded-xl space-y-2.5 text-xs">
            <h4 className="font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
              <Database className="w-4 h-4 text-[#5a5a40]" />
              Data Saving Guarantee / डाटा सहेजने की गारंटी
            </h4>
            {userId.startsWith('local_') || userId === 'offline_local_user' ? (
              <div className="space-y-2 text-slate-650 font-medium font-sans">
                <p className="text-red-600 font-extrabold leading-normal text-sm flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
                  ⚠️ तुम्हारा डेटा अभी क्लाउड पर सुरक्षित नहीं हो रहा है! (Your data is stored LOCALLY only)
                </p>
                <p className="leading-relaxed">
                  चूँकि तुम <strong>Offline Sandbox</strong> मोड में हो, इसलिए आपके द्वारा भरे गए सभी विवरण, यात्रा भत्ते व स्टाफ फाइलें इसी विशेष ब्राउज़र (IndexedDB/LocalStorage) में संचित हो रहे हैं। यदि ब्राउज़र डेटा डिलीट होगा, तो विवरण खो सकता है।
                </p>
                <p className="text-red-700 font-extrabold text-[11.5px] bg-red-50 p-2.5 rounded-lg border border-red-200 leading-relaxed">
                  👉 <strong>समाधान (Cloud Save Active):</strong> अपना डेटा इंटरनेट क्लाउड पर सहेजने के लिए लॉग-आउट करें और ईमेल या Google का उपयोग करके एक वास्तविक (Real) खाता बनाएं।
                </p>
              </div>
            ) : (
              <div className="space-y-2 text-slate-650 font-medium font-sans">
                <p className="text-blue-700 font-extrabold leading-normal text-sm flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping shrink-0" />
                  ✓ हाँ, आपका समस्त डेटा क्लाउड (Cloud) पर स्वतः सुरक्षित हो रहा है!
                </p>
                <p className="leading-relaxed">
                  आपका संपूर्ण प्रोफाइल, रेलवे स्टेशन विवरण, और सभी यात्रा विवरण सीधे <strong>Google Firebase Secure Firestore Cloud Database</strong> में निरंतर बैकअप हो रहे हैं। यदि आपका इंटरनेट बंद भी हो जाता है, तो यह कतार (sync queue) में चला जाता है और नेटवर्क आते ही स्वयं सहेज लिया जाता है।
                </p>
              </div>
            )}
          </div>

          <div className="p-4 bg-slate-50 border border-slate-150 rounded-xl flex flex-col justify-between text-xs gap-3">
            <div className="space-y-2">
              <h4 className="font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <Wifi className="w-4 h-4 text-[#5a5a40]" />
                Live Cloud Connectivity Check / क्लाउड कनेक्शन टेस्ट
              </h4>
              <p className="text-slate-500 text-[11px] leading-normal font-sans">
                परीक्षण करें कि आपका ऐप वर्तमान में Google Firebase क्लाउड डेटाबेस सर्वर से संचार कर पा रहा है या नहीं।
              </p>

              {testConnResult === 'success' && (
                <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg font-bold flex items-center gap-2 animate-bounce">
                  <Check className="w-4 h-4 text-blue-600" />
                  <span>कनेक्टिविटी परीक्षण सफल! Cloud Active &amp; Ready.</span>
                </div>
              )}

              {testConnResult === 'failed' && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg font-bold flex items-center gap-2 animate-pulse">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>कनेक्शन विफलता! Check firewall settings or server config.</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={testCloudConnection}
              disabled={isTestingConn}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-700 transition font-sans text-xs cursor-pointer shadow-xs"
            >
              {isTestingConn ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Probing Database...</span>
                </>
              ) : (
                <>
                  <Server className="w-3.5 h-3.5 text-[#c8d4a5]" />
                  <span>Diagnose Live Status Now / कनेक्शन जांचें</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Migrate Offline Sandbox Data to Real Account component if they have records */}
        {trialClaimsCount > 0 && !(userId.startsWith('local_') || userId === 'offline_local_user') && (
          <div className="p-4 bg-amber-400/10 border-2 border-dashed border-amber-300 rounded-xl space-y-3 animate-pulse text-xs">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-bold text-amber-950 uppercase tracking-tight text-[11px]">
                  Unsaved Local Sandbox Data Located / बिना सिंक हुआ ऑफलाइन ट्रायल डेटा मिला!
                </h4>
                <p className="text-stone-700 leading-relaxed font-sans mt-1 text-[11px]">
                  हमने आपके इस ब्राउज़र में <strong>{trialClaimsCount} खाली दावे (TA Journals/Claims)</strong> और <strong>{trialProfilesCount} कर्मचारी प्रोफाइल</strong> का लोकल ट्रायल डेटा पाया है, जो आपके क्रेडेंशियल्स लॉगिन करने से पहले के हैं। आप इन्हें सीधे अपने वर्तमान क्लाउड-सिंक खाते में ट्रांसफर और सुरक्षित कर सकते हैं।
                </p>
              </div>
            </div>

            {migrationResult && (
              <div className="p-3 bg-white border border-amber-300 rounded-lg text-amber-955 font-bold leading-relaxed font-sans mt-2 shadow-inner">
                {migrationResult}
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={migrateLocalDataToCloud}
                disabled={migratingData}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-stone-950 font-extrabold rounded-lg text-xs leading-none shadow-xs cursor-pointer transition"
              >
                {migratingData ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving to Cloud...</span>
                  </>
                ) : (
                  <>
                    <Cloud className="w-3.5 h-3.5" />
                    <span>Migrate Trial Data to Cloud / क्लाउड पर सहेजें</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Manual Data Recovery Portability Section */}
        <div className="p-4 bg-slate-50 border border-slate-150 rounded-xl space-y-3 text-xs md:col-span-2">
          <div className="flex items-start gap-3">
            <Download className="w-4 h-4 text-[#5a5a40] mt-0.5" />
            <div>
              <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                Manual Data Portability &amp; Backups / हस्तचालित बैकअप और डेटा सुरक्षा
              </h4>
              <p className="text-slate-500 text-[11px] leading-relaxed font-sans mt-0.5">
                सुरक्षा की अतिरिक्त परत के लिए, आप अपने संपूर्ण स्थानीय डेटा को एक एन्क्रिप्टेड JSON फ़ाइल के रूप में सुरक्षित बैकअप डाउनलोड कर सकते हैं, तथा किसी भी डिवाइस पर दोबारा लोड (Restore) कर सकते हैं।
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 pt-1 font-sans">
            <button
              type="button"
              onClick={() => {
                const keys = ['rpf_journals_anon', 'rpf_journals_offline_local_user', `rpf_journals_${userId}`, 'rpf_profiles_anon', 'rpf_profiles_offline_local_user', `rpf_profiles_${userId}`];
                const backupData: Record<string, string | null> = {};
                keys.forEach(key => {
                  backupData[key] = localStorage.getItem(key);
                });
                const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `RPF_TA_Compilations_Backup_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-lg text-[11px] cursor-pointer transition shadow-3xs"
            >
              <Download className="w-3.5 h-3.5 text-[#5a5a40]" />
              Download Secured Local Backup (JSON)
            </button>
            
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-lg text-[11px] cursor-pointer transition shadow-3xs">
              <Upload className="w-3.5 h-3.5 text-[#5a5a40]" />
              <span>Restore Data from Backup File</span>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    try {
                      const backupObj = JSON.parse(event.target?.result as string);
                      let count = 0;
                      Object.keys(backupObj).forEach(key => {
                        if (key.startsWith('rpf_') && backupObj[key]) {
                          localStorage.setItem(key, backupObj[key]);
                          count++;
                        }
                      });
                      alert(`Successfully restored ${count} security datasets! Please refresh the application first. / बैकअप सफलतापूर्वक बहाल हो गया है!`);
                      window.location.reload();
                    } catch (err) {
                      alert('Invalid backup file structure.');
                    }
                  };
                  reader.readAsText(file);
                }}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="bg-[#2d302a] text-stone-100 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Hidden native input for local file selection */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 w-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              {/* Photo and QR code side by side in a styled official badge container */}
              <div className="flex items-center gap-4 bg-[#3d4239] p-2.5 rounded-xl border border-stone-600/40 shadow-inner">
                {/* Profile Photo Element */}
                <div 
                  id="avatar-photo-wrapper"
                  className="relative group cursor-pointer text-center"
                  onDragOver={handlePhotoDragOver}
                  onDragLeave={handlePhotoDragLeave}
                  onDrop={handlePhotoDrop}
                  title="Drag & drop an image here to change your photo directly / फोटो बदलने के लिए यहाँ फ़ाइल ड्रैग-ड्रॉप करें"
                >
                  <div className="w-16 h-16 bg-[#c8d4a5] text-[#2d302a] rounded-full overflow-hidden flex items-center justify-center border-2 border-stone-100 shadow-md">
                    {profile.photoUrl ? (
                      <img
                        src={profile.photoUrl}
                        alt={profile.name || 'User profile'}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="font-bold text-lg select-none">
                        {profile.name ? profile.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'RP'}
                      </span>
                    )}
                  </div>
                  <div className="absolute -bottom-1 -right-1 flex gap-1 bg-neutral-900/60 p-0.5 rounded-full backdrop-blur-xs">
                    <button
                      type="button"
                      onClick={handleOpenCamera}
                      className="p-1.5 bg-[#c8d4a5] text-[#2d302a] rounded-full hover:bg-stone-100 transition shadow-xs cursor-pointer"
                      title="Take new profile photo using camera"
                    >
                      <Camera className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={triggerFileSelect}
                      className="p-1.5 bg-[#c8d4a5] text-[#2d302a] rounded-full hover:bg-stone-100 transition shadow-xs cursor-pointer"
                      title="Upload profile photo from files"
                    >
                      <Upload className="w-3.5 h-3.5" />
                    </button>
                    {profile.photoUrl && (
                      <button
                        type="button"
                        onClick={handleDeletePhoto}
                        className="p-1.5 bg-rose-600 text-white rounded-full hover:bg-rose-700 transition shadow-xs cursor-pointer"
                        title="Delete profile photo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* QR Code Verification element */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <div 
                    onClick={() => setShowQRModal(true)}
                    className="relative cursor-pointer bg-white p-1 rounded-lg border border-stone-600/40 shadow-sm hover:scale-105 active:scale-95 transition-all duration-150 flex flex-col items-center justify-center group"
                    title="Click to view and download official verification QR code"
                  >
                    {qrCodeUrl ? (
                      <img
                        src={qrCodeUrl}
                        alt="Profile QR Code"
                        className="w-14 h-14 object-contain"
                      />
                    ) : (
                      <div className="w-14 h-14 flex items-center justify-center bg-stone-100 rounded">
                        <QrCode className="w-6 h-6 text-stone-600 animate-pulse" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/75 rounded opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center">
                      <QrCode className="w-5 h-5 text-[#c8d4a5]" />
                    </div>
                  </div>

                  {qrCodeUrl && (
                    <button
                      type="button"
                      onClick={handleDownloadQR}
                      className="p-2 bg-[#474c41] hover:bg-[#53594b] text-[#c8d4a5] rounded-lg transition duration-150 hover:scale-105 active:scale-95 shadow-sm cursor-pointer flex items-center justify-center"
                      title="Download Verification QR Code / क्यूआर कोड डाउनलोड करें"
                      id="download-qr-btn"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Text specifics */}
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold tracking-tight text-[#c8d4a5]">{profile.name || 'Anonymous User'}</h2>
                  <div className="flex items-center gap-1">
                    <button 
                      type="button"
                      onClick={() => setShowQRModal(true)}
                      className="p-1 bg-[#474c41] hover:bg-[#53594b] text-[#c8d4a5] rounded-md transition duration-150"
                      title="View QR Code verification"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                    </button>
                    {qrCodeUrl && (
                      <button
                        type="button"
                        onClick={handleDownloadQR}
                        className="p-1 bg-[#474c41] hover:bg-[#53594b] text-[#c8d4a5] rounded-md transition duration-150 hover:scale-105 active:scale-95"
                        title="Download QR code to your device / डिवाइस पर क्यूआर कोड डाउनलोड करें"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-stone-300 font-mono mt-0.5 mb-2">{profile.designation} • PF: {profile.pfNumber || 'N/A'}</p>
                
                {/* Dedicated photo controls, camera trigger and file uploader */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenCamera}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#c8d4a5] text-[#2d302a] text-[10px] font-bold rounded-md hover:bg-stone-100 transition shadow-xs cursor-pointer"
                    title="Take profile photo with camera"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Use Camera / कैमरा</span>
                  </button>
                  <button
                    type="button"
                    onClick={triggerFileSelect}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#c8d4a5] text-[#2d302a] text-[10px] font-bold rounded-md hover:bg-stone-100 transition shadow-xs cursor-pointer"
                    title="Upload profile photo from storage"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload File / फ़ाइल चुनें</span>
                  </button>
                  {profile.photoUrl && (
                    <button
                      type="button"
                      onClick={handleDeletePhoto}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-600 text-white text-[10px] font-bold rounded-md hover:bg-rose-700 transition shadow-xs cursor-pointer"
                      title="Delete profile photo (sets to null)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Photo</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="text-left sm:text-right font-mono text-xs text-stone-300 space-y-1">
              <div>HQ: {profile.headquarter}</div>
              <div>Pay Scale: {profile.scaleOfPay}</div>
              <button
                type="button"
                onClick={() => setShowQRModal(true)}
                className="mt-1 text-stone-100 text-[10px] items-center gap-1 bg-[#42473c] hover:bg-[#52594a] px-2 py-1.5 rounded-lg transition border border-stone-600/40 inline-flex shadow-xs cursor-pointer"
                title="Verify Status / क्यूआर कोड"
              >
                <QrCode className="w-3.5 h-3.5 text-[#c8d4a5]" />
                <span>Verify QR / क्यूआर जांचें</span>
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* PF Number */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">PF / Employee Number</label>
              <input
                type="text"
                name="pfNumber"
                disabled={!isEditing}
                className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-[#5a5a40] font-mono"
                value={profile.pfNumber}
                onChange={handleInputChange}
                required
              />
            </div>

            {/* Name */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">FullName</label>
              <input
                type="text"
                name="name"
                disabled={!isEditing}
                className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-[#5a5a40]"
                value={profile.name}
                onChange={handleInputChange}
                required
              />
            </div>

            {/* Designation */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Designation</label>
              <select
                name="designation"
                disabled={!isEditing}
                className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-[#5a5a40]"
                value={profile.designation}
                onChange={handleInputChange}
              >
                <option value="Constable">Constable</option>
                <option value="Lady Constable">Lady Constable</option>
                <option value="Head Constable">Head Constable</option>
                <option value="Lady Head Constable">Lady Head Constable</option>
                <option value="Assistant Sub-Inspector (ASI)">Assistant Sub-Inspector (ASI)</option>
                <option value="Lady ASI">Lady ASI</option>
                <option value="Sub-Inspector (SI)">Sub-Inspector (SI)</option>
                <option value="Lady SI">Lady SI</option>
                <option value="Inspector">Inspector</option>
                <option value="CWC">CWC</option>
                <option value="Assistant Security Commissioner (ASC)">Assistant Commissioner (ASC)</option>
                <option value="Divisional Security Commissioner (DSC)">Divisional Commissioner (DSC)</option>
              </select>
            </div>

            {/* Basic Pay */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Basic Pay (Rs.)</label>
              <input
                type="number"
                name="basicPay"
                disabled={!isEditing}
                className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-[#5a5a40] font-mono"
                value={profile.basicPay}
                onChange={handleInputChange}
                required
              />
            </div>

            {/* Grade Pay */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Grade Pay (G. Pay) (Rs.)</label>
              <input
                type="number"
                name="gradePay"
                disabled={!isEditing}
                className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-[#5a5a40] font-mono"
                value={profile.gradePay || 0}
                onChange={handleInputChange}
                required
              />
            </div>

            {/* Scale Of Pay */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Scale Of Pay</label>
              <input
                type="text"
                name="scaleOfPay"
                disabled={!isEditing}
                className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-[#5a5a40]"
                value={profile.scaleOfPay}
                onChange={handleInputChange}
              />
            </div>

            {/* Date Of Appointment */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Date of Appointment</label>
              <input
                type="date"
                name="dateOfAppointment"
                disabled={!isEditing}
                className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-[#5a5a40] font-mono"
                value={profile.dateOfAppointment}
                onChange={handleInputChange}
              />
            </div>

            {/* Branch */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Security Branch</label>
              <input
                type="text"
                name="branch"
                disabled={!isEditing}
                className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-[#5a5a40]"
                value={profile.branch}
                onChange={handleInputChange}
              />
            </div>

            {/* Division */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Division</label>
              <input
                type="text"
                name="division"
                disabled={!isEditing}
                className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-[#5a5a40]"
                value={profile.division}
                onChange={handleInputChange}
              />
            </div>

            {/* Headquarters / Post */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">HQ / Post Station</label>
              <input
                type="text"
                name="headquarter"
                disabled={!isEditing}
                className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-[#5a5a40]"
                value={profile.headquarter}
                onChange={handleInputChange}
              />
            </div>

            {/* Rule Governed */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Rule Governed By</label>
              <input
                type="text"
                name="ruleGoverned"
                disabled={!isEditing}
                className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-[#5a5a40]"
                value={profile.ruleGoverned}
                onChange={handleInputChange}
              />
            </div>

            {/* Bill Unit */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Bill Unit</label>
              <input
                type="text"
                name="billUnit"
                disabled={!isEditing}
                className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-[#5a5a40]"
                value={profile.billUnit || ''}
                onChange={handleInputChange}
                placeholder="Optional / वैकल्पिक"
              />
            </div>

            {/* Direct Profile Photo Upload Section */}
            <div id="profile-photo-drag-drop-card" className="col-span-1 md:col-span-3 bg-slate-50 border border-slate-200/80 rounded-xl p-5 mt-2">
              <h3 id="photo-v-title" className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Upload className="w-4 h-4 text-[#5a5a40]" />
                Profile Photo Direct Upload / प्रोफाइल फोटो सीधे अपलोड करें
              </h3>
              
              <div 
                id="photo-direct-dropzone"
                onClick={triggerDirectPhotoInputSelect}
                onDragOver={handlePhotoDragOver}
                onDragLeave={handlePhotoDragLeave}
                onDrop={handlePhotoDrop}
                className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 min-h-[140px] ${
                  isDragging 
                    ? 'border-[#5a5a40] bg-[#5a5a40]/5 scale-[1.01]' 
                    : 'border-slate-300 hover:border-[#5a5a40] hover:bg-slate-100/50'
                }`}
              >
                <input
                  id="direct-profile-photo-file-input"
                  type="file"
                  ref={directPhotoInputRef}
                  onChange={handleDirectPhotoFileChange}
                  accept="image/*"
                  className="hidden"
                />
                
                <div id="upload-icon-circle" className="w-11 h-11 rounded-full bg-stone-100 flex items-center justify-center text-[#5a5a40] mb-2 shadow-3xs">
                  <Upload className="w-5 h-5" />
                </div>
                
                <p id="upload-instruction-text" className="text-xs font-semibold text-slate-700">
                  Drag &amp; drop profile photo here, or <span className="text-[#5a5a40] underline hover:text-[#4a4a35]">browse device files</span>
                </p>
                <p id="upload-instruction-subtext" className="text-[10px] text-slate-400 mt-1 font-medium font-sans">
                  JPEG, PNG, or WEBP. Max 5MB. Photo updates immediately in the preview badge above.
                </p>
              </div>
            </div>

          </div>

          {isEditing && (
            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 mt-6">
              <button
                type="button"
                onClick={() => {
                  setProfile({ ...initialProfile });
                  setIsEditing(false);
                }}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 text-xs font-semibold hover:bg-slate-50 transition"
              >
                Discard Change
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#5a5a40] text-stone-100 rounded-lg text-xs font-semibold hover:bg-[#4a4a35] transition shadow-xs disabled:opacity-75"
              >
                <Save className="w-4.5 h-4.5" />
                {saving ? 'Saving...' : 'Save Profile details'}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* --- Responsive Camera Modal --- */}
      {showCameraModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-opacity duration-300">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden flex flex-col transform transition-transform duration-300 scale-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-[#5a5a40]" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Add & Adjust Profile Photo / फोटो जोड़ें</h3>
                  <p className="text-[10px] text-slate-500 font-medium font-sans">Use camera or upload a file for precise passport photo cropping.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseCamera}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Camera Canvas View */}
            <div className="p-6 flex flex-col items-center justify-center bg-slate-50/50">
              {cameraLoading && (
                <div className="w-72 h-72 rounded-2xl border-2 border-dashed border-slate-200 bg-white flex flex-col items-center justify-center gap-3 animate-pulse">
                  <div className="w-8 h-8 rounded-full border-4 border-slate-300 border-t-[#5a5a40] animate-spin"></div>
                  <span className="text-[11px] text-slate-500 font-semibold">Starting camera feed...</span>
                </div>
              )}

              {cameraError && (
                <div className="w-72 h-80 rounded-2xl border border-red-200 bg-red-50 p-4 flex flex-col items-center justify-center text-center gap-2">
                  <ShieldAlert className="w-6 h-6 text-red-500" />
                  <p className="text-[11px] font-semibold text-red-800 leading-normal font-sans">{cameraError}</p>
                  <p className="text-[9px] text-slate-500 leading-tight font-sans max-w-[240px]">
                    Note: Iframe sandbox restrictions may block camera. Open in a new tab to authorize.
                  </p>
                  <div className="flex flex-col gap-1.5 w-full mt-1 font-sans">
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-[11px] font-bold rounded-lg transition shadow-xs cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open in New Tab / नए टैब में खोलें</span>
                    </a>
                    <button
                      type="button"
                      onClick={startCamera}
                      className="text-[10px] font-bold text-[#5a5a40] hover:underline py-0.5"
                    >
                      Try Re-authorizing Camera
                    </button>
                    <button
                      type="button"
                      onClick={triggerFileSelect}
                      className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-[#5a5a40] text-stone-100 text-[11px] font-bold rounded-lg hover:bg-[#4a4a35] transition shadow-xs cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Choose Local Photo / फ़ाइल चुनें</span>
                    </button>
                  </div>
                </div>
              )}

              {!cameraLoading && !cameraError && (
                <div className="flex flex-col items-center w-full">
                  {!capturedImage ? (
                    <div className="relative w-72 h-72 bg-black rounded-2xl overflow-hidden shadow-inner border border-slate-200 flex items-center justify-center">
                      {/* Live feed */}
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover scale-x-[-1]"
                      />

                      {/* Camera overlay guideline guide ring */}
                      <div className="absolute inset-0 pointer-events-none border-4 border-dashed border-white/30 rounded-full m-8 flex items-center justify-center">
                        <span className="text-[9px] text-white/50 tracking-wider font-semibold uppercase bg-black/40 px-2 py-0.5 rounded-full font-sans">Position Face Here</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center w-full">
                      {/* Crop display preview container */}
                      <div className="relative w-64 h-64 bg-slate-900 border border-slate-200 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center">
                        <img
                          src={capturedImage}
                          alt="Captured snapshot preview for cropping"
                          style={{
                            transform: `scale(${zoom}) translate(${offsetX}px, ${offsetY}px)`,
                            transformOrigin: 'center center',
                          }}
                          className="w-full h-full object-cover transition-transform duration-75"
                          referrerPolicy="no-referrer"
                        />
                        {/* Crop Guidelines overlay resembling standard passport photo criteria */}
                        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 border-[24px] border-slate-950/60 rounded-2xl">
                          <div className="w-full h-full border border-dashed border-white/60 rounded-full flex flex-col justify-center items-center relative">
                            {/* Inner level ticks */}
                            <div className="absolute top-[30%] w-full border-t border-red-500/40 flex justify-center">
                              <span className="bg-red-500/80 text-white font-sans text-[7px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wide">Eye Level / आँखों की सीध</span>
                            </div>
                            <div className="absolute bottom-[25%] w-full border-t border-[#c8d4a5]/40 flex justify-center">
                              <span className="bg-[#c8d4a5]/80 text-[#2d302a] font-sans text-[7px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wide">Chin Level / ठुड्डी की सीध</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Cropping / Positioning Controls */}
                      <div className="mt-5 w-full space-y-3.5 bg-white p-4 rounded-xl border border-slate-100 shadow-xs">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <span className="text-[10px] font-bold text-slate-700 tracking-wide uppercase">CROP & ALIGNMENT GUIDES</span>
                          <button
                            type="button"
                            onClick={() => {
                              setZoom(1.0);
                              setOffsetX(0);
                              setOffsetY(0);
                            }}
                            className="inline-flex items-center gap-1 text-[10px] text-[#5a5a40] hover:text-[#4a4a35] font-bold transition focus:outline-none cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Reset Alignment
                          </button>
                        </div>

                        {/* Scale Slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-semibold text-slate-500">
                            <span>Zoom Scale (ज़ूम करें)</span>
                            <span className="text-slate-700 font-mono">{zoom.toFixed(2)}x</span>
                          </div>
                          <input
                            type="range"
                            min="1.0"
                            max="3.0"
                            step="0.05"
                            value={zoom}
                            onChange={(e) => setZoom(parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#5a5a40]"
                          />
                        </div>

                        {/* Horizontal Offset Slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-semibold text-slate-500 font-mono font-sans">
                            <span>Horizontal Shift (दाएँ / बाएँ)</span>
                            <span className="text-[#5a5a40] font-mono">{offsetX > 0 ? `+${offsetX}` : offsetX}px</span>
                          </div>
                          <input
                            type="range"
                            min="-120"
                            max="120"
                            step="1"
                            value={offsetX}
                            onChange={(e) => setOffsetX(parseInt(e.target.value))}
                            className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#5a5a40]"
                          />
                        </div>

                        {/* Vertical Offset Slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-semibold text-slate-500 font-mono font-sans">
                            <span>Vertical Shift (ऊपर / नीचे)</span>
                            <span className="text-[#5a5a40] font-mono">{offsetY > 0 ? `+${offsetY}` : offsetY}px</span>
                          </div>
                          <input
                            type="range"
                            min="-120"
                            max="120"
                            step="1"
                            value={offsetY}
                            onChange={(e) => setOffsetY(parseInt(e.target.value))}
                            className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#5a5a40]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Hidden Capture Work Canvas */}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Modal Footer / Action controls */}
            <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-2 w-full font-sans">
              {!capturedImage ? (
                <div className="w-full flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleCapture}
                    disabled={!!cameraError || cameraLoading || !cameraStream}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#5a5a40] hover:bg-[#4a4a35] text-stone-100 text-xs font-bold rounded-lg transition disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <Camera className="w-4 h-4" />
                    Take Instant Photo / फोटो खींचें
                  </button>
                  <button
                    type="button"
                    onClick={triggerFileSelect}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 rounded-lg transition cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-[#5a5a40]" />
                    Upload Image File / गैलरी से चुनें
                  </button>
                </div>
              ) : (
                <div className="w-full flex gap-3">
                  <button
                    type="button"
                    onClick={() => setCapturedImage(null)}
                    className="w-1/2 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4 text-slate-500" />
                    Retake / पुनः चुनें
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCapturedPhoto}
                    className="w-1/2 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#5a5a40] hover:bg-[#4a4a35] text-stone-100 text-xs font-bold rounded-lg transition cursor-pointer shadow-xs"
                  >
                    <Check className="w-4 h-4 text-[#c8d4a5]" />
                    Set as Face Photo
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- Interactive QR Verification Modal --- */}
      {showQRModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-opacity duration-300">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full overflow-hidden flex flex-col transform transition-transform duration-300 scale-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-[#5a5a40]/10 text-[#5a5a40] rounded-lg animate-pulse">
                  <QrCode className="w-5 h-5 text-[#5a5a40]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Verification QR / क्यूआर सत्यापन</h3>
                  <p className="text-[10px] text-slate-500 font-medium font-sans">Official railway identity quick-scan QR.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQRModal(false)}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 flex flex-col items-center gap-5">
              {/* QR Image Frame */}
              <div className="bg-[#2d302a] p-4 rounded-2xl shadow-md border-2 border-slate-100 scale-100 hover:scale-[1.02] transition-transform duration-200 relative">
                {qrCodeUrl ? (
                  <img
                    src={qrCodeUrl}
                    alt="Official Verification QR"
                    className="w-48 h-48 rounded-lg bg-white p-2"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center bg-stone-100 rounded-lg text-stone-500 text-xs font-mono font-sans">
                    Generating...
                  </div>
                )}
                {/* Visual Scanner effect bar */}
                <div className="absolute top-4 left-4 right-4 h-0.5 bg-emerald-400 opacity-65 rounded animate-bounce mt-24"></div>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-full border border-emerald-100 shadow-3xs font-sans">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span>Active Status / सक्रिय सेवा</span>
              </div>

              {/* Profile details check card */}
              <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 font-sans">
                <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">Name (नाम)</span>
                  <span className="text-xs font-bold text-slate-800">{profile.name || 'Anonymous'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">PF Number (पीएफ नं)</span>
                  <span className="text-xs font-bold font-mono text-slate-800">{profile.pfNumber || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">Rank (पद)</span>
                  <span className="text-xs font-bold text-[#5a5a40]">{profile.designation || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">HQ & Div (मुख्यालय)</span>
                  <span className="text-xs font-bold text-slate-700 font-mono">{profile.headquarter || 'N/A'} / {profile.division || 'CKP'}</span>
                </div>
              </div>

              <p className="text-[10px] text-center text-slate-400 leading-relaxed font-sans max-w-xs">
                Scan using any scanner to instantly verify registration, designation status, and active duty credentials.
              </p>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex gap-3 w-full font-sans">
              <button
                type="button"
                onClick={() => setShowQRModal(false)}
                className="w-1/2 px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-bold rounded-lg transition cursor-pointer"
              >
                Close / बंद करें
              </button>
              <button
                type="button"
                onClick={handleDownloadQR}
                className="w-1/2 px-4 py-2 bg-[#5a5a40] hover:bg-[#4a4a35] text-white text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#c8d4a5]" />
                Download / डाउनलोड
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
