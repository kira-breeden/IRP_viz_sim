/**
 * experiment.js
 * Same/Different Image Matching Task
 *
 * Trial flow per trial:
 *   1. Fixation cross (1000ms)
 *   2. Placeholder rectangles (500ms)
 *   3. Images appear; participant responds (f = same, j = different)
 *   4. If incorrect: audio feedback plays
 *   5. ITI (750ms)
 *
 * URL parameters:
 *   ?condition=1              (1–5)  — determines which trial list CSV is loaded
 *   ?subjCode=P001            — participant identifier
 *   ?response_key_config=0|1  — 0 (default): z=same, /=different; 1: swapped
 *
 * DataPipe config:
 *   Set DATAPIPE_EXPERIMENT_ID to your OSF experiment ID from pipe.jspsych.org
 */

// ── CONFIG ────────────────────────────────────────────────────────────────────
const DATAPIPE_EXPERIMENT_ID = "2KZKOzOl6w2p"; 
const TRIAL_LIST_DIR         = "trial_lists/";
const FEEDBACK_AUDIO         = "stimuli/audio/buzz.wav";  
// Response keys — ?response_key_config=1 swaps them
const _keyConfig = parseInt(new URLSearchParams(window.location.search).get("response_key_config") || "0");
const SAME_KEY   = _keyConfig === 1 ? "/" : "z";   // z=same by default
const DIFF_KEY   = _keyConfig === 1 ? "z" : "/";   // /=different by default
const FIXATION_DURATION      = 1000;   // ms
const PLACEHOLDER_DURATION   = 500;    // ms
const ITI_DURATION           = 750;    // ms
// ─────────────────────────────────────────────────────────────────────────────


// ── UTILITIES ─────────────────────────────────────────────────────────────────

/** Read URL param ?condition=N (default 1) */
function getCondition() {
  const params = new URLSearchParams(window.location.search);
  const c = parseInt(params.get("condition"));
  return (isNaN(c) || c < 1 || c > 5) ? 1 : c;
}

/** Read participant ID from URL ?subjCode= */
function getSubjCode() {
  return new URLSearchParams(window.location.search).get("subjCode") || "UNKNOWN";
}

/** Parse a CSV string into an array of objects */
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(",").map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i]);
    return obj;
  });
}

/** Collect all unique image paths from the trial list for preloading */
function collectImages(trials) {
  const imgs = new Set();
  trials.forEach(t => {
    imgs.add(t.left_image);
    imgs.add(t.right_image);
  });
  return [...imgs];
}


// ── BUILD TIMELINE ─────────────────────────────────────────────────────────────

function buildTimeline(jsPsych, trials, participantId, condition) {

  const timeline = [];

  // ── 1. PRELOAD ──────────────────────────────────────────────────────────────
  const allImages = collectImages(trials);

  timeline.push({
    type: jsPsychPreload,
    images: allImages,
    audio: [FEEDBACK_AUDIO],
    show_detailed_errors: true
  });


  // ── 2. INSTRUCTIONS ────────────────────────────────────────────────────────
  timeline.push({
    type: jsPsychHtmlKeyboardResponse,
    stimulus: `
      <div class="instructions-box">
        <h2>IMAGE MATCHING TASK</h2>
        <p>In this task, you will see <strong>two images</strong> appear side by side on the screen.</p>
        <p>Your job is to decide as quickly and accurately as possible whether the two images are
           <strong>exactly the same image</strong> or <strong>different images</strong>.</p>
        <div class="key-demo">
          <span class="key-label">${SAME_KEY.toUpperCase()}</span> &nbsp;=&nbsp; SAME
          &nbsp;&nbsp;&nbsp;&nbsp;
          <span class="key-label">${DIFF_KEY.toUpperCase()}</span> &nbsp;=&nbsp; DIFFERENT
        </div>
        <p>Please keep your fingers on these keys throughout the experiment.
           Respond as fast as you can without sacrificing accuracy.</p>
        <p>If you make an error, you will hear a brief audio tone.</p>
        <p>Each trial begins with a <strong>+</strong> fixation cross. Focus on it before the images appear.</p>
        <div class="continue-prompt">Press any key to begin a short practice block.</div>
      </div>`,
    choices: "ALL_KEYS"
  });


  // ── 3. PRACTICE TRIALS ─────────────────────────────────────────────────────
  // 4 hand-crafted practice trials using identity images (first 2 items).
  // Same-same for identity items 1 and 2; different-different for two pairs.
  // These use the actual stimuli so preloading covers them already.
  const practiceTrials = [
    { left_image: trials.find(t => t.trial_type === "identity").left_image,
      right_image: trials.find(t => t.trial_type === "identity").left_image,
      correct_response: "same" },
    { left_image: trials.find(t => t.trial_type === "category")?.left_image || trials[0].left_image,
      right_image: trials.find(t => t.trial_type === "category")?.right_image || trials[0].right_image,
      correct_response: "different" },
    { left_image: trials.find(t => t.trial_type === "identity").left_image,
      right_image: trials.find(t => t.trial_type === "identity").left_image,
      correct_response: "same" },
    { left_image: trials.find(t => t.trial_type === "category")?.left_image || trials[1].left_image,
      right_image: trials.find(t => t.trial_type === "category")?.right_image || trials[1].right_image,
      correct_response: "different" }
  ];

  practiceTrials.forEach(pt => {
    timeline.push(...makeTrialSequence(jsPsych, pt, true));
  });

  timeline.push({
    type: jsPsychHtmlKeyboardResponse,
    stimulus: `
      <div class="instructions-box">
        <h2>PRACTICE COMPLETE</h2>
        <p>Great! The real experiment is about to begin.</p>
        <p>Remember:</p>
        <div class="key-demo">
          <span class="key-label">${SAME_KEY.toUpperCase()}</span> &nbsp;=&nbsp; SAME
          &nbsp;&nbsp;&nbsp;&nbsp;
          <span class="key-label">${DIFF_KEY.toUpperCase()}</span> &nbsp;=&nbsp; DIFFERENT
        </div>
        <p>There will be no further feedback during the main task.</p>
        <div class="continue-prompt">Press any key to start.</div>
      </div>`,
    choices: "ALL_KEYS"
  });


  // ── 4. MAIN TRIALS ─────────────────────────────────────────────────────────
  trials.forEach(trial => {
    timeline.push(...makeTrialSequence(jsPsych, trial, false));
  });


  // ── 5. DEBRIEF & SAVE ──────────────────────────────────────────────────────
  timeline.push({
    type: jsPsychCallFunction,
    async: true,
    func: async (done) => {
      // Save data to OSF via DataPipe
      const filename = `${participantId}_condition${condition}.csv`;
      const csvData  = jsPsych.data.get()
                         .filter({ task: "main_response" })
                         .csv();
      try {
        await DataPipe.save(DATAPIPE_EXPERIMENT_ID, filename, csvData);
      } catch (err) {
        console.warn("DataPipe save failed:", err);
      }
      done();
    }
  });

  timeline.push({
    type: jsPsychHtmlKeyboardResponse,
    stimulus: `
      <div class="instructions-box">
        <h2>TASK COMPLETE</h2>
        <p>Thank you for participating! Your data has been saved.</p>
        <p>You may now close this window.</p>
      </div>`,
    choices: "NO_KEYS"
  });

  return timeline;
}


// ── TRIAL SEQUENCE FACTORY ────────────────────────────────────────────────────
/**
 * Returns an array of jsPsych trial objects for one experimental trial:
 *   [fixation, placeholders, stimulus+response, (optional feedback), ITI]
 */
function makeTrialSequence(jsPsych, trialData, isPractice) {
  const seq = [];
  let responseCorrect = null; // shared across closure

  // 1. Fixation
  seq.push({
    type: jsPsychHtmlKeyboardResponse,
    stimulus: `<div id="fixation">+</div>`,
    choices: "NO_KEYS",
    trial_duration: FIXATION_DURATION,
    response_ends_trial: false
  });

  // 2. Placeholders
  seq.push({
    type: jsPsychHtmlKeyboardResponse,
    stimulus: `
      <div class="stimulus-container">
        <div class="img-placeholder"></div>
        <div class="img-placeholder"></div>
      </div>`,
    choices: "NO_KEYS",
    trial_duration: PLACEHOLDER_DURATION,
    response_ends_trial: false
  });

  // 3. Stimulus + response
  seq.push({
    type: jsPsychHtmlKeyboardResponse,
    stimulus: () => `
      <div class="stimulus-container">
        <div class="img-wrapper">
          <img src="${trialData.left_image}" alt="left image"/>
        </div>
        <div class="img-wrapper">
          <img src="${trialData.right_image}" alt="right image"/>
        </div>
      </div>
      <div class="response-hint">
        <span class="key-label">${SAME_KEY.toUpperCase()}</span> same
        &nbsp;&nbsp;&nbsp;
        <span class="key-label">${DIFF_KEY.toUpperCase()}</span> different
      </div>`,
    choices: [SAME_KEY, DIFF_KEY],
    response_ends_trial: true,
    data: {
      task: "main_response",
      trial_type: trialData.trial_type    || null,
      category:   trialData.category      || null,
      pair:       trialData.pair          || null,
      condition:  trialData.condition     || null,
      trial_index: trialData.trial_index  || null,
      left_image: trialData.left_image,
      right_image: trialData.right_image,
      correct_response: trialData.correct_response,
      is_practice: isPractice
    },
    on_finish: (data) => {
      const keyPressed   = data.response;
      const correctKey   = trialData.correct_response === "same" ? SAME_KEY : DIFF_KEY;
      data.correct        = keyPressed === correctKey;
      data.correct_key    = correctKey;
      responseCorrect     = data.correct;
    }
  });

  // 4. Feedback (audio on incorrect only)
  seq.push({
    type: jsPsychAudioKeyboardResponse,
    stimulus: FEEDBACK_AUDIO,
    choices: "NO_KEYS",
    trial_ends_after_audio: true,
    response_allowed_while_playing: false,
    // Only play if the last response was incorrect
    conditional_function: () => responseCorrect === false,
    on_start: (trial) => {
      // If correct, skip by setting a near-zero duration
      if (responseCorrect !== false) {
        trial.trial_duration = 1;
        trial.trial_ends_after_audio = false;
      }
    }
  });

  // 5. ITI
  seq.push({
    type: jsPsychHtmlKeyboardResponse,
    stimulus: "",
    choices: "NO_KEYS",
    trial_duration: ITI_DURATION,
    response_ends_trial: false
  });

  return seq;
}


// ── INIT ──────────────────────────────────────────────────────────────────────
window.addEventListener("load", async () => {
  const condition     = getCondition();
  const participantId = getSubjCode();
  const trialFile     = `${TRIAL_LIST_DIR}trials_condition_${condition}.csv`;

  // Load trial list
  let trials;
  try {
    const resp = await fetch(trialFile);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    trials = parseCSV(text);
  } catch (err) {
    document.body.innerHTML = `
      <div style="color:#ff6b6b; font-family:monospace; padding:40px; text-align:center;">
        <h2>Error loading trial list</h2>
        <p>Could not load: <code>${trialFile}</code></p>
        <p>${err.message}</p>
        <p>Make sure you have launched this experiment from a web server (not file://)
           and that the trial list CSV exists.</p>
      </div>`;
    return;
  }

  // Init jsPsych
  const jsPsych = initJsPsych({
    show_progress_bar: true,
    message_progress_bar: "Progress",
    on_finish: () => {
      jsPsych.data.displayData("csv");
    }
  });

  // Add participant metadata to all trials
  jsPsych.data.addProperties({
    participant_id:      participantId,
    condition:           condition,
    response_key_config: _keyConfig
  });

  const timeline = buildTimeline(jsPsych, trials, participantId, condition);
  jsPsych.run(timeline);
});
