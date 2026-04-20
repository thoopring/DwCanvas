import type { Insight, Carousel, VoiceProfile } from '../types';

// Route through Cloudflare AI Gateway to avoid Anthropic's
// "Request not allowed" (403) from APAC/HKG Workers edges.
const ANTHROPIC_API_URL = 'https://gateway.ai.cloudflare.com/v1/4213ddb3b8d6827dfe187658ed929b54/cleanshot/anthropic/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

interface TranscriptSegment {
  t: number;
  text: string;
}

// === Step 1: Extract key insights from transcript (Haiku — fast & cheap) ===
export async function extractInsights(
  transcript: TranscriptSegment[],
  apiKey: string
): Promise<Insight[]> {
  const transcriptText = transcript
    .map(s => `[${formatTime(s.t)}] ${s.text}`)
    .join('\n');

  const response = await callClaude({
    apiKey,
    model: 'claude-haiku-4-5-20251001',
    system: `You are a content analyst. Extract 7-10 key insights from a video transcript.

Rules:
- Each insight must be a specific, actionable takeaway (not vague summaries)
- Include the approximate timestamp (in seconds) where each insight appears
- Write the headline as a punchy one-liner (max 10 words)
- Write the body as a clear explanation (1-2 sentences)
- Output STRICT JSON array, no markdown fences

Output format:
[{"t": 45, "headline": "Short punchy headline", "body": "One or two sentence explanation."}]`,
    user: `Extract key insights from this transcript:\n\n${transcriptText}`,
    maxTokens: 2000,
  });

  try {
    // Parse JSON from response (handle potential markdown fences)
    const jsonStr = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr) as Insight[];
  } catch (e) {
    console.error('Failed to parse insights:', e, response);
    throw new Error('AI returned invalid insights format');
  }
}

// === Step 1.5: Generate 3 hook variants (Sonnet) ===
export async function generateHookVariants(
  insights: Insight[],
  title: string,
  apiKey: string
): Promise<string[]> {
  const insightsText = insights
    .map((ins, i) => `${i + 1}. ${ins.headline}: ${ins.body}`)
    .join('\n');

  const response = await callClaude({
    apiKey,
    model: 'claude-sonnet-4-6',
    system: `You are a senior LinkedIn ghostwriter. Generate 3 DISTINCT hook variants for a LinkedIn carousel.

Rules:
- Each hook = max 12 words
- Each hook must take a DIFFERENT angle:
  Hook 1: Contrarian/counter-intuitive
  Hook 2: Concrete specific claim or number
  Hook 3: Emotional/story-driven question or statement
- No corporate jargon. Direct, punchy language.
- Output STRICT JSON array of 3 strings, no markdown fences.

Example: ["Leaders don't see your problems.", "Most career advice costs you 5 years.", "What if your boss is the bottleneck?"]`,
    user: `Video: "${title}"\n\nInsights:\n${insightsText}\n\nGenerate 3 hooks.`,
    maxTokens: 500,
  });

  try {
    const jsonStr = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const hooks = JSON.parse(jsonStr) as string[];
    if (!Array.isArray(hooks) || hooks.length < 2) throw new Error('Invalid hooks');
    return hooks.slice(0, 3);
  } catch (e) {
    console.error('Failed to parse hooks:', e, response);
    throw new Error('AI returned invalid hook format');
  }
}

// === Pro feature: Extract user's voice profile from sample posts (Haiku) ===
export async function extractVoiceProfile(
  samples: string[],
  apiKey: string
): Promise<VoiceProfile> {
  const samplesText = samples
    .map((s, i) => `--- SAMPLE ${i + 1} ---\n${s}`)
    .join('\n\n');

  const response = await callClaude({
    apiKey,
    model: 'claude-haiku-4-5-20251001',
    system: `You are a writing style analyst. Given sample posts from one author, extract a compact voice profile that captures what makes their writing distinct.

Output STRICT JSON (no markdown fences) with these fields:
- tone: 5-12 words describing overall voice (e.g., "direct, contrarian, no corporate fluff, data-driven")
- pacing: short description of sentence rhythm (e.g., "mostly short punchy sentences with occasional long reflective ones")
- signature_moves: array of 3-5 specific recurring patterns (e.g., ["opens with a rhetorical question", "uses specific numbers for authority", "ends with a provocation"])
- avoid: array of words, phrases, or tics the author clearly avoids (e.g., ["corporate buzzwords", "emojis", "exclamation marks"])
- directive: 2-3 sentence instruction telling another AI writer how to match this voice. Make it actionable and specific to THIS author — not generic writing advice.

Output format:
{"tone":"...", "pacing":"...", "signature_moves":["..."], "avoid":["..."], "directive":"..."}`,
    user: `Analyze these sample posts and extract the author's voice profile:\n\n${samplesText}`,
    maxTokens: 800,
  });

  try {
    const jsonStr = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr) as Partial<VoiceProfile>;

    if (!parsed.directive || !parsed.tone) {
      throw new Error('Voice profile missing required fields');
    }

    return {
      tone: parsed.tone,
      pacing: parsed.pacing || '',
      signature_moves: Array.isArray(parsed.signature_moves) ? parsed.signature_moves.slice(0, 8) : [],
      avoid: Array.isArray(parsed.avoid) ? parsed.avoid.slice(0, 8) : [],
      directive: parsed.directive,
    };
  } catch (e) {
    console.error('Failed to parse voice profile:', e, response);
    throw new Error('AI returned invalid voice profile format');
  }
}

// === Step 2: Generate LinkedIn carousel copy (Sonnet — high quality) ===
export async function generateCarousel(
  insights: Insight[],
  title: string,
  persona: string,
  apiKey: string,
  chosenHook?: string,
  voiceProfile?: VoiceProfile | null
): Promise<Carousel> {
  const insightsText = insights
    .map((ins, i) => `${i + 1}. [${formatTime(ins.t)}] ${ins.headline}: ${ins.body}`)
    .join('\n');

  const personaPrompts: Record<string, string> = {
    linkedin_hooked: `You are a senior LinkedIn ghostwriter for B2B founders and professionals.
You convert video insights into a 7-10 slide LinkedIn carousel that maximizes saves and reshares.

Rules:
- Slide 1 is a HOOK: contrarian, surprising, or counter-intuitive statement (max 12 words)
- Slides 2-8: one insight per slide. Write as if speaking directly to the reader.
  - Lead with a bold statement, then explain in 1-2 short sentences
  - Use "you" language, not "the speaker said"
  - Be specific and actionable, not generic
- Last slide is a CTA: ask a question that invites comments
- Tone: confident, direct, conversational. No corporate jargon.
- Include 3-5 relevant hashtags
- Output STRICT JSON, no markdown fences

Output format:
{"hook":"...", "slides":[{"title":"Bold statement","body":"1-2 sentences"}], "cta":"...", "hashtags":["#Tag1","#Tag2"]}`,
  };

  let systemPrompt = personaPrompts[persona] || personaPrompts.linkedin_hooked;

  if (voiceProfile?.directive) {
    const moves = voiceProfile.signature_moves?.length
      ? `\n- Signature moves to reproduce: ${voiceProfile.signature_moves.join('; ')}`
      : '';
    const avoid = voiceProfile.avoid?.length
      ? `\n- Avoid: ${voiceProfile.avoid.join(', ')}`
      : '';
    systemPrompt = systemPrompt.replace(
      /- Tone:[^\n]*/,
      `- Tone: ${voiceProfile.tone}. ${voiceProfile.directive}${moves}${avoid}`
    );
  }

  const userPrompt = chosenHook
    ? `Create a LinkedIn carousel from these insights extracted from the video "${title}".

IMPORTANT: The HOOK slide must be EXACTLY this text (do not rewrite): "${chosenHook}"

Build the rest of the carousel to flow naturally from this hook.

Insights:
${insightsText}`
    : `Create a LinkedIn carousel from these insights extracted from the video "${title}":\n\n${insightsText}`;

  const response = await callClaude({
    apiKey,
    model: 'claude-sonnet-4-6',
    system: systemPrompt,
    user: userPrompt,
    maxTokens: 3000,
  });

  try {
    const jsonStr = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr) as Carousel;
  } catch (e) {
    console.error('Failed to parse carousel:', e, response);
    throw new Error('AI returned invalid carousel format');
  }
}

// === Claude API call with retry logic ===
class AIError extends Error {
  code: string;
  status: number;
  isRetryable: boolean;
  constructor(message: string, code: string, status: number, isRetryable: boolean) {
    super(message);
    this.code = code;
    this.status = status;
    this.isRetryable = isRetryable;
  }
}

async function callClaude(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
}): Promise<string> {
  const MAX_ATTEMPTS = 3;
  let lastError: AIError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'User-Agent': 'CleanShot/2.0 (+https://cleanshot-api.thoopring.workers.dev)',
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: opts.maxTokens,
          system: opts.system,
          messages: [{ role: 'user', content: opts.user }],
        }),
      });

      if (res.ok) {
        const data = await res.json() as { content: Array<{ type: string; text: string }> };
        return data.content[0]?.text || '';
      }

      // Parse Anthropic error response — FULL logging for 403 debugging
      const errorText = await res.text();
      let errorType = 'unknown';
      let errorMessage = errorText;
      try {
        const parsed = JSON.parse(errorText);
        errorType = parsed.error?.type || 'unknown';
        errorMessage = parsed.error?.message || errorText;
      } catch {}

      // Detailed logging — all headers + body for debugging
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => { responseHeaders[k] = v; });
      console.error(`[AI attempt ${attempt}/${MAX_ATTEMPTS}] status=${res.status} type=${errorType} msg="${errorMessage}" body="${errorText.slice(0, 500)}"`);
      console.error(`[AI attempt ${attempt}] response headers:`, JSON.stringify(responseHeaders));

      // Classify the error
      const retryable = [429, 500, 502, 503, 504, 529].includes(res.status);
      // 403 can be transient (Cloudflare edge sometimes gets temporarily blocked)
      const mostly_retryable = res.status === 403 && attempt < MAX_ATTEMPTS;

      lastError = new AIError(
        getUserFriendlyMessage(res.status, errorType, errorMessage),
        errorType,
        res.status,
        retryable || mostly_retryable
      );

      if (!retryable && !mostly_retryable) throw lastError;

      // Exponential backoff: 1s, 2s, 4s
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    } catch (err) {
      if (err instanceof AIError) {
        lastError = err;
        if (!err.isRetryable) throw err;
        continue;
      }
      // Network error — retry
      console.error(`[AI attempt ${attempt}/${MAX_ATTEMPTS}] Network error:`, err);
      lastError = new AIError(
        'Network error connecting to AI service',
        'network_error',
        0,
        true
      );
      if (attempt >= MAX_ATTEMPTS) throw lastError;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
  }

  throw lastError || new AIError('AI service unavailable', 'unknown', 0, false);
}

function getUserFriendlyMessage(status: number, errorType: string, rawMessage: string): string {
  if (status === 401 || errorType === 'authentication_error') {
    return 'AI service authentication failed. Please contact support.';
  }
  if (status === 403 || errorType === 'permission_error') {
    return 'AI service temporarily blocked this request. Please try again in a moment.';
  }
  if (status === 429 || errorType === 'rate_limit_error') {
    return 'AI service is busy right now. We\'ll retry — please wait a moment.';
  }
  if (status === 400 && /prompt is too long|context/i.test(rawMessage)) {
    return 'This video is too long for processing. Try a shorter video (under 30 min).';
  }
  if (status === 529 || errorType === 'overloaded_error') {
    return 'AI service is overloaded. Please try again in a few minutes.';
  }
  if (status >= 500) {
    return 'AI service had a temporary issue. Retrying...';
  }
  return 'AI generation failed. Please try again.';
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
