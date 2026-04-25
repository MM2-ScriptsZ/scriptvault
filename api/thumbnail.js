/**
 * Roblox Game Search + Thumbnail API
 * 
 * Strategy:
 * 1. Search: Use www.roblox.com/search/games (the actual search page API)
 *    via RoTunnel proxy (replaces roblox.com -> rotunnel.com)
 * 2. Thumbnails: Use thumbnails.rotunnel.com batch endpoint
 * 3. Fallback: Direct roblox.com if proxy fails
 * 
 * RoTunnel: free Roblox proxy, no signup, no rate limits
 * Usage: replace "roblox.com" with "rotunnel.com" in any Roblox API URL
 */

const PROXY  = 'rotunnel.com';   // Drop-in replacement for roblox.com
const DIRECT = 'roblox.com';

// Helper: fetch with timeout + fallback
async function safeFetch(url, opts = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    return r;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Search games using the Roblox Games search endpoint via proxy
async function searchGames(keyword) {
  const encoded = encodeURIComponent(keyword);

  // Primary: Use games.rotunnel.com (proxied) with the list endpoint
  // The keyword search works through the proxy because it handles headers
  const urls = [
    `https://games.${PROXY}/v1/games/list?model.keyword=${encoded}&model.startRows=0&model.maxRows=10&model.isKeywordSuggestionEnabled=true`,
    `https://games.${DIRECT}/v1/games/list?model.keyword=${encoded}&model.startRows=0&model.maxRows=10&model.isKeywordSuggestionEnabled=true`,
  ];

  for (const url of urls) {
    try {
      const r = await safeFetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.roblox.com/',
          'Origin': 'https://www.roblox.com',
        }
      });

      if (!r.ok) {
        console.log(`Search failed at ${url}: ${r.status}`);
        continue;
      }

      const data = await r.json();
      const games = data?.games;
      if (games && games.length > 0) {
        console.log(`Search succeeded via ${url}, found ${games.length} games`);
        return games;
      }
      console.log(`Search returned empty at ${url}`);
    } catch (e) {
      console.log(`Search error at ${url}: ${e.message}`);
    }
  }

  return [];
}

// Get thumbnails for universe IDs in batch
async function getThumbnails(universeIds) {
  if (!universeIds.length) return {};
  const ids = universeIds.join(',');

  const urls = [
    `https://thumbnails.${PROXY}/v1/games/icons?universeIds=${ids}&returnPolicy=PlaceHolder&size=256x256&format=Png&isCircular=false`,
    `https://thumbnails.${DIRECT}/v1/games/icons?universeIds=${ids}&returnPolicy=PlaceHolder&size=256x256&format=Png&isCircular=false`,
  ];

  for (const url of urls) {
    try {
      const r = await safeFetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
      });
      if (!r.ok) continue;
      const data = await r.json();
      const map = {};
      (data?.data || []).forEach(t => { map[String(t.targetId)] = t.imageUrl; });
      if (Object.keys(map).length > 0) return map;
    } catch (e) {
      console.log(`Thumbnail error at ${url}: ${e.message}`);
    }
  }

  return {};
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q, id } = req.query;

  // ── GET THUMBNAIL BY UNIVERSE ID ────────────────────────
  if (id && !q) {
    try {
      const map = await getThumbnails([id]);
      return res.json({ thumbnail: map[String(id)] || null });
    } catch (e) {
      return res.status(500).json({ error: e.message, thumbnail: null });
    }
  }

  // ── SEARCH GAMES BY KEYWORD ─────────────────────────────
  if (!q || q.trim().length < 2) return res.json({ games: [] });

  try {
    const games = await searchGames(q.trim());

    if (!games.length) {
      return res.json({ games: [], message: 'No games found' });
    }

    // Get universe IDs and fetch all thumbnails in one batch
    const universeIds = games
      .map(g => g.universeId)
      .filter(Boolean)
      .map(String);

    const thumbMap = await getThumbnails(universeIds);

    const results = games
      .filter(g => g.universeId)
      .slice(0, 10)
      .map(g => ({
        id:        String(g.universeId),
        placeId:   String(g.placeId || ''),
        name:      g.name || 'Unknown',
        creator:   g.creatorName || '',
        playing:   g.playerCount || 0,
        thumbnail: thumbMap[String(g.universeId)] || null,
      }));

    return res.json({ games: results });

  } catch (e) {
    console.error('thumbnail.js fatal error:', e.message);
    return res.status(500).json({ error: e.message, games: [] });
  }
};
