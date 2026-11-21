import { TopBar } from './ui';

const email = 'adcatheatreinfo@gmail.com';
const updated = 'November 20, 2026';

export function PrivacyLinks() {
  return <nav className="privacy-links no-print" aria-label="Privacy information">
    <a href="#/privacy">Privacy policy</a><span aria-hidden="true"> · </span><a href="#/parents">Parent notice</a>
  </nav>;
}

function Contact() {
  return <p>Brooke Brown, a parent volunteer working on behalf of ADCA, is the contact for Lines.
    {' '}For privacy questions, access or deletion requests, or to decline online speech checking, email{' '}
    <a href={`mailto:${email}`}>{email}</a>. Please do not email a child’s voice recording or sensitive information with an initial request.</p>;
}

export function PrivacyPage({ parents = false }: { parents?: boolean }) {
  return <main className="page privacy-page">
    <TopBar back="/" title="Lines" right={<button className="btn btn-small" onClick={() => window.print()}>Print</button>} />
    <article>
      <h1>{parents ? 'Parent notice' : 'Privacy policy'}</h1>
      <p className="muted">Lines · Updated {updated}</p>
      <p className="privacy-summary">{parents
        ? 'Lines helps children rehearse their play. Listening is optional. Reading, typing answers and hearing the character recordings do not require a microphone.'
        : 'Lines is a play-rehearsal app. Progress stays in your browser. Optional speech checking sends a voice recording to ElevenLabs to turn it into words.'}</p>
      {parents ? <ParentNotice /> : <Policy />}
      <h2>Questions and parent requests</h2>
      <Contact />
      <p className="no-print"><a href={parents ? '#/privacy' : '#/parents'}>{parents ? 'Read the full privacy policy' : 'Read the shorter parent notice'}</a></p>
    </article>
  </main>;
}

function ParentNotice() {
  return <>
    <h2>There are three different kinds of audio</h2>
    <ul>
      <li><strong>Character recordings:</strong> These are prerecorded AI performances of the script. Playing them does not record your child.</li>
      <li><strong>“Listen to me”:</strong> With ElevenLabs selected in App settings, Lines records the child’s speech and sends it through our Cloudflare server to ElevenLabs Scribe v3. ElevenLabs returns the words it heard. Lines compares those words with the script and shows practice feedback.</li>
      <li><strong>“Record myself to hear it back”:</strong> This separate, optional recorder keeps a temporary clip in the browser for the child to replay. Lines does not upload that clip. It is released when the child leaves the practice question or closes the page.</li>
    </ul>
    <h2>When is a recording sent?</h2>
    <p>Online listening starts only after the child chooses it and the browser permits microphone access. The speech-checking recording is uploaded when the child taps Done, or when the recording reaches its time limit: 90 seconds for a short part or five minutes for a whole speech. Cancel before upload discards that take. Cancelling after an upload begins cannot guarantee that the provider has not received it.</p>
    <p>If an adult selects Browser Web Speech API in App settings, the browser handles recognition and may send speech to its own provider. Browser listening is not a guarantee of on-device processing. Lines does not switch providers automatically.</p>
    <h2>What is saved?</h2>
    <p>Roles, progress and settings stay in the child’s browser. Lines has no individual student sign-in and does not ask for the child’s name, email, birth date or diagnosis. Our speech server does not save recordings or transcripts. It keeps temporary usage and access-security counters.</p>
    <p><strong>ElevenLabs may retain submitted audio and transcripts.</strong> We have not confirmed this account’s retention period or training settings, and zero-retention processing has not been enabled or verified. Do not assume recordings are immediately deleted or excluded from model improvement. See the <a href="https://elevenlabs.io/privacy-policy" target="_blank" rel="noreferrer">ElevenLabs privacy policy</a>.</p>
    <h2>Your choices</h2>
    <p>Microphone features are off by default, including for browsers upgrading from a version without this setting. Leave “Allow microphone features” switched off in App settings to disable speech checking and the hear-it-back recorder. A parent or teacher can enable it when appropriate. Your child can practise by reading and typing instead of using either listening service. You can block microphone access in the browser. Blocking the microphone still allows prerecorded character audio to play.</p>
    <p>To erase locally saved progress, open Progress and choose Erase all progress. Clearing this site’s browser data also removes saved settings and the class-access session. These actions do not delete information already held by a service provider.</p>
    <h2>Before a child under 13 uses online listening</h2>
    <p>A child’s voice is personal information, even when no name is attached. The program must arrange any required parent consent or appropriate school authorization before online listening is used. A shared class code, microphone permission, or reading this notice does not establish that authorization. Contact the program if you are unsure; use reading and typing in the meantime.</p>
    <p>This is an information notice, not a consent form. Posting it does not mean that the school or district has approved Lines or its providers.</p>
  </>;
}

function Policy() {
  return <>
    <h2>Who this policy covers</h2>
    <p>This policy describes the Lines app at lines.adcatheatre.com, including its Cloudflare speech-checking server. Lines supports rehearsal for ADCA theatre participants, including children. It is maintained by Brooke Brown, a parent volunteer working on behalf of ADCA. This policy describes the current app; it is not a claim of school approval or legal certification.</p>
    <h2>Information used by Lines</h2>
    <ul>
      <li><strong>Practice information on the device:</strong> selected characters, progress, practice history, difficult lines, streaks and app settings. These are saved in browser storage. Lines does not automatically upload or sync them. If you export progress, the resulting file is saved where you choose; you control any sharing of that file.</li>
      <li><strong>Speech for checking:</strong> when you use ElevenLabs listening, the recording travels over HTTPS to our Cloudflare server and then to ElevenLabs. We send the audio and transcription options, not the child’s locally saved practice history or an expected answer. The transcript returns to the browser for comparison with the script. A voice recording can be personal information even without a name.</li>
      <li><strong>Access and usage information:</strong> a signed class-access session, random session identifier, recording duration and usage totals. The server also uses a hash of the network IP address to limit attempts to guess the class code. These records are pseudonymous, not guaranteed anonymous.</li>
      <li><strong>Ordinary connection information:</strong> GitHub, Cloudflare and the speech provider may process network addresses, request times, device/browser information and operational or security logs as part of delivering their services.</li>
      <li><strong>Parent communications:</strong> information you choose to send to the privacy contact, used to answer questions and handle requests.</li>
    </ul>
    <p>Lines does not ask children for their name, email, birth date, precise location, school ID, diagnosis or disability information. There are no individual student accounts, ads, advertising trackers, or public posting features in the app. We do not sell children’s information or use practice data for targeted advertising. Lines does not use children’s recordings to create cloned character voices.</p>
    <h2>Audio features and your choices</h2>
    <p>Microphone features default to off on new and upgraded browsers. App settings → Allow microphone features controls both speech checking and the separate hear-it-back recorder. The app does not verify that the person changing this setting is an adult, and the switch is not a consent record. Listening is optional. You can read the script, type answers, and hear prerecorded AI character performances without permitting microphone access. Playing the character recordings does not record the listener.</p>
    <p>With ElevenLabs selected in App settings, “Listen to me” records a take and uploads it when Done is selected or the recording’s time limit is reached. Cancel before upload discards the take. Once uploading starts, cancellation does not guarantee the provider has not received it. The separate “Record myself to hear it back” feature keeps a temporary clip in browser memory and does not upload it.</p>
    <p>If Browser Web Speech API is selected, the browser may send speech to its own recognition provider under that provider’s terms. It is not necessarily on-device recognition. Lines does not automatically switch between recognition services.</p>
    <h2>Why information is used and who receives it</h2>
    <p>Lines uses practice information to show rehearsal activities and feedback, and access/usage records to protect the service and limit paid transcription use. It does not send speech for grading or high-stakes decisions. Recognition can mishear a child; the practice feedback is not a diagnosis or a formal assessment.</p>
    <ul>
      <li><a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noreferrer">GitHub Pages</a> serves the website, script and prerecorded character audio.</li>
      <li><a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare</a> runs the protected speech server and stores access/usage counters.</li>
      <li><a href="https://elevenlabs.io/privacy-policy" target="_blank" rel="noreferrer">ElevenLabs</a> receives uploaded speech and produces its transcript.</li>
      <li>If Browser recognition is chosen, the browser’s recognition provider may receive speech instead.</li>
    </ul>
    <p>The script and generated character recordings are public website assets; the class-code screen is not file-level protection for those assets. Lines does not publish children’s microphone recordings. Providers may use their own infrastructure and subprocessors, and processing may occur outside your state or country. Their privacy terms apply to their processing.</p>
    <h2>Retention, deletion and AI training</h2>
    <p>Local progress and settings remain until you erase them in the app or clear the site’s browser data. A signed class-access session is valid for seven days; its browser-storage entry may remain until it is cleared or the app rejects it as expired. Exported progress files remain wherever you save them.</p>
    <p>Lines does not write microphone recordings or transcripts to its server database. Recordings are held temporarily to process a request. Transcripts and optional playback clips remain temporarily in the current practice screen and are released when it closes; they are not included in saved progress.</p>
    <p>Server usage counters are marked to expire within two days. Expired rows are removed when later speech-checking requests trigger cleanup; if no further requests arrive, they may remain until cleanup resumes or the operator removes them. Login-attempt counters have a shorter validity period but use the same cleanup process. Hosting and security logs may have separate provider retention periods.</p>
    <p><strong>Our server’s behavior does not determine ElevenLabs’ retention.</strong> ElevenLabs documents default retention and an Enterprise zero-retention option. This deployment has not enabled or verified zero-retention processing. The specific account’s retention period and model-training settings have not been confirmed. We therefore cannot promise that submitted speech is immediately deleted or excluded from training. See <a href="https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode" target="_blank" rel="noreferrer">ElevenLabs retention information</a> and <a href="https://elevenlabs.io/docs/help-center/legal/is-my-data-used-to-improve-eleven-labs-ai-models" target="_blank" rel="noreferrer">its training controls</a>.</p>
    <h2>Children and authorization</h2>
    <p>Before online listening is used by a child under 13, the program must establish the applicable parental-consent or appropriate school-authorization arrangements. A class code, microphone permission, or acceptance of a notice is not verification of parental consent. This policy does not establish that these arrangements are in place. Families can choose reading and typing without submitting microphone audio.</p>
    <h2>Parent access, deletion and withdrawal</h2>
    <p>A parent or guardian may ask what information is held, request access or deletion, decline further optional speech collection, and ask about provider-held records. Email the contact below. We may need to verify your authority before disclosing information. Because Lines has no named student accounts and does not store speech transcripts, we may not be able to identify a particular child’s records from a name alone. We will explain what we can identify and any provider requests needed, rather than promise deletion we cannot verify.</p>
    <p>You can review progress on the child’s device. To erase it, use Progress → Erase all progress. To remove the saved class-access session and other site storage as well, clear browser data for lines.adcatheatre.com. Block microphone access or use typing to avoid new speech submissions. Local deletion cannot remove data already received by ElevenLabs or another provider.</p>
    <h2>Security and updates</h2>
    <p>Lines uses HTTPS, server-side provider credentials, signed sessions, class-code checks and usage limits. No system is risk-free. A shared class code is not an individual identity check. Keep it within the participating group, and avoid including personal details in spoken practice.</p>
    <p>We will update this page and its date when practices change, and provide additional notice or obtain authorization where required before a materially different use of children’s information. Parent correspondence will be kept only as needed to handle the request and related obligations; an exact correspondence-retention schedule has not yet been set.</p>
  </>;
}
