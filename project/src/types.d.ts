// Modèle de données du schéma. Ce fichier sert de référence partagée pour
// JSDoc + l'IDE — pas de migration .ts complète, juste assez de typage pour
// que TypeScript en mode `checkJs` attrape les fautes typiques (champ
// mal nommé, accès sur un nœud du mauvais kind, etc.).

export type NodeKind = "role" | "group" | "resource" | "container" | "shape";
export type LinkKind = "encadrement" | "collaboration";
export type ShapeKind = "circle" | "square" | "triangle" | "diamond" | "hexagon" | "star";
export type Variant = "filled" | "outline" | "badge";
export type StrokeStyle = "solid" | "dashed" | "dotted";

/** Coordonnée normalisée 0..1 sur la bounding-box d'un nœud (pour les
 * anchors fixes, mais peut sortir de [0,1] quand l'utilisateur drag le
 * handle d'ancrage hors du nœud). */
export interface Anchor { x: number; y: number; }

export interface Task {
  /** Libellé visible de la tâche. */
  label: string;
  /** Id du nœud destinataire (« envers ») — un rôle, un groupe, une
   *  ressource ou un container. */
  towards: string;
  /** Id explicite d'un autre rôle qui partage la même tâche. La détection
   *  automatique (par label identique) le couvre déjà ; ce champ est un
   *  override. */
  sharedWith?: string;
}

export interface SchemaNode {
  id: string;
  kind: NodeKind;
  /** Position du centre du nœud, en % du canvas (0..100). */
  x: number;
  y: number;
  label: string;
  sublabel?: string;
  description?: string;
  responsabilites?: string[];
  superviseurs?: string[];
  /** Couleur de fond (rôle/groupe/ressource) ou couleur du badge
   *  (container variant=badge). */
  color?: string;
  /** Couleur du contour (shapes uniquement). */
  strokeColor?: string;
  /** Épaisseur de trait (shapes / containers badge), en px ou unitless. */
  strokeWidth?: number | string;
  strokeStyle?: StrokeStyle;
  variant?: Variant;
  /** Type de forme — uniquement pour kind="shape". */
  shape?: ShapeKind;
  /** Largeur / hauteur en % du canvas — uniquement pour kind="container"
   *  ou "shape". Les autres types se mesurent automatiquement par
   *  ResizeObserver. */
  w?: number;
  h?: number;
  /** Multiplicateur de taille (rôles uniquement). */
  scale?: number;
  /** Lien optionnel vers un groupe — utilisé pour la propagation du
   *  highlight quand un membre du groupe est focus. */
  groupId?: string;
  tasks?: Task[];
}

export interface SchemaLink {
  id: string;
  kind: LinkKind;
  /** Id du nœud source. */
  from: string;
  /** Id du nœud cible. */
  to: string;
  label?: string;
  description?: string;
  fromAnchor?: Anchor;
  toAnchor?: Anchor;
  /** Décalage de la courbe (en % du canvas), > 0 = à droite du segment
   *  AB, < 0 = à gauche. Toujours dans le repère 0..100. */
  curve?: number;
  /** Décalage du label par rapport au milieu de la courbe, en % du
   *  canvas. */
  labelOffset?: { x: number; y: number };
  /** Tâches assignées par lien : map roleId → liste de tâches. Utilisé
   *  uniquement pour les liens d'encadrement. */
  tasks?: Record<string, Task[]>;
}

export interface SchemaHeader {
  title: string;
  subtitle?: string;
}

/** Brouillon localStorage. La cohérence avec data.js passe par
 *  `dataVersion` — un draft d'une version antérieure est purgé. */
export interface Draft {
  nodes: SchemaNode[];
  links: SchemaLink[];
  header: SchemaHeader;
  savedAt: number;
  dataVersion: string | null;
}

/** Tailles mesurées des nœuds (en % du canvas), indexées par id. Mises à
 *  jour par ResizeObserver dans Schema.jsx. */
export type Sizes = Record<string, { w: number; h: number }>;
