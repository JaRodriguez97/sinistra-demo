/**
 * scene3d_moto.js
 * Modelo 3D detallado de motocicleta urbana (125-200cc) y conductor articulado independiente.
 * Soporta cinemática, inclinación en curvas (lean angle O2), giro de ruedas (O1),
 * vuelco post-impacto y desacople físico del conductor (Opción A).
 */

import * as THREE from "three";
import { samplePhysicsPose } from "./scene3d_physics.js";

/**
 * Construye la malla 3D completa y realista de la motocicleta
 * @param {Object} obj Objeto de datos del vehículo
 * @returns {Object} { group, mats, wheelFront, wheelRear, riderGroup, rider }
 */
export function createMotorcycle3D(obj) {
  const group = new THREE.Group();
  group.name = `moto_${obj.id}`;

  const colHex = new THREE.Color(obj.color || "#0284c7").getHex();
  const mats = [];

  // Materiales de alta fidelidad
  const paintMat = new THREE.MeshStandardMaterial({
    color: colHex,
    metalness: 0.65,
    roughness: 0.25,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    metalness: 0.05,
    roughness: 0.88,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.85,
    roughness: 0.25,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    metalness: 0.95,
    roughness: 0.12,
  });
  const engineMat = new THREE.MeshStandardMaterial({
    color: 0x27272a,
    metalness: 0.6,
    roughness: 0.45,
  });
  const darkPlasticMat = new THREE.MeshStandardMaterial({
    color: 0x09090b,
    metalness: 0.1,
    roughness: 0.6,
  });
  const seatMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.8,
    metalness: 0.05,
  });
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  const stoplightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const mirrorMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.95,
    roughness: 0.05,
  });

  mats.push(
    paintMat,
    tireMat,
    rimMat,
    chromeMat,
    engineMat,
    darkPlasticMat,
    seatMat,
    headlightMat,
    stoplightMat,
    mirrorMat,
  );

  const wheelRadius = 0.3; // Rin 17" (~0.60m diam exterior)
  const wheelbaseHalf = 0.665; // Distancia entre ejes 1.33m (±0.665m)

  // Subgrupo interno de la moto para vuelco e inclinación local
  const motoBody = new THREE.Group();
  motoBody.name = "motoBody";
  group.add(motoBody);

  // ==================== 1. RUEDA DELANTERA ====================
  const wheelFront = new THREE.Group();
  wheelFront.name = "wheelFront";
  wheelFront.position.set(wheelbaseHalf, wheelRadius, 0);

  // Neumático delantero (ancho 0.09m -> tubo radio 0.042m)
  const frontTireGeom = new THREE.TorusGeometry(0.258, 0.042, 16, 32);
  const frontTire = new THREE.Mesh(frontTireGeom, tireMat);
  wheelFront.add(frontTire);

  // Rin delantero
  const frontRimGeom = new THREE.CylinderGeometry(0.24, 0.24, 0.04, 24);
  frontRimGeom.rotateX(Math.PI / 2);
  const frontRim = new THREE.Mesh(frontRimGeom, rimMat);
  wheelFront.add(frontRim);

  // 5 Rayos de aleación
  const spokeGeom = new THREE.BoxGeometry(0.018, 0.23, 0.015);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(spokeGeom, rimMat);
    spoke.rotation.z = (i * (Math.PI * 2)) / 5;
    wheelFront.add(spoke);
  }

  // Disco de freno delantero perforado (lado derecho Z = -0.035)
  const discGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.008, 20);
  discGeom.rotateX(Math.PI / 2);
  const disc = new THREE.Mesh(discGeom, chromeMat);
  disc.position.z = -0.035;
  wheelFront.add(disc);

  motoBody.add(wheelFront);

  // ==================== 2. RUEDA TRASERA ====================
  const wheelRear = new THREE.Group();
  wheelRear.name = "wheelRear";
  wheelRear.position.set(-wheelbaseHalf, wheelRadius, 0);

  // Neumático trasero (más ancho 0.12m -> tubo radio 0.055m)
  const rearTireGeom = new THREE.TorusGeometry(0.245, 0.055, 16, 32);
  const rearTire = new THREE.Mesh(rearTireGeom, tireMat);
  wheelRear.add(rearTire);

  // Rin trasero
  const rearRimGeom = new THREE.CylinderGeometry(0.23, 0.23, 0.05, 24);
  rearRimGeom.rotateX(Math.PI / 2);
  const rearRim = new THREE.Mesh(rearRimGeom, rimMat);
  wheelRear.add(rearRim);

  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(spokeGeom, rimMat);
    spoke.rotation.z = (i * (Math.PI * 2)) / 5;
    wheelRear.add(spoke);
  }

  // Corona trasera (lado izquierdo Z = +0.038)
  const sprocketGeom = new THREE.CylinderGeometry(0.09, 0.09, 0.008, 16);
  sprocketGeom.rotateX(Math.PI / 2);
  const sprocket = new THREE.Mesh(sprocketGeom, darkPlasticMat);
  sprocket.position.z = 0.038;
  wheelRear.add(sprocket);

  motoBody.add(wheelRear);

  // ==================== 3. TREN DELANTERO Y DIRECCIÓN ====================
  // Horquilla telescópica (2 barras cromadas conectando tija con eje delantero)
  const forkLen = 0.77;
  const forkGeom = new THREE.CylinderGeometry(0.018, 0.018, forkLen, 12);
  const forkL = new THREE.Mesh(forkGeom, chromeMat);
  const forkR = new THREE.Mesh(forkGeom, chromeMat);

  // Inclinación correcta: tija arriba-atrás, rueda abajo-adelante (+rakeRad)
  const rakeRad = (22 * Math.PI) / 180;
  forkL.rotation.z = rakeRad;
  forkR.rotation.z = rakeRad;

  // Centro de la horquilla conectando eje delantero (0.665, 0.30) con tija (0.38, 1.02)
  const forkMidX = 0.522;
  const forkMidY = 0.66;
  forkL.position.set(forkMidX, forkMidY, 0.065);
  forkR.position.set(forkMidX, forkMidY, -0.065);
  motoBody.add(forkL, forkR);

  // Guardabarros delantero
  const frontFenderGeom = new THREE.BoxGeometry(0.32, 0.04, 0.11);
  const frontFender = new THREE.Mesh(frontFenderGeom, paintMat);
  frontFender.rotation.z = rakeRad;
  frontFender.position.set(0.60, 0.44, 0);
  motoBody.add(frontFender);

  // Tija superior y manubrio
  const handlebarGeom = new THREE.CylinderGeometry(0.012, 0.012, 0.72, 12);
  handlebarGeom.rotateX(Math.PI / 2); // Eje a lo largo de Z (horizontal)
  const handlebar = new THREE.Mesh(handlebarGeom, darkPlasticMat);
  handlebar.position.set(0.38, 1.02, 0);
  motoBody.add(handlebar);

  // Puños negros en extremos
  const gripGeom = new THREE.CylinderGeometry(0.018, 0.018, 0.12, 12);
  gripGeom.rotateX(Math.PI / 2);
  const gripL = new THREE.Mesh(gripGeom, darkPlasticMat);
  gripL.position.set(0.38, 1.02, 0.3);
  const gripR = new THREE.Mesh(gripGeom, darkPlasticMat);
  gripR.position.set(0.38, 1.02, -0.3);
  motoBody.add(gripL, gripR);

  // Espejos retrovisores
  const mirrorPostGeom = new THREE.CylinderGeometry(0.005, 0.005, 0.12, 8);
  const mirrorHeadGeom = new THREE.BoxGeometry(0.08, 0.05, 0.02);

  const mPostL = new THREE.Mesh(mirrorPostGeom, darkPlasticMat);
  mPostL.position.set(0.38, 1.1, 0.28);
  mPostL.rotation.z = 0.3;
  const mHeadL = new THREE.Mesh(mirrorHeadGeom, mirrorMat);
  mHeadL.position.set(0.38, 1.16, 0.32);

  const mPostR = new THREE.Mesh(mirrorPostGeom, darkPlasticMat);
  mPostR.position.set(0.38, 1.1, -0.28);
  mPostR.rotation.z = 0.3;
  const mHeadR = new THREE.Mesh(mirrorHeadGeom, mirrorMat);
  mHeadR.position.set(0.38, 1.16, -0.32);

  motoBody.add(mPostL, mHeadL, mPostR, mHeadR);

  // Farola frontal
  const headlightHousingGeom = new THREE.CylinderGeometry(0.08, 0.07, 0.1, 16);
  headlightHousingGeom.rotateZ(Math.PI / 2);
  const headlightHousing = new THREE.Mesh(headlightHousingGeom, darkPlasticMat);
  headlightHousing.position.set(0.49, 0.88, 0);

  const headlightLensGeom = new THREE.CircleGeometry(0.075, 16);
  headlightLensGeom.rotateY(Math.PI / 2);
  const headlightLens = new THREE.Mesh(headlightLensGeom, headlightMat);
  headlightLens.position.set(0.542, 0.88, 0);

  motoBody.add(headlightHousing, headlightLens);

  // ==================== 4. CHASIS, MOTOR Y ESCAPE ====================
  // Chasis tubular
  const frameGeom = new THREE.BoxGeometry(0.55, 0.3, 0.18);
  const frame = new THREE.Mesh(frameGeom, darkPlasticMat);
  frame.position.set(0.05, 0.65, 0);
  motoBody.add(frame);

  // Bloque del motor
  const engineBlockGeom = new THREE.BoxGeometry(0.38, 0.26, 0.24);
  const engineBlock = new THREE.Mesh(engineBlockGeom, engineMat);
  engineBlock.position.set(0.02, 0.42, 0);
  motoBody.add(engineBlock);

  // Aletas de refrigeración del cilindro
  const finGeom = new THREE.BoxGeometry(0.22, 0.012, 0.26);
  for (let f = 0; f < 4; f++) {
    const fin = new THREE.Mesh(finGeom, darkPlasticMat);
    fin.position.set(0.08, 0.44 + f * 0.035, 0);
    motoBody.add(fin);
  }

  // Tapa de cárter derecha
  const crankcaseGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.03, 16);
  crankcaseGeom.rotateX(Math.PI / 2);
  const crankcase = new THREE.Mesh(crankcaseGeom, chromeMat);
  crankcase.position.set(0.0, 0.36, -0.135);
  motoBody.add(crankcase);

  // Tubo de escape y silenciador (lado derecho Z = -0.16)
  const headerPipeGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.45, 10);
  headerPipeGeom.rotateZ(-0.4);
  const headerPipe = new THREE.Mesh(headerPipeGeom, chromeMat);
  headerPipe.position.set(0.18, 0.32, -0.14);

  const mufflerGeom = new THREE.CylinderGeometry(0.045, 0.038, 0.52, 16);
  mufflerGeom.rotateZ(1.35); // Inclinado hacia arriba y atrás
  const muffler = new THREE.Mesh(mufflerGeom, chromeMat);
  muffler.position.set(-0.35, 0.38, -0.17);

  motoBody.add(headerPipe, muffler);

  // Basculante trasero (conecta chasis con eje de rueda trasera)
  const swingarmGeom = new THREE.BoxGeometry(0.55, 0.045, 0.035);
  const swingarmL = new THREE.Mesh(swingarmGeom, darkPlasticMat);
  swingarmL.position.set(-0.38, 0.32, 0.09);
  const swingarmR = new THREE.Mesh(swingarmGeom, darkPlasticMat);
  swingarmR.position.set(-0.38, 0.32, -0.09);

  // Monoamortiguador central
  const shockGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.28, 10);
  shockGeom.rotateZ(0.5);
  const shock = new THREE.Mesh(shockGeom, stoplightMat); // Resorte rojo llamativo
  shock.position.set(-0.18, 0.46, 0);

  motoBody.add(swingarmL, swingarmR, shock);

  // Estribos (posapiés)
  const pegGeom = new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8);
  pegGeom.rotateX(Math.PI / 2);
  const pegL = new THREE.Mesh(pegGeom, darkPlasticMat);
  pegL.position.set(-0.06, 0.32, 0.18);
  const pegR = new THREE.Mesh(pegGeom, darkPlasticMat);
  pegR.position.set(-0.06, 0.32, -0.18);
  motoBody.add(pegL, pegR);

  // ==================== 5. TANQUE, ASIENTO Y COLÍN ====================
  // Tanque de combustible con curvatura (forma de gota)
  const tankGeom = new THREE.SphereGeometry(0.24, 16, 12);
  tankGeom.scale(1.25, 0.75, 0.65);
  const tank = new THREE.Mesh(tankGeom, paintMat);
  tank.position.set(0.18, 0.86, 0);
  motoBody.add(tank);

  // Asiento tapizado en cuero negro (rebaje para conductor y plaza trasera)
  const seatGeom = new THREE.BoxGeometry(0.58, 0.1, 0.22);
  const seat = new THREE.Mesh(seatGeom, seatMat);
  seat.position.set(-0.2, 0.81, 0);
  seat.rotation.z = -0.05;
  motoBody.add(seat);

  // Colín trasero afilado
  const tailGeom = new THREE.ConeGeometry(0.14, 0.4, 4);
  tailGeom.rotateZ(Math.PI / 2);
  tailGeom.rotateX(Math.PI / 4);
  const tail = new THREE.Mesh(tailGeom, paintMat);
  tail.position.set(-0.52, 0.85, 0);
  motoBody.add(tail);

  // Luz de stop trasera roja
  const stopGeom = new THREE.BoxGeometry(0.025, 0.05, 0.12);
  const stopLight = new THREE.Mesh(stopGeom, stoplightMat);
  stopLight.position.set(-0.66, 0.84, 0);
  motoBody.add(stopLight);

  // Porta-placa trasero inclinado
  const plateHolderGeom = new THREE.BoxGeometry(0.08, 0.12, 0.015);
  plateHolderGeom.rotateZ(-0.4);
  const plateHolder = new THREE.Mesh(plateHolderGeom, darkPlasticMat);
  plateHolder.position.set(-0.68, 0.72, 0);
  motoBody.add(plateHolder);

  // ==================== 6. CONDUCTOR INDEPENDIENTE ====================
  const { riderGroup, rider } = createRider3D(obj);

  return {
    group,
    mats,
    motoBody,
    wheelFront,
    wheelRear,
    riderGroup,
    rider,
  };
}

/**
 * Crea el conductor articulado independiente con traje y casco de alto contraste
 * @param {Object} obj Objeto de la moto
 * @returns {Object} { riderGroup, rider }
 */
export function createRider3D(obj) {
  const riderGroup = new THREE.Group();
  riderGroup.name = `rider_${obj.id}`;

  // Paleta con alto contraste garantizado
  // Casco blanco perla reflectivo con visor ahumado oscuro
  const helmetMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    metalness: 0.2,
    roughness: 0.15,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x09090b,
    metalness: 0.95,
    roughness: 0.05,
  });
  // Chaqueta azul marino oscuro con franja reflectiva de alta visibilidad
  const jacketMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.75,
    metalness: 0.1,
  });
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  // Pantalón y guantes oscuros
  const pantsMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.8,
    metalness: 0.05,
  });
  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.5,
    metalness: 0.2,
  });

  // Raíz del conductor: Pelvis (origen local en el centro de masa del conductor)
  const pelvis = new THREE.Group();
  pelvis.name = "pelvis";
  pelvis.position.set(0, 0, 0);
  riderGroup.add(pelvis);

  // Cadera
  const hipGeom = new THREE.BoxGeometry(0.24, 0.14, 0.22);
  const hip = new THREE.Mesh(hipGeom, pantsMat);
  pelvis.add(hip);

  // Torso (inclinado ~18° hacia adelante en postura montado)
  const spine = new THREE.Group();
  spine.name = "spine";
  spine.position.set(0, 0.07, 0);
  spine.rotation.z = -0.30;
  pelvis.add(spine);

  const torsoGeom = new THREE.BoxGeometry(0.28, 0.38, 0.32);
  const torso = new THREE.Mesh(torsoGeom, jacketMat);
  torso.position.set(0, 0.19, 0);
  spine.add(torso);

  // Franja reflectiva horizontal en el torso
  const stripeGeom = new THREE.BoxGeometry(0.285, 0.04, 0.325);
  const stripe = new THREE.Mesh(stripeGeom, stripeMat);
  stripe.position.set(0, 0.22, 0);
  spine.add(stripe);

  // Cuello y Cabeza con Casco
  const neck = new THREE.Group();
  neck.position.set(0, 0.38, 0);
  spine.add(neck);

  const helmetGeom = new THREE.SphereGeometry(0.135, 18, 14);
  helmetGeom.scale(1.05, 1.15, 1.0);
  const helmet = new THREE.Mesh(helmetGeom, helmetMat);
  helmet.position.set(0.03, 0.14, 0);
  neck.add(helmet);

  // Visor oscuro ahumado al frente (+X)
  const visorGeom = new THREE.BoxGeometry(0.08, 0.07, 0.18);
  const visor = new THREE.Mesh(visorGeom, visorMat);
  visor.position.set(0.14, 0.13, 0);
  neck.add(visor);

  // Brazos y Manos (proyectándose adelante hacia los puños del manillar)
  const armGeom = new THREE.CylinderGeometry(0.04, 0.035, 0.26, 10);
  const forearmGeom = new THREE.CylinderGeometry(0.035, 0.03, 0.24, 10);
  const gloveGeom = new THREE.SphereGeometry(0.038, 8, 8);

  // Brazo Izquierdo (+Z)
  const shoulderL = new THREE.Group();
  shoulderL.position.set(0.06, 0.30, 0.18);
  shoulderL.rotation.z = 0.65; // Proyectado adelante hacia el manubrio
  shoulderL.rotation.y = 0.28;
  spine.add(shoulderL);

  const armL = new THREE.Mesh(armGeom, jacketMat);
  armL.position.set(0, -0.12, 0);
  shoulderL.add(armL);

  const elbowL = new THREE.Group();
  elbowL.position.set(0, -0.24, 0);
  elbowL.rotation.z = 1.10; // Flexionado ~90° al frente hacia el manubrio
  elbowL.rotation.y = -0.10;
  shoulderL.add(elbowL);

  const forearmL = new THREE.Mesh(forearmGeom, jacketMat);
  forearmL.position.set(0, -0.11, 0);
  const gloveL = new THREE.Mesh(gloveGeom, leatherMat);
  gloveL.position.set(0, -0.23, 0);
  elbowL.add(forearmL, gloveL);

  // Brazo Derecho (-Z)
  const shoulderR = new THREE.Group();
  shoulderR.position.set(0.06, 0.30, -0.18);
  shoulderR.rotation.z = 0.65;
  shoulderR.rotation.y = -0.28;
  spine.add(shoulderR);

  const armR = new THREE.Mesh(armGeom, jacketMat);
  armR.position.set(0, -0.12, 0);
  shoulderR.add(armR);

  const elbowR = new THREE.Group();
  elbowR.position.set(0, -0.24, 0);
  elbowR.rotation.z = 1.10; // Flexionado ~90° al frente hacia el manubrio
  elbowR.rotation.y = 0.10;
  shoulderR.add(elbowR);

  const forearmR = new THREE.Mesh(forearmGeom, jacketMat);
  forearmR.position.set(0, -0.11, 0);
  const gloveR = new THREE.Mesh(gloveGeom, leatherMat);
  gloveR.position.set(0, -0.23, 0);
  elbowR.add(forearmR, gloveR);

  // Piernas y Botas (flexionadas hacia los estribos)
  const thighGeom = new THREE.CylinderGeometry(0.065, 0.05, 0.34, 10);
  const calfGeom = new THREE.CylinderGeometry(0.05, 0.042, 0.32, 10);
  const bootGeom = new THREE.BoxGeometry(0.18, 0.09, 0.08);

  // Pierna Izquierda (+Z)
  const hipJointL = new THREE.Group();
  hipJointL.position.set(0.06, -0.04, 0.12);
  hipJointL.rotation.z = 0.85; // Muslo hacia adelante y abajo (+X, -Y) abrazando el tanque
  hipJointL.rotation.y = 0.22;
  pelvis.add(hipJointL);

  const thighL = new THREE.Mesh(thighGeom, pantsMat);
  thighL.position.set(0, -0.16, 0);
  hipJointL.add(thighL);

  const kneeL = new THREE.Group();
  kneeL.position.set(0, -0.32, 0);
  kneeL.rotation.z = -1.55; // Rodilla flexionada hacia atrás hacia los estribos
  hipJointL.add(kneeL);

  const calfL = new THREE.Mesh(calfGeom, pantsMat);
  calfL.position.set(0, -0.15, 0);
  const bootL = new THREE.Mesh(bootGeom, leatherMat);
  bootL.position.set(0.06, -0.30, 0);
  bootL.rotation.z = 0.70; // Pie hacia adelante en el estribo
  kneeL.add(calfL, bootL);

  // Pierna Derecha (-Z)
  const hipJointR = new THREE.Group();
  hipJointR.position.set(0.06, -0.04, -0.12);
  hipJointR.rotation.z = 0.85;
  hipJointR.rotation.y = -0.22;
  pelvis.add(hipJointR);

  const thighR = new THREE.Mesh(thighGeom, pantsMat);
  thighR.position.set(0, -0.16, 0);
  hipJointR.add(thighR);

  const kneeR = new THREE.Group();
  kneeR.position.set(0, -0.32, 0);
  kneeR.rotation.z = -1.55;
  hipJointR.add(kneeR);

  const calfR = new THREE.Mesh(calfGeom, pantsMat);
  calfR.position.set(0, -0.15, 0);
  const bootR = new THREE.Mesh(bootGeom, leatherMat);
  bootR.position.set(0.06, -0.30, 0);
  bootR.rotation.z = 0.70;
  kneeR.add(calfR, bootR);

  const rider = {
    root: riderGroup,
    pelvis,
    spine,
    neck,
    shoulderL,
    shoulderR,
    elbowL,
    elbowR,
    hipJointL,
    hipJointR,
    kneeL,
    kneeR,
    pose: "mounted",
    /**
     * Alterna o interpola la postura entre montado y caído/en vuelo
     * @param {number} t01 Progreso de transición (0 = montado, 1 = caído)
     */
    setRagdollFactor(t01) {
      const f = Math.max(0, Math.min(1, t01));
      // Transición progresiva a extremidades extendidas
      spine.rotation.z = THREE.MathUtils.lerp(-0.30, 0.10, f);
      shoulderL.rotation.z = THREE.MathUtils.lerp(0.65, -0.80, f);
      shoulderL.rotation.y = THREE.MathUtils.lerp(0.28, 0.55, f);
      shoulderR.rotation.z = THREE.MathUtils.lerp(0.65, -0.80, f);
      shoulderR.rotation.y = THREE.MathUtils.lerp(-0.28, -0.55, f);
      elbowL.rotation.z = THREE.MathUtils.lerp(1.10, 0.25, f);
      elbowR.rotation.z = THREE.MathUtils.lerp(1.10, 0.25, f);
      hipJointL.rotation.z = THREE.MathUtils.lerp(0.85, 0.20, f);
      hipJointR.rotation.z = THREE.MathUtils.lerp(0.85, 0.20, f);
      kneeL.rotation.z = THREE.MathUtils.lerp(-1.55, -0.35, f);
      kneeR.rotation.z = THREE.MathUtils.lerp(-1.55, -0.35, f);
    },
  };

  return { riderGroup, rider };
}

/**
 * Actualiza la motocicleta y su conductor fotograma a fotograma:
 * Giro de ruedas (O1), Inclinación en curvas (O2), vuelco post-impacto y desacople físico (Opción A).
 */
export function updateMotoRider3D({
  sObj,
  obj,
  t,
  speedKmh,
  physPose,
  bake,
  dt = 1 / 60,
  yawRateRadSec = 0,
}) {
  if (!sObj || !sObj.group) return;

  const vMps =
    ((speedKmh !== undefined ? speedKmh : obj._simCurrentSpeed) || 0) / 3.6;
  const wheelRadius = 0.3;

  // ==================== O1. GIRO DE RUEDAS ====================
  if (sObj.wheelFront && sObj.wheelRear) {
    const dAngle = -(vMps * dt) / wheelRadius;
    sObj.wheelFront.rotation.z += dAngle;
    sObj.wheelRear.rotation.z += dAngle;
  }

  // Comprobar si hubo impacto para esta moto
  const firstImpactT =
    bake && bake.firstImpact && bake.firstImpact.time !== undefined
      ? bake.firstImpact.time
      : null;
  const isPostImpact = firstImpactT !== null && t >= firstImpactT;
  const timeSinceImpact = isPostImpact ? t - firstImpactT : 0;

  // ==================== O2. INCLINACIÓN EN CURVA (LEAN ANGLE) ====================
  // φ = atan(v * ω / g)
  const gAcc = 9.81;
  let leanAngleRad = 0;
  if (!isPostImpact && Math.abs(yawRateRadSec) > 0.01 && vMps > 1.0) {
    const rawLean = Math.atan((vMps * yawRateRadSec) / gAcc);
    // Limitar a máximo 45 grados de inclinación física
    leanAngleRad = Math.max(-0.78, Math.min(0.78, rawLean));
  }

  // ==================== VUELCO VISUAL POST-IMPACTO ====================
  // Tras el impacto, la moto vuelca de lado hasta ~80° en 0.6s
  let fallRollRad = 0;
  if (isPostImpact) {
    const fallProgress = Math.min(1.0, timeSinceImpact / 0.6);
    // Suavizado cuadrático
    const ease = fallProgress * (2 - fallProgress);
    fallRollRad = ease * 1.4; // ~80 grados
  }

  if (sObj.motoBody) {
    sObj.motoBody.rotation.x = isPostImpact ? fallRollRad : leanAngleRad;
    sObj.motoBody.position.y = isPostImpact
      ? Math.sin(Math.abs(fallRollRad)) * 0.19
      : 0;
  }

  // ==================== CONDUCTOR INDEPENDIENTE (OPCIÓN A) ====================
  const rGroup = sObj.riderGroup;
  const riderCtrl = sObj.rider;
  const riderConfig = obj.rider || { enabled: true };

  if (!rGroup) return;

  if (riderConfig.enabled === false) {
    rGroup.visible = false;
    return;
  }
  rGroup.visible = true;

  if (!isPostImpact) {
    // ANTES DEL IMPACTO: va montado exactamente sobre el sillín de la moto (-0.12, 0.82, 0)
    const saddleOffset = new THREE.Vector3(-0.12, 0.82, 0).applyQuaternion(
      sObj.group.quaternion,
    );
    rGroup.position.copy(sObj.group.position).add(saddleOffset);
    rGroup.quaternion.copy(sObj.group.quaternion);

    // Si la moto se inclina en curva, el conductor se inclina solidario
    if (riderCtrl && typeof riderCtrl.setRagdollFactor === "function") {
      riderCtrl.setRagdollFactor(0); // Postura montado impecable
    }
  } else {
    // DESPUÉS DEL IMPACTO: trayectoria física independiente en Rapier
    const riderPhysKey = `${obj.id}::rider`;
    const rPhys =
      bake &&
      bake.frames &&
      bake.frames[riderPhysKey] &&
      typeof samplePhysicsPose === "function"
        ? samplePhysicsPose(bake, riderPhysKey, t)
        : null;

    if (rPhys) {
      const baseMinY =
        ((obj.rider && obj.rider.baseElevationMeters !== undefined)
          ? obj.rider.baseElevationMeters
          : (obj.baseElevationMeters || 0)) + 0.24;
      rGroup.position.set(rPhys.x, Math.max(rPhys.y, baseMinY), rPhys.z);
      rGroup.quaternion.set(
        rPhys.quaternion[0],
        rPhys.quaternion[1],
        rPhys.quaternion[2],
        rPhys.quaternion[3],
      );
      if (riderCtrl && typeof riderCtrl.setRagdollFactor === "function") {
        const ragdollT = Math.min(1.0, timeSinceImpact / 0.35);
        riderCtrl.setRagdollFactor(ragdollT);
      }
    } else {
      // Si aún no está horneado el cuerpo físico, aplicar desplazamiento inercial de respaldo
      if (riderCtrl && typeof riderCtrl.setRagdollFactor === "function") {
        riderCtrl.setRagdollFactor(Math.min(1.0, timeSinceImpact / 0.3));
      }
    }
  }
}
