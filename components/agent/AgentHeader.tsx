import React from 'react';
import { AgentSessionState } from '@/types/agent';
import { AgentVoiceOrb } from './AgentVoiceOrb';

interface AgentHeaderProps {
  state: AgentSessionState;
  isVoiceSupported: boolean;
  onMicClick?: () => void;
  onPanelToggle?: () => void;
  isPanelOpen?: boolean;
}

export const AgentHeader: React.FC<AgentHeaderProps> = ({
  state,
  isVoiceSupported,
  onMicClick,
  onPanelToggle,
  isPanelOpen = false,
}) => {
  const getStatusBadge = () => {
    switch (state) {
      case 'LISTENING':
        return { label: 'Listening...', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'PROCESSING':
      case 'SEARCHING':
      case 'EVALUATING':
        return { label: 'Working...', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'SPEAKING':
        return { label: 'Speaking...', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'AWAITING_HUMAN_APPROVAL':
        return { label: 'Approval Required', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'IDLE':
      default:
        return { label: 'Say "Hey Adam"', bg: 'bg-slate-50 text-slate-600 border-slate-200' };
    }
  };

  const badge = getStatusBadge();

  return (
    <div className="flex items-center space-x-3 bg-white border border-slate-200 rounded-full px-3.5 py-1.5 shadow-sm">
      {/* Orb activity indicator */}
      <AgentVoiceOrb state={state} size="sm" />

      {/* Agent name & status badge */}
      <div className="flex items-center space-x-2">
        <span className="font-semibold text-slate-900 text-xs">Adam</span>
        <span
          className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${badge.bg}`}
        >
          {badge.label}
        </span>
      </div>

      {/* Microphone toggle button */}
      <button
        type="button"
        onClick={onMicClick}
        disabled={!isVoiceSupported}
        aria-label={
          state === 'LISTENING' ? 'Stop listening' : 'Start Adam voice agent'
        }
        className={`p-1.5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          state === 'LISTENING'
            ? 'bg-blue-600 text-white shadow-sm'
            : isVoiceSupported
            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            : 'bg-slate-100 text-slate-300 cursor-not-allowed'
        }`}
        title={
          isVoiceSupported
            ? 'Click to start voice agent or say "Hey Adam"'
            : 'Voice input not supported in this browser'
        }
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z"
          />
        </svg>
      </button>

      {/* Toggle Agent Panel button */}
      <button
        type="button"
        onClick={onPanelToggle}
        aria-label={isPanelOpen ? 'Close Adam Agent Panel' : 'Open Adam Agent Panel'}
        className="text-xs font-semibold text-blue-600 hover:text-blue-700 pl-1 focus:outline-none"
      >
        {isPanelOpen ? 'Hide' : 'Open Panel'}
      </button>
    </div>
  );
};
