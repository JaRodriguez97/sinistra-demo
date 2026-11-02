/**
 * render_2d_props.js
 * Módulo de renderizado overhead 2D para peatones, entorno urbano, señales de tránsito y mobiliario.
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.drawProps2D = factory().drawProps2D;
  }
})(typeof self !== "undefined" ? self : this, function () {
  function drawProps2D(ctx, obj, lenPx, widthPx, isSelected, zoom) {
    const halfL = lenPx / 2;
    const halfW = widthPx / 2;

    // ================= A. PEATONES Y PERSONAS =================
    if (obj.category === "persona") {
      const isNino = obj.catalogId === "peaton_nino";
      const isAgente = obj.catalogId === "agente_transito";
      const scaleP = isNino ? 0.75 : 1.0;
      const pr = Math.max(3.5, (lenPx / 2) * scaleP);

      ctx.fillStyle = isAgente
        ? "#eab308"
        : obj.color || (isNino ? "#ec4899" : "#06b6d4");
      ctx.beginPath();
      ctx.ellipse(0, 0, pr * 1.35, pr * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#00f0ff" : isAgente ? "#ca8a04" : "#ffffff";
      ctx.lineWidth = 1.5 / zoom;
      ctx.stroke();

      if (isAgente) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-pr * 0.8, -pr * 0.2, pr * 1.6, 2 / zoom);
      }

      ctx.fillStyle = isAgente ? "#1e293b" : "#fef08a";
      ctx.beginPath();
      ctx.arc(0, 0, pr * 0.52, 0, Math.PI * 2);
      ctx.fill();

    // ================= B. MOBILIARIO Y ENTORNO =================
    } else if (obj.catalogId === "zona_verde") {
      ctx.fillStyle = "rgba(74, 222, 128, 0.42)";
      ctx.beginPath();
      ctx.roundRect(-halfL, -halfW, lenPx, widthPx, 6 / zoom);
      ctx.fill();
      ctx.strokeStyle = "#16a34a";
      ctx.lineWidth = 1.5 / zoom;
      ctx.stroke();

    } else if (obj.catalogId === "barrera_new_jersey") {
      ctx.fillStyle = "#cbd5e1";
      ctx.beginPath();
      ctx.roundRect(-halfL, -halfW, lenPx, widthPx, 2 / zoom);
      ctx.fill();
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 1.2 / zoom;
      ctx.stroke();

      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(-halfL * 0.9, -halfW * 0.35, lenPx * 0.9, widthPx * 0.7);

    } else if (obj.catalogId === "arbol") {
      const tr = Math.max(5, lenPx / 2);
      ctx.fillStyle = "rgba(22, 101, 52, 0.88)";
      ctx.beginPath();
      ctx.arc(0, 0, tr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#15803d";
      ctx.lineWidth = 2 / zoom;
      ctx.stroke();

      ctx.fillStyle = "rgba(74, 222, 128, 0.6)";
      ctx.beginPath();
      ctx.arc(tr * 0.2, -tr * 0.2, tr * 0.55, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#78350f";
      ctx.beginPath();
      ctx.arc(0, 0, tr * 0.22, 0, Math.PI * 2);
      ctx.fill();

    } else if (obj.catalogId === "arbusto") {
      const ar = Math.max(4, lenPx / 2);
      ctx.fillStyle = "rgba(21, 128, 61, 0.85)";
      ctx.beginPath();
      ctx.arc(0, 0, ar, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#86efac";
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();

    } else if (obj.catalogId === "poste_luz") {
      const pr = Math.max(3.5, lenPx / 2);
      ctx.fillStyle = "#475569";
      ctx.beginPath();
      ctx.arc(0, 0, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.5 / zoom;
      ctx.stroke();

      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 2.5 / zoom;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(pr * 2.4, 0);
      ctx.stroke();

      ctx.fillStyle = "rgba(253, 224, 71, 0.85)";
      ctx.beginPath();
      ctx.arc(pr * 2.4, 0, 3.5 / zoom, 0, Math.PI * 2);
      ctx.fill();

    } else if (obj.catalogId === "semaforo") {
      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.roundRect(-halfL, -halfW, lenPx, widthPx, 2 / zoom);
      ctx.fill();
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 1.2 / zoom;
      ctx.stroke();

      const r = Math.max(2, halfW * 0.7);
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(halfL * 0.5, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#eab308";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(-halfL * 0.5, 0, r, 0, Math.PI * 2);
      ctx.fill();

    } else if (obj.catalogId === "camara_fotomulta") {
      ctx.fillStyle = "#334155";
      ctx.beginPath();
      ctx.roundRect(-halfL, -halfW, lenPx, widthPx, 2 / zoom);
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5 / zoom;
      ctx.stroke();

      ctx.fillStyle = "#0284c7";
      ctx.beginPath();
      ctx.arc(halfL * 0.4, 0, halfW * 0.6, 0, Math.PI * 2);
      ctx.fill();

    // ================= C. SEÑALES VIALES Y GENÉRICO =================
    } else if (obj.category === "senal" || obj.catalogId.startsWith("senal_")) {
      const sr = Math.max(4, lenPx / 2);
      if (obj.catalogId === "senal_pare") {
        ctx.fillStyle = "#dc2626";
        ctx.beginPath();
        for (let a = 0; a < 8; a++) {
          const ang = (a * Math.PI) / 4 + Math.PI / 8;
          const px = Math.cos(ang) * sr * 1.1;
          const py = Math.sin(ang) * sr * 1.1;
          if (a === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5 / zoom;
        ctx.stroke();
      } else if (obj.catalogId === "senal_ceda_paso") {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(0, sr * 1.1);
        ctx.lineTo(-sr * 1.1, -sr * 0.9);
        ctx.lineTo(sr * 1.1, -sr * 0.9);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#dc2626";
        ctx.lineWidth = 2.5 / zoom;
        ctx.stroke();
      } else {
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.arc(0, 0, sr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = obj.color || "#64748b";
      ctx.beginPath();
      ctx.roundRect(-halfL, -halfW, lenPx, widthPx, 3 / zoom);
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#00f0ff" : "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1.2 / zoom;
      ctx.stroke();
    }
  }

  return { drawProps2D };
});
