/**
 * scene_dimensions.js
 * Módulo de acotación y asignación métrica de distancias entre cuerpos y puntos.
 * Soporta arrastre de extremos A/B, desplazamiento del segmento completo y snapping magnético.
 * Sinistra 3D - Reconstrucción de Accidentes de Tránsito
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SceneDimensions = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Formato numérico: metros con 2 decimales y ángulos en grados enteros
  function formatMeters(meters) {
    const val = Number(meters);
    if (isNaN(val)) return "0.00 m";
    return val.toFixed(2) + " m";
  }

  function formatAngle(deg) {
    const val = Number(deg);
    if (isNaN(val)) return "0°";
    return Math.round(val) + "°";
  }

  function getEffectiveSizeMeters(state) {
    return state?.metadata?.sizeMeters || 100;
  }

  // Calcula la distancia euclidiana en metros reales entre dos puntos normalizados
  function calcDistanceMeters(p1, p2, state) {
    const sz = getEffectiveSizeMeters(state);
    const dx = (p2.normX - p1.normX) * sz;
    const dy = (p2.normY - p1.normY) * sz;
    return Math.hypot(dx, dy);
  }

  // Detección magnética inteligente (snapping) a vehículos, peatones, impacto o esquinas/bordes de andén
  function findSnapPoint(coords, state, canvasWidth, canvasHeight) {
    if (!coords) return null;
    const w = canvasWidth;
    const h = canvasHeight;
    const zoom = Math.max(0.4, state.zoom || 1.0);
    const px = coords.normX * w;
    const py = coords.normY * h;
    const snapDistPx = 24 / zoom; // Radio generoso de captura magnética en pantalla
    const mpp = state.metadata?.metersPerPixel || 0.125;

    let bestSnap = null;
    let minDist = snapDistPx;

    // 1. Snapping a Vehículos, Peatones y Elementos Forenses
    if (Array.isArray(state.objects)) {
      for (const obj of state.objects) {
        const ox = obj.normX * w;
        const oy = obj.normY * h;
        const d = Math.hypot(px - ox, py - oy);

        // Radio físico del objeto según su catálogo o mínimo de pantalla
        const cat = (typeof OBJECTS_CATALOG !== "undefined" && OBJECTS_CATALOG[obj.catalogId]) || { lengthM: 4.5, widthM: 1.8 };
        const halfL = ((cat.lengthM || 4) / mpp / 2);
        const halfW = ((cat.widthM || 2) / mpp / 2);
        const objRadius = Math.max(snapDistPx, Math.max(halfL, halfW));

        if (d <= objRadius && d < minDist) {
          minDist = d;
          bestSnap = {
            normX: obj.normX,
            normY: obj.normY,
            label: obj.name || "Vehículo",
            type: "object",
          };
        }

        // Puntos de trayectoria (Punto de impacto POI, inicio frenado, reposo final)
        if (obj.kinematics && Array.isArray(obj.kinematics.trajectoryPoints)) {
          for (const tp of obj.kinematics.trajectoryPoints) {
            const tpx = tp.normX * w;
            const tpy = tp.normY * h;
            const td = Math.hypot(px - tpx, py - tpy);
            if (td < minDist) {
              minDist = td;
              const isImpact = tp.type === "impact_point" || tp.role === "impact_point";
              const isBrake = tp.type === "brake_start" || tp.role === "brake_start";
              const isRest = tp.type === "final_rest" || tp.role === "final_rest";
              const tpLabel = isImpact
                ? "💥 Impacto (POI)"
                : isBrake
                  ? "〰️ Inicio Frenado"
                  : isRest
                    ? "🛑 Reposo Final"
                    : "Punto de Ruta";
              bestSnap = {
                normX: tp.normX,
                normY: tp.normY,
                label: tpLabel,
                type: "trajectory",
              };
            }
          }
        }
      }
    }

    // 2. Snapping a Vértices y Bordes de Zonas (Andén, Separador, Calzada, Edificación)
    if (Array.isArray(state.zones)) {
      for (const zone of state.zones) {
        if (!Array.isArray(zone.points) || zone.points.length === 0) continue;
        const zName = zone.name || (zone.type === "sidewalk" ? "Andén" : "Borde Vía");

        // 2a. Vértices de la zona
        for (const pt of zone.points) {
          const vx = pt.x * w;
          const vy = pt.y * h;
          const d = Math.hypot(px - vx, py - vy);
          if (d < minDist) {
            minDist = d;
            bestSnap = {
              normX: pt.x,
              normY: pt.y,
              label: `${zName} (Vértice)`,
              type: "zone_vertex",
            };
          }
        }

        // 2b. Bordes / Aristas longitudinales del andén o calzada
        const pts = zone.points;
        for (let i = 0; i < pts.length; i++) {
          const pA = pts[i];
          const pB = pts[(i + 1) % pts.length];
          const ax = pA.x * w, ay = pA.y * h;
          const bx = pB.x * w, by = pB.y * h;
          const dx = bx - ax, dy = by - ay;
          const lenSq = dx * dx + dy * dy;
          if (lenSq > 0) {
            const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
            const projX = ax + t * dx;
            const projY = ay + t * dy;
            const dEdge = Math.hypot(px - projX, py - projY);
            if (dEdge < minDist) {
              minDist = dEdge;
              bestSnap = {
                normX: projX / w,
                normY: projY / h,
                label: `${zName} (Borde)`,
                type: "zone_edge",
              };
            }
          }
        }
      }
    }

    return bestSnap;
  }

  // Constructor de objetos de cota
  function createDimension(params) {
    const { p1, p2, state, label } = params;
    const sz = getEffectiveSizeMeters(state);
    const distanceMeters = calcDistanceMeters(p1, p2, state);

    const dx = (p2.normX - p1.normX) * sz;
    const dy = -(p2.normY - p1.normY) * sz;
    let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (ang < 0) ang += 360;
    const angleDeg = Math.round(ang);

    return {
      id: "dim_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      type: "linear",
      label: label || "Distancia",
      distanceMeters,
      valueMeters: distanceMeters,
      angleDeg,
      p1: { normX: p1.normX, normY: p1.normY },
      p2: { normX: p2.normX, normY: p2.normY },
      textOffset: { x: 0, y: 0 },
      timestamp: Date.now(),
    };
  }

  // Detecta si el cursor hace clic sobre un extremo A, extremo B, etiqueta o cuerpo de la línea
  function getDimensionAtCoords(coords, state, canvasWidth, canvasHeight) {
    if (!Array.isArray(state.dimensions) || state.dimensions.length === 0) {
      return null;
    }
    const w = canvasWidth;
    const h = canvasHeight;
    const px = coords.normX * w;
    const py = coords.normY * h;
    const zoom = Math.max(0.4, state.zoom || 1.0);
    const handleRadius = 14 / zoom;
    const lineHitRadius = 10 / zoom;

    for (let i = state.dimensions.length - 1; i >= 0; i--) {
      const dim = state.dimensions[i];
      if (!dim.p1 || !dim.p2) continue;

      const p1x = dim.p1.normX * w;
      const p1y = dim.p1.normY * h;
      const p2x = dim.p2.normX * w;
      const p2y = dim.p2.normY * h;

      // 1. Clic en Extremo A (p1)
      if (Math.hypot(px - p1x, py - p1y) <= handleRadius) {
        return {
          dimension: dim,
          index: i,
          hitTarget: "p1",
          isHandle: true,
        };
      }

      // 2. Clic en Extremo B (p2)
      if (Math.hypot(px - p2x, py - p2y) <= handleRadius) {
        return {
          dimension: dim,
          index: i,
          hitTarget: "p2",
          isHandle: true,
        };
      }

      // 3. Clic en la etiqueta de texto
      const offX = (dim.textOffset?.x || 0) / zoom;
      const offY = (dim.textOffset?.y || 0) / zoom;
      const midX = (p1x + p2x) / 2 + offX;
      const midY = (p1y + p2y) / 2 + offY;

      if (Math.hypot(px - midX, py - midY) <= handleRadius * 1.6) {
        return {
          dimension: dim,
          index: i,
          hitTarget: "text",
          isText: true,
        };
      }

      // 4. Clic en el cuerpo del segmento
      const dx = p2x - p1x;
      const dy = p2y - p1y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq > 0) {
        const t = ((px - p1x) * dx + (py - p1y) * dy) / lenSq;
        if (t >= 0 && t <= 1) {
          const nearX = p1x + t * dx;
          const nearY = p1y + t * dy;
          if (Math.hypot(px - nearX, py - nearY) <= lineHitRadius) {
            return {
              dimension: dim,
              index: i,
              hitTarget: "line",
              isLine: true,
            };
          }
        }
      }
    }
    return null;
  }

  // Dibuja una flecha en un extremo de la cota
  function drawArrowHead(ctx, fromX, fromY, toX, toY, size) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - size * Math.cos(angle - Math.PI / 6),
      toY - size * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      toX - size * Math.cos(angle + Math.PI / 6),
      toY - size * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Renderizado limpio de cotas sobre el Canvas 2D
  function renderSceneDimensions(ctx, w, h, state) {
    const zoom = Math.max(0.2, state.zoom || 1.0);

    // 1. Renderizar Cotas de Distancia Existentes
    if (Array.isArray(state.dimensions)) {
      state.dimensions.forEach((dim) => {
        if (!dim.p1 || !dim.p2) return;
        const isSelected = state.selectedDimensionId === dim.id;
        const isHovered = state.hoveredDimensionId === dim.id;

        const p1x = dim.p1.normX * w;
        const p1y = dim.p1.normY * h;
        const p2x = dim.p2.normX * w;
        const p2y = dim.p2.normY * h;

        const baseColor = isSelected ? "#00f0ff" : isHovered ? "#fde047" : "#f59e0b";

        ctx.save();

        // Línea principal de cota
        ctx.beginPath();
        ctx.moveTo(p1x, p1y);
        ctx.lineTo(p2x, p2y);
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = (isSelected ? 3.0 : isHovered ? 2.4 : 1.8) / zoom;
        ctx.stroke();

        // Flechas en los extremos
        const arrowSz = (isSelected ? 10 : 8) / zoom;
        ctx.fillStyle = baseColor;
        drawArrowHead(ctx, p1x, p1y, p2x, p2y, arrowSz);
        drawArrowHead(ctx, p2x, p2y, p1x, p1y, arrowSz);

        // Tiradores circulares en los extremos A y B (para arrastrar fácilmente)
        const handleR = (isSelected ? 6.5 : isHovered ? 5.5 : 4.0) / zoom;
        [
          [p1x, p1y, "A"],
          [p2x, p2y, "B"],
        ].forEach(([px, py, tag]) => {
          ctx.beginPath();
          ctx.arc(px, py, handleR, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? "#00f0ff" : "#ffffff";
          ctx.strokeStyle = "#0f172a";
          ctx.lineWidth = 1.8 / zoom;
          ctx.fill();
          ctx.stroke();

          if (isSelected || isHovered) {
            ctx.fillStyle = "#0f172a";
            ctx.font = `bold ${Math.max(7, Math.round(8 / Math.sqrt(zoom)))}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(tag, px, py);
          }
        });

        // Etiqueta de texto de la cota
        const offX = (dim.textOffset?.x || 0) / zoom;
        const offY = (dim.textOffset?.y || 0) / zoom;
        const midX = (p1x + p2x) / 2 + offX;
        const midY = (p1y + p2y) / 2 + offY;

        const distM = dim.distanceMeters ?? dim.valueMeters ?? calcDistanceMeters(dim.p1, dim.p2, state);
        const textStr = formatMeters(distM);

        const fontSize = Math.max(9, Math.round(11 / Math.sqrt(zoom)));
        ctx.font = isSelected
          ? `bold ${fontSize + 1}px "JetBrains Mono", ui-monospace, monospace`
          : `600 ${fontSize}px "JetBrains Mono", ui-monospace, monospace`;

        const tm = ctx.measureText(textStr);
        const padX = 5 / zoom;
        const padY = 3 / zoom;
        const boxW = tm.width + padX * 2;
        const boxH = fontSize + padY * 2;

        // Línea guía si la etiqueta fue desplazada manualmente
        if (Math.hypot(offX, offY) > 6 / zoom) {
          ctx.beginPath();
          ctx.moveTo((p1x + p2x) / 2, (p1y + p2y) / 2);
          ctx.lineTo(midX, midY);
          ctx.strokeStyle = "rgba(245, 158, 11, 0.55)";
          ctx.lineWidth = 1.0 / zoom;
          ctx.setLineDash([3 / zoom, 3 / zoom]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Cajetín de fondo
        ctx.fillStyle = isSelected
          ? "rgba(15, 23, 42, 0.98)"
          : "rgba(15, 23, 42, 0.90)";
        ctx.fillRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH);

        ctx.strokeStyle = isSelected ? "#00f0ff" : baseColor;
        ctx.lineWidth = (isSelected ? 1.8 : 1.2) / zoom;
        ctx.strokeRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH);

        ctx.fillStyle = isSelected ? "#00f0ff" : "#fef3c7";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(textStr, midX, midY);

        ctx.restore();
      });
    }

    // 2. Previsualización elástica interactiva al trazar cota
    if (state.activeMode === "dimension" && state.dimensionDraft) {
      const draft = state.dimensionDraft;
      if (draft.p1 && state.mouseCanvasCoords) {
        const snap = state.dimensionSnap;
        const targetCoords = snap
          ? { normX: snap.normX, normY: snap.normY }
          : state.mouseCanvasCoords;

        const p1x = draft.p1.normX * w;
        const p1y = draft.p1.normY * h;
        const p2x = targetCoords.normX * w;
        const p2y = targetCoords.normY * h;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p1x, p1y);
        ctx.lineTo(p2x, p2y);
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2.0 / zoom;
        ctx.setLineDash([5 / zoom, 4 / zoom]);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p1x, p1y, 4.5 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = "#38bdf8";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p2x, p2y, 4.5 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = snap ? "#10b981" : "#38bdf8";
        ctx.fill();

        const tempDist = calcDistanceMeters(draft.p1, targetCoords, state);
        const tempStr = formatMeters(tempDist);

        const midX = (p1x + p2x) / 2;
        const midY = (p1y + p2y) / 2 - 14 / zoom;

        const fontSize = Math.max(9, Math.round(11 / Math.sqrt(zoom)));
        ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;
        const tm = ctx.measureText(tempStr);
        const pad = 3 / zoom;

        ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
        ctx.fillRect(
          midX - tm.width / 2 - pad,
          midY - fontSize / 2 - pad,
          tm.width + pad * 2,
          fontSize + pad * 2,
        );
        ctx.strokeStyle = snap ? "#10b981" : "#38bdf8";
        ctx.lineWidth = 1 / zoom;
        ctx.strokeRect(
          midX - tm.width / 2 - pad,
          midY - fontSize / 2 - pad,
          tm.width + pad * 2,
          fontSize + pad * 2,
        );

        ctx.fillStyle = snap ? "#10b981" : "#38bdf8";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(tempStr, midX, midY);

        ctx.restore();
      }
    }

    // 3. Indicador de imán / snapping visual
    if (state.activeMode === "dimension" && state.dimensionSnap) {
      const snap = state.dimensionSnap;
      const sx = snap.normX * w;
      const sy = snap.normY * h;

      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, 8 / zoom, 0, Math.PI * 2);
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 2.2 / zoom;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sx, sy, 3 / zoom, 0, Math.PI * 2);
      ctx.fillStyle = "#10b981";
      ctx.fill();

      // Tooltip flotante con el nombre del elemento enganchado
      const snapFontSize = Math.max(8.5, Math.round(10 / Math.sqrt(zoom)));
      ctx.font = `600 ${snapFontSize}px Inter, sans-serif`;
      const sm = ctx.measureText(snap.label);
      const pad = 3 / zoom;
      const badgeY = sy - 14 / zoom;

      ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
      ctx.fillRect(
        sx - sm.width / 2 - pad,
        badgeY - snapFontSize / 2 - pad,
        sm.width + pad * 2,
        snapFontSize + pad * 2,
      );
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 1 / zoom;
      ctx.strokeRect(
        sx - sm.width / 2 - pad,
        badgeY - snapFontSize / 2 - pad,
        sm.width + pad * 2,
        snapFontSize + pad * 2,
      );

      ctx.fillStyle = "#34d399";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(snap.label, sx, badgeY);

      ctx.restore();
    }
  }

  function handleMouseMove(coords, state, ui) {
    if (
      state.activeMode !== "dimension" &&
      !state.draggingDimension &&
      !state.draggingDimensionText
    ) {
      return false;
    }

    // Calcular captura magnética
    const snap = findSnapPoint(coords, state, ui.canvas.width, ui.canvas.height);
    state.dimensionSnap = snap;
    const effectiveCoords = snap
      ? { normX: snap.normX, normY: snap.normY }
      : coords;

    // 1. Arrastre de extremos A/B o del segmento completo
    if (state.draggingDimension) {
      const dim = (state.dimensions || []).find(
        (d) => d.id === state.draggingDimension.id,
      );
      if (dim) {
        if (state.draggingDimension.target === "p1") {
          dim.p1.normX = effectiveCoords.normX;
          dim.p1.normY = effectiveCoords.normY;
          dim.distanceMeters = calcDistanceMeters(dim.p1, dim.p2, state);
          dim.valueMeters = dim.distanceMeters;
          ui.canvas.style.cursor = "crosshair";
        } else if (state.draggingDimension.target === "p2") {
          dim.p2.normX = effectiveCoords.normX;
          dim.p2.normY = effectiveCoords.normY;
          dim.distanceMeters = calcDistanceMeters(dim.p1, dim.p2, state);
          dim.valueMeters = dim.distanceMeters;
          ui.canvas.style.cursor = "crosshair";
        } else if (state.draggingDimension.target === "line") {
          const dx = coords.normX - state.draggingDimension.startNormX;
          const dy = coords.normY - state.draggingDimension.startNormY;
          dim.p1.normX = state.draggingDimension.origP1.normX + dx;
          dim.p1.normY = state.draggingDimension.origP1.normY + dy;
          dim.p2.normX = state.draggingDimension.origP2.normX + dx;
          dim.p2.normY = state.draggingDimension.origP2.normY + dy;
          ui.canvas.style.cursor = "move";
        }
        return true;
      }
    }

    // 2. Arrastre de etiqueta de texto
    if (state.draggingDimensionText) {
      const dim = (state.dimensions || []).find(
        (d) => d.id === state.draggingDimensionText.id,
      );
      if (dim) {
        dim.textOffset = {
          x:
            (coords.canvasPxX - state.draggingDimensionText.startPxX) /
            state.zoom,
          y:
            (coords.canvasPxY - state.draggingDimensionText.startPxY) /
            state.zoom,
        };
        ui.canvas.style.cursor = "move";
        return true;
      }
    }

    // 3. Trazado preliminar (drafting en progreso)
    if (state.dimensionDraft) {
      ui.canvas.style.cursor = snap ? "pointer" : "crosshair";
      return true; // Fuerza repaintScene() para previsualización elástica a 60 FPS
    }

    // 4. Cursor según elemento bajo el puntero
    const hit = getDimensionAtCoords(
      coords,
      state,
      ui.canvas.width,
      ui.canvas.height,
    );
    if (hit) {
      if (hit.hitTarget === "p1" || hit.hitTarget === "p2") {
        ui.canvas.style.cursor = "grab";
      } else if (hit.hitTarget === "line" || hit.hitTarget === "text") {
        ui.canvas.style.cursor = "move";
      }
      state.hoveredDimensionId = hit.dimension.id;
      return true;
    }

    if (state.hoveredDimensionId) {
      state.hoveredDimensionId = null;
      return true;
    }

    if (snap) {
      ui.canvas.style.cursor = "pointer";
      return true;
    }

    ui.canvas.style.cursor = "crosshair";
    return true;
  }

  function handleMouseDown(coords, state, ui, helpers) {
    if (state.activeMode !== "dimension") return false;

    const { History, scheduleSave, repaintScene, showToast } = helpers;

    // 1. Clic en cota existente o sus tiradores A/B
    const dimHit = getDimensionAtCoords(
      coords,
      state,
      ui.canvas.width,
      ui.canvas.height,
    );
    if (dimHit) {
      if (History) History.push();
      state.selectedDimensionId = dimHit.dimension.id;

      if (dimHit.hitTarget === "p1") {
        state.draggingDimension = {
          id: dimHit.dimension.id,
          target: "p1",
        };
        repaintScene();
        return true;
      }

      if (dimHit.hitTarget === "p2") {
        state.draggingDimension = {
          id: dimHit.dimension.id,
          target: "p2",
        };
        repaintScene();
        return true;
      }

      if (dimHit.hitTarget === "line") {
        state.draggingDimension = {
          id: dimHit.dimension.id,
          target: "line",
          startNormX: coords.normX,
          startNormY: coords.normY,
          origP1: {
            normX: dimHit.dimension.p1.normX,
            normY: dimHit.dimension.p1.normY,
          },
          origP2: {
            normX: dimHit.dimension.p2.normX,
            normY: dimHit.dimension.p2.normY,
          },
        };
        repaintScene();
        return true;
      }

      if (dimHit.hitTarget === "text") {
        state.draggingDimensionText = {
          id: dimHit.dimension.id,
          startPxX:
            coords.canvasPxX -
            ((dimHit.dimension.textOffset?.x || 0) * state.zoom),
          startPxY:
            coords.canvasPxY -
            ((dimHit.dimension.textOffset?.y || 0) * state.zoom),
        };
        repaintScene();
        return true;
      }

      repaintScene();
      showToast(
        `Cota seleccionada (${formatMeters(dimHit.dimension.distanceMeters)}). Arrastra los extremos A/B o el cuerpo del segmento.`,
      );
      return true;
    }

    // 2. Usar punto magnético si está enganchado a un vehículo, andén o impacto
    const snap = state.dimensionSnap;
    const effectiveCoords = snap
      ? { normX: snap.normX, normY: snap.normY }
      : coords;

    // 3. Trazado interactivo entre dos cuerpos o puntos
    if (!state.dimensionDraft) {
      state.dimensionDraft = {
        p1: { normX: effectiveCoords.normX, normY: effectiveCoords.normY },
      };
      const labelMsg = snap ? `Punto fijado en ${snap.label}.` : "Primer punto fijado.";
      showToast(`${labelMsg} Haz clic en el segundo cuerpo o punto.`);
      repaintScene();
    } else {
      if (History) History.push();
      const p1 = state.dimensionDraft.p1;
      const p2 = {
        normX: effectiveCoords.normX,
        normY: effectiveCoords.normY,
      };
      const rawDistance = calcDistanceMeters(p1, p2, state);

      const dim = createDimension({
        p1,
        p2,
        state,
      });

      // Permitir asignarle inmediatamente el valor métrico exacto si el usuario lo desea
      const inputVal = prompt(
        "Medida en metros para esta distancia:\n(Presiona Enter para usar la medida calculada o ingresa el valor exacto)",
        rawDistance.toFixed(2),
      );
      if (inputVal !== null) {
        const parsed = parseFloat(inputVal.replace(",", "."));
        if (!isNaN(parsed) && parsed > 0) {
          dim.distanceMeters = parsed;
          dim.valueMeters = parsed;
        }
      }

      state.dimensions.push(dim);
      state.selectedDimensionId = dim.id;
      state.dimensionDraft = null;
      scheduleSave();
      repaintScene();
      showToast(
        `Distancia asignada: ${formatMeters(dim.distanceMeters)}. Puedes arrastrar los extremos A/B o el segmento completo.`,
      );
    }
    return true;
  }

  // Modifica el valor métrico de la cota seleccionada
  function editSelectedDimensionValue(state, helpers) {
    if (!state.selectedDimensionId) {
      if (helpers.showToast)
        helpers.showToast("Selecciona primero una cota en el plano.");
      return;
    }
    const dim = (state.dimensions || []).find(
      (d) => d.id === state.selectedDimensionId,
    );
    if (!dim) return;

    const currentVal = (dim.distanceMeters || 0).toFixed(2);
    const inputVal = prompt(
      "Asignar o editar medida en metros para esta distancia:",
      currentVal,
    );
    if (inputVal !== null) {
      const parsed = parseFloat(inputVal.replace(",", "."));
      if (!isNaN(parsed) && parsed > 0) {
        if (helpers.History) helpers.History.push();
        dim.distanceMeters = parsed;
        dim.valueMeters = parsed;
        if (helpers.scheduleSave) helpers.scheduleSave();
        if (helpers.repaintScene) helpers.repaintScene();
        if (helpers.showToast)
          helpers.showToast(`Distancia actualizada: ${formatMeters(parsed)}`);
      }
    }
  }

  return {
    formatMeters,
    formatAngle,
    getEffectiveSizeMeters,
    calcDistanceMeters,
    findSnapPoint,
    createDimension,
    getDimensionAtCoords,
    renderSceneDimensions,
    handleMouseMove,
    handleMouseDown,
    editSelectedDimensionValue,
  };
});
