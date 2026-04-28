/**
 * Universal iframe proxy
 * - Allows ANY url
 * - Strips X-Frame-Options and CSP so page embeds in iframe
 * - BLOCKS all redirects (301/302/307/308) — user stays on the page forever
 * - Rewrites relative URLs to absolute so assets load correctly
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url param');

  let target;
  try {
    target = new URL(url);
  } catch {
    return res.status(400).send('Invalid URL');
  }

  // Block javascript: and data: schemes for safety
  if (!['http:', 'https:'].includes(target.protocol)) {
    return res.status(403).send('Only http/https allowed');
  }

  try {
    const response = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept':           'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language':  'en-US,en;q=0.5',
        'Cache-Control':    'no-cache',
        'Pragma':           'no-cache',
      },
      // ── KEY: never follow redirects ──
      redirect: 'manual',
    });

    // ── BLOCK ALL REDIRECTS ───────────────────────────────
    // 301, 302, 303, 307, 308 — all blocked, we just show the page as-is
    // This means if the site tries to redirect away, nothing happens
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location') || '';
      // Show a friendly "redirect blocked" page instead of following
      const blocked = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body{margin:0;background:#0a0a0f;color:#e8e8f0;font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem}
  .box{max-width:360px}
  .icon{font-size:3rem;margin-bottom:1rem}
  h2{font-size:1.2rem;font-weight:800;margin-bottom:.5rem}
  p{color:#6b6b80;font-size:.88rem;line-height:1.6;margin-bottom:1.5rem}
  a{display:inline-block;background:#7c3aed;color:#fff;padding:.6rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:700;font-size:.9rem}
  a:hover{background:#a855f7}
</style>
</head>
<body>
<div class="box">
  <div class="icon">🔒</div>
  <h2>Redirect Blocked</h2>
  <p>This page tried to redirect you to another site. For your security, redirects are always blocked in this verification window.</p>
  <a href="${location}" target="_blank" rel="noopener">Open in new tab instead →</a>
</div>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Frame-Options', 'ALLOWALL');
      return res.status(200).send(blocked);
    }

    const contentType = response.headers.get('content-type') || 'text/html';

    // For non-HTML responses (images, CSS, JS) — stream through as-is
    if (!contentType.includes('text/html')) {
      const buffer = await response.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).send(Buffer.from(buffer));
    }

    // For HTML — rewrite relative URLs and strip blocking headers
    let body = await response.text();
    const base = target.origin;

    // Rewrite relative paths to absolute so CSS/JS/images load
    body = body
      .replace(/(href|src|action)="\/(?!\/)/g,  `$1="${base}/`)
      .replace(/(href|src|action)='\/(?!\/)/g,  `$1='${base}/`)
      .replace(/url\(\/(?!\/)/g,                `url(${base}/`)
      // Inject a base tag as fallback
      .replace(/<head([^>]*)>/i, `<head$1><base href="${target.origin}/">`);

    // ── STRIP ALL HEADERS THAT BLOCK EMBEDDING ────────────
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Do NOT forward: X-Frame-Options, Content-Security-Policy,
    // Strict-Transport-Security, X-Content-Type-Options from origin

    return res.status(200).send(body);

  } catch (e) {
    const errPage = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>body{margin:0;background:#0a0a0f;color:#e8e8f0;font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem}.box{max-width:360px}.icon{font-size:3rem;margin-bottom:1rem}h2{font-size:1.1rem;font-weight:800;margin-bottom:.5rem}p{color:#6b6b80;font-size:.85rem;line-height:1.6}</style>
</head>
<body>
<div class="box">
  <div class="icon">⚠️</div>
  <h2>Failed to Load</h2>
  <p>Could not load the verification page.<br>Error: ${e.message}</p>
</div>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    return res.status(200).send(errPage);
  }
};
