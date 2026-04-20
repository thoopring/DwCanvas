// CleanShot — Side Panel Controller
const API_BASE = 'https://cleanshot-api.thoopring.workers.dev';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let state = {
  user: null,
  token: null,
  currentVideo: null,
  processing: false,
  currentCarousel: null,
  currentVideoId: null,
  libraryItems: [],
  librarySearch: '',
  libraryFavOnly: false,
  // Hook flow
  pendingTranscript: null,
  pendingInsights: null,
  pendingHooks: null,
  selectedHook: null,
  // Capture items (legacy screenshot feature)
  captureItems: [],
};

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await restoreSession();
  setupTabs();
  setupListeners();

  if (state.user && state.token) {
    try {
      const res = await fetch(`${API_BASE}/api/me`, {
        headers: { 'Authorization': `Bearer ${state.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        state.user = { ...state.user, ...data };
        await saveSession();
      } else {
        state.user = null;
        state.token = null;
        await chrome.storage.session.clear();
      }
    } catch (e) {}

    if (state.user) {
      showApp();
      detectVideo();
    }
  }
});

// ── Session ───────────────────────────────────────────
async function restoreSession() {
  const stored = await chrome.storage.session.get(['cs_token', 'cs_user']);
  if (stored.cs_token && stored.cs_user) {
    state.token = stored.cs_token;
    state.user = stored.cs_user;
  }
}

async function saveSession() {
  await chrome.storage.session.set({
    cs_token: state.token,
    cs_user: state.user,
  });
}

// ── Listeners ─────────────────────────────────────────
function setupListeners() {
  $('#btn-login').addEventListener('click', handleLogin);
  $('#btn-oneshot').addEventListener('click', handleOneShot);
  $('#btn-copy-carousel').addEventListener('click', handleCopyCarousel);
  $('#btn-download-zip').addEventListener('click', handleDownloadZip);
  $('#btn-upgrade')?.addEventListener('click', (e) => {
    handleUpgrade(e.currentTarget.dataset.plan || 'creator');
  });
  $('#btn-logout')?.addEventListener('click', handleLogout);
  $('#btn-settings')?.addEventListener('click', openSettings);
  $('#btn-settings-cancel')?.addEventListener('click', closeSettings);
  $('#btn-settings-save')?.addEventListener('click', saveSettings);
  $('#btn-voice-upgrade')?.addEventListener('click', () => handleUpgrade('pro'));
  $('#btn-voice-train')?.addEventListener('click', trainVoice);
  $('#btn-voice-clear')?.addEventListener('click', clearVoice);
  $('#btn-confirm-hook')?.addEventListener('click', confirmHookAndGenerate);
  $('#btn-cancel-hook')?.addEventListener('click', cancelHookPick);

  // Settings: color input sync
  $('#setting-color')?.addEventListener('input', (e) => {
    $('#setting-color-text').value = e.target.value.toUpperCase();
  });
  $('#setting-color-text')?.addEventListener('input', (e) => {
    if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
      $('#setting-color').value = e.target.value;
    }
  });

  // Capture tab actions
  $('#btn-capture-shot')?.addEventListener('click', captureScreenshot);
  $('#btn-capture-time')?.addEventListener('click', captureTimestamp);
  $('#btn-capture-clear')?.addEventListener('click', clearCaptures);
  $('#btn-capture-pdf')?.addEventListener('click', exportCapturesPDF);

  // Template picker in settings modal
  $$('.template-option').forEach(opt => {
    opt.addEventListener('click', () => {
      $$('.template-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });

  // Avatar dropdown
  $('#user-avatar')?.addEventListener('click', (e) => {
    e.stopPropagation();
    $('#user-dropdown').classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    const dd = $('#user-dropdown');
    if (dd && !dd.contains(e.target)) dd.classList.remove('open');
  });

  // Library toolbar
  $('#library-search')?.addEventListener('input', (e) => {
    state.librarySearch = e.target.value.toLowerCase();
    renderLibrary();
  });
  $('#library-fav-filter')?.addEventListener('click', () => {
    state.libraryFavOnly = !state.libraryFavOnly;
    $('#library-fav-filter').classList.toggle('active', state.libraryFavOnly);
    renderLibrary();
  });

  chrome.tabs?.onUpdated?.addListener((tabId, changeInfo) => {
    if (changeInfo.url && state.user) detectVideo();
  });
  chrome.tabs?.onActivated?.addListener(() => {
    if (state.user) detectVideo();
  });
}

async function handleLogin() {
  try {
    $('#btn-login').textContent = 'Signing in...';
    $('#btn-login').disabled = true;

    const authResult = await chrome.identity.getAuthToken({
      interactive: true,
      scopes: ['openid', 'email', 'profile']
    });

    const res = await fetch(`${API_BASE}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: authResult.token }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Auth failed (${res.status})`);
    }

    const data = await res.json();
    state.token = data.token;
    state.user = data.user;

    await saveSession();
    showApp();
    detectVideo();
  } catch (err) {
    console.error('Login failed:', err);
    toast(err.message || 'Sign in failed.');
  } finally {
    $('#btn-login').textContent = 'Sign in with Google';
    $('#btn-login').disabled = false;
  }
}

// ── App UI ────────────────────────────────────────────
function showApp() {
  $('#view-login').classList.remove('active');
  $('#view-main').classList.add('active');
  $('#tab-bar').style.display = 'flex';

  if (state.user.picture) {
    $('#user-avatar').src = state.user.picture;
    $('#user-avatar').style.display = 'block';
  }
  $('#dropdown-name').textContent = state.user.name || 'User';
  $('#dropdown-email').textContent = state.user.email || '';

  const planLabel = $('#plan-label');
  planLabel.style.display = 'inline-block';
  if (state.user.plan === 'pro') {
    planLabel.textContent = 'PRO';
    planLabel.className = 'brand-plan plan-pro';
  } else if (state.user.plan === 'creator') {
    planLabel.textContent = 'CREATOR';
    planLabel.className = 'brand-plan plan-creator';
  } else {
    planLabel.textContent = 'FREE';
    planLabel.className = 'brand-plan plan-free';
  }

  // Paywall mode: show upgrade banner when Free trial used or Creator quota exceeded
  $('#launch-banner').style.display = 'none';
  renderUpgradeBanner();

  // Sync template dropdown with user default
  const tplSel = $('#template-select');
  if (tplSel && state.user.default_template) {
    tplSel.value = state.user.default_template;
  }
}

function renderUpgradeBanner() {
  const banner = $('#upgrade-banner');
  const u = state.user;
  if (!banner || !u) return;

  const isPro = u.plan === 'pro' && u.plan_status === 'active';
  if (isPro) { banner.style.display = 'none'; return; }

  const isCreator = u.plan === 'creator' && u.plan_status === 'active';
  const used = u.usage?.videos_used ?? 0;
  const overCreatorQuota = isCreator && used >= 30;
  const freeTrialUsed = u.plan === 'free' && u.trial_used;

  if (freeTrialUsed) {
    banner.querySelector('h3').textContent = 'Unlock unlimited carousels';
    banner.querySelector('p').textContent = 'Your free trial is used. Upgrade to Creator for 30 videos/month.';
    const btn = banner.querySelector('#btn-upgrade');
    btn.textContent = 'Upgrade — $19/mo';
    btn.dataset.plan = 'creator';
    banner.style.display = 'block';
  } else if (overCreatorQuota) {
    banner.querySelector('h3').textContent = 'Monthly limit reached';
    banner.querySelector('p').textContent = 'You\'ve used 30 videos this month. Upgrade to Pro for unlimited + Brand Voice.';
    const btn = banner.querySelector('#btn-upgrade');
    btn.textContent = 'Upgrade to Pro — $49/mo';
    btn.dataset.plan = 'pro';
    banner.style.display = 'block';
  } else if (isCreator) {
    // Subtle Pro upsell for Creator users
    banner.querySelector('h3').textContent = 'Want your own voice?';
    banner.querySelector('p').textContent = `${used}/30 videos used this month. Pro adds Brand Voice so AI writes in your style.`;
    const btn = banner.querySelector('#btn-upgrade');
    btn.textContent = 'Get Pro — $49/mo';
    btn.dataset.plan = 'pro';
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

// ── Tabs ──────────────────────────────────────────────
function setupTabs() {
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const target = tab.dataset.tab;
      // Hide ALL views (not just some) to prevent cross-tab leakage
      ['main', 'capture', 'library', 'processing', 'result', 'hooks', 'error'].forEach(v => {
        const el = $(`#view-${v}`);
        if (el) el.classList.remove('active');
      });

      // If AI generation in progress, always stay on processing view
      if (state.processing) {
        $$('.tab').forEach(t => t.classList.remove('active'));
        $$('.tab')[0].classList.add('active');
        $('#view-processing').classList.add('active');
        toast('Please wait for generation to finish.');
        return;
      }

      if (target === 'main') {
        $('#view-main').classList.add('active');
      } else if (target === 'capture') {
        $('#view-capture').classList.add('active');
        loadCaptures();
      } else if (target === 'library') {
        $('#view-library').classList.add('active');
        loadLibrary();
      }
    });
  });
}

// ── Video Detection ───────────────────────────────────
async function detectVideo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.includes('youtube.com/watch')) { showNoVideo(); return; }

    const videoId = new URL(tab.url).searchParams.get('v');
    if (!videoId) { showNoVideo(); return; }

    chrome.tabs.sendMessage(tab.id, { action: 'GET_VIDEO_INFO' }, (res) => {
      if (chrome.runtime.lastError || !res) {
        showVideoDetected({
          videoId,
          title: tab.title?.replace(' - YouTube', '') || 'YouTube Video',
          channel: '', duration: null,
        });
        return;
      }
      showVideoDetected(res);
    });
  } catch (e) { showNoVideo(); }
}

function showNoVideo() {
  state.currentVideo = null;
  $('#no-video').style.display = 'block';
  $('#video-detected').style.display = 'none';
  $('#btn-oneshot').disabled = true;
}

function showVideoDetected(info) {
  state.currentVideo = info;
  $('#no-video').style.display = 'none';
  $('#video-detected').style.display = 'flex';
  $('#video-title').textContent = info.title;
  $('#video-meta').textContent = info.channel || '';
  $('#video-thumb').src = `https://i.ytimg.com/vi/${info.videoId}/mqdefault.jpg`;
  $('#btn-oneshot').disabled = false;
  // Launch mode: no quota enforcement on client — backend handles everything
}

// ── One-Shot ──────────────────────────────────────────
const EXTRACTION_MESSAGES = [
  'Reading the video captions...',
  'Scanning for key moments...',
  'Mapping timestamps to content...',
  'Building transcript timeline...',
  'Removing filler and redundancy...',
];

const AI_MESSAGES = [
  'Identifying the speaker\'s core arguments...',
  'Extracting contrarian insights...',
  'Looking for counter-intuitive takeaways...',
  'Ranking insights by impact...',
  'Crafting a hook that stops the scroll...',
  'Writing in a confident, direct voice...',
  'Shaping each slide for maximum saves...',
  'Adding the CTA that invites comments...',
  'Picking hashtags that trend in B2B...',
  'Final polish — tightening every sentence...',
];

let _progressInterval = null;
let _messageInterval = null;

function animateProgress(fromPct, toPct, durationMs) {
  if (_progressInterval) clearInterval(_progressInterval);
  const startTime = Date.now();
  _progressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const ratio = Math.min(elapsed / durationMs, 1);
    const pct = fromPct + (toPct - fromPct) * ratio;
    $('#progress-fill').style.width = `${pct}%`;
    if (ratio >= 1) clearInterval(_progressInterval);
  }, 200);
}

function rotateMessages(messages, intervalMs = 2500) {
  if (_messageInterval) clearInterval(_messageInterval);
  let i = 0;
  const stepEl = $('#processing-step');
  stepEl.textContent = messages[0];
  stepEl.style.opacity = '1';
  _messageInterval = setInterval(() => {
    i = (i + 1) % messages.length;
    stepEl.style.opacity = '0';
    setTimeout(() => {
      stepEl.textContent = messages[i];
      stepEl.style.opacity = '1';
    }, 300);
  }, intervalMs);
}

function stopAnimations() {
  if (_progressInterval) { clearInterval(_progressInterval); _progressInterval = null; }
  if (_messageInterval) { clearInterval(_messageInterval); _messageInterval = null; }
}

async function handleOneShot() {
  if (!state.currentVideo || state.processing) return;
  state.processing = true;

  const videoDuration = state.currentVideo.duration || 300;
  const PLAYBACK_SPEED = 16;
  const estimatedExtractSec = Math.max(10, Math.ceil(videoDuration / PLAYBACK_SPEED) + 3);

  showView('processing');
  setProgress(0, 'Preparing...');

  try {
    $('#processing-title').textContent = 'Reading the video';
    rotateMessages(EXTRACTION_MESSAGES, 2200);
    animateProgress(2, 45, estimatedExtractSec * 1000);

    const transcript = await extractTranscript();
    stopAnimations();

    if (!transcript || transcript.length === 0) {
      const e = new Error('No transcript extracted');
      e.code = 'EMPTY_TRANSCRIPT';
      throw e;
    }

    // Step 2: Generate hooks (3 variants to choose from)
    $('#processing-title').textContent = 'Analyzing insights';
    rotateMessages([
      'Reading through the transcript...',
      'Identifying core arguments...',
      'Generating 3 hook variations...',
      'Trying different angles...',
    ], 2000);
    animateProgress(45, 85, 12000);

    const hooksRes = await fetch(`${API_BASE}/api/generate-hooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`,
      },
      body: JSON.stringify({
        title: state.currentVideo.title,
        transcript,
      }),
    });
    stopAnimations();

    if (!hooksRes.ok) {
      const err = await hooksRes.json().catch(() => ({}));
      if (hooksRes.status === 402) {
        state.user.trial_used = 1;
        await saveSession();
        state.processing = false;
        showApp();
        showError({
          code: err.code === 'QUOTA_EXCEEDED' ? 'QUOTA_EXCEEDED' : 'TRIAL_USED',
          action: 'upgrade',
        });
        return;
      }
      // Save transcript for retry (don't throw away user's wait time)
      state.pendingTranscript = transcript;
      state.processing = false;
      showError({
        code: err.code || 'unknown',
        message: err.error,
        retryFn: async () => {
          state.processing = true;
          await retryHookGeneration();
        },
        backFn: () => {
          state.pendingTranscript = null;
          state.processing = false;
          showView('main');
        },
      });
      return;
    }

    const hookData = await hooksRes.json();

    state.pendingTranscript = transcript;
    state.pendingInsights = hookData.insights;
    state.pendingHooks = hookData.hooks;
    state.selectedHook = null;

    showHookPicker(hookData.hooks);

  } catch (err) {
    console.error('One-shot failed:', err);
    stopAnimations();
    state.processing = false;
    showError({
      code: err.code || 'unknown',
      message: err.message,
      retryFn: () => { state.processing = true; handleOneShot().finally(() => {}); },
    });
  }
}

async function retryHookGeneration() {
  if (!state.pendingTranscript) return;
  showView('processing');
  $('#processing-title').textContent = 'Retrying AI analysis';
  rotateMessages([
    'Reconnecting to AI service...',
    'Retrying hook generation...',
    'Almost there...',
  ], 2000);
  animateProgress(0, 90, 15000);

  try {
    const res = await fetch(`${API_BASE}/api/generate-hooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`,
      },
      body: JSON.stringify({
        title: state.currentVideo?.title,
        transcript: state.pendingTranscript,
      }),
    });
    stopAnimations();

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      state.processing = false;
      showError({
        code: err.code || 'unknown',
        message: err.error,
        retryFn: () => { state.processing = true; retryHookGeneration(); },
        backFn: () => {
          state.pendingTranscript = null;
          state.processing = false;
          showView('main');
        },
      });
      return;
    }

    const data = await res.json();
    state.pendingInsights = data.insights;
    state.pendingHooks = data.hooks;
    state.selectedHook = null;
    showHookPicker(data.hooks);
  } catch (err) {
    stopAnimations();
    state.processing = false;
    showError({
      code: 'NETWORK_ERROR',
      retryFn: () => { state.processing = true; retryHookGeneration(); },
    });
  }
}

function showHookPicker(hooks) {
  showView('hooks');
  const container = $('#hook-options');
  container.innerHTML = '';
  const labels = ['Contrarian', 'Concrete', 'Story-driven'];
  hooks.forEach((h, i) => {
    const div = document.createElement('div');
    div.className = 'hook-option';
    div.innerHTML = `
      <div class="hook-label">Option ${i + 1} &middot; ${labels[i] || 'Alternative'}</div>
      <div class="hook-text">${escapeHtml(h)}</div>
    `;
    div.addEventListener('click', () => {
      $$('.hook-option').forEach(o => o.classList.remove('selected'));
      div.classList.add('selected');
      state.selectedHook = h;
      $('#btn-confirm-hook').disabled = false;
      $('#btn-confirm-hook').textContent = 'Generate with this hook';
    });
    container.appendChild(div);
  });

  // Auto-select first option so user doesn't get stuck
  const first = container.querySelector('.hook-option');
  if (first) {
    first.classList.add('selected');
    state.selectedHook = hooks[0];
    $('#btn-confirm-hook').disabled = false;
    $('#btn-confirm-hook').textContent = 'Generate with this hook';
  }

  // Show hint in button when nothing selected
  if (!state.selectedHook) {
    $('#btn-confirm-hook').textContent = 'Select a hook first';
    $('#btn-confirm-hook').disabled = true;
  }
}

function cancelHookPick() {
  state.processing = false;
  state.pendingTranscript = null;
  state.pendingHooks = null;
  state.selectedHook = null;
  showView('main');
}

async function confirmHookAndGenerate() {
  if (!state.selectedHook) return;

  showView('processing');
  $('#processing-title').textContent = 'Writing your carousel';
  rotateMessages(AI_MESSAGES, 2000);
  animateProgress(0, 95, 20000);

  try {
    const processRes = await fetch(`${API_BASE}/api/process-video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`,
      },
      body: JSON.stringify({
        youtube_id: state.currentVideo.videoId,
        title: state.currentVideo.title,
        channel: state.currentVideo.channel,
        duration_sec: state.currentVideo.duration ? Math.round(state.currentVideo.duration) : null,
        persona: 'linkedin_hooked',
        transcript: state.pendingTranscript,
        insights: state.pendingInsights,
        chosen_hook: state.selectedHook,
      }),
    });
    stopAnimations();

    if (!processRes.ok) {
      const err = await processRes.json().catch(() => ({}));
      if (processRes.status === 402) {
        const e = new Error(err.error || 'Quota exceeded');
        e.code = err.code === 'QUOTA_EXCEEDED' ? 'QUOTA_EXCEEDED' : 'TRIAL_USED';
        throw e;
      }
      const e = new Error(err.error || `Server error`);
      e.code = err.code || 'unknown';
      throw e;
    }

    const result = await processRes.json();
    if (result.status === 'failed') {
      const e = new Error(result.error || 'Processing failed');
      e.code = result.code || 'unknown';
      throw e;
    }

    setProgress(100, 'Done!');
    await sleep(300);

    state.currentCarousel = result.carousel;
    state.currentVideoId = result.video_id;
    // Clear pending cache — success
    state.pendingTranscript = null;
    state.pendingInsights = null;
    state.pendingHooks = null;
    state.processing = false;

    // Keep quota counter in sync for banner/paywall logic
    if (state.user?.usage) state.user.usage.videos_used = (state.user.usage.videos_used ?? 0) + 1;
    if (state.user?.plan === 'free') state.user.trial_used = 1;
    renderUpgradeBanner();
    await saveSession();

    showResult(result.carousel);

  } catch (err) {
    stopAnimations();
    state.processing = false;
    showError({
      code: err.code || 'unknown',
      message: err.message,
      retryFn: () => { state.processing = true; confirmHookAndGenerate(); },
      backFn: () => {
        state.processing = false;
        if (state.pendingHooks) {
          showHookPicker(state.pendingHooks);
        } else {
          showView('main');
        }
      },
    });
  }
}

async function extractTranscript() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) {
        const e = new Error('No active tab');
        e.code = 'VIDEO_NOT_FOUND';
        return reject(e);
      }
      chrome.tabs.sendMessage(tab.id, {
        action: 'EXTRACT_TRANSCRIPT',
        maxDuration: 3600,
      }, (res) => {
        if (chrome.runtime.lastError) {
          const e = new Error('Connection lost');
          e.code = 'CONNECTION_LOST';
          return reject(e);
        }
        if (res?.error) {
          const e = new Error(res.error);
          e.code = res.code || 'EXTRACTION_FAILED';
          return reject(e);
        }
        resolve(res?.segments || []);
      });
    });
  });
}

// ── Result Display ────────────────────────────────────
function showResult(carousel) {
  showView('result');
  const container = $('#slides-container');
  container.innerHTML = '';

  container.appendChild(createSlideCard('Hook', carousel.hook));
  carousel.slides.forEach((slide, i) => {
    container.appendChild(createSlideCard(`Slide ${i + 1}`, slide.body));
  });
  container.appendChild(createSlideCard('CTA', carousel.cta));

  if (carousel.hashtags?.length) {
    const tagDiv = document.createElement('div');
    tagDiv.className = 'hashtags';
    tagDiv.textContent = carousel.hashtags.join(' ');
    container.appendChild(tagDiv);
  }
}

function createSlideCard(label, text) {
  const div = document.createElement('div');
  div.className = 'slide-card';
  div.innerHTML = `<div class="slide-num">${label}</div><div class="slide-text">${escapeHtml(text)}</div>`;
  return div;
}

// ── Copy / ZIP Download ───────────────────────────────
function handleCopyCarousel() {
  if (!state.currentCarousel) return;
  const c = state.currentCarousel;
  const parts = [
    c.hook,
    '',
    ...c.slides.map((s, i) => `${i + 1}. ${s.body}`),
    '',
    c.cta,
    '',
    (c.hashtags || []).join(' '),
  ];
  navigator.clipboard.writeText(parts.join('\n')).then(() => toast('Copied to clipboard'));
}

async function handleDownloadZip() {
  if (!state.currentCarousel) return;
  const btn = $('#btn-download-zip');
  const original = btn.textContent;
  btn.textContent = 'Building...';
  btn.disabled = true;

  try {
    const zip = new JSZip();
    const c = state.currentCarousel;
    const templateId = $('#template-select')?.value || state.user?.default_template || 'minimal_dark';

    // Brand data for template
    const brand = {
      name: state.user?.display_name || state.user?.name || 'You',
      handle: state.user?.handle || '',
      color: state.user?.brand_color || '#6366F1',
      avatarImg: null,
    };
    if (state.user?.picture) {
      brand.avatarImg = await CleanShotTemplates.loadAvatar(state.user.picture);
    }

    // Build slide sequence (cover, hook, content*N, cta, end)
    const slides = CleanShotTemplates.buildSlides(c, state.currentVideo?.title || 'LinkedIn Carousel');

    // Render each slide and collect PNG blobs
    const pngBlobs = [];
    for (let i = 0; i < slides.length; i++) {
      const blob = await CleanShotTemplates.renderSlide(
        templateId, slides[i], i + 1, slides.length, brand
      );
      pngBlobs.push(blob);
      const filename = String(i + 1).padStart(2, '0') + '_' + slides[i].type + '.png';
      zip.file('images/' + filename, blob);
    }

    // Generate PDF from PNGs
    const pdfBlob = await buildPDF(pngBlobs);
    zip.file('carousel.pdf', pdfBlob);

    // Carousel text (post caption)
    const captionText = [
      c.hook,
      '',
      ...c.slides.map((s, i) => `${i + 2}. ${s.body}`),
      '',
      c.cta,
      '',
      (c.hashtags || []).join(' '),
    ].join('\n');
    zip.file('post_caption.txt', captionText);

    // How to post guide
    zip.file('HOW_TO_POST.md', buildHowToPost(slides.length));

    // Generate and download
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (state.currentVideo?.title || 'carousel').replace(/[^a-z0-9]/gi, '_').slice(0, 30);
    a.download = `cleanshot_${safeTitle}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    toast('ZIP downloaded');
  } catch (err) {
    console.error('ZIP failed:', err);
    toast('ZIP generation failed');
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

// Build PDF from PNG blobs
async function buildPDF(pngBlobs) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: [1080, 1080], // square carousel format
  });

  for (let i = 0; i < pngBlobs.length; i++) {
    const dataUrl = await blobToDataUrl(pngBlobs[i]);
    if (i > 0) pdf.addPage([1080, 1080], 'portrait');
    pdf.addImage(dataUrl, 'PNG', 0, 0, 1080, 1080);
  }

  return pdf.output('blob');
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function buildHowToPost(slideCount) {
  return `# How to post this carousel on LinkedIn

Your ZIP contains everything you need to publish a LinkedIn carousel post.

## What's inside

- **carousel.pdf** — The full carousel as a single PDF (${slideCount} pages)
- **images/** — Individual slide images (PNG, 1080x1080)
- **post_caption.txt** — The caption text to paste into LinkedIn
- **HOW_TO_POST.md** — This file

---

## Option 1: Document Post (recommended — higher engagement)

LinkedIn Document posts typically get 2-3x more engagement than regular posts.

1. Go to LinkedIn and click **"Start a post"**
2. Click the **three dots (···)** or **"+"** icon in the post composer
3. Select **"Add a document"**
4. Upload **carousel.pdf** from this ZIP
5. Give it a title (appears above the carousel)
6. Open **post_caption.txt** and copy the text into the post body
7. Click **Post**

Your carousel will be swipeable and downloadable for your audience.

---

## Option 2: Multi-image Post

1. Click **"Start a post"** on LinkedIn
2. Click the **image icon**
3. Upload all PNGs from the **images/** folder (select them all at once)
4. Make sure they are in the right order (01, 02, 03...)
5. Copy-paste the text from **post_caption.txt** into the post body
6. Click **Post**

---

## Pro tips

- **Post time matters:** Tuesday–Thursday, 7-9 AM or 12-2 PM (your audience's timezone) typically gets best reach.
- **Engage early:** Reply to every comment in the first hour to boost the algorithm.
- **Add a question:** The caption ends with a CTA — this is intentional. Answered comments lift reach.
- **Save for later:** Prompt readers to "Save this" — saves are a strong positive signal.

---

Generated by CleanShot · https://thoopring.github.io/DwCanvas/
`;
}

// ── Library ───────────────────────────────────────────
async function loadLibrary() {
  const list = $('#library-list');
  list.innerHTML = '<div class="empty"><div class="spinner" style="width:32px;height:32px;margin:0 auto 12px"></div><p>Loading...</p></div>';

  try {
    const res = await fetch(`${API_BASE}/api/library`, {
      headers: { 'Authorization': `Bearer ${state.token}` },
    });
    if (!res.ok) throw new Error(`Library load failed (${res.status})`);

    const data = await res.json();
    state.libraryItems = data.videos || [];
    renderLibrary();
  } catch (err) {
    console.error(err);
    list.innerHTML = `<div class="empty"><p>Failed to load library</p></div>`;
  }
}

function renderLibrary() {
  const list = $('#library-list');
  const q = state.librarySearch.trim();
  const favOnly = state.libraryFavOnly;

  let items = state.libraryItems;
  if (q) {
    items = items.filter(v =>
      (v.title || '').toLowerCase().includes(q) ||
      (v.hook_preview || '').toLowerCase().includes(q)
    );
  }
  if (favOnly) items = items.filter(v => v.is_favorite);

  if (items.length === 0) {
    const msg = state.libraryItems.length === 0
      ? 'Your generated carousels will appear here'
      : q ? `No results for "${q}"`
      : favOnly ? 'No favorites yet. Click the star on any item to save it.'
      : 'Nothing here yet';
    list.innerHTML = `
      <div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
        </svg>
        <p>${msg}</p>
      </div>
    `;
    return;
  }

  // Split into ready and failed
  const ready = items.filter(v => v.status === 'ready');
  const processing = items.filter(v => v.status === 'processing');
  const failed = items.filter(v => v.status === 'failed');

  list.innerHTML = '';

  if (processing.length > 0) {
    const h = document.createElement('div');
    h.className = 'library-section-title';
    h.textContent = 'Processing';
    list.appendChild(h);
    processing.forEach(v => list.appendChild(renderLibraryItem(v)));
  }

  ready.forEach(v => list.appendChild(renderLibraryItem(v)));

  if (failed.length > 0) {
    const h = document.createElement('div');
    h.className = 'library-section-title';
    h.textContent = `Failed (${failed.length})`;
    list.appendChild(h);
    failed.forEach(v => list.appendChild(renderLibraryItem(v)));
  }
}

function renderLibraryItem(v) {
  const item = document.createElement('div');
  item.className = 'library-item' + (v.status === 'failed' ? ' failed' : '');
  item.dataset.id = v.id;

  const thumbHtml = `
    <div class="library-thumb-wrap">
      <img class="library-thumb" src="https://i.ytimg.com/vi/${v.youtube_id}/mqdefault.jpg" alt="">
      ${v.is_favorite ? `<div class="library-fav-star"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>` : ''}
    </div>
  `;

  let hookHtml = '';
  if (v.status === 'failed') {
    hookHtml = '<div class="library-hook library-hook-failed">Generation failed. Click retry to try again.</div>';
  } else if (v.status === 'processing') {
    hookHtml = '<div class="library-hook">Processing...</div>';
  } else if (v.hook_preview) {
    hookHtml = `<div class="library-hook">${escapeHtml(v.hook_preview)}</div>`;
  }

  // Build action buttons
  let actionsHtml = '';
  if (v.status === 'ready') {
    actionsHtml = `
      <button class="library-action ${v.is_favorite ? 'star-active' : ''}" data-action="star" title="${v.is_favorite ? 'Unfavorite' : 'Favorite'}">
        <svg viewBox="0 0 24 24" fill="${v.is_favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </button>
      <button class="library-action" data-action="copy" title="Copy text">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      </button>
      <button class="library-action" data-action="download" title="Download ZIP">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      </button>
      <button class="library-action delete" data-action="delete" title="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
      </button>
    `;
  } else if (v.status === 'failed') {
    actionsHtml = `
      <button class="library-action retry" data-action="retry" title="Retry">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
      </button>
      <button class="library-action delete" data-action="delete" title="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
      </button>
    `;
  }

  item.innerHTML = `
    ${thumbHtml}
    <div class="library-info">
      <div class="library-title">${escapeHtml(v.title || 'Untitled')}</div>
      ${hookHtml}
      <div class="library-date">${formatDate(v.created_at)}</div>
    </div>
    ${actionsHtml ? `<div class="library-actions">${actionsHtml}</div>` : ''}
  `;

  // Click item to open (only for ready)
  item.addEventListener('click', (e) => {
    if (e.target.closest('.library-action')) return;
    if (v.status === 'ready') openLibraryVideo(v.id);
  });

  // Action handlers
  item.querySelectorAll('.library-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      handleLibraryAction(action, v);
    });
  });

  return item;
}

async function handleLibraryAction(action, v) {
  if (action === 'star') {
    try {
      const newFav = !v.is_favorite;
      await fetch(`${API_BASE}/api/videos/${v.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`,
        },
        body: JSON.stringify({ is_favorite: newFav }),
      });
      v.is_favorite = newFav;
      renderLibrary();
    } catch { toast('Failed to update'); }
  }

  if (action === 'delete') {
    if (!confirm('Delete this carousel?')) return;
    try {
      await fetch(`${API_BASE}/api/videos/${v.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${state.token}` },
      });
      state.libraryItems = state.libraryItems.filter(x => x.id !== v.id);
      renderLibrary();
      toast('Deleted');
    } catch { toast('Delete failed'); }
  }

  if (action === 'copy') {
    try {
      const res = await fetch(`${API_BASE}/api/videos/${v.id}`, {
        headers: { 'Authorization': `Bearer ${state.token}` },
      });
      const data = await res.json();
      if (!data.carousel) return toast('No carousel to copy');
      const c = data.carousel;
      const parts = [
        c.hook, '',
        ...c.slides.map((s, i) => `${i + 1}. ${s.body}`), '',
        c.cta, '',
        (c.hashtags || []).join(' '),
      ];
      await navigator.clipboard.writeText(parts.join('\n'));
      toast('Copied');
    } catch { toast('Copy failed'); }
  }

  if (action === 'download') {
    try {
      const res = await fetch(`${API_BASE}/api/videos/${v.id}`, {
        headers: { 'Authorization': `Bearer ${state.token}` },
      });
      const data = await res.json();
      if (!data.carousel) return toast('No carousel to download');
      state.currentCarousel = data.carousel;
      state.currentVideo = {
        videoId: data.youtube_id,
        title: data.title,
      };
      await handleDownloadZip();
    } catch { toast('Download failed'); }
  }

  if (action === 'retry') {
    // Navigate to YouTube video and trigger generation
    const url = `https://www.youtube.com/watch?v=${v.youtube_id}`;
    chrome.tabs.create({ url });
    toast('Opening video for retry — enable CC and click Generate');
  }
}

async function openLibraryVideo(videoId) {
  try {
    const res = await fetch(`${API_BASE}/api/videos/${videoId}`, {
      headers: { 'Authorization': `Bearer ${state.token}` },
    });
    if (!res.ok) throw new Error('Load failed');
    const data = await res.json();

    if (!data.carousel) {
      toast('This video has no carousel');
      return;
    }

    state.currentCarousel = data.carousel;
    state.currentVideoId = data.id;
    state.currentVideo = {
      videoId: data.youtube_id,
      title: data.title,
      channel: data.channel,
      duration: data.duration_sec,
    };

    // Switch to Create tab and show result
    $$('.tab').forEach(t => t.classList.remove('active'));
    $$('.tab')[0].classList.add('active');
    showResult(data.carousel);
  } catch (err) {
    toast('Failed to open carousel');
  }
}

// ── Settings Modal ────────────────────────────────────
function openSettings() {
  $('#user-dropdown').classList.remove('open');
  $('#setting-name').value = state.user.display_name || state.user.name || '';
  $('#setting-handle').value = state.user.handle || '';
  $('#setting-color').value = state.user.brand_color || '#6366F1';
  $('#setting-color-text').value = (state.user.brand_color || '#6366F1').toUpperCase();

  const defaultTpl = state.user.default_template || 'minimal_dark';
  $$('.template-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.template === defaultTpl);
  });

  renderVoiceSection();
  $('#modal-settings').classList.add('open');
}

function renderVoiceSection() {
  const isPro = state.user?.plan === 'pro' && state.user?.plan_status === 'active';
  $('#voice-locked').style.display = isPro ? 'none' : 'block';
  $('#voice-trainer').style.display = isPro ? 'block' : 'none';
  if (isPro) loadVoice();
}

async function loadVoice() {
  // Reset UI before fetch
  $('#voice-sample-1').value = '';
  $('#voice-sample-2').value = '';
  $('#voice-sample-3').value = '';
  $('#voice-trained').style.display = 'none';
  $('#btn-voice-clear').style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/api/voice`, {
      headers: { 'Authorization': `Bearer ${state.token}` },
    });
    if (!res.ok) return;
    const data = await res.json();

    const samples = data.samples || [];
    if (samples[0]) $('#voice-sample-1').value = samples[0];
    if (samples[1]) $('#voice-sample-2').value = samples[1];
    if (samples[2]) $('#voice-sample-3').value = samples[2];

    if (data.has_voice && data.profile) {
      $('#voice-trained').style.display = 'block';
      $('#btn-voice-clear').style.display = 'block';
      const trainedAt = data.trained_at ? new Date(data.trained_at * 1000).toLocaleDateString() : '';
      $('#voice-status-text').textContent = trainedAt ? `Voice trained · ${trainedAt}` : 'Voice trained';
      const moves = (data.profile.signature_moves || []).slice(0, 3).join(' · ');
      $('#voice-preview').innerHTML =
        `<div class="voice-preview-tone">${escapeHtml(data.profile.tone || '')}</div>` +
        `${escapeHtml(data.profile.directive || '')}` +
        (moves ? `<div style="margin-top:6px;color:var(--text-muted);">${escapeHtml(moves)}</div>` : '');
    }
  } catch (err) {
    console.warn('loadVoice failed', err);
  }
}

async function trainVoice() {
  const samples = [
    $('#voice-sample-1').value.trim(),
    $('#voice-sample-2').value.trim(),
    $('#voice-sample-3').value.trim(),
  ].filter(s => s.length >= 60);

  if (samples.length < 2) {
    toast('Paste at least 2 posts (60+ chars each)');
    return;
  }

  const btn = $('#btn-voice-train');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Training...';

  try {
    const res = await fetch(`${API_BASE}/api/voice/train`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`,
      },
      body: JSON.stringify({ samples }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Training failed');

    toast('Voice trained — carousels will match your style');
    await loadVoice();
  } catch (err) {
    toast(err.message || 'Training failed');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function clearVoice() {
  if (!confirm('Clear trained voice? This removes the saved profile and samples.')) return;
  try {
    const res = await fetch(`${API_BASE}/api/voice`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${state.token}` },
    });
    if (!res.ok) throw new Error('Clear failed');
    toast('Voice cleared');
    await loadVoice();
  } catch (err) {
    toast(err.message || 'Clear failed');
  }
}


function closeSettings() {
  $('#modal-settings').classList.remove('open');
}

async function saveSettings() {
  const selected = $('.template-option.selected');
  const payload = {
    display_name: $('#setting-name').value.trim(),
    handle: $('#setting-handle').value.trim(),
    brand_color: $('#setting-color-text').value.trim().toUpperCase(),
    default_template: selected?.dataset.template || 'minimal_dark',
  };

  try {
    const res = await fetch(`${API_BASE}/api/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Save failed');

    state.user = { ...state.user, ...payload };
    await saveSession();

    // Update template dropdown default selection
    const tplSel = $('#template-select');
    if (tplSel) tplSel.value = payload.default_template;

    closeSettings();
    toast('Brand settings saved');
  } catch (err) {
    toast('Save failed');
  }
}

// ── Logout ────────────────────────────────────────────
async function handleLogout() {
  try {
    // Revoke the Google OAuth token to fully sign out
    const cached = await chrome.identity.getAuthToken({ interactive: false }).catch(() => null);
    if (cached?.token) {
      await chrome.identity.removeCachedAuthToken({ token: cached.token });
      await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${cached.token}`).catch(() => {});
    }
  } catch {}

  // Clear local state
  state.user = null;
  state.token = null;
  state.currentCarousel = null;
  state.currentVideo = null;
  state.libraryItems = [];
  await chrome.storage.session.clear();

  // Close dropdown and show login
  $('#user-dropdown').classList.remove('open');
  $('#user-avatar').style.display = 'none';
  $('#plan-label').style.display = 'none';
  $('#tab-bar').style.display = 'none';
  $$('.view').forEach(v => v.classList.remove('active'));
  $('#view-login').classList.add('active');

  toast('Signed out');
}

// ── Upgrade ───────────────────────────────────────────
async function handleUpgrade(plan) {
  const chosenPlan = plan === 'pro' ? 'pro' : 'creator';
  try {
    const res = await fetch(`${API_BASE}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`,
      },
      body: JSON.stringify({ plan: chosenPlan }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Checkout unavailable');
    }
    const data = await res.json();
    chrome.tabs.create({ url: data.checkout_url });
  } catch (err) {
    toast(err.message || 'Upgrade unavailable');
  }
}

// ── View Management ───────────────────────────────────
function showView(name) {
  ['main', 'processing', 'result', 'library', 'hooks', 'error', 'capture'].forEach(v => {
    const el = $(`#view-${v}`);
    if (el) el.classList.remove('active');
  });
  $(`#view-${name}`).classList.add('active');
}

// Map error codes → user-friendly {title, why, how}
const ERROR_GUIDE = {
  // Extraction errors (content.js)
  VIDEO_NOT_FOUND: {
    title: 'No video detected',
    why: 'We could not find a YouTube video on this page.',
    how: 'Open a YouTube watch page (youtube.com/watch?v=...) and try again.',
    canRetry: false,
  },
  VIDEO_NOT_READY: {
    title: 'Video not ready',
    why: 'The video has not finished loading yet.',
    how: 'Wait for the video to start playing, then click Generate again.',
    canRetry: true,
  },
  VIDEO_TOO_SHORT: {
    title: 'Video is too short',
    why: 'This video is under 30 seconds — not enough content to build a carousel.',
    how: 'Try a video that is at least 2–3 minutes long.',
    canRetry: false,
  },
  VIDEO_TOO_LONG: {
    title: 'Video is too long',
    why: 'Videos longer than 60 minutes exceed the AI context window.',
    how: 'Try a shorter video (under 45 min works best).',
    canRetry: false,
  },
  NO_CC_BUTTON: {
    title: 'This video has no captions',
    why: 'YouTube did not provide any caption tracks for this video.',
    how: 'Try another video — TED Talks, podcasts, and most popular channels have captions.',
    canRetry: false,
  },
  NO_CAPTIONS_VISIBLE: {
    title: 'Captions are not loading',
    why: 'Captions are enabled but the text is not appearing. This can happen with live streams or very new uploads.',
    how: 'Try a different video, or wait a few minutes and try again.',
    canRetry: true,
  },
  EMPTY_TRANSCRIPT: {
    title: 'Could not read the captions',
    why: 'We detected captions but could not extract any readable text.',
    how: 'Refresh the YouTube page (F5), make sure CC is visible on the video, then try again.',
    canRetry: true,
  },
  EXTRACTION_FAILED: {
    title: 'Transcript extraction failed',
    why: 'Something went wrong while reading the video.',
    how: 'Refresh the YouTube page (F5) and try again.',
    canRetry: true,
  },
  // Connection errors
  CONNECTION_LOST: {
    title: 'Connection to YouTube page lost',
    why: 'The extension lost contact with the YouTube tab.',
    how: 'Refresh the YouTube page (F5) and try again.',
    canRetry: true,
  },
  NETWORK_ERROR: {
    title: 'Network error',
    why: 'We could not reach our server.',
    how: 'Check your internet connection and try again.',
    canRetry: true,
  },
  // Quota errors
  TRIAL_USED: {
    title: 'Free trial used',
    why: 'You have already used your 1 free carousel.',
    how: 'Upgrade to Creator ($19/mo) for 30 carousels per month.',
    canRetry: false,
    action: 'upgrade',
  },
  QUOTA_EXCEEDED: {
    title: 'Monthly limit reached',
    why: 'You have used all 30 carousels for this month.',
    how: 'Upgrade to Pro for unlimited carousels, or wait until next billing cycle.',
    canRetry: false,
    action: 'upgrade',
  },
  // AI errors
  authentication_error: {
    title: 'AI service authentication issue',
    why: 'Our AI credentials are not working right now.',
    how: 'This is an issue on our end. Please contact support at thoopring@gmail.com.',
    canRetry: false,
  },
  permission_error: {
    title: 'AI temporarily blocked this request',
    why: 'The AI service flagged this request. This is often temporary.',
    how: 'Wait 30 seconds and try again. If it persists, try a different video.',
    canRetry: true,
  },
  rate_limit_error: {
    title: 'AI service is busy',
    why: 'Too many requests are hitting the AI right now.',
    how: 'Wait a minute and try again.',
    canRetry: true,
  },
  overloaded_error: {
    title: 'AI service overloaded',
    why: 'Anthropic\'s servers are under heavy load.',
    how: 'Wait 2–3 minutes and try again.',
    canRetry: true,
  },
  network_error: {
    title: 'Network issue reaching AI',
    why: 'We could not connect to the AI service.',
    how: 'Check your internet and try again.',
    canRetry: true,
  },
  // Generic fallbacks
  unknown: {
    title: 'Something went wrong',
    why: 'An unexpected error occurred.',
    how: 'Try again. If it keeps happening, contact support.',
    canRetry: true,
  },
};

function showError({ code, title, message, retryFn, backFn, action }) {
  // Look up error guide
  const guide = (code && ERROR_GUIDE[code]) || ERROR_GUIDE.unknown;
  const finalTitle = title || guide.title;
  const finalWhy = message || guide.why;
  const finalHow = guide.how;

  $('#error-title').textContent = finalTitle;
  $('#error-message').innerHTML = `
    <div style="margin-bottom: 12px;">${escapeHtml(finalWhy)}</div>
    <div style="color: var(--text-dim); font-size: 12px; padding: 10px 12px; background: var(--bg-elevated); border-radius: 6px; border-left: 2px solid var(--accent); text-align: left;">
      <strong style="color: var(--accent); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">What to do</strong><br>
      <span style="font-size: 12px;">${escapeHtml(finalHow)}</span>
    </div>
  `;

  const retryBtn = $('#btn-error-retry');
  const backBtn = $('#btn-error-back');

  // Clear previous handlers
  retryBtn.replaceWith(retryBtn.cloneNode(true));
  backBtn.replaceWith(backBtn.cloneNode(true));
  const newRetry = $('#btn-error-retry');
  const newBack = $('#btn-error-back');

  const canRetry = retryFn && (guide.canRetry !== false);
  const isUpgrade = (action === 'upgrade') || (guide.action === 'upgrade');

  if (isUpgrade) {
    newRetry.style.display = 'inline-block';
    newRetry.textContent = 'Upgrade';
    newRetry.addEventListener('click', () => {
      state.processing = false;
      showView('main');
      handleUpgrade();
    });
  } else if (canRetry) {
    newRetry.style.display = 'inline-block';
    newRetry.textContent = 'Try again';
    newRetry.addEventListener('click', retryFn);
  } else {
    newRetry.style.display = 'none';
  }
  newBack.textContent = 'Go back';
  newBack.addEventListener('click', backFn || (() => {
    state.processing = false;
    state.pendingTranscript = null;
    state.pendingHooks = null;
    showView('main');
  }));

  showView('error');
}

function setProgress(pct, step) {
  $('#progress-fill').style.width = `${pct}%`;
  if (step) $('#processing-step').textContent = step;
}

// ── Utilities ─────────────────────────────────────────
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatDate(unix) {
  return new Date(unix * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── Capture Tab (legacy screenshot + timestamp) ───────
async function loadCaptures() {
  const stored = await chrome.storage.local.get(['dw_items']);
  state.captureItems = stored.dw_items || [];
  renderCaptures();
}

function renderCaptures() {
  const list = $('#capture-list');
  if (!list) return;

  if (state.captureItems.length === 0) {
    list.innerHTML = `
      <div class="capture-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        <p>Capture clean screenshots and timestamps<br>from the YouTube video you're watching</p>
      </div>
    `;
    return;
  }

  list.innerHTML = '';
  state.captureItems.forEach(item => {
    const div = document.createElement('div');
    div.className = 'capture-card';
    div.dataset.id = item.id;

    let media = '';
    let actions = '';

    if (item.type === 'image') {
      const title = item.title || 'Screenshot';
      media = `
        <div class="capture-video-title">${escapeHtml(title)}</div>
        <img src="${item.data}" alt="">
      `;
      actions = `
        <button class="capture-icon-btn" data-action="copy-img" title="Copy image">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </button>
        <button class="capture-icon-btn" data-action="save-img" title="Save image">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        </button>
      `;
    } else {
      // timestamp
      const d = item.data || {};
      media = `
        <div class="capture-video-title">${escapeHtml(d.title || 'YouTube Video')}</div>
        <span class="capture-timestamp-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          ${escapeHtml(d.time || '0:00')}
        </span>
      `;
      actions = `
        <button class="capture-icon-btn" data-action="copy-link" title="Copy link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        </button>
      `;
    }

    div.innerHTML = `
      <div class="capture-card-header">
        <span class="capture-type">${item.type === 'image' ? 'Image' : 'Timestamp'}</span>
        <div class="capture-actions">
          ${actions}
          <button class="capture-icon-btn delete" data-action="delete" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
      ${media}
      <textarea placeholder="Add a note...">${escapeHtml(item.text || '')}</textarea>
    `;

    // Note input
    div.querySelector('textarea').addEventListener('input', async (e) => {
      item.text = e.target.value;
      await chrome.storage.local.set({ dw_items: state.captureItems });
    });

    // Action buttons
    div.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleCaptureAction(btn.dataset.action, item));
    });

    list.appendChild(div);
  });
}

async function handleCaptureAction(action, item) {
  if (action === 'delete') {
    state.captureItems = state.captureItems.filter(i => i.id !== item.id);
    await chrome.storage.local.set({ dw_items: state.captureItems });
    renderCaptures();
    return;
  }

  if (action === 'copy-img') {
    try {
      const img = new Image();
      img.src = item.data;
      await new Promise(r => (img.onload = r));
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      window.focus();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Image copied');
    } catch (e) {
      toast('Copy failed — try Save instead');
    }
  }

  if (action === 'save-img') {
    const a = document.createElement('a');
    a.href = item.data;
    const safe = (item.title || 'capture').replace(/[^a-z0-9]/gi, '_').slice(0, 20);
    a.download = `cleanshot_${safe}_${item.id}.jpg`;
    a.click();
  }

  if (action === 'copy-link') {
    const d = item.data || {};
    const text = `📌 [${d.time}] ${d.title}\n🔗 ${d.url}`;
    await navigator.clipboard.writeText(text);
    toast('Link copied');
  }
}

async function captureScreenshot() {
  const btn = $('#btn-capture-shot');
  if (!await isYouTubeWatchPage()) {
    toast('Open a YouTube video first');
    return;
  }
  btn.disabled = true;
  const original = btn.innerHTML;
  btn.innerHTML = '<span>Capturing...</span>';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'CAPTURE_VIDEO' }, async (response) => {
      btn.disabled = false;
      btn.innerHTML = original;

      if (chrome.runtime.lastError) {
        toast('Connection lost. Refresh the YouTube page.');
        return;
      }
      if (!response || response.status !== 'success') {
        toast(response?.message || 'Capture failed');
        return;
      }

      const newItem = {
        id: Date.now(),
        type: 'image',
        data: response.dataUrl,
        title: response.title,
        text: '',
      };
      state.captureItems.unshift(newItem);
      await chrome.storage.local.set({ dw_items: state.captureItems });
      renderCaptures();
      toast('Screenshot captured');
    });
  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = original;
    toast('Error: ' + err.message);
  }
}

async function captureTimestamp() {
  if (!await isYouTubeWatchPage()) {
    toast('Open a YouTube video first');
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: 'GET_TIME' }, async (res) => {
    if (chrome.runtime.lastError || !res) return;
    const newItem = {
      id: Date.now(),
      type: 'time',
      data: res,
      text: '',
    };
    state.captureItems.unshift(newItem);
    await chrome.storage.local.set({ dw_items: state.captureItems });
    renderCaptures();
    toast('Timestamp saved');
  });
}

async function clearCaptures() {
  if (!confirm('Delete all captures?')) return;
  state.captureItems = [];
  await chrome.storage.local.set({ dw_items: [] });
  renderCaptures();
}

function exportCapturesPDF() {
  if (state.captureItems.length === 0) {
    toast('Nothing to export');
    return;
  }

  const items = [...state.captureItems].reverse();
  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>CleanShot Report</title>
<style>
  body { font-family: 'Inter', system-ui, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #111; }
  h1 { color: #4F46E5; border-bottom: 2px solid #eee; padding-bottom: 10px; }
  .item { margin-bottom: 30px; page-break-inside: avoid; border: 1px solid #eee; padding: 20px; border-radius: 8px; }
  img { max-width: 100%; border: 1px solid #ddd; border-radius: 4px; }
  .meta { color: #666; font-size: 14px; margin-bottom: 10px; }
  .note { background: #f9f9f9; padding: 10px; border-left: 4px solid #4F46E5; margin-top: 10px; border-radius: 4px; }
  .link { color: #4F46E5; text-decoration: none; }
  .timestamp { font-size: 18px; font-weight: 600; color: #4F46E5; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <div class="no-print" style="margin-bottom:20px; text-align:right;">
    <small>Press Ctrl+P / Cmd+P to save as PDF</small>
  </div>
  <h1>CleanShot Report</h1>
  ${items.map((item, idx) => {
    const type = item.type === 'image' ? 'Screenshot' : 'Timestamp';
    let body = '';
    if (item.type === 'image') {
      body = `<div class="meta">#${idx + 1} ${type} &middot; ${escapeHtml(item.title || '')}</div><img src="${item.data}">`;
    } else {
      const d = item.data || {};
      body = `<div class="meta">#${idx + 1} ${type}</div><h3><a href="${d.url || '#'}" class="link" target="_blank">▶ ${escapeHtml(d.title || 'Video')} (<span class="timestamp">${escapeHtml(d.time || '0:00')}</span>)</a></h3>`;
    }
    const note = item.text ? `<div class="note"><strong>Note:</strong> ${escapeHtml(item.text).replace(/\n/g, '<br>')}</div>` : '';
    return `<div class="item">${body}${note}</div>`;
  }).join('')}
  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

async function isYouTubeWatchPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab && tab.url && tab.url.includes('youtube.com/watch');
}
