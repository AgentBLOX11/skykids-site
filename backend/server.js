const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const https = require('https');

// ============== TRANSLATION HELPER (LibreTranslate) ==============
const LIBRE_TRANSLATE_URL = 'https://libretranslate.com/translate';

function translate(text, targetLang = 'ru') {
  return new Promise((resolve) => {
    if (!text || targetLang !== 'ru') return resolve(text);
    const body = JSON.stringify({ q: text, source: 'ro', target: 'ru', format: 'text' });
    const req = https.request(LIBRE_TRANSLATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json?.translatedText || text);
        } catch (e) { resolve(text); }
      });
    });
    req.on('error', () => resolve(text));
    req.write(body);
    req.end();
  });
}

async function translateObject(obj, fields) {
  const result = { ...obj };
  await Promise.all(fields.map(async (f) => {
    if (result[f]) result[f] = await translate(result[f], 'ru');
  }));
  return result;
}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'skykids2026production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Database setup
const db = new Database(path.join(__dirname, 'skykids.db'));

// ============== CLEANUP DUPLICATES ON STARTUP ==============
(function cleanupDuplicates() {
  try {
    const allPackages = db.prepare('SELECT id FROM packages ORDER BY id ASC').all();
    if (allPackages.length > 3) {
      const toDelete = allPackages.slice(3).map(p => p.id);
      if (toDelete.length > 0) {
        db.prepare(`DELETE FROM packages WHERE id IN (${toDelete.join(',')})`).run();
        console.log(`🧹 Cleaned up ${toDelete.length} duplicate packages`);
      }
    }
  } catch (e) { console.log('Cleanup skipped:', e.message); }
})();

// ============== INIT TABLES ==============
db.exec(`
  -- Existing tables
  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    package TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    kids_count INTEGER NOT NULL DEFAULT 1,
    adults_count INTEGER NOT NULL DEFAULT 0,
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    notes TEXT DEFAULT '',
    admin_notes TEXT DEFAULT '',
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

  -- NEW: Categories
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🍽️',
    sort_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- NEW: Products
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price TEXT DEFAULT '',
    weight TEXT DEFAULT '',
    image TEXT DEFAULT '',
    badge TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  -- NEW: Gallery images
  CREATE TABLE IF NOT EXISTS gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_url TEXT NOT NULL,
    caption TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- NEW: Contact info
  CREATE TABLE IF NOT EXISTS contact_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    label TEXT DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- NEW: Reservation packages
  CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🎁',
    description TEXT DEFAULT '',
    price_per_child TEXT DEFAULT '',
    price_per_adult TEXT DEFAULT '',
    price_group TEXT DEFAULT '',
    max_children INTEGER DEFAULT 15,
    max_adults INTEGER DEFAULT 10,
    includes TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create uploads directory
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = crypto.randomBytes(16).toString('hex');
    cb(null, name + ext);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});
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
  'facebook': '',
  'instagram': '',
  'map_embed': '',
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, value);
}

// Insert default contact_info
const defaultContact = [
  { key: 'phone', value: '+373 600 00 000', label: 'Telefon' },
  { key: 'address', value: 'str. Ștefan cel Mare 46, Etajul 2, Soroca', label: 'Adresă' },
  { key: 'facebook', value: 'https://facebook.com/skykids', label: 'Facebook' },
  { key: 'instagram', value: '@_.sky.kids._', label: 'Instagram' },
  { key: 'email', value: 'contact@skykids.md', label: 'Email' },
  { key: 'map_embed', value: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2695.5!2d28.3037!3d48.1639!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x40ccc1004d1a8f7f:0xbc7ec66eda9faadd!8m2!3d48.1639364!4d28.3036929!16s%2Fg%2F11xzld8d2j!5m2!1sen!2sro!3e0', label: 'Hartă' },
];
const insertContact = db.prepare('INSERT OR IGNORE INTO contact_info (key, value, label) VALUES (?, ?, ?)');
for (const c of defaultContact) {
  insertContact.run(c.key, c.value, c.label);
}

// Insert default packages (only if table is empty)
const packageCount = db.prepare('SELECT COUNT(*) as c FROM packages').get().c;
if (packageCount === 0) {
  const defaultPackages = [
    { name: 'Standard', icon: '🎈', description: 'Acces la zona de joacă + o băutură', price_per_child: '100', price_per_adult: '', price_group: '', max_children: 15, max_adults: 10, includes: 'Zona de joacă, O băutură', sort_order: 0 },
    { name: 'Premium', icon: '⭐', description: 'Acces + farfurie + băutură + dulciuri', price_per_child: '180', price_per_adult: '', price_group: '', max_children: 15, max_adults: 10, includes: 'Zona de joacă, Fel principal, Băutură, Desert', sort_order: 1 },
    { name: 'Zi de Naștere', icon: '🎂', description: 'Pachet complet petrecere copii (max 15 copii)', price_per_child: '', price_per_adult: '', price_group: '1500', max_children: 15, max_adults: 10, includes: 'Zonă privată, Catering complet, Decorare, animator', sort_order: 2 },
  ];
  const insertPackage = db.prepare('INSERT INTO packages (name, icon, description, price_per_child, price_per_adult, price_group, max_children, max_adults, includes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const p of defaultPackages) {
    insertPackage.run(p.name, p.icon, p.description, p.price_per_child, p.price_per_adult, p.price_group, p.max_children, p.max_adults, p.includes, p.sort_order);
  }
  console.log('✅ Packages inițializate');
}

// ============== AUTH MIDDLEWARE ==============
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

// ============== AUTH API ==============
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

// Change password
app.post('/api/admin/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'Toate câmpurile sunt necesare' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Parolele noi nu coincid' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Parola nouă trebuie să aibă minim 6 caractere' });
  }
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.id);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Parola actuală este incorectă' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hash, req.admin.id);
  res.json({ success: true });
});

// ============== CATEGORIES API ==============
app.get('/api/categories', async (req, res) => {
  const lang = req.query.lang || 'ro';
  const cats = db.prepare('SELECT id, name, icon, sort_order, active, description FROM categories WHERE active = 1 ORDER BY sort_order ASC').all();
  if (lang === 'ru') {
    const translated = await Promise.all(cats.map(c => translateObject(c, ['name', 'description'])));
    return res.json(translated);
  }
  res.json(cats);
});

app.get('/api/admin/categories', authMiddleware, (req, res) => {
  const cats = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();
  res.json(cats);
});

app.post('/api/admin/categories', authMiddleware, (req, res) => {
  const { name, icon, sort_order, name_ru, description_ru } = req.body;
  if (!name) return res.status(400).json({ error: 'Numele este obligatoriu' });
  const result = db.prepare('INSERT INTO categories (name, icon, sort_order, name_ru, description_ru) VALUES (?, ?, ?, ?, ?)').run(name, icon || '🍽️', sort_order || 0, name_ru || '', description_ru || '');
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(cat);
});

app.put('/api/admin/categories/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { name, icon, sort_order, active, name_ru, description_ru } = req.body;
  db.prepare('UPDATE categories SET name = ?, icon = ?, sort_order = ?, active = ?, name_ru = ?, description_ru = ? WHERE id = ?').run(name, icon, sort_order, active !== undefined ? active : 1, name_ru || '', description_ru || '', id);
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  res.json(cat);
});

app.delete('/api/admin/categories/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ success: true });
});

// ============== PRODUCTS API ==============
app.get('/api/products', async (req, res) => {
  const { category_id } = req.query;
  const lang = req.query.lang || 'ro';
  let query = `SELECT p.id, p.name, p.description, p.price, p.weight, p.image, p.badge, p.category_id, p.sort_order, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.active = 1`;
  const params = [];
  if (category_id) {
    query += ' AND p.category_id = ?';
    params.push(category_id);
  }
  query += ' ORDER BY p.sort_order ASC';
  const products = db.prepare(query).all(...params);
  if (lang === 'ru') {
    const translated = await Promise.all(products.map(p => translateObject(p, ['name', 'description', 'category_name'])));
    return res.json(translated);
  }
  res.json(products);
});

app.get('/api/admin/products', authMiddleware, (req, res) => {
  const { category_id } = req.query;
  let query = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id';
  const params = [];
  if (category_id) {
    query += ' WHERE p.category_id = ?';
    params.push(category_id);
  }
  query += ' ORDER BY p.sort_order ASC';
  const products = db.prepare(query).all(...params);
  res.json(products);
});

app.post('/api/admin/products', authMiddleware, (req, res) => {
  const { category_id, name, description, price, weight, image, badge, sort_order, name_ru, description_ru } = req.body;
  if (!name) return res.status(400).json({ error: 'Numele este obligatoriu' });
  const result = db.prepare('INSERT INTO products (category_id, name, description, price, weight, image, badge, sort_order, name_ru, description_ru) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(category_id || null, name, description || '', price || '', weight || '', image || '', badge || '', sort_order || 0, name_ru || '', description_ru || '');
  const product = db.prepare('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?').get(result.lastInsertRowid);
  res.status(201).json(product);
});

app.put('/api/admin/products/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { category_id, name, description, price, weight, image, badge, sort_order, active, name_ru, description_ru } = req.body;
  db.prepare('UPDATE products SET category_id = ?, name = ?, description = ?, price = ?, weight = ?, image = ?, badge = ?, sort_order = ?, active = ?, name_ru = ?, description_ru = ? WHERE id = ?').run(category_id || null, name, description || '', price || '', weight || '', image || '', badge || '', sort_order || 0, active !== undefined ? active : 1, name_ru || '', description_ru || '', id);
  const product = db.prepare('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?').get(id);
  res.json(product);
});

app.delete('/api/admin/products/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  res.json({ success: true });
});

// ============== PACKAGES API ==============
app.get('/api/packages', async (req, res) => {
  const lang = req.query.lang || 'ro';
  const packages = db.prepare('SELECT id, name, icon, description, price_per_child, price_per_adult, price_group, max_children, max_adults, includes, sort_order, active FROM packages WHERE active = 1 ORDER BY sort_order ASC').all();
  if (lang === 'ru') {
    const translated = await Promise.all(packages.map(p => translateObject(p, ['name', 'description', 'includes'])));
    return res.json(translated);
  }
  res.json(packages);
});

app.get('/api/admin/packages', authMiddleware, (req, res) => {
  const packages = db.prepare('SELECT * FROM packages ORDER BY sort_order ASC').all();
  res.json(packages);
});

app.post('/api/admin/packages', authMiddleware, (req, res) => {
  const { name, icon, description, price_per_child, price_per_adult, price_group, max_children, max_adults, includes, sort_order, name_ru, description_ru, includes_ru } = req.body;
  if (!name) return res.status(400).json({ error: 'Numele este obligatoriu' });
  const result = db.prepare('INSERT INTO packages (name, icon, description, price_per_child, price_per_adult, price_group, max_children, max_adults, includes, sort_order, name_ru, description_ru, includes_ru) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(name, icon || '🎁', description || '', price_per_child || '', price_per_adult || '', price_group || '', max_children || 15, max_adults || 10, includes || '', sort_order || 0, name_ru || '', description_ru || '', includes_ru || '');
  const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(pkg);
});

app.put('/api/admin/packages/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { name, icon, description, price_per_child, price_per_adult, price_group, max_children, max_adults, includes, sort_order, active, name_ru, description_ru, includes_ru } = req.body;
  console.log('PUT /packages/' + id, { name, max_children, max_adults, active });
  try {
    const activeVal = active !== undefined ? (active ? 1 : 0) : 1;
    db.prepare('UPDATE packages SET name = ?, icon = ?, description = ?, price_per_child = ?, price_per_adult = ?, price_group = ?, max_children = ?, max_adults = ?, includes = ?, sort_order = ?, active = ?, name_ru = ?, description_ru = ?, includes_ru = ? WHERE id = ?').run(name, icon, description || '', price_per_child || '', price_per_adult || '', price_group || '', max_children || 15, max_adults || 10, includes || '', sort_order || 0, activeVal, name_ru || '', description_ru || '', includes_ru || '', id);
    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(id);
    res.json(pkg);
  } catch(e) {
    console.error('Package update error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/packages/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM packages WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============== GALLERY API ==============
app.get('/api/gallery', async (req, res) => {
  const lang = req.query.lang || 'ro';
  const gallery = db.prepare('SELECT id, image_url, caption, sort_order, active FROM gallery WHERE active = 1 ORDER BY sort_order ASC').all();
  if (lang === 'ru') {
    const translated = await Promise.all(gallery.map(g => translateObject(g, ['caption'])));
    return res.json(translated);
  }
  res.json(gallery);
});

app.get('/api/admin/gallery', authMiddleware, (req, res) => {
  const gallery = db.prepare('SELECT * FROM gallery ORDER BY sort_order ASC').all();
  res.json(gallery);
});

app.post('/api/admin/gallery', authMiddleware, (req, res) => {
  const { image_url, caption, sort_order } = req.body;
  if (!image_url) return res.status(400).json({ error: 'URL-ul imaginii este obligatoriu' });
  const result = db.prepare('INSERT INTO gallery (image_url, caption, sort_order) VALUES (?, ?, ?)').run(image_url, caption || '', sort_order || 0);
  const item = db.prepare('SELECT * FROM gallery WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(item);
});

// Upload image file
app.post('/api/admin/upload', authMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nicio imagine primită' });
  const url = '/uploads/' + req.file.filename;
  res.json({ url });
});

app.put('/api/admin/gallery/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { image_url, caption, sort_order, active } = req.body;
  db.prepare('UPDATE gallery SET image_url = ?, caption = ?, sort_order = ?, active = ? WHERE id = ?').run(image_url, caption || '', sort_order || 0, active !== undefined ? active : 1, id);
  const item = db.prepare('SELECT * FROM gallery WHERE id = ?').get(id);
  res.json(item);
});

app.delete('/api/admin/gallery/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM gallery WHERE id = ?').run(id);
  res.json({ success: true });
});

// ============== CONTACT INFO API ==============
app.get('/api/contact', (req, res) => {
  const contact = db.prepare('SELECT * FROM contact_info').all();
  const obj = {};
  contact.forEach(c => { obj[c.key] = { value: c.value, label: c.label }; });
  res.json(obj);
});

app.get('/api/admin/contact', authMiddleware, (req, res) => {
  const contact = db.prepare('SELECT * FROM contact_info ORDER BY id ASC').all();
  res.json(contact);
});

app.put('/api/admin/contact/:key', authMiddleware, (req, res) => {
  const { key } = req.params;
  const { value, label } = req.body;
  db.prepare('UPDATE contact_info SET value = ?, label = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(value || '', label || '', key);
  const item = db.prepare('SELECT * FROM contact_info WHERE key = ?').get(key);
  res.json(item);
});

// ============== SETTINGS API ==============
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

// ============== BOOKINGS API (existing) ==============
app.post('/api/bookings', (req, res) => {
  const { package: pkg, date, time, kids_count, adults_count, client_name, client_phone, notes } = req.body;
  if (!pkg || !date || !time || !client_name || !client_phone) {
    return res.status(400).json({ error: 'Toate câmpurile obligatorii trebuie completate' });
  }
  if (kids_count < 1 || kids_count > 30) {
    return res.status(400).json({ error: 'Număr invalid de copii (1-30)' });
  }
  // Check package-specific limits
  const packageInfo = db.prepare('SELECT max_children, max_adults FROM packages WHERE name = ? OR name LIKE ? LIMIT 1').get(pkg, `%${pkg}%`);
  if (packageInfo) {
    if (kids_count > packageInfo.max_children) {
      return res.status(400).json({ error: `Numărul maxim de copii pentru acest pachet este ${packageInfo.max_children}` });
    }
    if ((adults_count || 0) > packageInfo.max_adults) {
      return res.status(400).json({ error: `Numărul maxim de adulți pentru acest pachet este ${packageInfo.max_adults}` });
    }
  }
  const blocked = db.prepare('SELECT id FROM blocked_slots WHERE date = ? AND time = ?').get(date, time);
  if (blocked) {
    return res.status(400).json({ error: 'Acest interval orar nu este disponibil' });
  }
  const settings = db.prepare("SELECT value FROM settings WHERE key = 'max_kids_per_slot'").get();
  const maxKids = parseInt(settings?.value || '20');
  const currentBookings = db.prepare("SELECT COALESCE(SUM(kids_count), 0) as total FROM bookings WHERE date = ? AND time = ? AND status != 'cancelled'").get(date, time);
  if (currentBookings.total + kids_count > maxKids) {
    return res.status(400).json({ error: 'Nu mai sunt locuri disponibile pentru acest interval' });
  }
  const id = uuidv4();
  db.prepare(`INSERT INTO bookings (id, package, date, time, kids_count, client_name, client_phone, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, pkg, date, time, kids_count, client_name, client_phone, notes || '');
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  res.status(201).json({ success: true, booking });
});

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
    const bookings = db.prepare("SELECT COALESCE(SUM(kids_count), 0) as total FROM bookings WHERE date = ? AND time = ? AND status != 'cancelled'").get(date, timeStr);
    const maxKids = parseInt(settings.max_kids_per_slot || '20');
    slots.push({ time: timeStr, available: !blocked && bookings.total < maxKids, booked: bookings.total, capacity: maxKids, remaining: maxKids - bookings.total });
  }
  res.json({ date, slots });
});

app.get('/api/admin/bookings', authMiddleware, (req, res) => {
  const { status, date, sort, all } = req.query;
  let query = 'SELECT * FROM bookings';
  const conditions = [];
  const params = [];
  if (all !== '1' && status && status !== 'all') { conditions.push('status = ?'); params.push(status); }
  if (date) { conditions.push('date = ?'); params.push(date); }
  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ` ORDER BY ${sort === 'oldest' ? 'created_at ASC' : 'date ASC, time ASC'}`;
  const bookings = db.prepare(query).all(...params);
  res.json({ bookings, total: bookings.length });
});

app.put('/api/admin/bookings/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { client_name, client_phone, kids_count, adults_count, notes, admin_notes, status } = req.body;
  
  // Get existing booking
  const existing = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Rezervare negăsită' });
  
  // Validate status if provided
  if (status && !['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'Status invalid' });
  }
  
  // Build update query dynamically
  const updates = [];
  const params = [];
  
  if (client_name !== undefined) { updates.push('client_name = ?'); params.push(client_name); }
  if (client_phone !== undefined) { updates.push('client_phone = ?'); params.push(client_phone); }
  if (kids_count !== undefined) { updates.push('kids_count = ?'); params.push(kids_count); }
  if (adults_count !== undefined) { updates.push('adults_count = ?'); params.push(adults_count); }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes || ''); }
  if (admin_notes !== undefined) { updates.push('admin_notes = ?'); params.push(admin_notes || ''); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);
  
  db.prepare('UPDATE bookings SET ' + updates.join(', ') + ' WHERE id = ?').run(...params);
  
  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  res.json(updated);
});

// Also keep PATCH for simple status updates
app.patch('/api/admin/bookings/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'Status invalid' });
  }
  db.prepare('UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
  res.json({ success: true });
});

app.delete('/api/admin/bookings/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/stats', authMiddleware, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const totalBookings = db.prepare('SELECT COUNT(*) as count FROM bookings').get().count;
  const pendingBookings = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'pending'").get().count;
  const todayBookings = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE date = ?').get(today).count;
  const todayKids = db.prepare("SELECT COALESCE(SUM(kids_count), 0) as total FROM bookings WHERE date = ? AND status != 'cancelled'").get(today).total;
  const totalKids = db.prepare("SELECT COALESCE(SUM(kids_count), 0) as total FROM bookings WHERE status != 'cancelled'").get().total;
  const totalAdults = db.prepare("SELECT COALESCE(SUM(adults_count), 0) as total FROM bookings WHERE status != 'cancelled'").get().total;
  const revenue = db.prepare(`SELECT COALESCE(SUM(CASE package WHEN 'standard' THEN kids_count * 100 WHEN 'premium' THEN kids_count * 180 WHEN 'birthday' THEN 1500 ELSE 0 END), 0) as total FROM bookings WHERE status != 'cancelled'`).get().total;
  const upcomingBookings = db.prepare("SELECT * FROM bookings WHERE date >= ? AND status != 'cancelled' ORDER BY date ASC, time ASC LIMIT 10").all(today);
  const bookingsByPackage = db.prepare("SELECT package, COUNT(*) as count, SUM(kids_count) as kids FROM bookings WHERE status != 'cancelled' GROUP BY package").all();
  const bookingsByDate = db.prepare(`SELECT date, COUNT(*) as count, COALESCE(SUM(kids_count), 0) as kids FROM bookings WHERE status != 'cancelled' AND date >= date('now', '-30 days') GROUP BY date ORDER BY date ASC LIMIT 30`).all();
  res.json({ totalBookings, pendingBookings, todayBookings, todayKids, totalKids, revenue, upcomingBookings, bookingsByPackage, bookingsByDate });
});

// Blocked slots
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
  res.json(db.prepare('SELECT * FROM blocked_slots ORDER BY date ASC').all());
});

// ============== SERVE PAGES ==============
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  🎈 Sky Kids Server running!
  📍 Frontend: http://localhost:${PORT}
  🔧 Admin:    http://localhost:${PORT}/admin
  🔑 Login:    admin / skykids2026
  ✅ New API: categories, products, gallery, contact
  `);
});
