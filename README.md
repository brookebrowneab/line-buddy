# Line Buddy: Romeo and Juliet

A small web app that helps a cast learn their lines with short games. It is a
static site with on-device speech recognition: no student accounts, no transcription server. Each kid's progress is stored only in
their own browser.

## Everyday commands

    npm install        # once (on Linux, prefix ONNXRUNTIME_NODE_INSTALL_CUDA=skip)
    npm run dev        # run the app locally
    npm run script     # rebuild the script data and print the check report
    npm test           # parser, cue and progress tests
    npm run build      # full production build into dist/

## Changing the script

The script lives in two plain files:

- `script/romeo-and-juliet.txt` is the play. Scene headings look like
  `=== ACT 1, SCENE 1 ===`, a speaker is a capitalised name ending in a colon
  (`ROMEO:` or `NURSE [offstage]:`), stage directions are in `[square brackets]`,
  a line starting with `=` under a speech is its plain-English meaning, and a
  line starting with `>` is its thought cue (what has just happened that makes
  the character speak).
  Verse keeps one line per line. Edit it in any text editor.
- `script/roles.yml` says which speaker labels belong to which cast role,
  which house each role is in, and the friendly scene names. Lines marked
  `REVIEW` are casting decisions worth a second look.

- `script/scenes.yml` holds a short summary of each scene and one line per
  speaking character saying what they want in it.

After any edit run `npm run script`. It prints speeches, lines and words per
role and stops with a list of problems if a speaker is not in `roles.yml`.
Kids keep their progress on every line whose words did not change.

## Starting a new play

    node scripts/import-pdf.mjs "path/to/script.pdf" script/new-play.txt

The importer expects `SPEAKER:` on its own line, directions in brackets and
`ACT I` / `[SCENE 1.]` headings. Then write a `roles.yml` for the new cast and
point `scripts/build-script.mjs` at the new file.

## Where things are

- `scripts/` import and build the script data
- `src/lib/script.ts` cues, bite-sized parts, word helpers
- `src/lib/progress.ts` mastery levels, review dates, streaks (browser storage)
- `src/lib/games.ts` the eight games and "Today's practice"
- `src/cards.tsx`, `src/runs.tsx` the games themselves
- `src/App.tsx` screens: role picker, scene path, scene, read-through, progress

Script text adapted from the Folger Shakespeare edition, edited by Barbara A.
Mowat and Paul Werstine.

## Local speech recognition

Student audio is never uploaded. React/Vite records WebM/Opus, MP4 or Ogg with
MediaRecorder, then OfflineAudioContext downmixes/resamples it to mono Float32
PCM at 16 kHz in memory. A dedicated worker runs Transformers.js 3.8.1 with the
pinned onnx-community/whisper-base.en revision in src/lib/whisper-core.ts, using
quantized weights and the local WASM CPU engine. WebGPU is deliberately disabled:
a real-audio acceptance test produced invalid q8 GPU output on the test device. There is no Web
Speech API or online inference fallback. Microphone features default off.

The first use downloads model files from Hugging Face; Cache Storage retains
weights for subsequent use. prepare-local-stt copies the browser runtime from
the installed dependency for same-origin hosting. The PWA caches runtime files
on demand. Model and runtime caches may be evicted: offline use requires a
completed initial download. WASM uses one thread on GitHub Pages, which does
not provide cross-origin isolation headers. Slower devices may need more time;
Cancel terminates the worker and releases the current take. After the microphone
opens, a one-second recording lead-in precedes the Speak now cue. This is a
startup precaution; it does not establish why a recognition word was omitted.

transcribeRecording(audio, signal, targetLine, previousContextLines?) returns
text, model, hit, said, wordMatches and accuracy (0–1). It never calls fetch,
FormData, an inference API or a file writer. The worker's fetch guard permits
only GET downloads of pinned model files and same-origin runtime files. No
external telemetry is added. Model downloads still reveal ordinary connection
metadata to the model host; local audio does not make all web traffic anonymous.

Whisper's context stays below 223 tokens. It includes a relevant Shakespeare
vocabulary list plus sorted vocabulary derived from the prior lines and current
target (55 / 32 / 64 token budgets). A verbatim future speech caused Whisper to
skip words in real acceptance tests, so context supplies vocabulary rather than
the entire answer in spoken order. The stable
JS runtime does not implement prompt_ids; decoder_input_ids implements the real
startofprev/context/startoftranscript prefix. The prefix is removed from generated
output before decoding so it cannot count as recognized speech. Silence is
rejected using audio energy. Prompt conditioning can still cause guessing: this
is rehearsal feedback, not a formal assessment. Soundex plus a conservative
edit-distance threshold complements the existing order-aware, self-correction
and contraction matching. Fuzzy spelling tolerance is limited to Shakespeare
vocabulary and the existing long-word plural tolerance; ordinary substitutions
such as these/those and living/loving remain incorrect. Explicit recognition tolerances
cover printed o’er heard as o/oh/or, printed Nay heard as May, and our/are.
The raw transcript is retained; these rules change feedback, not the recording.

Typed practice, skips, whole speeches and prerecorded character playback remain
available without microphone access. Old browser/ElevenLabs settings migrate to
local recognition while retaining the microphone preference and progress.

## Maintainer-only prerecorded character audio

The existing 361 MP3 character performances remain static files in public/audio/.
They are not recordings of students. The optional scripts/generate-audio.mjs
uses ELEVENLABS_TTS_API_KEY only to generate performances from the printed script.
Keep this optional key in the ignored .env; no recognition code reads it and it
never enters a client bundle. npm run audio:generate incurs provider charges.
The index in src/data/recordings.json fingerprints script text and voice choices.
Generation receipts stay in ignored .audio-work/, outside public assets.

## Hosting and privacy

GitHub Pages serves lines.adcatheatre.com. npm run build produces dist/ including
same-origin runtime assets. No Cloudflare speech backend or class code is needed
for the local-only app. Do not restore upload proxies or browser-vendor speech
recognition as a fallback. Previous provider-held recordings are not erased by
this migration; refer families to the privacy contact for historical requests.

Public #/privacy and #/parents routes explain current local processing, software
downloads, device storage and earlier versions. Contact: Brooke Brown, parent
volunteer for ADCA, adcatheatreinfo@gmail.com; ADCA c/o Alice Deal Middle School,
3815 Fort Dr. NW, Washington, DC 20016; school main office (202) 939-2010.

The development-only #/local-audio-test route exercises real local inference on
a selected generated clip. It is unreachable and tree-shaken in production.

See [local speech testing](docs/LOCAL_SPEECH_TESTING.md) for successful and expected-failure checks, actual results and device limitations.

## Learning a scene with context

Understand and Thought Cues open with the scene summary, speaking characters and
selected character's goal from the existing script metadata. Focused practice
shows two complete preceding speeches and intervening stage directions; Show
more before this expands backward without revealing the current answer or future
speech. A scene reminder stays available during questions.

Learn this scene in order follows the character's speeches chronologically,
revealing every intervening turn as the actor advances. Earlier dialogue stays
in an expandable history, with a return-to-current control. Understand's shuffled
meaning quiz and delayed wrong-answer retries are omitted in this mode to retain
script order; Thought Cues still reveals and explains a mistaken response right
away. The completion screen includes the entire scene, including the ending after
the actor's final speech. Skipping continues to leave those questions' progress
unchanged. No additional data collection, microphone or network service is used.

`tests/scene-learning.test.ts` covers these learning UI behaviors, including
single-speech roles, hidden future dialogue, chronological progression, expanded
history, final-scene reading and incorrect-answer handling.

Speed Run checks complete speeches, including every word of Queen Mab; it no longer
checks only a short opening. Its microphone limit is five minutes per speech,
matching whole-speech practice. Full-speech best times use a separate versioned
record; old excerpt-only records remain stored and are not compared with the
longer challenge.

## Separate word memory and cue recognition

The suggested scene path is Understand, Thought Cues, Cue Catch, Scramble, First
Letters, Vanishing Words, Say It, Scene Partner, then optional Speed Run. Screens
group these into context, recognition/arrangement, word recall and performance.

`wordItems` stores word-check outcomes. Cue Catch writes only per-speech `cues`
results (latest outcome, attempts, catches/misses and read/listen mode). Home,
scene and progress screens show cue recognition independently of word memory.
Cue results do not change word mastery, trouble lines or word-review scheduling.
Context-only study and script-in-hand rehearsal count as activity without word
credit. Scramble provides limited supported-word credit; progressively less
supported word checks can raise the word level further.

Older `items` scores mixed several activities and cannot be separated reliably.
They remain intact as earlier practice history, together with completed games,
streaks and settings; they are not treated as verified word-memory evidence.
New word and cue records start separately. Export/import preserves all three
sets, and the progress screen explains the earlier history. Progress remains on the device; this change adds no accounts, identifiers
or uploads.
