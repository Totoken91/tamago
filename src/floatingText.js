// ============================================================================
//  floatingText.js — Mots doux flottants (DOM) affichés au-dessus de la
//  créature quand on la complimente. Position dérivée du projeté écran.
// ============================================================================

export class FloatingText {
  constructor(layerEl) {
    this.layer = layerEl;
  }

  /**
   * @param {string} text
   * @param {{x:number,y:number}} screen position en pixels CSS
   */
  spawn(text, screen) {
    const el = document.createElement('div');
    el.className = 'sweet-word';
    el.textContent = text;
    // légère variation d'angle pour un rendu vivant
    const tilt = (Math.random() - 0.5) * 10;
    el.style.setProperty('--tilt', tilt + 'deg');
    el.style.left = screen.x + 'px';
    el.style.top = screen.y + 'px';
    this.layer.appendChild(el);
    // nettoyage après l'animation
    el.addEventListener('animationend', () => el.remove());
  }
}
