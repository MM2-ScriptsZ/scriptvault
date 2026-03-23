const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { data, error } = await supabase.from('scripts').select('views,status,game');
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    totalScripts: data.length,
    totalViews:   data.reduce((a, s) => a + (s.views || 0), 0),
    totalGames:   [...new Set(data.map(s => s.game))].length,
    freeScripts:  data.filter(s => s.status === 'Free').length,
  });
};
