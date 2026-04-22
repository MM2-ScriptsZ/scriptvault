// Roblox game search + thumbnail API
// Uses: games.roblox.com/v1/games/list (keyword search, still works)
// + thumbnails.roblox.com for icons

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q, id } = req.query;

  // ── GET THUMBNAIL BY UNIVERSE ID ONLY ─────────────
  if (id && !q) {
    try {
      const r = await fetch(
        `https://thumbnails.roblox.com/v1/games/icons?universeIds=${id}&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
      );
      const d = await r.json();
      const imageUrl = d?.data?.[0]?.imageUrl || null;
      return res.json({ thumbnail: imageUrl });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── SEARCH GAMES BY KEYWORD ───────────────────────
  if (!q || q.trim().length < 2) return res.json({ games: [] });

  try {
    // Try the Roblox games search endpoint
    const searchUrl = `https://games.roblox.com/v1/games/list?model.keyword=${encodeURIComponent(q.trim())}&model.startRows=0&model.maxRows=10&model.isKeywordSuggestionEnabled=true`;

    const searchRes = await fetch(searchUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });

    if (!searchRes.ok) {
      console.error('Search failed:', searchRes.status, await searchRes.text());
      return res.json({ games: [], error: 'Search API unavailable' });
    }

    const searchData = await searchRes.json();
    const games = searchData?.games || [];

    if (!games.length) return res.json({ games: [] });

    // Get universe IDs
    const universeIds = games.map(g => g.universeId).filter(Boolean);
    if (!universeIds.length) return res.json({ games: [] });

    // Fetch all thumbnails in one batch request
    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeIds.join(',')}&returnPolicy=PlaceHolder&size=256x256&format=Png&isCircular=false`,
      { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
    );

    const thumbData = thumbRes.ok ? await thumbRes.json() : { data: [] };
    const thumbMap = {};
    (thumbData.data || []).forEach(t => { thumbMap[String(t.targetId)] = t.imageUrl; });

    const results = games
      .filter(g => g.universeId)
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
    console.error('thumbnail.js error:', e.message);
    return res.status(500).json({ error: e.message, games: [] });
  }
};
