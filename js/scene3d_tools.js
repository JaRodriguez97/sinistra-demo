/**
 * scene3d_tools.js
 * Herramientas 3D de medición forense, inspectores de datos, controles UI y exportaciones.
 */

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { STOREY_M, TYPE_INFO, mpPerimeter } from "./scene3d_geometry.js";

const $ = (id) => document.getElementById(id);

export const TOOL_HINTS = {
  select: "Haz clic en una zona u objeto para ver su información pericial.",
  distance:
    "Haz clic en dos puntos para medir. Se imantan a los vértices cercanos.",
  height:
    "Haz clic sobre un andén, separador o edificación para medir su altura.",
};

export const VIEW_LABELS = {
  iso: "Vista isométrica",
  top: "Planta ortográfica",
  ped: "Vista de peatón (1.60 m)",
  drv: "Vista de conductor (1.20 m)",
};

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

export function pickAt(
  clientX,
  clientY,
  includeFloor,
  modelRoot,
  activeCam,
  domElement,
) {
  const rect = domElement.getBoundingClientRect();
  ndc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, activeCam);
  const targets = [];
  modelRoot.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.visible) return;
    let p = o.parent,
      vis = true;
    while (p && p !== modelRoot) {
      if (!p.visible) {
        vis = false;
        break;
      }
      p = p.parent;
    }
    if (!vis) return;
    if (o.userData.isFloor && !includeFloor) return;
    targets.push(o);
  });
  const hits = raycaster.intersectObjects(targets, false);
  return hits.length ? hits[0] : null;
}

export function snapPoint(
  point,
  clientX,
  clientY,
  zoneObjs,
  useCorrected,
  activeCam,
  domElement,
) {
  const rect = domElement.getBoundingClientRect();
  let best = null,
    bd = 14;
  const v = new THREE.Vector3();
  for (const id in zoneObjs) {
    const o = zoneObjs[id];
    if (!o.group.parent || !o.group.parent.visible) continue;
    const mp = useCorrected ? o.item.final : o.item.orig;
    for (const poly of mp)
      for (const ring of poly)
        for (let i = 0; i < ring.length - 1; i++) {
          for (const y of o.elev > 0.005 ? [0, o.elev] : [0]) {
            v.set(ring[i][0], y, ring[i][1]).project(activeCam);
            if (v.z > 1) continue;
            const sx = ((v.x + 1) / 2) * rect.width + rect.left;
            const sy = ((1 - v.y) / 2) * rect.height + rect.top;
            const d = Math.hypot(sx - clientX, sy - clientY);
            if (d < bd) {
              bd = d;
              best = new THREE.Vector3(ring[i][0], y, ring[i][1]);
            }
          }
        }
  }
  return best || point.clone();
}

export function marker(pos, color = 0xfacc15) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 12, 12),
    new THREE.MeshBasicMaterial({ color, depthTest: false }),
  );
  m.position.copy(pos);
  m.renderOrder = 999;
  return m;
}

export function addLabel(pos, html) {
  const d = document.createElement("div");
  d.className = "measure-label";
  d.innerHTML = html;
  const l = new CSS2DObject(d);
  l.position.copy(pos);
  return l;
}

export function addMeasurement(A, B, measureGroup, measures) {
  const g = new THREE.Group();
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([A, B]),
    new THREE.LineBasicMaterial({ color: 0xfacc15, depthTest: false }),
  );
  line.renderOrder = 998;
  g.add(line, marker(A), marker(B));
  const d3 = A.distanceTo(B);
  const dh = Math.hypot(B.x - A.x, B.z - A.z);
  const dy = Math.abs(B.y - A.y);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  g.add(
    addLabel(
      mid,
      `${d3.toFixed(2)} m<small>Horizontal ${dh.toFixed(2)} m · Δ altura ${dy.toFixed(2)} m</small>`,
    ),
  );
  measureGroup.add(g);
  measures.push({
    type: "distance",
    a: A.toArray(),
    b: B.toArray(),
    distance3D: d3,
    horizontal: dh,
    deltaHeight: dy,
  });
}

export function clearMeasures(measureGroup, measures) {
  while (measureGroup.children.length) {
    const c = measureGroup.children[0];
    measureGroup.remove(c);
    c.traverse((o) => {
      if (o.isCSS2DObject && o.element && o.element.parentNode)
        o.element.parentNode.removeChild(o.element);
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
  measures.length = 0;
}

export function renderInspector(
  item,
  useCorrected,
  effElevFn,
  selectedObjectId,
) {
  if (!item) {
    if (!selectedObjectId && $("inspEmpty"))
      $("inspEmpty").style.display = "block";
    if ($("inspBody")) $("inspBody").style.display = "none";
    return;
  }
  if ($("inspEmpty")) $("inspEmpty").style.display = "none";
  if ($("inspObjBody")) $("inspObjBody").style.display = "none";
  if ($("inspBody")) $("inspBody").style.display = "flex";

  const z = item.zone;
  const st = item.stats;
  if ($("iName")) $("iName").textContent = z.name;
  if ($("iType"))
    $("iType").textContent = TYPE_INFO[z.type]
      ? TYPE_INFO[z.type].label
      : z.type;
  if ($("iOrigin")) {
    $("iOrigin").textContent =
      {
        wand: "Varita mágica",
        polygon: "Polígono libre",
        osm: "OpenStreetMap",
      }[z.origin] || z.origin;
  }
  if ($("iElev")) $("iElev").value = effElevFn(item);
  const mp = useCorrected ? item.final : item.orig;
  if ($("iPerim")) $("iPerim").textContent = `${mpPerimeter(mp).toFixed(2)} m`;
  if ($("iAreaC")) $("iAreaC").textContent = `${item.corrArea.toFixed(2)} m²`;
  if ($("iAreaO")) $("iAreaO").textContent = `${item.origArea.toFixed(2)} m²`;
  const parts = [];
  if (st.compensated) parts.push("contorno de varita compensado");
  if (st.snapped)
    parts.push(
      `${st.snapped} vértices imantados (máx. ${(st.maxShift * 100).toFixed(0)} cm)`,
    );
  if (st.sliverArea > 0.001)
    parts.push(`+${st.sliverArea.toFixed(2)} m² de grietas cerradas`);
  if (st.overlapRemoved > 0.001)
    parts.push(`−${st.overlapRemoved.toFixed(2)} m² por solape`);
  if ($("iCorr"))
    $("iCorr").textContent = parts.length
      ? parts.join(" · ")
      : "Sin correcciones.";
  if ($("iNotes")) $("iNotes").textContent = z.notes || "Sin notas.";
}

export function renderObjectInspector(
  obj,
  selectedId,
  onDevAngleChange,
  onSpeedChange,
) {
  if (!obj) {
    if ($("inspObjBody")) $("inspObjBody").style.display = "none";
    if (!selectedId && $("inspEmpty")) $("inspEmpty").style.display = "block";
    return;
  }
  if ($("inspEmpty")) $("inspEmpty").style.display = "none";
  if ($("inspBody")) $("inspBody").style.display = "none";
  if ($("inspObjBody")) $("inspObjBody").style.display = "flex";

  if ($("iObjName")) $("iObjName").textContent = obj.name;
  if ($("iObjCat")) {
    const catMap = {
      vehiculo: "🚗 Vehículo",
      persona: "🚶 Peatón",
      mobiliario: "🌳 Mobiliario",
      senal: "🛑 Señal",
      evidencia: "〰️ Evidencia",
    };
    $("iObjCat").textContent = catMap[obj.category] || obj.category;
  }
  if ($("iObjRole")) {
    const roleMap = {
      impactante: "Impactante Principal 💥",
      impactado: "Impactado 🛡️",
      peaton_atropellado: "Peatón Atropellado ⚠️",
      inerte: "Inerte / Entorno",
    };
    $("iObjRole").textContent = obj.isAccidentInvolved
      ? roleMap[obj.role] || obj.role
      : "Inerte (No involucrado)";
  }
  if ($("iObjElev"))
    $("iObjElev").textContent =
      `+${(obj.baseElevationMeters || 0).toFixed(2)} m`;
  if ($("iObjRot"))
    $("iObjRot").textContent = `${Math.round(obj.rotationDeg || 0)}°`;

  // Velocidad editable en 3D
  const inputSpeed = $("iObjSpeed");
  if (inputSpeed) {
    if (obj.category === "vehiculo") {
      inputSpeed.disabled = false;
      const currentSp =
        obj.kinematics && obj.kinematics.speedKmh !== undefined
          ? obj.kinematics.speedKmh
          : obj.initialSpeedKmh !== undefined
            ? obj.initialSpeedKmh
            : 0;
      inputSpeed.value = Math.round(currentSp);
      inputSpeed.oninput = (e) => {
        const newSpeed = Math.max(0, parseFloat(e.target.value) || 0);
        if (!obj.kinematics) {
          obj.kinematics = { speedKmh: newSpeed, trajectoryPoints: [] };
        } else {
          const oldSpeed = Number(obj.kinematics.speedKmh) || 50;
          const ratio = oldSpeed > 0 ? newSpeed / oldSpeed : 1;
          obj.kinematics.speedKmh = newSpeed;
          if (
            Array.isArray(obj.kinematics.trajectoryPoints) &&
            obj.kinematics.trajectoryPoints.length > 0
          ) {
            obj.kinematics.trajectoryPoints.forEach((p) => {
              if (newSpeed === 0) {
                p.speedKmh = 0;
              } else if (p.speedKmh !== undefined && oldSpeed > 0) {
                p.speedKmh = Math.round(p.speedKmh * ratio);
              } else {
                p.speedKmh = newSpeed;
              }
            });
          }
        }
        obj.initialSpeedKmh = newSpeed;
        const cb = onSpeedChange || onDevAngleChange;
        if (typeof cb === "function") cb(obj);
      };
    } else {
      inputSpeed.value = "";
      inputSpeed.placeholder = "—";
      inputSpeed.disabled = true;
      inputSpeed.oninput = null;
    }
  }

  // Desvío post-impacto editable por el perito
  const rowDev = $("rowObjDeviationAngle");
  const inputDev = $("iObjDeviationAngle");
  if (rowDev && inputDev) {
    if (obj.category === "vehiculo" && obj.isAccidentInvolved) {
      rowDev.style.display = "flex";
      inputDev.value =
        obj.deviationAngleDeg !== undefined ? obj.deviationAngleDeg : 0;
      inputDev.oninput = (e) => {
        obj.deviationAngleDeg = parseFloat(e.target.value) || 0;
        if (typeof onDevAngleChange === "function") onDevAngleChange(obj);
      };
    } else {
      rowDev.style.display = "none";
    }
  }

  // Distancia de Reposo de la Moto / Vehículo tras impacto
  const rowVehDist = $("rowObjVehicleRestDist");
  const inVehDist = $("iObjVehicleRestDist");
  if (rowVehDist && inVehDist) {
    if (obj.category === "vehiculo" && obj.isAccidentInvolved) {
      rowVehDist.style.display = "flex";
      const curVD =
        obj.finalRestDistanceM !== undefined
          ? obj.finalRestDistanceM
          : (obj.finalRest?.distanceM || 5.0);
      inVehDist.value = Number(curVD).toFixed(1);
      inVehDist.oninput = (e) => {
        const val = Math.max(0.5, Math.min(60, parseFloat(e.target.value) || 5.0));
        obj.finalRestDistanceM = val;
        if (!obj.finalRest) obj.finalRest = {};
        obj.finalRest.distanceM = val;
        if (typeof onDevAngleChange === "function") onDevAngleChange(obj);
      };
    } else {
      rowVehDist.style.display = "none";
    }
  }

  // Ángulo de proyección y Distancia de Reposo del Conductor de Moto
  const rowRider = $("rowObjRiderConfig");
  const inAng = $("iObjRiderAngle");
  const rowRiderDist = $("rowObjRiderDist");
  const inDist = $("iObjRiderDist");
  if (rowRider && inAng) {
    if (obj.catalogId === "moto" || obj.type === "moto") {
      rowRider.style.display = "flex";
      if (rowRiderDist) rowRiderDist.style.display = "flex";
      if (!obj.rider) {
        obj.rider = {
          enabled: true,
          massKg: 75,
          frictionGround: 0.66,
          launchAngleDeg: 15,
          finalRestDistanceM: 6.0,
          restitution: 0.1,
        };
      }
      inAng.value =
        obj.rider.launchAngleDeg !== undefined
          ? obj.rider.launchAngleDeg
          : 15;
      inAng.oninput = (e) => {
        obj.rider.launchAngleDeg = Math.max(
          0,
          Math.min(60, parseFloat(e.target.value) || 15),
        );
        if (typeof onDevAngleChange === "function") onDevAngleChange(obj);
      };

      if (inDist) {
        const curDist =
          obj.rider.finalRestDistanceM !== undefined
            ? obj.rider.finalRestDistanceM
            : (obj.rider.finalRest && obj.rider.finalRest.distanceM !== undefined
                ? obj.rider.finalRest.distanceM
                : 6.0);
        inDist.value = Number(curDist).toFixed(1);
        inDist.oninput = (e) => {
          const val = Math.max(0.5, Math.min(60, parseFloat(e.target.value) || 6.0));
          obj.rider.finalRestDistanceM = val;
          if (!obj.rider.finalRest) obj.rider.finalRest = {};
          obj.rider.finalRest.distanceM = val;
          if (typeof onDevAngleChange === "function") onDevAngleChange(obj);
        };
      }
    } else {
      rowRider.style.display = "none";
      if (rowRiderDist) rowRiderDist.style.display = "none";
    }
  }

  if ($("iObjKinematics")) {
    if (
      obj.kinematics &&
      Array.isArray(obj.kinematics.trajectoryPoints) &&
      obj.kinematics.trajectoryPoints.length >= 2
    ) {
      const pts = obj.kinematics.trajectoryPoints;
      let dist = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        dist += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
      }
      const sp = (obj.kinematics.speedKmh || 50) / 3.6;
      const t = sp > 0 ? (dist / sp).toFixed(2) : "0.00";
      $("iObjKinematics").textContent = `${dist.toFixed(1)} m en ${t} s`;
    } else {
      $("iObjKinematics").textContent =
        "Sin trayectoria (Estático en punto de reposo)";
    }
  }

  if ($("iObjNotes")) {
    let noteTxt = obj.notes || "Sin observaciones periciales registradas.";
    if (obj.catalogId === "huella_frenado" || obj.category === "evidencia") {
      noteTxt = `Huella: ${obj.skidLengthM || 10} m · Trocha: ${obj.skidTrackWidthM || 1.5} m.\n${noteTxt}`;
    }
    $("iObjNotes").textContent = noteTxt;
  }
}

export function renderReport(geo, applySelectionFn) {
  const sum = $("reportSummary");
  const list = $("reportList");
  if (!sum || !list) return;
  sum.innerHTML = "";
  list.innerHTML = "";
  const totalOrig = geo.items.reduce((a, b) => a + b.origArea, 0);
  const totalCorr = geo.items.reduce((a, b) => a + b.corrArea, 0);
  const totalSnap = geo.items.reduce((a, b) => a + b.stats.snapped, 0);
  const totalSliv = geo.items.reduce((a, b) => a + b.stats.sliverArea, 0);
  const totalOver = geo.items.reduce((a, b) => a + b.stats.overlapRemoved, 0);
  sum.innerHTML = `
    <strong>${geo.items.length} zonas procesadas.</strong>
    Superficie original: ${totalOrig.toFixed(1)} m² · Corregida: ${totalCorr.toFixed(1)} m².<br/>
    Vértices imantados: ${totalSnap} · Grietas cerradas: +${totalSliv.toFixed(1)} m² · Solapes resueltos: −${totalOver.toFixed(1)} m².
  `;

  geo.items.forEach((it) => {
    const row = document.createElement("div");
    row.className = "report-row" + (it.flagged ? " flagged" : "");
    const n = document.createElement("span");
    n.className = "name";
    n.textContent = it.zone.name;
    const a = document.createElement("span");
    a.textContent = `${it.origArea.toFixed(1)} → ${it.corrArea.toFixed(1)} m²`;
    const d = document.createElement("span");
    d.className = "delta";
    d.textContent = `${it.deltaPct >= 0 ? "+" : ""}${it.deltaPct.toFixed(1)}%`;
    row.append(n, a, d);
    row.addEventListener("click", () => applySelectionFn(it.zone.id));
    list.appendChild(row);
  });
}

export function updateCompass(data, activeCam, compassNeedle) {
  if (!compassNeedle) return;
  const b = ((data && data.metadata.bearingDeg) || 0) * (Math.PI / 180);
  const n = [-Math.sin(b), -Math.cos(b)];
  const f = new THREE.Vector3();
  activeCam.getWorldDirection(f);
  let fx = f.x,
    fz = f.z;
  if (Math.hypot(fx, fz) < 0.25) {
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(activeCam.quaternion);
    fx = u.x;
    fz = u.z;
  }
  const ang = Math.atan2(n[1], n[0]) - Math.atan2(fz, fx);
  compassNeedle.style.transform = `rotate(${ang}rad)`;
}

export function updateScaleBar(
  viewName,
  viewport,
  orthoCam,
  scaleBarLine,
  scaleBarText,
) {
  if (viewName !== "top" || !scaleBarLine || !scaleBarText) return;
  const h = viewport.clientHeight;
  const worldH = (orthoCam.top - orthoCam.bottom) / orthoCam.zoom;
  const pxPerM = h / worldH;
  const nice = [0.5, 1, 2, 5, 10, 20, 50, 100, 200];
  let pick = nice[0];
  for (const n of nice) if (n * pxPerM <= 170) pick = n;
  scaleBarLine.style.width = `${Math.max(20, pick * pxPerM)}px`;
  scaleBarText.textContent = `${pick} m`;
}

export function download(blobOrUrl, name) {
  const a = document.createElement("a");
  a.download = name;
  a.href =
    typeof blobOrUrl === "string" ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof blobOrUrl !== "string")
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function exportScenePNG(
  renderer,
  scene,
  activeCam,
  viewName,
  sizeRenderer,
  toast,
) {
  const prevPR = renderer.getPixelRatio();
  renderer.setPixelRatio(Math.min(3, prevPR * 2));
  sizeRenderer();
  renderer.render(scene, activeCam);
  const url = renderer.domElement.toDataURL("image/png");
  renderer.setPixelRatio(prevPR);
  sizeRenderer();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  download(url, `sinistra3d_vista_${viewName}_${stamp}.png`);
  toast("Imagen PNG exportada.");
}

export function exportSceneGLB(GLTFExporter, modelRoot, applySelection, toast) {
  applySelection(null);
  const exporter = new GLTFExporter();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  exporter.parse(
    modelRoot,
    (result) => {
      download(
        new Blob([result], { type: "model/gltf-binary" }),
        `sinistra3d_escena_${stamp}.glb`,
      );
      toast("Modelo GLB exportado.");
    },
    (err) => toast("Error al exportar GLB: " + err),
    { binary: true },
  );
}

export function exportSceneJSON(data, geo, effElev, toast) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const exportPayload = {
    metadata: data.metadata,
    zones: geo.items.map((it) => ({
      name: it.zone.name,
      type: it.zone.type,
      elevation: effElev(it),
      areaOriginalM2: it.origArea,
      areaCorregidaM2: it.corrArea,
      deltaPct: it.deltaPct,
    })),
    objects: data.objects || [],
  };
  download(
    new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    }),
    `sinistra3d_forense_${stamp}.json`,
  );
  toast("Datos JSON periciales exportados.");
}

export function buildSceneDimensions3D(sceneData, sizeM, measureGroup) {
  if (!measureGroup) return;
  while (measureGroup.children.length > 0) {
    measureGroup.remove(measureGroup.children[0]);
  }
  if (!sceneData || !Array.isArray(sceneData.dimensions)) return;
  const s = sizeM;
  sceneData.dimensions.forEach((d) => {
    if (!d.p1 || !d.p2) return;
    const v1 = new THREE.Vector3(
      (d.p1.normX - 0.5) * s,
      0.2,
      (d.p1.normY - 0.5) * s,
    );
    const v2 = new THREE.Vector3(
      (d.p2.normX - 0.5) * s,
      0.2,
      (d.p2.normY - 0.5) * s,
    );
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([v1, v2]),
      new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 2 }),
    );
    measureGroup.add(line);

    // Tiradores esféricos en los extremos A y B
    const sphereGeo = new THREE.SphereGeometry(0.18, 12, 12);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const p1Mesh = new THREE.Mesh(sphereGeo, sphereMat);
    p1Mesh.position.copy(v1);
    const p2Mesh = new THREE.Mesh(sphereGeo, sphereMat);
    p2Mesh.position.copy(v2);
    measureGroup.add(p1Mesh);
    measureGroup.add(p2Mesh);

    // Calcular la distancia métrica real asignada
    const dist3D = v1.distanceTo(new THREE.Vector3(v2.x, v1.y, v2.z));
    const distVal =
      d.valueMeters !== undefined && d.valueMeters !== null && !isNaN(d.valueMeters)
        ? Number(d.valueMeters)
        : d.distanceMeters !== undefined && d.distanceMeters !== null && !isNaN(d.distanceMeters)
          ? Number(d.distanceMeters)
          : dist3D;
    const distStr = `${distVal.toFixed(2)} m`;

    const mid = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
    mid.y += 0.45;
    const div = document.createElement("div");
    div.style.cssText =
      "background:rgba(15,23,42,0.92);color:#00f0ff;border:1px solid #00f0ff;padding:3px 7px;border-radius:4px;font-size:11px;font-weight:600;font-family:'JetBrains Mono',monospace;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.6);white-space:nowrap;";
    
    // Si el usuario especificó una etiqueta personalizada distinta de "Distancia", mostrarla junto al valor métrico
    div.textContent =
      d.label && d.label !== "Distancia"
        ? `${d.label}: ${distStr}`
        : distStr;

    const lab = new CSS2DObject(div);
    lab.position.copy(mid);
    measureGroup.add(lab);
  });
}

/**
 * Entorno atmosférico 3D hiperrealista:
 * - Cúpula celestial diurna con gradiente atmosférico
 * - Silueta panorámica 360° de ciudad lejana difuminada en el horizonte
 * - Niebla atmosférica diurna (sin vacíos negros)
 * - Suelo perimetral extendido
 */
export function setupSceneEnvironment(scene, sizeM = 100) {
  // Limpiar elementos de entorno previos si existiesen
  const prevSky = scene.getObjectByName("skyDome");
  if (prevSky) scene.remove(prevSky);
  const prevGround = scene.getObjectByName("extendedGround");
  if (prevGround) scene.remove(prevGround);

  // 1. Tonalidad de horizonte y niebla atmosférica diurna
  const horizonColor = 0xcadbeb; // Tono plateado-celeste atmosférico
  scene.background = new THREE.Color(horizonColor);
  scene.fog = new THREE.Fog(horizonColor, Math.max(160, sizeM * 1.5), 1150);

  // 2. Generación procedural del panorama 360° (Cielo + Ciudad Lejana)
  const skyCanvas = document.createElement("canvas");
  skyCanvas.width = 1024;
  skyCanvas.height = 512;
  const ctx = skyCanvas.getContext("2d");

  // 2a. Gradiente celestial diurno (Cénit azul -> Horizonte luminoso -> Suelo lejano)
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 512);
  skyGrad.addColorStop(0.0, "#1d4ed8"); // Cénit azul cielo profundo
  skyGrad.addColorStop(0.25, "#38bdf8"); // Azul cielo diurno despejado
  skyGrad.addColorStop(0.42, "#93c5fd"); // Luz ambiental de media tarde
  skyGrad.addColorStop(0.50, "#e2e8f0"); // Resplandor atmosférico en horizonte
  skyGrad.addColorStop(0.55, "#cbd5e1"); // Transición a cota de suelo
  skyGrad.addColorStop(0.72, "#475569"); // Suelo urbano lejano
  skyGrad.addColorStop(1.0, "#1e293b"); // Base de terreno / asfalto
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, 1024, 512);

  // 2b. Nubes suaves en el firmamento
  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  for (let c = 0; c < 16; c++) {
    const cx = (c * 73 + 30) % 1024;
    const cy = 70 + (c % 4) * 36;
    const cw = 85 + (c % 3) * 55;
    const ch = 12 + (c % 2) * 8;
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2c. Silueta urbana lejana (Skyline de ciudad difusa en el horizonte)
  let seed = 77;
  function prng() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  // Capa 1: Torres y rascacielos lejanos (más altos, envueltos en bruma)
  ctx.fillStyle = "rgba(148, 163, 184, 0.42)";
  let x = 0;
  while (x < 1024) {
    const bW = 16 + Math.floor(prng() * 26);
    const bH = 26 + Math.floor(prng() * 58);
    ctx.fillRect(x, 256 - bH, bW, bH);
    if (bH > 58) {
      // Aguja / Antena en cumbre
      ctx.fillRect(x + Math.floor(bW / 2) - 1, 256 - bH - 14, 2, 14);
    }
    x += bW + 3 + Math.floor(prng() * 8);
  }

  // Capa 2: Edificios y estructuras medias más nítidas
  ctx.fillStyle = "rgba(100, 116, 139, 0.55)";
  x = 10;
  while (x < 1024) {
    const bW = 14 + Math.floor(prng() * 22);
    const bH = 12 + Math.floor(prng() * 36);
    ctx.fillRect(x, 256 - bH, bW, bH);
    x += bW + 2 + Math.floor(prng() * 10);
  }

  // 2d. Capa de bruma perimetral difuminada en la base del horizonte
  const haze = ctx.createLinearGradient(0, 235, 0, 265);
  haze.addColorStop(0, "rgba(226, 232, 240, 0)");
  haze.addColorStop(0.5, "rgba(226, 232, 240, 0.75)");
  haze.addColorStop(1, "rgba(203, 213, 225, 0.95)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 235, 1024, 30);

  // 2e. Crear textura y malla de cúpula celestial (Skydome)
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.wrapS = THREE.RepeatWrapping;
  skyTex.wrapT = THREE.ClampToEdgeWrapping;
  skyTex.colorSpace = THREE.SRGBColorSpace;

  const skyGeo = new THREE.SphereGeometry(1400, 32, 16);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.name = "skyDome";
  skyDome.renderOrder = -100;
  scene.add(skyDome);

  // 3. Terreno perimetral infinito (suelo extendido que evita el abismo negro)
  const groundGeo = new THREE.RingGeometry(sizeM * 0.48, 1200, 48);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.95,
    metalness: 0.05,
  });
  const groundRing = new THREE.Mesh(groundGeo, groundMat);
  groundRing.rotation.x = -Math.PI / 2;
  groundRing.position.y = -0.04;
  groundRing.name = "extendedGround";
  groundRing.receiveShadow = false;
  scene.add(groundRing);
}

