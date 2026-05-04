"""
Applique les tâches définies par l'utilisateur (sur la base du modèle MSdS)
aux nœuds Coach, RG et Comité dans data.js.

Mapping `towards` :
  - "Branches"   → "n-1777135245742" (container "Le groupe")
  - "Maîtrise"   → "n-1777147965909" (rôle "Maîtrise")
  - "Association"→ "n-1777135245742" (vers le groupe en tant qu'entité)
                   sauf la convention RG↔Comité, qui pointe vers l'autre rôle.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_JS = os.path.join(HERE, "data.js")

# IDs cibles
GROUPE = "n-1777135245742"      # container "Le groupe"
MAITRISE = "n-1777147965909"
RG = "n-1777147392133"
COMITE = "n-1777147984317"
COACH = "n-1777135227102"

# ────────── Tâches communes (Coach et RG) ──────────
BRANCHES = [
    "Établir les programmes du groupe et des branches",
    "Évaluer les programmes du groupe et des branches, et proposer des améliorations",
    "Formuler des objectifs annuels pour le groupe",
    "Faire un retour sur les activités du groupe",
    "Encadrer et évaluer les activités du groupe (méthodologie, équilibre, fondements du scoutisme)",
    "Entretenir le contact avec les parents",
    "Encadrer les branches",
    "Rendre périodiquement visite aux branches lors de leurs activités",
    "Contrôler l'annonce des effectifs sur MiData",
    "Assister aux séances du comité de groupe",
    "Réaliser l'évaluation annuelle du groupe",
    "Contrôler la sécurité des activités",
    "S'assurer que l'ensemble de la maîtrise sache réagir en cas de crise",
    "Être une ressource en cas de crise",
]
MAITRISE_TASKS = [
    "Établir la planification de la maîtrise et vérifier les reconnaissances J+S",
    "Motiver le groupe à participer à la vie de l'association cantonale",
    "Motiver les responsables à suivre des formations continues et encourager leur progression",
    "S'assurer de la tenue et du suivi des formations au sein du groupe",
    "Faire des retours et soutenir la maîtrise de groupe",
    "Organiser des activités pour les responsables",
    "Encourager le teambuilding",
    "Remercier les responsables pour leur engagement",
    "Établir les attestations Bénévole",
    "Établir et mettre en œuvre la convention d'encadrement RG-coach",
    "S'assurer de l'application du modèle d'encadrement cantonal",
    "S'informer des nouveautés en termes d'encadrement (cantonal et fédéral)",
    "Aider au contact avec les parents",
    "Identifier et faire part des besoins de la maîtrise au comité du groupe",
    "Faire le lien entre le groupe et l'association cantonale",
    "Faire respecter les règlements et prises de position du MSdS et de l'AC",
]

def task(label, towards):
    return {"label": label, "towards": towards}

coach_tasks = (
    [task(t, GROUPE) for t in BRANCHES]
    + [task(t, MAITRISE) for t in MAITRISE_TASKS]
)

rg_tasks = (
    [task(t, GROUPE) for t in BRANCHES]
    + [task(t, MAITRISE) for t in MAITRISE_TASKS]
    + [task("Établir et mettre en œuvre la convention d'encadrement RG-comité du groupe", COMITE)]
)

# ────────── Tâches Comité ──────────
COMITE_GROUPE = [
    "Tenir et assurer les bonnes finances du Groupe",
    "Préparation et suivi des assemblées générales",
    "Recherches de fonds",
    "Gestion des locaux",
    "Définir, instaurer, appliquer et réviser la structure statutaire de l'association",
    "Organisation et suivi du renouvellement des membres du comité",
    "Gestion des assurances",
    "Représentation de l'association auprès des autorités et partenaires locaux (village, commune)",
]
comite_tasks = (
    [task(t, GROUPE) for t in COMITE_GROUPE]
    + [task("Établir et mettre en œuvre la convention d'encadrement RG-comité du groupe", RG)]
    + [task("Organiser les activités extra-scoutes (anniversaires, souper parents, etc.)", GROUPE)]
)

# ────────── Application ──────────
# data.js a la forme : `const NODES = [...JSON...]; const LINKS = [...]; window....`
# On charge en parsant la structure JSON entre les delimiters.

with open(DATA_JS, encoding="utf-8") as f:
    src = f.read()

# Séparer NODES et LINKS
nodes_start = src.index("const NODES = ") + len("const NODES = ")
nodes_end = src.index(";\nconst LINKS")
links_start = src.index("const LINKS = ") + len("const LINKS = ")
links_end = src.index(";\nwindow")

nodes = json.loads(src[nodes_start:nodes_end])
links = json.loads(src[links_start:links_end])

mapping = {COACH: coach_tasks, RG: rg_tasks, COMITE: comite_tasks}
for node in nodes:
    if node["id"] in mapping:
        node["tasks"] = mapping[node["id"]]

# Réécrire
nodes_js = json.dumps(nodes, indent=2, ensure_ascii=False)
links_js = json.dumps(links, indent=2, ensure_ascii=False)
out = (
    "const NODES = " + nodes_js + ";\n"
    "const LINKS = " + links_js + ";\n"
    "window.NODES = NODES;\n"
    "window.LINKS = LINKS;\n"
)
with open(DATA_JS, "w", encoding="utf-8") as f:
    f.write(out)

# Stats
total = len(coach_tasks) + len(rg_tasks) + len(comite_tasks)
print(f"data.js mis à jour : Coach {len(coach_tasks)} tâches, RG {len(rg_tasks)} tâches, Comité {len(comite_tasks)} tâches (total {total})")
