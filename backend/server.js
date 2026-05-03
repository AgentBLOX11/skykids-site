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

// ===== SECURITY HEADERS =====
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://code.iconify.design; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self';");
  next();
});

// Force HTTPS (only in production)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect('https://' + req.hostname + req.url);
    }
    next();
  });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
        console.log(`Cleaned up ${toDelete.length} duplicate packages`);
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
    description TEXT DEFAULT '',
    icon TEXT DEFAULT '[food]',
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
    icon TEXT DEFAULT '[gift]',
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

  -- NEW: Orders (cart checkout)
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT DEFAULT '',
    order_type TEXT DEFAULT 'delivery',
    datetime TEXT DEFAULT '',
    total DECIMAL(10,2) DEFAULT 0,
    status TEXT DEFAULT 'pending',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- NEW: Order Items
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    product_id INTEGER,
    quantity INTEGER DEFAULT 1,
    price DECIMAL(10,2) DEFAULT 0,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  );

  -- NEW: Decor Types
  CREATE TABLE IF NOT EXISTS decor_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price DECIMAL(10,2) DEFAULT 0,
    image TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
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

// Seed business info settings
const businessSettings = [
  { key: 'company_name', value: 'Sky Kids SRL' },
  { key: 'company_address', value: 'Soroca, Moldova' },
  { key: 'company_phone', value: '+373 60 123 456' },
  { key: 'company_email', value: 'contact@skykids.md' },
  { key: 'fiscal_code', value: '' },
  { key: 'legal_address', value: 'Str. Principală 1, or. Soroca, MD-3000, Republica Moldova' }
];
for(const s of businessSettings) {
  try {
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(s.key, s.value);
  } catch(e) {}
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
    { name: 'Standard', icon: '[balloon]', description: 'Acces la zona de joacă + o băutură', price_per_child: '100', price_per_adult: '', price_group: '', max_children: 15, max_adults: 10, includes: 'Zona de joacă, O băutură', sort_order: 0 },
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
  const result = db.prepare('INSERT INTO categories (name, icon, sort_order, name_ru, description_ru) VALUES (?, ?, ?, ?, ?)').run(name, icon || '[food]', sort_order || 0, name_ru || '', description_ru || '');
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
  const result = db.prepare('INSERT INTO packages (name, icon, description, price_per_child, price_per_adult, price_group, max_children, max_adults, includes, sort_order, name_ru, description_ru, includes_ru) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(name, icon || '[gift]', description || '', price_per_child || '', price_per_adult || '', price_group || '', max_children || 15, max_adults || 10, includes || '', sort_order || 0, name_ru || '', description_ru || '', includes_ru || '');
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

// ============== ORDERS API ==============
app.post('/api/orders', (req, res) => {
  const { first_name, last_name, phone, address, order_type, datetime, items, total, notes } = req.body;
  if(!first_name || !last_name || !phone) {
    return res.status(400).json({ error: 'Completează toate câmpurile obligatorii' });
  }
  if(!items || items.length === 0) {
    return res.status(400).json({ error: 'Coșul este gol' });
  }
  const orderNumber = 'SK' + Date.now();
  try {
    const result = db.prepare('INSERT INTO orders (order_number, first_name, last_name, phone, address, order_type, datetime, total, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(orderNumber, first_name, last_name, phone, address || '', order_type || 'delivery', datetime || '', total || 0, notes || '');
    const orderId = result.lastInsertRowid;
    const insertItem = db.prepare('INSERT INTO order_items (order_id, product_name, product_id, quantity, price) VALUES (?, ?, ?, ?, ?)');
    for(const item of items) {
      insertItem.run(orderId, item.name, item.id || null, item.quantity || 1, item.price || 0);
    }
    res.json({ success: true, order_number: orderNumber, order_id: orderId });
  } catch(e) {
    console.error('Order error:', e);
    res.status(500).json({ error: 'Eroare la salvarea comenzii' });
  }
});

app.get('/api/orders', (req, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  const ordersWithItems = orders.map(o => {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
    return { ...o, items };
  });
  res.json(ordersWithItems);
});

app.patch('/api/admin/orders/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

// ============== DECOR API ==============
app.get('/api/decor', (req, res) => {
  const decor = db.prepare('SELECT * FROM decor_types WHERE active = 1 ORDER BY sort_order ASC').all();
  res.json(decor);
});

app.post('/api/admin/decor', authMiddleware, (req, res) => {
  const { name, description, price, image } = req.body;
  if(!name || !price) return res.status(400).json({ error: 'Nume și preț sunt obligatorii' });
  const result = db.prepare('INSERT INTO decor_types (name, description, price, image) VALUES (?, ?, ?, ?)').run(name, description || '', price, image || '');
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/admin/decor/:id', authMiddleware, (req, res) => {
  const { name, description, price, image, active } = req.body;
  db.prepare('UPDATE decor_types SET name = ?, description = ?, price = ?, image = ?, active = ? WHERE id = ?').run(name, description || '', price, image || '', active !== undefined ? active : 1, req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/decor/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM decor_types WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/decor', authMiddleware, (req, res) => {
  const decor = db.prepare('SELECT * FROM decor_types ORDER BY sort_order ASC').all();
  res.json(decor);
});

// ===== BUSINESS INFO HELPER =====
function getBusinessInfo() {
  const company_name = db.prepare("SELECT value FROM settings WHERE key = 'company_name'").get();
  const company_address = db.prepare("SELECT value FROM settings WHERE key = 'company_address'").get();
  const company_phone = db.prepare("SELECT value FROM settings WHERE key = 'company_phone'").get();
  const company_email = db.prepare("SELECT value FROM settings WHERE key = 'company_email'").get();
  const fiscal_code = db.prepare("SELECT value FROM settings WHERE key = 'fiscal_code'").get();
  const legal_address = db.prepare("SELECT value FROM settings WHERE key = 'legal_address'").get();
  return {
    companyName: company_name ? company_name.value : 'Sky Kids SRL',
    address: company_address ? company_address.value : 'Soroca, Moldova',
    phone: company_phone ? company_phone.value : '+373 60 123 456',
    email: company_email ? company_email.value : 'contact@skykids.md',
    fiscalCode: fiscal_code ? fiscal_code.value : '1234567890123',
    legalAddress: legal_address ? legal_address.value : 'Str. Principală 1, or. Soroca, MD-3000',
    siteUrl: 'skykidssoroca.md',
    city: 'Soroca'
  };
}

function getLegalPage(title, content, bi) {
  return `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title} - Sky Kids Soroca</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><script src="https://cdn.tailwindcss.com"></script><style>:root{--candy-pink:#ff6b9d;--candy-orange:#ff9f43;--candy-blue:#54a0ff;--candy-green:#26de81;}.gradient-text{background:linear-gradient(135deg,var(--candy-pink),var(--candy-orange));-webkit-background-clip:text;-webkit-text-fill-color:transparent}.footer-wave{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)}.legal-content h2{font-size:1.25rem;font-weight:800;color:#1a1a2e;margin:2rem 0 1rem;padding-bottom:0.5rem;border-bottom:2px solid #ff6b9d20}.legal-content p{color:#4a5568;line-height:1.8;margin-bottom:1rem}.legal-content ul{list-style:disc;padding-left:1.5rem;color:#4a5568;margin-bottom:1rem}.legal-content li{margin-bottom:0.5rem}.legal-content strong{color:#1a1a2e}.legal-container{max-width:800px;margin:0 auto;padding:2rem 1.5rem}.legal-badge{display:inline-block;background:linear-gradient(135deg,var(--candy-pink),var(--candy-orange));color:white;font-size:0.75rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:0.375rem 1rem;border-radius:9999px;margin-bottom:1rem}body{font-family:'Inter',sans-serif}</style></head><body class="bg-gray-50 min-h-screen"><nav class="bg-white shadow-sm sticky top-0 z-50"><div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between"><a href="/" class="flex items-center gap-3"><div class="w-10 h-10 bg-gradient-to-br from-[#ff6b9d] to-[#ff9f43] rounded-xl flex items-center justify-center text-white font-black text-lg">S</div><div><span class="font-black text-xl gradient-text">Sky Kids</span><p class="text-xs text-gray-400 -mt-1">Soroca</p></div></a><a href="/" class="bg-candy-pink text-white px-4 py-2 rounded-xl font-bold text-sm hover:opacity-90">← Înapoi la site</a></div></nav><div class="legal-container"><div class="mb-8"><span class="legal-badge">${bi.companyName}</span><h1 class="text-4xl font-black text-dark mb-2">${title}</h1><p class="text-gray-400 text-sm">Ultima actualizare: Mai 2026</p></div><div class="bg-white rounded-2xl shadow-card p-8 md:p-10 legal-content">${content}</div></div><footer class="footer-wave text-white py-10 mt-16"><div class="max-w-6xl mx-auto px-6 text-center"><p class="font-bold text-lg mb-2">${bi.companyName}</p><p class="text-gray-400 text-sm">${bi.legalAddress}</p><p class="text-gray-400 text-sm mt-1">${bi.phone} · ${bi.email}</p></div></footer></body></html>`;
}

// ===== LEGAL PAGES =====
app.get('/terms', (req, res) => {
  const bi = getBusinessInfo();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getLegalPage('Termeni și Condiții', `<h2>1. Acceptarea termenilor</h2><p>Prin utilizarea site-ului <strong>${bi.companyName}</strong> (${bi.siteUrl}), acceptați acești Termeni și Condiții în totalitate.</p><h2>2. Serviciile oferite</h2><p>${bi.companyName} oferă servicii de zonă de joacă pentru copii, servire mâncare și organizare petreceri în locația din ${bi.address}.</p><h2>3. Rezervări</h2><p>Rezervările sunt confirmate după contactarea clientului. Plata se face la sosire sau în avans conform înțelegerii.</p><p>Cancelarea este posibilă cu 24 de ore înainte. În caz contrar, se poate percepe o taxă de anulare.</p><h2>4. Comezi de mâncare</h2><p>Comenzile sunt pregătite în maximum 45 de minute. Livrarea este disponibilă în raza ${bi.city}.</p><h2>5. Responsabilități</h2><p>Părinții sunt responsabili pentru supravegherea copiilor în zona de joacă. Personalul ${bi.companyName} nu este responsabil pentru accidentări rezultate din utilizarea normală a echipamentelor.</p><h2>6. Proprietate intelectuală</h2><p>Întregul conținut al site-ului este proprietatea ${bi.companyName} și nu poate fi copiat fără acord.</p><h2>7. Contact</h2><p>Pentru întrebări: <strong>${bi.phone}</strong> sau <strong>${bi.email}</strong></p><p>${bi.legalAddress}</p>`, bi));
});

app.get('/privacy', (req, res) => {
  const bi = getBusinessInfo();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getLegalPage('Politica de Confidențialitate (GDPR)', `<h2>1. Introducere</h2><p>${bi.companyName} respectă confidențialitatea datelor dumneavoastră. Această politică explică ce date colectăm și cum le utilizăm.</p><h2>2. Date colectate</h2><p>Colectăm: nume, prenume, număr de telefon, adresă de email, adresă de livrare pentru comenzi.</p><p>Aceste date sunt colectate doar cu consimțământul dumneavoastră prin formularele de contact și rezervare.</p><h2>3. Scopul colectării</h2><p>Datele sunt utilizate pentru: procesarea rezervărilor, preluarea comenzilor, contactarea clienților, îmbunătățirea serviciilor.</p><h2>4. Protecția datelor</h2><p>Datele sunt protejate prin măsuri tehnice și organizatorice adecvate. Nu vindem și nu transmitem datele către terți.</p><h2>5. Drepturile dumneavoastră (GDPR)</h2><ul><li>Dreptul de acces la date</li><li>Dreptul de rectificare</li><li>Dreptul de ștergere</li><li>Dreptul de portabilitate</li><li>Dreptul de obiecție</li></ul><p>Pentru exercitarea drepturilor: <strong>${bi.email}</strong></p><h2>6. Cookie-uri</h2><p>Utilizăm doar cookie-uri esențiale pentru funcționarea site-ului (preferințe limba, coș de cumpărături). Nu folosim cookie-uri de marketing.</p><h2>7. Date de contact</h2><p><strong>${bi.companyName}</strong></p><p>${bi.legalAddress}</p><p>Email: ${bi.email}</p><p>Telefon: ${bi.phone}</p>`, bi));
});
app.get('/delivery', (req, res) => {
  const bi = getBusinessInfo();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getLegalPage('Politica de Livrare și Retur', `<h2>1. Livrare la domiciliu</h2><p>Oferim livrare în raza ${bi.city}. Costul livrării și timpul de așteptare vor fi comunicate la confirmarea comenzii.</p><p>Comenzile pentru livrare sunt confirmate telefonic înainte de pregătire.</p><h2>2. Anularea rezervărilor</h2><p>Rezervările pot fi anulate gratuit cu minim 24 de ore înainte de data programată.</p><p>Anularea cu mai puțin de 24 de ore poate atrage o taxă de 30% din valoarea pachetului.</p><p>Rezervările anulate cu mai puțin de 3 ore nu sunt rambursabile.</p><h2>3. Schimbarea datei</h2><p>Schimbarea datei petrecerii este posibilă o singură dată, cu minim 48 de ore înainte, în funcție de disponibilitate.</p><h2>4. Reclamații</h2><p>Orice problemă trebuie raportată pe loc personalului sau telefonic la <strong>${bi.phone}</strong>.</p><p>Ne străduim să rezolvăm orice nemulțumire în maximum 24 de ore.</p><h2>5. Contact</h2><p>Email: ${bi.email} | Telefon: ${bi.phone}</p><p>${bi.legalAddress}</p>`, bi));
});


// Business info settings API
app.post('/api/settings/business', authMiddleware, (req, res) => {
  const { company_name, company_address, company_phone, company_email, fiscal_code, legal_address } = req.body;
  const keys = { company_name, company_address, company_phone, company_email, fiscal_code, legal_address };
  for(const [key, value] of Object.entries(keys)) {
    if(value !== undefined) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }
  res.json({ success: true });
});
app.get('/api/settings/business', authMiddleware, (req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key IN ('company_name','company_address','company_phone','company_email','fiscal_code','legal_address')").all();
  const data = {};
  for(const row of rows) data[row.key] = row.value;
  res.json(data);
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
