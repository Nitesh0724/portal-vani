/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { TARateRule } from '../types';
import { Sliders, ArrowLeft, Save, ShieldAlert, RotateCcw } from 'lucide-react';
import { DEFAULT_RATE_RULES } from '../utils';

interface TARateSettingsProps {
  rules: TARateRule[];
  onSaveRules: (rules: TARateRule[]) => void;
  onBack: () => void;
}

export default function TARateSettings({
  rules,
  onSaveRules,
  onBack
}: TARateSettingsProps) {
  // Copy state for local editing
  const [localRules, setLocalRules] = useState<TARateRule[]>(JSON.parse(JSON.stringify(rules)));
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleRateChange = (id: string, newRate: number) => {
    setLocalRules(prev => prev.map(r => r.id === id ? { ...r, ratePerDay: newRate } : r));
  };

  const handleRangeChange = (id: string, field: 'basicPayMin' | 'basicPayMax', val: number) => {
    setLocalRules(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  };

  const resetToDefault = () => {
    setShowResetConfirm(true);
  };

  const confirmReset = () => {
    setLocalRules(JSON.parse(JSON.stringify(DEFAULT_RATE_RULES)));
    setShowResetConfirm(false);
  };

  const saveAll = () => {
    onSaveRules(localRules);
    onBack();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header and Back navigation */}
      <div className="bg-gradient-to-r from-[#1e1b4b] via-[#2e1065] to-[#4c1d95] text-white rounded-2xl p-6 shadow-md relative overflow-hidden border-b-4 border-amber-500">
        <div className="absolute right-0 top-0 h-full w-1/3 opacity-15 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-amber-400 to-transparent pointer-events-none"></div>
        <div className="flex items-center justify-between z-10 relative">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 border border-violet-700 bg-violet-955/40 hover:bg-violet-900/60 text-violet-200 rounded-lg transition"
            >
              <ArrowLeft className="w-4 h-4 text-amber-400 font-extrabold" />
            </button>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-300 font-black mb-1">
                ⚙️ Admin Parameters / पैरामीटर सेटिंग्स
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <Sliders className="w-5 h-5 text-amber-400 animate-spin" />
                Administrative TA Slab Settings
              </h1>
              <p className="text-violet-200 text-xs mt-1 font-medium">Control daily allowance rates mapped to 7th Central Pay Commission guidelines</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Core Settings Form Column */}
        <div className="lg:col-span-2 bg-white border-2 border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
          <div className="border-b-2 border-slate-200 pb-3 flex items-center justify-between">
            <h3 className="font-extrabold text-indigo-950 text-sm uppercase tracking-wider">Pay Slab Mapping / पे स्लैब दरें</h3>
            <button
              onClick={resetToDefault}
              className="inline-flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 font-black hover:scale-105 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 animate-spin" />
              Reset To System Defaults / रीसेट करें
            </button>
          </div>

          <div className="space-y-4">
            {localRules.map((rule) => {
              const ruleLC = rule.name.toLowerCase();
              const isLowLevel = ruleLC.includes('level 1') || ruleLC.includes('level 5') || ruleLC.includes('1 to 5');
              const isMidLevel = ruleLC.includes('level 6') || ruleLC.includes('level 8') || ruleLC.includes('6 to 8');
              const isHighLevel = ruleLC.includes('level 9') || ruleLC.includes('level 11') || ruleLC.includes('9 to 11') || ruleLC.includes('level 12') || ruleLC.includes('12 to 13') || ruleLC.includes('level 14');
              
              const borderAccentColor = isLowLevel 
                ? 'border-l-4 hover:border-l-4 border-blue-400 focus-within:border-blue-500 hover:bg-blue-50/20' 
                : isMidLevel 
                ? 'border-l-4 hover:border-l-4 border-emerald-400 focus-within:border-emerald-500 hover:bg-emerald-50/20' 
                : isHighLevel 
                ? 'border-l-4 hover:border-l-4 border-purple-400 focus-within:border-purple-500 hover:bg-purple-50/20' 
                : 'border-l-4 hover:border-l-4 border-amber-400 focus-within:border-amber-500 hover:bg-amber-50/20';

              return (
                <div 
                  key={rule.id} 
                  className={`p-4 border border-slate-200 focus-within:border-indigo-300 rounded-xl bg-slate-50/40 space-y-3 transition duration-150 ${borderAccentColor}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                    <span className="font-extrabold text-sm text-slate-800 uppercase tracking-tight">{rule.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-bold">Daily Allowance Rate:</span>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-indigo-700 text-xs font-black">₹</span>
                        <input
                          type="number"
                          className="w-24 pl-6 pr-2 py-1 border-2 border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-505 rounded text-sm font-black font-mono bg-white text-indigo-805"
                          value={rule.ratePerDay}
                          onChange={(e) => handleRateChange(rule.id, Number(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 text-slate-700 text-xs text-left font-semibold">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Minimum Basic Pay:</span>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none text-slate-550 font-bold text-[10px]">₹</span>
                        <input
                          type="number"
                          className="w-28 pl-5 pr-2 py-1 border-2 border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400 rounded text-xs font-black font-mono bg-white"
                          value={rule.basicPayMin}
                          onChange={(e) => handleRangeChange(rule.id, 'basicPayMin', Number(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Maximum Basic Pay:</span>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none text-slate-550 font-bold text-[10px]">₹</span>
                        <input
                          type="number"
                          className="w-28 pl-5 pr-2 py-1 border-2 border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400 rounded text-xs font-black font-mono bg-white"
                          value={rule.basicPayMax}
                          onChange={(e) => handleRangeChange(rule.id, 'basicPayMax', Number(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t-2 border-slate-200">
            <button
              onClick={onBack}
              className="px-4 py-2 border-2 border-slate-250 hover:bg-slate-50 text-slate-550 rounded-lg text-sm font-extrabold transition cursor-pointer"
            >
              Cancel / निरस्त करें
            </button>
            <button
              onClick={saveAll}
              className="px-5 py-2 bg-gradient-to-r from-violet-500 hover:from-violet-600 to-indigo-600 hover:to-indigo-700 text-white rounded-lg text-sm font-black transition flex items-center gap-1.5 shadow-md border border-violet-300/30 cursor-pointer"
            >
              <Save className="w-4 h-4 text-violet-100" />
              Save Rates Rules / नियम सुरक्षित करें
            </button>
          </div>
        </div>

        {/* Regulatory Guideline Note Columns */}
        <div className="bg-gradient-to-br from-amber-50/70 to-orange-50/40 border-2 border-amber-200 rounded-xl p-5 shadow-xs h-fit space-y-4">
          <div className="flex gap-3 text-amber-800">
            <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600 animate-bounce" />
            <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider">Regulatory Guidelines / नियम पुस्तिका</h4>
          </div>
          
          <div className="space-y-4 text-xs text-slate-700 leading-relaxed text-left font-medium">
            <p>
              Under Indian Railways TA rulebook, TA/Daily Allowance (DA) is paid when RPF employees go on duty out of temporary station or headquarters. 
            </p>
            <p>
              The rate depends entirely on the pay slab levels. High-ranking Inspectors and Sub-Inspectors are entitled to higher rates than Constables.
            </p>
            <div className="p-3.5 bg-white border border-amber-200 rounded-lg text-[11px] font-mono text-amber-900 leading-normal shadow-3xs">
              <strong>Quick Rule Reference (Hiked +25%!)</strong>:
              <ul className="list-disc pl-4 mt-1.5 space-y-1 font-bold">
                <li>Level 1-5: ₹625 / day</li>
                <li>Level 6-8: ₹1000 / day</li>
                <li>Level 9-11: ₹1125 / day</li>
                <li>Level 12-13: ₹1250 / day</li>
                <li>Level 14+: ₹1500 / day</li>
              </ul>
            </div>
            <p>
              These rates govern the maximum potential payout, while the exact calculated amount per row is adjusted utilizing the 30% / 70% / 100% absence hours rule.
            </p>
          </div>
        </div>

      </div>

      {/* Custom Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" id="reset-confirm-modal">
          <div className="bg-[#f8f7f4] rounded-xl shadow-xl border border-stone-200 p-6 max-w-sm w-full text-left">
            <h3 className="text-xs font-black uppercase tracking-wider text-rose-600 border-b border-stone-200 pb-2 mb-3">
              Reset Allowance Rates / दरें रीसेट करें
            </h3>
            <p className="text-xs text-stone-700 leading-relaxed mb-6">
              Are you sure you want to reset all rates and pay brackets to standard 7th Central Pay Commission defaults used by Indian Railways?
            </p>
            <div className="flex gap-2.5 justify-end text-xs font-bold leading-none">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg text-stone-700 transition"
              >
                Cancel / निरस्त करें
              </button>
              <button
                type="button"
                onClick={confirmReset}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition"
              >
                Yes, Reset Rates
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
