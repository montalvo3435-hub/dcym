// Interfaz del visor 3D: lista de piezas, ficha de la pieza elegida y botones.
// Se usa en la portada (sección Prototipo) y en /modelo (pantalla completa).
import { createDroneViewer, PARTS } from "./dron3d.js?v=13";

const ORDER = ["marco", "motores", "helices", "esc", "pixhawk", "gps", "rpi", "camara", "modem", "lidar", "telemetria", "receptor", "bateria", "tren"];

export function mountVisor(root, opts = {}) {
  const stage = root.querySelector("[data-canvas]");
  const list = root.querySelector("[data-list]");
  const info = root.querySelector("[data-info]");
  const tip = root.querySelector("[data-tip]");

  let viewer;
  try {
    viewer = createDroneViewer(stage, opts);
  } catch (e) {
    root.classList.add("visor-fallback");
    stage.insertAdjacentHTML("beforeend", `<img src="/static/media/render/dron-3d.png" alt="Modelo 3D del DCYM Rastreador V1">`);
    return null;
  }

  const defaultInfo = info ? info.innerHTML : "";
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  if (list) {
    list.innerHTML = ORDER.map(id => `<li><button type="button" data-part="${id}"><i></i>${esc(PARTS[id].name)}</button></li>`).join("");
    list.addEventListener("click", e => {
      const b = e.target.closest("[data-part]");
      if (!b) return;
      viewer.setAutoRotate(false);
      viewer.select(b.dataset.part === current ? null : b.dataset.part);
    });
  }

  let current = null;
  viewer.on("select", id => {
    current = id;
    list?.querySelectorAll("[data-part]").forEach(b => b.setAttribute("aria-pressed", b.dataset.part === id));
    if (!info) return;
    if (!id) { info.innerHTML = defaultInfo; return; }
    const card = document.getElementById(`pieza-${id}`);
    info.innerHTML = `
      <span class="visor-kicker">Pieza seleccionada</span>
      <h4>${esc(PARTS[id].name)}</h4>
      <p>${esc(PARTS[id].role)}</p>
      ${card ? `<a href="#pieza-${id}" class="visor-link">Ver la pieza real →</a>` : ""}
      <button type="button" class="visor-clear" data-clear>Ver dron completo</button>`;
    info.querySelector("[data-clear]").onclick = () => viewer.select(null);
  });

  if (tip) {
    viewer.on("hover", (id, e) => {
      if (!id || !e) { tip.classList.remove("show"); return; }
      const r = stage.getBoundingClientRect();
      tip.textContent = PARTS[id].name;
      tip.style.left = `${e.clientX - r.left}px`;
      tip.style.top = `${e.clientY - r.top}px`;
      tip.classList.add("show");
    });
  }

  viewer.on("rotate", on => root.querySelector('[data-act="rotate"]')?.setAttribute("aria-pressed", on));

  root.querySelectorAll("[data-act]").forEach(btn => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.act;
      if (act === "explode" || act === "spin" || act === "rotate") {
        const on = btn.getAttribute("aria-pressed") !== "true";
        btn.setAttribute("aria-pressed", on);
        if (act === "explode") viewer.setExploded(on);
        if (act === "spin") viewer.setSpin(on);
        if (act === "rotate") viewer.setAutoRotate(on);
      } else if (act === "reset") {
        viewer.select(null);
        viewer.resetView();
      }
    });
  });

  return viewer;
}
