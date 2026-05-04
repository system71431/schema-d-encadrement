"""
Lit le JSON exporté par l'éditeur (`schema-encadrement-*.json`) et le convertit
en `data.js` (format attendu par les HTML).

Bumpe `window.DATA_VERSION` à un timestamp unique → côté UI, tout brouillon
localStorage ayant une version plus ancienne est automatiquement purgé.

Usage : python _apply_draft.py <chemin_du_json>
"""
import sys
import json
import os
import datetime

if len(sys.argv) < 2:
    print("Usage: python _apply_draft.py <json_file>")
    sys.exit(1)

src = sys.argv[1]
with open(src, encoding="utf-8") as f:
    data = json.load(f)

if not isinstance(data, dict) or "nodes" not in data or "links" not in data:
    print("JSON invalide : doit contenir { nodes: [...], links: [...] }")
    sys.exit(1)

# JSON.stringify pretty : la syntaxe JSON est un sous-ensemble valide de JS
# pour les objets/tableaux littéraux.
nodes_js = json.dumps(data["nodes"], indent=2, ensure_ascii=False)
links_js = json.dumps(data["links"], indent=2, ensure_ascii=False)

version = datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
header = data.get("header") or {"title": "Schéma d'encadrement", "subtitle": "du groupe scout — qui encadre qui ?"}
header_js = json.dumps(header, indent=2, ensure_ascii=False)
content = (
    "const NODES = " + nodes_js + ";\n"
    "const LINKS = " + links_js + ";\n"
    "window.NODES = NODES;\n"
    "window.LINKS = LINKS;\n"
    "window.HEADER = " + header_js + ";\n"
    f'window.DATA_VERSION = "{version}";\n'
)

dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.js")
with open(dst, "w", encoding="utf-8") as f:
    f.write(content)

print(f"data.js mis à jour ({len(data['nodes'])} nodes, {len(data['links'])} links)")
