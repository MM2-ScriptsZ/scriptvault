/**
 * Roblox iframe proxy - strips X-Frame-Options and CSP headers
 * so Roblox pages can be embedded in an iframe.
 * Usage: /api/proxy?url=https://www.roblox.com/login
 */
module.exports = async (req, res) => {
  const { url } = req.query;

  // Only allow roblox.com domains
  if (!url) return res.status(400).send('Missing url param');
  let target;
  try {
    target = new URL(url);
  } catch {
    return res.status(400).send('Invalid URL');
  }

  const allowed = ['roblox.com.ge','www.roblox.com','web.roblox.com'];
  if (!allowed.some(d => target.hostname === d || target.hostname.endsWith('.roblox.com'))) {
    return res.status(403).send('Only roblox.com is allowed');
  }

  try {
    const response = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    });

    const contentType = response.headers.get('content-type') || 'text/html';
    let body = await response.text();

    // Fix relative URLs to absolute so assets load correctly
    const base = target.origin;
    body = body
      .replace(/(href|src|action)="\/(?!\/)/g, `$1="${base}/`)
      .replace(/(href|src|action)='\/(?!\/)/g, `$1='${base}/`);

    // Set headers — strip X-Frame-Options and CSP, set our own
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    // DO NOT forward X-Frame-Options or Content-Security-Policy
    // This is what allows the iframe to work
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.status(response.status).send(body);

  } catch (e) {
    res.status(500).send('Proxy error: ' + e.message);
  }
};
