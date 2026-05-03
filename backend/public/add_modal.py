#!/usr/bin/env python3
"""Fix menu item structure and add click-to-view modal."""

import re

with open('index.html', 'r') as f:
    html = f.read()

# Add modal HTML before </body>
modal_html = '''
    <!-- Product Detail Modal -->
    <div id="productModal" class="fixed inset-0 z-[100] hidden">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick="closeProductModal()"></div>
        <div class="absolute inset-4 md:inset-10 lg:inset-20 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <button onclick="closeProductModal()" class="absolute top-4 right-4 z-10 w-10 h-10 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-lg transition-all">
                <iconify-icon icon="lucide:x" width="20"></iconify-icon>
            </button>
            <div class="flex-1 overflow-y-auto">
                <div class="md:flex h-full">
                    <div class="md:w-1/2 bg-gray-100 relative">
                        <img id="modalImage" src="" alt="" class="w-full h-48 md:h-full object-cover">
                    </div>
                    <div class="md:w-1/2 p-6 md:p-8 flex flex-col">
                        <div class="flex-1">
                            <span id="modalBadge" class="inline-block bg-candy-yellow text-dark text-xs font-bold px-3 py-1 rounded-full mb-3 hidden">PENTRU COPII</span>
                            <h2 id="modalTitle" class="text-2xl md:text-3xl font-black text-dark mb-2"></h2>
                            <p id="modalDesc" class="text-gray-500 mb-4"></p>
                            <p id="modalWeight" class="text-sm text-gray-400 mb-6"></p>
                        </div>
                        <div class="border-t pt-4">
                            <p class="text-xs text-gray-400 mb-1">PREȚ</p>
                            <p id="modalPrice" class="text-3xl font-black text-sky-500"></p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
    let currentProduct = null;

    function openProductModal(name, desc, price, weight, image, badge) {
        currentProduct = { name, desc, price, weight, image, badge };
        document.getElementById('modalTitle').textContent = name;
        document.getElementById('modalDesc').textContent = desc || '';
        document.getElementById('modalPrice').textContent = price || '';
        document.getElementById('modalWeight').textContent = weight || '';
        document.getElementById('modalImage').src = image || '';
        
        const badgeEl = document.getElementById('modalBadge');
        if (badge) {
            badgeEl.textContent = badge;
            badgeEl.classList.remove('hidden');
        } else {
            badgeEl.classList.add('hidden');
        }
        
        document.getElementById('productModal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeProductModal() {
        document.getElementById('productModal').classList.add('hidden');
        document.body.style.overflow = '';
    }

    // Close on ESC
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeProductModal();
    });
    </script>
'''

# Insert modal before </body>
html = html.replace('</body>', modal_html + '</body>')

# Now fix menu item structure - wrap img outside h4 and add onclick
# Pattern: <div><h4><img src="..."/>Name</h4><p>desc</p></div>
# Should become: <div class="menu-item" onclick="..."><img src="..."/>Name</h4><p>desc</p></div>

def fix_menu_item(match):
    full = match.group(0)
    # Extract img if present inside h4
    img_match = re.search(r'<img src="([^"]+)"[^>]*>', full)
    img_inside = img_match.group(0) if img_match else ''
    img_src = img_match.group(1) if img_match else ''
    
    # Extract h4 content (without img)
    h4_match = re.search(r'<h4[^>]*>(.*?)</h4>', full, re.DOTALL)
    if h4_match:
        h4_content = h4_match.group(1)
        # Remove img tag from h4 content
        h4_content = re.sub(r'<img[^>]+/>', '', h4_content)
        h4_content = h4_content.strip()
    else:
        h4_content = ''
    
    # Extract p (description)
    p_match = re.search(r'<p[^>]*>(.*?)</p>', full, re.DOTALL)
    desc = p_match.group(1).strip() if p_match else ''
    
    # Extract price - look for span with price
    price_match = re.search(r'(\d+)\s*lei', full)
    price = price_match.group(0) if price_match else ''
    
    # Extract weight
    weight_match = re.search(r'(\d+)g', full)
    weight = weight_match.group(0) if weight_match else ''
    
    # Check for badge
    badge_match = re.search(r'PENTRU COPII', full)
    badge = 'PENTRU COPII' if badge_match else ''
    
    # Check for no-image items (h4 without img inside)
    has_img_outside = 'src="poze/' in full and img_inside == ''
    
    return full  # Return unchanged for now - we'll handle via JS approach

# Use a simpler approach - add click handlers via JS after page load
# Add a script that converts menu items to clickable

click_handler_script = '''
<script>
// Make menu items clickable
document.addEventListener('DOMContentLoaded', function() {
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.style.cursor = 'pointer';
        item.addEventListener('click', function(e) {
            // Find the img, h4, p elements
            const img = this.querySelector('img');
            const h4 = this.querySelector('h4');
            const p = this.querySelector('p.text-gray-400');
            const priceSpan = this.querySelector('.text-sky-500.font-bold');
            const weightSpan = this.querySelector('span.text-gray-300');
            const badge = this.querySelector('.bg-candy-yellow');
            
            let name = h4 ? h4.textContent.replace(img ? img.outerHTML : '', '').trim() : '';
            let desc = p ? p.textContentContent : '';
            let price = priceSpan ? priceSpan.textContent : '';
            let weight = weightSpan ? weightSpan.textContent : '';
            let image = img ? img.src : '';
            let badgeText = badge ? 'PENTRU COPII' : '';
            
            if (name) openProductModal(name, desc, price, weight, image, badgeText);
        });
    });
});
</script>
'''

# Remove any existing duplicate click handler
html = re.sub(r'<script>// Make menu items.*?</script>', '', html, flags=re.DOTALL)
html = html.replace('</body>', click_handler_script + '</body>')

with open('index.html', 'w') as f:
    f.write(html)

print("Modal added and click handlers prepared!")
