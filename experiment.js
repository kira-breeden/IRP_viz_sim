/**
 * experiment.js
 * Same/Different Image Matching Task
 *
 * Trial flow per trial:
 *   1. Fixation cross (1000ms)
 *   2. Placeholder rectangles (500ms)
 *   3. Images appear; participant responds (x = same, m = different)
 *   4. If incorrect: audio feedback plays
 *   5. ITI (750ms)
 *
 * URL parameters:
 *   ?subjCode=P001            — participant identifier
 *   ?seed=482910              — RNG seed for category sampling (random if omitted)
 *   ?response_key_config=0|1  — 0 (default): x=same, m=different; 1: swapped
 *   ?dev=true                 — dev mode: runs only 10 trials for quick testing
 *
 * DataPipe config:
 *   Set DATAPIPE_EXPERIMENT_ID to your OSF experiment ID from pipe.jspsych.org
 */

// ── CONFIG ────────────────────────────────────────────────────────────────────
const DATAPIPE_EXPERIMENT_ID = "2KZKOzOl6w2p";
const TRIAL_LIST_DIR         = "trial_lists/";
const FEEDBACK_AUDIO         = "stimuli/audio/buzz.wav";
const CATEGORIES_PER_PARTICIPANT = 3;
// Response keys — ?response_key_config=1 swaps them
const _keyConfig = parseInt(new URLSearchParams(window.location.search).get("response_key_config") || "0");
const SAME_KEY   = _keyConfig === 1 ? "m" : "x";   // x=same by default
const DIFF_KEY   = _keyConfig === 1 ? "x" : "m";   // m=different by default
const FIXATION_DURATION      = 1000;   // ms
const PLACEHOLDER_DURATION   = 500;    // ms
const ITI_DURATION           = 750;    // ms
// ─────────────────────────────────────────────────────────────────────────────


// ── UTILITIES ─────────────────────────────────────────────────────────────────

/** Read participant ID from URL ?subjCode= */
function getSubjCode() {
  return new URLSearchParams(window.location.search).get("subjCode") || "UNKNOWN";
}

/** Read RNG seed from URL ?seed=; generates a random one if omitted. */
function getSeed() {
  const s = new URLSearchParams(window.location.search).get("seed");
  return s !== null ? parseInt(s) : Math.floor(Math.random() * 1e9);
}

/**
 * Mulberry32 seeded PRNG. Returns a function that produces values in [0, 1).
 * Using a seeded RNG makes category sampling fully reproducible from the seed.
 */
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle using a provided RNG function. Mutates and returns arr. */
function seededShuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Randomly sample n items from arr using a provided RNG. Does not mutate arr. */
function seededSample(arr, n, rng) {
  return seededShuffle([...arr], rng).slice(0, n);
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

/** Return just the filename stem (no path, no .png) from an image path. */
function imageStem(path) {
  return path.split('/').pop().replace(/\.png$/i, '');
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

function buildTimeline(jsPsych, trials, participantId, seed) {

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
           <strong>the same image</strong> or <strong>different images</strong>.</p>
        <div class="key-demo">
          <span class="key-label">${SAME_KEY.toUpperCase()}</span> &nbsp;=&nbsp; SAME
          &nbsp;&nbsp;&nbsp;&nbsp;
          <span class="key-label">${DIFF_KEY.toUpperCase()}</span> &nbsp;=&nbsp; DIFFERENT
        </div>
        <p>Please keep your fingers on these keys throughout the experiment.
           Respond as fast as you can without sacrificing accuracy.</p>
        <p>If you make an error, you will hear a brief audio tone.</p>
        <p>Each trial begins with a <strong>+</strong> fixation cross. Focus on this cross before the images appear.</p>
        <div class="continue-prompt">Press any key to begin a short practice block.</div>
      </div>`,
    choices: "ALL_KEYS"
  });


  // ── 3. PRACTICE TRIALS ─────────────────────────────────────────────────────
  // 4 hand-crafted practice trials using actual stimuli (already preloaded).
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
    timeline.push(...makeTrialSequence(jsPsych, pt, true, null));
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
  trials.forEach((trial, i) => {
    timeline.push(...makeTrialSequence(jsPsych, trial, false, i + 1));
  });


  // ── 5. DEBRIEF & SAVE ──────────────────────────────────────────────────────
  timeline.push({
    type: jsPsychCallFunction,
    async: true,
    func: async (done) => {
      const filename = `${participantId}_seed${seed}.csv`;

      // Build CSV with exactly the desired columns (main trials only)
      const OUTPUT_COLUMNS = [
        'subjCode', 'rnd_seed', 'trial_num',
        'image1', 'image2',
        'trial_type', 'category',
        'match_key', 'response', 'rt', 'correct'
      ];
      const mainTrials = jsPsych.data.get()
                           .filter({ task: "main_response", is_practice: false })
                           .values();
      const header = OUTPUT_COLUMNS.join(',');
      const rows   = mainTrials.map(t =>
        OUTPUT_COLUMNS.map(col => t[col] ?? '').join(',')
      );
      const csvData = [header, ...rows].join('\n');

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
function makeTrialSequence(jsPsych, trialData, isPractice, trialNum) {
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
      task:             "main_response",
      trial_num:        trialNum,
      image1:           imageStem(trialData.left_image),
      image2:           imageStem(trialData.right_image),
      trial_type:       trialData.trial_type  || null,
      category:         trialData.category    || null,
      match_key:        SAME_KEY,
      correct_response: trialData.correct_response,
      is_practice:      isPractice
    },
    on_finish: (data) => {
      const keyPressed = data.response;
      const correctKey = trialData.correct_response === "same" ? SAME_KEY : DIFF_KEY;
      data.correct     = keyPressed === correctKey ? 1 : 0;
      responseCorrect  = data.correct === 1;
    }
  });

  // 4. Feedback (audio on incorrect only)
  seq.push({
    type: jsPsychAudioKeyboardResponse,
    stimulus: FEEDBACK_AUDIO,
    choices: "NO_KEYS",
    trial_ends_after_audio: true,
    response_allowed_while_playing: false,
    conditional_function: () => responseCorrect === false,
    on_start: (trial) => {
      if (responseCorrect !== false) {  // true (correct) or null (practice)
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
  const participantId = getSubjCode();
  const seed          = getSeed();

  // Load both trial list CSVs in parallel
  let identityTrials, allCategoryTrials;
  try {
    const [idResp, catResp] = await Promise.all([
      fetch(`${TRIAL_LIST_DIR}identity_trials.csv`),
      fetch(`${TRIAL_LIST_DIR}category_trials.csv`)
    ]);
    if (!idResp.ok)  throw new Error(`identity_trials.csv: HTTP ${idResp.status}`);
    if (!catResp.ok) throw new Error(`category_trials.csv: HTTP ${catResp.status}`);
    identityTrials    = parseCSV(await idResp.text());
    allCategoryTrials = parseCSV(await catResp.text());
  } catch (err) {
    document.body.innerHTML = `
      <div style="color:#ff6b6b; font-family:monospace; padding:40px; text-align:center;">
        <h2>Error loading trial list</h2>
        <p>${err.message}</p>
        <p>Make sure you have launched this experiment from a web server (not file://)
           and that the trial list CSVs exist in <code>${TRIAL_LIST_DIR}</code>.</p>
      </div>`;
    return;
  }

  // Use seed to sample CATEGORIES_PER_PARTICIPANT categories, then filter trials
  const rng = mulberry32(seed);
  const allCategories      = [...new Set(allCategoryTrials.map(t => t.category))];
  const selectedCategories = seededSample(allCategories, CATEGORIES_PER_PARTICIPANT, rng);
  const categoryTrials     = allCategoryTrials.filter(t => selectedCategories.includes(t.category));

  // Combine identity + sampled category trials and shuffle with the same seed
  const devMode = new URLSearchParams(window.location.search).get("dev") === "true";
  let trials = seededShuffle([...identityTrials, ...categoryTrials], rng);
  if (devMode) trials = trials.slice(0, 10);

  // Init jsPsych
  const jsPsych = initJsPsych({
    show_progress_bar: true,
    message_progress_bar: "Progress",
    on_finish: () => {
      jsPsych.data.displayData("csv");
    }
  });

  // Add participant metadata to every trial row
  jsPsych.data.addProperties({
    subjCode:            participantId,
    rnd_seed:            seed,
    selected_categories: selectedCategories.join("|"),
    response_key_config: _keyConfig
  });

  const timeline = buildTimeline(jsPsych, trials, participantId, seed);
  jsPsych.run(timeline);
});
