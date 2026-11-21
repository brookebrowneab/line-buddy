import { TopBar } from './ui';

const email = 'adcatheatreinfo@gmail.com';
const updated = 'November 21, 2026';

export function PrivacyLinks() {
  return <nav className="privacy-links no-print" aria-label="Privacy information">
    <a href="#/privacy">Privacy policy</a><span aria-hidden="true"> · </span><a href="#/parents">Parent notice</a>
  </nav>;
}

function Contact() {
  return <><p>Brooke Brown, a parent volunteer working on behalf of ADCA, is the contact for Lines.
    {' '}For privacy questions, access or deletion requests, or to ask about local speech checking, email{' '}
    <a href={`mailto:${email}`}>{email}</a>. Please do not email a child’s voice recording or sensitive information with an initial request.</p>
    <address style={{fontStyle:'normal'}}>
      ADCA, attention: Brooke Brown / Lines privacy<br />
      c/o Alice Deal Middle School<br />
      3815 Fort Dr. NW<br />
      Washington, DC 20016<br />
      School main office: <a href="tel:+12029392010">(202) 939-2010</a>
    </address>
  </>;
}

export function PrivacyPage({ parents = false }: { parents?: boolean }) {
 return <main className="page privacy-page">
  <TopBar back="/" title="Lines" right={<button className="btn btn-small" onClick={()=>window.print()}>Print</button>} />
  <article>
   <h1>{parents?'Parent notice':'Privacy policy'}</h1>
   <p className="muted">Lines · Updated {updated}</p>
   <p className="privacy-summary">Microphone recordings and transcripts stay on your device. Speech checking runs locally in your browser. Listening is optional.</p>
   {parents?<ParentNotice />:<Policy />}
   <h2>Questions and parent requests</h2><Contact />
   <p className="no-print"><a href={parents?'#/privacy':'#/parents'}>{parents?'Read the full privacy policy':'Read the shorter parent notice'}</a></p>
  </article>
 </main>;
}
function ParentNotice(){return <>
 <h2>How speech practice works</h2>
 <p>When microphone features are enabled, “Listen to me” records a take in browser memory. Whisper, a speech model running on the device, turns it into words. Lines compares those words with the play. It does not upload the audio, transcript or rehearsal context to a server, and it does not use the browser vendor’s online speech-recognition service.</p>
 <p>The microphone starts only when the child chooses a recording feature and the browser permits access. Done, or the recording’s time limit, ends the take. Checking takes place locally. Cancel stops the current recording or local processing.</p>
 <h2>What downloads to the device?</h2>
 <p>The first use downloads speech-model files from Hugging Face and a browser runtime from the Lines website. These are software downloads, not audio uploads. They can take time and use a substantial amount of storage and mobile data. The browser caches the files for later use. If that cache is cleared or evicted, another download is needed. Offline listening requires the model and runtime to have been fully downloaded first.</p>
 <h2>Recording and playback are different</h2>
 <ul>
  <li><strong>Listen to me:</strong> Records a take temporarily for local speech checking.</li>
  <li><strong>Record myself to hear it back:</strong> Keeps a temporary browser-only clip for replay. It is not uploaded.</li>
  <li><strong>Character recordings:</strong> Prerecorded AI performances of the script. Playing these does not record your child.</li>
 </ul>
 <h2>Your choices</h2>
 <p>Microphone features are off by default. Leave “Allow microphone features” off in App settings, or deny the browser’s microphone permission, to disable recording. Reading, typing, games and prerecorded character voices still work. Enabling the switch is not a record of parental consent and does not prove an adult enabled it.</p>
 <p>Recognition can mishear a child. Lines supplies Shakespearean vocabulary and script context to the model locally, so it can also guess words. Its feedback is a rehearsal aid, not proof of recall or a formal assessment. Children can correct a mishearing by typing instead.</p>
 <h2>What is saved?</h2>
 <p>Roles, progress and settings stay in browser storage. Recordings and transcripts are temporary and are released when the practice question or page closes. Lines does not create saved audio files or student accounts. Use Progress → Erase all progress to clear saved practice, or clear site data in the browser to remove settings and downloaded model caches too.</p>
 <p>Hosting and model-download services receive ordinary connection information, such as IP addresses, when software or website files are requested. The current app adds no advertising trackers or external telemetry.</p>
 <h2>Earlier versions</h2>
 <p>Before the November 21, 2026 local-only update, Lines could send recordings to ElevenLabs or a browser recognition provider. Refresh an already-open app to use the new version. This change does not retroactively delete information sent by older versions; that information remains subject to the provider’s terms. Contact us about earlier submissions or privacy requests.</p>
</>;}
function Policy(){return <>
 <h2>Who operates Lines</h2>
 <p>Lines at lines.adcatheatre.com is maintained by Brooke Brown, a parent volunteer working on behalf of ADCA. It helps theatre participants, including children, rehearse their play. This policy describes the current local-only app and does not claim school approval or legal certification.</p>
 <h2>Microphone audio and transcripts stay local</h2>
 <p>Optional speech checking records a take with the browser’s microphone API, then decodes and resamples it in memory to mono 16 kHz audio. A local Whisper model runs in a background worker using a local WebAssembly CPU engine. Audio is never submitted to a hosted inference API. There is no online speech-recognition fallback.</p>
 <p>The model receives the current script line, nearby context and Shakespearean vocabulary locally to help it recognize names and archaic words. None of that rehearsal context or the resulting transcript is sent to a server. Matching and feedback also run on the device. No local student audio or transcript is used to train a remote model.</p>
 <p>The separate hear-it-back recorder keeps a temporary clip in browser memory. It does not upload the clip or write an audio file to disk. Character performances are previously generated AI recordings of the printed script, served as static files. They are not recordings of participating children.</p>
 <h2>Local information and retention</h2>
 <p>Browser storage contains chosen characters, progress, practice history, difficult lines, streaks and settings. Model software is cached using browser storage. Lines does not automatically sync this data or create an individual student account. It does not ask children for their name, email, birth date, precise location, school ID, diagnosis or disability information.</p>
 <p>Recorded takes, PCM samples and transcripts are held temporarily in memory for the current practice check and released after the question or page closes. Memory reclamation is managed by the browser. There is no transcript history or saved student-audio file. Progress and model caches can persist until cleared or evicted by the browser. If you export progress, you control where that file is saved and whether you share it.</p>
 <h2>Downloads and service providers</h2>
 <ul>
  <li><a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noreferrer">GitHub Pages</a> serves the app, script, prerecorded character performances and browser-runtime files.</li>
  <li><a href="https://huggingface.co/privacy" target="_blank" rel="noreferrer">Hugging Face</a> and its download infrastructure deliver the pinned Whisper model and tokenizer files. Requests download fixed software files, not student recordings, transcripts or prompts.</li>
 </ul>
 <p>These services may receive IP addresses, request times, browser information and ordinary security or operational logs when files are requested. Their privacy policies govern those records, including retention and processing locations. Local audio processing does not make all website traffic anonymous. Lines adds no external telemetry, ads, advertising trackers, sale of student data, public posting or voice-cloning feature.</p>
 <h2>Choice and deletion</h2>
 <p>Microphone features start off on this device. App settings → Allow microphone features controls both local recognition and hear-it-back recording. Browser microphone permissions provide another control. The switch is a preference, not verification that a parent or teacher authorized use. Children can rehearse by reading, typing and hearing character recordings with the microphone off.</p>
 <p>Use Progress → Erase all progress to reset practice on this browser. To remove settings, obsolete class-access tokens and model caches too, clear site data for lines.adcatheatre.com in the browser. Copies of exported files must be deleted separately. Because the current app does not upload practice data, its operator cannot remotely view or erase what is stored on a child’s device.</p>
 <h2>Earlier cloud-based versions</h2>
 <p>Versions before November 21, 2026 offered ElevenLabs Scribe and browser-vendor recognition, which could send voice audio to external services. The new local-only implementation does not reverse those earlier disclosures or guarantee deletion of provider-held audio, transcripts, logs or backups. A previously open or cached old version must be refreshed to load the update. The old Lines transcription backend is retired as part of this migration.</p>
 <p>ElevenLabs workspace training use was disabled and verified on November 20, 2026 for new submissions. Its prior processing remains governed by the <a href="https://elevenlabs.io/privacy-policy" target="_blank" rel="noreferrer">ElevenLabs privacy policy</a>. Contact us about review or deletion requests for earlier submissions. We may need to verify a parent’s authority, and will explain what can be identified without promising deletion we cannot verify.</p>
 <h2>Limits and updates</h2>
 <p>Speech recognition may miss or invent words, especially when given script context. It is a practice aid, not a formal assessment or diagnosis. Processing speed and offline availability vary by device, browser support and cached files. Typing remains available if the model cannot run.</p>
 <p>Parent communications use the contact details below. We use information you send to answer questions and handle requests; please avoid sending a child’s recording or sensitive information with an initial inquiry. Correspondence is kept only as needed for the request and related obligations; an exact schedule has not been set. We will update this policy and provide additional notice or authorization where required before materially changing these practices.</p>
</>;}
