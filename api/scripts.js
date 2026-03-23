const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

function requireAuth(req) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return false;
  try {
    jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    return true;
  } catch { return false; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — list scripts (never expose script code or redirect_url in list)
  if (req.method === 'GET') {
    const { search, category, status, sort = 'newest', page = 1, limit = 9 } = req.query;
    let query = supabase.from('scripts').select(
      'id,title,game,category,status,description,views,date,locked', { count: 'exact' }
    );

    if (search) query = query.or(`title.ilike.%${search}%,game.ilike.%${search}%,description.ilike.%${search}%`);
    if (category && category !== 'all') query = query.eq('category', category);
    if (status && status !== 'all') query = query.eq('status', status);

    if (sort === 'newest') query = query.order('date', { ascending: false });
    else if (sort === 'oldest') query = query.order('date', { ascending: true });
    else if (sort === 'views') query = query.order('views', { ascending: false });
    else if (sort === 'az') query = query.order('title', { ascending: true });

    const pageNum  = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
    query = query.range((pageNum - 1) * pageSize, pageNum * pageSize - 1);

    const { data, count, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.json({
      scripts: data,
      total: count,
      page: pageNum,
      pages: Math.ceil(count / pageSize),
    });
  }

  // POST — create script (admin only)
  if (req.method === 'POST') {
    if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { title, game, category, status, description, script, locked, redirect_url } = req.body;
    if (!title || !game || !description || !script) return res.status(400).json({ error: 'Missing fields' });

    const { data, error } = await supabase.from('scripts').insert([{
      id: Date.now(),
      title, game,
      category:     category     || 'Other',
      status:       status       || 'Free',
      description,  script,
      locked:       locked       || false,
      redirect_url: redirect_url || null,
      views: 0,
      date: new Date().toISOString(),
    }]).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ ok: true, script: data });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
