import { BaseVoiceProvider } from './voice.provider';
import { SpeechResult, VoiceError, VoiceProviderConfig } from './voice.types';

export class WebSpeechVoiceProvider extends BaseVoiceProvider {
  private recognition: any = null;
  private isSpeakingInternal = false;

  constructor(config: VoiceProviderConfig = {}) {
    super(config);
    this.setupVisibilityListener();
  }

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      return !!SpeechRecognition;
    } catch (err) {
      console.warn('WebSpeechVoiceProvider isSupported check failed:', err);
      return false;
    }
  }

  private setupVisibilityListener(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.isSpeakingInternal) {
          this.cancelSpeech();
        }
      });
    }
  }

  private getRecognitionInstance(): any {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.recognition) {
        const SpeechRecognition =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          this.recognition = new SpeechRecognition();
          this.recognition.lang = this.config.lang || 'en-US';
          this.recognition.continuous = !!this.config.continuous;
          this.recognition.interimResults = !!this.config.interimResults;
        }
      }
      return this.recognition;
    } catch (err) {
      console.warn('Failed to get SpeechRecognition instance:', err);
      return null;
    }
  }

  public startListening(
    onResult: (result: SpeechResult) => void,
    onError: (error: VoiceError) => void
  ): void {
    const rec = this.getRecognitionInstance();
    if (!rec) {
      onError({
        code: 'NOT_SUPPORTED',
        message: 'SpeechRecognition API is not supported in this browser environment.',
      });
      return;
    }

    rec.onresult = (event: any) => {
      // Prevent handling user speech while speech synthesis is active (prevents feedback loop)
      if (this.isSpeakingInternal) return;

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const res = event.results[i];
        const transcript = res[0]?.transcript || '';
        const isFinal = res.isFinal;
        const confidence = res[0]?.confidence;

        onResult({
          transcript: transcript.trim(),
          isFinal,
          confidence: confidence !== undefined ? confidence : 1.0,
          timestamp: Date.now(),
        });
      }
    };

    rec.onerror = (event: any) => {
      console.warn('WebSpeech API recognition error:', event.error || event);
      onError({
        code: 'SPEECH_RECOGNITION_ERROR',
        message: event.error || 'Speech recognition error occurred.',
      });
    };

    try {
      rec.start();
    } catch (err: any) {
      console.warn('WebSpeech rec.start() failed:', err?.message || err);
      onError({
        code: 'START_FAILED',
        message: err?.message || 'Failed to start speech recognition.',
      });
    }
  }

  public stopListening(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore if already stopped
      }
    }
  }

  /**
   * Helper to select a natural female voice from available SpeechSynthesis voices.
   * Strictly excludes male voice models.
   */
  private selectFemaleVoice(): any {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    const maleKeywords = ['male', 'david', 'mark', 'george', 'richard', 'james', 'alex', 'daniel', 'fred', 'guy', 'stefan', 'ravi', 'prabhat'];

    // Filter out known male voices
    const nonMaleVoices = voices.filter((v: any) => {
      const name = (v.name || '').toLowerCase();
      return !maleKeywords.some((m) => name.includes(m));
    });

    const femaleVoiceKeywords = [
      'zira',
      'jenny',
      'samantha',
      'victoria',
      'veena',
      'female',
      'google uk english female',
      'google us english female',
      'karen',
      'fiona',
      'moira',
      'aria',
      'eva',
      'hazel',
      'susan',
    ];

    // 1. Try to find a female English voice
    const femaleEnglishVoice = nonMaleVoices.find((v: any) => {
      const name = (v.name || '').toLowerCase();
      const lang = (v.lang || '').toLowerCase();
      return lang.startsWith('en') && femaleVoiceKeywords.some((kw) => name.includes(kw));
    });
    if (femaleEnglishVoice) return femaleEnglishVoice;

    // 2. Fallback to any non-male voice with 'female' or non-male name
    const anyFemaleVoice = nonMaleVoices.find((v: any) => (v.name || '').toLowerCase().includes('female'));
    if (anyFemaleVoice) return anyFemaleVoice;

    // 3. Fallback to any non-male English voice
    const englishVoice = nonMaleVoices.find((v: any) => (v.lang || '').toLowerCase().startsWith('en'));
    return englishVoice || nonMaleVoices[0] || voices[0] || null;
  }

  public speak(
    text: string,
    onEnd?: () => void,
    onError?: (err: VoiceError) => void
  ): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (onEnd) onEnd();
      return;
    }

    try {
      this.isSpeakingInternal = true;
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.2; // Pleasant, natural female pitch inflection

      const femaleVoice = this.selectFemaleVoice();
      if (femaleVoice) {
        utterance.voice = femaleVoice;
      }

      utterance.onend = () => {
        this.isSpeakingInternal = false;
        if (onEnd) onEnd();
      };

      utterance.onerror = (e) => {
        this.isSpeakingInternal = false;
        if (onError)
          onError({
            code: 'SPEECH_SYNTHESIS_ERROR',
            message: e.error || 'Speech synthesis failed.',
          });
      };

      window.speechSynthesis.speak(utterance);
    } catch (err: any) {
      this.isSpeakingInternal = false;
      if (onError)
        onError({
          code: 'SYNTHESIS_FAILED',
          message: err?.message || 'Failed to trigger speech synthesis.',
        });
    }
  }

  public cancelSpeech(): void {
    this.isSpeakingInternal = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}
