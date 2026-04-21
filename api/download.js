// api/download.js — v2 (dynamic instance discovery)
// Uses instances.cobalt.best to always find a live, no-auth, CORS-enabled cobalt node.
//
// BEST PRACTICE: Deploy your own cobalt on Railway (free ~$5/mo) and set
//   COBALT_API_URL=https://your-instance.up.railway.app/
// in Vercel env vars. Then you're 100% independent from community instances.

// ── Module-level instance cache (survives warm serverless re-use) ─────────────
let _cachedInstances = null;
let _cacheTimestamp  = 0;
const CACHE_TTL_MS   = 5 * 60 * 1000; // 5 minutes

// Hardcoded fallbacks — only used if dynamic discovery fails entirely
const FALLBACK_INSTANCES = [
  'https://cobalt.ari.lt/',
  'https://cobalt.plutos.one/',
  'https://cobaltapi.zerody.one/',
];

// ── Discover live instances dynamically ──────────────────────────────────────
async function getInstances() {
  // User's own cobalt instance takes priority
  if (process.env.COBALT_API_URL) {
    return [process.env.COBALT_API_URL];
  }

  const now = Date.now();
  if (_cachedInstances && now - _cacheTimestamp < CACHE_TTL_MS) {
    return _cachedInstances;
  }

  try {
    const res = await fetch('https://instances.cobalt.best/instances.json', {
      headers: {
        'User-Agent': 'snapload/2.0 (+https://snapload.vercel.app)',
        'Accept':     'application/json',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) throw new Error(`Tracker HTTP ${res.status}`);

    const list = await res.json();

    const good = list
      .filter(i =>
        i.online      === true  &&
        i.info?.auth  === false &&
        i.info?.cors  !== false &&
        i.protocol    === 'https'
      )
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .map(i => `${i.protocol}://${i.api}/`)
      .slice(0, 8);

    if (good.length > 0) {
      _cachedInstances = good;
      _cacheTimestamp  = now;
      console.log(`[snapload] discovered ${good.length} instances`);
      return good;
    }
  } catch (err) {
    console.warn('[snapload] instance discovery failed:', err.message);
  }

  return _cachedInstances ?? FALLBACK_INSTANCES;
}

// ── Call one cobalt instance ──────────────────────────────────────────────────
async function fetchCobalt(instanceUrl, body) {
  const res = await fetch(instanceUrl, {
    method:  'POST',
    headers: {
      'Accept':       'application/json',
      'Content-Type': 'application/json',
    },
    body:   JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('AUTH'),      { skip: true });
  if (res.status === 429)                        throw Object.assign(new Error('RATELIMIT'), { skip: true });

  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json'))          throw Object.assign(new Error('NOT_JSON'), { skip: true });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.code ?? `HTTP_${res.status}`);

  return data;
}

// ── Main Vercel handler ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed.' });

  const {
    url,
    quality     = '1080',
    mode        = 'auto',
    audioFormat = 'mp3',
    videoCodec  = 'h264',
  } = req.body ?? {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'A valid URL is required.' });
  }

  let parsedUrl;
  try { parsedUrl = new URL(url.trim()); }
  catch { return res.status(400).json({ error: 'Invalid URL. Must start with https://.' }); }

  const cobaltBody = {
    url:               parsedUrl.href,
    videoQuality:      quality,
    audioFormat,
    filenameStyle:     'pretty',
    downloadMode:      mode,
    youtubeVideoCodec: videoCodec,
    tiktokFullAudio:   true,
    twitterGif:        true,
  };

  const instances = await getInstances();

  if (instances.length === 0) {
    return res.status(503).json({ error: 'No download instances available. Try again in a minute.' });
  }

  let lastErr = 'All download services are currently unavailable. Please try again.';

  for (const instance of instances) {
    try {
      const data = await fetchCobalt(instance, cobaltBody);

      if (data.status === 'error') {
        const code = data.error?.code ?? 'unknown';
        return res.status(422).json({ error: friendlyError(code), code });
      }

      return res.status(200).json(data);

    } catch (err) {
      if (err.name === 'TimeoutError') {
        lastErr = 'The request timed out. Please try again.';
      } else if (!err.skip) {
        lastErr = err.message || lastErr;
      }
      continue;
    }
  }

  return res.status(502).json({
    error: lastErr,
    hint: 'For reliable downloads, deploy your own cobalt instance on Railway and set COBALT_API_URL in Vercel.'
  });
}

// ── Human-readable cobalt error codes ────────────────────────────────────────
function friendlyError(code) {
  const map = {
    'error.api.unreachable':           'Could not reach the download service. Try again shortly.',
    'error.api.timed_out':             'The request timed out. Please try again.',
    'error.api.rate_exceeded':         'Too many requests — please wait a moment and retry.',
    'error.link.invalid':              'This URL is not valid or not recognised.',
    'error.link.unsupported':          'This platform is not yet supported.',
    'error.link.unavailable':          'This content has been deleted or is unavailable.',
    'error.fetch.empty':               'The video is unavailable or private.',
    'error.fetch.short':               'Could not fetch the video. It may be region-locked.',
    'error.fetch.fail':                'Failed to retrieve the media. Please try again.',
    'error.youtube.login':             'This YouTube video requires sign-in (members-only).',
    'error.youtube.age':               'This YouTube video is age-restricted.',
    'error.youtube.unavailable':       'This YouTube video is unavailable in the server region.',
    'error.youtube.decipher':          'Could not decode this YouTube video. Try again later.',
    'error.content.too_long':          'This video is too long (maximum ~2 hours).',
    'error.content.video.unavailable': 'The video stream is unavailable at this quality.',
    'error.content.audio.unavailable': 'The audio stream is unavailable for this video.',
    'error.tiktok.unavailable':        'This TikTok video has been removed or is unavailable.',
    'error.instagram.fetch':           'Could not fetch this Instagram post — it may be private.',
    'error.twitter.unavailable':       'This tweet is unavailable or has been removed.',
    'error.twitter.login':             'This Twitter/X content requires a login.',
  };
  return map[code] ?? `Error (${code}). Try a different link or try again later.`;
}
