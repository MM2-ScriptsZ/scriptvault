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
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  // GET — fetch script, increment views
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('scripts').select('*').eq('id', id).single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });

    // Increment views
    await supabase.from('scripts').update({ views: (data.views || 0) + 1 }).eq('id', id);
    await supabase.from('view_history').insert([{ script_id: id, ts: Date.now() }]);

    const isAdmin = requireAuth(req);

    // If locked and not admin — return without script code, but include redirect_url
    if (data.locked && !isAdmin) {
      const { script, ...safe } = data;
      return res.json({ ...safe, views: (data.views || 0) + 1, locked: true });
    }

    return res.json({ ...data, views: (data.views || 0) + 1 });
  }

  // PUT — update script (admin only)
  if (req.method === 'PUT') {
    if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
    const fields = ['title','game','category','status','description','script','locked','redirect_url'];
    const update = {};
    fields.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    // Force locked to proper boolean
    if (update.locked !== undefined) update.locked = update.locked === true || update.locked === 'true';
    if (!update.locked) update.redirect_url = null;

    const { data, error } = await supabase.from('scripts').update(update).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, script: data });
  }

  // DELETE — delete script (admin only)
  if (req.method === 'DELETE') {
    if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { error } = await supabase.from('scripts').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
