#!/usr/bin/env python3
"""Update HTML image references to use correct local files."""

import re

with open('index.html', 'r') as f:
    html = f.read()

# Mapping: old CDN filename -> new local filename
# Only items that NEED changing are listed
replacements = {
    # SUSHI - individual items (combo photo contains all 3)
    'sushi-philadelphia.jpg': 'sushi-combo.jpg',
    'sushi-philadelphia-2.jpg': 'sushi-combo.jpg',
    'tempura-creveti.jpg': 'tempura-crevete.jpg',  # Note: was wrong filename
    
    # SUSHI SETS
    'sushi-platter.jpg': 'platou-sushi-375.jpg',
    'sushi-platter-2.jpg': 'platou-sushi-375.jpg',
    'sushi-platter-3.jpg': 'platou-sushi-750.jpg',
    'sushi-platter-4.jpg': 'platou-sushi-750.jpg',
    
    # SUSHI BURGER
    'sushi-burger.jpg': 'sushi-burger-combo.jpg',
    
    # BURGER
    'platou-skykids.jpg': 'crispy-black-burger.jpg',  # Was wrong image
    'platou-skykids-2.jpg': 'platou-skykids.jpg',  # Clasic Burger - use skykids
    'platou-mini-skykids.jpg': 'platou-mini-skykids.jpg',  # Kids Burger
    
    # LEGUME
    'meat-platter.jpg': 'somon-la-gratar.jpg',  # Was wrongly used for Legume la gratar
    'salad-gourmet.jpg': 'salata-gourmet.jpg',
    
    # ANTIPASTI
    'antipasti-board.jpg': 'antipasti.jpg',
    
    # PIZZA - fix wrong references
    'platou-skykids-3.jpg': 'platou-skykids.jpg',  # Carbonara - use skykids as temp
    'platou-skykids-4.jpg': 'platou-skykids.jpg',  # Colțunași - wrong
    'platou-skykids-5.jpg': 'platou-skykids.jpg',  # Clătite - wrong  
    'platou-skykids-6.jpg': 'platou-skykids.jpg',  # Clătite - wrong
    'platou-skykids-7.jpg': 'platou-skykids.jpg',  # Margherita - wrong
    'platou-skykids-8.jpg': 'platou-skykids.jpg',  # Quattro - wrong
    'platou-skykids-9.jpg': 'platou-skykids.jpg',  # Pepperoni - wrong
    'platou-skykids-10.jpg': 'platou-skykids.jpg',  # Neapolitana - wrong
    'platou-skykids-11.jpg': 'platou-skykids.jpg',  # Carnivora - wrong
    'platou-families.jpg': 'platou-families.jpg',
    'platou-skykids-14.jpg': 'platou-skykids.jpg',  # Capricciosa - wrong
    'platou-skykids-15.jpg': 'platou-skykids.jpg',  # Carbonara - wrong
    'platou-skykids-17.jpg': 'platou-skykids.jpg',  # Diavola - wrong
    'platou-skykids-18.jpg': 'platou-skykids.jpg',  # Tonno - wrong
    'seafood-platter.jpg': 'platou-marin.jpg',  # Pizza Del Mare
    
    # FRIES & SNACKS - fix Crispy 
    'asorti-cartofi.jpg': 'asorti-cartofi.jpg',  # Correct for Assorti
    'aripioare-fries.jpg': 'aripioare-cu-cartofi-bile.jpg',
    'aripioare-fries-2.jpg': 'aripioare-cu-cartofi-bile.jpg',
    'aripioare-fries-3.jpg': 'aripioare-cu-cartofi-bile.jpg',
    'aripioare.jpg': 'aripioare.jpg',  # Aripioare单独
    
    # SALATE
    'salad-caesar.jpg': 'caesar-cu-pui.jpg',
    'salad-prosciutto.jpg': 'salata-gourmet.jpg',  # Was using prosciutto salad for all gourmet
    
    # SEAFOOD
    'seafood-appetizer.jpg': 'sote.jpg',  # Sote
    
    # CARNE & PLATOURI
    'platou-carne.jpg': 'platou-families.jpg',
    'platou-carne-2.jpg': 'platou-families.jpg',
    'platou-carne-3.jpg': 'platou-families.jpg',
}

# Count changes
changes_made = 0
for old, new in replacements.items():
    if old != new:
        # Replace CDN URL with local path
        old_url = f'https://media.githubusercontent.com/media/AgentBLOX11/skykids-site/main/public/poze/{old}'
        new_path = f'poze/{new}'
        if old_url in html:
            html = html.replace(old_url, new_path)
            changes_made += 1

print(f"Replaced {changes_made} CDN URLs with local paths")

# Now also fix any remaining poze/ references to point to local
# The HTML may have poze/ references that need to be made relative
html = html.replace(
    'https://media.githubusercontent.com/media/AgentBLOX11/skykids-site/main/public/poze/',
    'poze/'
)

# Remove any duplicate references that might have been created
# Also ensure no leftover CDN URLs for poze files

with open('index.html', 'w') as f:
    f.write(html)

print("HTML updated successfully!")
print(f"Total size: {len(html)} chars")
