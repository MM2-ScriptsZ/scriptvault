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

  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  // Check if admin row exists, if not create from env vars
  let { data: admins } = await supabase.from('admin').select('*').limit(1);

  if (!admins || admins.length === 0) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASS || 'scriptvault2024', 10);
    await supabase.from('admin').insert([{
      username: process.env.ADMIN_USER || 'admin',
      password_hash: hash,
    }]);
    admins = [{ username: process.env.ADMIN_USER || 'admin', password_hash: hash }];
  }

  const admin = admins[0];
  if (username !== admin.username || !bcrypt.compareSync(password, admin.password_hash))
    return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ username }, process.env.JWT_SECRET || 'secret', { expiresIn: '12h' });
  res.json({ token });
};
