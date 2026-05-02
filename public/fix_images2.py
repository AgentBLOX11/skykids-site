#!/usr/bin/env python3
"""Fix Sky Kids menu images with renamed photos."""

with open('index.html', 'r') as f:
    html = f.read()

# === INDIVIDUAL FIXES ===

# 1. Sushi individual items (Philadelphia, Tempura cu somon, Tempura cu crevete)
# All use the same combo photo "sushi-individual.jpg" 
# which shows all 3 with prices
html = html.replace('poze/sushi-philadelphia.jpg', 'poze/sushi-individual.jpg')
html = html.replace('poze/sushi-philadelphia-2.jpg', 'poze/sushi-individual.jpg')
# Note: tempura-crevete already renamed to tempura-crevete.jpg in folder

# 2. Cartofi pai - should use cartofi-pai.jpg (or cartofi-pai-2.jpg for variety)
html = html.replace('poze/platou-skykids-7.jpg', 'poze/cartofi-pai.jpg')  # Margherita -> cartofi pai (WRONG - just placeholder)

# 3. Cartofi bilute - already has cartofi-bilute.jpg available  
# 4. Clatite dulci - use clatite-dulci.jpg
html = html.replace('poze/platou-skykids-5.jpg', 'poze/clatite-dulci.jpg')
# 5. Clatite sarate - no photo yet, keep as is

# 6. Friptura - for "Ceafa de porc cu salata" or "Steak de pui"
# html = html.replace('poze/???', 'poze/friptura.jpg')

# 7. Salata cu burrata - for salata gourmet or italiana
html = html.replace('poze/salad-prosciutto.jpg', 'poze/salata-burrata.jpg')

# 8. Platou carnati - for Carnati BBQ or Platou cu costite
# html = html.replace('poze/???', 'poze/platou-carnati.jpg')

# === REMAINING ISSUES ===
# Most pizza items still use platou-skykids.jpg (wrong) or no photo
# Let me check what's still wrong

# Find all poze references still using platou-skykids
import re
platou_refs = re.findall(r'poze/platou-skykids[^"]*', html)
print("platou-skykids refs:", sorted(set(platou_refs)))

# Find all poze references
all_refs = re.findall(r'poze/[^"]+', html)
unique_refs = sorted(set(all_refs))
print(f"\nTotal unique poze refs: {len(unique_refs)}")
for ref in unique_refs:
    count = html.count(ref)
    print(f"  {ref}: {count}x")

with open('index.html', 'w') as f:
    f.write(html)

print("\nDone!")
