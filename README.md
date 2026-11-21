# Line Buddy: Romeo and Juliet

A small web app that helps a cast learn their lines with short games. It is a
static site with an optional local transcription server: no accounts, no database. Each kid's progress is stored only in
their own browser.

## Everyday commands

    npm install        # once
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

## Comparing Browser and ElevenLabs listening

Requires Node 20.17 or newer (Node 22 recommended). The existing browser
recognition and first-letter typing remain available without ElevenLabs.

1. Copy `.env.example` to `.env` and set `ELEVENLABS_API_KEY` there. Use a key
   with Speech to Text access. Never use a `VITE_` variable for this key.
2. In one terminal run `npm run transcription`.
3. In another run `npm run dev` and open `http://localhost:5173`.
4. Open Settings from Home or a scene. Choose the speech recognition service
   once for all games on this device. Scribe v3 is the default. For comparison,
   enable “Show transcription details during practice”.
5. In a line check, click Listen to me, speak, and tap Done. To compare providers,
   change the service in Settings and return to practice. Transcription details
   show the latest raw take for the current question; leaving it clears that
   transcript. These are separate performances, not a same-recording benchmark.
   Both services use the same word-matching and mastery rules.

The server defaults to `scribe_v3`; change `ELEVENLABS_STT_MODEL` in `.env`
if your account needs another Scribe batch model. Provider name/model is shown
with its transcript. No expected script, vocabulary hints, or transcript editing
is sent, so this initial comparison has no script bias or optional add-on fees.
Recordings stop at 90 seconds; uploads are capped at 8 MiB. Microphone tracks
are released on completion, cancellation, and leaving the check. The server
keeps audio only in memory during a request and does not log transcripts or keys.
Comparison transcripts stay in component memory and disappear on leaving the
check. This does not control ElevenLabs' own retention: review its account
settings and arrange appropriate consent before testing with children's voices.

### Deployment

GitHub Pages cannot run this server. On the existing Pages deployment, ElevenLabs
is unavailable and Browser/typing still work. The included server binds only to
127.0.0.1 for adult-led local comparisons. It accepts only configured app origins,
limits request size, and limits traffic to one active request and 30 per minute.
`ALLOWED_ORIGINS` must match the exact dev origin if Vite uses another port.
The Vite proxy targets port 8787; update it if changing TRANSCRIPTION_PORT.

For classroom deployment, host a backend behind the same HTTPS origin and route
`/api/transcription` and `/api/transcription/status` to it. Add user authentication,
per-user quotas, and access controls before exposing a paid endpoint publicly.
An origin check alone is not authentication. Do not put a permanent API key in
the frontend or publish `.env`. The client does not cache transcription requests.
No ElevenLabs account, key, or paid API calls are created by this change.

`npm test` covers the existing line checker, upload contract, microphone cleanup,
server validation, missing keys, and sanitized upstream errors using mocked
ElevenLabs responses. Live recognition quality must be evaluated with your key
and representative recordings; no relative accuracy claim is assumed.

### Forgiving speech checking

ElevenLabs recorded Scribe v3 is the default listening option; Browser remains
selectable for comparison. The server uses `scribe_v3` unless explicitly changed
with ELEVENLABS_STT_MODEL. The raw transcript is preserved, including false starts.
The checker accepts corrected words later in the same take and repeated lead-ins,
plus a curated set of equivalent spellings: cur’sies/curtsies, o’er/over,
ne’er/never, ’tis/it is, and sweetmeats/sweet meats, among others. This affects
spoken checks only; it does not rewrite Shakespeare’s text or the raw transcript.
Omitted words and unmatched substitutions still appear as unheard. This remains
a forgiving word-recall check, not a pronunciation or acting assessment.

### Skipping and targeting practice

“Skip for now” is available across question-based practice, Cue Catch, Scene
Partner, and Speed Run. It advances without recording a success, mistake,
mastery change, or practice-day credit for that item. A session containing skips
does not award game completion; a skipped Speed Run cannot set a best time.
Summaries report skipped items separately. Previously answered items keep their
results. Skipping does not permanently remove an item from future practice.

Question-based games also offer “Choose a later question” to jump directly to
an upcoming speech or part. Manual scene practice includes every scene part,
so a child can reach a later monologue even when the scene has more than eight
parts. Today's practice retains its short batch. The chooser shows the opening
words to identify the target; it is intentionally collapsed during recall.
Listening-service selection and optional transcription diagnostics live in App
settings, not in children's question controls. These settings are browser-local,
not a password-protected administrator console or a class-wide policy.

### Whole speeches or short parts

Say It, First Letters, Vanishing Words and Scramble ask “How much at once?”
when opened from a scene. Whole speeches presents each complete character turn
as one question. Short parts retains bite-sized chunks. The Change control lets
you choose again; any already recorded results are kept. Skip and direct question
selection work in either mode. Whole-speech results update the existing progress
IDs for all parts in that turn, so progress is shared between the two modes.
Scene Partner now checks every word of your speech rather than its opening only.
Whole-speech recordings allow up to five minutes (short-part recordings retain
the 90-second limit); the existing upload-size limit still applies.
Daily and trouble-line practice remain bite-sized. Speed Run retains its explicitly
labelled opening-only check for long speeches.

### Recorded character performances

All read-aloud calls use a saved character MP3 when there is a matching speech
ID, role and text. Scene Partner plays full speeches. Cue Catch starts at the
provider's timestamp for the final two lines of the same MP3; it does not pay to
generate a separate cue. The scene reader includes Hear speech / Stop controls.
Playback honors the existing speed setting and cancels on skip, pause or leaving
a scene. Missing/stale files and rejected playback fall back to the device voice.
Student microphone recordings are separate and never become character assets.

`config/tts-voices.json` maps each cast role to a consistent ElevenLabs voice ID.
`scripts/generate-audio.mjs` synthesizes the approved `src/data/script.json` text
using expressive `eleven_v3` (stability 0.5), with timestamps and 128kbps MP3.
No character labels, plain-English explanations or stage directions are spoken.

    npm run audio:plan                         # free dry run
    npm run audio:generate                     # paid generation of missing clips
    npm run audio:generate -- --limit 3         # next three missing clips
    npm run audio:generate -- --id SPEECH_ID    # one selected speech

The key stays in .env and requires Text to Speech access; choosing/listing voices
also requires Voices Read. Some public-library voices require a paid plan.
Generation makes up to two concurrent requests, checkpoints every completed
speech, and stops on errors without automatic retries. Restarting skips finished
clips with matching text, model and voice settings. If a request times out, check
ElevenLabs history before retrying since it may have been billed.

MP3s are stored in `public/audio/speeches/`; the generated app index lives in
`src/data/recordings.json`. Filenames contain the act, scene, role, stable speech
ID and a configuration hash. Keep both the MP3s and the index when deploying.
Local recovery receipts with timestamp data and base64 audio live in the ignored
`.audio-work/` directory, outside public assets. Replacing a voice or changing
script text generates a new fingerprint; old audio won't match the new text.
The browser never calls the generation API or receives its permanent key.

Generating these files does not validate acting or Shakespearean pronunciation.
Review the rendered performances using Hear speech in the scene reader; regenerate
individual speeches deliberately if needed. MP3s are served as static files and
are not all downloaded in advance by the PWA service worker.


### Hosted classroom deployment

The frontend and speech recordings stay on GitHub Pages at lines.adcatheatre.com.
The protected Scribe API runs as Cloudflare Worker `lines-scribe`, using D1 for
anonymous usage counters only. No recordings or transcripts are stored by the worker.
ElevenLabs retention follows that service's account configuration.

Configure the D1 binding DB in wrangler.jsonc and apply drizzle/0000_usage.sql.
Store ELEVENLABS_API_KEY, CLASS_ACCESS_CODE and SESSION_SECRET as Worker secrets.
APP_ORIGIN restricts browser access to https://lines.adcatheatre.com. Daily limits
default to 36000 seconds for the class and 3600 seconds per device session.
Changing SESSION_SECRET revokes existing sessions.

Set the GitHub repository variable VITE_TRANSCRIPTION_API_URL to the Worker's
HTTPS address. The Pages workflow embeds this public address during build.
Local development leaves it unset and uses Vite's existing local API proxy.

Children enter the shared class code once per browser each week. The cross-origin
API uses a signed seven-day bearer session stored in localStorage, avoiding
third-party cookies. Progress and settings remain in that browser, with no student
accounts or cloud sync. The provider API key and class code are never bundled.

Deploy with `npx wrangler deploy`; apply schema with
`npx wrangler d1 execute lines-usage --remote --file drizzle/0000_usage.sql`.
Use Workers Free initially; check actual CPU limits before increasing tiers.
The earlier Sites deployment is private and is not used by this production app.

### Privacy and microphone choices

Public hash routes `#/privacy` and `#/parents` are readable without a role or
class login. They describe the actual speech data flow and distinguish uploaded
transcription from temporary browser-only hear-it-back recordings. The parent
notice can be printed from its page. Privacy links appear at the welcome gate,
throughout the app, and beside recording controls.

`settings.microphone` defaults to false, including when loading old progress. It
controls both recognition providers and the separate local recorder; prerecorded
character playback and typing remain available. Turning it on is a preference,
not verified parental consent. Server credentials and the protected API remain
unchanged.

Operator contact: Brooke Brown, parent volunteer working on behalf of ADCA,
adcatheatreinfo@gmail.com. Mailing contact: ADCA, c/o Alice Deal Middle School, 3815 Fort Dr. NW,
Washington, DC 20016. School main office: (202) 939-2010, verified against
https://profiles.dcps.dc.gov/Deal. On November 20, 2026, workspace training use was disabled and verified saved in
ElevenLabs Data use. Per ElevenLabs, the opt-out covers new submissions, not
retroactive deletion. The account is Pay As You Go, and speech-to-text zero
retention is not enabled. No fixed API recording-retention deadline was found.
Provider retention terms and required parent/school authorization still need
review; these pages do not establish legal compliance.
