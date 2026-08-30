/** Stack menu art as button → zigzag → mode icon → text. */
export function paintMenuArt(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.menu-tile, .menu.main-menu .menu-option').forEach((btn) => {
    if (btn.querySelector('.menu-zigzag')) return;
    const modeIcon = btn.querySelector('.menu-icon-mode');
    const nodes = [...btn.childNodes];
    btn.replaceChildren();
    const zigzag = document.createElement('span');
    zigzag.className = 'menu-zigzag';
    zigzag.setAttribute('aria-hidden', 'true');
    btn.appendChild(zigzag);
    if (modeIcon) btn.appendChild(modeIcon);
    const label = document.createElement('span');
    label.className = 'menu-btn-label';
    nodes.forEach((node) => {
      if (node === modeIcon) return;
      label.appendChild(node);
    });
    btn.appendChild(label);
  });
}
