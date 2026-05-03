#!/usr/bin/env python3
"""Fix all Sky Kids menu image references properly."""

import re

with open('index.html', 'r') as f:
    html = f.read()

# Available photos in poze folder
available = [
    'antipasti.jpg', 'aripioare-cu-cartofi-bile.jpg', 'aripioare.jpg',
    'asorti-cartofi.jpg', 'caesar-cu-pui.jpg', 'cartofi-bilute.jpg',
    'cartofi-pai-2.jpg', 'cartofi-pai-cu-aripioare.jpg', 'cartofi-pai-cu-nughete.jpg',
    'cartofi-pai.jpg', 'clatite-dulci.jpg', 'crispy-black-burger.jpg',
    'friptura.jpg', 'mozzarella-sticks.jpg', 'platou-asorti.jpg',
    'platou-carnati.jpg', 'platou-familie.jpg', 'platou-marin.jpg',
    'platou-mini-skykids.jpg', 'platou-skykids.jpg', 'platou-sushi-375.jpg',
    'platou-sushi-750.jpg', 'salata-burrata.jpg', 'salata-gourmet.jpg',
    'somon-la-gratar.jpg', 'sote.jpg', 'steak-pui.jpg',
    'sushi-burger-combo.jpg', 'sushi-combo.jpg', 'sushi-individual.jpg',
    'tempura-crevete.jpg'
]

def fix_ref(old, new):
    """Replace old photo ref with new if old exists."""
    global html
    old_ref = f'poze/{old}'
    new_ref = f'poze/{new}'
    if old_ref in html:
        count = html.count(old_ref)
        html = html.replace(old_ref, new_ref)
        print(f"  {old} -> {new} ({count}x)")

# === FIX 1: Fix clearly wrong references ===

# antipasto -> antipasti
fix_ref('platou-antipasto.jpg', 'antipasti.jpg')

# sushi individual items (Philadelphia, Tempura) use sushi-individual
fix_ref('sushi-philadelphia.jpg', 'sushi-individual.jpg')
fix_ref('sushi-philadelphia-2.jpg', 'sushi-individual.jpg')
fix_ref('sushi-combo.jpg', 'sushi-individual.jpg')

# sushi sets
fix_ref('sushi-platter.jpg', 'platou-sushi-375.jpg')
fix_ref('sushi-platter-2.jpg', 'platou-sushi-375.jpg')
fix_ref('sushi-platter-3.jpg', 'platou-sushi-750.jpg')
fix_ref('sushi-platter-4.jpg', 'platou-sushi-750.jpg')

# sushi burger
fix_ref('sushi-burger.jpg', 'sushi-burger-combo.jpg')

# burger section
fix_ref('platou-skykids.jpg', 'crispy-black-burger.jpg')  # Was wrong burger
fix_ref('platou-skykids-2.jpg', 'platou-skykids.jpg')  # Clasic Burger

# legume
fix_ref('meat-platter.jpg', 'somon-la-gratar.jpg')  # Was wrong

# antipasti
fix_ref('antipasti-board.jpg', 'antipasti.jpg')

# pizza + seafood
fix_ref('seafood-platter.jpg', 'platou-marin.jpg')  # Pizza Del Mare

# salate
fix_ref('salad-caesar.jpg', 'caesar-cu-pui.jpg')
fix_ref('salad-prosciutto.jpg', 'salata-burrata.jpg')
fix_ref('salad-gourmet.jpg', 'salata-gourmet.jpg')

# snacks/fries
fix_ref('aripioare-fries.jpg', 'aripioare-cu-cartofi-bile.jpg')
fix_ref('aripioare-fries-2.jpg', 'aripioare-cu-cartofi-bile.jpg')
fix_ref('aripioare-fries-3.jpg', 'aripioare-cu-cartofi-bile.jpg')

# clatite
fix_ref('platou-skykids-5.jpg', 'clatite-dulci.jpg')

# === FIX 2: Remove broken references (photo_XXXX files that don't exist) ===
# Find all photo_XXXX refs
photo_refs = re.findall(r'poze/photo_\d+-\d+-\d+[^"]*', html)
for ref in set(photo_refs):
    print(f"  Removing broken ref: {ref}")
    html = html.replace(ref + '"', '"')  # Remove src attribute

# === FIX 3: Fix platou-skykids-XX refs (don't exist in folder) ===
# These are mostly pizza items that have no good photo
# Replace with platou-skykids.jpg as best available placeholder
platou_skykids_files = [
    'platou-skykids-3.jpg', 'platou-skykids-4.jpg',
    'platou-skykids-6.jpg', 'platou-skykids-7.jpg', 'platou-skykids-8.jpg',
    'platou-skykids-9.jpg', 'platou-skykids-10.jpg', 'platou-skykids-11.jpg',
    'platou-skykids-12.jpg', 'platou-skykids-13.jpg', 'platou-skykids-14.jpg',
    'platou-skykids-15.jpg', 'platou-skykids-16.jpg', 'platou-skykids-17.jpg',
    'platou-skykids-18.jpg'
]
for f in platou_skykids_files:
    fix_ref(f, 'platou-skykids.jpg')

# Also fix platou-families (wrong spelling)
fix_ref('platou-families.jpg', 'platou-familie.jpg')

# === FINAL CHECK ===
print("\n=== Final unique poze refs ===")
all_refs = re.findall(r'poze/[^"]+', html)
unique = sorted(set(all_refs))
print(f"Total: {len(unique)}")
for ref in unique:
    # Check if file exists
    filename = ref.replace('poze/', '')
    exists = filename in available
    status = "✅" if exists else "❌ MISSING"
    count = html.count(ref)
    print(f"  {status} {ref}: {count}x")

with open('index.html', 'w') as f:
    f.write(html)

print("\nDone!")
