/**
 * scene_objects.js
 * Módulo de gestión pericial de objetos forenses, catálogo, trazado de trayectorias e inspectores.
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    Object.assign(root, exports);
  }
})(typeof self !== "undefined" ? self : this, function () {
  function getActiveCatalog() {
    return typeof OBJECTS_CATALOG !== "undefined" ? OBJECTS_CATALOG : {};
  }

  function renderCatalogGrid(category = "vehiculo") {
    if (!ui.objCatalogGrid) return;
    ui.objCatalogGrid.innerHTML = "";
    const catalog = getActiveCatalog();
    const items = Object.values(catalog).filter(
      (item) => item.category === category,
    );

    items.forEach((item) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className =
        "obj-card" + (item.id === state.activeCatalogId ? " active" : "");
      card.innerHTML = `
        <span class="obj-card-icon">${item.icon}</span>
        <div class="obj-card-info">
          <span class="obj-card-title">${item.name}</span>
          <span class="obj-card-dim">${item.lengthM} × ${item.widthM} m</span>
        </div>
      `;
      card.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectCatalogItem(item.id);
      });
      ui.objCatalogGrid.appendChild(card);
    });
  }

  function selectCatalogItem(catalogId) {
    state.activeCatalogId = catalogId;
    const catalog = getActiveCatalog();
    const item = catalog[catalogId];
    if (item && ui.objPlacementHint) {
      ui.objPlacementHint.textContent = `💡 Clic en el plano para estampar: ${item.icon} ${item.name} (${item.lengthM}×${item.widthM}m).`;
    }
    if (ui.objCatalogGrid) {
      const cards = ui.objCatalogGrid.querySelectorAll(".obj-card");
      const items = Object.values(catalog).filter(
        (it) => it.category === state.activeObjCategory,
      );
      cards.forEach((card, idx) => {
        if (items[idx]) {
          card.classList.toggle("active", items[idx].id === catalogId);
        }
      });
    }
  }

  function setActiveObjCategory(cat) {
    state.activeObjCategory = cat;
    if (ui.objCategoryTabs) {
      ui.objCategoryTabs.forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-objcat") === cat);
      });
    }

    const catalog = getActiveCatalog();
    const items = Object.values(catalog).filter(
      (item) => item.category === cat,
    );

    if (
      items.length > 0 &&
      (!catalog[state.activeCatalogId] ||
        catalog[state.activeCatalogId].category !== cat)
    ) {
      state.activeCatalogId = items[0].id;
      if (ui.objPlacementHint) {
        ui.objPlacementHint.textContent = `💡 Clic en el plano para estampar: ${items[0].icon} ${items[0].name} (${items[0].lengthM}×${items[0].widthM}m).`;
      }
    }

    renderCatalogGrid(cat);
  }

  function createObjectAt(normX, normY) {
    const catalog = getActiveCatalog();
    let catItem = catalog[state.activeCatalogId];

    if (!catItem || catItem.category !== state.activeObjCategory) {
      const itemsOfCat = Object.values(catalog).filter(
        (it) => it.category === state.activeObjCategory,
      );
      if (itemsOfCat.length > 0) {
        catItem = itemsOfCat[0];
        state.activeCatalogId = catItem.id;
      } else {
        catItem = {
          id: "sedan",
          category: "vehiculo",
          name: "Automóvil Sedán",
          lengthM: 4.5,
          widthM: 1.8,
          heightM: 1.45,
          defaultColor: "#2563eb",
          isAccidentCandidate: true,
        };
      }
    }

    const zone = getZoneUnderNormCoords(normX, normY);
    const elev = zone ? zone.elevationMeters : 0.0;
    const countSame =
      state.objects.filter((o) => o.catalogId === catItem.id).length + 1;

    const newObj = {
      id: "obj_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      catalogId: catItem.id,
      name: `${catItem.name} ${countSame}`,
      category: catItem.category,
      normX,
      normY,
      rotationDeg: 0,
      baseElevationMeters: elev,
      zoneId: zone ? zone.id : null,
      isAccidentInvolved:
        catItem.isAccidentCandidate &&
        (catItem.category === "vehiculo" || catItem.category === "persona"),
      role:
        catItem.category === "persona"
          ? "peaton_atropellado"
          : catItem.category === "vehiculo"
            ? "impactante"
            : "inerte",
      color: catItem.defaultColor || "#2563eb",
      skidLengthM: catItem.lengthM || 10.0,
      skidTrackWidthM: catItem.widthM || 1.5,
      triggerOnPass: false,
      deviationAngleDeg: 0.0,
      rider: catItem.rider
        ? JSON.parse(JSON.stringify(catItem.rider))
        : catItem.id === "moto"
          ? { enabled: true, massKg: 75, frictionGround: 0.66, launchAngleDeg: 15, finalRestDistanceM: 6.0, restitution: 0.1 }
          : null,
      kinematics: { speedKmh: 0.0, brakeDistanceM: 0.0, trajectoryPoints: [] },
      notes: "",
    };

    History.push();
    state.objects.push(newObj);
    selectZone(null);
    selectObject(newObj.id);
    updateObjectsListUI();
    scheduleSave();
    repaintScene();
    showToast(`Objeto añadido: ${newObj.name} (Cota: +${elev.toFixed(2)} m)`);
  }

  function selectObject(objectId) {
    state.selectedObjectId = objectId;
    const obj = state.objects.find((o) => o.id === objectId);

    if (obj) {
      state.selectedZoneId = null;
      if (ui.inspectorCard) ui.inspectorCard.style.display = "none";
      if (ui.objectInspectorCard) ui.objectInspectorCard.style.display = "flex";

      const catalog = getActiveCatalog();
      const catItem = catalog[obj.catalogId];

      if (ui.inputObjName) ui.inputObjName.value = obj.name;

      if (ui.selectObjCatalogType) {
        ui.selectObjCatalogType.innerHTML = "";
        const catMap = {
          vehiculo: "🚗 Vehículos",
          persona: "🚶 Peatones",
          mobiliario: "🌳 Entorno / Mobiliario",
          senal: "🛑 Señales de Tránsito",
          evidencia: "〰️ Evidencias / Frenado",
        };

        for (const [cKey, cLabel] of Object.entries(catMap)) {
          const grp = document.createElement("optgroup");
          grp.label = cLabel;
          const itms = Object.values(catalog).filter(
            (it) => it.category === cKey,
          );
          itms.forEach((it) => {
            const opt = document.createElement("option");
            opt.value = it.id;
            opt.textContent = `${it.icon} ${it.name}`;
            if (it.id === obj.catalogId) opt.selected = true;
            grp.appendChild(opt);
          });
          ui.selectObjCatalogType.appendChild(grp);
        }
      }

      if (ui.displayObjType) {
        ui.displayObjType.textContent = catItem
          ? `Dimensiones: ${catItem.lengthM} × ${catItem.widthM} m (H: ${catItem.heightM || 1.5} m)`
          : "Objeto métrico";
      }

      if (ui.inputObjElevation)
        ui.inputObjElevation.value = obj.baseElevationMeters || 0;
      if (ui.inputObjRotation) ui.inputObjRotation.value = obj.rotationDeg || 0;
      if (ui.inputObjColor) ui.inputObjColor.value = obj.color || "#2563eb";
      if (ui.checkObjInvolved)
        ui.checkObjInvolved.checked = !!obj.isAccidentInvolved;
      if (ui.selectObjRole) ui.selectObjRole.value = obj.role || "inerte";
      if (ui.textareaObjNotes) ui.textareaObjNotes.value = obj.notes || "";

      if (ui.inputObjDeviationAngle) {
        ui.inputObjDeviationAngle.value =
          obj.deviationAngleDeg !== undefined ? obj.deviationAngleDeg : 0;
      }

      const isVehOrPeaton =
        obj.category === "vehiculo" || obj.category === "persona";
      if (ui.fieldAccidentInvolved) {
        ui.fieldAccidentInvolved.style.display = isVehOrPeaton
          ? "flex"
          : "none";
      }
      if (ui.objAccidentFields) {
        ui.objAccidentFields.style.display =
          isVehOrPeaton && obj.isAccidentInvolved ? "flex" : "none";
      }

      const isSkid =
        obj.catalogId === "huella_frenado" ||
        obj.catalogId === "huella_derrape";
      if (ui.skidMarksFields) {
        ui.skidMarksFields.style.display = isSkid ? "flex" : "none";
        if (isSkid) {
          if (ui.inputSkidLength)
            ui.inputSkidLength.value = obj.skidLengthM || 10;
          if (ui.inputSkidTrack)
            ui.inputSkidTrack.value = obj.skidTrackWidthM || 1.5;
          if (ui.checkSkidTriggerOnPass)
            ui.checkSkidTriggerOnPass.checked = !!obj.triggerOnPass;
        }
      }

      const isMoto = obj.catalogId === "moto";
      if (ui.fieldMotoRider) {
        ui.fieldMotoRider.style.display = isMoto ? "flex" : "none";
        if (isMoto) {
          if (!obj.rider) {
            obj.rider = {
              enabled: true,
              massKg: 75,
              frictionGround: 0.66,
              launchAngleDeg: 15,
              restitution: 0.1,
            };
          }
          if (ui.inputObjRiderLaunchAngle) {
            ui.inputObjRiderLaunchAngle.value =
              obj.rider.launchAngleDeg !== undefined
                ? obj.rider.launchAngleDeg
                : 15;
          }
          if (ui.inputObjRiderRestDist) {
            const curDist =
              obj.rider.finalRestDistanceM !== undefined
                ? obj.rider.finalRestDistanceM
                : obj.rider.finalRest?.distanceM !== undefined
                  ? obj.rider.finalRest.distanceM
                  : 6.0;
            ui.inputObjRiderRestDist.value = Number(curDist).toFixed(1);
          }
        }
      }

      if (ui.inputObjVehicleRestDist) {
        const curVDist =
          obj.finalRestDistanceM !== undefined
            ? obj.finalRestDistanceM
            : obj.finalRest?.distanceM !== undefined
              ? obj.finalRest.distanceM
              : 5.0;
        ui.inputObjVehicleRestDist.value = Number(curVDist).toFixed(1);
      }

      if (obj.kinematics && ui.inputObjSpeed) {
        ui.inputObjSpeed.value = obj.kinematics.speedKmh || 50;
      }

      updateTrajectoryStats(obj);
    } else {
      if (ui.objectInspectorCard) ui.objectInspectorCard.style.display = "none";
    }

    updateObjectsListUI();
    repaintScene();
  }

  function updateObjectsListUI() {
    if (!ui.objectsListContainer) return;
    ui.objectsListContainer.innerHTML = "";

    if (state.objects.length === 0) {
      ui.objectsListContainer.innerHTML = `
        <div style="font-size: 11px; color: var(--text-muted); font-style: italic; padding: 12px 6px; text-align: center;">
          No hay objetos forenses añadidos. Selecciona la pestaña "Objetos" en la barra superior para estampar vehículos o señales.
        </div>
      `;
      return;
    }

    const catalog = getActiveCatalog();
    state.objects.forEach((obj) => {
      const catItem = catalog[obj.catalogId];
      const icon = catItem ? catItem.icon : "📦";
      const item = document.createElement("div");
      item.className =
        "zone-item-card" +
        (obj.id === state.selectedObjectId ? " selected" : "");
      item.innerHTML = `
        <div class="zone-item-info">
          <span style="font-size: 14px">${icon}</span>
          <strong>${obj.name}</strong>
        </div>
        <div style="display: flex; gap: 4px; align-items: center">
          ${obj.isAccidentInvolved ? '<span class="obj-item-badge involved">Siniestro</span>' : ""}
          <span class="zone-item-badge">+${(obj.baseElevationMeters || 0).toFixed(2)}m</span>
        </div>
      `;
      item.addEventListener("click", () => {
        selectObject(obj.id);
        setActiveMode("object");
      });
      ui.objectsListContainer.appendChild(item);
    });
  }

  function switchListTab(tab) {
    if (tab === "zones") {
      if (ui.tabListZones) ui.tabListZones.classList.add("active");
      if (ui.tabListObjects) ui.tabListObjects.classList.remove("active");
      if (ui.zonesListContainer) ui.zonesListContainer.style.display = "flex";
      if (ui.objectsListContainer)
        ui.objectsListContainer.style.display = "none";
    } else {
      if (ui.tabListZones) ui.tabListZones.classList.remove("active");
      if (ui.tabListObjects) ui.tabListObjects.classList.add("active");
      if (ui.zonesListContainer) ui.zonesListContainer.style.display = "none";
      if (ui.objectsListContainer)
        ui.objectsListContainer.style.display = "flex";
    }
  }

  function getObjectAtCoords(coords) {
    const w = ui.canvas.width;
    const h = ui.canvas.height;
    const px = coords.normX * w;
    const py = coords.normY * h;
    const mpp = state.metadata.metersPerPixel || 0.125;

    for (let i = state.objects.length - 1; i >= 0; i--) {
      const o = state.objects[i];
      const cat = (typeof OBJECTS_CATALOG !== "undefined" &&
        OBJECTS_CATALOG[o.catalogId]) || { lengthM: 4.5, widthM: 1.8 };
      const ox = o.normX * w;
      const oy = o.normY * h;
      const halfL = ((cat.lengthM || 4) / mpp / 2) * 1.15;
      const halfW = ((cat.widthM || 2) / mpp / 2) * 1.15;
      const rad = Math.max(16 / state.zoom, Math.max(halfL, halfW));

      if (Math.hypot(px - ox, py - oy) <= rad) return o;
    }
    return null;
  }

  function getObjectRotateHandleAtCoords(coords) {
    if (!state.selectedObjectId) return null;
    const obj = state.objects.find((o) => o.id === state.selectedObjectId);
    if (!obj) return null;

    const w = ui.canvas.width;
    const h = ui.canvas.height;
    const ox = obj.normX * w;
    const oy = obj.normY * h;
    const cat = (typeof OBJECTS_CATALOG !== "undefined" &&
      OBJECTS_CATALOG[obj.catalogId]) || { lengthM: 4.5 };
    const mpp = state.metadata.metersPerPixel || 0.125;
    const distHandlePx = (cat.lengthM || 4.5) / mpp / 2 + 18 / state.zoom;

    const radAng = ((obj.rotationDeg || 0) * Math.PI) / 180;
    const hx = ox + Math.cos(radAng) * distHandlePx;
    const hy = oy + Math.sin(radAng) * distHandlePx;

    const px = coords.normX * w;
    const py = coords.normY * h;
    if (Math.hypot(px - hx, py - hy) <= 14 / state.zoom) return obj;
    return null;
  }

  function toggleTraceTrajectory() {
    if (!state.selectedObjectId) return;
    state.isTracingTrajectory = !state.isTracingTrajectory;
    if (ui.btnTraceTrajectory) {
      ui.btnTraceTrajectory.textContent = state.isTracingTrajectory
        ? "⏹️ Finalizar Ruta"
        : "📍 Trazar Ruta";
      ui.btnTraceTrajectory.style.background = state.isTracingTrajectory
        ? "#ef4444"
        : "var(--accent)";
    }
    if (state.isTracingTrajectory) {
      showToast(
        "Haz clic en el plano para añadir puntos de la trayectoria (Origen -> Frenado -> Impacto -> Reposo).",
        4000,
      );
    } else {
      showToast("Trayectoria finalizada.");
    }
    repaintScene();
  }

  function addTrajectoryPoint(normX, normY) {
    const obj = state.objects.find((o) => o.id === state.selectedObjectId);
    if (!obj) return;
    if (!obj.kinematics)
      obj.kinematics = {
        speedKmh: 50,
        brakeDistanceM: 0,
        curveMode: "smooth",
        curveTension: 0.5,
        trajectoryPoints: [],
      };
    if (!obj.kinematics.trajectoryPoints) obj.kinematics.trajectoryPoints = [];
    if (!obj.kinematics.curveMode) obj.kinematics.curveMode = "smooth";
    if (obj.kinematics.curveTension === undefined) obj.kinematics.curveTension = 0.5;

    const count = obj.kinematics.trajectoryPoints.length;
    let type = "path";
    let ptSpeed = obj.kinematics.speedKmh || 50;

    if (count === 0) {
      type = "start";
      ptSpeed = obj.kinematics.speedKmh || 50;
    } else if (count === 1) {
      type = "brake_start";
      ptSpeed = obj.kinematics.speedKmh || 50;
    } else if (count === 2) {
      type = "impact_point";
      ptSpeed = Math.max(10, Math.round((obj.kinematics.speedKmh || 50) * 0.4));
    } else if (count === 3) {
      type = "final_rest";
      ptSpeed = 0;
    }

    const size = state.metadata?.sizeMeters || 100;
    const waitTime = type === "final_rest" ? 2.0 : 0;

    obj.kinematics.trajectoryPoints.push({
      normX,
      normY,
      x: (normX - 0.5) * size,
      z: (normY - 0.5) * size,
      type,
      speedKmh: ptSpeed,
      waitTimeSec: waitTime,
    });
    History.push();
    updateTrajectoryStats(obj);
    scheduleSave();
    if (typeof Simulation !== "undefined") Simulation.calculateTotalDuration();
    repaintScene();
  }

  function updateTrajectoryStats(obj) {
    if (!ui.objTrajectoryStats) return;
    if (
      !obj ||
      !obj.kinematics ||
      !obj.kinematics.trajectoryPoints ||
      obj.kinematics.trajectoryPoints.length === 0
    ) {
      ui.objTrajectoryStats.innerHTML = `<span style="font-style:italic">Sin trayectoria. Haz clic en "📍 Trazar Ruta" y marca puntos en el plano.</span>`;
      if (ui.objTrajectoryPointsList) {
        ui.objTrajectoryPointsList.style.display = "none";
        ui.objTrajectoryPointsList.innerHTML = "";
      }
      return;
    }

    const pts = obj.kinematics.trajectoryPoints;
    const size = state.metadata?.sizeMeters || 100;
    const nominalSpeed =
      Number(obj.kinematics.speedKmh) > 0
        ? Number(obj.kinematics.speedKmh)
        : 50;

    if (!obj.kinematics.curveMode) obj.kinematics.curveMode = "smooth";
    if (obj.kinematics.curveTension === undefined) obj.kinematics.curveTension = 0.5;

    let totalDistM = 0;
    let totalTimeSec = 0;

    if (pts.length >= 2) {
      if (typeof KinematicsEngine !== "undefined" && KinematicsEngine.getObjectDuration) {
        totalTimeSec = KinematicsEngine.getObjectDuration(obj, size);
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        if (
          obj.kinematics.curveMode !== "linear" &&
          pts.length >= 3 &&
          typeof KinematicsEngine !== "undefined" &&
          KinematicsEngine.getSplineSegmentLength
        ) {
          const tau = obj.kinematics.curveTension !== undefined ? obj.kinematics.curveTension : 0.5;
          const c1 = { x: p1.normX, y: p1.normY };
          const c2 = { x: p2.normX, y: p2.normY };
          const c0 = i > 0 ? { x: pts[i - 1].normX, y: pts[i - 1].normY } : { x: 2 * c1.x - c2.x, y: 2 * c1.y - c2.y };
          const c3 = i + 2 < pts.length ? { x: pts[i + 2].normX, y: pts[i + 2].normY } : { x: 2 * c2.x - c1.x, y: 2 * c2.y - c1.y };
          totalDistM += KinematicsEngine.getSplineSegmentLength(c0, c1, c2, c3, tau, size);
        } else {
          totalDistM += Math.hypot((p2.normX - p1.normX) * size, (p2.normY - p1.normY) * size);
        }
      }
      if (!totalTimeSec) {
        totalTimeSec = totalDistM / Math.max(1, nominalSpeed / 3.6);
      }

      const curMode = obj.kinematics.curveMode || "smooth";
      ui.objTrajectoryStats.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center">
          <span><b>Dist:</b> ${totalDistM.toFixed(2)} m · <b>Tiempo:</b> ${totalTimeSec.toFixed(2)} s</span>
          <button type="button" class="btn-clear-traj" style="background:none; border:none; color:#ef4444; font-size:11px; cursor:pointer; text-decoration:underline; padding:0" title="Eliminar ruta completa">🗑️ Limpiar</button>
        </div>
        <div style="display:flex; align-items:center; gap:5px; margin:5px 0; background:rgba(255,255,255,0.03); padding:3px 6px; border-radius:4px; border:1px solid var(--border)">
          <span style="font-size:10px; font-weight:600; color:var(--text-bright); white-space:nowrap" title="Tipo de trazado de curva">〰️ Curvatura:</span>
          <select class="form-select traj-curve-mode-select" style="padding:1px 4px; font-size:10px; height:22px; flex:1">
            <option value="smooth" ${curMode === "smooth" ? "selected" : ""}>〰️ Curva Suave (Natural)</option>
            <option value="tight" ${curMode === "tight" ? "selected" : ""}>↩️ Curva Cerrada (90° / Urbano)</option>
            <option value="wide" ${curMode === "wide" ? "selected" : ""}>🔄 Curva Amplia (Rotonda / Vía)</option>
            <option value="linear" ${curMode === "linear" ? "selected" : ""}>📏 Tramos Rectos (Lineal)</option>
          </select>
        </div>
        <small style="color:var(--accent)">Puntos del trayecto (${pts.length}):</small>
      `;
    } else {
      ui.objTrajectoryStats.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center">
          <span style="color:#f59e0b">⚠️ 1 punto marcado (mínimo 2 para simular ruta).</span>
          <button type="button" class="btn-clear-traj" style="background:none; border:none; color:#ef4444; font-size:11px; cursor:pointer; text-decoration:underline; padding:0" title="Eliminar ruta">🗑️ Limpiar</button>
        </div>
      `;
    }

    const selCurveMode = ui.objTrajectoryStats.querySelector(".traj-curve-mode-select");
    if (selCurveMode) {
      selCurveMode.addEventListener("change", (e) => {
        History.push();
        const mode = e.target.value;
        obj.kinematics.curveMode = mode;
        if (mode === "tight") obj.kinematics.curveTension = 0.28;
        else if (mode === "wide") obj.kinematics.curveTension = 0.72;
        else if (mode === "linear") obj.kinematics.curveTension = 0.0;
        else obj.kinematics.curveTension = 0.5;
        scheduleSave();
        if (typeof Simulation !== "undefined") Simulation.calculateTotalDuration();
        repaintScene();
        updateTrajectoryStats(obj);
      });
    }

    const btnClear = ui.objTrajectoryStats.querySelector(".btn-clear-traj");
    if (btnClear) {
      btnClear.addEventListener("click", () => {
        History.push();
        obj.kinematics.trajectoryPoints = [];
        state.selectedTrajPoint = null;
        state.draggingTrajPoint = null;
        updateTrajectoryStats(obj);
        scheduleSave();
        if (typeof Simulation !== "undefined")
          Simulation.calculateTotalDuration();
        repaintScene();
        showToast("Trayectoria eliminada.");
      });
    }

    if (ui.objTrajectoryPointsList) {
      ui.objTrajectoryPointsList.style.display = "flex";
      ui.objTrajectoryPointsList.innerHTML = "";

      pts.forEach((p, idx) => {
        const isRest = p.type === "final_rest";
        if (p.speedKmh === undefined) p.speedKmh = isRest ? 0 : nominalSpeed;
        if (p.waitTimeSec === undefined) {
          p.waitTimeSec = isRest ? (idx === pts.length - 1 ? 0 : 2.0) : 0;
        }
        const row = document.createElement("div");
        row.className = "traj-pt-row";

        row.innerHTML = `
          <div style="display:flex; align-items:center; gap:5px">
            <span style="font-weight:700; color:var(--text-muted); font-size:10px">P${idx + 1}</span>
            <select class="form-select traj-pt-type-select" style="padding:2px 4px; font-size:10px; height:24px">
              <option value="start" ${p.type === "start" ? "selected" : ""}>🟢 Origen</option>
              <option value="brake_start" ${p.type === "brake_start" ? "selected" : ""}>⚠️ Frenado</option>
              <option value="impact_point" ${p.type === "impact_point" ? "selected" : ""}>💥 Impacto</option>
              <option value="final_rest" ${p.type === "final_rest" ? "selected" : ""}>🏁 Reposo</option>
              <option value="path" ${p.type === "path" ? "selected" : ""}>📍 Vía</option>
            </select>
          </div>
          <div style="display:flex; align-items:center; gap:4px">
            ${
              isRest
                ? `<input type="number" class="traj-pt-speed-input traj-pt-wait-input" value="${Number(p.waitTimeSec || 0)}" min="0" max="300" step="0.5" title="Tiempo detenido en reposo (segundos)">
                   <span style="font-size:10px; color:var(--text-muted)">seg</span>`
                : `<input type="number" class="traj-pt-speed-input" value="${Math.round(p.speedKmh)}" min="0" max="220" step="1" title="Velocidad (km/h)">
                   <span style="font-size:10px; color:var(--text-muted)">km/h</span>`
            }
            ${idx < pts.length - 1 ? `<button type="button" class="btn-insert-pt" style="background:none; border:none; color:var(--accent); cursor:pointer; font-size:11px; padding:0 3px" title="Insertar punto intermedio para curvar este tramo">➕</button>` : ""}
            <button type="button" class="btn-del-pt" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:12px; padding:0 3px" title="Eliminar este punto">✕</button>
          </div>
        `;

        const btnInsert = row.querySelector(".btn-insert-pt");
        if (btnInsert) {
          btnInsert.addEventListener("click", () => {
            const pA = pts[idx];
            const pB = pts[idx + 1];
            let newNormX, newNormY;
            if (
              obj.kinematics.curveMode !== "linear" &&
              typeof KinematicsEngine !== "undefined" &&
              KinematicsEngine.evalSplineSegment
            ) {
              const cA = { x: pA.normX, y: pA.normY };
              const cB = { x: pB.normX, y: pB.normY };
              const c0 = idx > 0 ? { x: pts[idx - 1].normX, y: pts[idx - 1].normY } : { x: 2 * cA.x - cB.x, y: 2 * cA.y - cB.y };
              const c3 = idx + 2 < pts.length ? { x: pts[idx + 2].normX, y: pts[idx + 2].normY } : { x: 2 * cB.x - cA.x, y: 2 * cB.y - cA.y };
              const tau = obj.kinematics.curveTension !== undefined ? obj.kinematics.curveTension : 0.5;
              const spt = KinematicsEngine.evalSplineSegment(c0, cA, cB, c3, 0.5, tau);
              newNormX = spt.x;
              newNormY = spt.y;
            } else {
              newNormX = (pA.normX + pB.normX) / 2;
              newNormY = (pA.normY + pB.normY) / 2;
            }
            const avgSpd = Math.round(((pA.speedKmh || nominalSpeed) + (pB.speedKmh || nominalSpeed)) / 2);
            pts.splice(idx + 1, 0, {
              normX: newNormX,
              normY: newNormY,
              x: (newNormX - 0.5) * size,
              z: (newNormY - 0.5) * size,
              type: "path",
              speedKmh: avgSpd,
              waitTimeSec: 0,
            });
            state.selectedTrajPoint = { objectId: obj.id, pointIndex: idx + 1 };
            History.push();
            scheduleSave();
            if (typeof Simulation !== "undefined") Simulation.calculateTotalDuration();
            repaintScene();
            updateTrajectoryStats(obj);
            showToast(`Punto intermedio P${idx + 2} creado. Arrástralo para moldear la curva.`);
          });
        }

        const selType = row.querySelector(".traj-pt-type-select");
        selType.addEventListener("change", (e) => {
          History.push();
          p.type = e.target.value;
          if (p.type === "final_rest") {
            if (!p.waitTimeSec || p.waitTimeSec <= 0) {
              p.waitTimeSec = idx === pts.length - 1 ? 0 : 2.0;
            }
          } else if (p.type === "impact_point") {
            p.speedKmh = Math.max(
              10,
              Math.round((p.speedKmh || nominalSpeed) * 0.4),
            );
            p.waitTimeSec = 0;
          } else {
            p.waitTimeSec = 0;
            if (!p.speedKmh || p.speedKmh === 0) p.speedKmh = nominalSpeed;
          }
          scheduleSave();
          if (typeof Simulation !== "undefined")
            Simulation.calculateTotalDuration();
          repaintScene();
          updateTrajectoryStats(obj);
        });

        const inpSpeed = row.querySelector(
          ".traj-pt-speed-input:not(.traj-pt-wait-input)",
        );
        if (inpSpeed) {
          inpSpeed.addEventListener("input", (e) => {
            const val = parseFloat(e.target.value);
            p.speedKmh = isNaN(val) ? 0 : Math.max(0, val);
            if (idx === 0 && p.type !== "final_rest") {
              obj.kinematics.speedKmh = p.speedKmh;
              if (ui.inputObjSpeed) ui.inputObjSpeed.value = p.speedKmh;
            }
            scheduleSave();
            if (typeof Simulation !== "undefined")
              Simulation.calculateTotalDuration();
            repaintScene();
          });
        }

        const inpWait = row.querySelector(".traj-pt-wait-input");
        if (inpWait) {
          inpWait.addEventListener("input", (e) => {
            const val = parseFloat(e.target.value);
            p.waitTimeSec = isNaN(val) ? 0 : Math.max(0, val);
            scheduleSave();
            if (typeof Simulation !== "undefined")
              Simulation.calculateTotalDuration();
            repaintScene();
          });
        }

        const btnDel = row.querySelector(".btn-del-pt");
        if (btnDel) {
          btnDel.addEventListener("click", () => {
            History.push();
            pts.splice(idx, 1);
            if (
              state.selectedTrajPoint &&
              state.selectedTrajPoint.pointIndex === idx
            ) {
              state.selectedTrajPoint = null;
            } else if (
              state.selectedTrajPoint &&
              state.selectedTrajPoint.pointIndex > idx
            ) {
              state.selectedTrajPoint.pointIndex--;
            }
            scheduleSave();
            if (typeof Simulation !== "undefined")
              Simulation.calculateTotalDuration();
            repaintScene();
            updateTrajectoryStats(obj);
          });
        }

        ui.objTrajectoryPointsList.appendChild(row);
      });
    }
  }

  function getTrajectoryPointAtCoords(coords) {
    if (!state.objects || !ui.canvas) return null;
    const w = ui.canvas.width;
    const h = ui.canvas.height;
    const clickX = coords.normX * w;
    const clickY = coords.normY * h;
    const hitRadius = 14 / Math.max(0.5, state.zoom);

    function checkRiderRestHit(o) {
      if (o.catalogId !== "moto" || (o.rider && o.rider.enabled === false)) return false;
      const pts = o.kinematics?.trajectoryPoints;
      if (!pts || pts.length === 0) return false;
      const pImp = pts.find((p) => p.type === "impact_point") || pts[pts.length - 1];
      if (!pImp) return false;
      const mpp = state.metadata?.metersPerPixel || 0.125;
      let rx, ry;
      if (o.rider?.finalRest?.normX !== undefined) {
        rx = o.rider.finalRest.normX * w;
        ry = o.rider.finalRest.normY * h;
      } else {
        const idxImp = pts.indexOf(pImp);
        const fwdAng = idxImp > 0 ? Math.atan2(pImp.normY - pts[idxImp - 1].normY, pImp.normX - pts[idxImp - 1].normX) : ((o.rotationDeg || 0) * Math.PI) / 180;
        const targetAng = fwdAng + (((o.deviationAngleDeg || 0) * Math.PI) / 180);
        const dM = o.rider?.finalRestDistanceM || o.rider?.finalRest?.distanceM || 6.0;
        rx = pImp.normX * w + Math.cos(targetAng) * (dM / mpp);
        ry = pImp.normY * h + Math.sin(targetAng) * (dM / mpp);
      }
      return Math.hypot(clickX - rx, clickY - ry) <= hitRadius;
    }

    function checkVehicleRestHit(o) {
      if ((o.catalogId !== "moto" && o.type !== "moto" && !o.isAccidentInvolved) || !o.kinematics?.trajectoryPoints) return false;
      const pts = o.kinematics.trajectoryPoints;
      if (pts.length < 2) return false;
      const pImp = pts.find((p) => p.type === "impact_point") || pts[pts.length - 1];
      if (!pImp) return false;
      const mpp = state.metadata?.metersPerPixel || 0.125;
      let mx, my;
      const pRest = pts.find((p) => p.type === "final_rest");
      if (pRest) {
        mx = pRest.normX * w;
        my = pRest.normY * h;
      } else if (o.finalRest?.normX !== undefined) {
        mx = o.finalRest.normX * w;
        my = o.finalRest.normY * h;
      } else {
        const idxImp = pts.indexOf(pImp);
        const fwdAng = idxImp > 0 ? Math.atan2(pImp.normY - pts[idxImp - 1].normY, pImp.normX - pts[idxImp - 1].normX) : ((o.rotationDeg || 0) * Math.PI) / 180;
        const targetAng = fwdAng + (((o.deviationAngleDeg || 0) * Math.PI) / 180);
        const dM = o.finalRestDistanceM !== undefined ? o.finalRestDistanceM : 5.0;
        mx = pImp.normX * w + Math.cos(targetAng) * (dM / mpp);
        my = pImp.normY * h + Math.sin(targetAng) * (dM / mpp);
      }
      return Math.hypot(clickX - mx, clickY - my) <= hitRadius;
    }

    // 1. Probar primero el objeto seleccionado actualmente
    if (state.selectedObjectId) {
      const obj = state.objects.find((o) => o.id === state.selectedObjectId);
      if (obj?.kinematics && Array.isArray(obj.kinematics.trajectoryPoints)) {
        if (checkVehicleRestHit(obj)) return { objectId: obj.id, isVehicleRest: true };
        if (checkRiderRestHit(obj)) return { objectId: obj.id, isRiderRest: true };
        for (let i = 0; i < obj.kinematics.trajectoryPoints.length; i++) {
          const p = obj.kinematics.trajectoryPoints[i];
          if (Math.hypot(clickX - p.normX * w, clickY - p.normY * h) <= hitRadius) {
            return { objectId: obj.id, pointIndex: i };
          }
        }
      }
    }

    // 2. Probar en cualquier otro objeto con trayectoria
    for (let k = state.objects.length - 1; k >= 0; k--) {
      const obj = state.objects[k];
      if (obj.id === state.selectedObjectId) continue;
      if (obj.kinematics && Array.isArray(obj.kinematics.trajectoryPoints)) {
        if (checkVehicleRestHit(obj)) return { objectId: obj.id, isVehicleRest: true };
        if (checkRiderRestHit(obj)) return { objectId: obj.id, isRiderRest: true };
        for (let i = 0; i < obj.kinematics.trajectoryPoints.length; i++) {
          const p = obj.kinematics.trajectoryPoints[i];
          if (Math.hypot(clickX - p.normX * w, clickY - p.normY * h) <= hitRadius) {
            return { objectId: obj.id, pointIndex: i };
          }
        }
      }
    }
    return null;
  }

  function getTrajectoryEdgeAtCoords(coords) {
    if (!state.selectedObjectId || !ui.canvas) return null;
    const obj = state.objects.find((o) => o.id === state.selectedObjectId);
    if (
      !obj ||
      !obj.kinematics ||
      !Array.isArray(obj.kinematics.trajectoryPoints)
    )
      return null;
    const pts = obj.kinematics.trajectoryPoints;
    if (pts.length < 2) return null;

    const w = ui.canvas.width;
    const h = ui.canvas.height;
    const px = coords.normX * w;
    const py = coords.normY * h;
    const hitThreshold = 10 / Math.max(0.5, state.zoom);

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const x1 = p1.normX * w,
        y1 = p1.normY * h;
      const x2 = p2.normX * w,
        y2 = p2.normY * h;

      const dx = x2 - x1,
        dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;

      const t = Math.max(
        0,
        Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq),
      );
      const projX = x1 + t * dx;
      const projY = y1 + t * dy;

      if (
        Math.hypot(px - projX, py - projY) <= hitThreshold &&
        t > 0.08 &&
        t < 0.92
      ) {
        const speed = Math.round(
          ((p1.speedKmh || 50) + (p2.speedKmh || 50)) / 2,
        );
        return {
          objectId: obj.id,
          insertIndex: i + 1,
          point: {
            normX: projX / w,
            normY: projY / h,
            type: "path",
            speedKmh: speed,
          },
        };
      }
    }
    return null;
  }

  function removeSelectedTrajPoint() {
    if (!state.selectedTrajPoint) return false;
    const obj = state.objects.find(
      (o) => o.id === state.selectedTrajPoint.objectId,
    );
    if (
      !obj ||
      !obj.kinematics ||
      !Array.isArray(obj.kinematics.trajectoryPoints)
    ) {
      state.selectedTrajPoint = null;
      return false;
    }
    const pts = obj.kinematics.trajectoryPoints;
    const pIdx = state.selectedTrajPoint.pointIndex;
    if (pIdx < 0 || pIdx >= pts.length) {
      state.selectedTrajPoint = null;
      return false;
    }

    History.push();
    pts.splice(pIdx, 1);
    state.selectedTrajPoint = null;
    state.draggingTrajPoint = null;
    updateTrajectoryStats(obj);
    scheduleSave();
    if (typeof Simulation !== "undefined") Simulation.calculateTotalDuration();
    repaintScene();
    if (pts.length === 0) {
      showToast("Trayectoria eliminada.");
    } else if (pts.length === 1) {
      showToast("Punto eliminado. Queda 1 punto marcado.", 2000);
    } else {
      showToast("Punto de trayectoria eliminado.");
    }
    return true;
  }

  function removeSelectedObject() {
    if (!state.selectedObjectId) return;
    History.push();
    state.objects = state.objects.filter(
      (o) => o.id !== state.selectedObjectId,
    );
    selectObject(null);
    updateObjectsListUI();
    scheduleSave();
    repaintScene();
    showToast("Objeto forense eliminado de la escena.");
  }

  return {
    getActiveCatalog,
    renderCatalogGrid,
    selectCatalogItem,
    setActiveObjCategory,
    createObjectAt,
    selectObject,
    updateObjectsListUI,
    switchListTab,
    getObjectAtCoords,
    getObjectRotateHandleAtCoords,
    getTrajectoryPointAtCoords,
    getTrajectoryEdgeAtCoords,
    removeSelectedTrajPoint,
    toggleTraceTrajectory,
    addTrajectoryPoint,
    updateTrajectoryStats,
    removeSelectedObject,
  };
});
