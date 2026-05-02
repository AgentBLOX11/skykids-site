#!/usr/bin/env python3
"""Fix clearly wrong Sky Kids menu image references."""

with open('index.html', 'r') as f:
    html = f.read()

# Replace CDN base with local path
html = html.replace(
    'https://media.githubusercontent.com/media/AgentBLOX11/skykids-site/main/public/poze/',
    'poze/'
)

# Clear fixes only
fixes = [
    # Legume la gratar - was using meat-platter (clearly wrong!)
    ('poze/meat-platter.jpg', 'poze/somon-la-gratar.jpg'),
    # Antipasti - was using antipasti-board (ok but rename)
    ('poze/antipasti-board.jpg', 'poze/antipasti.jpg'),
    # Crispy Black Burger - was using platou-skykids (clearly wrong burger!)
    ('poze/platou-skykids.jpg', 'poze/crispy-black-burger.jpg'),
    # Pizza Del Mare - was using seafood-platter (wrong!)
    ('poze/seafood-platter.jpg', 'poze/platou-marin.jpg'),
    # Sushi Burger cu somon - was using sushi-burger.jpg (ok, but use combo)
    ('poze/sushi-burger.jpg', 'poze/sushi-burger-combo.jpg'),
]

for old, new in fixes:
    if old in html:
        count = html.count(old)
        html = html.replace(old, new)
        print(f"Fixed {count}x: {old.split('/')[-1]} -> {new.split('/')[-1]}")
    else:
        print(f"NOT FOUND: {old}")

with open('index.html', 'w') as f:
    f.write(html)

print(f"\nDone! HTML size: {len(html)} chars")
