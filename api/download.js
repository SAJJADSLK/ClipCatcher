// api/download.js
// Serverless function: proxies cobalt (open-source download engine)
// Cobalt v10 API — supports YouTube, TikTok, Instagram, Twitter/X,
// Twitch, Vimeo, Pinterest, Dailymotion, Facebook, SoundCloud, Bilibili, and 100+ more.

// ── Cobalt instances to try in order ─────────────────────────────────────────
// First entry uses env var if provided (set COBALT_API_URL in Vercel dashboard)
// Community-hosted instances are tried as fallbacks.
const COBALT_INSTANCES = [
  process.env.COBALT_API_URL || 'https://api.cobalt.tools/',
  'https://cobalt.ari.lt/',
  'https://cobalt.api.timelessnesses.me/',
  'https://cobalt.plutos.one/',
].filter(Boolean);

// Optional API key for cobalt.tools (set COBALT_API_KEY in Vercel env vars)
const COBALT_API_KEY = process.env.COBALT_API_KEY || null;

async function fetchCobalt(instanceUrl, body) {
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
  if (COBALT_API_KEY && instanceUrl.includes('cobalt.tools')) {
    headers['Authorization'] = `Api-Key ${COBALT_API_KEY}`;
  }

  const response = await fetch(instanceUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(18000),
  });

  // Some instances return 401/403 if auth is required — signal to try next
  if (response.status === 401 || response.status === 403) {
    throw new Error('AUTH_REQUIRED');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('NOT_JSON');
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.code || `HTTP_${response.status}`);
  }

  return data;
}

export default async function handler(req, res) {
  // ── CORS preflight ─────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // ── Input validation ───────────────────────────────────────────────────────
  const {
    url,
    quality      = '1080',
    mode         = 'auto',       // auto | audio | mute
    audioFormat  = 'mp3',        // mp3 | ogg | wav | opus | best
    videoCodec   = 'h264',       // h264 | av1 | vp9
  } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'A valid URL is required.' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
  } catch {
    return res.status(400).json({ error: 'Invalid URL. Make sure it starts with https://.' });
  }

  // ── Build cobalt v10 request body ──────────────────────────────────────────
  const cobaltBody = {
    url:              parsedUrl.href,
    videoQuality:     quality,           // 144 | 240 | 360 | 480 | 720 | 1080 | 1440 | 2160 | max
    audioFormat:      audioFormat,
    filenameStyle:    'pretty',
    downloadMode:     mode,
    youtubeVideoCodec: videoCodec,
    youtubeDubBrowserLang: false,
    twitterGif:       true,
    tiktokFullAudio:  true,
    tiktokH265:       false,
    allowH265:        false,
  };

  // ── Try each cobalt instance ───────────────────────────────────────────────
  let lastError = 'All download services are currently unavailable. Please try again later.';

  for (const instance of COBALT_INSTANCES) {
    try {
      const data = await fetchCobalt(instance, cobaltBody);

      // cobalt v10 response shapes:
      // { status: 'redirect', url }            → direct download link
      // { status: 'tunnel',   url }            → tunnelled download
      // { status: 'picker',   picker, audio }  → multi-item (e.g. carousel)
      // { status: 'error',    error: {code} }  → cobalt-reported error

      if (data.status === 'error') {
        const code = data.error?.code || 'unknown';
        // Don't fall through to next instance for content-level errors
        return res.status(422).json({ error: friendlyError(code), code });
      }

      // Success — return cobalt's response directly
      return res.status(200).json(data);

    } catch (err) {
      if (err.name === 'TimeoutError') {
        lastError = 'Request timed out. The service may be busy — please try again.';
        continue; // try next instance
      }
      if (err.message === 'AUTH_REQUIRED' || err.message === 'NOT_JSON') {
        continue; // try next instance
      }
      // Keep last real error message
      lastError = err.message || lastError;
      continue;
    }
  }

  return res.status(502).json({ error: lastError });
}

// ── Human-readable error messages for cobalt error codes ──────────────────────
function friendlyError(code) {
  const map = {
    'error.api.unreachable':        'Could not reach the download service. Try again shortly.',
    'error.api.timed_out':          'The request timed out. Please try again.',
    'error.api.rate_exceeded':      'Too many requests. Please wait a moment and try again.',
    'error.api.auth.jwt.missing':   'This server requires authentication. Try again later.',
    'error.api.auth.jwt.invalid':   'Authentication failed. Please try again.',
    'error.link.invalid':           'This URL is not valid or not recognised.',
    'error.link.unsupported':       'This platform is not supported. Check the supported list.',
    'error.link.unavailable':       'This content is unavailable — it may have been deleted.',
    'error.fetch.empty':            'The video appears to be unavailable or private.',
    'error.fetch.short':            'Could not fetch enough data. The video may be region-locked.',
    'error.fetch.fail':             'Failed to retrieve the media. Try again in a moment.',
    'error.fetch.critical':         'A critical error occurred while fetching. Try a different URL.',
    'error.youtube.login':          'This YouTube video requires a login (members-only content).',
    'error.youtube.age':            'This YouTube video is age-restricted and cannot be downloaded.',
    'error.youtube.unavailable':    'This YouTube video is unavailable in the service region.',
    'error.youtube.decipher':       'Could not process this YouTube video. Try again later.',
    'error.youtube.codec':          'The requested video codec is not available. Try H.264.',
    'error.content.too_long':       'This video is too long to download (limit: ~2 hours).',
    'error.content.video.unavailable': 'The video stream is unavailable. Try a different quality.',
    'error.content.audio.unavailable': 'The audio stream is unavailable.',
    'error.tiktok.unavailable':     'This TikTok video is unavailable or has been removed.',
    'error.instagram.fetch':        'Could not fetch this Instagram post. It may be private.',
    'error.twitter.unavailable':    'This tweet is unavailable or the video has been removed.',
  };
  return map[code] || `Error (${code}). Please try a different link or try again later.`;
}
