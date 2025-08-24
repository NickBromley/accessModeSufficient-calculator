document.getElementById('copyResultsBtn').addEventListener('click', () => {
  copyToClipboard(resultsDiv.innerText, document.getElementById('copyResultsFeedback'));
});

document.getElementById('copyMetaBtn').addEventListener('click', () => {
  copyToClipboard(metaDiv.innerText, document.getElementById('copyMetaFeedback'));
});


// State helpers
function getState() {
  const c = new Set(
    [...document.querySelectorAll('input[name="content"]:checked')].map(i => i.value)
  );
  const alts = new Set(
    [...document.querySelectorAll('input[name="alt"]:checked')].map(i => i.value)
  );
  return { c, alts };
}

// Enable/disable alt controls based on selected content types
function updateAltCheckboxStates() {
  const hasImages = document.querySelector('#content-images').checked;
  const hasAudio  = document.querySelector('#content-audio').checked;
  const hasVideo  = document.querySelector('#content-video').checked;

  toggleCtrl('alt-altText',           hasImages);
  toggleCtrl('alt-audioTranscript',   hasAudio || hasVideo);
  toggleCtrl('alt-captions',          hasVideo);
  toggleCtrl('alt-descTranscript',    hasVideo);
  toggleCtrl('alt-audioDescription',  hasVideo);
}

// Uses aria-disabled for semantics, keeps focusable, blocks interaction via JS.
function toggleCtrl(id, enabled) {
  const cb = document.getElementById(id);
  if (!cb) return;

  // Always clear previous blocking handlers to avoid duplicates
  cb.removeEventListener('click', blockClick, true);
  cb.removeEventListener('keydown', blockKey, true);

  // Announce semantic state
  cb.setAttribute('aria-disabled', String(!enabled));

  // If making unavailable, unblock visually and prevent interaction
  if (!enabled) {
    // Clear any existing check so logic stays consistent
    if (cb.checked) cb.checked = false;

    // Block activation by mouse/label click and keyboard
    cb.addEventListener('click', blockClick, true);
    cb.addEventListener('keydown', blockKey, true);
  }
}

function blockClick(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
}

function blockKey(e) {
  // Prevent toggle on Space or Enter
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}

// accessModeSufficient evaluation
const ORDER = ['textual', 'visual', 'auditory'];

function sortSetArray(arr) {
  return [...arr].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
}

function evaluateSets() {
  const { c, alts } = getState();

  const hasT = c.has('T');
  const hasI = c.has('I');
  const hasA = c.has('A');
  const hasV = c.has('V');

  const altText         = alts.has('altText');
  const transcript      = alts.has('audioTranscript');
  const captions        = alts.has('captions');
  const descTranscript  = alts.has('descTranscript');
  const audioDescription= alts.has('audioDescription');

  function coversAll(candidate) {
    const hasTextual  = candidate.has('textual');
    const hasVisual   = candidate.has('visual');
    const hasAuditory = candidate.has('auditory');

    // Text content requires textual access
    if (hasT && !hasTextual) return false;

    // Images: visual, or alt text as textual
    if (hasI) {
      const imagesCovered = hasVisual || (altText && hasTextual);
      if (!imagesCovered) return false;
    }

    // Audio: auditory, or transcript as textual
    if (hasA) {
      const audioCovered = hasAuditory || (transcript && hasTextual);
      if (!audioCovered) return false;
    }

    // Video: must cover both audio and visual components
    if (hasV) {
      // Cover video's audio track
      const videoAudioCovered =
        hasAuditory ||
        (captions && hasVisual) ||
        (transcript && hasTextual) ||
        (descTranscript && hasTextual);
      if (!videoAudioCovered) return false;

      // Cover video's visual track
      const videoVisualCovered =
        hasVisual ||
        (descTranscript && hasTextual) ||
        (audioDescription && hasAuditory);
      if (!videoVisualCovered) return false;
    }

    return true;
  }

  const allCandidates = [
    ['textual'],
    ['visual'],
    ['auditory'],
    ['textual','visual'],
    ['textual','auditory'],
    ['visual','auditory'],
    ['textual','visual','auditory']
  ].map(arr => new Set(arr));

  const covered = allCandidates.filter(coversAll);

  // Keep minimal sets, then include logical expansions that still satisfy coverage
  function isProperSubset(a, b) {
    if (a.size >= b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }

  const minimal = covered.filter(set =>
    !covered.some(other => other !== set && isProperSubset(other, set))
  );

  const expansions = new Set();
  minimal.forEach(set => {
    // Always include the minimal set itself
    expansions.add(JSON.stringify(sortSetArray(set)));

    // Offer expanded sets that remain sufficient, in stable order
    if ((hasI || hasV) && !set.has('visual')) {
      const s = new Set(set); s.add('visual');
      if (coversAll(s)) expansions.add(JSON.stringify(sortSetArray(s)));
    }
    if ((hasA || hasV) && !set.has('auditory')) {
      const s = new Set(set); s.add('auditory');
      if (coversAll(s)) expansions.add(JSON.stringify(sortSetArray(s)));
    }
    if ((hasT || altText || transcript || descTranscript) && !set.has('textual')) {
      const s = new Set(set); s.add('textual');
      if (coversAll(s)) expansions.add(JSON.stringify(sortSetArray(s)));
    }
  });

  return [...expansions].map(s => JSON.parse(s));
}

// Rendering
function render() {
  const selections = getState();

  const copyResultsBtn = document.getElementById('copyResultsBtn');
  const copyMetaBtn = document.getElementById('copyMetaBtn');

  if (selections.c.size === 0) {
    resultsDiv.innerHTML = '<span class="empty">Select at least one content format type.</span>';
    metaDiv.innerHTML    = '<span class="empty">Select at least one content format type.</span>';
    copyResultsBtn.classList.add('hidden');
    copyMetaBtn.classList.add('hidden');
    return;
  }

  const sets = evaluateSets();

  if (sets.length === 0) {
    resultsDiv.innerHTML = '<span class="empty">No sufficient combinations found.</span>';
    metaDiv.innerHTML    = '<span class="empty">No sufficient combinations found.</span>';
    copyResultsBtn.classList.add('hidden');
    copyMetaBtn.classList.add('hidden');
    return;
  }

  resultsDiv.innerHTML = sets
    .map(arr => `<span class="value">[${arr.map(s => `"${s}"`).join(', ')}]</span>`)
    .join('\n');

  metaDiv.innerHTML = sets
    .map(arr => `<span class="metaTag">&lt;meta property="schema:accessModeSufficient"&gt;${arr.join(', ')}&lt;/meta&gt;</span>`)
    .join('\n');

  copyResultsBtn.classList.remove('hidden');
  copyMetaBtn.classList.remove('hidden');
}

function copyToClipboard(text, feedbackEl) {
  navigator.clipboard.writeText(text).then(() => {
    feedbackEl.classList.remove('visually-hidden');
    feedbackEl.textContent = 'Copied!';
    // Leave it long enough for AT to announce
    setTimeout(() => {
      feedbackEl.textContent = '';
      feedbackEl.classList.add('visually-hidden');
    }, 2000);
  }).catch(err => {
    feedbackEl.classList.remove('visually-hidden');
    feedbackEl.textContent = 'Copy failed';
    console.error('Failed to copy:', err);
  });
}

// Run once on initial load
document.addEventListener('DOMContentLoaded', () => {
  updateAltCheckboxStates();
  render();
});

// Run again whenever the page is restored from bfcache or back navigation
window.addEventListener('pageshow', () => {
  updateAltCheckboxStates();
  render();
});

// Wiring
const resultsDiv = document.getElementById('results');
const metaDiv    = document.getElementById('metaOutput');

// Recalculate on any checkbox change
document.querySelectorAll('#epubForm input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', () => {
    updateAltCheckboxStates();
    render();
  });
});

// Initial paint
updateAltCheckboxStates();
render();

