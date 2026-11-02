/**
 * Sinistra 3D - Módulo de Física Forense con Rapier 3D (scene3d_physics.js)
 * Simulación de colisiones a paso fijo (1/120s), detección CCD continua,
 * almacenamiento en búfer inmutable (Bake) e interpolación reversible (Seek).
 */

import RAPIER from "@dimforge/rapier3d-compat";

export const MASS_TABLE_KG = {
  automovil: 1400,
  sedan: 1400,
  suv: 1900,
  camioneta: 1900,
  camion: 7500,
  truck: 7500,
  bus: 12000,
  tractomula: 18000,
  motocicleta: 150,
  moto: 150,
  bicicleta: 50,
  bici: 50,
  peaton: 75,
  persona: 75,
  peaton_nino: 35,
  agente_transito: 80,
};

let initPromise = null;

/**
 * Inicializa el motor Rapier (WebAssembly embebido) una sola vez
 */
export async function initPhysics() {
  if (!initPromise) {
    initPromise = RAPIER.init();
  }
  await initPromise;
  return RAPIER;
}

/**
 * Obtiene la masa estimada o configurada de un objeto
 */
export function getObjectMass(obj) {
  if (obj && Number(obj.massKg) > 0) return Number(obj.massKg);
  if (!obj) return 1400;
  return (
    MASS_TABLE_KG[obj.catalogId] ||
    MASS_TABLE_KG[obj.type] ||
    MASS_TABLE_KG[obj.category] ||
    1400
  );
}

/**
 * Obtiene las dimensiones periciales (Largo, Ancho, Alto) de un objeto
 */
export function getObjectDimensions(obj) {
  if (obj && obj.dimensions) {
    const l = Number(obj.dimensions.lengthM || obj.dimensions.lengthMeters);
    const w = Number(obj.dimensions.widthM || obj.dimensions.widthMeters);
    const h = Number(obj.dimensions.heightM || obj.dimensions.heightMeters);
    if (l && w && h) return { length: l, width: w, height: h };
  }
  const cat =
    (typeof window !== "undefined" && window.OBJECTS_CATALOG) ||
    (typeof window !== "undefined" && window.OBJECT_CATALOG_3D) ||
    null;
  const def = cat && obj ? cat[obj.catalogId || obj.type] : null;
  return {
    length: def?.lengthM || def?.length || 4.5,
    width: def?.widthM || def?.width || 1.8,
    height: def?.heightM || def?.height || 1.5,
  };
}

/**
 * Interpola esféricamente dos cuaterniones [x, y, z, w]
 */
function slerpQuat(q1, q2, t) {
  let [x1, y1, z1, w1] = q1;
  let [x2, y2, z2, w2] = q2;
  let dot = x1 * x2 + y1 * y2 + z1 * z2 + w1 * w2;
  if (dot < 0) {
    dot = -dot;
    x2 = -x2;
    y2 = -y2;
    z2 = -z2;
    w2 = -w2;
  }
  if (dot > 0.9995) {
    const rx = x1 + (x2 - x1) * t;
    const ry = y1 + (y2 - y1) * t;
    const rz = z1 + (z2 - z1) * t;
    const rw = w1 + (w2 - w1) * t;
    const len = Math.hypot(rx, ry, rz, rw) || 1;
    return [rx / len, ry / len, rz / len, rw / len];
  }
  const theta0 = Math.acos(Math.max(-1, Math.min(1, dot)));
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;
  return [
    s0 * x1 + s1 * x2,
    s0 * y1 + s1 * y2,
    s0 * z1 + s1 * z2,
    s0 * w1 + s1 * w2,
  ];
}

export function getGroundElevAt(x, z, zones, sizeM) {
  if (!zones || !Array.isArray(zones) || zones.length === 0) return 0;
  const sz = sizeM || 100;
  let bestElev = 0, bestPrio = 0;
  const offsets = [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]];
  for (let k = 0; k < zones.length; k++) {
    const zn = zones[k];
    const hasM = Array.isArray(zn.pointsMeters) && zn.pointsMeters.length >= 3;
    const pts = hasM ? zn.pointsMeters : (zn.pointsNorm || zn.points);
    if (!pts || pts.length < 3) continue;
    let hit = false;
    for (let o = 0; o < offsets.length; o++) {
      const ox = offsets[o][0], oz = offsets[o][1];
      const tx = hasM ? (x + ox) : (x + ox) / sz + 0.5;
      const tz = hasM ? (z + oz) : (z + oz) / sz + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const p1 = pts[i], p2 = pts[j];
        const x1 = p1.x !== undefined ? p1.x : p1.normX;
        const z1 = p1.z !== undefined ? p1.z : (p1.y !== undefined ? p1.y : p1.normY);
        const x2 = p2.x !== undefined ? p2.x : p2.normX;
        const z2 = p2.z !== undefined ? p2.z : (p2.y !== undefined ? p2.y : p2.normY);
        if (z1 > tz !== z2 > tz && tx < ((x2 - x1) * (tz - z1)) / (z2 - z1) + x1) inside = !inside;
      }
      if (inside) { hit = true; break; }
    }
    if (hit) {
      const defElev = zn.type === "edificio" ? 4.5 : zn.type === "anden" ? 0.15 : zn.type === "separador" ? 0.15 : 0;
      const elev = zn.elevationMeters !== undefined && zn.elevationMeters !== null && !isNaN(Number(zn.elevationMeters))
        ? Math.max(defElev, Number(zn.elevationMeters))
        : defElev;
      const prio = zn.type === "edificio" ? 10 : zn.type === "separador" ? 8 : zn.type === "anden" ? 5 : 2;
      if (prio > bestPrio) {
        bestPrio = prio;
        bestElev = elev;
      }
    }
  }
  return bestElev;
}

/**
 * Pre-calcula la simulación física completa a 1/120s ("Bake")
 */
export function bakePhysicsScenario({
  objects,
  zones,
  sizeM,
  sampleObjectAtTime,
  maxDuration,
}) {
  const dt = 1 / 120;
  const simDuration = Math.max(1.0, Number(maxDuration) || 3.0);
  const totalSteps = Math.ceil(simDuration / dt);

  const gravity = new RAPIER.Vector3(0, -9.81, 0);
  const world = new RAPIER.World(gravity);
  world.timestep = dt;

  // 1. Suelo rígido
  const groundHalf = Math.max(100, sizeM || 100) / 2;
  const groundDesc = RAPIER.ColliderDesc.cuboid(groundHalf, 0.1, groundHalf)
    .setTranslation(0, -0.1, 0)
    .setFriction(0.29);
  world.createCollider(groundDesc);

  const colliderMap = new Map();
  const vehStates = new Map();
  const staticObstacles = new Map();

  // 2. Colisionadores rígidos estáticos para Edificaciones (zones: tipo "edificio")
  if (Array.isArray(zones)) {
    const sz = sizeM || 100;
    zones.forEach((z) => {
      if (z.type === "edificio") {
        let minX = Infinity,
          maxX = -Infinity,
          minZ = Infinity,
          maxZ = -Infinity;
        if (Array.isArray(z.pointsMeters) && z.pointsMeters.length > 0) {
          z.pointsMeters.forEach((p) => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z);
            maxZ = Math.max(maxZ, p.z);
          });
        } else if (Array.isArray(z.points) && z.points.length > 0) {
          z.points.forEach((p) => {
            const mx = (p.x - 0.5) * sz;
            const mz = (p.y - 0.5) * sz;
            minX = Math.min(minX, mx);
            maxX = Math.max(maxX, mx);
            minZ = Math.min(minZ, mz);
            maxZ = Math.max(maxZ, mz);
          });
        }
        if (minX < maxX && minZ < maxZ) {
          const bElev = Math.max(3.5, Number(z.elevationMeters) || 4.5);
          const cx = (minX + maxX) / 2;
          const cz = (minZ + maxZ) / 2;
          const hx = Math.max(0.6, (maxX - minX) / 2);
          const hz = Math.max(0.6, (maxZ - minZ) / 2);
          const hy = bElev / 2;

          const bDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(cx, hy, cz);
          const bBody = world.createRigidBody(bDesc);
          const cDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
            .setFriction(0.7)
            .setRestitution(0.1);
          const col = world.createCollider(cDesc, bBody);
          colliderMap.set(col.handle, z.id);
          staticObstacles.set(z.id, { type: "edificio", name: z.name });
        }
      }
    });
  }

  // 3. Colisionadores rígidos estáticos para Mobiliario y Señales (árboles, postes, semáforos, etc.)
  const allObjects = objects || [];
  const staticProps = allObjects.filter(
    (o) =>
      o.category === "mobiliario" ||
      o.category === "senal" ||
      o.catalogId === "arbol" ||
      o.catalogId === "poste_luz" ||
      o.catalogId === "semaforo" ||
      o.catalogId === "barrera_new_jersey" ||
      o.catalogId === "bolardo",
  );

  for (const obj of staticProps) {
    const dims = getObjectDimensions(obj);
    const posX = obj.positionMeters
      ? obj.positionMeters.x
      : ((obj.normX || 0.5) - 0.5) * (sizeM || 100);
    const posZ = obj.positionMeters
      ? obj.positionMeters.z
      : ((obj.normY || 0.5) - 0.5) * (sizeM || 100);
    const baseElev = obj.baseElevationMeters || 0;
    const posY = baseElev + dims.height / 2;
    const rotDeg = obj.rotationDeg || 0;
    const rotY = -(rotDeg * Math.PI) / 180;
    const quat = {
      x: 0,
      y: Math.sin(rotY / 2),
      z: 0,
      w: Math.cos(rotY / 2),
    };

    const propDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(posX, posY, posZ)
      .setRotation(quat);
    const propBody = world.createRigidBody(propDesc);

    // Si es un árbol, el colisionador impactable es el tronco
    const halfL =
      obj.catalogId === "arbol" ? 0.3 : Math.max(0.2, dims.length / 2);
    const halfW =
      obj.catalogId === "arbol" ? 0.3 : Math.max(0.2, dims.width / 2);
    const halfH = Math.max(0.5, dims.height / 2);

    const propColDesc = RAPIER.ColliderDesc.cuboid(halfL, halfH, halfW)
      .setFriction(0.7)
      .setRestitution(0.1);
    const col = world.createCollider(propColDesc, propBody);
    colliderMap.set(col.handle, obj.id);
    staticObstacles.set(obj.id, { type: "prop", name: obj.name });
  }

  // 4. Cuerpos dinámicos para Vehículos, Peatones, Motos y Bicicletas
  const dynamicObjects = allObjects.filter(
    (o) =>
      o.category === "vehiculo" ||
      o.category === "persona" ||
      o.catalogId === "moto" ||
      o.catalogId === "bici" ||
      o.catalogId === "peaton" ||
      o.catalogId === "peaton_nino",
  );

  for (const obj of dynamicObjects) {
    const hasTraj =
      obj.kinematics &&
      Array.isArray(obj.kinematics.trajectoryPoints) &&
      obj.kinematics.trajectoryPoints.length >= 2;

    let posX = 0;
    let posZ = 0;
    let rotDeg = 0;

    if (hasTraj) {
      const s0 = sampleObjectAtTime(obj, 0);
      if (s0) {
        posX = s0.x;
        posZ = s0.z;
        rotDeg = s0.rotationDeg;
      }
    } else {
      posX = obj.positionMeters
        ? obj.positionMeters.x
        : ((obj.normX || 0.5) - 0.5) * (sizeM || 100);
      posZ = obj.positionMeters
        ? obj.positionMeters.z
        : ((obj.normY || 0.5) - 0.5) * (sizeM || 100);
      rotDeg = obj.rotationDeg || 0;
    }

    const dims = getObjectDimensions(obj);
    const mass = getObjectMass(obj);
    const baseElev = obj.baseElevationMeters || 0;
    const posY = baseElev + dims.height / 2;

    const rotY = -(rotDeg * Math.PI) / 180;
    const quat = {
      x: 0,
      y: Math.sin(rotY / 2),
      z: 0,
      w: Math.cos(rotY / 2),
    };

    // Amortiguación pericial calibrada (0.06): sin drag artificial parásito
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(posX, posY, posZ)
      .setRotation(quat)
      .setCcdEnabled(true)
      .enabledRotations(false, true, false)
      .setLinearDamping(0.06)
      .setAngularDamping(0.85);

    if (baseElev > 0.05) {
      bodyDesc.setGravityScale(0, true);
    }

    const body = world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      Math.max(0.2, dims.length / 2),
      Math.max(0.2, dims.height / 2),
      Math.max(0.2, dims.width / 2),
    )
      .setMass(mass)
      .setFriction(0.65)
      .setRestitution(0.18)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

    const collider = world.createCollider(colliderDesc, body);
    colliderMap.set(collider.handle, obj.id);

    const traj = obj.kinematics?.trajectoryPoints || [];
    let rawRestPt = traj.find((p) => p.type === "final_rest");
    if (!rawRestPt && obj.finalRest) {
      rawRestPt = obj.finalRest;
    }
    const finalRestPt = rawRestPt
      ? {
          x:
            rawRestPt.x !== undefined
              ? rawRestPt.x
              : ((rawRestPt.normX || 0.5) - 0.5) * (sizeM || 100),
          z:
            rawRestPt.z !== undefined
              ? rawRestPt.z
              : ((rawRestPt.normY || 0.5) - 0.5) * (sizeM || 100),
        }
      : null;

    vehStates.set(obj.id, {
      obj,
      body,
      dims,
      mass,
      hasTraj,
      phase: hasTraj ? "guided" : "free",
      impactOccurred: false,
      firstImpactTime: null,
      impactPos: null,
      finalRestPt: finalRestPt
        ? {
            x:
              finalRestPt.x !== undefined
                ? finalRestPt.x
                : ((finalRestPt.normX || 0.5) - 0.5) * (sizeM || 100),
            z:
              finalRestPt.z !== undefined
                ? finalRestPt.z
                : ((finalRestPt.normY || 0.5) - 0.5) * (sizeM || 100),
          }
        : null,
      deviationAngleDeg: obj.deviationAngleDeg || 0,
      frames: [],
    });
  }

  // 4b. Preparar estados de conductores independientes para motocicletas (Opción A)
  const riderStates = new Map();
  for (const obj of dynamicObjects) {
    if (
      (obj.catalogId === "moto" || obj.type === "moto") &&
      (!obj.rider || obj.rider.enabled !== false)
    ) {
      const rCfg = obj.rider || {};
      const restDist =
        rCfg.finalRestDistanceM !== undefined
          ? Number(rCfg.finalRestDistanceM)
          : rCfg.finalRest && rCfg.finalRest.distanceM !== undefined
            ? Number(rCfg.finalRest.distanceM)
            : 6.0;
      let restPt = null;
      if (rCfg.finalRest) {
        const sz = sizeM || 100;
        const rx = rCfg.finalRest.x !== undefined ? Number(rCfg.finalRest.x) : (rCfg.finalRest.normX !== undefined ? (Number(rCfg.finalRest.normX) - 0.5) * sz : undefined);
        const rz = rCfg.finalRest.z !== undefined ? Number(rCfg.finalRest.z) : (rCfg.finalRest.normY !== undefined ? (Number(rCfg.finalRest.normY) - 0.5) * sz : undefined);
        if (rx !== undefined && rz !== undefined && !isNaN(rx) && !isNaN(rz)) restPt = { x: rx, z: rz };
      }

      riderStates.set(obj.id, {
        motoId: obj.id,
        motoState: vehStates.get(obj.id),
        mass: Number(rCfg.massKg) || 75,
        friction:
          rCfg.frictionGround !== undefined
            ? Number(rCfg.frictionGround)
            : 0.66,
        launchAngleDeg:
          rCfg.launchAngleDeg !== undefined ? Number(rCfg.launchAngleDeg) : 15,
        finalRestDistanceM: restDist,
        finalRestPt: restPt,
        restitution:
          rCfg.restitution !== undefined ? Number(rCfg.restitution) : 0.1,
        trajectoryComputed: false,
        traj: null,
        frames: [],
      });
    }
  }

  // 5. Bucle de integración a paso fijo (1/120s)
  const eventQueue = new RAPIER.EventQueue(true);
  const activeContacts = new Set();
  let firstImpactReport = null;

  for (let step = 0; step <= totalSteps; step++) {
    const t = step * dt;

    // A. Imponer velocidades cinemáticas antes del contacto
    for (const [id, state] of vehStates.entries()) {
      if (state.phase === "guided" && state.hasTraj) {
        const nextPose = sampleObjectAtTime(state.obj, t + dt);
        if (nextPose) {
          const curPos = state.body.translation();
          const vx = (nextPose.x - curPos.x) / dt;
          const vz = (nextPose.z - curPos.z) / dt;

          const targetRotY = -(nextPose.rotationDeg * Math.PI) / 180;
          const curRot = state.body.rotation();
          const curRotY = 2 * Math.atan2(curRot.y, curRot.w);

          let diffY = targetRotY - curRotY;
          while (diffY > Math.PI) diffY -= 2 * Math.PI;
          while (diffY < -Math.PI) diffY += 2 * Math.PI;
          const vyaw = diffY / dt;

          state.body.setLinvel({ x: vx, y: 0, z: vz }, true);
          state.body.setAngvel({ x: 0, y: vyaw, z: 0 }, true);
          state.preStepLinvel = { x: vx, y: 0, z: vz };
        } else {
          // La trayectoria guiada terminó: pasar a física libre conservando el momentum
          state.phase = "free";
        }
      }
    }

    // B. Paso de simulación física en Rapier
    world.step(eventQueue);

    // C. Procesar eventos de contacto (Vehículos, Peatones, Obstáculos, Edificios)
    eventQueue.drainCollisionEvents((h1, h2, started) => {
      const id1 = colliderMap.get(h1);
      const id2 = colliderMap.get(h2);
      if (!id1 || !id2 || id1 === id2) return;

      // El conductor no colisiona con su propia motocicleta al nacer
      if (id1.endsWith("::rider") && id2 === id1.split("::")[0]) return;
      if (id2.endsWith("::rider") && id1 === id2.split("::")[0]) return;

      const pairKey = id1 < id2 ? `${id1}|${id2}` : `${id2}|${id1}`;
      if (started) {
        activeContacts.add(pairKey);
        const s1 = vehStates.get(id1);
        const s2 = vehStates.get(id2);

        // Caso 1: Colisión entre dos cuerpos dinámicos (vehículo-vehículo, vehículo-peatón, etc.)
        if (s1 && s2) {
          // Transición a física libre
          if (s1.phase === "guided") {
            s1.phase = "free";
            s1.impactOccurred = true;
            s1.firstImpactTime = t;
          }
          if (s2.phase === "guided") {
            s2.phase = "free";
            s2.impactOccurred = true;
            s2.firstImpactTime = t;
          }

          if (!firstImpactReport) {
            // Comprobar si ocurre cerca del POI de alguno de los vehículos
            let isNearPOI = false;
            [s1, s2].forEach((st) => {
              const poi = (st.obj.kinematics?.trajectoryPoints || []).find(
                (p) => p.type === "impact_point",
              );
              if (poi) {
                const pos = st.body.translation();
                const d = Math.hypot(pos.x - poi.x, pos.z - poi.z);
                if (d <= 6) isNearPOI = true;
              }
            });

            firstImpactReport = {
              time: t,
              objA: s1.obj,
              objB: s2.obj,
              isPOI: isNearPOI,
            };
          }

          // Desvío post-impacto: Solo si el usuario especificó manualmente un ángulo distinto de 0.
          // Si deviationAngleDeg es 0 (por defecto), se respeta al 100% la respuesta física pura de Rapier.
          [s1, s2].forEach((st) => {
            if (st.deviationAngleDeg && Number(st.deviationAngleDeg) !== 0) {
              const fwd = st.preStepLinvel || st.body.linvel();
              const sp = Math.hypot(fwd.x, fwd.z);
              if (sp > 0.1) {
                const fwdAng = Math.atan2(fwd.z, fwd.x);
                const devRad = (st.deviationAngleDeg * Math.PI) / 180;
                const newAng = fwdAng + devRad;
                const newVx = sp * Math.cos(newAng);
                const newVz = sp * Math.sin(newAng);
                st.body.setLinvel({ x: newVx, y: 0, z: newVz }, true);

                const targetRotY = -newAng + Math.PI / 2;
                st.body.setRotation(
                  {
                    x: 0,
                    y: Math.sin(targetRotY / 2),
                    z: 0,
                    w: Math.cos(targetRotY / 2),
                  },
                  true,
                );
              }
            }
          });
        } else {
          // Caso 2: Colisión de cuerpo dinámico contra obstáculo estático (edificio, árbol, poste)
          const dyn = s1 || s2;
          if (dyn) {
            if (dyn.phase === "guided") {
              dyn.phase = "free";
              dyn.impactOccurred = true;
              dyn.firstImpactTime = t;
            }
          }
        }
      } else {
        activeContacts.delete(pairKey);
      }
    });

    // D. Registrar fotograma en el búfer para vehículos
    for (const [id, state] of vehStates.entries()) {
      let pos = state.body.translation();
      const rot = state.body.rotation();
      const vel = state.body.linvel();
      let speedKmh = Math.hypot(vel.x, vel.z) * 3.6;

      // Guiado hacia el punto de reposo final si fue configurado en la trayectoria
      if (
        state.impactOccurred &&
        state.firstImpactTime !== null
      ) {
        if (!state.finalRestPt) {
          if (state.obj.finalRest && state.obj.finalRest.x !== undefined) {
            state.finalRestPt = { x: state.obj.finalRest.x, z: state.obj.finalRest.z };
          } else {
            const fwd = state.preStepLinvel || state.body.linvel();
            const fwdAng = Math.atan2(fwd.z, fwd.x);
            const devRad = ((state.deviationAngleDeg || 0) * Math.PI) / 180;
            const targetAng = fwdAng + devRad;
            const dM = state.obj.finalRestDistanceM !== undefined ? state.obj.finalRestDistanceM : 5.0;
            state.finalRestPt = {
              x: pos.x + dM * Math.cos(targetAng),
              z: pos.z + dM * Math.sin(targetAng),
            };
          }
        }

        if (!state.impactPos) {
          state.impactPos = { x: pos.x, y: pos.y, z: pos.z };
          const dR = Math.hypot(
            state.finalRestPt.x - pos.x,
            state.finalRestPt.z - pos.z,
          );
          state.slideDist = dR;
          const v0 = state.preStepLinvel
            ? Math.hypot(state.preStepLinvel.x, state.preStepLinvel.z)
            : 5.0;
          state.slideDuration = Math.max(
            0.5,
            Math.min(2.5, dR > 0.05 ? (2 * dR) / Math.max(1.5, v0) : 0.5),
          );
        }

          const dtPost = t - state.firstImpactTime;
        if (dtPost < state.slideDuration) {
          const u = dtPost / state.slideDuration;
          const s = u * (2 - u);
          const nx =
            state.impactPos.x + s * (state.finalRestPt.x - state.impactPos.x);
          const nz =
            state.impactPos.z + s * (state.finalRestPt.z - state.impactPos.z);
          const gElev = getGroundElevAt(nx, nz, zones, sizeM);
          const ny = gElev + (state.dims ? state.dims.height / 2 : 0.55);
          state.body.setTranslation({ x: nx, y: ny, z: nz }, true);
          pos = state.body.translation();
          speedKmh = Math.max(
            0,
            (state.slideDist / state.slideDuration) * 2 * (1 - u) * 3.6,
          );
        } else {
          const gElev = getGroundElevAt(state.finalRestPt.x, state.finalRestPt.z, zones, sizeM);
          const ny = gElev + (state.dims ? state.dims.height / 2 : 0.55);
          state.body.setTranslation(
            { x: state.finalRestPt.x, y: ny, z: state.finalRestPt.z },
            true,
          );
          state.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          pos = state.body.translation();
          speedKmh = 0;
          state.phase = "final_rest";
        }
      }

      let inContact = false;
      for (const pair of activeContacts) {
        if (pair.includes(id)) {
          inContact = true;
          break;
        }
      }

      state.frames.push({
        t,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        qx: rot.x,
        qy: rot.y,
        qz: rot.z,
        qw: rot.w,
        vx: vel.x,
        vz: vel.z,
        speedKmh,
        inContact,
        phase:
          state.phase === "final_rest"
            ? "final_rest"
            : state.phase === "free" && state.impactOccurred
              ? "post_impact"
              : state.phase === "guided"
                ? "guided"
                : "final_rest",
      });
    }

    // E. Generar y registrar fotogramas para conductores independientes (Fase aérea + Deslizamiento)
    for (const [motoId, rState] of riderStates.entries()) {
      const mState = rState.motoState;
      if (
        mState &&
        mState.impactOccurred &&
        t >= (mState.firstImpactTime || 0)
      ) {
        if (!rState.trajectoryComputed) {
          const mPos = mState.body.translation();
          const mRot = mState.body.rotation();
          const qx = mRot.x,
            qy = mRot.y,
            qz = mRot.z,
            qw = mRot.w;
          const vx0 = -0.12,
            vy0 = 0.82,
            vz0 = 0;
          const tx = 2 * (qy * vz0 - qz * vy0 + qw * vx0);
          const ty = 2 * (qz * vx0 - qx * vz0 + qw * vy0);
          const tz = 2 * (qx * vy0 - qy * vx0 + qw * vz0);
          const baseY = mPos.y - (mState.dims ? mState.dims.height / 2 : 0.55);
          const spawnX = mPos.x + (vx0 + qy * tz - qz * ty);
          const spawnY = Math.max(0.12, baseY + (vy0 + qz * tx - qx * tz));
          const spawnZ = mPos.z + (vz0 + qx * ty - qy * tx);

          const fwdVel = mState.preStepLinvel || mState.body.linvel();
          const spHoriz = Math.max(1.0, Math.hypot(fwdVel.x, fwdVel.z));
          const fwdAng = Math.atan2(fwdVel.z, fwdVel.x);
          const devRad = ((mState.deviationAngleDeg || 0) * Math.PI) / 180;
          const targetAng = fwdAng + devRad;

          let targetX, targetZ;
          if (rState.finalRestPt && rState.finalRestPt.x !== undefined) {
            targetX = rState.finalRestPt.x;
            targetZ = rState.finalRestPt.z;
          } else {
            const dist = rState.finalRestDistanceM || 6.0;
            targetX = spawnX + dist * Math.cos(targetAng);
            targetZ = spawnZ + dist * Math.sin(targetAng);
          }

          const totDist = Math.max(
            0.1,
            Math.hypot(targetX - spawnX, targetZ - spawnZ),
          );
          const launchRad = (rState.launchAngleDeg * Math.PI) / 180;
          const vUp = Math.min(5.5, spHoriz * Math.sin(launchRad));

          const tAir = Math.max(
            0.25,
            (vUp + Math.sqrt(vUp * vUp + 4 * 4.905 * Math.max(0.05, spawnY - 0.12))) / 9.81,
          );
          const dAir = Math.min(
            totDist * 0.65,
            Math.max(
              totDist * 0.35,
              spHoriz * Math.cos(launchRad) * tAir * 0.6,
            ),
          );
          const dSlide = Math.max(0, totDist - dAir);
          const tSlide =
            dSlide > 0.05
              ? Math.max(
                  0.35,
                  Math.min(2.0, (2 * dSlide) / Math.max(2.0, dAir / tAir)),
                )
              : 0.01;
          const tTotal = tAir + tSlide;

          const flatRotY = -targetAng + Math.PI / 2;
          const halfYaw = flatRotY / 2;
          const halfRoll = 1.40 / 2; // Vuelco lateral ~80° tendido sobre el pavimento
          const qGround = {
            x: Math.sin(halfRoll) * Math.cos(halfYaw),
            y: Math.cos(halfRoll) * Math.sin(halfYaw),
            z: -Math.sin(halfRoll) * Math.sin(halfYaw),
            w: Math.cos(halfRoll) * Math.cos(halfYaw),
          };

          rState.traj = {
            t0: mState.firstImpactTime,
            spawnX,
            spawnY,
            spawnZ,
            targetX,
            targetZ,
            totDist,
            vUp,
            tAir,
            dAir,
            dSlide,
            tSlide,
            tTotal,
            startRot: mRot,
            qGround,
          };
          rState.trajectoryComputed = true;
        }

        const dtImpact = t - rState.traj.t0;
        let rx, ry, rz, rqx, rqy, rqz, rqw, rSpd, rPhase;
        if (dtImpact < rState.traj.tAir) {
          const ua = dtImpact / rState.traj.tAir;
          rx =
            rState.traj.spawnX +
            (rState.traj.targetX - rState.traj.spawnX) *
              (rState.traj.dAir / rState.traj.totDist) *
              ua;
          rz =
            rState.traj.spawnZ +
            (rState.traj.targetZ - rState.traj.spawnZ) *
              (rState.traj.dAir / rState.traj.totDist) *
              ua;
          const gElevAir = getGroundElevAt(rx, rz, zones, sizeM);
          ry = Math.max(
            gElevAir + 0.24,
            rState.traj.spawnY +
              rState.traj.vUp * dtImpact -
              4.905 * dtImpact * dtImpact,
          );

          const slerpRes = slerpQuat(
            [
              rState.traj.startRot.x,
              rState.traj.startRot.y,
              rState.traj.startRot.z,
              rState.traj.startRot.w,
            ],
            [
              rState.traj.qGround.x,
              rState.traj.qGround.y,
              rState.traj.qGround.z,
              rState.traj.qGround.w,
            ],
            ua,
          );
          rqx = slerpRes[0];
          rqy = slerpRes[1];
          rqz = slerpRes[2];
          rqw = slerpRes[3];
          rSpd = Math.max(5.0, (rState.traj.totDist / rState.traj.tTotal) * 3.6);
          rPhase = "airborne";
        } else if (dtImpact < rState.traj.tTotal) {
          const us = (dtImpact - rState.traj.tAir) / rState.traj.tSlide;
          const ease = us * (2 - us);
          rx =
            rState.traj.spawnX +
            (rState.traj.targetX - rState.traj.spawnX) *
              ((rState.traj.dAir + rState.traj.dSlide * ease) /
                rState.traj.totDist);
          rz =
            rState.traj.spawnZ +
            (rState.traj.targetZ - rState.traj.spawnZ) *
              ((rState.traj.dAir + rState.traj.dSlide * ease) /
                rState.traj.totDist);
          const gElevSlide = getGroundElevAt(rx, rz, zones, sizeM);
          ry = gElevSlide + 0.24;
          rqx = rState.traj.qGround.x;
          rqy = rState.traj.qGround.y;
          rqz = rState.traj.qGround.z;
          rqw = rState.traj.qGround.w;
          rSpd = Math.max(
            0,
            (rState.traj.dSlide / rState.traj.tSlide) * 2 * (1 - us) * 3.6,
          );
          rPhase = "sliding";
        } else {
          rx = rState.traj.targetX;
          rz = rState.traj.targetZ;
          const gElevRest = getGroundElevAt(rx, rz, zones, sizeM);
          ry = gElevRest + 0.24;
          rqx = rState.traj.qGround.x;
          rqy = rState.traj.qGround.y;
          rqz = rState.traj.qGround.z;
          rqw = rState.traj.qGround.w;
          rSpd = 0;
          rPhase = "final_rest";
        }

        rState.frames.push({
          t,
          x: rx,
          y: ry,
          z: rz,
          qx: rqx,
          qy: rqy,
          qz: rqz,
          qw: rqw,
          vx: 0,
          vz: 0,
          speedKmh: rSpd,
          inContact: rPhase === "sliding" || rPhase === "final_rest",
          phase: rPhase,
        });
      } else if (mState) {
        // Antes del impacto: permanece en el sillín de la moto
        const mPos = mState.body.translation();
        const mRot = mState.body.rotation();
        const mVel = mState.body.linvel();
        const qx = mRot.x,
          qy = mRot.y,
          qz = mRot.z,
          qw = mRot.w;
        const vx0 = -0.12,
          vy0 = 0.82,
          vz0 = 0;
        const tx = 2 * (qy * vz0 - qz * vy0 + qw * vx0);
        const ty = 2 * (qz * vx0 - qx * vz0 + qw * vy0);
        const tz = 2 * (qx * vy0 - qy * vx0 + qw * vz0);
        const baseY = mPos.y - (mState.dims ? mState.dims.height / 2 : 0.55);
        const sx = mPos.x + (vx0 + qy * tz - qz * ty);
        const sy = baseY + (vy0 + qz * tx - qx * tz);
        const sz = mPos.z + (vz0 + qx * ty - qy * tx);

        rState.frames.push({
          t,
          x: sx,
          y: sy,
          z: sz,
          qx: mRot.x,
          qy: mRot.y,
          qz: mRot.z,
          qw: mRot.w,
          vx: mVel.x,
          vz: mVel.z,
          speedKmh: Math.hypot(mVel.x, mVel.z) * 3.6,
          inContact: false,
          phase: mState.phase,
        });
      }
    }
  }

  // Liberar recursos de WebAssembly
  world.free();
  eventQueue.free();

  const framesByObj = {};
  for (const [id, state] of vehStates.entries()) {
    framesByObj[id] = state.frames;
  }
  for (const [motoId, rState] of riderStates.entries()) {
    framesByObj[`${motoId}::rider`] = rState.frames;
  }

  return {
    frames: framesByObj,
    dt,
    duration: simDuration,
    maxTime: simDuration,
    firstImpact: firstImpactReport,
  };
}

/**
 * Consulta e interpola la pose de un objeto en el tiempo t a partir del búfer
 */
export function samplePhysicsPose(bakeData, objId, t) {
  if (!bakeData || !bakeData.frames || !bakeData.frames[objId]) return null;
  const frames = bakeData.frames[objId];
  if (!frames || !frames.length) return null;

  const dt = bakeData.dt || 1 / 120;
  const clampedT = Math.max(0, Math.min(bakeData.maxTime, t));
  const rawIdx = clampedT / dt;
  const idx0 = Math.floor(rawIdx);
  const idx1 = Math.min(frames.length - 1, idx0 + 1);

  const f0 = frames[Math.min(frames.length - 1, Math.max(0, idx0))];
  const f1 = frames[idx1];

  if (idx0 === idx1 || !f1) {
    return {
      x: f0.x,
      y: f0.y,
      z: f0.z,
      quaternion: [f0.qx, f0.qy, f0.qz, f0.qw],
      speedKmh: f0.speedKmh,
      inContact: f0.inContact,
      phase: f0.phase,
    };
  }

  const alpha = rawIdx - idx0;
  const x = f0.x + (f1.x - f0.x) * alpha, y = f0.y + (f1.y - f0.y) * alpha, z = f0.z + (f1.z - f0.z) * alpha;
  const quat = slerpQuat([f0.qx, f0.qy, f0.qz, f0.qw], [f1.qx, f1.qy, f1.qz, f1.qw], alpha);
  const speedKmh = f0.speedKmh + (f1.speedKmh - f0.speedKmh) * alpha;
  return { x, y, z, quaternion: quat, speedKmh, inContact: f0.inContact || f1.inContact, phase: alpha > 0.5 ? f1.phase : f0.phase };
}
