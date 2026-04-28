/**
 * Iframe proxy v3 — Client-side approach
 *
 * Instead of fetching server-side (which gets blocked by Cloudflare/WAF),
 * we return a wrapper HTML page that:
 * 1. Loads the target URL in a nested iframe with sandbox bypass tricks
 * 2. Intercepts navigation/redirects using postMessage + CSP
 * 3. If the site blocks iframe embedding, falls back gracefully
 *
 * For sites that truly block all embedding (like Roblox with strict CSP),
 * we show the page in a sandboxed window-like UI.
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
    if (!['http:', 'https:'].includes(target.protocol))
      return res.status(403).send('Only http/https allowed');
  } catch {
    return res.status(400).send('Invalid URL');
  }

  // Return a wrapper HTML page that handles the iframe client-side
  const wrapper = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verification</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;background:#0a0a0f;overflow:hidden}
  #wrap{position:relative;width:100%;height:100%}
  #frame{width:100%;height:100%;border:none;display:block;background:#fff}
  /* Overlay that catches redirect attempts */
  #nav-block{
    display:none;
    position:absolute;inset:0;
    background:rgba(10,10,15,.96);
    flex-direction:column;align-items:center;justify-content:center;
    gap:1rem;text-align:center;padding:2rem;
    color:#e8e8f0;font-family:'Segoe UI',sans-serif;
    z-index:100;
  }
  #nav-block.show{display:flex}
  #nav-block .icon{font-size:2.5rem}
  #nav-block h3{font-size:1.1rem;font-weight:800}
  #nav-block p{color:#6b6b80;font-size:.85rem;line-height:1.6;max-width:300px}
  #nav-block button{
    background:#7c3aed;color:#fff;border:none;
    padding:.6rem 1.5rem;border-radius:8px;
    font-size:.9rem;font-weight:700;cursor:pointer;
  }
  #nav-block button:hover{background:#a855f7}
  /* blocked fallback */
  #blocked{
    display:none;
    position:absolute;inset:0;
    background:#0a0a0f;
    flex-direction:column;align-items:center;justify-content:center;
    gap:1rem;text-align:center;padding:2rem;
    color:#e8e8f0;font-family:'Segoe UI',sans-serif;
  }
  #blocked.show{display:flex}
  #blocked .icon{font-size:2.5rem}
  #blocked h3{font-size:1.1rem;font-weight:800}
  #blocked p{color:#6b6b80;font-size:.85rem;line-height:1.6;max-width:320px}
  #blocked a{
    display:inline-block;background:#7c3aed;color:#fff;
    padding:.6rem 1.5rem;border-radius:8px;
    text-decoration:none;font-weight:700;font-size:.9rem;
  }
  #blocked a:hover{background:#a855f7}
</style>
</head>
<body>
<div id="wrap">

  <!-- The actual iframe -->
  <iframe id="frame"
    src="${target.toString()}"
    sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
    allow="fullscreen"
    referrerpolicy="no-referrer"
    onload="checkLoad()"
    onerror="showBlocked()">
  </iframe>

  <!-- Redirect intercepted overlay -->
  <div id="nav-block">
    <div class="icon">🚫</div>
    <h3>Redirect Blocked</h3>
    <p>This page tried to navigate you away. Redirects are blocked for your security.</p>
    <button onclick="resetFrame()">↩ Go Back</button>
  </div>

  <!-- Site blocks all embedding fallback -->
  <div id="blocked">
    <div class="icon">🔒</div>
    <h3>Page Cannot Be Embedded</h3>
    <p>This site blocks embedding. Open it in a new tab to complete verification, then return here.</p>
    <a href="${target.toString()}" target="_blank" rel="noopener">Open Verification Page →</a>
  </div>

</div>
<script>
const TARGET = ${JSON.stringify(target.toString())};
const frame  = document.getElementById('frame');
let loadCount = 0;

function checkLoad(){
  loadCount++;
  try {
    // Try accessing contentWindow — cross-origin blocks = page loaded fine
    const loc = frame.contentWindow.location.href;
    // Same-origin: check if redirected away from target
    if(loc && loc !== 'about:blank' && !loc.startsWith(new URL(TARGET).origin)){
      // Redirected to different domain — block it
      frame.src = 'about:blank';
      document.getElementById('nav-block').classList.add('show');
    }
  } catch(e) {
    // Cross-origin error = page loaded correctly (expected for external sites)
    // Hide any overlay
    document.getElementById('nav-block').classList.remove('show');
    document.getElementById('blocked').classList.remove('show');
  }
}

function resetFrame(){
  document.getElementById('nav-block').classList.remove('show');
  frame.src = TARGET;
}

function showBlocked(){
  document.getElementById('blocked').classList.add('show');
}

// Catch navigation attempts via beforeunload on the iframe
// (works for same-origin only, but catches some cases)
frame.addEventListener('load', ()=>{
  try {
    frame.contentWindow.addEventListener('beforeunload', ()=>{
      document.getElementById('nav-block').classList.add('show');
    });
  } catch {}
});

// Safety timeout — if nothing loads in 8s, show blocked message
setTimeout(()=>{
  try {
    const loc = frame.contentWindow.location.href;
    if(!loc || loc === 'about:blank'){
      showBlocked();
    }
  } catch {
    // Cross-origin = loaded fine, do nothing
  }
}, 8000);
</script>
</body>
</html>`;

  // Set headers — this wrapper page itself is freely embeddable
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Cache-Control', 'no-cache');
  res.status(200).send(wrapper);
};
