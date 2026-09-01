import React from 'react';
import { AgentTurn } from '@/types/agent';

interface VoiceTranscriptProps {
  turns: AgentTurn[];
  onClearChat?: () => void;
}

export const VoiceTranscript: React.FC<VoiceTranscriptProps> = ({ turns, onClearChat }) => {
  if (!turns || turns.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-slate-500 italic">
        Say &quot;Hey Adam&quot; or tap the microphone to start shopping.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 text-xs">
        <span className="font-semibold text-slate-600">Chat History ({turns.length} messages)</span>
        {onClearChat && (
          <button
            type="button"
            onClick={onClearChat}
            className="text-red-500 hover:text-red-700 text-[11px] font-medium flex items-center gap-1 hover:underline cursor-pointer"
            title="Delete chat history"
          >
            🗑 Clear Chat
          </button>
        )}
      </div>

      <div
        className="flex flex-col space-y-3 max-h-72 overflow-y-auto p-3 bg-slate-50 rounded-lg border border-slate-200"
        aria-label="Conversation history"
      >
      {turns.map((turn) => {
        const isUser = turn.actor === 'USER';
        const formattedTime = new Date(turn.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });

        return (
          <div
            key={turn.turnId}
            className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center space-x-1 text-xs text-slate-400 mb-1">
              <span className="font-semibold text-slate-700">
                {isUser ? 'You' : 'Adam'}
              </span>
              <span>•</span>
              <span>{formattedTime}</span>
            </div>
            <div
              className={`max-w-[85%] px-3.5 py-2 rounded-xl text-sm leading-relaxed ${
                isUser
                  ? 'bg-blue-600 text-white rounded-br-none shadow-sm'
                  : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none shadow-sm'
              }`}
            >
              {isUser ? turn.input : turn.response}
            </div>

            {/* Display status of active tool calls concisely if present */}
            {!isUser && turn.toolCalls && turn.toolCalls.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-slate-500">
                {turn.toolCalls.map((tc, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 border border-slate-200"
                  >
                    ✓ {tc.tool}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
};
