// DCYM — utilidades compartidas por las páginas de la app.

const DCYM = {
  wsUrl(path) {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}${path}`;
  },

  toast(text, isError = false) {
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.toggle("err", isError);
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 3200);
  },

  async logout() {
    await fetch("/api/logout", { method: "POST" });
    location.href = "/";
  },

  // Dibuja las cajas de detección. Las coordenadas de Roboflow vienen en
  // píxeles de la imagen enviada (x, y = centro), así que se escalan al
  // tamaño en que se está pintando.
  // screenW: ancho con que se ve en pantalla (px CSS); scale: px del canvas por
  // px de pantalla. Así trazos y textos se leen igual en el celular, en una
  // miniatura del panel o en una imagen grande.
  drawBoxes(ctx, preds, srcW, srcH, dstW, dstH, offX = 0, offY = 0, screenW = dstW, scale = 1) {
    const sx = dstW / srcW, sy = dstH / srcH;
    const lw = Math.max(2, screenW / 260) * scale;
    const fs = Math.round(Math.max(10, Math.min(15, screenW / 34)) * scale);
    ctx.font = `700 ${fs}px "Space Mono", monospace`;
    ctx.textBaseline = "top";
    for (const p of preds) {
      const x = offX + (p.x - p.w / 2) * sx;
      const y = offY + (p.y - p.h / 2) * sy;
      const w = p.w * sx, h = p.h * sy;
      ctx.lineWidth = lw;
      ctx.strokeStyle = "#00e67e";
      ctx.fillStyle = "rgba(0,230,126,.10)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      // esquinas marcadas, estilo visor
      const k = Math.min(w, h) * 0.22;
      ctx.lineWidth = lw * 2;
      ctx.beginPath();
      ctx.moveTo(x, y + k); ctx.lineTo(x, y); ctx.lineTo(x + k, y);
      ctx.moveTo(x + w - k, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + k);
      ctx.moveTo(x + w, y + h - k); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - k, y + h);
      ctx.moveTo(x + k, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - k);
      ctx.stroke();
      const label = `VACA${p.tag ? " · " + p.tag.toUpperCase() : ""} ${Math.round(p.c * 100)}%`;
      const tw = ctx.measureText(label).width + 10;
      const ly = y - fs - 8 < 0 ? y + 2 : y - fs - 8;
      ctx.fillStyle = "#00e67e";
      ctx.fillRect(x - lw / 2, ly, tw, fs + 6);
      ctx.fillStyle = "#00150a";
      ctx.fillText(label, x + 5 - lw / 2, ly + 3);
    }
  },

  plural(n) { return n === 1 ? "vaca" : "vacas"; },

  timeAgo(ts) {
    const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
    if (s < 60) return `hace ${s}s`;
    const m = Math.round(s / 60);
    return `hace ${m} min`;
  },

  clock(ts) {
    return new Date(ts * 1000).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  },
};

// Ícono de la marca (dron visto desde arriba) para no depender de imágenes.
const DCYM_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="5" r="2.5"/><circle cx="19" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.2"/></svg>`;
document.querySelectorAll("[data-brand-icon]").forEach(el => { el.innerHTML = DCYM_ICON; });
