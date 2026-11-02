/**
 * scene_tools.js
 * Módulo de herramientas forenses de detección:
 * - Algoritmo de Varita Mágica (Moore-Neighbor Contour + Simplificación Ramer-Douglas-Peucker)
 * - Auto-Detección de estructuras y comercios desde OpenStreetMap (Overpass API)
 * - Trazador de Polígonos Libres
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SceneTools = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /**
   * Conversión de coordenadas geográficas WGS84 a normales de canvas [0..1]
   */
  function geoToCanvas(lon, lat, centerLng, centerLat, sizeMeters, bearingDeg = 0) {
    const earthRadius = 6378137;
    const latRad = (centerLat * Math.PI) / 180;
    const dx = ((lon - centerLng) * Math.PI / 180) * earthRadius * Math.cos(latRad);
    const dy = ((lat - centerLat) * Math.PI / 180) * earthRadius;

    const rad = (-bearingDeg * Math.PI) / 180;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

    return {
      x: rx / sizeMeters + 0.5,
      y: -ry / sizeMeters + 0.5,
    };
  }

  /**
   * Auto-Detección de Geometría Cartográfica desde OpenStreetMap (Overpass API)
   */
  async function autoDetectMapGeometries(state, ui, showToast, updateZonesListUI, repaintScene, selectZone, History, ZONE_CONFIG) {
    const m = state.metadata;
    if (!m || !m.center) {
      showToast("No hay coordenadas geográficas para escanear");
      return;
    }

    showToast("Escaneando locales comerciales y estructuras desde OpenStreetMap...", 3500);
    if (ui.btnAutoDetectOSM) {
      ui.btnAutoDetectOSM.disabled = true;
      ui.btnAutoDetectOSM.innerHTML = "⏳ Escaneando negocios...";
    }

    const centerLat = m.center.lat;
    const centerLng = m.center.lng;
    const sizeMeters = m.sizeMeters;
    const bearingDeg = m.bearingDeg || 0;

    const halfM = sizeMeters * 0.65;
    const earthRadius = 6378137;
    const dLat = (halfM / earthRadius) * (180 / Math.PI);
    const safeCos = Math.max(0.001, Math.cos((centerLat * Math.PI) / 180));
    const dLng = (halfM / (earthRadius * safeCos)) * (180 / Math.PI);

    const s = (centerLat - dLat).toFixed(6);
    const w = (centerLng - dLng).toFixed(6);
    const n = (centerLat + dLat).toFixed(6);
    const e = (centerLng + dLng).toFixed(6);

    const query = `[out:json][timeout:12];(way["building"](${s},${w},${n},${e});relation["building"](${s},${w},${n},${e}););out geom tags;`;
    const endpoints = [
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
      `https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(query)}`,
      `https://lz4.overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
    ];

    try {
      let data = null;
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep, { signal: AbortSignal.timeout(5000) });
          if (res.ok) {
            data = await res.json();
            break;
          }
        } catch (epErr) {
          console.warn("Servidor OSM espejo ocupado, probando alternativo...");
        }
      }

      if (!data) throw new Error("Servidores cartográficos ocupados");

      let addedCount = 0;
      History.push();
      if (data && data.elements && data.elements.length > 0) {
        data.elements.forEach((elem) => {
          if (!elem.geometry || elem.geometry.length < 3) return;

          const pts = elem.geometry.map((g) =>
            geoToCanvas(g.lon, g.lat, centerLng, centerLat, sizeMeters, bearingDeg)
          );

          const hasVisible = pts.some((p) => p.x >= -0.05 && p.x <= 1.05 && p.y >= -0.05 && p.y <= 1.05);
          if (!hasVisible) return;

          if (elem.tags && (elem.tags.building || elem.tags.shop || elem.tags.amenity)) {
            const tags = elem.tags;
            let bldName = tags.name;
            if (!bldName) {
              if (tags.shop) {
                bldName = `Comercio: ${tags.shop.charAt(0).toUpperCase() + tags.shop.slice(1)}`;
              } else if (tags.amenity) {
                bldName = `Local: ${tags.amenity.charAt(0).toUpperCase() + tags.amenity.slice(1)}`;
              } else if (tags.office) {
                bldName = `Oficina: ${tags.office}`;
              } else if (tags["building:levels"]) {
                bldName = `Edificio (${tags["building:levels"]} pisos)`;
              } else if (tags.building && tags.building !== "yes") {
                bldName = `Estructura (${tags.building})`;
              } else {
                bldName = `Edificación #${String(elem.id).slice(-4)}`;
              }
            }

            const levels = parseInt(tags["building:levels"], 10) || 1;
            const height = parseFloat(tags.height) || levels * 3.5;

            const cleanPts =
              pts.length > 2 &&
              pts[0].x === pts[pts.length - 1].x &&
              pts[0].y === pts[pts.length - 1].y
                ? pts.slice(0, -1)
                : pts;

            const metaNotes = [];
            if (tags.name) metaNotes.push(`Nombre: ${tags.name}`);
            if (tags.shop) metaNotes.push(`Comercio: ${tags.shop}`);
            if (tags.amenity) metaNotes.push(`Servicio: ${tags.amenity}`);
            if (tags["addr:street"] || tags["addr:housenumber"]) {
              metaNotes.push(`Dir: ${tags["addr:street"] || ""} ${tags["addr:housenumber"] || ""}`.trim());
            }
            metaNotes.push(`Pisos: ${levels} (~${height.toFixed(1)}m)`);
            metaNotes.push(`OSM ID: ${elem.id}`);

            state.zones.push({
              id: "osm_bld_" + elem.id + "_" + Date.now(),
              name: bldName,
              type: "edificio",
              elevationMeters: height,
              color: ZONE_CONFIG.edificio.color,
              notes: metaNotes.join(" | "),
              origin: "osm",
              points: cleanPts,
            });
            addedCount++;
          }
        });
      }

      if (addedCount > 0) {
        showToast(`¡${addedCount} edificaciones y locales comerciales delimitados con sus nombres!`, 3500);
        updateZonesListUI();
        repaintScene();
      } else {
        showToast("No se encontraron edificaciones vectorizadas en este sector. ¡Usa la Varita Mágica para delimitar!", 3500);
      }
    } catch (err) {
      console.warn("Fallo o timeout en servidores OSM:", err);
      showToast("Servidor de mapa OSM ocupado. Utiliza la Varita Mágica para segmentar por color.", 4000);
    } finally {
      if (ui.btnAutoDetectOSM) {
        ui.btnAutoDetectOSM.disabled = false;
        ui.btnAutoDetectOSM.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
            <path d="M9 22v-4h6v4"></path>
            <path d="M8 6h.01"></path>
            <path d="M16 6h.01"></path>
            <path d="M12 6h.01"></path>
            <path d="M12 10h.01"></path>
            <path d="M12 14h.01"></path>
            <path d="M16 10h.01"></path>
            <path d="M16 14h.01"></path>
            <path d="M8 10h.01"></path>
            <path d="M8 14h.01"></path>
          </svg>
          Auto-Detectar Negocios y Edificios (OSM)`;
      }
    }
  }

  /**
   * Algoritmo de Varita Mágica (Segmentación de píxeles por similitud de color)
   */
  function magicWandSegment(canvas, startX, startY, tolerance, baseImg) {
    const w = canvas.width;
    const h = canvas.height;

    const maxProcDim = 600;
    const scale = Math.min(1, maxProcDim / Math.max(w, h));
    const pw = Math.round(w * scale);
    const ph = Math.round(h * scale);

    const offCanvas = document.createElement("canvas");
    offCanvas.width = pw;
    offCanvas.height = ph;
    const offCtx = offCanvas.getContext("2d", { willReadFrequently: true });
    offCtx.drawImage(baseImg || canvas, 0, 0, pw, ph);

    const imgData = offCtx.getImageData(0, 0, pw, ph);
    const data = imgData.data;

    const px = Math.min(pw - 1, Math.max(0, Math.round(startX * scale)));
    const py = Math.min(ph - 1, Math.max(0, Math.round(startY * scale)));

    const seedIdx = (py * pw + px) * 4;
    const r0 = data[seedIdx];
    const g0 = data[seedIdx + 1];
    const b0 = data[seedIdx + 2];

    const mask = new Uint8Array(pw * ph);
    const visited = new Uint8Array(pw * ph);
    const queue = new Int32Array(pw * ph);
    let head = 0;
    let tail = 0;

    const startPos = py * pw + px;
    queue[tail++] = startPos;
    visited[startPos] = 1;
    mask[startPos] = 1;

    const tolSq = tolerance * tolerance * 3;
    let minX = px, maxX = px, minY = py, maxY = py;
    let count = 0;
    const maxPixels = pw * ph * 0.45;

    while (head < tail && count < maxPixels) {
      const pos = queue[head++];
      const cx = pos % pw;
      const cy = Math.floor(pos / pw);
      count++;

      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      const neighbors = [
        cx > 0 ? pos - 1 : -1,
        cx < pw - 1 ? pos + 1 : -1,
        cy > 0 ? pos - pw : -1,
        cy < ph - 1 ? pos + pw : -1,
      ];

      for (let i = 0; i < 4; i++) {
        const npos = neighbors[i];
        if (npos >= 0 && !visited[npos]) {
          visited[npos] = 1;
          const nidx = npos * 4;
          const dr = data[nidx] - r0;
          const dg = data[nidx + 1] - g0;
          const db = data[nidx + 2] - b0;
          if (dr * dr + dg * dg + db * db <= tolSq) {
            mask[npos] = 1;
            queue[tail++] = npos;
          }
        }
      }
    }

    if (count < 30) return null;

    const contour = traceContour(mask, pw, ph, minX, maxX, minY, maxY);
    if (!contour || contour.length < 3) return null;

    const simplified = rdpSimplify(contour, 2.5);
    if (simplified.length < 3) return null;

    return simplified.map((pt) => ({
      x: pt.x / pw,
      y: pt.y / ph,
    }));
  }

  /**
   * Trazado de contorno perimetral (Moore-Neighbor Tracing)
   */
  function traceContour(mask, w, h, minX, maxX, minY, maxY) {
    let startX = -1;
    let startY = -1;
    outer: for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (mask[y * w + x]) {
          startX = x;
          startY = y;
          break outer;
        }
      }
    }
    if (startX === -1) return null;

    const dx = [0, 1, 1, 1, 0, -1, -1, -1];
    const dy = [-1, -1, 0, 1, 1, 1, 0, -1];

    const contour = [];
    let cx = startX;
    let cy = startY;
    contour.push({ x: cx, y: cy });

    let backtrackDir = 6;
    let steps = 0;
    const maxSteps = w * h;

    while (steps++ < maxSteps) {
      let nextDir = -1;
      for (let i = 0; i < 8; i++) {
        const dir = (backtrackDir + i) % 8;
        const nx = cx + dx[dir];
        const ny = cy + dy[dir];
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx]) {
          nextDir = dir;
          cx = nx;
          cy = ny;
          break;
        }
      }

      if (nextDir === -1) break;
      if (cx === startX && cy === startY) break;

      contour.push({ x: cx, y: cy });
      backtrackDir = (nextDir + 5) % 8;
    }

    return contour;
  }

  /**
   * Simplificación poligonal Ramer-Douglas-Peucker (RDP)
   */
  function rdpSimplify(points, epsilon) {
    if (points.length <= 2) return points;

    function perpendicularDistance(pt, lineStart, lineEnd) {
      const dx = lineEnd.x - lineStart.x;
      const dy = lineEnd.y - lineStart.y;
      const mag = Math.hypot(dx, dy);
      if (mag === 0) return Math.hypot(pt.x - lineStart.x, pt.y - lineStart.y);
      return Math.abs(dy * pt.x - dx * pt.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / mag;
    }

    function rdp(pts) {
      if (pts.length <= 2) return pts;
      let dmax = 0;
      let index = 0;
      const end = pts.length - 1;

      for (let i = 1; i < end; i++) {
        const d = perpendicularDistance(pts[i], pts[0], pts[end]);
        if (d > dmax) {
          index = i;
          dmax = d;
        }
      }

      if (dmax > epsilon) {
        const rec1 = rdp(pts.slice(0, index + 1));
        const rec2 = rdp(pts.slice(index));
        return rec1.slice(0, -1).concat(rec2);
      } else {
        return [pts[0], pts[end]];
      }
    }

    const res = rdp(points);
    if (res.length > 2 && (res[0].x !== res[res.length - 1].x || res[0].y !== res[res.length - 1].y)) {
      res.push({ x: res[0].x, y: res[0].y });
    }
    return res;
  }

  /**
   * Ejecuta la Varita Mágica en las coordenadas pulsadas
   */
  function runMagicWandAt(coords, state, ui, showToast, History, ZONE_CONFIG, selectZone, updateZonesListUI, repaintScene) {
    const px = Math.round(coords.normX * ui.canvas.width);
    const py = Math.round(coords.normY * ui.canvas.height);

    showToast("Escaneando contorno por color...", 1200);

    setTimeout(() => {
      const polyPts = magicWandSegment(
        ui.canvas,
        px,
        py,
        state.wandTolerance,
        state.baseImage
      );

      if (polyPts && polyPts.length >= 3) {
        const cfg = ZONE_CONFIG[state.activeCategory] || ZONE_CONFIG.anden;
        const countSame = state.zones.filter((z) => z.type === state.activeCategory).length + 1;

        const newZone = {
          id: "zone_wand_" + Date.now(),
          name: `${cfg.label} Escaneado ${countSame}`,
          type: state.activeCategory,
          elevationMeters: cfg.defaultElevation,
          color: cfg.color,
          notes: `Detectado automáticamente por Varita Mágica (tolerancia: ±${state.wandTolerance})`,
          origin: "wand",
          points: polyPts,
        };

        History.push();
        state.zones.push(newZone);
        selectZone(newZone.id);
        updateZonesListUI();
        repaintScene();
        showToast(`¡Zona detectada con éxito! (${polyPts.length} vértices generados)`);
      } else {
        showToast("No se pudo delimitar un área nítida. Prueba ajustando la tolerancia de color.");
      }
    }, 30);
  }

  /**
   * Cierra y valida el polígono libre trazado
   */
  function finishFreePolygon(state, History, ZONE_CONFIG, selectZone, updateZonesListUI, repaintScene, showToast) {
    if (state.freePolygonPoints.length < 3) {
      state.freePolygonPoints = [];
      repaintScene();
      return;
    }

    const cfg = ZONE_CONFIG[state.activeCategory] || ZONE_CONFIG.anden;
    const countSame = state.zones.filter((z) => z.type === state.activeCategory).length + 1;

    const pts = state.freePolygonPoints.map((p) => ({
      x: p.normX,
      y: p.normY,
    }));

    const newZone = {
      id: "zone_poly_" + Date.now(),
      name: `${cfg.label} ${countSame}`,
      type: state.activeCategory,
      elevationMeters: cfg.defaultElevation,
      color: cfg.color,
      notes: "Trazado con Polígono Libre",
      origin: "polygon",
      points: pts,
    };

    History.push();
    state.zones.push(newZone);
    state.freePolygonPoints = [];
    selectZone(newZone.id);
    updateZonesListUI();
    repaintScene();
    showToast(`Polígono creado: ${newZone.name}`);
  }

  return {
    geoToCanvas,
    autoDetectMapGeometries,
    magicWandSegment,
    traceContour,
    rdpSimplify,
    runMagicWandAt,
    finishFreePolygon,
  };
});
