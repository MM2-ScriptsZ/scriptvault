/**
 * Roblox Game Search + Thumbnail API
 *
 * The old games.roblox.com/v1/games/list?keyword= is PERMANENTLY BROKEN since 2023.
 * The correct endpoint is: apis.roblox.com/search-api/omni-search?searchQuery=...
 * This is the actual endpoint Roblox uses on their website and app.
 *
 * Proxy: apis.rotunnel.com (replaces apis.roblox.com) for CORS bypass
 * Thumbnails: thumbnails.rotunnel.com (replaces thumbnails.roblox.com)
 */

const SESSION_ID = 'scriptvault-search-001'; // any fixed string works

async function safeFetch(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const r = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.roblox.com/',
        ...(opts.headers || {}),
      }
    });
    clearTimeout(timer);
    return r;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function searchGames(keyword) {
  const q = encodeURIComponent(keyword);

  // Try multiple endpoints in order — stop at first success
  const attempts = [
    // 1. New omni-search via RoTunnel proxy
    `https://apis.rotunnel.com/search-api/omni-search?searchQuery=${q}&sessionId=${SESSION_ID}&pageType=all`,
    // 2. New omni-search direct
    `https://apis.roblox.com/search-api/omni-search?searchQuery=${q}&sessionId=${SESSION_ID}&pageType=all`,
    // 3. Old endpoint via proxy (may still work for some queries)
    `https://games.rotunnel.com/v1/games/list?model.keyword=${q}&model.maxRows=10`,
  ];

  for (const url of attempts) {
    try {
      console.log('Trying:', url);
      const r = await safeFetch(url);
      if (!r.ok) { console.log('HTTP', r.status, 'at', url); continue; }

      const data = await r.json();
      console.log('Response keys:', Object.keys(data));

      // omni-search response format
      if (data?.searchResults) {
        const gameResults = data.searchResults.find(s => s.contentGroupType === 'Game');
        if (gameResults?.contents?.length) {
          console.log('omni-search found', gameResults.contents.length, 'games');
          return { type: 'omni', games: gameResults.contents };
        }
      }

      // old games/list format
      if (data?.games?.length) {
        console.log('games/list found', data.games.length, 'games');
        return { type: 'list', games: data.games };
      }

      console.log('Empty result at', url);
    } catch (e) {
      console.log('Error at', url, ':', e.message);
    }
  }

  return { type: null, games: [] };
}

async function getThumbnails(universeIds) {
  if (!universeIds.length) return {};
  const ids = universeIds.join(',');

  const urls = [
    `https://thumbnails.rotunnel.com/v1/games/icons?universeIds=${ids}&returnPolicy=PlaceHolder&size=256x256&format=Png&isCircular=false`,
    `https://thumbnails.roblox.com/v1/games/icons?universeIds=${ids}&returnPolicy=PlaceHolder&size=256x256&format=Png&isCircular=false`,
  ];

  for (const url of urls) {
    try {
      const r = await safeFetch(url);
      if (!r.ok) continue;
      const data = await r.json();
      const map = {};
      (data?.data || []).forEach(t => { map[String(t.targetId)] = t.imageUrl; });
      if (Object.keys(map).length > 0) return map;
    } catch (e) {
      console.log('Thumb error:', e.message);
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

  // ── GET THUMBNAIL BY UNIVERSE ID ONLY ──────────────────
  if (id && !q) {
    try {
      const map = await getThumbnails([String(id)]);
      return res.json({ thumbnail: map[String(id)] || null });
    } catch (e) {
      return res.status(500).json({ error: e.message, thumbnail: null });
    }
  }

  // ── SEARCH GAMES BY KEYWORD ─────────────────────────────
  if (!q || q.trim().length < 2) return res.json({ games: [] });

  try {
    const { type, games } = await searchGames(q.trim());

    if (!games.length) {
      return res.json({ games: [], debug: 'No results from any endpoint' });
    }

    // Normalize result format depending on which endpoint worked
    let normalized = [];

    if (type === 'omni') {
      // omni-search returns: { universeId, name, creatorName, playerCount, ... }
      normalized = games.slice(0, 10).map(g => ({
        universeId: g.universeId,
        placeId:    g.rootPlaceId || '',
        name:       g.name || 'Unknown',
        creator:    g.creatorName || '',
        playing:    g.playerCount || 0,
      }));
    } else {
      // games/list returns: { universeId, name, creatorName, playerCount, ... }
      normalized = games.slice(0, 10).map(g => ({
        universeId: g.universeId,
        placeId:    g.placeId || '',
        name:       g.name || 'Unknown',
        creator:    g.creatorName || '',
        playing:    g.playerCount || 0,
      }));
    }

    // Batch fetch thumbnails
    const universeIds = normalized.map(g => String(g.universeId)).filter(Boolean);
    const thumbMap = await getThumbnails(universeIds);

    const results = normalized
      .filter(g => g.universeId)
      .map(g => ({
        id:        String(g.universeId),
        placeId:   String(g.placeId || ''),
        name:      g.name,
        creator:   g.creator,
        playing:   g.playing,
        thumbnail: thumbMap[String(g.universeId)] || null,
      }));

    return res.json({ games: results });

  } catch (e) {
    console.error('Fatal error:', e.message);
    return res.status(500).json({ error: e.message, games: [] });
  }
};
