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
const CATEGORIES_PER_PARTICIPANT  = 3;
const PRACTICE_TRIALS_PER_TYPE   = 10;  // same + different each
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

function buildTimeline(jsPsych, trials, practiceTrials, participantId) {

  const timeline = [];

  // ── 1. PRELOAD ──────────────────────────────────────────────────────────────
  const allImages = collectImages([...trials, ...practiceTrials]);
  const exampleImages = [
    'stimuli/images/examples/drum1.jpg',
    'stimuli/images/examples/flute1.jpg',
    'stimuli/images/examples/cucumber8.jpg',
    'stimuli/images/examples/lemon1.jpg',
    'stimuli/images/examples/lemon3.jpg'
  ];

  timeline.push({
    type: jsPsychPreload,
    images: [...allImages, ...exampleImages],
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
        <div class="continue-prompt">Press any key to see some examples.</div>
      </div>`,
    choices: "ALL_KEYS"
  });


  // ── 3. EXAMPLE PAGES ───────────────────────────────────────────────────────
  // 3 sequential pages that accumulate: each reveals all prior examples + the new one.
  const EXAMPLE_SPECS = [
    {
      leftImg:  'stimuli/images/examples/drum1.jpg',
      rightImg: 'stimuli/images/examples/flute1.jpg',
      label: 'different', key: DIFF_KEY
    },
    {
      leftImg:  'stimuli/images/examples/cucumber8.jpg',
      rightImg: 'stimuli/images/examples/cucumber8.jpg',
      label: 'same', key: SAME_KEY
    },
    {
      leftImg:  'stimuli/images/examples/lemon1.jpg',
      rightImg: 'stimuli/images/examples/lemon3.jpg',
      label: 'different', key: DIFF_KEY
    }
  ];

  function exampleRowHTML(ex, idx) {
    const intro = idx === 0
      ? 'For example, these two images are'
      : 'These two images are';
    return `
      <div class="example-row">
        <p class="example-intro">${intro} <strong>${ex.label}</strong>, so press
           <span class="key-label">${ex.key.toUpperCase()}</span>.</p>
        <div class="example-images">
          <div class="example-img-wrapper">
            <img src="${ex.leftImg}" alt="left example"/>
          </div>
          <div class="example-img-wrapper">
            <img src="${ex.rightImg}" alt="right example"/>
          </div>
        </div>
      </div>`;
  }

  for (let i = 0; i < EXAMPLE_SPECS.length; i++) {
    const shownSoFar = EXAMPLE_SPECS.slice(0, i + 1);
    const isLast = i === EXAMPLE_SPECS.length - 1;
    timeline.push({
      type: jsPsychHtmlKeyboardResponse,
      stimulus: `
        <div class="instructions-box" style="max-width:760px;">
          <h2>EXAMPLES</h2>
          ${shownSoFar.map((ex, j) => exampleRowHTML(ex, j)).join('')}
          <div class="continue-prompt">${isLast
            ? 'Press any key to begin a short practice block.'
            : 'Press any key to see the next example.'}</div>
        </div>`,
      choices: "ALL_KEYS"
    });
  }


  // ── 4. PRACTICE TRIALS ─────────────────────────────────────────────────────
  // 20 seed-sampled trials from practice_trials.csv (10 same + 10 different).
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
        <p>There will be no further instructions during the main task. If you have questions, ask the researcher now. </p>
        <div class="continue-prompt">Press any key to start.</div>
      </div>`,
    choices: "ALL_KEYS"
  });


  // ── 5. MAIN TRIALS ─────────────────────────────────────────────────────────
  trials.forEach((trial, i) => {
    timeline.push(...makeTrialSequence(jsPsych, trial, false, i + 1));
  });


  // ── 6. DEBRIEF & SAVE ──────────────────────────────────────────────────────
  // Build the CSV string into a closure variable so jsPsychPipe can reference it.
  const OUTPUT_COLUMNS = [
    'subjCode', 'rnd_seed', 'trial_num',
    'image1', 'image2',
    'trial_type', 'category',
    'match_key', 'correct_key', 'response', 'rt', 'correct'
  ];
  let _csvToSave = '';

  timeline.push({
    type: jsPsychCallFunction,
    func: () => {
      const mainTrials = jsPsych.data.get()
                           .filter({ task: "main_response", is_practice: false })
                           .values();
      const header = OUTPUT_COLUMNS.join(',');
      const rows   = mainTrials.map(t =>
        OUTPUT_COLUMNS.map(col => t[col] ?? '').join(',')
      );
      _csvToSave = [header, ...rows].join('\n');
    }
  });

  timeline.push({
    type: jsPsychPipe,
    action: "save",
    experiment_id: DATAPIPE_EXPERIMENT_ID,
    filename: `${participantId}.csv`,
    data_string: () => _csvToSave
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
      // jsPsych overwrites trial_type with the plugin name; reassign our value here
      data.trial_type  = trialData.trial_type || null;
      data.correct_key = correctKey;
      data.correct     = keyPressed === correctKey ? 1 : 0;
      responseCorrect  = data.correct === 1;
    }
  });

  // 4. Feedback (audio on incorrect only)
  // Wrapped in a timeline node so conditional_function works correctly in jsPsych v7
  // and the audio trial is skipped entirely (not just rushed) when the answer is correct.
  seq.push({
    timeline: [{
      type: jsPsychAudioKeyboardResponse,
      stimulus: FEEDBACK_AUDIO,
      choices: "NO_KEYS",
      trial_ends_after_audio: true,
      response_allowed_while_playing: false
    }],
    conditional_function: () => responseCorrect === false
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

  // Load all three trial list CSVs in parallel
  let identityTrials, allCategoryTrials, allPracticeTrials;
  try {
    const [idResp, catResp, pracResp] = await Promise.all([
      fetch(`${TRIAL_LIST_DIR}identity_trials.csv`),
      fetch(`${TRIAL_LIST_DIR}category_trials.csv`),
      fetch(`${TRIAL_LIST_DIR}practice_trials.csv`)
    ]);
    if (!idResp.ok)   throw new Error(`identity_trials.csv: HTTP ${idResp.status}`);
    if (!catResp.ok)  throw new Error(`category_trials.csv: HTTP ${catResp.status}`);
    if (!pracResp.ok) throw new Error(`practice_trials.csv: HTTP ${pracResp.status}`);
    identityTrials    = parseCSV(await idResp.text());
    allCategoryTrials = parseCSV(await catResp.text());
    allPracticeTrials = parseCSV(await pracResp.text());
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

  // Use seed to sample categories, practice trials, and shuffle — all reproducibly
  const rng = mulberry32(seed);

  // Sample main trials
  const allCategories      = [...new Set(allCategoryTrials.map(t => t.category))];
  const selectedCategories = seededSample(allCategories, CATEGORIES_PER_PARTICIPANT, rng);
  const categoryTrials     = allCategoryTrials.filter(t => selectedCategories.includes(t.category));
  const devMode = new URLSearchParams(window.location.search).get("dev") === "true";
  let trials = seededShuffle([...identityTrials, ...categoryTrials], rng);
  if (devMode) trials = trials.slice(0, 10);

  // Sample practice trials (10 same + 10 different, then shuffle)
  const poolSame  = allPracticeTrials.filter(t => t.correct_response === "same");
  const poolDiff  = allPracticeTrials.filter(t => t.correct_response === "different");
  const practiceTrials = seededShuffle([
    ...seededSample(poolSame, PRACTICE_TRIALS_PER_TYPE, rng),
    ...seededSample(poolDiff, PRACTICE_TRIALS_PER_TYPE, rng)
  ], rng);

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

  const timeline = buildTimeline(jsPsych, trials, practiceTrials, participantId);
  jsPsych.run(timeline);
});
