"""
Extrait les sections inlinées de `Schema d'encadrement.html` vers des fichiers
sources séparés. À exécuter UNE FOIS pour initialiser le build pipeline.
"""
import re
import os

with open("Schema d'encadrement.html", encoding="utf-8") as f:
    html = f.read()

def extract_between(html, start_marker, kind="script"):
    """Extrait le contenu de la balise `<script ...>` qui suit un commentaire marker."""
    idx = html.find(start_marker)
    if idx == -1:
        raise RuntimeError(f"Marker non trouvé : {start_marker}")
    # Trouve le <script ...> suivant
    rest = html[idx:]
    m = re.search(r'<script[^>]*>(.*?)</script>', rest, re.DOTALL)
    if not m:
        raise RuntimeError(f"Pas de <script> après {start_marker}")
    return m.group(1).strip("\n")

# 1) Data
data_content = extract_between(html, "<!-- ============ data.js (inlined) ============ -->")
with open("data.js", "w", encoding="utf-8") as f:
    f.write(data_content + "\n")
print(f"data.js : {len(data_content)} chars")

# 2) Schema
schema_content = extract_between(html, "<!-- ============ schema.jsx (inlined) ============ -->")
with open("schema.jsx", "w", encoding="utf-8") as f:
    f.write(schema_content + "\n")
print(f"schema.jsx : {len(schema_content)} chars")

# 3) Panel
panel_content = extract_between(html, "<!-- ============ panel.jsx (inlined) ============ -->")
with open("panel.jsx", "w", encoding="utf-8") as f:
    f.write(panel_content + "\n")
print(f"panel.jsx : {len(panel_content)} chars")

# 4) Editor
editor_content = extract_between(html, "<!-- ============ editor.jsx (inlined) ============ -->")
with open("editor.jsx", "w", encoding="utf-8") as f:
    f.write(editor_content + "\n")
print(f"editor.jsx : {len(editor_content)} chars")

# 5) App = le DERNIER <script type="text/babel"> du document
all_babel_scripts = list(re.finditer(r'<script type="text/babel">(.*?)</script>', html, re.DOTALL))
app_content = all_babel_scripts[-1].group(1).strip("\n")
with open("app.jsx", "w", encoding="utf-8") as f:
    f.write(app_content + "\n")
print(f"app.jsx : {len(app_content)} chars")

# 6) Template HTML : on prend le shell + on remplace chaque section par un placeholder
template = html

def replace_section(template, marker_comment, replacement_with_marker):
    """Remplace `<!-- marker -->\n<script ...>contenu</script>` par un placeholder."""
    pattern = re.compile(
        re.escape(marker_comment) + r"\s*<script[^>]*>.*?</script>",
        re.DOTALL
    )
    return pattern.sub(replacement_with_marker, template, count=1)

template = replace_section(template, "<!-- ============ data.js (inlined) ============ -->",
                            "<!-- ============ data.js (inlined) ============ -->\n<script>\n{{DATA}}\n</script>")
template = replace_section(template, "<!-- ============ schema.jsx (inlined) ============ -->",
                            "<!-- ============ schema.jsx (inlined) ============ -->\n<script type=\"text/babel\">\n{{SCHEMA}}\n</script>")
template = replace_section(template, "<!-- ============ panel.jsx (inlined) ============ -->",
                            "<!-- ============ panel.jsx (inlined) ============ -->\n<script type=\"text/babel\">\n{{PANEL}}\n</script>")
template = replace_section(template, "<!-- ============ editor.jsx (inlined) ============ -->",
                            "<!-- ============ editor.jsx (inlined) ============ -->\n<script type=\"text/babel\">\n{{EDITOR}}\n</script>")

# Pour l'App (pas de marker), on remplace le DERNIER <script type="text/babel">
# Reverse-search pour s'assurer qu'on prend le bon
last_script = list(re.finditer(r'<script type="text/babel">.*?</script>', template, re.DOTALL))[-1]
template = (template[:last_script.start()]
            + '<script type="text/babel">\n{{APP}}\n</script>'
            + template[last_script.end():])

# Pour le <style> du <head> : remplacer par {{STYLES}}
style_pattern = re.compile(r'<style>.*?</style>', re.DOTALL)
template = style_pattern.sub('<style>\n{{STYLES}}\n</style>', template, count=1)

with open("template.html", "w", encoding="utf-8") as f:
    f.write(template)
print(f"template.html : {len(template)} chars")

print("\nExtraction terminée. Fichiers créés/mis à jour :")
print("  data.js, schema.jsx, panel.jsx, editor.jsx, app.jsx, template.html")
print("Tu peux maintenant utiliser `python build.py` pour regénérer les HTML.")
