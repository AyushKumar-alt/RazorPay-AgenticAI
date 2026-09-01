import { detectWakeWord } from './wakeword';
import { WebSpeechVoiceProvider } from './webspeech.provider';
import { SpeechResult, SpeechState } from './voice.types';

async function runVoiceTests() {
  console.log('--- RUNNING PHASE 7A VOICE FOUNDATION TEST SUITE ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // A. Wake word detection tests
  // 1. "Hey Adam"
  const res1 = detectWakeWord('Hey Adam, I need a wireless mouse under ₹1,000');
  assert(
    res1.isWakeWordDetected && res1.detectedKeyword === 'hey adam' && res1.remainingText === 'I need a wireless mouse under ₹1,000',
    'Test A1: Canonical "Hey Adam" wake word detected and prompt extracted'
  );

  // 2. "hey adam!" punctuation variant
  const res2 = detectWakeWord('hey adam! find a yoga mat');
  assert(
    res2.isWakeWordDetected && res2.detectedKeyword === 'hey adam' && res2.remainingText === 'find a yoga mat',
    'Test A2: "hey adam!" punctuation variant detected'
  );

  // 3. "HEY ADAM" uppercase variant
  const res3 = detectWakeWord('HEY ADAM SHOW ME BOTTLES');
  assert(
    res3.isWakeWordDetected && res3.detectedKeyword === 'hey adam' && res3.remainingText === 'SHOW ME BOTTLES',
    'Test A3: "HEY ADAM" uppercase variant detected'
  );

  // 4. "Adam" without fallback option enabled -> false
  const res4 = detectWakeWord('Adam search for yoga mat');
  assert(
    !res4.isWakeWordDetected && res4.detectedKeyword === null,
    'Test A4: Single word "Adam" rejected in canonical mode (allowSingleWordFallback=false)'
  );

  // 5. "Adam" with fallback option enabled -> true
  const res5 = detectWakeWord('Adam search for yoga mat', { allowSingleWordFallback: true });
  assert(
    res5.isWakeWordDetected && res5.detectedKeyword === 'adam' && res5.remainingText === 'search for yoga mat',
    'Test A5: Single word "Adam" detected when allowSingleWordFallback=true'
  );

  // 6. Negative example: sentence containing "Adam" inside
  const res6 = detectWakeWord('I bought this for Adam yesterday');
  assert(
    !res6.isWakeWordDetected && res6.detectedKeyword === null && res6.remainingText === 'I bought this for Adam yesterday',
    'Test A6: Sentence with "Adam" inside rejected (no false positive)'
  );

  // B. SpeechResult structure tests
  const resultSample: SpeechResult = {
    transcript: 'Hello Adam',
    isFinal: true,
    confidence: 0.98,
    timestamp: Date.now(),
  };
  assert(
    resultSample.isFinal === true && typeof resultSample.timestamp === 'number' && resultSample.confidence === 0.98,
    'Test B1: SpeechResult structure contains transcript, isFinal, confidence, and timestamp'
  );

  // C. SpeechState values test
  const validStates: SpeechState[] = ['IDLE', 'LISTENING', 'PROCESSING', 'SPEAKING', 'ERROR'];
  assert(
    validStates.length === 5 && validStates.includes('IDLE') && validStates.includes('SPEAKING'),
    'Test C1: SpeechState covers IDLE, LISTENING, PROCESSING, SPEAKING, ERROR'
  );

  // D. Provider capability behavior in Node environment
  const provider = new WebSpeechVoiceProvider();
  assert(
    provider !== null && typeof provider.isSupported === 'function' && typeof provider.speak === 'function',
    'Test D1: WebSpeechVoiceProvider initializes safely without window/DOM globals in Node/SSR'
  );

  console.log(`\nTEST RESULTS SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runVoiceTests();
