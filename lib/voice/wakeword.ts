export interface WakeWordMatchResult {
  isWakeWordDetected: boolean;
  detectedKeyword: string | null;
  remainingText: string;
}

export interface WakeWordOptions {
  allowSingleWordFallback?: boolean;
}

/**
 * Pure, deterministic wake word detector for "Hey Adam".
 * Canonical wake phrase: "hey adam"
 * Optional single-word fallback: "adam" (only if allowSingleWordFallback is true)
 * Returns activation signal and remaining prompt without side effects.
 */
export function detectWakeWord(
  rawText: string,
  options: WakeWordOptions = {}
): WakeWordMatchResult {
  if (!rawText || rawText.trim() === '') {
    return {
      isWakeWordDetected: false,
      detectedKeyword: null,
      remainingText: '',
    };
  }

  const text = rawText.trim();
  const lower = text.toLowerCase().replace(/[^\w\s]/g, '');

  // Canonical multi-word wake phrases
  const canonicalPhrases = ['hey adam', 'hi adam', 'hello adam', 'ok adam', 'okay adam'];

  for (const phrase of canonicalPhrases) {
    if (lower.startsWith(phrase)) {
      const kwLen = phrase.length;
      const remaining = text.substring(kwLen).replace(/^[,\s!.]+/, '').trim();
      return {
        isWakeWordDetected: true,
        detectedKeyword: phrase,
        remainingText: remaining,
      };
    }
  }

  // Optional single-word fallback "adam"
  if (options.allowSingleWordFallback) {
    if (lower.startsWith('adam')) {
      const remaining = text.substring(4).replace(/^[,\s!.]+/, '').trim();
      return {
        isWakeWordDetected: true,
        detectedKeyword: 'adam',
        remainingText: remaining,
      };
    }
  }

  return {
    isWakeWordDetected: false,
    detectedKeyword: null,
    remainingText: text,
  };
}
