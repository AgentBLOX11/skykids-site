const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'skykids-secret-key-change-in-production-2026';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Database setup
const db = new Database(path.join(__dirname, 'skykids.db'));

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    package TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    kids_count INTEGER NOT NULL DEFAULT 1,
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blocked_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    reason TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create default admin if not exists
const adminExists = db.prepare('SELECT id FROM admin_users WHERE username = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('skykids2026', 10);
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run('admin', hash);
  console.log('✅ Admin creat: admin / skykids2026');
}

// Insert default settings if not exist
const defaultSettings = {
  'open_hour': '10',
  'close_hour': '22',
  'max_kids_per_slot': '20',
  'slot_duration': '60',
  'restaurant_name': 'Sky Kids Soroca',
  'phone': '',
  'address': 'str. Ștefan cel Mare 46, Etajul 2, Soroca',
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, value);
}

// ============ AUTH MIDDLEWARE ============
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token lipsă' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalid' });
  }
}

// ============ PUBLIC API ============

// Submit booking
app.post('/api/bookings', (req, res) => {
  const { package: pkg, date, time, kids_count, client_name, client_phone, notes } = req.body;

  // Validation
  if (!pkg || !date || !time || !client_name || !client_phone) {
    return res.status(400).json({ error: 'Toate câmpurile obligatorii trebuie completate' });
  }
  if (kids_count < 1 || kids_count > 30) {
    return res.status(400).json({ error: 'Număr invalid de copii (1-30)' });
  }

  // Check if slot is blocked
  const blocked = db.prepare('SELECT id FROM blocked_slots WHERE date = ? AND time = ?').get(date, time);
  if (blocked) {
    return res.status(400).json({ error: 'Acest interval orar nu este disponibil' });
  }

  // Check capacity
  const settings = db.prepare("SELECT value FROM settings WHERE key = 'max_kids_per_slot'").get();
  const maxKids = parseInt(settings?.value || '20');
  const currentBookings = db.prepare(
    "SELECT COALESCE(SUM(kids_count), 0) as total FROM bookings WHERE date = ? AND time = ? AND status != 'cancelled'"
  ).get(date, time);
  if (currentBookings.total + kids_count > maxKids) {
    return res.status(400).json({ error: 'Nu mai sunt locuri disponibile pentru acest interval' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO bookings (id, package, date, time, kids_count, client_name, client_phone, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, pkg, date, time, kids_count, client_name, client_phone, notes || '');

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  res.status(201).json({ success: true, booking });
});

// Get available slots for a date
app.get('/api/slots/:date', (req, res) => {
  const { date } = req.params;
  const settingsRows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  settingsRows.forEach(s => settings[s.key] = s.value);

  const openHour = parseInt(settings.open_hour || '10');
  const closeHour = parseInt(settings.close_hour || '22');

  const slots = [];
  for (let h = openHour; h < closeHour; h++) {
    const timeStr = `${String(h).padStart(2, '0')}:00`;
    const blocked = db.prepare('SELECT id FROM blocked_slots WHERE date = ? AND time = ?').get(date, timeStr);
    const bookings = db.prepare(
      "SELECT COALESCE(SUM(kids_count), 0) as total FROM bookings WHERE date = ? AND time = ? AND status != 'cancelled'"
    ).get(date, timeStr);
    const maxKids = parseInt(settings.max_kids_per_slot || '20');

    slots.push({
      time: timeStr,
      available: !blocked && bookings.total < maxKids,
      booked: bookings.total,
      capacity: maxKids,
      remaining: maxKids - bookings.total,
    });
  }

  res.json({ date, slots });
});

// ============ ADMIN API ============

// Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username și parolă necesare' });
  }

  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credențiale invalide' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, username: user.username });
});

// Get all bookings (admin)
app.get('/api/admin/bookings', authMiddleware, (req, res) => {
  const { status, date, sort } = req.query;
  let query = 'SELECT * FROM bookings';
  const conditions = [];
  const params = [];

  if (status && status !== 'all') {
    conditions.push('status = ?');
    params.push(status);
  }
  if (date) {
    conditions.push('date = ?');
    params.push(date);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ` ORDER BY ${sort === 'oldest' ? 'created_at ASC' : 'date ASC, time ASC'}`;

  const bookings = db.prepare(query).all(...params);
  res.json({ bookings, total: bookings.length });
});

// Update booking status
app.patch('/api/admin/bookings/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'Status invalid' });
  }

  const result = db.prepare('UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Programare negăsită' });
  }
  res.json({ success: true });
});

// Delete booking
app.delete('/api/admin/bookings/:id', authMiddleware, (req, res) => {
  const result = db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Programare negăsită' });
  }
  res.json({ success: true });
});

// Dashboard stats
app.get('/api/admin/stats', authMiddleware, (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const totalBookings = db.prepare('SELECT COUNT(*) as count FROM bookings').get().count;
  const pendingBookings = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'pending'").get().count;
  const todayBookings = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE date = ?').get(today).count;
  const todayKids = db.prepare("SELECT COALESCE(SUM(kids_count), 0) as total FROM bookings WHERE date = ? AND status != 'cancelled'").get(today).total;
  const totalKids = db.prepare("SELECT COALESCE(SUM(kids_count), 0) as total FROM bookings WHERE status != 'cancelled'").get().total;

  const revenue = db.prepare(`
    SELECT COALESCE(SUM(
      CASE package
        WHEN 'standard' THEN kids_count * 100
        WHEN 'premium' THEN kids_count * 180
        WHEN 'birthday' THEN 1500
        ELSE 0
      END
    ), 0) as total FROM bookings WHERE status != 'cancelled'
  `).get().total;

  const upcomingBookings = db.prepare(
    "SELECT * FROM bookings WHERE date >= ? AND status != 'cancelled' ORDER BY date ASC, time ASC LIMIT 10"
  ).all(today);

  const bookingsByPackage = db.prepare(
    "SELECT package, COUNT(*) as count, SUM(kids_count) as kids FROM bookings WHERE status != 'cancelled' GROUP BY package"
  ).all();

  const bookingsByDate = db.prepare(`
    SELECT date, COUNT(*) as count, COALESCE(SUM(kids_count), 0) as kids
    FROM bookings WHERE status != 'cancelled' AND date >= date('now', '-30 days')
    GROUP BY date ORDER BY date ASC LIMIT 30
  `).all();

  res.json({
    totalBookings,
    pendingBookings,
    todayBookings,
    todayKids,
    totalKids,
    revenue,
    upcomingBookings,
    bookingsByPackage,
    bookingsByDate,
  });
});

// Get / Update settings
app.get('/api/admin/settings', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  res.json(settings);
});

app.put('/api/admin/settings', authMiddleware, (req, res) => {
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(req.body)) {
    upsert.run(key, String(value));
  }
  res.json({ success: true });
});

// Block/unblock slots
app.post('/api/admin/blocked-slots', authMiddleware, (req, res) => {
  const { date, time, reason } = req.body;
  if (!date || !time) return res.status(400).json({ error: 'Date și time necesare' });
  db.prepare('INSERT INTO blocked_slots (date, time, reason) VALUES (?, ?, ?)').run(date, time, reason || '');
  res.json({ success: true });
});

app.delete('/api/admin/blocked-slots/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM blocked_slots WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/blocked-slots', authMiddleware, (req, res) => {
  const slots = db.prepare('SELECT * FROM blocked_slots ORDER BY date ASC').all();
  res.json(slots);
});

// Serve SPA - admin panel & frontend
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// Catch-all for frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`
  🎈 Sky Kids Server running!
  📍 Frontend: http://localhost:${PORT}
  🔧 Admin:    http://localhost:${PORT}/admin
  🔑 Login:    admin / skykids2026
  `);
});
