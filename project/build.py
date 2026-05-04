"""
Assemble les fichiers sources (data.js, schema.jsx, panel.jsx, editor.jsx,
app.jsx, styles.css) dans `template.html` pour produire :
  - Schema d'encadrement.html              (éditeur principal)
  - Schema d'encadrement (standalone-src).html
    (même contenu + bloc <template id="__bundler_thumbnail">)
  - index.html                              (copie URL-friendly pour GitHub Pages)

Usage : python build.py
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def read(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return f.read().strip("\n")


def main():
    template = read("template.html")
    styles = read("styles.css")
    data = read("data.js")
    schema = read("schema.jsx")
    panel = read("panel.jsx")
    editor = read("editor.jsx")
    app = read("app.jsx")

    out = template
    # Ordre important : remplace par les contenus complets sans toucher aux marqueurs
    for placeholder, value in [
        ("{{STYLES}}", styles),
        ("{{DATA}}", data),
        ("{{SCHEMA}}", schema),
        ("{{PANEL}}", panel),
        ("{{EDITOR}}", editor),
        ("{{APP}}", app),
    ]:
        if placeholder not in out:
            raise RuntimeError(f"Placeholder absent du template : {placeholder}")
        out = out.replace(placeholder, value, 1)

    # 1) Editor HTML (sans thumbnail)
    editor_path = os.path.join(HERE, "Schema d'encadrement.html")
    with open(editor_path, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"Schema d'encadrement.html : {len(out)} chars")

    # 2) Standalone-src HTML : même chose + bloc <template> juste après <body>
    thumbnail_block = (
        '<template id="__bundler_thumbnail" data-bg-color="#fcf9f1">\n'
        '  <svg viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg">\n'
        '    <rect width="1200" height="800" fill="#fcf9f1"/>\n'
        '    <g transform="translate(600 400)" stroke="#21201d" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round">\n'
        '      <rect x="-260" y="-160" width="520" height="320" rx="6" fill="#fcf9f1" stroke-dasharray="14 12"/>\n'
        '      <circle cx="-160" cy="-40" r="56" fill="#fcf9f1"/>\n'
        '      <circle cx="0" cy="60" r="56" fill="#f5c443"/>\n'
        '      <circle cx="160" cy="-40" r="56" fill="#fcf9f1"/>\n'
        '      <path d="M -110 -30 L -50 30" stroke="#e54b3f"/>\n'
        '      <path d="M 50 30 L 110 -30" stroke="#21201d" stroke-dasharray="10 10"/>\n'
        '    </g>\n'
        '  </svg>\n'
        '</template>'
    )
    standalone = out.replace("<body>\n", "<body>\n" + thumbnail_block + "\n", 1)
    standalone_path = os.path.join(HERE, "Schema d'encadrement (standalone-src).html")
    with open(standalone_path, "w", encoding="utf-8") as f:
        f.write(standalone)
    print(f"Schema d'encadrement (standalone-src).html : {len(standalone)} chars")

    # 3) index.html : copie identique au HTML principal, mais avec un nom
    #    URL-friendly utilisable comme page d'accueil par GitHub Pages.
    index_path = os.path.join(HERE, "index.html")
    with open(index_path, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"index.html : {len(out)} chars (page d'accueil GitHub Pages)")

    print("\nBuild OK.")


if __name__ == "__main__":
    main()
