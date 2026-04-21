// api/download.js — CommonJS (universally compatible with Vercel)

const PRIMARY_INSTANCE = 'https://cobalt-api-production-fb11.up.railway.app/';

const FALLBACK_INSTANCES = [
  'https://cobalt.ari.lt/',
  'https://cobalt.plutos.one/',
];

const ALL_INSTANCES = [
  process.env.COBALT_API_URL || PRIMARY_INSTANCE,
  ...FALLBACK_INSTANCES,
];

async function fetchCobalt(instanceUrl, body) {
  const res = await fetch(instanceUrl, {
    method: 'POST',
    headers: {
      'Accept':       'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });

  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error('AUTH'), { skip: true });
  }
  if (res.status === 429) {
    throw Object.assign(new Error('RATELIMIT'), { skip: true });
  }

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw Object.assign(new Error('NOT_JSON'), { skip: true });
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.code || `HTTP_${res.status}`);
  return data;
}

module.exports = async function handler(req, res) {
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
  } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'A valid URL is required.' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
  } catch {
    return res.status(400).json({ error: 'Invalid URL — must start with https://.' });
  }

  const cobaltBody = {
    url:               parsedUrl.href,
    videoQuality:      quality,
    audioFormat:       audioFormat,
    filenameStyle:     'pretty',
    downloadMode:      mode,
    youtubeVideoCodec: videoCodec,
    tiktokFullAudio:   true,
    twitterGif:        true,
  };

  let lastErr = 'Download service unavailable. Please try again.';

  for (const instance of ALL_INSTANCES) {
    try {
      const data = await fetchCobalt(instance, cobaltBody);

      if (data.status === 'error') {
        const code = (data.error && data.error.code) || 'unknown';
        return res.status(422).json({ error: friendlyError(code), code });
      }

      return res.status(200).json(data);

    } catch (err) {
      if (err.name === 'TimeoutError') {
        lastErr = 'Request timed out. Please try again.';
      } else if (!err.skip) {
        lastErr = friendlyError(err.message);
      }
      continue;
    }
  }

  return res.status(502).json({ error: lastErr });
};

function friendlyError(code) {
  const map = {
    'error.api.unreachable':           'Could not reach the download service. Try again shortly.',
    'error.api.timed_out':             'The request timed out. Please try again.',
    'error.api.rate_exceeded':         'Too many requests — please wait a moment.',
    'error.link.invalid':              'This URL is not valid or not recognised.',
    'error.link.unsupported':          'This platform is not yet supported.',
    'error.link.unavailable':          'This content is unavailable or has been deleted.',
    'error.fetch.empty':               'This video is unavailable or set to private.',
    'error.fetch.short':               'Could not fetch the video. It may be region-locked.',
    'error.fetch.fail':                'Failed to retrieve the media. Please try again.',
    'error.youtube.login':             'This YouTube video requires a login (members-only).',
    'error.youtube.age':               'This YouTube video is age-restricted.',
    'error.youtube.unavailable':       'This YouTube video is unavailable in the server region.',
    'error.youtube.decipher':          'Could not decode this YouTube video. Try again later.',
    'error.content.too_long':          'This video is too long (max ~2 hours).',
    'error.content.video.unavailable': 'The video stream is unavailable at this quality.',
    'error.content.audio.unavailable': 'The audio stream is unavailable for this video.',
    'error.tiktok.unavailable':        'This TikTok video has been removed or is unavailable.',
    'error.instagram.fetch':           'Could not fetch this post — it may be private.',
    'error.twitter.unavailable':       'This tweet is unavailable or has been removed.',
    'error.twitter.login':             'This Twitter/X content requires a login.',
  };
  return map[code] || (code.startsWith('error.') ? 'Service error: ' + code : 'Something went wrong. Please try again.');
}
