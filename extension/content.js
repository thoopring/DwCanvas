chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // 0. Video Info (for side panel detection)
  if (request.action === "GET_VIDEO_INFO") {
    const titleEl = document.querySelector('h1.ytd-watch-metadata')
      || document.querySelector('h1.ytd-video-primary-info-renderer')
      || document.querySelector('#title h1');
    const channelEl = document.querySelector('#channel-name a')
      || document.querySelector('ytd-channel-name a');
    const video = document.querySelector('video');
    const videoId = new URLSearchParams(window.location.search).get('v');

    sendResponse({
      videoId,
      title: titleEl?.innerText?.trim() || document.title.replace(' - YouTube', ''),
      channel: channelEl?.innerText?.trim() || '',
      duration: video?.duration || null,
    });
    return;
  }

  // 0b. Transcript Extraction (rapid-seek + caption DOM scraping)
  if (request.action === "EXTRACT_TRANSCRIPT") {
    extractTranscript(request.maxDuration || 600)
      .then(segments => {
        if (!segments || segments.length === 0) {
          sendResponse({ error: 'No transcript could be extracted', code: 'EMPTY_TRANSCRIPT' });
        } else {
          sendResponse({ segments });
        }
      })
      .catch(err => sendResponse({ error: err.message, code: err.code || 'EXTRACTION_FAILED' }));
    return true; // async
  }

  // 1. Clean Capture
  if (request.action === "CAPTURE_VIDEO") {
    try {
      const video = document.querySelector('video');
      if (!video) {
        sendResponse({ status: "error", message: "No video found." });
        return;
      }
      
      const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer') || document.querySelector('#title h1'); 
      const videoTitle = titleElement ? titleElement.innerText.trim() : "YouTube Video";

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        sendResponse({ status: "success", dataUrl: dataUrl, title: videoTitle });
      } catch (e) {
        sendResponse({ status: "error", message: "Security Error (CORS). Try reloading." });
      }
    } catch (err) {
      sendResponse({ status: "error", message: err.message });
    }
    return true; 
  }

  // 2. Timestamp
  if (request.action === "GET_TIME") {
    const video = document.querySelector('video');
    const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer') || document.querySelector('#title h1');
    const videoTitle = titleElement ? titleElement.innerText.trim() : "YouTube Video";

    const time = video ? Math.floor(video.currentTime) : 0;
    const url = new URL(window.location.href);
    url.searchParams.set('t', time + 's');
    
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    const timeStr = `${min}:${sec < 10 ? '0' + sec : sec}`;
    
    sendResponse({
      title: videoTitle,
      time: timeStr,
      url: url.toString()
    });
  }
});

// ── Transcript Extraction ─────────────────────────────
// Approach: 16x speed playback + MutationObserver on caption DOM
// Captures EVERY caption change — zero gaps, zero missed transitions.

function tErr(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function extractTranscript(maxDuration) {
  const video = document.querySelector('video');
  if (!video) throw tErr('VIDEO_NOT_FOUND', 'No video element found on this page');

  const duration = Math.min(video.duration || 0, maxDuration);
  if (duration <= 0) throw tErr('VIDEO_NOT_READY', 'Video is not ready yet');
  if (duration < 30) throw tErr('VIDEO_TOO_SHORT', 'Video is too short (under 30 seconds)');
  if ((video.duration || 0) > 3600) throw tErr('VIDEO_TOO_LONG', 'Video is longer than 60 minutes');

  // Check if CC button exists at all
  const ccBtn = document.querySelector('.ytp-subtitles-button');
  if (!ccBtn) {
    throw tErr('NO_CC_BUTTON', 'This video has no captions available');
  }

  // Enable captions if not already on
  if (ccBtn.getAttribute('aria-pressed') !== 'true') {
    ccBtn.click();
    await sleep(800);
  }

  // Wait for CC tooltip to disappear
  await sleep(1200);

  // Verify captions render by seeking to a few test positions
  const testPositions = [10, 30, 60];
  let captionFound = false;
  for (const pos of testPositions) {
    if (pos >= duration) continue;
    video.currentTime = pos;
    await sleep(500);
    if (document.querySelector('.ytp-caption-segment')) {
      captionFound = true;
      break;
    }
  }
  if (!captionFound) {
    throw tErr('NO_CAPTIONS_VISIBLE', 'Captions are enabled but no text is showing. This video may not have captions in any language.');
  }

  const wasPlaying = !video.paused;
  const originalTime = video.currentTime;
  const originalRate = video.playbackRate;

  // Junk filter
  const junkPatterns = [
    /설정을 확인하려면/,
    /을 클릭하세요/,
    /자동 생성됨/,
    /자동 번역/,
    /subtitle\/CC/i,
    /^\s*$/,
  ];
  function isJunk(text) {
    return junkPatterns.some(p => p.test(text));
  }

  // Collect raw captions via MutationObserver during fast playback
  const rawResults = [];

  return new Promise((resolve) => {
    // Observe caption changes
    const observer = new MutationObserver(() => {
      const segs = document.querySelectorAll('.ytp-caption-segment');
      if (!segs.length) return;

      const text = Array.from(segs).map(s => s.innerText).join(' ').trim();
      if (!text || isJunk(text)) return;

      const t = Math.round(video.currentTime);
      // Only add if text changed
      if (rawResults.length === 0 || rawResults[rawResults.length - 1].text !== text) {
        rawResults.push({ t, text });
      }
    });

    // Observe the player container for caption DOM changes
    const playerEl = document.querySelector('.html5-video-player') || document.body;
    observer.observe(playerEl, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Start fast playback from beginning (16x for maximum speed)
    // YouTube's player accepts up to 16x via playbackRate even though UI caps at 2x
    video.currentTime = 0;
    video.playbackRate = 16;
    video.muted = true; // Mute to avoid audio distortion at high speed
    video.play();

    // Poll for completion
    const checkInterval = setInterval(() => {
      if (video.currentTime >= duration - 1 || video.ended || video.paused) {
        clearInterval(checkInterval);
        observer.disconnect();

        // Restore state
        video.pause();
        video.playbackRate = originalRate;
        video.muted = false;
        video.currentTime = originalTime;
        if (wasPlaying) video.play();

        // Deduplicate and resolve
        resolve(dedup(rawResults));
      }
    }, 500);

    // Safety timeout (max 5 min regardless of video length)
    setTimeout(() => {
      clearInterval(checkInterval);
      observer.disconnect();
      video.pause();
      video.playbackRate = originalRate;
      video.muted = false;
      video.currentTime = originalTime;
      resolve(dedup(rawResults));
    }, 5 * 60 * 1000);
  });
}

// Deduplicate YouTube captions collected via MutationObserver.
//
// YouTube shows 1-2 lines as a sliding window, each capture overlaps ~50%.
// Two-pass approach:
//   Pass 1: Conservative word-overlap merge (min 6 words to avoid false matches)
//   Pass 2: Remove duplicate sentences from the assembled text
function dedup(raw) {
  if (raw.length === 0) return [];

  // === Pass 1: Assemble text with conservative overlap merge ===
  let assembled = raw[0].text;
  const tMarkers = [{ pos: 0, t: raw[0].t }];
  const MIN_OVERLAP_WORDS = 6; // high threshold to avoid false matches

  for (let i = 1; i < raw.length; i++) {
    const newText = raw[i].text;

    // Skip if fully contained in assembled
    if (assembled.includes(newText)) continue;

    const accWords = assembled.split(/\s+/);
    const newWords = newText.split(/\s+/);

    // Find longest suffix-prefix overlap (min 6 words)
    let overlapWords = 0;
    const maxCheck = Math.min(accWords.length, newWords.length);
    for (let len = maxCheck; len >= MIN_OVERLAP_WORDS; len--) {
      const suffix = accWords.slice(-len).join(' ').toLowerCase();
      const prefix = newWords.slice(0, len).join(' ').toLowerCase();
      if (suffix === prefix) {
        overlapWords = len;
        break;
      }
    }

    const uniquePart = overlapWords > 0
      ? newWords.slice(overlapWords).join(' ')
      : newText; // No overlap found → append entire segment (safer)

    if (uniquePart.trim().length > 0) {
      const pos = assembled.length;
      assembled += ' ' + uniquePart.trim();
      tMarkers.push({ pos, t: raw[i].t });
    }
  }

  // === Pass 2: Remove duplicate sentences ===
  // Split into sentences, remove exact dupes, preserve order
  const sentences = assembled
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 3);

  const seen = new Set();
  const uniqueSentences = [];
  for (const s of sentences) {
    const key = s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    if (key.length > 3 && !seen.has(key)) {
      seen.add(key);
      uniqueSentences.push(s);
    }
  }

  // === Pass 3: Chunk into segments with timestamps ===
  const result = [];
  let charPos = 0;

  for (let i = 0; i < uniqueSentences.length; i += 2) {
    const chunk = uniqueSentences.slice(i, i + 2).join(' ');
    const pos = assembled.indexOf(uniqueSentences[i], charPos);
    charPos = pos >= 0 ? pos + 1 : charPos;
    const marker = tMarkers.filter(m => m.pos <= (pos >= 0 ? pos : charPos)).pop();

    result.push({ t: marker?.t ?? 0, text: chunk });
  }

  return result;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }