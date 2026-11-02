/**
 * scene_storage.js
 * Módulo de persistencia multicapa (sessionStorage, localStorage, IndexedDB)
 * y constructor del paquete forense de exportación (SceneExport).
 * Compatible con scripts clásicos en navegador (<script src="...">) y con módulos ESM.
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory(root);
    root.SceneStorage = exports.SceneStorage;
    root.SceneDB = exports.SceneDB;
    root.polygonAreaMeters = exports.polygonAreaMeters;
    root.polygonPerimeterMeters = exports.polygonPerimeterMeters;
    root.inferZoneOrigin = exports.inferZoneOrigin;
    root.buildSceneExport = exports.buildSceneExport;
    root.scheduleSave = () => exports.scheduleSave(root.state);
    root.persistZones = () => exports.persistZones(root.state);
    root.restoreZones = (showToast) =>
      exports.restoreZones(root.state, showToast);
    root.convertTo3D = (ui, showToast) =>
      exports.convertTo3D(root.state, ui, showToast);
    root.loadPayloadFromStorage = (
      customState,
      customUi,
      customToast,
      customUpdateMetadata,
      customResizeAndRepaint,
    ) =>
      exports.loadPayloadFromStorage(
        customState || root.state,
        customUi || root.ui,
        customToast || root.showToast,
        customUpdateMetadata || root.updateMetadataDisplay,
        customResizeAndRepaint || root.resizeAndRepaint,
      );
  }
})(typeof self !== "undefined" ? self : this, function (root) {
  root = root || (typeof window !== "undefined" ? window : self);
  const SceneStorage = {
    DB_NAME: "Sinistra3D_DB",
    STORE_NAME: "scene_store",
    KEY: "active_scene",

    openDB() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(this.DB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(this.STORE_NAME)) {
            db.createObjectStore(this.STORE_NAME);
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e);
      });
    },

    async load() {
      // 1. Intentar desde sessionStorage
      try {
        const raw = sessionStorage.getItem("sinistra_scene_payload");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.textureDataUrl) return parsed;
        }
      } catch (e) {
        console.warn("Error leyendo de sessionStorage:", e);
      }

      // 2. Intentar desde localStorage
      try {
        const raw = localStorage.getItem("sinistra_scene_payload");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.textureDataUrl) return parsed;
        }
      } catch (e) {
        console.warn("Error leyendo de localStorage:", e);
      }

      // 3. Intentar desde IndexedDB
      try {
        const db = await this.openDB();
        const payload = await new Promise((resolve, reject) => {
          const tx = db.transaction(this.STORE_NAME, "readonly");
          const store = tx.objectStore(this.STORE_NAME);
          const req = store.get(this.KEY);
          req.onsuccess = (e) => resolve(e.target.result);
          req.onerror = (err) => reject(err);
        });
        if (payload && payload.textureDataUrl) return payload;
      } catch (err) {
        console.warn("No se pudo leer de IndexedDB:", err);
      }

      // 4. Intentar recuperar desde la exportación 3D (active_scene_3d)
      try {
        const raw3d = sessionStorage.getItem("sinistra_scene3d_zones");
        if (raw3d) {
          const p3d = JSON.parse(raw3d);
          if (p3d && p3d.textureDataUrl) return p3d;
        }
      } catch (e) {}

      try {
        const db = await this.openDB();
        const p3d = await new Promise((resolve) => {
          const tx = db.transaction(this.STORE_NAME, "readonly");
          const store = tx.objectStore(this.STORE_NAME);
          const req = store.get("active_scene_3d");
          req.onsuccess = (e) => resolve(e.target.result);
          req.onerror = () => resolve(null);
        });
        if (p3d && p3d.textureDataUrl) return p3d;
      } catch (e) {}

      // 5. Fallback demo map calibrado (para que nunca aparezca el canvas negro si no hay datos previos)
      return getFallbackScene();
    },
  };

  const SceneDB = {
    async put(key, value) {
      const db = await SceneStorage.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(SceneStorage.STORE_NAME, "readwrite");
        tx.objectStore(SceneStorage.STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
        tx.onabort = (e) => reject(e);
      });
    },
    async get(key) {
      const db = await SceneStorage.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(SceneStorage.STORE_NAME, "readonly");
        const req = tx.objectStore(SceneStorage.STORE_NAME).get(key);
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e);
      });
    },
  };

  function polygonAreaMeters(pts) {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      a += pts[j].x * pts[i].z - pts[i].x * pts[j].z;
    }
    return Math.abs(a / 2);
  }

  function polygonPerimeterMeters(pts) {
    let p = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      p += Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
    }
    return p;
  }

  function inferZoneOrigin(z) {
    if (z.origin) return z.origin;
    if (String(z.id).startsWith("zone_wand_")) return "wand";
    if (String(z.id).startsWith("osm_")) return "osm";
    return "polygon";
  }

  function buildSceneExport(customState, canvasRef) {
    const currentState =
      customState || (typeof state !== "undefined" ? state : window.state);
    const m = currentState.metadata;
    const size = m.sizeMeters;
    const cWidth = canvasRef
      ? canvasRef.width
      : typeof ui !== "undefined" && ui.canvas
        ? ui.canvas.width
        : 800;
    const cHeight = canvasRef
      ? canvasRef.height
      : typeof ui !== "undefined" && ui.canvas
        ? ui.canvas.height
        : 800;
    const procPx = Math.round(
      cWidth * Math.min(1, 600 / Math.max(cWidth, cHeight)),
    );

    const skipped = [];
    const zones = [];
    currentState.zones.forEach((z) => {
      if (!z.points || z.points.length < 3) {
        skipped.push(z.name);
        return;
      }
      const pointsMeters = z.points.map((p) => ({
        x: (p.x - 0.5) * size,
        z: (p.y - 0.5) * size,
      }));
      const areaM2 = polygonAreaMeters(pointsMeters);
      if (areaM2 < 0.01) {
        skipped.push(z.name);
        return;
      }
      zones.push({
        id: z.id,
        name: z.name,
        type: z.type,
        elevationMeters: z.elevationMeters,
        color: z.color,
        notes: z.notes || "",
        origin: inferZoneOrigin(z),
        pointsNorm: z.points.map((p) => ({ x: p.x, y: p.y })),
        pointsMeters,
        areaM2,
        perimeterM: polygonPerimeterMeters(pointsMeters),
      });
    });

    const exportedObjects = (currentState.objects || []).map((o) => {
      const catalog =
        (typeof OBJECTS_CATALOG !== "undefined" &&
          OBJECTS_CATALOG[o.catalogId]) ||
        {};
      return {
        id: o.id,
        catalogId: o.catalogId,
        name: o.name,
        category: o.category || catalog.category || "vehiculo",
        positionMeters: {
          x: (o.normX - 0.5) * size,
          z: (o.normY - 0.5) * size,
        },
        positionNorm: { x: o.normX, y: o.normY },
        rotationDeg: o.rotationDeg || 0,
        deviationAngleDeg:
          o.deviationAngleDeg !== undefined ? o.deviationAngleDeg : 0,
        finalRestDistanceM:
          o.finalRestDistanceM !== undefined ? o.finalRestDistanceM : 5.0,
        finalRest: o.finalRest || null,
        baseElevationMeters: o.baseElevationMeters || 0,
        zoneId: o.zoneId || null,
        isAccidentInvolved: !!o.isAccidentInvolved,
        role: o.role || "inerte",
        color: o.color || catalog.defaultColor || "#2563eb",
        dimensions: {
          lengthM: catalog.lengthM || 4.5,
          widthM: catalog.widthM || 1.8,
          heightM: catalog.heightM || 1.45,
        },
        skidLengthM: o.skidLengthM || catalog.lengthM || 10.0,
        skidTrackWidthM: o.skidTrackWidthM || catalog.widthM || 1.5,
        triggerOnPass: !!o.triggerOnPass,
        kinematics: o.kinematics
          ? {
              speedKmh: o.kinematics.speedKmh || 50,
              brakeDistanceM: o.kinematics.brakeDistanceM || 0,
              curveMode: o.kinematics.curveMode || "smooth",
              curveTension: o.kinematics.curveTension !== undefined ? o.kinematics.curveTension : 0.5,
              trajectoryPoints: (o.kinematics.trajectoryPoints || []).map(
                (p) => ({
                  x: p.x !== undefined ? p.x : (p.normX - 0.5) * size,
                  z: p.z !== undefined ? p.z : (p.normY - 0.5) * size,
                  normX: p.normX,
                  normY: p.normY,
                  type: p.type || "path",
                  speedKmh:
                    p.speedKmh !== undefined
                      ? p.speedKmh
                      : o.kinematics.speedKmh || 50,
                  waitTimeSec:
                    p.waitTimeSec !== undefined
                      ? Number(p.waitTimeSec)
                      : p.type === "final_rest" ? 2.0 : 0,
                }),
              ),
            }
          : null,
        notes: o.notes || "",
        rider:
          o.rider ||
          (o.catalogId === "moto" && catalog.rider
            ? JSON.parse(JSON.stringify(catalog.rider))
            : o.catalogId === "moto"
              ? {
                  enabled: true,
                  massKg: 75,
                  frictionGround: 0.66,
                  launchAngleDeg: 15,
                  restitution: 0.1,
                }
              : null),
      };
    });

    const exportData = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      source: { app: "Sinistra 3D", stage: 2 },
      metadata: {
        sizeMeters: size,
        resolutionPx: m.resolutionPx,
        metersPerPixel: m.metersPerPixel,
        wandProcPixelMeters: size / procPx,
        center: { lat: m.center.lat, lng: m.center.lng },
        bearingDeg: m.bearingDeg || 0,
        baseMapStyle: m.baseMapStyle,
        manualDuration:
          m.manualDuration ||
          (typeof localStorage !== "undefined" &&
            Number(localStorage.getItem("sinistra_manual_duration"))) ||
          undefined,
      },
      textureDataUrl: currentState.textureDataUrl,
      zones,
      objects: exportedObjects,
      dimensions: (currentState.dimensions || []).map((d) => ({
        id: d.id,
        type: d.type || "linear",
        label: d.label,
        distanceMeters: d.distanceMeters,
        valueMeters: d.valueMeters !== undefined ? d.valueMeters : d.distanceMeters,
        angleDeg: d.angleDeg,
        p1: d.p1,
        p2: d.p2,
        textOffset: d.textOffset,
      })),
    };
    return { exportData, skipped };
  }

  let lastSavedJson = null;
  let saveTimer = null;

  function getSceneId(state) {
    return String((state.metadata && state.metadata.timestamp) || "demo");
  }

  function scheduleSave(state) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistZones(state), 500);
  }

  async function persistZones(state) {
    if (!state) return;
    const json = JSON.stringify({
      zones: state.zones,
      objects: state.objects,
      dimensions: state.dimensions,
      manualDuration: (state.metadata && state.metadata.manualDuration) || null,
    });
    if (json === lastSavedJson) return;
    lastSavedJson = json;
    const rec = {
      sceneId: getSceneId(state),
      savedAt: Date.now(),
      zones: state.zones,
      objects: state.objects,
      dimensions: state.dimensions,
      manualDuration: (state.metadata && state.metadata.manualDuration) || null,
    };
    try {
      sessionStorage.setItem("sinistra_zones_state", JSON.stringify(rec));
    } catch (e) {
      console.warn("No se pudo respaldar zonas en sessionStorage:", e);
    }
    try {
      await SceneDB.put("zones_state", rec);
    } catch (e) {
      console.warn("No se pudo guardar zonas en IndexedDB:", e);
    }
  }

  async function restoreZones(state, showToast) {
    if (!state) return;
    const id = getSceneId(state);
    const sizeMeters = (state.metadata && state.metadata.sizeMeters) || 100;
    let best = null;
    try {
      const raw = sessionStorage.getItem("sinistra_zones_state");
      if (raw) {
        const r = JSON.parse(raw);
        if (r && (r.sceneId === id || !r.sceneId || id === "demo")) best = r;
      }
    } catch (e) {}
    try {
      const r = await SceneDB.get("zones_state");
      if (r && (r.sceneId === id || !r.sceneId || id === "demo") && (!best || r.savedAt > (best.savedAt || 0)))
        best = r;
    } catch (e) {}

    // Respaldo de seguridad: si no hay objetos o zonas en el estado 2D guardado, recuperar del snapshot 3D
    if (!best || !Array.isArray(best.objects) || best.objects.length === 0 || !Array.isArray(best.zones) || best.zones.length === 0) {
      try {
        const raw3d = sessionStorage.getItem("sinistra_scene3d_zones");
        if (raw3d) {
          const p3d = JSON.parse(raw3d);
          if (p3d) {
            if (!best) best = {};
            if ((!best.objects || best.objects.length === 0) && Array.isArray(p3d.objects) && p3d.objects.length > 0) {
              best.objects = p3d.objects;
            }
            if ((!best.zones || best.zones.length === 0) && Array.isArray(p3d.zones) && p3d.zones.length > 0) {
              best.zones = p3d.zones;
            }
            if ((!best.dimensions || best.dimensions.length === 0) && Array.isArray(p3d.dimensions)) {
              best.dimensions = p3d.dimensions;
            }
          }
        }
      } catch (e) {}

      try {
        const p3d = await SceneDB.get("active_scene_3d");
        if (p3d) {
          if (!best) best = {};
          if ((!best.objects || best.objects.length === 0) && Array.isArray(p3d.objects) && p3d.objects.length > 0) {
            best.objects = p3d.objects;
          }
          if ((!best.zones || best.zones.length === 0) && Array.isArray(p3d.zones) && p3d.zones.length > 0) {
            best.zones = p3d.zones;
          }
          if ((!best.dimensions || best.dimensions.length === 0) && Array.isArray(p3d.dimensions)) {
            best.dimensions = p3d.dimensions;
          }
        }
      } catch (e) {}
    }

    if (best) {
      if (Array.isArray(best.zones) && best.zones.length > 0) {
        state.zones = best.zones.map((z) => {
          let pts = z.points || z.pointsNorm;
          if ((!pts || pts.length === 0) && Array.isArray(z.pointsMeters)) {
            pts = z.pointsMeters.map((p) => ({
              x: p.x / sizeMeters + 0.5,
              y: p.z / sizeMeters + 0.5,
            }));
          }
          return {
            ...z,
            points: pts || [],
          };
        });
      }
      if (Array.isArray(best.objects) && best.objects.length > 0) {
        state.objects = best.objects.map((o) => {
          let normX = o.normX !== undefined ? o.normX : (o.positionNorm ? o.positionNorm.x : undefined);
          let normY = o.normY !== undefined ? o.normY : (o.positionNorm ? o.positionNorm.y : undefined);
          if (normX === undefined && o.positionMeters) {
            normX = o.positionMeters.x / sizeMeters + 0.5;
            normY = o.positionMeters.z / sizeMeters + 0.5;
          }
          if (o.kinematics && Array.isArray(o.kinematics.trajectoryPoints)) {
            o.kinematics.trajectoryPoints.forEach((p) => {
              if (p.normX === undefined && p.x !== undefined) p.normX = p.x / sizeMeters + 0.5;
              if (p.normY === undefined && p.z !== undefined) p.normY = p.z / sizeMeters + 0.5;
            });
          }
          return {
            ...o,
            normX: normX !== undefined ? normX : 0.5,
            normY: normY !== undefined ? normY : 0.5,
          };
        });
      }
      if (Array.isArray(best.dimensions) && best.dimensions.length > 0) state.dimensions = best.dimensions;
      if (best.manualDuration && Number(best.manualDuration) > 0) {
        if (!state.metadata) state.metadata = {};
        state.metadata.manualDuration = Number(best.manualDuration);
      } else {
        try {
          const l = localStorage.getItem("sinistra_manual_duration");
          if (l && Number(l) > 0) {
            if (!state.metadata) state.metadata = {};
            state.metadata.manualDuration = Number(l);
          }
        } catch (e) {}
      }

      lastSavedJson = JSON.stringify({
        zones: state.zones,
        objects: state.objects,
        dimensions: state.dimensions,
        manualDuration: (state.metadata && state.metadata.manualDuration) || null,
      });
      if (
        (state.zones.length > 0 ||
          state.objects.length > 0 ||
          (state.dimensions && state.dimensions.length > 0)) &&
        typeof showToast === "function"
      ) {
        showToast(
          `Se restauraron ${state.zones.length} zonas, ${state.objects.length} objetos y ${(state.dimensions || []).length} cotas`,
          3000,
        );
      }
    }
  }

  async function convertTo3D(state, ui, showToast) {
    if (!state.textureDataUrl) {
      if (typeof showToast === "function")
        showToast("La textura aún no está lista. Intenta de nuevo.");
      return;
    }
    if (
      state.zones.length === 0 &&
      !confirm(
        "No hay zonas delimitadas. ¿Generar el 3D solo con la textura del mapa?",
      )
    ) {
      return;
    }

    if (ui && ui.btnConvert3D) ui.btnConvert3D.disabled = true;
    const { exportData, skipped } = buildSceneExport(state);
    if (skipped.length > 0 && typeof showToast === "function") {
      showToast(
        `Se omitieron ${skipped.length} zonas inválidas: ${skipped.join(", ")}`,
        3500,
      );
    }

    if (typeof showToast === "function")
      showToast("Transfiriendo geometría y objetos a 3D...", 1500);

    try {
      sessionStorage.setItem(
        "sinistra_scene3d_zones",
        JSON.stringify(exportData),
      );
    } catch (e) {
      console.warn("sessionStorage lleno, confiando en IndexedDB:", e);
    }

    try {
      await SceneDB.put("active_scene_3d", exportData);
    } catch (e) {
      console.warn("No se pudo guardar en IndexedDB:", e);
    }

    setTimeout(() => {
      window.location.href = "scene3d.html";
    }, 450);
  }

  function getFallbackScene() {
    if (typeof makeDefault2DScene === "function") return makeDefault2DScene();
    if (root && typeof root.makeDefault2DScene === "function")
      return root.makeDefault2DScene();
    return null;
  }

  async function loadPayloadFromStorage(
    customState,
    customUi,
    customToast,
    customUpdateMetadata,
    customResizeAndRepaint,
  ) {
    const s =
      customState || (typeof state !== "undefined" ? state : root.state);
    if (!s) return;
    try {
      const payload = await SceneStorage.load();
      if (payload) {
        if (payload.metadata) {
          s.metadata = Object.assign(s.metadata || {}, payload.metadata);
        }
        try {
          const l = localStorage.getItem("sinistra_manual_duration");
          if (l && Number(l) > 0) {
            if (!s.metadata) s.metadata = {};
            s.metadata.manualDuration = Number(l);
          }
        } catch (e) {}
        const sizeMeters = s.metadata.sizeMeters || 100;

        if (payload.textureDataUrl) {
          s.textureDataUrl = payload.textureDataUrl;
          const img = new Image();
          img.onload = () => {
            s.baseImage = img;
            if (typeof customResizeAndRepaint === "function")
              customResizeAndRepaint();
            else if (typeof root.resizeAndRepaint === "function")
              root.resizeAndRepaint();
            else if (typeof root.repaintScene === "function")
              root.repaintScene();
            if (typeof customUpdateMetadata === "function")
              customUpdateMetadata();
            else if (typeof root.updateMetadataDisplay === "function")
              root.updateMetadataDisplay();
          };
          img.src = payload.textureDataUrl;
        }

        // Restaurar o cargar zonas
        if (typeof restoreZones === "function") {
          await restoreZones(s, customToast);
        }

        // Si después de restoreZones aún no hay zonas y el payload tiene zonas:
        if (
          (!s.zones || s.zones.length === 0) &&
          Array.isArray(payload.zones)
        ) {
          s.zones = payload.zones.map((z) => {
            let pts = z.points;
            if ((!pts || pts.length === 0) && Array.isArray(z.pointsMeters)) {
              pts = z.pointsMeters.map((p) => ({
                x: p.x / sizeMeters + 0.5,
                y: p.z / sizeMeters + 0.5,
              }));
            }
            return {
              id: z.id || "zone_" + Date.now(),
              name: z.name || "Zona",
              type: z.type || "calzada",
              elevationMeters:
                z.elevationMeters !== undefined ? z.elevationMeters : 0,
              color:
                z.color ||
                (typeof ZONE_CONFIG !== "undefined" &&
                  ZONE_CONFIG[z.type]?.color) ||
                "#94a3b8",
              notes: z.notes || "",
              origin: z.origin || "polygon",
              points: pts || [],
            };
          });
        }

        // Si después de restoreZones aún no hay objetos, buscar en payload o snapshot 3D:
        if (!s.objects || s.objects.length === 0) {
          let sourceObjects = (Array.isArray(payload.objects) && payload.objects.length > 0) ? payload.objects : null;
          if (!sourceObjects) {
            try {
              const raw3d = sessionStorage.getItem("sinistra_scene3d_zones");
              if (raw3d) {
                const p3d = JSON.parse(raw3d);
                if (p3d && Array.isArray(p3d.objects) && p3d.objects.length > 0) sourceObjects = p3d.objects;
              }
            } catch (e) {}
          }
          if (!sourceObjects) {
            try {
              const p3d = await SceneDB.get("active_scene_3d");
              if (p3d && Array.isArray(p3d.objects) && p3d.objects.length > 0) sourceObjects = p3d.objects;
            } catch (e) {}
          }

          if (Array.isArray(sourceObjects) && sourceObjects.length > 0) {
            s.objects = sourceObjects.map((o) => {
              let normX = o.normX !== undefined ? o.normX : (o.positionNorm ? o.positionNorm.x : undefined);
              let normY = o.normY !== undefined ? o.normY : (o.positionNorm ? o.positionNorm.y : undefined);
              if (normX === undefined && o.positionMeters) {
                normX = o.positionMeters.x / sizeMeters + 0.5;
                normY = o.positionMeters.z / sizeMeters + 0.5;
              }
              let kin = null;
              if (o.kinematics) {
                const pts = (o.kinematics.trajectoryPoints || []).map((p) => {
                  const nx = p.normX !== undefined ? p.normX : (p.x !== undefined ? p.x / sizeMeters + 0.5 : 0.5);
                  const ny = p.normY !== undefined ? p.normY : (p.z !== undefined ? p.z / sizeMeters + 0.5 : 0.5);
                  return {
                    normX: nx,
                    normY: ny,
                    x: p.x !== undefined ? p.x : (nx - 0.5) * sizeMeters,
                    z: p.z !== undefined ? p.z : (ny - 0.5) * sizeMeters,
                    type: p.type || "path",
                    speedKmh:
                      p.speedKmh !== undefined
                        ? p.speedKmh
                        : o.kinematics.speedKmh || 50,
                    waitTimeSec:
                      p.waitTimeSec !== undefined
                        ? Number(p.waitTimeSec)
                        : p.type === "final_rest" ? 2.0 : 0,
                  };
                });
                kin = {
                  speedKmh: o.kinematics.speedKmh || 50,
                  brakeDistanceM: o.kinematics.brakeDistanceM || 0,
                  curveMode: o.kinematics.curveMode || "smooth",
                  curveTension: o.kinematics.curveTension !== undefined ? o.kinematics.curveTension : 0.5,
                  trajectoryPoints: pts,
                };
              }
              return {
                id: o.id || "obj_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
                catalogId: o.catalogId || "sedan",
                name: o.name || "Objeto",
                category: o.category || "vehiculo",
                normX: normX !== undefined ? normX : 0.5,
                normY: normY !== undefined ? normY : 0.5,
                rotationDeg: o.rotationDeg || 0,
                deviationAngleDeg: o.deviationAngleDeg || 0,
                baseElevationMeters: o.baseElevationMeters || 0,
                zoneId: o.zoneId || null,
                isAccidentInvolved: !!o.isAccidentInvolved,
                role: o.role || "inerte",
                color: o.color || "#2563eb",
                skidLengthM: o.skidLengthM || 10.0,
                skidTrackWidthM: o.skidTrackWidthM || 1.5,
                rider:
                  o.rider ||
                  (o.catalogId === "moto"
                    ? {
                        enabled: true,
                        massKg: 75,
                        frictionGround: 0.66,
                        launchAngleDeg: 15,
                        finalRestDistanceM: 6.0,
                        restitution: 0.1,
                      }
                    : null),
                kinematics: kin,
                notes: o.notes || "",
              };
            });
          }
        }

        if ((!s.dimensions || s.dimensions.length === 0) && Array.isArray(payload.dimensions)) {
          s.dimensions = payload.dimensions;
        }

        if (s.objects && s.objects.length > 0) {
          persistZones(s);
        }

        if (typeof root.updateZonesListUI === "function")
          root.updateZonesListUI();
        if (typeof root.updateObjectsListUI === "function")
          root.updateObjectsListUI();
        if (typeof customUpdateMetadata === "function") customUpdateMetadata();
        else if (typeof root.updateMetadataDisplay === "function")
          root.updateMetadataDisplay();
        if (typeof customResizeAndRepaint === "function")
          customResizeAndRepaint();
        else if (typeof root.resizeAndRepaint === "function")
          root.resizeAndRepaint();
        else if (typeof root.repaintScene === "function") root.repaintScene();
      }
    } catch (err) {
      console.warn("Error cargando payload de almacenamiento:", err);
      if (typeof customResizeAndRepaint === "function")
        customResizeAndRepaint();
      else if (typeof root.resizeAndRepaint === "function")
        root.resizeAndRepaint();
    }
  }

  return {
    SceneStorage,
    SceneDB,
    polygonAreaMeters,
    polygonPerimeterMeters,
    inferZoneOrigin,
    buildSceneExport,
    scheduleSave,
    persistZones,
    restoreZones,
    convertTo3D,
    loadPayloadFromStorage,
  };
});
