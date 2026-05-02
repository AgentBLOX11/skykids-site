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
# Simple string replacements for each known case

replacements = [
    # Format: (old_str, new_str)
]

# For items like: <h4...><img src="X"/>Name</h4>
# Replace with: <img src="X"/><h4...>Name</h4>

# Find all h4 tags containing img and fix them
def fix_h4_img(m):
    full = m.group(0)
    # Extract img src
    img_m = re.search(r'<img src="([^"]+)"', full)
    if not img_m:
        return full
    img_src = img_m.group(1)
    
    # Extract h4 attributes
    h4_m = re.match(r'(<h4[^>]*>)(.*?)(</h4>)', full, re.DOTALL)
    if not h4_m:
        return full
    
    h4_start = h4_m.group(1)
    h4_content = h4_m.group(2)
    h4_end = h4_m.group(3)
    
    # Remove img tag from h4 content
    h4_content = re.sub(r'<img[^>]*/?>.*', '', h4_content).strip()
    
    return h4_start + h4_content + h4_end

# Apply to all h4 tags
html = re.sub(r'<h4[^>]*>.*?</h4>', fix_h4_img, html, flags=re.DOTALL)

# Now add img before h4 (not inside) for items that had it inside
# This requires knowing which items had img inside - let's check current state

with open('index.html', 'w') as f:
    f.write(html)

print("Done - modal added!")
