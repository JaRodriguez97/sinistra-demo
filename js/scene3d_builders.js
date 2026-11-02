/**
 * scene3d_builders.js
 * Constructores de mallas tridimensionales para Three.js:
 * Vehículos realistas (Tractomula articulada, camión, bus, SUV, sedán, moto, bici),
 * peatones, mobiliario vial, señalética, huellas de frenado y cajas de colisión 3D (Hitboxes).
 * Compatible con ESM import en Three.js.
 */

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { createMotorcycle3D } from "./scene3d_moto.js";

export function createVehicle3D(obj) {
  const cat = obj.catalogId || "sedan";
  if (cat === "moto") {
    return createMotorcycle3D(obj);
  }

  const g = new THREE.Group();
  const dims = obj.dimensions || { lengthM: 4.5, widthM: 1.8, heightM: 1.45 };
  const L = dims.lengthM || 4.5;
  const W = dims.widthM || 1.8;
  const H = dims.heightM || 1.45;
  const colHex = new THREE.Color(obj.color || "#2563eb").getHex();
  const mats = [];

  const bodyMat = new THREE.MeshStandardMaterial({
    color: colHex,
    metalness: 0.35,
    roughness: 0.35,
  });
  mats.push(bodyMat);

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.1,
    metalness: 0.85,
  });
  mats.push(glassMat);

  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.8,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.8,
    roughness: 0.2,
  });
  const lightFrontMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  const lightRearMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });

  if (cat === "bici") {
    const wheelR = cat === "bici" ? 0.33 : 0.3;
    const wheelThick = cat === "bici" ? 0.05 : 0.12;

    const wGeom = new THREE.CylinderGeometry(wheelR, wheelR, wheelThick, 16);
    wGeom.rotateZ(Math.PI / 2);

    const w1 = new THREE.Mesh(wGeom, wheelMat);
    w1.position.set(L * 0.35, wheelR, 0);
    const w2 = new THREE.Mesh(wGeom, wheelMat);
    w2.position.set(-L * 0.35, wheelR, 0);
    g.add(w1, w2);

    const frameGeom = new THREE.BoxGeometry(L * 0.6, H * 0.45, W * 0.35);
    const frame = new THREE.Mesh(frameGeom, bodyMat);
    frame.position.set(0, wheelR + H * 0.25, 0);
    g.add(frame);

    const barGeom = new THREE.CylinderGeometry(0.02, 0.02, W, 8);
    const bar = new THREE.Mesh(barGeom, rimMat);
    bar.position.set(L * 0.28, wheelR + H * 0.55, 0);
    g.add(bar);

    const fLight = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12),
      lightFrontMat,
    );
    fLight.rotateZ(Math.PI / 2);
    fLight.position.set(L * 0.38, wheelR + H * 0.45, 0);
    g.add(fLight);
  } else if (cat === "tractomula") {
    const cabL = 3.6;
    const cabW = 2.5;
    const cabH = 3.8;
    const trailerL = 13.2;
    const trailerW = 2.55;
    const trailerH = 3.9;
    const wheelR = 0.52;
    const wheelW = 0.32;

    const cabFrontX = L / 2;
    const cabRearX = cabFrontX - cabL;
    const trailerRearX = -L / 2;

    // 1. Chasis y cabina tractora
    const cabGeom = new THREE.BoxGeometry(cabL, cabH * 0.65, cabW);
    const cabMesh = new THREE.Mesh(cabGeom, bodyMat);
    cabMesh.position.set(cabFrontX - cabL / 2, wheelR + (cabH * 0.65) / 2, 0);
    g.add(cabMesh);

    // Deflector aerodinámico
    const deflectorGeom = new THREE.ConeGeometry(cabW * 0.45, 0.7, 4);
    deflectorGeom.rotateY(Math.PI / 4);
    deflectorGeom.rotateZ(-Math.PI / 2);
    const deflector = new THREE.Mesh(deflectorGeom, bodyMat);
    deflector.position.set(
      cabFrontX - cabL * 0.65,
      wheelR + cabH * 0.65 + 0.35,
      0,
    );
    g.add(deflector);

    // Parabrisas de la cabina
    const windGeom = new THREE.BoxGeometry(
      cabL * 0.28,
      cabH * 0.32,
      cabW * 0.9,
    );
    const wind = new THREE.Mesh(windGeom, glassMat);
    wind.position.set(cabFrontX - cabL * 0.35, wheelR + cabH * 0.45, 0);
    g.add(wind);

    // Chimeneas de escape cromadas
    const stackGeom = new THREE.CylinderGeometry(0.08, 0.08, 2.8, 12);
    const stack1 = new THREE.Mesh(stackGeom, rimMat);
    stack1.position.set(cabRearX + 0.2, wheelR + 2.2, cabW / 2 - 0.1);
    const stack2 = new THREE.Mesh(stackGeom, rimMat);
    stack2.position.set(cabRearX + 0.2, wheelR + 2.2, -cabW / 2 + 0.1);
    g.add(stack1, stack2);

    // Tanques de combustible
    const tankGeom = new THREE.CylinderGeometry(0.32, 0.32, 1.6, 12);
    tankGeom.rotateZ(Math.PI / 2);
    const tank1 = new THREE.Mesh(tankGeom, rimMat);
    tank1.position.set(cabRearX + cabL * 0.3, wheelR + 0.35, cabW / 2 + 0.05);
    const tank2 = new THREE.Mesh(tankGeom, rimMat);
    tank2.position.set(cabRearX + cabL * 0.3, wheelR + 0.35, -cabW / 2 - 0.05);
    g.add(tank1, tank2);

    // Quinta rueda
    const fifthWheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.08, 16),
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.9,
        roughness: 0.3,
      }),
    );
    fifthWheel.position.set(cabRearX + 0.4, wheelR + 0.4, 0);
    g.add(fifthWheel);

    // 2. Semirremolque de carga
    const trailerMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.4,
    });
    mats.push(trailerMat);
    const trailerMesh = new THREE.Mesh(
      new THREE.BoxGeometry(trailerL, trailerH, trailerW),
      trailerMat,
    );
    trailerMesh.position.set(
      trailerRearX + trailerL / 2,
      wheelR + trailerH / 2 + 0.15,
      0,
    );
    g.add(trailerMesh);

    // Ruedas: Delantera cabina, doble tándem cabina, triple eje remolque
    const wGeom = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 20);
    wGeom.rotateX(Math.PI / 2);
    const rimGeom = new THREE.CylinderGeometry(
      wheelR * 0.55,
      wheelR * 0.55,
      wheelW + 0.02,
      16,
    );
    rimGeom.rotateX(Math.PI / 2);

    const wheelPositions = [
      { x: cabFrontX - 0.9, z: cabW / 2 },
      { x: cabFrontX - 0.9, z: -cabW / 2 },
      { x: cabRearX + 0.9, z: cabW / 2 },
      { x: cabRearX + 0.9, z: -cabW / 2 },
      { x: cabRearX - 0.2, z: cabW / 2 },
      { x: cabRearX - 0.2, z: -cabW / 2 },
      { x: trailerRearX + 1.2, z: trailerW / 2 },
      { x: trailerRearX + 1.2, z: -trailerW / 2 },
      { x: trailerRearX + 2.4, z: trailerW / 2 },
      { x: trailerRearX + 2.4, z: -trailerW / 2 },
      { x: trailerRearX + 3.6, z: trailerW / 2 },
      { x: trailerRearX + 3.6, z: -trailerW / 2 },
    ];

    wheelPositions.forEach((pos) => {
      const tire = new THREE.Mesh(wGeom, wheelMat);
      const rim = new THREE.Mesh(rimGeom, rimMat);
      tire.position.set(pos.x, wheelR, pos.z);
      rim.position.set(pos.x, wheelR, pos.z);
      g.add(tire, rim);
    });

    const flGeom = new THREE.BoxGeometry(0.08, 0.18, 0.25);
    const fl1 = new THREE.Mesh(flGeom, lightFrontMat);
    fl1.position.set(cabFrontX + 0.02, wheelR + 0.6, cabW * 0.38);
    const fl2 = new THREE.Mesh(flGeom, lightFrontMat);
    fl2.position.set(cabFrontX + 0.02, wheelR + 0.6, -cabW * 0.38);
    g.add(fl1, fl2);

    const rlGeom = new THREE.BoxGeometry(0.06, 0.16, 0.22);
    const rl1 = new THREE.Mesh(rlGeom, lightRearMat);
    rl1.position.set(trailerRearX - 0.02, wheelR + 0.6, trailerW * 0.38);
    const rl2 = new THREE.Mesh(rlGeom, lightRearMat);
    rl2.position.set(trailerRearX - 0.02, wheelR + 0.6, -trailerW * 0.38);
    g.add(rl1, rl2);
  } else {
    const isHeavy = cat === "truck" || cat === "bus";
    const wheelR = isHeavy ? 0.52 : cat === "suv" ? 0.38 : 0.33;
    const wheelW = isHeavy ? 0.32 : 0.22;

    const chassisH = H * (isHeavy ? 0.55 : 0.42);
    const chassisGeom = new THREE.BoxGeometry(L, chassisH, W);
    const chassis = new THREE.Mesh(chassisGeom, bodyMat);
    chassis.position.set(0, wheelR + chassisH / 2, 0);
    g.add(chassis);

    const cabinL = L * (cat === "bus" ? 0.95 : cat === "truck" ? 0.38 : 0.58);
    const cabinW = W * 0.88;
    const cabinH = H - chassisH - wheelR * 0.6;
    const cabinX = cat === "bus" ? 0 : cat === "truck" ? L * 0.28 : -L * 0.05;

    const cabinGeom = new THREE.BoxGeometry(cabinL, cabinH, cabinW);
    const cabin = new THREE.Mesh(cabinGeom, glassMat);
    cabin.position.set(cabinX, wheelR + chassisH + cabinH / 2, 0);
    g.add(cabin);

    if (cat === "truck") {
      const boxL = L * 0.58;
      const boxH = H * 0.72;
      const boxW = W * 0.96;
      const cargoBox = new THREE.Mesh(
        new THREE.BoxGeometry(boxL, boxH, boxW),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 }),
      );
      cargoBox.position.set(-L * 0.18, wheelR + boxH / 2 + 0.1, 0);
      g.add(cargoBox);
    }

    const wGeom = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 20);
    wGeom.rotateX(Math.PI / 2);
    const rimGeom = new THREE.CylinderGeometry(
      wheelR * 0.55,
      wheelR * 0.55,
      wheelW + 0.02,
      16,
    );
    rimGeom.rotateX(Math.PI / 2);

    const wheelOffsets = [
      { x: L * 0.32, z: W / 2 },
      { x: L * 0.32, z: -W / 2 },
      { x: -L * 0.32, z: W / 2 },
      { x: -L * 0.32, z: -W / 2 },
    ];
    if (isHeavy) {
      wheelOffsets.push(
        { x: -L * 0.12, z: W / 2 },
        { x: -L * 0.12, z: -W / 2 },
      );
    }

    wheelOffsets.forEach((pos) => {
      const tire = new THREE.Mesh(wGeom, wheelMat);
      const rim = new THREE.Mesh(rimGeom, rimMat);
      tire.position.set(pos.x, wheelR, pos.z);
      rim.position.set(pos.x, wheelR, pos.z);
      g.add(tire, rim);
    });

    const flGeom = new THREE.BoxGeometry(0.08, 0.15, 0.22);
    const fl1 = new THREE.Mesh(flGeom, lightFrontMat);
    fl1.position.set(L / 2 + 0.02, wheelR + chassisH * 0.65, W * 0.34);
    const fl2 = new THREE.Mesh(flGeom, lightFrontMat);
    fl2.position.set(L / 2 + 0.02, wheelR + chassisH * 0.65, -W * 0.34);
    g.add(fl1, fl2);

    const rlGeom = new THREE.BoxGeometry(0.06, 0.14, 0.2);
    const rl1 = new THREE.Mesh(rlGeom, lightRearMat);
    rl1.position.set(-L / 2 - 0.02, wheelR + chassisH * 0.65, W * 0.34);
    const rl2 = new THREE.Mesh(rlGeom, lightRearMat);
    rl2.position.set(-L / 2 - 0.02, wheelR + chassisH * 0.65, -W * 0.34);
    g.add(rl1, rl2);
  }

  return { group: g, mats };
}

export function createPedestrian3D(obj) {
  const g = new THREE.Group();
  const isNino = obj.catalogId === "peaton_nino";
  const isAgente = obj.catalogId === "agente_transito";
  const s = isNino ? 0.7 : 1.0;

  const colHex = isAgente
    ? 0xeab308
    : new THREE.Color(obj.color || (isNino ? "#ec4899" : "#06b6d4")).getHex();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: colHex,
    roughness: 0.6,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    roughness: 0.7,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: isAgente ? 0x0f172a : 0x1e293b,
    roughness: 0.8,
  });
  const mats = [bodyMat, skinMat, pantsMat];

  const legH = 0.82 * s;
  const legR = 0.07 * s;
  const legGeom = new THREE.CylinderGeometry(legR, legR * 0.85, legH, 10);
  const legL = new THREE.Mesh(legGeom, pantsMat);
  legL.position.set(0, legH / 2, 0.11 * s);
  const legRMesh = new THREE.Mesh(legGeom, pantsMat);
  legRMesh.position.set(0, legH / 2, -0.11 * s);
  g.add(legL, legRMesh);

  const torsoH = 0.58 * s;
  const torsoW = 0.42 * s;
  const torsoD = 0.28 * s;
  const torsoGeom = new THREE.BoxGeometry(torsoD, torsoH, torsoW);
  const torso = new THREE.Mesh(torsoGeom, bodyMat);
  torso.position.set(0, legH + torsoH / 2, 0);
  g.add(torso);

  if (isAgente) {
    const vestMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(torsoD + 0.01, 0.08 * s, torsoW + 0.01),
      vestMat,
    );
    stripe.position.set(0, legH + torsoH * 0.5, 0);
    g.add(stripe);
    mats.push(vestMat);
  }

  const headR = 0.13 * s;
  const headGeom = new THREE.SphereGeometry(headR, 14, 14);
  const head = new THREE.Mesh(headGeom, skinMat);
  head.position.set(0, legH + torsoH + headR, 0);
  g.add(head);

  if (isAgente) {
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.4,
    });
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(headR * 1.15, headR * 1.05, 0.06 * s, 12),
      capMat,
    );
    cap.position.set(0.02 * s, legH + torsoH + headR * 1.6, 0);
    g.add(cap);
    mats.push(capMat);
  }

  return { group: g, mats };
}

export function createGreenZone3D(obj) {
  const g = new THREE.Group();
  const dims = obj.dimensions || { lengthM: 3.0, widthM: 2.0, heightM: 0.04 };
  const L = dims.lengthM || 3.0;
  const W = dims.widthM || 2.0;
  const H = 0.04;
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    roughness: 0.9,
    metalness: 0.05,
  });
  const geom = new THREE.BoxGeometry(L, H, W);
  const mesh = new THREE.Mesh(geom, grassMat);
  mesh.position.y = H / 2;
  g.add(mesh);
  return { group: g, mats: [grassMat] };
}

export function createJerseyBarrier3D(obj) {
  const g = new THREE.Group();
  const dims = obj.dimensions || { lengthM: 2.0, widthM: 0.6, heightM: 0.85 };
  const L = dims.lengthM || 2.0;
  const W = dims.widthM || 0.6;
  const H = dims.heightM || 0.85;

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xd1d5db,
    roughness: 0.85,
    metalness: 0.1,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.6,
  });

  const baseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(L, H * 0.45, W),
    concreteMat,
  );
  baseMesh.position.y = H * 0.225;
  g.add(baseMesh);

  const topMesh = new THREE.Mesh(
    new THREE.BoxGeometry(L, H * 0.55, W * 0.4),
    concreteMat,
  );
  topMesh.position.y = H * 0.45 + H * 0.275;
  g.add(topMesh);

  const sMesh = new THREE.Mesh(
    new THREE.BoxGeometry(L * 0.35, H * 0.15, W + 0.01),
    stripeMat,
  );
  sMesh.position.y = H * 0.3;
  g.add(sMesh);

  return { group: g, mats: [concreteMat, stripeMat] };
}

export function createTree3D(obj) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x78350f,
    roughness: 0.9,
  });
  const crownMat = new THREE.MeshStandardMaterial({
    color: 0x166534,
    roughness: 0.7,
  });

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.26, 2.2, 12),
    trunkMat,
  );
  trunk.position.y = 1.1;
  g.add(trunk);

  const crown = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.75, 1),
    crownMat,
  );
  crown.position.y = 3.1;
  g.add(crown);

  return { group: g, mats: [trunkMat, crownMat] };
}

export function createBush3D(obj) {
  const g = new THREE.Group();
  const bushMat = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    roughness: 0.8,
  });
  const bush = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), bushMat);
  bush.scale.set(1.0, 0.65, 1.0);
  bush.position.y = 0.45;
  g.add(bush);
  return { group: g, mats: [bushMat] };
}

export function createStreetLight3D(obj) {
  const g = new THREE.Group();
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.7,
    roughness: 0.3,
  });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, 6.2, 10),
    metalMat,
  );
  pole.position.y = 3.1;
  g.add(pole);

  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 1.8, 8),
    metalMat,
  );
  arm.rotateZ(Math.PI / 2);
  arm.position.set(0.9, 5.9, 0);
  g.add(arm);

  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.08, 0.18),
    lightMat,
  );
  lamp.position.set(1.7, 5.82, 0);
  g.add(lamp);

  return { group: g, mats: [metalMat] };
}

export function createTrafficLight3D(obj) {
  const g = new THREE.Group();
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.6,
    roughness: 0.4,
  });
  const darkPlasticMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.8,
  });
  const redMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const yellowMat = new THREE.MeshBasicMaterial({ color: 0xeab308 });
  const greenMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.14, 4.5, 10),
    metalMat,
  );
  pole.position.y = 2.25;
  g.add(pole);

  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8),
    metalMat,
  );
  arm.rotateZ(Math.PI / 2);
  arm.position.set(1.6, 4.2, 0);
  g.add(arm);

  // Cabezal rotado hacia el flujo vehicular en -Z (perpendicular al brazo horizontal)
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.78, 0.25), darkPlasticMat);
  box.position.set(3.1, 4.0, 0);
  g.add(box);

  const lensGeom = new THREE.CylinderGeometry(0.065, 0.065, 0.03, 16);
  lensGeom.rotateX(Math.PI / 2); // Eje a lo largo de Z

  const rLens = new THREE.Mesh(lensGeom, redMat);
  rLens.position.set(3.1, 4.26, -0.13);
  const yLens = new THREE.Mesh(lensGeom, yellowMat);
  yLens.position.set(3.1, 4.0, -0.13);
  const gLens = new THREE.Mesh(lensGeom, greenMat);
  gLens.position.set(3.1, 3.74, -0.13);

  // Viseras parasol protectoras sobre cada óptica
  const visorGeom = new THREE.BoxGeometry(0.15, 0.02, 0.06);
  const rVisor = new THREE.Mesh(visorGeom, darkPlasticMat);
  rVisor.position.set(3.1, 4.33, -0.14);
  const yVisor = new THREE.Mesh(visorGeom, darkPlasticMat);
  yVisor.position.set(3.1, 4.07, -0.14);
  const gVisor = new THREE.Mesh(visorGeom, darkPlasticMat);
  gVisor.position.set(3.1, 3.81, -0.14);

  g.add(rLens, yLens, gLens, rVisor, yVisor, gVisor);

  return { group: g, mats: [metalMat, darkPlasticMat] };
}

export function createCamera3D(obj) {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.7,
    roughness: 0.3,
  });
  const camMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.4,
  });

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 5.2, 10),
    poleMat,
  );
  pole.position.y = 2.6;
  g.add(pole);

  const cam1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.24), camMat);
  cam1.position.set(0.3, 5.0, 0.15);
  cam1.rotation.z = -0.3;
  const cam2 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.2, 0.22), camMat);
  cam2.position.set(0.3, 4.6, -0.15);
  cam2.rotation.z = -0.3;
  g.add(cam1, cam2);

  return { group: g, mats: [poleMat, camMat] };
}

export function createTrafficSign3D(obj) {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    metalness: 0.8,
    roughness: 0.2,
  });
  const mats = [poleMat];

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8),
    poleMat,
  );
  pole.position.y = 1.1;
  g.add(pole);

  const catId = obj.catalogId || "senal_pare";
  let plateMat;
  let plateGeom;

  if (catId === "senal_pare") {
    plateMat = new THREE.MeshStandardMaterial({
      color: 0xb91c1c,
      roughness: 0.4,
    });
    plateGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.03, 8);
    plateGeom.rotateZ(Math.PI / 2);
  } else if (catId === "senal_ceda") {
    plateMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.4,
    });
    plateGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.03, 3);
    plateGeom.rotateZ(Math.PI / 2);
    plateGeom.rotateY(Math.PI);
  } else if (catId === "senal_prohibido_parquear") {
    plateMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.4,
    });
    plateGeom = new THREE.CylinderGeometry(0.32, 0.32, 0.03, 20);
    plateGeom.rotateZ(Math.PI / 2);
  } else {
    plateMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.4,
    });
    plateGeom = new THREE.CylinderGeometry(0.32, 0.32, 0.03, 20);
    plateGeom.rotateZ(Math.PI / 2);
  }

  mats.push(plateMat);
  const plate = new THREE.Mesh(plateGeom, plateMat);
  plate.position.set(0.04, 2.0, 0);
  g.add(plate);

  if (
    catId.startsWith("senal_velocidad") ||
    catId === "senal_prohibido_parquear"
  ) {
    const rimMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
    const rimGeom = new THREE.TorusGeometry(0.32, 0.025, 8, 24);
    rimGeom.rotateY(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeom, rimMat);
    rim.position.set(0.05, 2.0, 0);
    g.add(rim);
    mats.push(rimMat);
  }

  return { group: g, mats };
}

export function createSkidMarks3D(obj) {
  const g = new THREE.Group();
  const len = obj.skidLengthM || 10;
  const track = obj.skidTrackWidthM || 1.5;
  const catId = obj.catalogId || "huella_frenado";
  const mats = [];

  if (catId === "escombros") {
    const debrisMat = new THREE.MeshStandardMaterial({
      color: 0x93c5fd,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.85,
    });
    mats.push(debrisMat);
    const shardGeom = new THREE.TetrahedronGeometry(0.08);
    for (let i = 0; i < 24; i++) {
      const shard = new THREE.Mesh(shardGeom, debrisMat);
      const rx = (Math.random() - 0.5) * len;
      const rz = (Math.random() - 0.5) * track;
      shard.position.set(rx, 0.02, rz);
      shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      g.add(shard);
    }
  } else if (catId === "mancha_aceite") {
    const oilMat = new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    mats.push(oilMat);
    const oilGeom = new THREE.CircleGeometry(track / 2, 20);
    oilGeom.rotateX(-Math.PI / 2);
    const oil = new THREE.Mesh(oilGeom, oilMat);
    oil.scale.set(len / track, 1, 1);
    oil.position.set(0, 0.006, 0);
    g.add(oil);
  } else {
    const tireW = catId === "huella_derrape" ? 0.35 : 0.22;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x111827,
      transparent: true,
      opacity: obj.triggerOnPass ? 0.45 : 0.88,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    mats.push(mat);

    const bGeom = new THREE.PlaneGeometry(len, tireW);
    bGeom.rotateX(-Math.PI / 2);

    const b1 = new THREE.Mesh(bGeom, mat);
    b1.position.set(-len / 2, 0.005, -track / 2);
    const b2 = new THREE.Mesh(bGeom, mat);
    b2.position.set(-len / 2, 0.005, track / 2);
    g.add(b1, b2);
  }

  return { group: g, mats };
}

export function createGenericObject3D(obj) {
  const g = new THREE.Group();
  const dims = obj.dimensions || { lengthM: 1, widthM: 1, heightM: 1 };
  const mat = new THREE.MeshStandardMaterial({
    color: obj.color || 0x2563eb,
    roughness: 0.5,
  });
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(dims.lengthM, dims.heightM, dims.widthM),
    mat,
  );
  mesh.position.y = dims.heightM / 2;
  g.add(mesh);
  return { group: g, mats: [mat] };
}

/**
 * Crea una caja de colisión 3D alámbrica (Hitbox Helper) ajustada con precisión milimétrica al objeto
 */
export function createHitbox3D(obj) {
  const dims = obj.dimensions || { lengthM: 4.5, widthM: 1.8, heightM: 1.45 };
  const L = dims.lengthM || 4.5;
  const W = dims.widthM || 1.8;
  const H = dims.heightM || 1.45;

  const boxGeom = new THREE.BoxGeometry(L, H, W);
  const edges = new THREE.EdgesGeometry(boxGeom);
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x10b981,
    linewidth: 2,
    transparent: true,
    opacity: 0.85,
  });
  const wireframe = new THREE.LineSegments(edges, lineMat);
  wireframe.position.y = H / 2;
  wireframe.name = `hitbox_${obj.id}`;
  return { wireframe, material: lineMat };
}

/**
 * Construye la línea de trayectoria 3D, conos direccionales y cartel de POI
 */
export function buildTrajectory3D(obj, baseElev, trajectoriesGroup) {
  const pts = obj.kinematics.trajectoryPoints;
  if (!pts || pts.length < 2) return;

  const yElev = baseElev + 0.08;
  const vecPts = pts.map((p) => new THREE.Vector3(p.x, yElev, p.z));

  const lineGeom = new THREE.BufferGeometry().setFromPoints(vecPts);
  const lineMat = new THREE.LineBasicMaterial({
    color: 0xf97316,
    linewidth: 3,
  });
  const line = new THREE.Line(lineGeom, lineMat);
  line.raycast = () => {};
  trajectoriesGroup.add(line);

  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const midX = (p1.x + p2.x) / 2;
    const midZ = (p1.z + p2.z) / 2;
    const angle = Math.atan2(p2.z - p1.z, p2.x - p1.x);

    const arrowGeom = new THREE.ConeGeometry(0.35, 0.9, 8);
    arrowGeom.rotateZ(-Math.PI / 2);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
    const arrow = new THREE.Mesh(arrowGeom, arrowMat);
    arrow.position.set(midX, yElev + 0.02, midZ);
    arrow.rotation.y = -angle;
    arrow.raycast = () => {};
    trajectoriesGroup.add(arrow);
  }

  const impactPt =
    pts.find((p) => p.type === "impact_point") ||
    pts[Math.min(2, pts.length - 1)];
  if (impactPt) {
    const coneGeom = new THREE.ConeGeometry(0.3, 0.75, 14);
    const coneMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.4,
    });
    const cone = new THREE.Mesh(coneGeom, coneMat);
    cone.position.set(impactPt.x, yElev + 0.37, impactPt.z);
    cone.raycast = () => {};
    trajectoriesGroup.add(cone);

    const div = document.createElement("div");
    div.className = "zone-label poi-impact-label";
    div.style.borderColor = "#f97316";
    div.style.color = "#f97316";
    div.innerHTML = `<span>💥 Impacto (POI)</span><small>${obj.kinematics.speedKmh} km/h</small>`;
    const poiLabel = new CSS2DObject(div);
    poiLabel.position.set(impactPt.x, yElev + 1.2, impactPt.z);
    poiLabel.userData = { isPoiLabel: true, element: div };
    trajectoriesGroup.add(poiLabel);
  }
}
