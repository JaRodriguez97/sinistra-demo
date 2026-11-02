/**
 * render_2d_vehicles.js
 * Módulo de renderizado overhead 2D para siluetas de vehículos, peatones, mobiliario,
 * huellas de frenado dinámicas, trayectorias vectoriales y gizmos de control.
 * Compatible con scripts clásicos en navegador (<script src="...">) y con módulos ESM.
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.drawSkidMarks = exports.drawSkidMarks;
    root.drawArrowHead = exports.drawArrowHead;
    root.drawTrajectories = exports.drawTrajectories;
    root.drawObjects = exports.drawObjects;
    root.drawObjectGizmo = exports.drawObjectGizmo;
  }
})(typeof self !== "undefined" ? self : this, function () {
  /**
   * Dibuja huellas de frenado sobre la calzada o andén
   */
  function drawSkidMarks(ctx, w, h) {
    const currentState = typeof state !== "undefined" ? state : window.state;
    if (!currentState || !Array.isArray(currentState.objects)) return;

    const skids = currentState.objects.filter(
      (o) => o.catalogId === "huella_frenado" || o.category === "evidencia",
    );
    const mpp = currentState.metadata?.metersPerPixel || 0.125;
    const zoom = currentState.zoom || 1.0;

    skids.forEach((s) => {
      const isSelected = s.id === currentState.selectedObjectId;
      const ox = s.normX * w;
      const oy = s.normY * h;
      const rad = ((s.rotationDeg || 0) * Math.PI) / 180;
      const lenPx = (s.skidLengthM || 10) / mpp;
      const trackPx = (s.skidTrackWidthM || 1.5) / mpp;
      const tirePx = Math.max(3, 0.22 / mpp);

      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(rad);

      if (s.catalogId === "huella_derrape") {
        ctx.fillStyle = s.triggerOnPass
          ? "rgba(38, 38, 38, 0.4)"
          : "rgba(23, 23, 23, 0.85)";

        ctx.beginPath();
        ctx.roundRect(-lenPx, -trackPx / 2, lenPx, trackPx, 3 / zoom);
        ctx.fill();

        ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
        ctx.lineWidth = 1.5 / zoom;
        const numLines = Math.floor(lenPx / (6 / zoom));
        for (let i = 0; i < numLines; i++) {
          const lx = -lenPx + i * (6 / zoom);
          ctx.beginPath();
          ctx.moveTo(lx, -trackPx / 2);
          ctx.lineTo(lx + 8 / zoom, trackPx / 2);
          ctx.stroke();
        }
      } else if (s.catalogId === "escombros") {
        const halfL = lenPx / 2;
        const halfW = trackPx / 2;
        ctx.fillStyle = "rgba(224, 242, 254, 0.5)";
        ctx.beginPath();
        ctx.ellipse(0, 0, halfL, halfW, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(56, 189, 248, 0.7)";
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        const shards = [
          [-halfL * 0.4, -halfW * 0.3],
          [halfL * 0.2, -halfW * 0.5],
          [-halfL * 0.1, halfW * 0.4],
          [halfL * 0.5, halfW * 0.2],
          [0, 0],
          [-halfL * 0.6, halfW * 0.1],
          [halfL * 0.3, -halfW * 0.1],
        ];
        shards.forEach(([sx, sy]) => {
          ctx.fillRect(sx, sy, 3 / zoom, 3 / zoom);
        });
      } else if (s.catalogId === "mancha_aceite") {
        const halfL = lenPx / 2;
        const halfW = trackPx / 2;
        ctx.fillStyle = "rgba(30, 27, 75, 0.88)";
        ctx.beginPath();
        ctx.ellipse(0, 0, halfL, halfW, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(99, 102, 241, 0.4)";
        ctx.lineWidth = 1.5 / zoom;
        ctx.stroke();

        ctx.fillStyle = "rgba(168, 85, 247, 0.35)";
        ctx.beginPath();
        ctx.ellipse(
          halfL * 0.2,
          -halfW * 0.2,
          halfL * 0.45,
          halfW * 0.45,
          -0.3,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else {
        const curLenPx = s.triggerOnPass
          ? lenPx *
            (s._simFraction !== undefined
              ? s._simFraction
              : typeof Simulation !== "undefined" && Simulation.currentTime > 0
                ? 1
                : 0)
          : lenPx;

        if (s.triggerOnPass && curLenPx <= 0.1) {
          ctx.restore();
          return;
        }

        ctx.fillStyle = s.triggerOnPass
          ? "rgba(15, 23, 42, 0.95)"
          : "rgba(15, 23, 42, 0.85)";

        ctx.beginPath();
        ctx.roundRect(
          -curLenPx,
          -trackPx / 2 - tirePx / 2,
          curLenPx,
          tirePx,
          2 / zoom,
        );
        ctx.fill();

        ctx.beginPath();
        ctx.roundRect(
          -curLenPx,
          trackPx / 2 - tirePx / 2,
          curLenPx,
          tirePx,
          2 / zoom,
        );
        ctx.fill();
      }

      if (isSelected) {
        ctx.strokeStyle = "#00f0ff";
        ctx.lineWidth = 1.5 / zoom;
        ctx.strokeRect(
          -lenPx,
          -trackPx / 2 - tirePx / 2,
          lenPx,
          trackPx + tirePx,
        );
      }

      if (s.triggerOnPass) {
        ctx.font = `italic ${Math.max(9, Math.round(9 / Math.sqrt(zoom)))}px Inter, sans-serif`;
        ctx.fillStyle = "#38bdf8";
        ctx.textAlign = "center";
        ctx.fillText(
          s._simFraction && s._simFraction > 0
            ? "〰️ Frenado activo (al paso)"
            : "〰️ Dinámica (al pasar auto)",
          -lenPx / 2,
          0,
        );
      }

      ctx.restore();
    });
  }

  /**
   * Dibuja flechas directrices a lo largo de un vector
   */
  function drawArrowHead(ctx, fromX, fromY, toX, toY, sizePx) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - sizePx * Math.cos(angle - Math.PI / 6),
      toY - sizePx * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      toX - sizePx * Math.cos(angle + Math.PI / 6),
      toY - sizePx * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * Dibuja las trayectorias vectoriales y cinemáticas de los vehículos
   */
  function drawTrajectories(ctx, w, h) {
    const currentState = typeof state !== "undefined" ? state : window.state;
    if (!currentState || !Array.isArray(currentState.objects)) return;
    const zoom = currentState.zoom || 1.0;

    currentState.objects.forEach((obj) => {
      if (
        !obj.kinematics ||
        !obj.kinematics.trajectoryPoints ||
        obj.kinematics.trajectoryPoints.length < 2
      )
        return;
      const pts = obj.kinematics.trajectoryPoints;
      const isSelected = obj.id === currentState.selectedObjectId;

      ctx.save();
      const isCurved = obj.kinematics.curveMode !== "linear" && pts.length >= 3 && typeof KinematicsEngine !== "undefined" && KinematicsEngine.evalSplineSegment;
      const tau = obj.kinematics.curveTension !== undefined ? obj.kinematics.curveTension : (obj.kinematics.curveMode === "tight" ? 0.28 : (obj.kinematics.curveMode === "wide" ? 0.72 : 0.5));

      ctx.beginPath();
      if (!isCurved) {
        pts.forEach((p, i) => { const px = p.normX * w, py = p.normY * h; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
      } else {
        const segSteps = 12;
        let isFirst = true;
        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = { x: pts[i].normX * w, y: pts[i].normY * h };
          const p2 = { x: pts[i + 1].normX * w, y: pts[i + 1].normY * h };
          const p0 = i > 0 ? { x: pts[i - 1].normX * w, y: pts[i - 1].normY * h } : { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
          const p3 = i + 2 < pts.length ? { x: pts[i + 2].normX * w, y: pts[i + 2].normY * h } : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
          for (let s = (isFirst ? 0 : 1); s <= segSteps; s++) {
            const spt = KinematicsEngine.evalSplineSegment(p0, p1, p2, p3, s / segSteps, tau);
            if (isFirst && s === 0) { ctx.moveTo(spt.x, spt.y); isFirst = false; } else { ctx.lineTo(spt.x, spt.y); }
          }
        }
      }

      ctx.strokeStyle = isSelected ? "#f97316" : "rgba(249, 115, 22, 0.65)";
      ctx.lineWidth = (isSelected ? 3.0 : 2.0) / zoom;
      ctx.setLineDash([8 / zoom, 5 / zoom]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#f97316";
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = { x: pts[i].normX * w, y: pts[i].normY * h };
        const p2 = { x: pts[i + 1].normX * w, y: pts[i + 1].normY * h };
        if (!isCurved) {
          drawArrowHead(ctx, p1.x, p1.y, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2, 8 / zoom);
        } else {
          const p0 = i > 0 ? { x: pts[i - 1].normX * w, y: pts[i - 1].normY * h } : { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
          const p3 = i + 2 < pts.length ? { x: pts[i + 2].normX * w, y: pts[i + 2].normY * h } : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
          const m = KinematicsEngine.evalSplineSegment(p0, p1, p2, p3, 0.5, tau);
          drawArrowHead(ctx, m.x - m.tx * 0.1, m.y - m.ty * 0.1, m.x, m.y, 8 / zoom);
        }
      }

      pts.forEach((p, i) => {
        const px = p.normX * w,
          py = p.normY * h;
        ctx.beginPath();
        const r = (p.type === "impact_point" ? 7 : 5) / zoom;
        ctx.arc(px, py, r, 0, Math.PI * 2);

        let color = "#38bdf8";
        let label = "";
        if (p.type === "brake_start") {
          color = "#facc15";
          label = "Frenado";
        } else if (p.type === "impact_point") {
          color = "#ef4444";
          label = "💥 Impacto";
        } else if (p.type === "final_rest") {
          color = "#f97316";
          label = "Reposo";
        } else if (i === 0) {
          label = "Inicio";
        }

        const isPtSelected =
          typeof state !== "undefined" &&
          state.selectedTrajPoint &&
          state.selectedTrajPoint.objectId === obj.id &&
          state.selectedTrajPoint.pointIndex === i;

        ctx.fillStyle = color;
        ctx.strokeStyle = isPtSelected ? "#00f0ff" : "#ffffff";
        ctx.lineWidth = (isPtSelected ? 3.2 : 1.8) / zoom;
        ctx.fill();
        ctx.stroke();

        if (isPtSelected) {
          ctx.beginPath();
          ctx.arc(px, py, r + 4 / zoom, 0, Math.PI * 2);
          ctx.strokeStyle = "#00f0ff";
          ctx.lineWidth = 2 / zoom;
          ctx.stroke();
        }

        if (label && isSelected) {
          ctx.font = `600 ${Math.max(9, Math.round(9 / Math.sqrt(zoom)))}px Inter, sans-serif`;
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.fillText(label, px, py - 9 / zoom);
        }
      });

      // Marcador de Posición Final de Reposo de la Motocicleta / Vehículo
      if (
        (obj.catalogId === "moto" || obj.type === "moto" || (obj.category === "vehiculo" && obj.isAccidentInvolved)) &&
        pts.length >= 2
      ) {
        const pImpact = pts.find((p) => p.type === "impact_point") || pts[pts.length - 1];
        if (pImpact) {
          const mpp = (state?.metadata?.metersPerPixel) || 0.125;
          let mx, my;
          const pRest = pts.find((p) => p.type === "final_rest");
          if (pRest) {
            mx = pRest.normX * w;
            my = pRest.normY * h;
          } else if (obj.finalRest && obj.finalRest.normX !== undefined) {
            mx = obj.finalRest.normX * w;
            my = obj.finalRest.normY * h;
          } else {
            const idxImp = pts.indexOf(pImpact);
            let fwdAng = ((obj.rotationDeg || 0) * Math.PI) / 180;
            if (idxImp > 0) {
              fwdAng = Math.atan2(pImpact.normY - pts[idxImp - 1].normY, pImpact.normX - pts[idxImp - 1].normX);
            }
            const devRad = ((obj.deviationAngleDeg || 0) * Math.PI) / 180;
            const targetAng = fwdAng + devRad;
            const distM = obj.finalRestDistanceM !== undefined ? obj.finalRestDistanceM : 5.0;
            const distPx = distM / mpp;
            mx = pImpact.normX * w + Math.cos(targetAng) * distPx;
            my = pImpact.normY * h + Math.sin(targetAng) * distPx;
          }

          // Línea de proyección punteada hacia reposo de la moto
          ctx.beginPath();
          ctx.setLineDash([4 / zoom, 4 / zoom]);
          ctx.moveTo(pImpact.normX * w, pImpact.normY * h);
          ctx.lineTo(mx, my);
          ctx.strokeStyle = "rgba(249, 115, 22, 0.85)";
          ctx.lineWidth = 1.6 / zoom;
          ctx.stroke();
          ctx.setLineDash([]);

          // Marcador circular del reposo de la motocicleta
          const rMoto = 8 / zoom;
          ctx.beginPath();
          ctx.arc(mx, my, rMoto, 0, Math.PI * 2);
          ctx.fillStyle = "#ea580c";
          ctx.strokeStyle = isSelected ? "#fef08a" : "#ffffff";
          ctx.lineWidth = 2 / zoom;
          ctx.fill();
          ctx.stroke();

          if (isSelected) {
            ctx.font = `700 ${Math.max(9, Math.round(9 / Math.sqrt(zoom)))}px Inter, sans-serif`;
            ctx.fillStyle = "#f97316";
            ctx.textAlign = "center";
            const lbl = (obj.catalogId === "moto" || obj.type === "moto") ? "🏍️ Reposo Moto" : "🏁 Reposo Vehículo";
            ctx.fillText(lbl, mx, my - 11 / zoom);
          }
        }
      }

      // Marcador de Posición Final de Reposo del Conductor (Motocicleta)
      if (
        (obj.catalogId === "moto" || obj.type === "moto") &&
        (!obj.rider || obj.rider.enabled !== false)
      ) {
        const pImpact =
          pts.find((p) => p.type === "impact_point") || pts[pts.length - 1];
        if (pImpact) {
          const mpp =
            (typeof state !== "undefined" &&
              state.metadata &&
              state.metadata.metersPerPixel) ||
            0.125;
          let rx, ry;
          if (
            obj.rider &&
            obj.rider.finalRest &&
            obj.rider.finalRest.normX !== undefined
          ) {
            rx = obj.rider.finalRest.normX * w;
            ry = obj.rider.finalRest.normY * h;
          } else {
            const idxImp = pts.indexOf(pImpact);
            let fwdAng = ((obj.rotationDeg || 0) * Math.PI) / 180;
            if (idxImp > 0) {
              fwdAng = Math.atan2(
                pImpact.normY - pts[idxImp - 1].normY,
                pImpact.normX - pts[idxImp - 1].normX,
              );
            }
            const devRad = ((obj.deviationAngleDeg || 0) * Math.PI) / 180;
            const targetAng = fwdAng + devRad;
            const distM =
              (obj.rider &&
                (obj.rider.finalRestDistanceM ||
                  (obj.rider.finalRest && obj.rider.finalRest.distanceM))) ||
              6.0;
            const distPx = distM / mpp;
            rx = pImpact.normX * w + Math.cos(targetAng) * distPx;
            ry = pImpact.normY * h + Math.sin(targetAng) * distPx;
          }

          // Línea de proyección punteada desde el impacto hasta el reposo del conductor
          ctx.beginPath();
          ctx.setLineDash([4 / zoom, 4 / zoom]);
          ctx.moveTo(pImpact.normX * w, pImpact.normY * h);
          ctx.lineTo(rx, ry);
          ctx.strokeStyle = "rgba(56, 189, 248, 0.75)";
          ctx.lineWidth = 1.5 / zoom;
          ctx.stroke();
          ctx.setLineDash([]);

          // Marcador circular del reposo del conductor
          const rRider = 7 / zoom;
          ctx.beginPath();
          ctx.arc(rx, ry, rRider, 0, Math.PI * 2);
          ctx.fillStyle = "#0284c7";
          ctx.strokeStyle = isSelected ? "#00f0ff" : "#ffffff";
          ctx.lineWidth = 2 / zoom;
          ctx.fill();
          ctx.stroke();

          // Icono y etiqueta legible
          if (isSelected) {
            ctx.font = `700 ${Math.max(9, Math.round(9 / Math.sqrt(zoom)))}px Inter, sans-serif`;
            ctx.fillStyle = "#38bdf8";
            ctx.textAlign = "center";
            ctx.fillText("👤 Reposo Conductor", rx, ry - 10 / zoom);
          }
        }
      }

      ctx.restore();
    });
  }

  /**
   * Renderizado de todos los objetos en el plano 2D
   */
  function drawObjects(ctx, w, h) {
    const currentState = typeof state !== "undefined" ? state : window.state;
    if (!currentState || !Array.isArray(currentState.objects)) return;
    const mpp = currentState.metadata?.metersPerPixel || 0.125;
    const zoom = currentState.zoom || 1.0;

    currentState.objects.forEach((obj) => {
      if (obj.catalogId === "huella_frenado" || obj.category === "evidencia")
        return;

      const isSelected = obj.id === currentState.selectedObjectId;
      const isHovered = obj.id === currentState.hoveredObjectId;
      const cat = (typeof OBJECTS_CATALOG !== "undefined" &&
        OBJECTS_CATALOG[obj.catalogId]) || {
        lengthM: 4.5,
        widthM: 1.8,
        category: "vehiculo",
      };

      const ox = obj.normX * w;
      const oy = obj.normY * h;
      const rad = ((obj.rotationDeg || 0) * Math.PI) / 180;
      const lenPx = (cat.lengthM || 4.5) / mpp;
      const widthPx = (cat.widthM || 1.8) / mpp;

      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(rad);

      // ================= A. VEHÍCULOS =================
      if (obj.category === "vehiculo") {
        const halfL = lenPx / 2;
        const halfW = widthPx / 2;
        const cId = obj.catalogId || "sedan";
        const vColor = obj.color || "#2563eb";
        const strokeColor = isSelected
          ? "#00f0ff"
          : obj.isAccidentInvolved
            ? "#ef4444"
            : "rgba(255,255,255,0.75)";
        const strokeW = (isSelected ? 2.5 : 1.5) / zoom;

        if (typeof drawVehicleSilhouette2D === "function") {
          drawVehicleSilhouette2D({
            ctx,
            cId,
            obj,
            halfL,
            halfW,
            lenPx,
            widthPx,
            vColor,
            strokeColor,
            strokeW,
            zoom,
          });
        }
      } else {
        if (typeof drawProps2D === "function") {
          drawProps2D(ctx, obj, lenPx, widthPx, isSelected, zoom);
        } else {
          ctx.fillStyle = obj.color || "#64748b";
          ctx.beginPath();
          ctx.roundRect(-halfL, -halfW, lenPx, widthPx, 3 / zoom);
          ctx.fill();
        }
      }

      // Indicador pericial si es parte del accidente
      if (obj.isAccidentInvolved) {
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        const markR = Math.max(lenPx, widthPx) * 0.75 + 4 / zoom;
        ctx.arc(0, 0, markR, 0, Math.PI * 2);
        ctx.setLineDash([4 / zoom, 3 / zoom]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Dibuja la Hitbox 2D si está habilitado el visualizador forense
      if (currentState.showHitboxes && typeof CollisionEngine !== "undefined") {
        CollisionEngine.drawHitbox2D(ctx, obj, lenPx, widthPx, zoom, !!obj._isColliding);
      }

      // Etiqueta flotante con nombre, elevación y telemetría
      const isSimMoving =
        typeof Simulation !== "undefined" &&
        (Simulation.isPlaying || Simulation.currentTime > 0) &&
        obj._simCurrentSpeed !== undefined;

      if (isSelected || isHovered || isSimMoving) {
        const fontSize = Math.max(9, Math.round(10 / Math.sqrt(zoom)));
        ctx.font = `600 ${fontSize}px Inter, sans-serif`;
        let txt = `${obj.name} (+${(obj.baseElevationMeters || 0).toFixed(2)}m)`;
        if (obj._simCurrentSpeed !== undefined) {
          const spd = Math.round(obj._simCurrentSpeed);
          if (obj._simPhase === "impact_point") {
            txt = `💥 ${obj.name} · IMPACTO: ${spd} km/h`;
          } else if (obj._simPhase === "brake_start") {
            txt = `⚠️ ${obj.name} · FRENANDO: ${spd} km/h`;
          } else {
            txt = `${obj.name} · ${spd} km/h`;
          }
        }
        const metrics = ctx.measureText(txt);
        const pad = 4 / zoom;

        ctx.save();
        ctx.rotate(-rad);
        const badgeY = -Math.max(lenPx, widthPx) / 2 - 12 / zoom;

        ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
        ctx.strokeStyle = isSelected ? "#00f0ff" : "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        ctx.roundRect(
          -metrics.width / 2 - pad,
          badgeY - fontSize / 2 - pad,
          metrics.width + pad * 2,
          fontSize + pad * 2,
          3 / zoom,
        );
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isSelected ? "#00f0ff" : "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(txt, 0, badgeY);
        ctx.restore();
      }

      ctx.restore();
    });
  }

  /**
   * Dibuja el Gizmo de manipulación y rotación para el objeto seleccionado
   */
  function drawObjectGizmo(ctx, w, h) {
    const currentState = typeof state !== "undefined" ? state : window.state;
    if (!currentState || !currentState.selectedObjectId) return;
    const obj = currentState.objects.find(
      (o) => o.id === currentState.selectedObjectId,
    );
    if (!obj) return;

    const cat = (typeof OBJECTS_CATALOG !== "undefined" &&
      OBJECTS_CATALOG[obj.catalogId]) || { lengthM: 4.5, widthM: 1.8 };
    const mpp = currentState.metadata?.metersPerPixel || 0.125;
    const zoom = currentState.zoom || 1.0;
    const ox = obj.normX * w;
    const oy = obj.normY * h;
    const rad = ((obj.rotationDeg || 0) * Math.PI) / 180;
    const halfL = (cat.lengthM || 4.5) / mpp / 2;
    const handleDist = halfL + 18 / zoom;

    ctx.save();
    ctx.translate(ox, oy);

    // 1. Círculo exterior de selección
    ctx.strokeStyle = "rgba(0, 240, 255, 0.35)";
    ctx.lineWidth = 1.2 / zoom;
    ctx.beginPath();
    ctx.arc(0, 0, handleDist, 0, Math.PI * 2);
    ctx.stroke();

    // 2. Línea de rumbo hacia la manija frontal
    ctx.rotate(rad);
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 2 / zoom;
    ctx.beginPath();
    ctx.moveTo(halfL, 0);
    ctx.lineTo(handleDist, 0);
    ctx.stroke();

    // 3. Manija circular de rotación
    ctx.beginPath();
    ctx.arc(handleDist, 0, 6.5 / zoom, 0, Math.PI * 2);
    ctx.fillStyle = "#facc15";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2 / zoom;
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  return {
    drawSkidMarks,
    drawArrowHead,
    drawTrajectories,
    drawObjects,
    drawObjectGizmo,
  };
});
