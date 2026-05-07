// Éléments décoratifs : doodles aux coins (soleil, étoile, sapin, tente,
// flèche pointillée…) et la légende cartouchée en bas. Pure présentation,
// pas d'état.

import React from "react";

export function Doodles() {
  return (
    <>
      {/* Soleil — coin haut droit */}
      <svg className="doodle doodle--rotate-2" style={{top: 22, right: 280, width: 70, height: 70}} viewBox="0 0 60 60" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <circle cx="30" cy="30" r="11"/>
        <path d="M30 4 v8 M30 48 v8 M4 30 h8 M48 30 h8 M11 11 l5.5 5.5 M44 44 l5.5 5.5 M49 11 l-5.5 5.5 M11 49 l5.5 -5.5"/>
      </svg>
      {/* Étoile — milieu gauche */}
      <svg className="doodle doodle--rotate-1" style={{top: 200, left: 18, width: 44, height: 44, color: 'var(--red)'}} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 4 l4.5 11 l11.5 0.8 l-9 7.5 l3 11.5 l-10 -6.5 l-10 6.5 l3 -11.5 l-9 -7.5 l11.5 -0.8 z"/>
      </svg>
      {/* Étincelles */}
      <svg className="doodle doodle--rotate-3" style={{top: 96, left: 280, width: 36, height: 36, color: 'var(--green)'}} viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <path d="M15 3 v8 M15 19 v8 M3 15 h8 M19 15 h8"/>
      </svg>
      {/* Nuage — milieu droit */}
      <svg className="doodle doodle--rotate-3" style={{top: 240, right: 50, width: 80, height: 50, color: 'var(--ink)'}} viewBox="0 0 80 50" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 38 q-10 0 -10 -10 q0 -8 8 -10 q1 -10 13 -10 q9 0 12 7 q3 -2 7 -2 q9 0 11 9 q9 1 9 9 q0 7 -8 7 z"/>
      </svg>
      {/* Sapin — bas gauche */}
      <svg className="doodle doodle--rotate-1" style={{bottom: 140, left: 14, width: 40, height: 56, color: 'var(--green)'}} viewBox="0 0 40 56" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 4 l-12 18 h6 l-10 14 h8 l-10 12 h36 l-10 -12 h8 l-10 -14 h6 z"/>
        <path d="M20 48 v6"/>
      </svg>
      {/* Tente — bas droite */}
      <svg className="doodle doodle--rotate-2" style={{bottom: 110, right: 18, width: 64, height: 48, color: 'var(--ink)'}} viewBox="0 0 64 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 42 l28 -36 l28 36 z"/>
        <path d="M32 6 v36"/>
        <path d="M22 42 l10 -14 l10 14"/>
      </svg>
      {/* Flèche pointillée */}
      <svg className="doodle" style={{top: 90, right: 100, width: 80, height: 30, color: 'var(--blue)'}} viewBox="0 0 80 30" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="4 5">
        <path d="M4 22 q20 -22 60 -10"/>
        <path d="M58 6 l8 6 l-4 9" fill="none" strokeDasharray="0"/>
      </svg>
    </>
  );
}

export function Legend() {
  return (
    <div className="legend">
      <div className="legend__item">
        <svg width="48" height="14" viewBox="0 0 48 14">
          <line x1="2" y1="7" x2="38" y2="7" className="legend-line legend-line--enc" vectorEffect="non-scaling-stroke"/>
          <path d="M 36 2 L 44 7 L 36 12 z" className="legend-arrow legend-arrow--enc"/>
        </svg>
        <span><strong>Encadrement</strong> — relation hiérarchique</span>
      </div>
      <div className="legend__item">
        <svg width="48" height="14" viewBox="0 0 48 14">
          <path d="M 12 2 L 4 7 L 12 12 z" className="legend-arrow legend-arrow--coll"/>
          <line x1="10" y1="7" x2="38" y2="7" className="legend-line legend-line--coll" vectorEffect="non-scaling-stroke"/>
          <path d="M 36 2 L 44 7 L 36 12 z" className="legend-arrow legend-arrow--coll"/>
        </svg>
        <span><strong>Collaboration</strong> — échange dans les deux sens</span>
      </div>
      <div className="legend__item legend__item--badge">
        <span className="legend-badge" aria-hidden="true">
          <svg viewBox="0 0 14 14">
            <path d="M 3.5 7.5 L 6 10 L 11 4.5" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span><strong>Tâches disponibles</strong> — cliquer pour les voir</span>
      </div>
    </div>
  );
}
