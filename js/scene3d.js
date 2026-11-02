/**
 * Sinistra 3D - Reconstrucción 3D Forense (Etapa 3 & 4)
 * Orquestador principal de escena Three.js, visualización, hitboxes y física de impacto.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/addons/renderers/CSS2DRenderer.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import {
  createVehicle3D,
  createPedestrian3D,
  createGreenZone3D,
  createJerseyBarrier3D,
  createTree3D,
  createBush3D,
  createStreetLight3D,
  createTrafficLight3D,
  createCamera3D,
  createTrafficSign3D,
  createSkidMarks3D,
  createGenericObject3D,
  createHitbox3D,
  buildTrajectory3D,
} from "./scene3d_builders.js";
import {
  TYPE_INFO,
  buildGeometry,
  makeShape,
  makeProjTexture,
  disposeObject,
  collectFacade,
  buildInstanced,
  labelCenter,
} from "./scene3d_geometry.js";
import {
  TOOL_HINTS,
  VIEW_LABELS,
  pickAt,
  snapPoint,
  marker,
  addLabel,
  addMeasurement,
  clearMeasures,
  renderInspector,
  renderObjectInspector,
  renderReport,
  updateCompass,
  updateScaleBar,
  download,
  exportScenePNG,
  exportSceneGLB,
  exportSceneJSON,
  buildSceneDimensions3D,
  setupSceneEnvironment,
} from "./scene3d_tools.js";
import { loadExport, makeDemoExport } from "./scene3d_loader.js";
import { createSim3D, bindSimControls } from "./scene3d_simulation.js";
import { initPhysics } from "./scene3d_physics.js";

const $ = (id) => document.getElementById(id);
const PC = window.polygonClipping;

let toastTimer = null;
function toast(msg, ms = 2600) {
  clearTimeout(toastTimer);
  $("toastMsg").textContent = msg;
  $("toast").classList.add("show");
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), ms);
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function step(msg) {
  $("loadingStep").textContent = msg;
  await tick();
}

const viewport = $("viewport");
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = false;
viewport.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer({ element: $("labelLayer") });

let sizeM = 100;
let data = null;
let geo = null;
let useCorrected = true;
const elevOverride = {};
const layerVisible = {
  calzada: true,
  anden: true,
  separador: true,
  edificio: true,
};

const scene = new THREE.Scene();
setupSceneEnvironment(scene, sizeM);

const hemi = new THREE.HemisphereLight(0xdbeafe, 0x475569, 1.45);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfffbeb, 1.85);
sun.position.set(70, 110, 45);
scene.add(sun);
const ambient = new THREE.AmbientLight(0x94a3b8, 0.35);
scene.add(ambient);

const modelRoot = new THREE.Group();
scene.add(modelRoot);
const labelGroup = new THREE.Group();
scene.add(labelGroup);
const measureGroup = new THREE.Group();
scene.add(measureGroup);
const overlayGroup = new THREE.Group();
scene.add(overlayGroup);

const perspCam = new THREE.PerspectiveCamera(45, 1, 0.3, 3000);
const orthoCam = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 3000);
let activeCam = perspCam;
let controls = null;
let viewName = "iso";
let eyeHeight = 0;
let floorTex = null;
let floorMesh = null;
let gridGroup = null;
let wireframe = false;
const zoneObjs = {};
const sceneObjects3D = {};
const sceneHitboxes3D = {};
const objectsGroup = new THREE.Group();
const trajectoriesGroup = new THREE.Group();
const hitboxesGroup = new THREE.Group();
hitboxesGroup.visible = false;
let windowMeshes = [];
let selectedId = null;
let selectedObjectId = null;
let outlineObj = null;

let tool = "select";
let pendingPoint = null;
let pickEye = false;
const measures = [];
const compassNeedle = $("compassNeedle");

function sizeRenderer() {
  const w = viewport.clientWidth,
    h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
  const asp = w / Math.max(1, h);
  perspCam.aspect = asp;
  perspCam.updateProjectionMatrix();
  const fh = sizeM * 1.15;
  orthoCam.left = (-fh * asp) / 2;
  orthoCam.right = (fh * asp) / 2;
  orthoCam.top = fh / 2;
  orthoCam.bottom = -fh / 2;
  orthoCam.updateProjectionMatrix();
}

function makeControls(cam) {
  if (controls) controls.dispose();
  controls = new OrbitControls(cam, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.screenSpacePanning = true;
  controls.maxDistance = sizeM * 4;
  controls.minDistance = 2;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  return controls;
}

function setViewBadge() {
  $("viewBadge").textContent = VIEW_LABELS[viewName] || "";
  document.querySelectorAll("[data-view]").forEach((b) => {
    const v = b.getAttribute("data-view");
    b.classList.toggle("active", v === viewName);
  });
  $("scaleBar").style.display = viewName === "top" ? "flex" : "none";
}

function setView(name) {
  const s = sizeM;
  if (name === "reset") name = "iso";
  viewName = name;
  eyeHeight = name === "ped" ? 1.6 : name === "drv" ? 1.2 : 0;

  if (name === "top") {
    activeCam = orthoCam;
    orthoCam.up.set(0, 0, -1);
    orthoCam.position.set(0, s * 2, 0);
    orthoCam.zoom = 1;
    orthoCam.updateProjectionMatrix();
    makeControls(orthoCam);
    controls.target.set(0, 0, 0);
    controls.enableRotate = false;
    controls.minDistance = 0;
    controls.maxDistance = Infinity;
    controls.maxPolarAngle = Math.PI;
    orthoCam.lookAt(0, 0, 0);
    controls.update();
  } else if (name === "iso") {
    activeCam = perspCam;
    perspCam.up.set(0, 1, 0);
    perspCam.position.set(s * 0.6, s * 0.62, s * 0.85);
    makeControls(perspCam);
    controls.target.set(0, 0, 0);
    controls.update();
  } else {
    activeCam = perspCam;
    perspCam.up.set(0, 1, 0);
    placeEye(0, s * 0.42, 0, -1);
  }
  setViewBadge();
}

function placeEye(x, z, dirX, dirZ) {
  const h = eyeHeight || 1.6;
  const len = Math.hypot(dirX, dirZ) || 1;
  const dx = dirX / len,
    dz = dirZ / len;
  perspCam.position.set(x, h, z);
  makeControls(perspCam);
  controls.target.set(x + dx * 0.1, h, z + dz * 0.1);
  controls.minDistance = 0.05;
  controls.maxDistance = 60;
  controls.maxPolarAngle = Math.PI - 0.05;
  controls.update();
}

function effElev(item) {
  const id = item.zone.id;
  return id in elevOverride ? elevOverride[id] : item.zone.elevationMeters || 0;
}

function buildGrid() {
  if (gridGroup) {
    scene.remove(gridGroup);
    disposeObject(gridGroup, floorTex);
  }
  gridGroup = new THREE.Group();
  const g1 = new THREE.GridHelper(sizeM, Math.round(sizeM), 0x64748b, 0x64748b);
  g1.material.transparent = true;
  g1.material.opacity = 0.18;
  g1.position.y = 0.01;
  const g10 = new THREE.GridHelper(
    sizeM,
    Math.max(1, Math.round(sizeM / 10)),
    0xfacc15,
    0xfacc15,
  );
  g10.material.transparent = true;
  g10.material.opacity = 0.5;
  g10.position.y = 0.012;
  gridGroup.add(g1, g10);
  gridGroup.visible = $("lGrid").checked;
  scene.add(gridGroup);
}

function clearModel() {
  [
    modelRoot,
    labelGroup,
    objectsGroup,
    trajectoriesGroup,
    hitboxesGroup,
  ].forEach((g) => {
    while (g.children.length) {
      const ch = g.children[0];
      g.remove(ch);
      disposeObject(ch, floorTex);
    }
  });
  for (const k in zoneObjs) delete zoneObjs[k];
  for (const k in sceneObjects3D) delete sceneObjects3D[k];
  for (const k in sceneHitboxes3D) delete sceneHitboxes3D[k];
  document.querySelectorAll(".poi-impact-label").forEach((el) => el.remove());
  windowMeshes = [];
  floorMesh = null;
}

function buildZone(item, projTex, layerGroups) {
  const z = item.zone;
  const mp = useCorrected ? item.final : item.orig;
  if (!mp.length) return null;
  const elev = effElev(item);
  const group = new THREE.Group();
  group.userData.zoneId = z.id;
  const mats = [];
  let topMat = null;

  for (const poly of mp) {
    const shape = makeShape(poly);
    let geom;
    let materials;
    const flat = z.type === "calzada" || elev < 0.005;

    if (flat) {
      geom = new THREE.ShapeGeometry(shape);
      geom.rotateX(-Math.PI / 2);
      geom.translate(0, z.type === "calzada" ? 0.003 : 0.004, 0);
      if (z.type === "calzada") {
        topMat = new THREE.MeshBasicMaterial({
          color: 0x1e293b,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
          wireframe,
        });
      } else {
        topMat = new THREE.MeshLambertMaterial({ map: projTex, wireframe });
      }
      materials = topMat;
    } else {
      geom = new THREE.ExtrudeGeometry(shape, {
        depth: elev,
        bevelEnabled: false,
        steps: 1,
      });
      geom.rotateX(-Math.PI / 2);
      let side;
      if (z.type === "edificio") {
        topMat = new THREE.MeshLambertMaterial({ color: 0xa8a29e, wireframe });
        side = new THREE.MeshLambertMaterial({ color: 0xd9d6d1, wireframe });
      } else if (z.type === "separador") {
        topMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f, wireframe });
        side = new THREE.MeshLambertMaterial({ color: 0x9ca3af, wireframe });
      } else {
        topMat = new THREE.MeshLambertMaterial({ map: projTex, wireframe });
        side = new THREE.MeshLambertMaterial({ color: 0x9ca3af, wireframe });
      }
      materials = [topMat, side];
      mats.push(side);
    }

    const mesh = new THREE.Mesh(geom, materials);
    mesh.userData.zoneId = z.id;
    if (z.type === "calzada") mesh.renderOrder = 1;
    group.add(mesh);

    if (z.type === "edificio" && !flat) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom, 25),
        new THREE.LineBasicMaterial({ color: 0xa855f7 }),
      );
      edges.raycast = () => {};
      group.add(edges);
    }
  }
  mats.push(topMat);
  const obj = { group, mats, item, top: topMat, elev };
  zoneObjs[z.id] = obj;
  layerGroups[z.type].add(group);
  return obj;
}

function rebuildModel() {
  clearModel();
  const proj = makeProjTexture(floorTex, sizeM, renderer);

  const floorGeom = new THREE.PlaneGeometry(sizeM, sizeM);
  floorGeom.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshBasicMaterial({ map: floorTex, wireframe });
  floorMesh = new THREE.Mesh(floorGeom, floorMat);
  floorMesh.userData.isFloor = true;
  floorMesh.visible = $("lFloor").checked;
  modelRoot.add(floorMesh);

  const layerGroups = {};
  for (const t of Object.keys(TYPE_INFO)) {
    layerGroups[t] = new THREE.Group();
    layerGroups[t].visible = layerVisible[t];
    layerGroups[t].userData.layer = t;
    modelRoot.add(layerGroups[t]);
  }

  const buildings = geo.items.filter((it) => it.zone.type === "edificio");
  const facade = { windows: [], doors: [] };
  for (const item of geo.items) {
    const obj = buildZone(item, proj, layerGroups);
    if (!obj) continue;

    if (item.zone.type === "edificio") {
      collectFacade(item, obj.elev, buildings, useCorrected, facade);
    }

    const c = labelCenter(item, useCorrected);
    const div = document.createElement("div");
    div.className = "zone-label";
    const nm =
      item.zone.name.length > 26
        ? item.zone.name.slice(0, 25) + "…"
        : item.zone.name;
    div.innerHTML = "";
    const span = document.createElement("span");
    span.textContent = nm;
    const sm = document.createElement("small");
    sm.textContent = `+${obj.elev.toFixed(2)} m`;
    div.appendChild(span);
    div.appendChild(sm);
    const lab = new CSS2DObject(div);
    lab.position.set(c[0], obj.elev + 0.4, c[1]);
    lab.userData.zoneType = item.zone.type;
    labelGroup.add(lab);
  }

  const decor = [
    buildInstanced(facade.windows, 1.4, 1.3, 0xf1f5f9, { offset: -1 }),
    buildInstanced(facade.windows, 1.2, 1.1, 0x1e3a5f, {
      offset: -2,
      emissive: 0x0a1626,
    }),
    buildInstanced(facade.doors, 1.16, 2.2, 0xf1f5f9, { offset: -1 }),
    buildInstanced(facade.doors, 1.0, 2.1, 0x7c4a21, { offset: -2 }),
  ].filter(Boolean);
  decor.forEach((d) => {
    layerGroups.edificio.add(d);
    windowMeshes.push(d);
  });

  objectsGroup.visible = $("lObjects") ? $("lObjects").checked : true;
  trajectoriesGroup.visible = $("lTrajectories")
    ? $("lTrajectories").checked
    : true;
  hitboxesGroup.visible = $("lHitboxes") ? $("lHitboxes").checked : false;
  modelRoot.add(objectsGroup);
  modelRoot.add(trajectoriesGroup);
  modelRoot.add(hitboxesGroup);
  if (data && Array.isArray(data.objects)) {
    buildObjectsAndTrajectories3D(data);
  }
  if (data) {
    buildSceneDimensions3D(data, sizeM, measureGroup);
  }

  refreshLabels();
  applySelection(
    selectedObjectId && sceneObjects3D[selectedObjectId]
      ? selectedObjectId
      : selectedId && zoneObjs[selectedId]
        ? selectedId
        : null,
  );
}

function buildObjectsAndTrajectories3D(sceneData) {
  if (!sceneData || !Array.isArray(sceneData.objects)) return;

  sceneData.objects.forEach((obj) => {
    let built = null;
    const cat = obj.category || "vehiculo";
    const catId = obj.catalogId || "sedan";

    if (
      catId === "huella_frenado" ||
      catId === "huella_derrape" ||
      catId === "escombros" ||
      catId === "mancha_aceite" ||
      cat === "evidencia"
    ) {
      built = createSkidMarks3D(obj);
    } else if (cat === "vehiculo") {
      built = createVehicle3D(obj);
    } else if (cat === "persona") {
      built = createPedestrian3D(obj);
    } else if (catId === "zona_verde") {
      built = createGreenZone3D(obj);
    } else if (catId === "barrera_new_jersey") {
      built = createJerseyBarrier3D(obj);
    } else if (catId === "arbol") {
      built = createTree3D(obj);
    } else if (catId === "arbusto") {
      built = createBush3D(obj);
    } else if (catId === "poste_luz") {
      built = createStreetLight3D(obj);
    } else if (catId === "semaforo") {
      built = createTrafficLight3D(obj);
    } else if (catId === "camara_fotomulta") {
      built = createCamera3D(obj);
    } else if (cat === "senal" || catId.startsWith("senal_")) {
      built = createTrafficSign3D(obj);
    } else {
      built = createGenericObject3D(obj);
    }

    if (!built || !built.group) return;

    const g = built.group;
    const baseElev = obj.baseElevationMeters || 0;
    const px = obj.positionMeters ? obj.positionMeters.x : 0;
    const pz = obj.positionMeters ? obj.positionMeters.z : 0;
    g.position.set(px, baseElev, pz);
    g.rotation.y = -THREE.MathUtils.degToRad(obj.rotationDeg || 0);

    g.traverse((child) => {
      if (child.isMesh) {
        child.userData.objectId = obj.id;
        child.userData.isSceneObject = true;
      }
    });

    objectsGroup.add(g);
    sceneObjects3D[obj.id] = {
      group: g, data: obj, mats: built.mats || [],
      motoBody: built.motoBody || null,
      wheelFront: built.wheelFront || null,
      wheelRear: built.wheelRear || null,
      riderGroup: built.riderGroup || null,
      rider: built.rider || null,
    };
    if (built.riderGroup) {
      const initYaw = -THREE.MathUtils.degToRad(obj.rotationDeg || 0);
      const saddleLocal = new THREE.Vector3(-0.12, 0.82, 0).applyEuler(
        new THREE.Euler(0, initYaw, 0),
      );
      built.riderGroup.position.set(
        px + saddleLocal.x,
        baseElev + saddleLocal.y,
        pz + saddleLocal.z,
      );
      built.riderGroup.rotation.y = initYaw;
      built.riderGroup.traverse((child) => {
        if (child.isMesh) {
          child.userData.objectId = obj.id;
          child.userData.isRider = true;
          child.userData.isSceneObject = true;
        }
      });
      objectsGroup.add(built.riderGroup);
    }

    if (
      catId !== "huella_frenado" &&
      catId !== "huella_derrape" &&
      catId !== "escombros" &&
      catId !== "mancha_aceite" &&
      cat !== "evidencia"
    ) {
      const hb = createHitbox3D(obj);
      if (hb && hb.wireframe) {
        hb.wireframe.position.set(px, baseElev, pz);
        hb.wireframe.rotation.y = -THREE.MathUtils.degToRad(
          obj.rotationDeg || 0,
        );
        hitboxesGroup.add(hb.wireframe);
        sceneHitboxes3D[obj.id] = hb;
      }
    }

    if (
      obj.kinematics &&
      Array.isArray(obj.kinematics.trajectoryPoints) &&
      obj.kinematics.trajectoryPoints.length >= 2
    ) {
      buildTrajectory3D(obj, baseElev, trajectoriesGroup);
    }
  });
}

function updatePoiLabels() {
  const lblOn = !$("lLabels") || $("lLabels").checked;
  const trajOn = !$("lTrajectories") || $("lTrajectories").checked;
  const poiOn = !$("lPoiLabels") || $("lPoiLabels").checked;
  const isVis = lblOn && trajOn && poiOn;
  trajectoriesGroup.traverse((c) => {
    if (c.userData && c.userData.isPoiLabel) {
      c.visible = isVis;
      if (c.element) c.element.style.display = isVis ? "block" : "none";
    }
  });
  document.querySelectorAll(".poi-impact-label").forEach((el) => {
    el.style.display = isVis ? "block" : "none";
  });
}

function refreshLabels() {
  const on = $("lLabels").checked;
  labelGroup.children.forEach((l) => {
    l.visible = on && layerVisible[l.userData.zoneType];
  });
  updatePoiLabels();
}

function applySelection(id) {
  if (selectedId && zoneObjs[selectedId]) {
    zoneObjs[selectedId].mats.forEach((mt) => {
      if (mt.userData.baseEmissive !== undefined) mt.emissive.setHex(mt.userData.baseEmissive);
      if (mt.userData.baseColor !== undefined) {
        mt.color.setHex(mt.userData.baseColor);
        mt.opacity = mt.userData.baseOpacity;
      }
    });
  }
  if (outlineObj) {
    overlayGroup.remove(outlineObj);
    disposeObject(outlineObj, floorTex);
    outlineObj = null;
  }
  if (selectedObjectId && sceneObjects3D[selectedObjectId]) {
    sceneObjects3D[selectedObjectId].mats.forEach((mt) => {
      if (mt.userData.baseEmissive !== undefined) mt.emissive.setHex(mt.userData.baseEmissive);
    });
  }
  selectedId = null;
  selectedObjectId = null;
  if (!id) {
    renderInspector(null, useCorrected, effElev, null);
    renderObjectInspector(null, null, null);
    return;
  }

  if (sceneObjects3D[id]) {
    selectedObjectId = id;
    const objWrap = sceneObjects3D[id];
    objWrap.mats.forEach((mt) => {
      if (mt.emissive) {
        mt.userData.baseEmissive = mt.emissive.getHex();
        mt.emissive.setHex(0x1e3a8a);
      }
    });
    renderObjectInspector(
      objWrap.data,
      selectedId,
      () => {
        Sim3D.rebake();
        Sim3D.seek(Sim3D.currentTime);
      },
      () => {
        Sim3D.rebake();
        Sim3D.seek(Sim3D.currentTime);
      },
    );
    return;
  }

  if (zoneObjs[id]) {
    selectedId = id;
    const o = zoneObjs[id];
    o.mats.forEach((mt) => {
      if (mt.emissive) {
        mt.userData.baseEmissive = mt.emissive.getHex();
        mt.emissive.setHex(0x0e5560);
      } else {
        mt.userData.baseColor = mt.color.getHex();
        mt.userData.baseOpacity = mt.opacity;
        mt.color.setHex(0x00b8d4);
        mt.opacity = 0.6;
      }
    });

    outlineObj = new THREE.Group();
    const mp = useCorrected ? o.item.final : o.item.orig;
    const y = o.elev + 0.04;
    for (const poly of mp) {
      for (const ring of poly) {
        const pts = ring
          .slice(0, -1)
          .map((p) => new THREE.Vector3(p[0], y, p[1]));
        const line = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0x00f0ff, depthTest: false }),
        );
        line.renderOrder = 998;
        line.raycast = () => {};
        outlineObj.add(line);
      }
    }
    overlayGroup.add(outlineObj);
    renderInspector(o.item, useCorrected, effElev, selectedObjectId);
    return;
  }

  renderInspector(null, useCorrected, effElev, null);
  renderObjectInspector(null, null, null);
}

const Sim3D = createSim3D({
  $,
  toast,
  getData: () => data,
  getSizeM: () => sizeM,
  getSceneObjects: () => sceneObjects3D,
  getSceneHitboxes: () => sceneHitboxes3D,
  getSelectedObjectId: () => selectedObjectId,
});

function setTool(t) {
  tool = t;
  pendingPoint = null;
  document
    .querySelectorAll("[data-tool]")
    .forEach((b) =>
      b.classList.toggle("active", b.getAttribute("data-tool") === t),
    );
  $("toolHint").textContent = TOOL_HINTS[t];
  const banner = $("toolBanner");
  if (t === "select") banner.style.display = "none";
  else {
    banner.style.display = "block";
    banner.textContent =
      t === "distance"
        ? "Medición de distancia: elige el primer punto"
        : "Medición de altura: haz clic sobre un elemento";
  }
  renderer.domElement.style.cursor = t === "select" ? "default" : "crosshair";
}

function onSceneClick(clientX, clientY) {
  if (pickEye) {
    const hit = pickAt(
      clientX,
      clientY,
      true,
      modelRoot,
      activeCam,
      renderer.domElement,
    );
    if (hit) {
      const f = new THREE.Vector3();
      perspCam.getWorldDirection(f);
      placeEye(hit.point.x, hit.point.z, f.x, f.z);
      pickEye = false;
      toast("Cámara ubicada.");
    }
    return;
  }

  if (tool === "select") {
    const hit = pickAt(
      clientX,
      clientY,
      false,
      modelRoot,
      activeCam,
      renderer.domElement,
    );
    applySelection(
      hit ? hit.object.userData.objectId || hit.object.userData.zoneId : null,
    );
    return;
  }

  if (tool === "distance") {
    const hit = pickAt(
      clientX,
      clientY,
      true,
      modelRoot,
      activeCam,
      renderer.domElement,
    );
    if (!hit) return;
    const p = snapPoint(
      hit.point,
      clientX,
      clientY,
      zoneObjs,
      useCorrected,
      activeCam,
      renderer.domElement,
    );
    if (!pendingPoint) {
      pendingPoint = p;
      const tmp = marker(p);
      tmp.userData.temp = true;
      measureGroup.add(tmp);
      $("toolBanner").textContent =
        "Medición de distancia: elige el segundo punto";
    } else {
      measureGroup.children
        .filter((c) => c.userData.temp)
        .forEach((c) => {
          measureGroup.remove(c);
          c.geometry.dispose();
          c.material.dispose();
        });
      addMeasurement(pendingPoint, p, measureGroup, measures);
      pendingPoint = null;
      $("toolBanner").textContent =
        "Medición de distancia: elige el primer punto";
    }
    return;
  }

  if (tool === "height") {
    const hit = pickAt(clientX, clientY, true, modelRoot, activeCam, renderer.domElement);
    if (!hit) return;
    const id = hit.object.userData.zoneId;
    const o = id ? zoneObjs[id] : null;
    const h = o ? o.elev : 0;
    const base = new THREE.Vector3(hit.point.x, 0, hit.point.z);
    const top = new THREE.Vector3(hit.point.x, h, hit.point.z);
    const g = new THREE.Group();
    g.add(
      new THREE.Line(new THREE.BufferGeometry().setFromPoints([base, top]), new THREE.LineBasicMaterial({ color: 0xfacc15, depthTest: false })),
      marker(base), marker(top),
      addLabel(top.clone().add(new THREE.Vector3(0, 0.15, 0)), `Altura ${h.toFixed(2)} m${o ? ` · ${o.item.zone.name}` : ""}`)
    );
    g.children[0].renderOrder = 998;
    measureGroup.add(g);
    measures.push({ type: "height", zoneId: id || null, height: h, point: top.toArray() });
  }
}

bindSimControls(Sim3D, $, renderer, toast);

const layerCheckboxes = {
  calzada: $("lCalzada"),
  anden: $("lAnden"),
  separador: $("lSeparador"),
  edificio: $("lEdificio"),
};
for (const [k, cb] of Object.entries(layerCheckboxes)) {
  if (cb) {
    cb.addEventListener("change", (e) => {
      layerVisible[k] = e.target.checked;
      modelRoot.children.forEach((c) => {
        if (c.userData.layer === k) c.visible = e.target.checked;
      });
      refreshLabels();
    });
  }
}

if ($("lFloor")) $("lFloor").addEventListener("change", (e) => { if (floorMesh) floorMesh.visible = e.target.checked; });
if ($("lGrid")) $("lGrid").addEventListener("change", (e) => { if (gridGroup) gridGroup.visible = e.target.checked; });
if ($("lLabels")) $("lLabels").addEventListener("change", refreshLabels);
if ($("lPoiLabels")) $("lPoiLabels").addEventListener("change", updatePoiLabels);
if ($("lObjects")) $("lObjects").addEventListener("change", (e) => { objectsGroup.visible = e.target.checked; });
if ($("lTrajectories")) {
  $("lTrajectories").addEventListener("change", (e) => {
    trajectoriesGroup.visible = e.target.checked;
    updatePoiLabels();
  });
}
if ($("lHitboxes")) $("lHitboxes").addEventListener("change", (e) => { hitboxesGroup.visible = e.target.checked; });

document.querySelectorAll("[data-tool]").forEach((btn) => {
  btn.addEventListener("click", () => setTool(btn.getAttribute("data-tool")));
});
$("btnClearMeasures").addEventListener("click", () =>
  clearMeasures(measureGroup, measures),
);

document.querySelectorAll("[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => setView(btn.getAttribute("data-view")));
});

document.querySelectorAll("input[name='geomMode']").forEach((r) => {
  r.addEventListener("change", (e) => {
    useCorrected = e.target.value === "corrected";
    rebuildModel();
  });
});

$("iElev").addEventListener("change", (e) => {
  if (!selectedId) return;
  const v = Math.max(0, Math.min(60, parseFloat(e.target.value) || 0));
  elevOverride[selectedId] = v;
  rebuildModel();
  toast(`Elevación actualizada a ${v.toFixed(2)} m`);
});

let downPos = null;
renderer.domElement.addEventListener("pointerdown", (e) => {
  if (e.button === 0) downPos = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener("pointerup", (e) => {
  if (e.button !== 0 || !downPos) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  downPos = null;
  if (moved < 4) onSceneClick(e.clientX, e.clientY);
});

$("eng").addEventListener("click", () =>
  exportScenePNG(renderer, scene, activeCam, viewName, sizeRenderer, toast),
);
$("eglb").addEventListener("click", () =>
  exportSceneGLB(GLTFExporter, modelRoot, applySelection, toast),
);
$("ejson").addEventListener("click", () =>
  exportSceneJSON(data, geo, effElev, toast),
);

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  Sim3D.update(performance.now());
  updateCompass(data, activeCam, compassNeedle);
  updateScaleBar(
    viewName,
    viewport,
    orthoCam,
    $("scaleBarLine"),
    $("scaleBarText"),
  );
  renderer.render(scene, activeCam);
  labelRenderer.render(scene, activeCam);
}

async function init() {
  try {
    if (!PC) throw new Error("No se pudo cargar la librería polygon-clipping.");
    await step("Inicializando motor físico Rapier 3D...");
    await initPhysics();
    await step("Leyendo la escena exportada...");
    data = await loadExport();
    if (!data || !Array.isArray(data.zones) || !data.textureDataUrl) {
      data = makeDemoExport();
      $("demoBanner").style.display = "block";
    }
    sizeM = data.metadata.sizeMeters || 100;
    setupSceneEnvironment(scene, sizeM);
    $("mDim").textContent = `${sizeM} × ${sizeM} m`;
    $("mZones").textContent = `${data.zones.length}`;
    $("mCenter").textContent =
      `${data.metadata.center.lat}, ${data.metadata.center.lng}`;
    $("mBearing").textContent =
      `${(data.metadata.bearingDeg || 0).toFixed(1)}°`;
    $("mMpp").textContent =
      `${(data.metadata.metersPerPixel || 0).toFixed(3)} m/px`;

    await step("Cargando textura del mapa...");
    floorTex = await new Promise((res, rej) => {
      new THREE.TextureLoader().load(data.textureDataUrl, res, undefined, rej);
    });
    floorTex.colorSpace = THREE.SRGBColorSpace;
    floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    geo = await buildGeometry(data, step);
    if (geo.skipped.length)
      toast(`Zonas omitidas: ${geo.skipped.join(", ")}`, 4000);

    await step("Construyendo volúmenes 3D...");
    sizeRenderer();
    buildGrid();
    rebuildModel();
    renderReport(geo, applySelection);
    setView("iso");
    setTool("select");
    $("mZones").textContent = `${geo.items.length}`;
    Sim3D.calculateTotalDuration();
    Sim3D.rebake();
    Sim3D.seek(0);
  } catch (err) {
    console.error(err);
    $("loadingStep").textContent =
      "Error: " + (err && err.message ? err.message : err);
    $("loadingOverlay").querySelector(".spinner").style.display = "none";
    return;
  }
  $("loadingOverlay").classList.add("hidden");
  animate();
}

window.addEventListener("resize", sizeRenderer);
window.__sinistra3d = {
  THREE, scene,
  get geo() { return geo; },
  get data() { return data; },
  setView, setTool, applySelection, Sim3D,
};
init();
