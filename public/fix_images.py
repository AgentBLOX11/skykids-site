#!/usr/bin/env python3
"""Precisely update HTML image references for Sky Kids menu."""

import re

with open('index.html', 'r') as f:
    html = f.read()

# STEP 1: Replace ALL CDN base URLs with local poze/ path
html = html.replace(
    'https://media.githubusercontent.com/media/AgentBLOX11/skykids-site/main/public/poze/',
    'poze/'
)

# STEP 2: Fix specific wrong images based on menu item content
# Format: (old_filename, new_filename, reason)

fixes = [
    # --- Sushi individual items (use combo photo) ---
    ('sushi-philadelphia.jpg', 'sushi-combo.jpg', 'Philadelphia uses combo'),
    ('sushi-philadelphia-2.jpg', 'sushi-combo.jpg', 'Philadelphia uses combo'),
    
    # --- Tempura crevete (note: HTML had wrong filename) ---
    ('tempura-creveti.jpg', 'tempura-crevete.jpg', 'Correct filename'),
    
    # --- Sushi sets (375=smaller set, 750=larger) ---
    ('sushi-platter.jpg', 'platou-sushi-375.jpg', 'Mini Set Sushi'),
    ('sushi-platter-2.jpg', 'platou-sushi-375.jpg', 'Mini Set Sushi'),
    ('sushi-platter-3.jpg', 'platou-sushi-750.jpg', 'Family Set Sushi'),
    ('sushi-platter-4.jpg', 'platou-sushi-750.jpg', 'Family Set Sushi'),
    
    # --- Sushi burger ---
    ('sushi-burger.jpg', 'sushi-burger-combo.jpg', 'Sushi burger combo'),
    
    # --- Burger section ---
    # Crispy Black Burger: HTML used platou-skykids.jpg (WRONG)
    ('platou-skykids.jpg', 'crispy-black-burger.jpg', 'Crispy Black Burger'),
    # Clasic Burger: use platou-skykids (the burger platter photo)
    ('platou-skykids-2.jpg', 'platou-skykids.jpg', 'Clasic Burger'),
    # Kids Burger: platou-mini-skykids
    ('platou-mini-skykids.jpg', 'platou-mini-skykids.jpg', 'Kids Burger OK'),
    
    # --- Legume ---
    # Legume la gratar: HTML wrongly used meat-platter.jpg
    ('meat-platter.jpg', 'somon-la-gratar.jpg', 'Legume la gratar - was wrong'),
    # Legume proaspete: no good photo, keep salad-gourmet or remove
    
    # --- Antipasti ---
    ('antipasti-board.jpg', 'antipasti.jpg', 'Antipasti board'),
    
    # --- Pizza items - most used platou-skykids (wrong) ---
    # Margherita
    ('platou-skykids-7.jpg', 'platou-skykids.jpg', 'Margherita - temp'),
    # Quattro formaggi
    ('platou-skykids-8.jpg', 'platou-skykids.jpg', 'Quattro - temp'),
    # Pepperoni
    ('platou-skykids-9.jpg', 'platou-skykids.jpg', 'Pepperoni - temp'),
    # Neapolitana
    ('platou-skykids-10.jpg', 'platou-skykids.jpg', 'Neapolitana - temp'),
    # Carnivora
    ('platou-skykids-11.jpg', 'platou-skykids.jpg', 'Carnivora - temp'),
    # Family pizza (used platou-familie - partially correct)
    ('platou-families.jpg', 'platou-families.jpg', 'Family pizza'),
    # Kids pizza
    ('platou-skykids-14.jpg', 'platou-mini-skykids.jpg', 'Kids pizza'),
    # Capricciosa
    ('platou-skykids-15.jpg', 'platou-skykids.jpg', 'Capricciosa - temp'),
    # Pizza Sky Kids
    ('platou-skykids-16.jpg', 'platou-skykids.jpg', 'Pizza Sky Kids'),
    # Diavola
    ('platou-skykids-17.jpg', 'platou-skykids.jpg', 'Diavola - temp'),
    # Tonno
    ('platou-skykids-18.jpg', 'platou-skykids.jpg', 'Tonno - temp'),
    # Pizza Del Mare
    ('seafood-platter.jpg', 'platou-marin.jpg', 'Pizza Del Mare'),
    
    # --- Paste ---
    ('platou-antipasto.jpg', 'platou-skykids.jpg', 'Carbonara pasta - temp'),  # Was wrong ref
    # Coltusnasi cu branza
    ('platou-skykids-3.jpg', 'platou-skykids.jpg', 'Coltusnasi - temp'),
    # Coltusnasi cu cartofi
    ('platou-skykids-4.jpg', 'platou-skykids.jpg', 'Coltusnasi cartofi - temp'),
    # Clatite dulci
    ('platou-skykids-5.jpg', 'platou-skykids.jpg', 'Clatite dulci - temp'),
    # Clatite sarate
    ('platou-skykids-6.jpg', 'platou-skykids.jpg', 'Clatite sarate - temp'),
    
    # --- Fries & Snacks ---
    ('asorti-cartofi.jpg', 'asorti-cartofi.jpg', 'Assorti cartofi OK'),
    ('aripioare-fries.jpg', 'aripioare-cu-cartofi-bile.jpg', 'Aripi cu cartofi'),
    ('aripioare-fries-2.jpg', 'aripioare-cu-cartofi-bile.jpg', 'Aripi cu cartofi'),
    ('aripioare-fries-3.jpg', 'aripioare-cu-cartofi-bile.jpg', 'Aripi cu cartofi'),
    
    # --- Salate ---
    ('salad-caesar.jpg', 'caesar-cu-pui.jpg', 'Caesar salad'),
    ('salad-prosciutto.jpg', 'salata-gourmet.jpg', 'Gourmet salad'),
    
    # --- Seafood ---
    ('seafood-appetizer.jpg', 'sote.jpg', 'Sote seafood'),
]

# Apply fixes
for old, new, reason in fixes:
    if old != new:
        count = html.count(f'poze/{old}')
        if count > 0:
            html = html.replace(f'poze/{old}', f'poze/{new}')
            print(f"Fixed: {old} -> {new} ({count}x)")

# Save
with open('index.html', 'w') as f:
    f.write(html)

print(f"\nDone! HTML size: {len(html)} chars")
