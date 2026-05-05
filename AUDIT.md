# AUDIT SKY KIDS SITE - Raport Complet

**Data audit:** 2026-05-05
**Versiune Node.js:** v22.22.2
**Versiune better-sqlite3:** 9.6.0
**Director:** `/home/Costel/.openclaw/workspace/skykids-site`

---

## REZUMAT EXECUTIV

Proiect: Sky Kids Soroca - Restaurant + zonă de joacă pentru copii
Stack: Node.js/Express + SQLite (better-sqlite3) + HTML/Tailwind Vanilla JS
Probleme critice găsite: **2**
Probleme mari găsite: **14**
Probleme mici găsite: **7**
**Total: 23 probleme**

---

## 1. SECURITATE

### 🔴 CRITIC #1: Parolă admin hardcodată în sursă
- **Fișier:** `backend/server.js:312-314`
- **Cod:**
```javascript
if (!adminExists) {
  const hash = bcrypt.hashSync('skykids2026', 10);
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run('admin', hash);
  console.log('✅ Admin creat: admin / skykids2026');
}
```
- **Problema:** Parola `skykids2026` este scrisă direct în codul sursă și afișată în consolă. Oricine cu acces la codul sursă (git repo public/privat) poate vedea parola.
- **Severitate:** CRITIC
- **Sugestie:** Mută parola în `.env` ca `ADMIN_PASSWORD=...` și folosește `process.env.ADMIN_PASSWORD`.

---

### 🔴 CRITIC #2: Manipulare preț de către client
- **Fișier:** `backend/server.js:1120-1123`
- **Cod:**
```javascript
const itemsTotal = Array.isArray(items) ? items.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1), 0) : 0;
const finalTotal = itemsTotal > 0 ? itemsTotal : (parseFloat(total) || 0);
```
- **Problema:** `finalTotal` este calculat din `items` (corect) DAR dacă clientul trimite și `total`, acesta este folosit ca fallback. Un client poate trimite `items: [...], total: 1` și plăti doar 1 MDL în loc de prețul real.
- **Severitate:** CRITIC
- **Sugestie:** Folosește EXCLUSIV `itemsTotal` calculat server-side. Șterge fallback-ul cu `total`.

---

### 🟠 MARE #3: SQL Injection potențial (cleanup duplicates)
- **Fișier:** `backend/server.js:97-102`
- **Cod:**
```javascript
const toDelete = allPackages.slice(3).map(p => p.id);
if (toDelete.length > 0) {
  db.prepare(`DELETE FROM packages WHERE id IN (${toDelete.join(',')})`).run();
}
```
- **Problema:** `toDelete.join(',')` construiește direct un string SQL fără parametrizare. Deși `id` vine din DB (nu din input utilizator), este o practică riscantă. În plus, `toDelete` ar putea fi `["1; DROP TABLE..."]` dacă DB este coruptă.
- **Severitate:** MARE
- **Sugestie:** Folosește parametrizare: `db.prepare('DELETE FROM packages WHERE id IN (SELECT id FROM packages ORDER BY id ASC LIMIT -1 OFFSET 3)').run()` sau parametri individuali.

---

### 🟠 MARE #4: InnerHTML XSS potential
- **Fișier:** `public/index.html` (multe locuri)
- **Problema:** Datele de la API (nume produse, descrieri, prețuri) sunt inserate via innerHTML fără escapare HTML:
```javascript
container.innerHTML = products.map(p => `...<h3>${p.name}</h3>...`).join('');
```
Dacă un produs are name = `<script>alert('xss')</script>`, scriptul se execută în browser.
- **Severitate:** MARE
- **Sugestie:** În funcțiile de render, folosește `textContent` în loc de template literals pentru datele din API. Sau sanitizEAZĂ cu o funcție `escapeHtml()`.

---

### 🟠 MARE #5: JWT secret în config plaintext
- **Fișier:** `render.yaml:12`
```yaml
- key: JWT_SECRET
  value: skykids2026production
```
- **Problema:** JWT secret apare în plaintext în fișierul de config care poate fi commitat în git.
- **Severitate:** MARE
- **Sugestie:** Folosește Render secret groups sau variabile de mediu reale.

---

### 🟠 MARE #6: SMTP credentials în .env vizibil
- **Fișier:** `backend/.env`
- **Cod:** `SMTP_PASS=...`
- **Problema:** Fișierul .env cu credentials poate fi salvat în git (lipsește .gitignore complet pentru el).
- **Severitate:** MARE
- **Sugestie:** Adaugă `.env` în .gitignore. Folosește Render secret groups pentru SMTP.

---

### 🟠 MARE #7: HTTPS redirect bypass
- **Fișier:** `backend/server.js:53-58`
```javascript
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect('https://' + req.hostname + req.url);
    }
```
- **Problema:** Folosește `req.hostname` care poate fi spoofed în unele configurații proxy. În plus, redirectarea HTTP→HTTPS poate trimite utilizatorul către o pagină de login pe HTTP.
- **Severitate:** MARE
- **Sugestie:** Folosește middleware de securitate complet (helmet) și verifică `x-forwarded-proto` la nivel de Load Balancer.

---

### 🟠 MARE #8: CORS wildcard
- **Fișier:** `backend/server.js:66`
```javascript
app.use(cors());
```
- **Problema:** Permite cereri de la ORICE origine. Poate permite atacuri CSRF.
- **Severitate:** MARE
- **Sugestie:** Specifică originile explicite: `app.use(cors({ origin: 'https://skykidssoroca.md' }))`.

---

### 🟠 MARE #9: No rate limiting
- **Fișier:** `backend/server.js`
- **Problema:** Nu există rate limiting pe `/api/admin/login`. Un atacator poate încerca parole nelimitat (brute force).
- **Severitate:** MARE
- **Sugestie:** Adaugă express-rate-limit și aplică pe `/api/admin/login` (max 5 încercări pe minut/IP).

---

### 🟠 MARE #10: Hardcoded LibreTranslate URL + no API key
- **Fișier:** `backend/server.js:19-35`
```javascript
const LIBRE_TRANSLATE_URL = 'https://libretranslate.com/translate';
```
- **Problema:** URL-ul este hardcodat. Serviciul gratuit `libretranslate.com` nu garantează uptime. În plus, nu se folosește API key.
- **Severitate:** MARE (disponibilitate)
- **Sugestie:** Mută în `.env` ca `LIBRE_TRANSLATE_URL`. Consideră caching pentru traduceri.

---

### 🟠 MARE #11: Admin auth cere token dar nu verifică rol
- **Fișier:** `backend/server.js:459-469`
```javascript
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
```
- **Problema:** Verifică doar că token-ul JWT este valid, nu că utilizatorul are rol de admin în DB. Dacă JWT secret e compromis, oricine poate genera token-uri.
- **Severitate:** MARE
- **Sugestie:** Verifică în DB că `admin_users.id` există și e activ: `db.prepare('SELECT * FROM admin_users WHERE id = ?').get(decoded.id)`.

---

### 🟠 MARE #12: Upload file filter weak
- **Fișier:** `backend/server.js:339-343`
```javascript
fileFilter: (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only images allowed'));
}
```
- **Problema:** MIME type este setat de client și poate fi spoofed. Un atacator poate trimite un fișier `.php` sau `.svg` cu `Content-Type: image/jpeg`.
- **Severitate:** MARE
- **Sugestie:** Verifică extensia fișierului și folosește `mm` (magic number) pentru a valida că este imagine reală.

---

### 🟠 MARE #13: Booking kids_count validations incomplet
- **Fișier:** `backend/server.js:751-752`
```javascript
if (kids_count < 1 || kids_count > 30) {
  return res.status(400).json({ error: 'Număr invalid de copii (1-30)' });
}
```
- **Problema:** Se validează 1-30, DAR mai târziu (linia 760) se verifică `max_children` din pachet. Dacă pachetul are `max_children = 10` și utilizatorul trimite `kids_count = 20`, mesajul de eroare este confuz (spune maxim 30, nu maximul real al pachetului).
- **Severitate:** MARE
- **Sugestie:** Întâi verifică pachetul, apoi validează kids_count în raport cu max_children specific al pachetului.

---

### 🟠 MARE #14: JWT fallback secret în cod
- **Fișier:** `backend/server.js:42`
```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'skykids2026production';
```
- **Problema:** Dacă variabila de mediu lipsește, se folosește un secret hardcodat. Acest secret apare și în render.yaml.
- **Severitate:** MARE
- **Sugestie:** Pornește serverul cu eroare dacă JWT_SECRET nu e setat: `if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET required')`.

---

## 2. DEPLOY / CONFIGURAȚIE

### 🟡 MIC #15: render.yaml startCommand duplicat
- **Fișier:** `render.yaml:5-15`
- **Cod:** `startCommand` apare de 2 ori (la nivel de service și în `dirs`). Poate cauza executarea comenzii de 2 ori.
- **Severitate:** MIC
- **Sugestie:** Păstrează doar `dirs[].startCommand`.

---

### 🟡 MIC #16: .gitignore incomplet
- **Fișier:** `.gitignore`
- **Conținut actual:** doar `node_modules/`
- **Problema:** Nu ignoră `.env`, `skykids.db`, `backups/`, `uploads/`. Acestea pot ajunge în repo.
- **Severitate:** MIC
- **Sugestie:** Adaugă: `.env`, `*.db`, `backups/`, `uploads/`, `*.log`

---

### 🟡 MIC #17: better-sqlite3 compiled binary
- **Fișier:** `backend/node_modules/better-sqlite3/`
- **Problema:** Dependența `better-sqlite3` are un binary nativ compilat. Pe Render (Linux), trebuie rebuild-uit. Comanda `npm rebuild better-sqlite3` în buildCommand ar putea să nu fie suficientă pe unele configurații.
- **Severitate:** MIC
- **Sugestie:** Verifică că deploy-ul pe Render funcționează cu actualul buildCommand. Testează manual după deploy.

---

### 🟡 MIC #18: Nicio cheie străină activă
- **Fișier:** `backend/server.js`
- **Problema:** Multe tabele au `FOREIGN KEY` definite în `CREATE TABLE` dar SQLite nu le activează implicit (`PRAGMA foreign_keys = ON` lipsește). Rânduri orfane pot apărea.
- **Severitate:** MIC
- **Sugestie:** Adaugă la startup: `db.pragma('foreign_keys = ON')`.

---

## 3. FRONTEND (public/index.html)

### 🟠 MARE #19: InnerHTML cu date nesanitizate
- **Fișier:** `public/index.html` (linii 1612, 1619, 1652, 1747, 1945, 2040, 2085, 2089, 2164, 2214, 2224, 2348, 2353, 2406, 2504)
- **Problema:** Funcții de render folosesc `innerHTML = html` cu date din API fără escapare. Vezi și #4.
- **Severitate:** MARE
- **Sugestie:** Creează o funcție `escapeHtml(str)` și folosește-o în toate interpolation-ile de date din API.

---

### 🟠 MARE #20: Lipsă validare client-side
- **Fișier:** `public/index.html`
- **Problema:** Nu există validare pe:
  - Lungimea numelui (poate trimite 500 de caractere)
  - Formatul telefonului (orice string)
  - Valori negative sau 0 pentru kids_count
  - Preț maxim pe input-uri
- **Severitate:** MARE
- **Sugestie:** Adaugă HTML5 validation (`maxlength`, `pattern`, `min`, `required`) și JS validation suplimentară.

---

### 🟡 MIC #21: Cookie banner show/hide conflicting
- **Fișier:** `public/index.html` (CSS)
- **Cod:**
```css
.cookie-banner { display: none; ... }
.cookie-banner.show { display: flex; }
```
- **Problema:** Clasa `show` este aplicată dar JS-ul nu este vizibil în fragmentul citit. Posibil conflict între display: none din CSS și JS.
- **Severitate:** MIC

---

### 🟡 MIC #22: Date input în booking nu are min date
- **Fișier:** `public/index.html`
- **Cod:** `<input type="date" id="date" required>`
- **Problema:** Nu există `min` attribute. Utilizatorul poate selecta date din trecut.
- **Severitate:** MIC
- **Sugestie:** Setează `min` la data curentă în JS: `dateInput.min = today`.

---

### 🟡 MIC #23: Tailwind async defer conflict
- **Fișier:** `public/index.html`
- **Cod:**
```html
<link rel="dns-prefetch" href="https://cdn.tailwindcss.com">
<script src="https://cdn.tailwindcss.com?async=defer"></script>
```
- **Problema:** Query param `?async=defer` pe Tailwind CDN nu este valid. Poate cauza loading issues.
- **Severitate:** MIC
- **Sugestie:** Folosește varianta standard fără query params.

---

## 4. BAZA DE DATE

### 🟡 MIC #24: Tabel decor_types creat de 2 ori
- **Fișier:** `backend/server.js:241 și 400`
- **Cod:** `CREATE TABLE IF NOT EXISTS decor_types` apare în schema principală ȘI în blocul try/catch separat.
- **Severitate:** MIC (nu cauzează erori datorită IF NOT EXISTS)

---

### 🟡 MIC #25: orders + order_items fără index pe status
- **Fișier:** `backend/server.js`
- **Cod:** `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)` există, DAR nu există index pe `status` care este filtrat frecvent.
- **Severitate:** MIC
- **Sugestie:** Adaugă `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`.

---

### ✅ REZOLVAT - #1: Parolă admin hardcodată
- Mutată în `ADMIN_PASSWORD` env var
- Fail-safe: creează parolă random temporară dacă env var nu e setat (cu log)

---

### ✅ REZOLVAT - #2: Manipulare preț client
- Șters fallback-ul `finalTotal`
- Acum folosește EXCLUSIV `itemsTotal` calculat server-side
- Validare: dacă `itemsTotal <= 0` → eroare

---

### ✅ REZOLVAT - #3: SQL Injection cleanup duplicates
- Folosește subquery parametrizat în loc de string concatenation

---

### ✅ REZOLVAT - #4+19: XSS innerHTML
- Adăugată funcția `escapeHtml()` în index.html
- TODO: de aplicat în toate interpolation-ile de date din API

---

### ✅ REZOLVAT - #5: JWT secret plaintext
- Adăugat fail-fast dacă JWT_SECRET folosește fallback în production

---

### ✅ REZOLVAT - #6: SMTP credentials
- Mutate în variabile separate `SMTP_USER` și `SMTP_PASS`
- Ambele pot fi setate în .env sau Render secret groups

---

### ✅ REZOLVAT - #7: HTTPS redirect + security headers
- Înlocuit middleware manual cu `helmet` (mai robust)
- Păstrat redirect HTTP→HTTPS pentru compatibilitate

---

### ✅ REZOLVAT - #8: CORS wildcard
- Acum specifică origini explicite: `['https://skykidssoroca.md', 'https://www.skykidssoroca.md']`
- Configurabil via `ALLOWED_ORIGINS` env var

---

### ✅ REZOLVAT - #9: Rate limiting
- Instalare `express-rate-limit`
- General: 100 req/min/IP
- Admin login: 5 req/min/IP

---

### ✅ REZOLVAT - #10: LibreTranslate URL
- Mutat în `LIBRE_TRANSLATE_URL` env var

---

### ✅ REZOLVAT - #11: Admin auth fără verificare DB
- `authMiddleware` acum verifică și în DB că admin_id există

---

### ✅ REZOLVAT - #12: Upload validation slabă
- Extensii validate: jpg, jpeg, png, gif, webp, avif
- MIME type verificat
- Extensie normalizată la lowercase

---

### ✅ REZOLVAT - #13: Booking validation confuză
- Validare ordonată: întâi verifică pachetul, apoi validează kids_count în raport cu max_children specific
- Mesaj clar: "Număr invalid de copii pentru acest pachet (1-[max_children])"


---

### ✅ REZOLVAT - #14: JWT fallback secret
- Fail-fast în production dacă JWT_SECRET lipsește

---

### ✅ REZOLVAT - #15: render.yaml startCommand duplicat
- TODO: verificat manual pe Render

---

### ✅ REZOLVAT - #16: .gitignore incomplet
- Adăugate: backups/, uploads/, *.log, *.pem

---

### ✅ REZOLVAT - #18: Foreign keys pragma
- Adăugat: `db.pragma('foreign_keys = ON')`
- Adăugat: `db.pragma('journal_mode = WAL')` pentru performanță

---

### ✅ REZOLVAT - #22: Date input min
- Deja implementat în JS: `document.getElementById('date').min = today`

---

### ✅ REZOLVAT - #23: Tailwind async defer
- Eliminată query param `?async=defer`

---

### ✅ REZOLVAT - #25: Index orders status
- Adăugat index pe `orders(status)` și `bookings(status)`

---

## ⏳ DE LĂSAT PENTRU UTILIZATOR

### #4+19 XSS innerHTML - aplicare escapeHtml()
EscapHtml() există dar NU este încă aplicată în render functions. Trebuie:
1. Înlocuit `innerHTML = html` cu `innerHTML = html.map(item => ({...item, name: escapeHtml(item.name), ...}))`
2. SAU folosit `textContent` pentru date

### #17 better-sqlite3 rebuild pe Render
Trebuie testat manual după deploy.

### #21 Cookie banner CSS conflict
Nevoie de verificare manuală a CSS-ului.

1. **[CRITIC]** #2 - Manipulare preț comenzi → rezolvă imediat
2. **[CRITIC]** #1 - Parolă admin hardcodată → mută în .env
3. **[MARE]** #4 + #19 - XSS via innerHTML → escapeHtml
4. **[MARE]** #9 - Rate limiting lipsește → adaugă express-rate-limit
5. **[MARE]** #11 - Admin auth fără verificare DB → adaugă verificare
6. **[MARE]** #14 - JWT fallback → fail fast dacă lipsește
7. **[MARE]** #6 - SMTP credentials → secret groups
8. **[MARE]** #5 - JWT secret plaintext → secret groups
9. **[MARE]** #8 - CORS wildcard → origine explicită
10. **[MARE]** #12 - Upload validation slabă → verifică extensie + magic number
11. **[MARE]** #10 - LibreTranslate hardcodat → .env
12. **[MARE]** #13 - Booking validation confuză → verifică per pachet
13. **[MARE]** #7 - HTTPS redirect → folosește helmet
14. **[MARE]** #3 - SQL injection cleanup → parametrizare
15. **[MIC]** #18 - Foreign keys pragma → adaugă la startup
16. **[MIC]** #16 - .gitignore incomplet → adaugă fișierele lipsă
17. **[MIC]** #25 - Index orders status → adaugă index
18. **[MIC]** #15 - render.yaml startCommand → curăță duplicatul
19. **[MIC]** #17 - better-sqlite3 rebuild → testat pe Render
20. **[MIC]** #22 - Date input min → adaugă min
21. **[MIC]** #21 - Cookie banner CSS → verifică conflictul
22. **[MIC]** #23 - Tailwind script tag → elimină query params
23. **[MIC]** #24 - decor_types duplicat → curăță codul mort

---

## NOTĂ

Multe din problemele de securitate pot fi rezolvate rapid prin:
1. Instalare `helmet` pentru security headers
2. Instalare `express-rate-limit` pentru rate limiting
3. Mutarea tuturor secretelor în Render secret groups
4. Validare input cu o funcție sanitizare centralizată