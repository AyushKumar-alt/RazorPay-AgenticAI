export type SpeechState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'ERROR';

export interface SpeechResult {
  transcript: string;
  isFinal: boolean;
  confidence?: number;
  timestamp: number;
}

export interface VoiceError {
  code: string;
  message: string;
}

export interface VoiceProviderConfig {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  allowSingleWordFallback?: boolean;
}

export interface VoiceProvider {
  isSupported(): boolean;
  startListening(
    onResult: (result: SpeechResult) => void,
    onError: (error: VoiceError) => void
  ): void;
  stopListening(): void;
  speak(text: string, onEnd?: () => void, onError?: (err: VoiceError) => void): void;
  cancelSpeech(): void;
}
