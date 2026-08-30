/** Insert zigzag art under the label: button → zigzag → text. */
export function paintMenuArt(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.menu-tile, .menu.main-menu .menu-option').forEach((btn) => {
    if (btn.querySelector('.menu-zigzag')) return;
    const label = btn.innerHTML;
    btn.innerHTML = `<span class="menu-zigzag" aria-hidden="true"></span><span class="menu-btn-label">${label}</span>`;
  });
}
