import React from 'react';
import { AgentSessionState } from '@/types/agent';

interface AgentVoiceOrbProps {
  state: AgentSessionState;
  size?: 'sm' | 'md' | 'lg';
}

export const AgentVoiceOrb: React.FC<AgentVoiceOrbProps> = ({
  state,
  size = 'md',
}) => {
  const dimensionClass =
    size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';

  const getStatusColor = () => {
    switch (state) {
      case 'LISTENING':
        return 'bg-blue-600 border-blue-400 animate-pulse';
      case 'PROCESSING':
      case 'SEARCHING':
      case 'EVALUATING':
        return 'bg-indigo-600 border-indigo-400 animate-spin';
      case 'SPEAKING':
        return 'bg-emerald-600 border-emerald-400 animate-bounce';
      case 'ACTIVATING':
        return 'bg-amber-500 border-amber-300 animate-ping';
      case 'IDLE':
        return 'bg-slate-400 border-slate-300';
      default:
        return 'bg-slate-500 border-slate-300';
    }
  };

  return (
    <div className={`relative flex items-center justify-center ${dimensionClass}`}>
      <div
        className={`absolute inset-0 rounded-full border-2 opacity-75 ${getStatusColor()}`}
      />
      <svg
        className="w-4 h-4 text-white relative z-10"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        {state === 'LISTENING' ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z"
          />
        ) : state === 'SPEAKING' ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
          />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        )}
      </svg>
    </div>
  );
};
