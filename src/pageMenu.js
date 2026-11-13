// The hamburger menu on the static pages (About, Privacy). Same markup and styles as the game's menu.
const btn = document.getElementById("menu-btn");
const menu = document.getElementById("menu");

function setOpen(open) {
  menu.hidden = !open;
  btn.setAttribute("aria-expanded", String(open));
}

btn.addEventListener("click", () => setOpen(menu.hidden));
document.addEventListener("click", (e) => {
  if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) setOpen(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !menu.hidden) {
    setOpen(false);
    btn.focus();
  }
});
