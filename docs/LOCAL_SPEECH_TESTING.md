# Local speech acceptance tests

Last checked: November 21, 2026. Review baseline: `3851a03`.

## What changed and what is feasible

Lines remains a static React/TypeScript/Vite app on GitHub Pages. Student takes
stay in memory: MediaRecorder -> OfflineAudioContext -> mono 16 kHz Float32 PCM
-> local Transformers.js worker -> local word comparison. The optional ElevenLabs
key is now TTS-only tooling for the existing character performances, not student
recognition. No account, class code or transcription API key is needed by a child.

This release uses pinned, quantized Whisper base.en on WASM/CPU. WebGPU q8
returned gibberish on a real test clip on this computer; it is disabled. A full
verbatim target speech in Whisper's history prompt made it skip words. Instead,
the prompt includes a Shakespeare glossary and short sorted vocabulary lists
from the target and prior lines. Actual tokenizer budgets are 55 + 32 + 64 tokens,
well below 224. Context is a recognition hint, never a replacement transcript.

First use needs an internet connection to download roughly 80 MB of model files
plus the runtime. The browser caches software, not student recordings. Browser
storage can be cleared or evicted, so offline recognition depends on the cache.
CPU speed and memory vary substantially across phones; this is feasible as a
practice aid, not a validated assessment of children's recall or pronunciation.

Moonshine is a worthwhile separate on-device benchmark, especially for latency.
There is no evidence here that it recognizes these children's Shakespeare better.
Keep any comparison fixed to the same audio, target, normalization and devices.
Do not switch back to a cloud service automatically on any failure.

## What was actually verified

- All 53 automated tests passed, including the three user-approved boundaries:
  transcription API, compareSpeech and rehearsal UI. Typecheck and build passed.
- Real browser inference, not an API mock: the existing synthetic Queen Mab
  performance returned the complete speech, matched 103/106 target words (97.17%)
  and took about 9.88 seconds on this computer with downloaded model files.
- With the same audio but a Romeo target, the actual transcript remained Queen
  Mab and accuracy was 0, rather than copying the supplied target (7.88 seconds).
- One second of digital silence returned an empty transcript and accuracy 0.
- Automated browser-API doubles exercise cancellation, broken-worker retry,
  overlong audio, microphone permission denial, model-loading feedback and typing
  with the microphone off. These do not benchmark model accuracy.

The synthetic performance is not a child/accent benchmark. Real microphone use
on each supported phone/browser, warm-cache airplane mode, cache eviction and
network failure still require the manual checks below. Do not treat an unrun
check as a pass. Timing and recognized words can vary by browser/device.

## Quick parent/teacher test

1. Refresh the app, open App settings and enable microphone features. Turn on
   Show transcription details during this test. Prepare speech model; wait for
   the ready message before starting. Initial download can take some time.
2. Select Mercutio -> Act 1, Scene 4 -> Queen Mab -> whole-speech practice.
   Reading and character playback should work with microphone features off too.
3. Tap Listen to me, allow the browser microphone permission, recite, then Done.
   Expected: local checking state, followed by a transcript and word feedback.
   Read the raw transcript before interpreting red words as recitation mistakes.
4. Try again with one deliberate omission or replacement. Expected: the genuinely
   missing/different word is marked. Say a wrong word followed by its correction;
   expected: the corrected word in the correct order can count.
5. Try “Oh” for printed “O”, “over”/“or” for printed “o'er”, and “it is” for “'tis”.
   Those spelling variants should match. An unrelated substitution such as
   “hate” for “love”, “these” for “those”, or “living” for “loving” should still fail. Extra false starts are deliberately unscored.
6. Use It misheard. Let me type to recover from a recognition error. Type the first
   letter of each word. Leave microphone features off for normal typed practice.

Do not expect every accurate performance to score 100%. Matching deliberately
allows minor spelling errors; it is not a pronunciation assessment. Do not
record or upload children for a benchmark without the program's permission.

## Expected failures and recovery

| Test | How to cause it | Passing behavior |
| --- | --- | --- |
| Microphone off | Turn off Allow microphone features | Listening disabled; typed practice and character playback still work; no model needed. |
| Permission denied | Block microphone permission for the site, then Listen to me | Clear permission message, retry remains available, typing works. Restore browser permission to retry. |
| Cancel model load | On a fresh test browser, start Prepare speech model, then Cancel preparation | Preparation stops; no microphone opens; prepare can be tried again. Completed cache entries may remain. |
| Cancel take/check | Cancel while recording or checking | Microphone stops; no late result appears; another attempt or typing works. |
| Silent/wrong speech | Stay silent, or recite a different speech | Silence should not generate the target; wrong words should not receive full credit. Noise can still fool recognition: inspect transcript. |
| Cold offline / blocked model host | In a separate test browser with no model cache, go offline or block huggingface.co in DevTools | Model cannot initialize; an error and typing fallback appear. Never falls back to browser/cloud recognition. Reconnect and retry. |
| Warm offline | First complete model preparation and one check online; reload with DevTools Network set Offline | Already-cached app/runtime/model should load and recognition should run locally. If it fails, record which file is missing; do not claim offline support for that device yet. |
| Cache cleared | Clear site data in a disposable test profile, then prepare offline | Same expected failure as cold offline. Clearing the real profile also erases its progress. |
| Bad/overlong clip | In development harness, choose a text file or audio longer than 5 minutes | No recognition result; recover by selecting valid audio. No upload occurs. |
| Slow/unsupported device | Test a low-memory phone or a browser without required WebAssembly/AudioContext APIs | May fail or take longer; cancellation/typing remain usable. Do not conceal the failure with cloud recognition. |

Keep the tab in the foreground for timing. Test Safari/iPhone, Chrome/Android and
school-managed devices individually; microphone access needs HTTPS or localhost.

## Privacy/network check

Open browser developer tools -> Network, enable Preserve log and show Method.
Prepare the model, record a take, finish checking and cancel another attempt.
First use may GET model/tokenizer/config files from the pinned Hugging Face
revision and runtime/site assets from Lines. Weight downloads may redirect to
Hugging Face's download infrastructure. Subsequent checks use the local worker.
There must be no POST/WebSocket request carrying audio, no /api/transcribe call,
no ElevenLabs speech-to-text or DELETE call and no browser SpeechRecognition
session. Inspect request URLs and bodies, not just the hostname list.

Ordinary website/model downloads reveal connection metadata to their hosts. This
is different from uploading a student's voice. The prerecorded MP3s are AI
character performances already published with the play, not student recordings.

## Developer reproduction

    npm ci
    npm run dev -- --host 127.0.0.1 --port 5176

Open http://127.0.0.1:5176/#/local-audio-test. This route is development only and
is removed from the production build.

- Load synthetic Queen Mab performance -> Check locally. Inspect the complete
  transcript (especially the ending) and accuracy. The recorded reference result
  was 97.17%; a large regression or missing section should block release.
- Without replacing the audio, change Target line to “Romeo, Romeo, wherefore art
  thou Romeo?” and check. Expected accuracy: 0 for this fixture; transcript should
  remain Queen Mab, not the supplied target.
- Load silence -> Check locally. Expected text: empty, accuracy: 0.
- Start a check, Cancel, then run again. Expected: cancelled job never updates a
  later attempt. Test permission denial/retry in the real rehearsal UI as well.

Automated checks (browser/system boundaries are doubled; app modules are real):

    npx vitest run tests/transcription.test.ts
    npx vitest run tests/compare-speech.test.ts
    npx vitest run tests/rehearsal-ui.test.ts
    npm test
    npm run build

Model inference stays a real-browser acceptance check because a Worker double
cannot establish acoustic accuracy. Re-run after changing model, runtime,
backend, context budget or decoding. Compare both accurate and intentionally
incorrect speech; never tune solely to make the expected script score higher.
