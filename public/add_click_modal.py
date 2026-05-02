#!/usr/bin/env python3
"""Add click-to-modal functionality to Sky Kids menu."""

with open('index.html', 'r') as f:
    html = f.read()

# Add Modal HTML
modal = '''
    <!-- Product Modal -->
    <div id="productModal" class="fixed inset-0 z-[100] hidden items-center justify-center" style="display:none;">
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
        var m = document.getElementById('productModal');
        document.getElementById('modalImg').src = img || '';
        document.getElementById('modalTitle').textContent = name || '';
        document.getElementById('modalDesc').textContent = desc || '';
        document.getElementById('modalPrice').textContent = price || '';
        document.getElementById('modalWeight').textContent = weight || '';
        var badgeEl = document.getElementById('modalBadge');
        if (badge && badge.trim() !== '') { badgeEl.textContent = badge; badgeEl.classList.remove('hidden'); }
        else { badgeEl.classList.add('hidden'); }
        m.classList.remove('hidden');
        m.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
    function closeProductModal() {
        var m = document.getElementById('productModal');
        m.classList.add('hidden');
        m.style.display = 'none';
        document.body.style.overflow = '';
    }
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeProductModal(); });
    
    // Make menu items clickable
    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('.menu-item').forEach(function(item) {
            item.style.cursor = 'pointer';
            item.addEventListener('click', function(e) {
                var img = this.querySelector('img');
                var h4 = this.querySelector('h4');
                var p = this.querySelector('p');
                var priceEl = this.querySelector('.text-sky-500, .text-sky-600');
                var weightEl = this.querySelector('span.text-xs');
                var badge = this.querySelector('.bg-candy-yellow');
                
                var imgSrc = img ? img.src : '';
                var name = h4 ? h4.textContent.trim() : 'Produs';
                var desc = p ? p.textContent.trim() : '';
                var price = priceEl ? priceEl.textContent.trim() : '';
                var weight = weightEl ? weightEl.textContent.trim() : '';
                var badgeText = badge ? badge.textContent.trim() : '';
                
                openProductModal(imgSrc, name, desc, price, weight, badgeText);
            });
        });
    });
    </script>
'''

html = html.replace('</body>', modal + '</body>')

# Add cursor-pointer to menu items
html = html.replace('class="menu-item ', 'class="menu-item cursor-pointer ')

with open('index.html', 'w') as f:
    f.write(html)

print("Done! Click-to-modal added.")
