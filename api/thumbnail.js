// GET /api/thumbnail?q=riv  — search games by keyword, return suggestions
// GET /api/thumbnail?id=123  — get thumbnail by universe ID

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q, id } = req.query;

  // ── GET THUMBNAIL BY UNIVERSE ID ──────────────────
  if (id) {
    try {
      const r = await fetch(
        `https://thumbnails.roblox.com/v1/games/icons?universeIds=${id}&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false`
      );
      const d = await r.json();
      const imageUrl = d?.data?.[0]?.imageUrl || null;
      return res.json({ thumbnail: imageUrl });
    } catch (e) {
      return res.status(500).json({ error: e.message, thumbnail: null });
    }
  }

  // ── SEARCH GAMES BY KEYWORD ───────────────────────
  if (!q || q.length < 2) return res.json({ games: [] });

  try {
    // Search games
    const searchRes = await fetch(
      `https://games.roblox.com/v1/games/list?model.keyword=${encodeURIComponent(q)}&model.startRows=0&model.maxRows=10`,
      { headers: { Accept: 'application/json' } }
    );
    if (!searchRes.ok) return res.json({ games: [] });
    const searchData = await searchRes.json();
    const games = searchData?.games || [];
    if (!games.length) return res.json({ games: [] });

    // Get thumbnails for all found games at once
    const ids = games.map(g => g.universeId).join(',');
    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/games/icons?universeIds=${ids}&returnPolicy=PlaceHolder&size=256x256&format=Png&isCircular=false`
    );
    const thumbData = thumbRes.ok ? await thumbRes.json() : { data: [] };
    const thumbMap = {};
    (thumbData.data || []).forEach(t => { thumbMap[t.targetId] = t.imageUrl; });

    const results = games.map(g => ({
      id:        g.universeId,
      name:      g.name,
      creator:   g.creatorName || '',
      playing:   g.playerCount || 0,
      thumbnail: thumbMap[g.universeId] || null,
    }));

    return res.json({ games: results });
  } catch (e) {
    return res.status(500).json({ error: e.message, games: [] });
  }
};
