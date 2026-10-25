/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { OfficerProfile } from '../types';
import { Plus, Trash2, Edit2, Users, Search, Save, X, ArrowLeft, Shield, Download, Upload, AlertCircle, CheckCircle } from 'lucide-react';

interface OfficerProfilesListProps {
  profiles: OfficerProfile[];
  onSaveProfile: (profile: OfficerProfile) => void;
  onDeleteProfile: (id: string) => void;
  onBack: () => void;
  onImportProfiles?: (profiles: OfficerProfile[]) => void;
}

const emptyProfile = (): OfficerProfile => ({
  id: '',
  pfNumber: '',
  name: '',
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
});

export default function OfficerProfilesList({
  profiles,
  onSaveProfile,
  onDeleteProfile,
  onBack,
  onImportProfiles
}: OfficerProfilesListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('');
  const [selectedHQ, setSelectedHQ] = useState('');
  const [editingProfile, setEditingProfile] = useState<OfficerProfile | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  
  const [pDeleteConfirm, setPDeleteConfirm] = useState<{
    isOpen: boolean;
    profileId: string | null;
    profileName: string;
  }>({
    isOpen: false,
    profileId: null,
    profileName: '',
  });

  // Extract unique divisions and headquarters for dynamic select options
  const uniqueDivisions = Array.from(new Set(profiles.map(p => p.division || ''))).filter(Boolean).sort();
  const uniqueHQs = Array.from(new Set(profiles.map(p => p.headquarter || ''))).filter(Boolean).sort();

  // Filter profiles based on enhanced search criteria (name, PF, division, or headquarter)
  const filteredProfiles = profiles.filter(p => {
    const matchesSearch = searchTerm === '' ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.pfNumber.includes(searchTerm) ||
      p.designation.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.headquarter && p.headquarter.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.division && p.division.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.branch && p.branch.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesDivision = selectedDivision === '' || p.division === selectedDivision;
    const matchesHQ = selectedHQ === '' || p.headquarter === selectedHQ;

    return matchesSearch && matchesDivision && matchesHQ;
  });

  const startNewProfile = () => {
    setFormError(null);
    const fresh = emptyProfile();
    fresh.id = 'prof_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    setEditingProfile(fresh);
  };

  const handleExportJSON = () => {
    try {
      if (!profiles || profiles.length === 0) {
        alert("There are no profiles to export!");
        return;
      }
      const dataStr = JSON.stringify(profiles, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
      
      const exportFileDefaultName = `rpf_profiles_backup_${new Date().toISOString().substring(0, 10)}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    } catch (error) {
      console.error("Export profiles failed:", error);
      alert("Something went wrong while exporting profiles.");
    }
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onImportProfiles) return;
    const fileReader = new FileReader();
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    fileReader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (typeof result !== 'string') return;
        const parsed = JSON.parse(result);
        
        if (Array.isArray(parsed)) {
          const isValid = parsed.every(item => item && (item.pfNumber || item.name));
          if (!isValid) {
            alert("Invalid profiles file. Make sure every profile contains 'pfNumber' and 'name'.");
            return;
          }
          onImportProfiles(parsed);
          e.target.value = '';
        } else {
          alert("Invalid data format inside the JSON. A list of profiles was expected.");
        }
      } catch (err) {
        console.error(err);
        alert("Could not parse the JSON file. Make sure it is a valid JSON file.");
      }
    };
    fileReader.readAsText(files[0]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (!editingProfile) return;
    const { name, value } = e.target;
    
    let updatedProfile = {
      ...editingProfile,
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

    setEditingProfile(updatedProfile);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;
    
    const pf = editingProfile.pfNumber?.trim();
    const nm = editingProfile.name?.trim();

    if (!pf || !nm) {
      setFormError('PF Number and Officer Name are required fields!');
      return;
    }
    
    const sanitizedProfile: OfficerProfile = {
      ...editingProfile,
      id: editingProfile.id?.trim() || ('prof_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
      pfNumber: pf,
      name: nm,
      designation: editingProfile.designation?.trim() || 'Constable',
      division: editingProfile.division?.trim() || 'CKP Division',
      headquarter: editingProfile.headquarter?.trim() || 'RPF/POST/BUF',
      branch: editingProfile.branch?.trim() || 'Security Branch',
      scaleOfPay: editingProfile.scaleOfPay?.trim() || '5,200-20,200',
      ruleGoverned: editingProfile.ruleGoverned?.trim() || 'S. Rule',
      basicPay: Number(editingProfile.basicPay) || 21700,
      gradePay: Number(editingProfile.gradePay) || 2000,
      billUnit: editingProfile.billUnit?.trim() || '',
      dateOfAppointment: editingProfile.dateOfAppointment?.trim() || ''
    };

    onSaveProfile(sanitizedProfile);
    setFormError(null);
    setEditingProfile(null);
    setSuccessToast(`Staff profile for "${sanitizedProfile.name}" (${sanitizedProfile.pfNumber}) saved successfully!`);
    setTimeout(() => {
      setSuccessToast(null);
    }, 4000);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back Button and Header */}
      <div className="bg-gradient-to-r from-[#172554] via-[#1e1b4b] to-[#311042] text-white rounded-2xl p-6 shadow-md relative overflow-hidden border-b-4 border-indigo-500">
        <div className="absolute right-0 top-0 h-full w-1/3 opacity-10 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-amber-400 to-transparent pointer-events-none"></div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 z-10 relative">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 border border-slate-750 bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-200 rounded-lg transition"
            >
              <ArrowLeft className="w-4 h-4 text-amber-400" />
            </button>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-400 font-extrabold mb-1">
                🛡️ Master Configuration / मास्टर सेटिंग्स
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-400 animate-pulse" />
                Manage RPF Staff Profiles
              </h1>
              <p className="text-slate-250 text-xs mt-1">Define master details to speed up monthly claim generation automatically</p>
            </div>
          </div>
          
          {!editingProfile && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                id="btn-export-profiles"
                onClick={handleExportJSON}
                className="inline-flex items-center justify-center gap-1.5 border border-emerald-500/40 bg-emerald-950/20 hover:bg-emerald-950/50 text-emerald-300 font-bold px-3.5 py-2 rounded-lg text-sm transition"
                title="Backup all officer profiles locally as a JSON file"
              >
                <Download className="w-4 h-4 text-emerald-400 animate-bounce" />
                Export JSON Backup
              </button>
              
              <label
                id="lbl-import-profiles"
                className="inline-flex items-center justify-center gap-1.5 border border-cyan-500/40 bg-cyan-950/20 hover:bg-cyan-950/50 text-cyan-300 font-bold px-3.5 py-2 rounded-lg text-sm cursor-pointer transition"
                title="Restore / import officer profiles from local JSON backup"
              >
                <Upload className="w-4 h-4 text-cyan-400" />
                Import Backup
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportJSON}
                  className="hidden"
                />
              </label>

              <button
                id="btn-add-profile"
                onClick={startNewProfile}
                className="inline-flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-black px-4 py-2 rounded-lg text-sm transition shadow-lg border border-amber-300/30"
              >
                <Plus className="w-4 h-4 text-amber-250" />
                Add New Personnel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Toast notification */}
      {successToast && (
        <div className="bg-emerald-50 border-2 border-emerald-400 text-emerald-900 px-4 py-3 rounded-xl flex items-center justify-between gap-3 shadow-sm animate-fade-in">
          <div className="flex items-center gap-2 font-bold text-sm">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setSuccessToast(null)} 
            className="text-emerald-700 hover:text-emerald-950 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {editingProfile ? (
        /* Edit or Create Profile Form View */
        <div className="bg-white border-2 border-amber-200 rounded-xl overflow-hidden shadow-md">
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-4 border-b-2 border-amber-200 flex items-center justify-between">
            <h3 className="font-extrabold text-amber-950 flex items-center gap-2 text-sm uppercase tracking-wider">
              <Shield className="w-4.5 h-4.5 text-amber-600 animate-pulse" />
              {editingProfile.id && profiles.some(p => p.id === editingProfile.id) 
                ? `Edit Staff Details: ${editingProfile.name}` 
                : 'Register New RPF Officer / Staff'}
            </h3>
            <button
              onClick={() => setEditingProfile(null)}
              className="text-amber-700 hover:text-amber-900 p-1.5 hover:bg-amber-100/60 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleFormSubmit} className="p-6 space-y-6">
            {formError && (
              <div className="bg-rose-50 border-2 border-rose-300 text-rose-800 px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* PF No */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  PF / Employee Number *
                </label>
                <input
                  type="text"
                  name="pfNumber"
                  required
                  placeholder="e.g. 18229804815"
                  className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  value={editingProfile.pfNumber}
                  onChange={handleInputChange}
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Officer Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="e.g. Nitesh Kumar"
                  className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  value={editingProfile.name}
                  onChange={handleInputChange}
                />
              </div>

              {/* Designation */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Designation
                </label>
                <select
                  name="designation"
                  className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  value={editingProfile.designation}
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

              {/* Branch */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Security Branch
                </label>
                <input
                  type="text"
                  name="branch"
                  placeholder="e.g. Security Branch"
                  className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  value={editingProfile.branch}
                  onChange={handleInputChange}
                />
              </div>

              {/* Division */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Division
                </label>
                <input
                  type="text"
                  name="division"
                  placeholder="e.g. CKP Division"
                  className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  value={editingProfile.division}
                  onChange={handleInputChange}
                />
              </div>

              {/* Headquarters Post */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Headquarter / RPF Post
                </label>
                <input
                  type="text"
                  name="headquarter"
                  placeholder="e.g. RPF/POST/BUF"
                  className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  value={editingProfile.headquarter}
                  onChange={handleInputChange}
                />
              </div>

              {/* Basic Pay */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Basic Pay (Rs.)
                </label>
                <input
                  type="number"
                  name="basicPay"
                  placeholder="e.g. 26000"
                  className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono"
                  value={editingProfile.basicPay}
                  onChange={handleInputChange}
                />
              </div>

              {/* Grade Pay */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Grade Pay (Rs.)
                </label>
                <input
                  type="number"
                  name="gradePay"
                  placeholder="e.g. 2000"
                  className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono"
                  value={editingProfile.gradePay}
                  onChange={handleInputChange}
                />
              </div>

              {/* Scale of pay */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Scale of Pay
                </label>
                <input
                  type="text"
                  name="scaleOfPay"
                  placeholder="e.g. 5,200-20,200"
                  className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  value={editingProfile.scaleOfPay}
                  onChange={handleInputChange}
                />
              </div>

              {/* Appointment Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Date of Appointment
                </label>
                <input
                  type="date"
                  name="dateOfAppointment"
                  className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono"
                  value={editingProfile.dateOfAppointment}
                  onChange={handleInputChange}
                />
              </div>

              {/* Rule governed */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Rules Governed By
                </label>
                <input
                  type="text"
                  name="ruleGoverned"
                  placeholder="e.g. S. Rule"
                  className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  value={editingProfile.ruleGoverned}
                  onChange={handleInputChange}
                />
              </div>

              {/* Bill Unit */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Bill Unit
                </label>
                <input
                  type="text"
                  name="billUnit"
                  placeholder="e.g. 0702081 (Optional)"
                  className="block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono"
                  value={editingProfile.billUnit || ''}
                  onChange={handleInputChange}
                />
              </div>

            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-amber-100">
              <button
                type="button"
                onClick={() => setEditingProfile(null)}
                className="px-4 py-2 border-2 border-slate-250 hover:bg-slate-50 text-slate-600 rounded-lg text-sm font-extrabold transition cursor-pointer"
              >
                Cancel / निरस्त करें
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-gradient-to-r from-amber-500 hover:from-amber-600 to-orange-500 hover:to-orange-600 text-white rounded-lg text-sm font-black transition flex items-center gap-1.5 shadow-md border border-amber-300/30 cursor-pointer"
              >
                <Save className="w-4 h-4 text-amber-100" />
                Save Profile / सुरक्षित करें
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Profiles Search List View */
        <div className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 border-b-2 border-slate-200 bg-gradient-to-r from-slate-50 via-indigo-50/20 to-amber-50/10 flex flex-col md:flex-row items-stretch md:items-center gap-4">
            
            {/* Generic text search input */}
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-indigo-500">
                <Search className="w-4 h-4 text-indigo-650" />
              </span>
              <input
                type="text"
                placeholder="Search staff by Name, PF, Div, HQ..."
                className="block w-full pl-9 pr-3.5 py-2 border-2 border-slate-200 hover:border-indigo-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all h-10 font-medium"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Division Filter Dropdown */}
            <div className="w-full md:w-56">
              <select
                className="block w-full px-3 py-2 border-2 border-slate-200 hover:border-amber-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-extrabold text-slate-700 h-10 cursor-pointer"
                value={selectedDivision}
                onChange={(e) => setSelectedDivision(e.target.value)}
              >
                <option value="">All Divisions (सभी डिवीजन)</option>
                {uniqueDivisions.map(div => (
                  <option key={div} value={div}>{div}</option>
                ))}
              </select>
            </div>

            {/* HQ / Post Filter Dropdown */}
            <div className="w-full md:w-56">
              <select
                className="block w-full px-3 py-2 border-2 border-slate-200 hover:border-amber-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-extrabold text-slate-700 h-10 cursor-pointer"
                value={selectedHQ}
                onChange={(e) => setSelectedHQ(e.target.value)}
              >
                <option value="">All Headquarters (सभी पोस्ट)</option>
                {uniqueHQs.map(hq => (
                  <option key={hq} value={hq}>{hq}</option>
                ))}
              </select>
            </div>

          </div>

          <div className="divide-y divide-slate-100">
            {filteredProfiles.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-sm font-medium">
                No profiles match your search criteria. Add a profile using the button above.
              </div>
            ) : (
              filteredProfiles.map(p => (
                <div key={p.id} className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:bg-indigo-50/40 border-l-4 border-transparent hover:border-amber-400 transition-all duration-200">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap text-stone-900">
                      <span className="font-extrabold text-slate-900 text-base font-sans tracking-tight">{p.name}</span>
                      {p.adminOwnerEmail && (
                        <span className="text-[9px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded shrink-0" title={`Created by: ${p.adminOwnerEmail}`}>
                          👤 {p.adminOwnerEmail}
                        </span>
                      )}
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase font-mono border ${
                        p.designation.toLowerCase().includes('head constable')
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-400/50 shadow-3xs'
                          : p.designation.toLowerCase().includes('constable')
                          ? 'bg-blue-100 text-blue-900 border-blue-400/50 shadow-3xs'
                          : p.designation.toLowerCase().includes('assistant sub-inspector') || p.designation.toLowerCase().includes('asi')
                          ? 'bg-cyan-100 text-cyan-900 border-cyan-400/50 shadow-3xs'
                          : p.designation.toLowerCase().includes('sub-inspector') || p.designation.toLowerCase().includes('si')
                          ? 'bg-purple-100 text-purple-900 border-purple-400/50 shadow-3xs'
                          : p.designation.toLowerCase().includes('inspector')
                          ? 'bg-amber-150 text-amber-950 border-amber-400/60 shadow-3xs'
                          : 'bg-rose-100 text-rose-900 border-rose-400/50 shadow-3xs'
                      }`}>
                        {p.designation}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5 mt-2.5 text-xs text-slate-550 font-semibold">
                      <div>
                        <span className="text-slate-400 font-bold">PF Number:</span>{' '}
                        <span className="font-mono text-indigo-950 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-150">{p.pfNumber}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold">Office/Post:</span>{' '}
                        <span className="text-slate-800 bg-amber-50/60 border border-amber-150 px-1.5 py-0.5 rounded font-black">{p.headquarter}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold">Division:</span>{' '}
                        <span className="text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded font-bold">{p.division}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold">Basic Pay:</span>{' '}
                        <span className="font-mono text-emerald-805 bg-emerald-50 px-1.5 py-0.5 rounded font-black">₹{p.basicPay.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => setEditingProfile(p)}
                      className="p-2 border-2 border-amber-200 hover:border-amber-400 bg-amber-50/40 hover:bg-amber-100/40 text-amber-700 hover:text-amber-900 rounded-lg transition-all shadow-3xs hover:scale-105 cursor-pointer"
                      title="Edit Profile"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setPDeleteConfirm({
                          isOpen: true,
                          profileId: p.id,
                          profileName: p.name
                        });
                      }}
                      className="p-2 border-2 border-red-200 hover:border-red-400 bg-red-50/40 hover:bg-red-100/40 text-red-650 hover:text-red-800 rounded-lg transition-all shadow-3xs hover:scale-105 cursor-pointer"
                      title="Delete Profile"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Custom Profile Delete Confirmation Modal */}
      {pDeleteConfirm.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" id="profile-delete-confirm-modal">
          <div className="bg-[#f8f7f4] rounded-xl shadow-xl border border-stone-200 p-6 max-w-sm w-full text-left font-sans">
            <h3 className="text-xs font-black uppercase tracking-wider text-red-600 border-b border-stone-200 pb-2 mb-3">
              Delete Personnel Profile / प्रोफ़ाइल हटाएं
            </h3>
            <p className="text-xs text-stone-700 leading-relaxed mb-6">
              Are you sure you want to delete the profile for RPF Staff <strong className="text-stone-900">{pDeleteConfirm.profileName}</strong>? This will permanently delete all associated TA claims and journals for this officer, and remove them from the "Total Claimed" calculations on the Dashboard.
              <br /><br />
              क्या आप वाकई RPF स्टाफ <strong className="text-stone-900">{pDeleteConfirm.profileName}</strong> की प्रोफ़ाइल हटाना चाहते हैं? ऐसा करने से इस अधिकारी के सभी ट्रैवल एलाउंस (TA) दावे और जर्नल हमेशा के लिए हट जाएंगे और डैशबोर्ड की कुल दावा राशि (Total Claimed) से भी निरस्त हो जाएंगे।
            </p>
            <div className="flex gap-2.5 justify-end text-xs font-bold leading-none">
              <button
                type="button"
                onClick={() => setPDeleteConfirm({ isOpen: false, profileId: null, profileName: '' })}
                className="px-4 py-2 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg text-stone-700 transition"
              >
                Cancel / निरस्त करें
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pDeleteConfirm.profileId) {
                    onDeleteProfile(pDeleteConfirm.profileId);
                  }
                  setPDeleteConfirm({ isOpen: false, profileId: null, profileName: '' });
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
