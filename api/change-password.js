const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try { jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'secret'); }
  catch { return res.status(401).json({ error: 'Token invalid' }); }

  const { newUsername, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password too short' });

  const hash = bcrypt.hashSync(newPassword, 10);
  const { error } = await supabase.from('admin').update({
    username: newUsername,
    password_hash: hash,
  }).gt('id', 0);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
};
