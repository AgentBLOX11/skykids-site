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
        var badgeEl = document.getElementById('modalBadge');
        if (badge && badge !== '') { badgeEl.textContent = badge; badgeEl.classList.remove('hidden'); }
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
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeProductModal(); });
    </script>
'''
html = html.replace('</body>', modal + '</body>')

# ====== STEP 2: Fix menu items that have img inside h4 ======
# Pattern: <div class="menu-item..."><h4...><img src="X"/>Name</h4>...
# Should become: <div class="menu-item..." onclick="..."><img src="X"/>...<h4>Name</h4>...

count = 0
def fix_img_h4(match):
    global html, count
    div_start = match.group(1)
    h4_start = match.group(2)
    img_src = match.group(3)
    name = match.group(4).strip()
    h4_end = match.group(5)
    
    # Build replacement: move img outside h4, add onclick to div
    new = (f'{div_start} onclick="openProductModal(\\'{img_src}\\', \\'{name}\\', \\'\\', \\'\\', \\'\\', \\'\\')">'
           f'<img src="{img_src}" alt="{name}" class="w-full h-32 object-cover rounded-lg mb-3">'
           f'{h4_start}{name}{h4_end}')
    
    old = match.group(0)
    html = html.replace(old, new, 1)
    count += 1
    return new

# Find all occurrences of img inside h4
pattern = r'(<div class="menu-item[^"]*")>(<h4[^>]*>)<img src="([^"]+)"[^>]*/?>([^<]+)(</h4>)'
re.sub(pattern, fix_img_h4, html)

print(f"Fixed {count} items with img inside h4")

# ====== STEP 3: Add cursor pointer to all menu items ======
html = html.replace('class="menu-item ', 'class="menu-item cursor-pointer ')

with open('index.html', 'w') as f:
    f.write(html)

print("Done! Modal added and menu items fixed.")
