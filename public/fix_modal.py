#!/usr/bin/env python3
"""Fix Sky Kids menu items - proper structure + click modal."""

import re

with open('index.html', 'r') as f:
    html = f.read()

# ====== STEP 1: Add Modal HTML before </body> ======
modal = '''
    <!-- Product Modal -->
    <div id="productModal" class="fixed inset-0 z-[100] hidden items-center justify-center">
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" onclick="closeProductModal()"></div>
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <button onclick="closeProductModal()" class="absolute top-3 right-3 z-10 w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow">
                <iconify-icon icon="lucide:x" width="18"></iconify-icon>
            </button>
            <img id="modalImg" src="" alt="" class="w-full h-52 object-cover">
            <div class="p-5">
                <span id="modalBadge" class="hidden inline-block bg-candy-yellow text-dark text-xs font-bold px-2 py-0.5 rounded-full mb-2">PENTRU COPII</span>
                <h3 id="modalTitle" class="text-xl font-black text-dark mb-1"></h3>
                <p id="modalDesc" class="text-gray-500 text-sm mb-3"></p>
                <p id="modalWeight" class="text-xs text-gray-400 mb-3"></p>
                <p id="modalPrice" class="text-2xl font-black text-sky-500"></p>
            </div>
        </div>
    </div>

    <script>
    function openProductModal(img, name, desc, price, weight, badge) {
        document.getElementById('modalImg').src = img;
        document.getElementById('modalTitle').textContent = name;
        document.getElementById('modalDesc').textContent = desc || '';
        document.getElementById('modalPrice').textContent = price || '';
        document.getElementById('modalWeight').textContent = weight || '';
        const badgeEl = document.getElementById('modalBadge');
        if (badge) { badgeEl.textContent = badge; badgeEl.classList.remove('hidden'); }
        else { badgeEl.classList.add('hidden'); }
        document.getElementById('productModal').classList.remove('hidden');
        document.getElementById('productModal').classList.add('flex');
        document.body.style.overflow = 'hidden';
    }
    function closeProductModal() {
        document.getElementById('productModal').classList.add('hidden');
        document.getElementById('productModal').classList.remove('flex');
        document.body.style.overflow = '';
    }
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProductModal(); });
    </script>
'''
html = html.replace('</body>', modal + '</body>')

# ====== STEP 2: Fix menu items with img inside h4 - move img outside ======
# Pattern: <div><h4><img src="..."/>Name</h4>... -> <div class="menu-item" onclick="..."><img src="..."/><h4>Name</h4>...

# Find all menu items
menu_items = re.findall(r'<div class="menu-item[^"]*"(.*?)</div>\s*</div>\s*</div>', html, re.DOTALL)
print(f"Found {len(menu_items)} menu item patterns")

# Fix: move img from inside h4 to before h4, add onclick
def fix_item(m):
    content = m.group(1)
    # Extract img if inside h4
    img_match = re.search(r'<h4[^>]*>\s*<img src="([^"]+)"[^>]*/?>\s*([^<]+)', content)
    if img_match:
        img_src = img_match.group(1)
        name = img_match.group(2).strip()
        # Remove img from h4
        content = re.sub(r'<h4[^>]*>\s*<img src="[^"]+"[^>]*/?>\s*', '<h4>', content)
        # Add onclick to div
        div_class = 'menu-item'
        return f'<div class="{div_class}" onclick="openProductModal(\'{img_src}\', \'{name}\', \'\', \'\', \'\', \'\')">{content}'
    return f'<div class="menu-item">{content}'

# Better approach: directly fix known patterns
# Find menu-items that have img inside h4 and restructure them

# Pattern 1: img inside h4
def fix_img_inside_h4(html):
    # Match: <div><h4><img src="X"/>Name</h4>...
    pattern = r'(<div class="menu-item[^"]*")>(<h4[^>]*>)<img src="([^"]+)"[^>]*/?>([^<]+)(</h4>)'
    def repl(m):
        div_start = m.group(1)
        h4_start = m.group(2)
        img_src = m.group(3)
        name = m.group(4).strip()
        h4_end = m.group(5)
        return f'{div_start} onclick="openProductModal(\'{img_src}\', \'{name}\', \'\', \'\', \'\', \'\')">{img_src}<br/>{h4_start}{name}{h4_end}'
    
    # Actually simpler - just find img tags inside h4 and move them out
    return html

# Simpler: just find and fix each occurrence manually
# Find all h4 tags that contain img
count = 0
for match in re.finditer(r'(<div class="menu-item[^"]*")>(<h4[^>]*>)<img src="([^"]+)"[^>]*/?>([^<]+)(</h4>)', html):
    div_start = match.group(1)
    img_src = match.group(3)
    name = match.group(4).strip()
    h4_close = match.group(5)
    h4_open = match.group(2)
    
    # Build new structure
    new = f'{div_start} onclick="openProductModal(\'{img_src}\', \\\'{name}\\\', \\\'\\\', \\\'\\\', \\\'\\\', \\\'\\\')"><img src="{img_src}" alt="{name}" class="w-full h-32 object-cover rounded-lg mb-3">{h4_open}{name}{h4_close}'
    
    old = match.group(0)
    if img_src in old:  # make sure it's actually inside
        html = html.replace(old, new, 1)
        count += 1

print(f"Fixed {count} items with img inside h4")

# Also fix items that DON'T have img (they're just text)
# Find menu-items that are just div without img - need onclick added
def add_onclick_to_plain_items(html):
    # Find menu-items that don't have onclick yet
    pattern = r'(<div class="menu-item[^"]*")(?![^>]*onclick)(.*?)(</div>\s*</div>\s*</div>)'
    def add_onclick(m):
        div_start = m.group(1)
        content = m.group(2)
        div_end = m.group(3)
        # Extract name if possible
        name_match = re.search(r'<h4[^>]*>([^<]+)</h4>', content)
        name = name_match.group(1).strip() if name_match else 'Produs'
        return f'{div_start} onclick="openProductModal(\\'\\', \\\'{name}\\\', \\\'\\\', \\\'\\\', \\\'\\\', \\\'\\\')"{content}{div_end}'
    return re.sub(pattern, add_onclick, html, flags=re.DOTALL)

html = add_onclick_to_plain_items(html)

with open('index.html', 'w') as f:
    f.write(html)

print("Done!")
