/**
 * scene_zones.js
 * Módulo de delimitación forense de zonas (calzada, andén, separador, edificación),
 * edición milimétrica de vértices, ray-casting e inspector de zonas.
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    Object.assign(root, factory());
  }
})(typeof self !== "undefined" ? self : this, function () {
  function getPolygonArea(points) {
    if (!points || points.length < 3) return 0;
    let area = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      area += (points[j].x + points[i].x) * (points[j].y - points[i].y);
    }
    return Math.abs(area / 2);
  }

  function getPolygonCenter(points) {
    let sumX = 0,
      sumY = 0;
    points.forEach((p) => {
      sumX += p.x;
      sumY += p.y;
    });
    return { x: sumX / points.length, y: sumY / points.length };
  }

  function isPointInPolygon(nx, ny, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x,
        yi = points[i].y;
      const xj = points[j].x,
        yj = points[j].y;
      const intersect =
        yi > ny !== yj > ny && nx < ((xj - xi) * (ny - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function findBestZoneAtCoords(coords) {
    const matches = [];
    for (let i = 0; i < state.zones.length; i++) {
      const z = state.zones[i];
      if (isPointInPolygon(coords.normX, coords.normY, z.points)) {
        const area = getPolygonArea(z.points);
        let typePriority = 1;
        if (z.type === "edificio") typePriority = 10;
        else if (z.type === "separador") typePriority = 8;
        else if (z.type === "anden") typePriority = 5;
        else if (z.type === "calzada") typePriority = 2;

        matches.push({ zone: z, area, typePriority });
      }
    }

    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0].zone.id;

    matches.sort((a, b) => {
      if (b.typePriority !== a.typePriority)
        return b.typePriority - a.typePriority;
      return a.area - b.area;
    });

    const curIdx = matches.findIndex((m) => m.zone.id === state.selectedZoneId);
    if (curIdx !== -1) {
      const nextIdx = (curIdx + 1) % matches.length;
      return matches[nextIdx].zone.id;
    }

    return matches[0].zone.id;
  }

  function getZoneUnderNormCoords(nx, ny) {
    const matches = [];
    for (let i = 0; i < state.zones.length; i++) {
      const z = state.zones[i];
      if (isPointInPolygon(nx, ny, z.points)) {
        const area = getPolygonArea(z.points);
        let typePriority = 1;
        if (z.type === "edificio") typePriority = 10;
        else if (z.type === "separador") typePriority = 8;
        else if (z.type === "anden") typePriority = 5;
        else if (z.type === "calzada") typePriority = 2;
        matches.push({ zone: z, area, typePriority });
      }
    }
    if (!matches.length) return null;
    matches.sort((a, b) => b.typePriority - a.typePriority || a.area - b.area);
    return matches[0].zone;
  }

  function removeSelectedVertex() {
    if (!state.selectedVertex) return false;
    const zone = state.zones.find((z) => z.id === state.selectedVertex.zoneId);
    if (!zone) {
      state.selectedVertex = null;
      return false;
    }
    if (zone.points.length <= 3) {
      showToast("Un polígono debe conservar al menos 3 vértices", 2500);
      return false;
    }

    History.push();
    zone.points.splice(state.selectedVertex.vertexIndex, 1);
    state.selectedVertex = null;
    state.draggingVertex = null;
    state.hoveredVertex = null;
    repaintScene();
    showToast("Vértice eliminado. Polígono simplificado y unido.");
    return true;
  }

  function getVertexAtCoords(coords) {
    if (!state.selectedZoneId) return null;
    const zone = state.zones.find((z) => z.id === state.selectedZoneId);
    if (!zone) return null;

    const w = ui.canvas.width;
    const h = ui.canvas.height;
    const clickX = coords.normX * w;
    const clickY = coords.normY * h;
    const hitRadius = 12 / Math.max(0.5, state.zoom);

    for (let i = 0; i < zone.points.length; i++) {
      const vx = zone.points[i].x * w;
      const vy = zone.points[i].y * h;
      if (Math.hypot(clickX - vx, clickY - vy) <= hitRadius) {
        return { zoneId: zone.id, vertexIndex: i };
      }
    }
    return null;
  }

  function getEdgeAtCoords(coords) {
    if (!state.selectedZoneId) return null;
    const zone = state.zones.find((z) => z.id === state.selectedZoneId);
    if (!zone || zone.points.length < 3) return null;

    const w = ui.canvas.width;
    const h = ui.canvas.height;
    const px = coords.normX * w;
    const py = coords.normY * h;
    const hitThreshold = 10 / Math.max(0.5, state.zoom);

    for (let i = 0; i < zone.points.length; i++) {
      const p1 = zone.points[i];
      const p2 = zone.points[(i + 1) % zone.points.length];
      const x1 = p1.x * w,
        y1 = p1.y * h;
      const x2 = p2.x * w,
        y2 = p2.y * h;

      const dx = x2 - x1,
        dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;

      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
      const projX = x1 + t * dx;
      const projY = y1 + t * dy;

      if (
        Math.hypot(px - projX, py - projY) <= hitThreshold &&
        t > 0.06 &&
        t < 0.94
      ) {
        return {
          zoneId: zone.id,
          insertIndex: i + 1,
          point: { x: projX / w, y: projY / h },
        };
      }
    }
    return null;
  }

  function selectZone(zoneId) {
    state.selectedZoneId = zoneId;
    state.selectedVertex = null;
    const zone = state.zones.find((z) => z.id === zoneId);

    if (zone) {
      if (typeof selectObject === "function") selectObject(null);
      if (ui.inspectorCard) ui.inspectorCard.style.display = "flex";
      if (ui.inspectorEmptyState) ui.inspectorEmptyState.style.display = "none";
      if (ui.inspectorForm) ui.inspectorForm.style.display = "flex";

      if (ui.inputZoneName) ui.inputZoneName.value = zone.name;
      if (ui.selectZoneType) ui.selectZoneType.value = zone.type;
      if (ui.inputZoneElevation)
        ui.inputZoneElevation.value = zone.elevationMeters;
      if (ui.textareaZoneNotes) ui.textareaZoneNotes.value = zone.notes || "";
    } else {
      if (ui.inspectorEmptyState) ui.inspectorEmptyState.style.display = "block";
      if (ui.inspectorForm) ui.inspectorForm.style.display = "none";
    }

    updateZonesListUI();
    repaintScene();
  }

  function updateZonesListUI() {
    if (!ui.zonesListContainer) return;
    ui.zonesListContainer.innerHTML = "";

    if (state.zones.length === 0) {
      ui.zonesListContainer.innerHTML = `
        <div style="font-size: 11px; color: var(--text-muted); font-style: italic; padding: 12px 6px; text-align: center;">
          No hay zonas delimitadas todavía.
        </div>
      `;
      return;
    }

    state.zones.forEach((zone) => {
      const cfg = ZONE_CONFIG[zone.type] || ZONE_CONFIG.anden;
      const item = document.createElement("div");
      item.className =
        "zone-item-card" + (zone.id === state.selectedZoneId ? " selected" : "");
      item.innerHTML = `
        <div class="zone-item-info">
          <span class="zone-color-dot" style="background-color: ${cfg.color};"></span>
          <strong>${zone.name}</strong>
        </div>
        <span class="zone-item-badge">+${zone.elevationMeters.toFixed(2)}m</span>
      `;
      item.addEventListener("click", () => {
        selectZone(zone.id);
        setActiveMode("select");
      });
      ui.zonesListContainer.appendChild(item);
    });
  }

  return {
    getPolygonArea,
    getPolygonCenter,
    isPointInPolygon,
    findBestZoneAtCoords,
    getZoneUnderNormCoords,
    removeSelectedVertex,
    getVertexAtCoords,
    getEdgeAtCoords,
    selectZone,
    updateZonesListUI,
  };
});
