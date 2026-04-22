// GET /api/thumbnail?game=Blox+Fruits
// Searches Roblox API for game thumbnail by name

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { game, id } = req.query;
  if (!game && !id) return res.status(400).json({ error: 'Missing game or id' });

  try {
    let universeId = id;

    // Step 1 — Search for game by name if no ID provided
    if (!universeId) {
      const searchRes = await fetch(
        `https://games.roblox.com/v1/games/list?model.keyword=${encodeURIComponent(game)}&model.startRows=0&model.maxRows=1`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (!searchRes.ok) throw new Error('Search failed');
      const searchData = await searchRes.json();
      const gameInfo = searchData?.games?.[0];
      if (!gameInfo) return res.status(404).json({ error: 'Game not found', thumbnail: null });
      universeId = gameInfo.universeId;
    }

    // Step 2 — Get thumbnail using universe ID
    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!thumbRes.ok) throw new Error('Thumbnail fetch failed');
    const thumbData = await thumbRes.json();
    const imageUrl = thumbData?.data?.[0]?.imageUrl;

    if (!imageUrl) return res.status(404).json({ error: 'No thumbnail found', thumbnail: null });

    return res.json({ thumbnail: imageUrl, universeId });
  } catch (e) {
    return res.status(500).json({ error: e.message, thumbnail: null });
  }
};
