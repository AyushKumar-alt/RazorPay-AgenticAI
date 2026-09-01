import { VoiceProvider, SpeechResult, VoiceError, VoiceProviderConfig } from './voice.types';

export abstract class BaseVoiceProvider implements VoiceProvider {
  protected config: VoiceProviderConfig;

  constructor(config: VoiceProviderConfig = {}) {
    this.config = {
      lang: 'en-US',
      continuous: false,
      interimResults: true,
      allowSingleWordFallback: false,
      ...config,
    };
  }

  public abstract isSupported(): boolean;
  public abstract startListening(
    onResult: (result: SpeechResult) => void,
    onError: (error: VoiceError) => void
  ): void;
  public abstract stopListening(): void;
  public abstract speak(
    text: string,
    onEnd?: () => void,
    onError?: (err: VoiceError) => void
  ): void;
  public abstract cancelSpeech(): void;
}
