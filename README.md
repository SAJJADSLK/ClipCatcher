# SnapLoad — Universal Video Downloader

A free, AdSense-ready video downloader website built for Vercel serverless.
Powered by [cobalt.tools](https://cobalt.tools) — an open-source download engine.

## Supported Platforms
YouTube, TikTok, Instagram Reels, Twitter/X, Twitch, Facebook, Vimeo,
Pinterest, SoundCloud, Dailymotion, Bilibili, and 100+ more.

---

## 🚀 Deploy to Vercel (3 steps)

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Deploy
```bash
cd snapload
vercel
```
Follow the prompts. Your site will be live at `https://your-project.vercel.app`

### 3. Custom Domain (optional)
In Vercel dashboard → your project → Settings → Domains → Add domain

---

## 📁 Project Structure
```
snapload/
├── api/
│   └── download.js      ← Serverless function (proxies cobalt.tools)
├── public/
│   ├── index.html       ← Main page
│   ├── privacy.html     ← Privacy Policy (required for AdSense)
│   ├── terms.html       ← Terms of Service
│   └── dmca.html        ← DMCA Policy
├── vercel.json          ← Vercel routing config
└── package.json
```

---

## 💰 Enable Google AdSense

1. Go to [https://adsense.google.com](https://adsense.google.com)
2. Sign up with your Google account
3. Add your Vercel domain
4. Wait for approval (usually 1-3 days for new sites with content)
5. In `public/index.html`, uncomment and replace the AdSense script tag:
   ```html
   <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossorigin="anonymous"></script>
   ```
6. Replace the `.ad-banner` divs with real AdSense `<ins>` ad units

### AdSense Ad Slots (3 slots already placed in index.html)
- **Slot 1**: Below hero section (728×90 leaderboard)
- **Slot 2**: Between Platforms and How It Works sections
- **Slot 3**: Above FAQ section

---

## ⚙️ How the Backend Works

`api/download.js` is a Vercel serverless function that:
1. Receives `{ url, quality, mode, audioFormat }` from the frontend
2. Sends the request to `https://api.cobalt.tools/` (free, no API key needed)
3. Returns the download link(s) to the frontend

### cobalt.tools API Response Types
| Status | Meaning |
|--------|---------|
| `redirect` | Single file — direct download URL |
| `tunnel` | Single file — proxied through cobalt |
| `picker` | Multiple files (e.g. Instagram carousel) |
| `error` | Something went wrong |

---

## 🔧 Local Development
```bash
npm install -g vercel
vercel dev
```
Opens at `http://localhost:3000`

---

## 📋 AdSense Policy Compliance Checklist
- ✅ Privacy Policy page (`/privacy.html`)
- ✅ Terms of Service page (`/terms.html`)
- ✅ DMCA page (`/dmca.html`)
- ✅ Clear navigation
- ✅ Original content (FAQ, How It Works, Features)
- ✅ No copyright-infringing content hosted on site
- ✅ No deceptive or misleading claims
- ✅ Mobile responsive
- ✅ Fast loading
- ✅ Clear site purpose

---

## ⚠️ Legal Note
SnapLoad does not host any media files. It acts as a technical intermediary
pointing users to publicly accessible streams. Users are responsible for
ensuring their downloads comply with copyright law and platform ToS.
