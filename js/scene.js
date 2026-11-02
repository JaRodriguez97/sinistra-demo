/**
 * Sinistra 3D - Espacio de Trabajo Forense (Etapa 2)
 * Motor 2D de delimitación pericial, trazado interactivo, renderizado y reconstrucción cinemática.
 */

// Configuración de tipos y colores de zonas viales
const ZONE_CONFIG = {
  anden: {
    label: "Andén",
    defaultElevation: 0.15,
    color: "#00f0ff",
    fill: "rgba(0, 240, 255, 0.28)",
  },
  separador: {
    label: "Separador",
    defaultElevation: 0.2,
    color: "#10b981",
    fill: "rgba(16, 185, 129, 0.38)",
  },
  calzada: {
    label: "Calzada",
    defaultElevation: 0.0,
    color: "#94a3b8",
    fill: "rgba(15, 23, 42, 0.72)",
  },
  edificio: {
    label: "Edificación",
    defaultElevation: 3.5,
    color: "#a855f7",
    fill: "rgba(168, 85, 247, 0.35)",
  },
};

// Estado central de la aplicación
const state = {
  metadata: {
    sizeMeters: 100,
    resolutionPx: 800,
    metersPerPixel: 0.125,
    center: { lat: 3.4516, lng: -76.5319 },
    bearingDeg: 0,
    baseMapStyle: "google-hybrid",
  },
  baseImage: null,
  activeMode: "select",
  activeCategory: "anden",
  wandTolerance: 25,
  zones: [],
  objects: [],
  selectedZoneId: null,
  hoveredZoneId: null,
  selectedObjectId: null,
  hoveredObjectId: null,
  activeCatalogId: "sedan",
  activeObjCategory: "vehiculo",
  isDraggingObject: false,
  isRotatingObject: false,
  isTracingTrajectory: false,
  dragObjectOffset: { x: 0, y: 0 },
  isDrawing: false,
  dragStart: null,
  dragCurrent: null,
  freePolygonPoints: [],
  mouseCanvasCoords: null,
  draggingVertex: null,
  hoveredVertex: null,
  selectedVertex: null,
  selectedTrajPoint: null,
  draggingTrajPoint: null,
  hoveredTrajPoint: null,
  zoom: 1.0,
  panX: 0,
  panY: 0,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  hasPanned: false,
  showHitboxes: false,
  dimensions: [],
  forensicOrigin: { normX: 0.5, normY: 0.5, label: "PRF (0,0)", isSet: false },
  calibration: { scaleFactor: 1.0, isCalibrated: false },
  activeDimensionTool: "linear",
  dimensionDraft: null,
  selectedDimensionId: null,
  draggingDimensionText: null,
};

// Referencias UI
const ui = {
  canvasStage: document.getElementById("canvasStage"),
  canvas: document.getElementById("mainCanvas"),
  ctx: document.getElementById("mainCanvas").getContext("2d"),
  metaDim: document.getElementById("metaDim"),
  metaRes: document.getElementById("metaRes"),
  metaMpp: document.getElementById("metaMpp"),
  metaStyle: document.getElementById("metaStyle"),
  metaCoords: document.getElementById("metaCoords"),
  metaZoneCount: document.getElementById("metaZoneCount"),
  btnAutoDetectOSM: document.getElementById("btnAutoDetectOSM"),
  btnUndo: document.getElementById("btnUndo"),
  btnRedo: document.getElementById("btnRedo"),
  btnClearAll: document.getElementById("btnClearAll"),
  btnConvert3D: document.getElementById("btnConvert3D"),
  btnZoomIn: document.getElementById("btnZoomIn"),
  btnZoomOut: document.getElementById("btnZoomOut"),
  btnZoomReset: document.getElementById("btnZoomReset"),
  zoomBadge: document.getElementById("zoomBadge"),
  modeButtons: document.querySelectorAll("[data-mode]"),
  categoryButtons: document.querySelectorAll("[data-cat]"),
  wandOptionsPanel: document.getElementById("wandOptionsPanel"),
  inputWandTol: document.getElementById("inputWandTol"),
  wandTolVal: document.getElementById("wandTolVal"),
  toolInstructionTip: document.getElementById("toolInstructionTip"),
  inspectorCard: document.getElementById("inspectorCard"),
  inspectorEmptyState: document.getElementById("inspectorEmptyState"),
  inspectorForm: document.getElementById("inspectorForm"),
  inputZoneName: document.getElementById("inputZoneName"),
  selectZoneType: document.getElementById("selectZoneType"),
  inputZoneElevation: document.getElementById("inputZoneElevation"),
  textareaZoneNotes: document.getElementById("textareaZoneNotes"),
  btnDeleteZone: document.getElementById("btnDeleteZone"),
  zonesListContainer: document.getElementById("zonesListContainer"),
  objectsOptionsPanel: document.getElementById("objectsOptionsPanel"),
  objCategoryTabs: document.querySelectorAll("[data-objcat]"),
  objCatalogGrid: document.getElementById("objCatalogGrid"),
  dimensionOptionsPanel: document.getElementById("dimensionOptionsPanel"),
  dimensionHintText: document.getElementById("dimensionHintText"),
  btnEditDimensionValue: document.getElementById("btnEditDimensionValue"),
  btnDeleteDimension: document.getElementById("btnDeleteDimension"),
  btnClearDimensions: document.getElementById("btnClearDimensions"),
  objectInspectorCard: document.getElementById("objectInspectorCard"),
  objectInspectorForm: document.getElementById("objectInspectorForm"),
  inputObjName: document.getElementById("inputObjName"),
  selectObjCatalogType: document.getElementById("selectObjCatalogType"),
  displayObjType: document.getElementById("displayObjType"),
  inputObjElevation: document.getElementById("inputObjElevation"),
  inputObjRotation: document.getElementById("inputObjRotation"),
  inputObjColor: document.getElementById("inputObjColor"),
  fieldAccidentInvolved: document.getElementById("fieldAccidentInvolved"),
  checkObjInvolved: document.getElementById("checkObjInvolved"),
  objAccidentFields: document.getElementById("objAccidentFields"),
  selectObjRole: document.getElementById("selectObjRole"),
  inputObjSpeed: document.getElementById("inputObjSpeed"),
  inputObjDeviationAngle: document.getElementById("inputObjDeviationAngle"),
  inputObjVehicleRestDist: document.getElementById("inputObjVehicleRestDist"),
  fieldMotoRider: document.getElementById("fieldMotoRider"),
  inputObjRiderLaunchAngle: document.getElementById("inputObjRiderLaunchAngle"),
  inputObjRiderRestDist: document.getElementById("inputObjRiderRestDist"),
  btnTraceTrajectory: document.getElementById("btnTraceTrajectory"),
  objTrajectoryStats: document.getElementById("objTrajectoryStats"),
  objTrajectoryPointsList: document.getElementById("objTrajectoryPointsList"),
  skidMarksFields: document.getElementById("skidMarksFields"),
  inputSkidLength: document.getElementById("inputSkidLength"),
  inputSkidTrack: document.getElementById("inputSkidTrack"),
  checkSkidTriggerOnPass: document.getElementById("checkSkidTriggerOnPass"),
  textareaObjNotes: document.getElementById("textareaObjNotes"),
  btnDeleteObject: document.getElementById("btnDeleteObject"),
  tabListZones: document.getElementById("tabListZones"),
  tabListObjects: document.getElementById("tabListObjects"),
  objectsListContainer: document.getElementById("objectsListContainer"),
  objZoneBadge: document.getElementById("objZoneBadge"),
  simTimelineBar: document.getElementById("simTimelineBar"),
  btnSimPlay: document.getElementById("btnSimPlay"),
  simPlayIcon: document.getElementById("simPlayIcon"),
  simPlayText: document.getElementById("simPlayText"),
  btnSimReverse: document.getElementById("btnSimReverse"),
  btnSimReset: document.getElementById("btnSimReset"),
  btnSimStepBack: document.getElementById("btnSimStepBack"),
  btnSimStepForward: document.getElementById("btnSimStepForward"),
  simTimeSlider: document.getElementById("simTimeSlider"),
  simCurrentTime: document.getElementById("simCurrentTime"),
  simTotalTime: document.getElementById("simTotalTime"),
  btnEditSimDuration: document.getElementById("btnEditSimDuration"),
  simSpeedButtons: document.querySelectorAll(".sim-speed-btn"),
  simLiveTelemetry: document.getElementById("simLiveTelemetry"),
  simTelemetryVehicle: document.getElementById("simTelemetryVehicle"),
  simTelemetrySpeed: document.getElementById("simTelemetrySpeed"),
  btnToggleHitboxes: document.getElementById("btnToggleHitboxes"),
  simCollisionStatus: document.getElementById("simCollisionStatus"),
  simCollisionText: document.getElementById("simCollisionText"),
  toast: document.getElementById("toast"),
  toastMessage: document.getElementById("toastMessage"),
};

window.state = state;
window.ui = ui;

// Historial Undo / Redo
const History = {
  undoStack: [],
  redoStack: [],
  maxStates: 25,

  push() {
    const serialized = JSON.stringify({
      zones: state.zones,
      objects: state.objects,
      dimensions: state.dimensions,
    });
    this.undoStack.push(serialized);
    if (this.undoStack.length > this.maxStates) this.undoStack.shift();
    this.redoStack = [];
    this.updateUI();
  },

  undo() {
    if (this.undoStack.length === 0) return;
    const currentState = JSON.stringify({
      zones: state.zones,
      objects: state.objects,
      dimensions: state.dimensions,
    });
    this.redoStack.push(currentState);
    const prevState = JSON.parse(this.undoStack.pop());
    state.zones = prevState.zones || [];
    state.objects = prevState.objects || [];
    state.dimensions = prevState.dimensions || [];
    this.afterRestore();
    showToast("Acción deshecha");
  },

  redo() {
    if (this.redoStack.length === 0) return;
    const currentState = JSON.stringify({
      zones: state.zones,
      objects: state.objects,
      dimensions: state.dimensions,
    });
    this.undoStack.push(currentState);
    const nextState = JSON.parse(this.redoStack.pop());
    state.zones = nextState.zones || [];
    state.objects = nextState.objects || [];
    state.dimensions = nextState.dimensions || [];
    this.afterRestore();
    showToast("Acción rehecha");
  },

  afterRestore() {
    state.selectedZoneId = null;
    state.selectedObjectId = null;
    state.selectedVertex = null;
    state.selectedDimensionId = null;
    if (typeof selectZone === "function") selectZone(null);
    if (typeof selectObject === "function") selectObject(null);
    if (typeof updateZonesListUI === "function") updateZonesListUI();
    if (typeof updateObjectsListUI === "function") updateObjectsListUI();
    this.updateUI();
    scheduleSave();
    repaintScene();
  },

  updateUI() {
    if (ui.btnUndo) ui.btnUndo.disabled = this.undoStack.length === 0;
    if (ui.btnRedo) ui.btnRedo.disabled = this.redoStack.length === 0;
  },
};

let toastTimeout = null;
function showToast(msg, duration = 3000) {
  if (!ui.toast || !ui.toastMessage) return;
  ui.toastMessage.textContent = msg;
  ui.toast.classList.add("show");
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    ui.toast.classList.remove("show");
  }, duration);
}

function updateMetadataDisplay() {
  const m = state.metadata;
  if (ui.metaDim)
    ui.metaDim.textContent = `${m.sizeMeters} × ${m.sizeMeters} m`;
  if (ui.metaRes)
    ui.metaRes.textContent = `${m.resolutionPx} × ${m.resolutionPx} px`;
  if (ui.metaMpp)
    ui.metaMpp.textContent = `${m.metersPerPixel.toFixed(3)} m / px`;
  if (ui.metaZoneCount) {
    ui.metaZoneCount.textContent = `${state.zones.length} ${state.zones.length === 1 ? "zona" : "zonas"}`;
  }
}

function resizeAndRepaint() {
  const width = state.metadata.resolutionPx || 800;
  const height = state.metadata.resolutionPx || 800;
  ui.canvas.width = width;
  ui.canvas.height = height;
  repaintScene();
}

window.updateMetadataDisplay = updateMetadataDisplay;
window.resizeAndRepaint = resizeAndRepaint;
window.repaintScene = repaintScene;
window.showToast = showToast;

function getCanvasRelativeCoords(e) {
  const rect = ui.canvas.getBoundingClientRect();
  const clientX = e.clientX - rect.left;
  const clientY = e.clientY - rect.top;
  const canvasPxX = clientX * (ui.canvas.width / rect.width);
  const canvasPxY = clientY * (ui.canvas.height / rect.height);

  const sceneX = (canvasPxX - state.panX) / state.zoom;
  const sceneY = (canvasPxY - state.panY) / state.zoom;
  const normX = sceneX / ui.canvas.width;
  const normY = sceneY / ui.canvas.height;

  return {
    normX,
    normY,
    clampedNormX: Math.max(0, Math.min(1, normX)),
    clampedNormY: Math.max(0, Math.min(1, normY)),
    meterX: normX * state.metadata.sizeMeters,
    meterY: normY * state.metadata.sizeMeters,
    sceneX,
    sceneY,
    canvasPxX,
    canvasPxY,
  };
}

function setZoom(newZoom, centerX, centerY) {
  const oldZoom = state.zoom;
  const clampedZoom = Math.max(0.75, Math.min(8.0, newZoom));
  if (Math.abs(clampedZoom - oldZoom) < 0.001) return;

  const cx = centerX !== undefined ? centerX : ui.canvas.width / 2;
  const cy = centerY !== undefined ? centerY : ui.canvas.height / 2;

  state.panX = cx - (cx - state.panX) * (clampedZoom / oldZoom);
  state.panY = cy - (cy - state.panY) * (clampedZoom / oldZoom);
  state.zoom = clampedZoom;

  updateZoomUI();
  repaintScene();
}

function resetZoom() {
  state.zoom = 1.0;
  state.panX = 0;
  state.panY = 0;
  updateZoomUI();
  repaintScene();
  showToast("Vista restablecida 100% (centrada)");
}

function updateZoomUI() {
  if (ui.zoomBadge)
    ui.zoomBadge.textContent = `${Math.round(state.zoom * 100)}%`;
}

/* =====================================================================
 * Ciclo Principal de Dibujo 2D (Canvas Overhead)
 * ===================================================================== */
function repaintScene() {
  const ctx = ui.ctx;
  const w = ui.canvas.width;
  const h = ui.canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(state.panX, state.panY);
  ctx.scale(state.zoom, state.zoom);

  // 1. Fondo fotográfico
  if (state.baseImage) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(state.baseImage, 0, 0, w, h);
  } else {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, w, h);
  }

  // 2. Capas de Zonas Viales
  const typeLayerOrder = { calzada: 1, anden: 2, separador: 3, edificio: 4 };
  const sortedZones = [...state.zones].sort((a, b) => {
    return (typeLayerOrder[a.type] || 2) - (typeLayerOrder[b.type] || 2);
  });

  sortedZones.forEach((zone) => {
    const isSelected = zone.id === state.selectedZoneId;
    const isHovered = zone.id === state.hoveredZoneId;
    const cfg = ZONE_CONFIG[zone.type] || ZONE_CONFIG.anden;

    ctx.save();
    ctx.beginPath();
    zone.points.forEach((pt, idx) => {
      const px = pt.x * w;
      const py = pt.y * h;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();

    ctx.fillStyle = isSelected
      ? "rgba(0, 240, 255, 0.42)"
      : isHovered
        ? "rgba(255, 255, 255, 0.35)"
        : cfg.fill;
    ctx.fill();

    ctx.strokeStyle = isSelected
      ? "#00f0ff"
      : isHovered
        ? "#ffffff"
        : cfg.color;
    ctx.lineWidth = (isSelected ? 3.0 : isHovered ? 2.5 : 1.8) / state.zoom;
    ctx.stroke();
    ctx.restore();

    // Vértices interactivos de la zona seleccionada
    if (isSelected) {
      zone.points.forEach((pt, vIdx) => {
        const vx = pt.x * w;
        const vy = pt.y * h;
        const isHoveredV =
          state.hoveredVertex &&
          state.hoveredVertex.zoneId === zone.id &&
          state.hoveredVertex.vertexIndex === vIdx;
        const isSelectedV =
          state.selectedVertex &&
          state.selectedVertex.zoneId === zone.id &&
          state.selectedVertex.vertexIndex === vIdx;

        ctx.save();
        ctx.beginPath();
        const r = (isSelectedV ? 7.5 : isHoveredV ? 6.5 : 4.5) / state.zoom;
        ctx.arc(vx, vy, r, 0, Math.PI * 2);
        ctx.fillStyle = isSelectedV
          ? "#f59e0b"
          : isHoveredV
            ? "#00f0ff"
            : "#ffffff";
        ctx.strokeStyle = isSelectedV ? "#ef4444" : "#0f172a";
        ctx.lineWidth = (isSelectedV ? 2.5 : 1.8) / state.zoom;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });
    }

    // Etiqueta identificadora
    const center = getPolygonCenter(zone.points);
    const cx = center.x * w;
    const cy = center.y * h;
    ctx.save();
    const fontSize = Math.max(9, Math.round(11 / Math.sqrt(state.zoom)));
    ctx.font = isSelected
      ? `bold ${fontSize + 1}px Inter, sans-serif`
      : `600 ${fontSize}px Inter, sans-serif`;
    const labelText = `${zone.name} (+${zone.elevationMeters.toFixed(2)}m)`;
    const textMetrics = ctx.measureText(labelText);
    const bgPadding = 4 / state.zoom;

    ctx.fillStyle = isSelected
      ? "rgba(15, 23, 42, 0.95)"
      : "rgba(15, 23, 42, 0.85)";
    ctx.strokeStyle = isSelected ? "#00f0ff" : "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1 / state.zoom;
    ctx.beginPath();
    ctx.roundRect(
      cx - textMetrics.width / 2 - bgPadding,
      cy - (fontSize / 2 + bgPadding),
      textMetrics.width + bgPadding * 2,
      fontSize + bgPadding * 2,
      3 / state.zoom,
    );
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isSelected ? "#00f0ff" : "#f8fafc";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(labelText, cx, cy);
    ctx.restore();
  });

  // 3. Polígono Libre en progreso
  if (state.activeMode === "polygon" && state.freePolygonPoints.length > 0) {
    const cfg = ZONE_CONFIG[state.activeCategory] || ZONE_CONFIG.anden;
    ctx.save();
    ctx.beginPath();
    state.freePolygonPoints.forEach((pt, idx) => {
      const px = pt.normX * w;
      const py = pt.normY * h;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    if (state.mouseCanvasCoords) {
      ctx.lineTo(
        state.mouseCanvasCoords.normX * w,
        state.mouseCanvasCoords.normY * h,
      );
    }
    ctx.strokeStyle = cfg.color;
    ctx.lineWidth = 2.5 / state.zoom;
    ctx.setLineDash([6 / state.zoom, 4 / state.zoom]);
    ctx.stroke();
    ctx.restore();
  }

  // 4. Huellas de frenado, Trayectorias y Objetos Forenses
  if (typeof drawSkidMarks === "function") drawSkidMarks(ctx, w, h);
  if (typeof drawTrajectories === "function") drawTrajectories(ctx, w, h);
  if (typeof drawObjects === "function") drawObjects(ctx, w, h);
  if (typeof drawObjectGizmo === "function") drawObjectGizmo(ctx, w, h);

  // 5. Cotas, Mediciones y Punto de Referencia Forense (PRF)
  if (
    typeof SceneDimensions !== "undefined" &&
    typeof SceneDimensions.renderSceneDimensions === "function"
  ) {
    SceneDimensions.renderSceneDimensions(ctx, w, h, state);
  }

  ctx.restore();
  scheduleSave();

  if (ui.metaZoneCount) {
    const count = state.zones.length;
    ui.metaZoneCount.textContent = `${count} zona${count === 1 ? "" : "s"}`;
  }
}

// Delegaciones a scene_tools.js
function autoDetectMapGeometries() {
  if (typeof SceneTools !== "undefined") {
    return SceneTools.autoDetectMapGeometries(
      state,
      ui,
      showToast,
      updateZonesListUI,
      repaintScene,
      selectZone,
      History,
      ZONE_CONFIG,
    );
  }
}

function runMagicWandAt(coords) {
  if (typeof SceneTools !== "undefined") {
    return SceneTools.runMagicWandAt(
      coords,
      state,
      ui,
      showToast,
      History,
      ZONE_CONFIG,
      selectZone,
      updateZonesListUI,
      repaintScene,
    );
  }
}

function finishFreePolygon() {
  if (typeof SceneTools !== "undefined") {
    return SceneTools.finishFreePolygon(
      state,
      History,
      ZONE_CONFIG,
      selectZone,
      updateZonesListUI,
      repaintScene,
      showToast,
    );
  }
}

const MODE_TIPS = {
  select:
    "Selecciona una zona u objeto en el lienzo. Arrastra los vértices de polígonos o el aro exterior de objetos para orientarlos.",
  wand: "Haz clic sobre el asfalto, andén o tejado en el lienzo para delimitar automáticamente la figura según el contraste de color.",
  polygon:
    "Haz clic para añadir vértices punto a punto. Haz doble clic o clic en el primer punto verde para cerrar la figura.",
  object:
    "Haz clic en el plano para estampar el objeto del catálogo seleccionado. Arrástralo para moverlo y usa el aro exterior para rotarlo.",
  dimension:
    "Acotar Distancias: Haz clic en dos cuerpos o puntos del plano para trazar y asignar la distancia entre ellos.",
};

function setActiveMode(mode) {
  state.activeMode = mode;
  if (state.freePolygonPoints.length > 0 && mode !== "polygon") {
    state.freePolygonPoints = [];
  }
  if (mode !== "dimension") {
    state.dimensionDraft = null;
    state.draggingDimensionText = null;
  }

  ui.modeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-mode") === mode);
  });

  if (ui.wandOptionsPanel) {
    ui.wandOptionsPanel.style.display = mode === "wand" ? "flex" : "none";
  }
  if (ui.objectsOptionsPanel) {
    ui.objectsOptionsPanel.style.display = mode === "object" ? "flex" : "none";
  }
  if (ui.dimensionOptionsPanel) {
    ui.dimensionOptionsPanel.style.display =
      mode === "dimension" ? "flex" : "none";
  }
  if (ui.toolInstructionTip) {
    ui.toolInstructionTip.textContent = MODE_TIPS[mode] || "";
  }

  ui.canvas.style.cursor = mode === "select" ? "default" : "crosshair";
  repaintScene();
}

function setActiveCategory(cat) {
  state.activeCategory = cat;
  ui.categoryButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-cat") === cat);
  });
}

// Vinculación de barra de herramientas superior
ui.modeButtons.forEach((btn) => {
  btn.addEventListener("click", () =>
    setActiveMode(btn.getAttribute("data-mode")),
  );
});

ui.categoryButtons.forEach((btn) => {
  btn.addEventListener("click", () =>
    setActiveCategory(btn.getAttribute("data-cat")),
  );
});

if (ui.inputWandTol) {
  ui.inputWandTol.addEventListener("input", (e) => {
    state.wandTolerance = parseInt(e.target.value, 10);
    if (ui.wandTolVal) ui.wandTolVal.textContent = state.wandTolerance;
  });
}

if (ui.btnAutoDetectOSM)
  ui.btnAutoDetectOSM.addEventListener("click", autoDetectMapGeometries);
if (ui.btnUndo) ui.btnUndo.addEventListener("click", () => History.undo());
if (ui.btnRedo) ui.btnRedo.addEventListener("click", () => History.redo());

if (ui.btnClearAll) {
  ui.btnClearAll.addEventListener("click", () => {
    if (
      confirm("¿Estás seguro de que deseas eliminar todas las zonas y objetos?")
    ) {
      History.push();
      state.zones = [];
      state.objects = [];
      if (typeof selectZone === "function") selectZone(null);
      if (typeof selectObject === "function") selectObject(null);
      if (typeof updateZonesListUI === "function") updateZonesListUI();
      if (typeof updateObjectsListUI === "function") updateObjectsListUI();
      scheduleSave();
      repaintScene();
      showToast("Lienzo restablecido");
    }
  });
}

if (ui.btnConvert3D) ui.btnConvert3D.addEventListener("click", convertTo3D);

if (ui.btnZoomIn)
  ui.btnZoomIn.addEventListener("click", () => setZoom(state.zoom * 1.25));
if (ui.btnZoomOut)
  ui.btnZoomOut.addEventListener("click", () => setZoom(state.zoom / 1.25));
if (ui.btnZoomReset)
  ui.btnZoomReset.addEventListener("click", () => resetZoom());

// Pestañas de categorías del catálogo
if (ui.objCategoryTabs) {
  ui.objCategoryTabs.forEach((btn) => {
    btn.addEventListener("click", () =>
      setActiveObjCategory(btn.getAttribute("data-objcat")),
    );
  });
}
if (ui.tabListZones)
  ui.tabListZones.addEventListener("click", () => switchListTab("zones"));
if (ui.tabListObjects)
  ui.tabListObjects.addEventListener("click", () => switchListTab("objects"));

// Controles de Simulación
if (ui.btnSimPlay)
  ui.btnSimPlay.addEventListener("click", () => Simulation.togglePlay());
if (ui.btnSimReset)
  ui.btnSimReset.addEventListener("click", () => Simulation.reset());
if (ui.btnSimStepBack)
  ui.btnSimStepBack.addEventListener("click", () =>
    Simulation.stepBackward(0.05),
  );
if (ui.btnSimReverse)
  ui.btnSimReverse.addEventListener("click", () => Simulation.toggleReverse());
if (ui.btnSimStepForward)
  ui.btnSimStepForward.addEventListener("click", () =>
    Simulation.stepForward(0.05),
  );

if (ui.simTimeSlider) {
  ui.simTimeSlider.addEventListener("input", (e) => {
    const frac = parseFloat(e.target.value) / 100;
    Simulation.seek(frac * Simulation.maxTime);
  });
}

if (ui.btnEditSimDuration) {
  ui.btnEditSimDuration.addEventListener("click", () => {
    if (typeof Simulation !== "undefined") Simulation.editDurationPrompt();
  });
}

if (ui.simTotalTime) {
  ui.simTotalTime.addEventListener("click", () => {
    if (typeof Simulation !== "undefined") Simulation.editDurationPrompt();
  });
}

if (ui.simSpeedButtons) {
  ui.simSpeedButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.simSpeedButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      Simulation.speed = parseFloat(btn.getAttribute("data-speed")) || 1.0;
    });
  });
}

if (ui.btnToggleHitboxes) {
  ui.btnToggleHitboxes.addEventListener("click", () => {
    state.showHitboxes = !state.showHitboxes;
    ui.btnToggleHitboxes.classList.toggle("active", state.showHitboxes);
    ui.btnToggleHitboxes.style.background = state.showHitboxes
      ? "rgba(16, 185, 129, 0.3)"
      : "";
    ui.btnToggleHitboxes.style.borderColor = state.showHitboxes
      ? "#10b981"
      : "";
    showToast(
      state.showHitboxes
        ? "📦 Cajas de colisión (Hitboxes) activadas"
        : "Hitboxes desactivadas",
    );
    repaintScene();
  });
}

if (ui.btnEditDimensionValue) {
  ui.btnEditDimensionValue.addEventListener("click", () => {
    if (typeof SceneDimensions !== "undefined") {
      SceneDimensions.editSelectedDimensionValue(state, {
        History,
        scheduleSave,
        repaintScene,
        showToast,
      });
    }
  });
}

if (ui.btnDeleteDimension) {
  ui.btnDeleteDimension.addEventListener("click", () => {
    if (!state.selectedDimensionId) {
      showToast("Selecciona una cota en el lienzo para eliminarla.");
      return;
    }
    const idx = (state.dimensions || []).findIndex(
      (d) => d.id === state.selectedDimensionId,
    );
    if (idx !== -1) {
      History.push();
      state.dimensions.splice(idx, 1);
      state.selectedDimensionId = null;
      repaintScene();
      showToast("Cota eliminada.");
    }
  });
}

if (ui.btnClearDimensions) {
  ui.btnClearDimensions.addEventListener("click", () => {
    if (!state.dimensions || state.dimensions.length === 0) {
      showToast("No hay cotas para borrar.");
      return;
    }
    if (confirm("¿Deseas eliminar todas las cotas métricas del plano?")) {
      History.push();
      state.dimensions = [];
      state.selectedDimensionId = null;
      state.dimensionDraft = null;
      repaintScene();
      showToast("Todas las cotas han sido eliminadas.");
    }
  });
}

window.addEventListener("resize", () => resizeAndRepaint());

// Inicialización de la aplicación
window.addEventListener("DOMContentLoaded", () => {
  try {
    if (typeof initSceneEvents === "function") {
      initSceneEvents(state, ui, {
        getCanvasRelativeCoords,
        setZoom,
        resetZoom,
        repaintScene,
        showToast,
        History,
        ZONE_CONFIG,
        selectZone:
          typeof selectZone !== "undefined" ? selectZone : window.selectZone,
        selectObject:
          typeof selectObject !== "undefined"
            ? selectObject
            : window.selectObject,
        updateZonesListUI:
          typeof updateZonesListUI !== "undefined"
            ? updateZonesListUI
            : window.updateZonesListUI,
        updateObjectsListUI:
          typeof updateObjectsListUI !== "undefined"
            ? updateObjectsListUI
            : window.updateObjectsListUI,
        removeSelectedVertex:
          typeof removeSelectedVertex !== "undefined"
            ? removeSelectedVertex
            : window.removeSelectedVertex,
        removeSelectedObject:
          typeof removeSelectedObject !== "undefined"
            ? removeSelectedObject
            : window.removeSelectedObject,
        findBestZoneAtCoords:
          typeof findBestZoneAtCoords !== "undefined"
            ? findBestZoneAtCoords
            : window.findBestZoneAtCoords,
        getVertexAtCoords:
          typeof getVertexAtCoords !== "undefined"
            ? getVertexAtCoords
            : window.getVertexAtCoords,
        getEdgeAtCoords:
          typeof getEdgeAtCoords !== "undefined"
            ? getEdgeAtCoords
            : window.getEdgeAtCoords,
        getZoneUnderNormCoords:
          typeof getZoneUnderNormCoords !== "undefined"
            ? getZoneUnderNormCoords
            : window.getZoneUnderNormCoords,
        getObjectAtCoords:
          typeof getObjectAtCoords !== "undefined"
            ? getObjectAtCoords
            : window.getObjectAtCoords,
        getObjectRotateHandleAtCoords:
          typeof getObjectRotateHandleAtCoords !== "undefined"
            ? getObjectRotateHandleAtCoords
            : window.getObjectRotateHandleAtCoords,
        getTrajectoryPointAtCoords:
          typeof getTrajectoryPointAtCoords !== "undefined"
            ? getTrajectoryPointAtCoords
            : window.getTrajectoryPointAtCoords,
        getTrajectoryEdgeAtCoords:
          typeof getTrajectoryEdgeAtCoords !== "undefined"
            ? getTrajectoryEdgeAtCoords
            : window.getTrajectoryEdgeAtCoords,
        removeSelectedTrajPoint:
          typeof removeSelectedTrajPoint !== "undefined"
            ? removeSelectedTrajPoint
            : window.removeSelectedTrajPoint,
        runMagicWandAt:
          typeof runMagicWandAt !== "undefined"
            ? runMagicWandAt
            : window.runMagicWandAt,
        finishFreePolygon:
          typeof finishFreePolygon !== "undefined"
            ? finishFreePolygon
            : window.finishFreePolygon,
        addTrajectoryPoint:
          typeof addTrajectoryPoint !== "undefined"
            ? addTrajectoryPoint
            : window.addTrajectoryPoint,
        toggleTraceTrajectory:
          typeof toggleTraceTrajectory !== "undefined"
            ? toggleTraceTrajectory
            : window.toggleTraceTrajectory,
        createObjectAt:
          typeof createObjectAt !== "undefined"
            ? createObjectAt
            : window.createObjectAt,
        scheduleSave:
          typeof scheduleSave !== "undefined"
            ? scheduleSave
            : window.scheduleSave,
        setActiveMode:
          typeof setActiveMode !== "undefined"
            ? setActiveMode
            : window.setActiveMode,
        updateTrajectoryStats:
          typeof updateTrajectoryStats !== "undefined"
            ? updateTrajectoryStats
            : window.updateTrajectoryStats,
      });
    }
  } catch (err) {
    console.error("Error al inicializar eventos de escena:", err);
  }

  if (typeof renderCatalogGrid === "function") renderCatalogGrid("vehiculo");
  if (typeof updateObjectsListUI === "function") updateObjectsListUI();
  if (typeof loadPayloadFromStorage === "function") {
    loadPayloadFromStorage(
      state,
      ui,
      showToast,
      updateMetadataDisplay,
      resizeAndRepaint,
    );
  }
  if (
    typeof Simulation !== "undefined" &&
    typeof Simulation.calculateTotalDuration === "function"
  ) {
    setTimeout(() => Simulation.calculateTotalDuration(), 600);
  }
});

// Soporte para restauración rápida cuando la página sale de Back-Forward Cache (bfcache)
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    if (typeof resizeAndRepaint === "function") resizeAndRepaint();
  }
});
