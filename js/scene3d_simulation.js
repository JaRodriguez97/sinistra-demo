/**
 * Sinistra 3D - Motor de Simulación Cinemática y Físico Forense 3D (Sim3D)
 * Reproducción de trayectorias, solidificación física de hitboxes (pushback),
 * desvío angular editable por el perito e iluminación de colisión.
 */

import * as THREE from "three";
import { bakePhysicsScenario, samplePhysicsPose } from "./scene3d_physics.js";
import { Scene3dRecorder } from "./scene3d_recorder.js";
import { updateMotoRider3D } from "./scene3d_moto.js";

export function createSim3D(ctx) {
  const {
    $,
    toast,
    getData,
    getSizeM,
    getSceneObjects,
    getSceneHitboxes,
    getSelectedObjectId,
  } = ctx;

  const Sim3D = {
    isPlaying: false,
    currentTime: 0.0,
    maxTime: 4.0,
    speed: 1.0,
    isReverse: false,
    lastTimestamp: null,
    originalStates: new Map(),
    bake: null,
    userManualDuration: null,

    rebake() {
      const data = getData();
      const sizeM = typeof getSizeM === "function" ? (getSizeM() || 100) : 100;
      if (!data || !Array.isArray(data.objects)) return null;

      const duration = this.calculateTotalDuration();

      this.bake = bakePhysicsScenario({
        objects: data.objects,
        zones: data.zones,
        sizeM,
        sampleObjectAtTime: this.sampleObjectAtTime.bind(this),
        maxDuration: duration,
      });

      if (this.bake) {
        this.maxTime = duration;
        this.updateTimelineUI();
      }
      return this.bake;
    },

    setManualDuration(sec) {
      const val = parseFloat(sec);
      const data = getData();
      if (!isNaN(val) && val > 0) {
        this.userManualDuration = val;
        this.maxTime = val;
        if (data) {
          if (!data.metadata) data.metadata = {};
          data.metadata.manualDuration = val;
        }
        try {
          sessionStorage.setItem("sinistra_scene3d_zones", JSON.stringify(data));
        } catch (e) {}
        try {
          localStorage.setItem("sinistra_manual_duration", String(val));
        } catch (e) {}
        try {
          const req = indexedDB.open("Sinistra3D_DB", 1);
          req.onsuccess = (e) => {
            const db = e.target.result;
            try {
              const tx = db.transaction("scene_store", "readwrite");
              tx.objectStore("scene_store").put(data, "active_scene_3d");
            } catch (err) {}
          };
        } catch (e) {}
        if (typeof toast === "function") {
          toast(`⏱️ Duración 3D fijada en ${val.toFixed(2)} s (Manual)`);
        }
      } else {
        this.userManualDuration = null;
        if (data && data.metadata) {
          delete data.metadata.manualDuration;
        }
        try {
          sessionStorage.setItem("sinistra_scene3d_zones", JSON.stringify(data));
        } catch (e) {}
        try {
          localStorage.removeItem("sinistra_manual_duration");
        } catch (e) {}
        try {
          const req = indexedDB.open("Sinistra3D_DB", 1);
          req.onsuccess = (e) => {
            const db = e.target.result;
            try {
              const tx = db.transaction("scene_store", "readwrite");
              tx.objectStore("scene_store").put(data, "active_scene_3d");
            } catch (err) {}
          };
        } catch (e) {}
        if (typeof toast === "function") {
          toast("⏱️ Duración 3D en modo AUTOMÁTICO (abarca todas las rutas)");
        }
      }
      this.rebake();
      if (this.currentTime > this.maxTime) {
        this.seek(this.maxTime);
      } else {
        this.seek(this.currentTime);
      }
      this.updateTimelineUI();
    },

    editDurationPrompt() {
      const current = this.userManualDuration
        ? this.userManualDuration.toFixed(2)
        : this.maxTime.toFixed(2);
      const isAuto = !this.userManualDuration;
      const resp = prompt(
        `Duración de la escena 3D en segundos:\n(Modo actual: ${isAuto ? "AUTOMÁTICO" : "MANUAL"})\n\n• Ingresa un número (ej: 8.5) para fijar el tiempo manualmente.\n• Deja vacío o ingresa 0 para cálculo AUTOMÁTICO (abarca todas las rutas sin cortes).`,
        current,
      );
      if (resp === null) return;
      const val = parseFloat(resp.replace(",", "."));
      if (isNaN(val) || val <= 0) {
        this.setManualDuration(null);
      } else {
        this.setManualDuration(val);
      }
    },

    calculateTotalDuration() {
      const data = getData();
      if (!data) return 3.0;

      // 1. Respetar duración manual fijada por el perito si existe
      if (this.userManualDuration && this.userManualDuration > 0) {
        this.maxTime = this.userManualDuration;
        this.updateTimelineUI();
        return this.maxTime;
      }
      let storedDur = (data.metadata && Number(data.metadata.manualDuration) > 0) ? Number(data.metadata.manualDuration) : null;
      if (!storedDur) {
        try {
          const l = localStorage.getItem("sinistra_manual_duration");
          if (l && Number(l) > 0) storedDur = Number(l);
        } catch (e) {}
      }
      if (storedDur && storedDur > 0) {
        this.userManualDuration = storedDur;
        this.maxTime = storedDur;
        if (data.metadata) data.metadata.manualDuration = storedDur;
        this.updateTimelineUI();
        return this.maxTime;
      }

      // 2. Cálculo automático idéntico a 2D
      const sizeM = typeof getSizeM === "function" ? (getSizeM() || 100) : 100;
      let maxT = 0;
      if (typeof KinematicsEngine !== "undefined" && KinematicsEngine.calculateTotalDuration) {
        maxT = KinematicsEngine.calculateTotalDuration(data.objects, sizeM);
      } else if (Array.isArray(data.objects)) {
        data.objects.forEach((obj) => {
          if (
            obj.kinematics &&
            Array.isArray(obj.kinematics.trajectoryPoints) &&
            obj.kinematics.trajectoryPoints.length >= 2
          ) {
            const dur = this.getObjectDuration(obj);
            if (dur > maxT) maxT = dur;
          }
        });
      }
      this.maxTime = Math.max(1.0, maxT || 3.0);
      this.updateTimelineUI();
      return this.maxTime;
    },

    resolvePt(p, sizeM) {
      if (!p) return { x: 0, z: 0 };
      const sz = Number(sizeM) || (typeof getSizeM === "function" ? getSizeM() : 100) || 100;
      const x =
        p.x !== undefined && !isNaN(p.x)
          ? Number(p.x)
          : p.normX !== undefined && !isNaN(p.normX)
            ? (Number(p.normX) - 0.5) * sz
            : 0;
      const z =
        p.z !== undefined && !isNaN(p.z)
          ? Number(p.z)
          : p.normY !== undefined && !isNaN(p.normY)
            ? (Number(p.normY) - 0.5) * sz
            : 0;
      return { x, z };
    },

    getObjectDuration(obj) {
      const sizeM = typeof getSizeM === "function" ? (getSizeM() || 100) : 100;
      if (typeof KinematicsEngine !== "undefined" && KinematicsEngine.getObjectDuration) {
        return KinematicsEngine.getObjectDuration(obj, sizeM);
      }
      if (!obj.kinematics) return 0;
      const nominalSpeed =
        Number(obj.kinematics.speedKmh) > 0
          ? Number(obj.kinematics.speedKmh)
          : 50;

      const pts = obj.kinematics.trajectoryPoints;
      if (!pts || pts.length < 2) return 0;
      let totalT = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const wait =
          p1.type === "final_rest" || p1.waitTimeSec > 0
            ? Math.max(0, parseFloat(p1.waitTimeSec) || 0)
            : 0;
        totalT += wait;

        const c1 = this.resolvePt(p1, sizeM);
        const c2 = this.resolvePt(p2, sizeM);
        const d = Math.hypot(c2.x - c1.x, c2.z - c1.z);
        const v1 =
          (p1.speedKmh !== undefined && p1.speedKmh > 0
            ? p1.speedKmh
            : nominalSpeed) / 3.6;
        const v2 =
          (p2.type === "final_rest" && i + 1 === pts.length - 1
            ? 0
            : p2.speedKmh !== undefined && p2.speedKmh > 0
              ? p2.speedKmh
              : nominalSpeed) / 3.6;
        const vAvg = Math.max(0.5, (v1 + v2) / 2);
        totalT += d / vAvg;
      }
      const lastP = pts[pts.length - 1];
      if (lastP && (lastP.type === "final_rest" || lastP.waitTimeSec > 0)) {
        totalT += Math.max(0, parseFloat(lastP.waitTimeSec) || 0);
      }
      return totalT;
    },

    sampleObjectAtTime(obj, t) {
      const sizeM = typeof getSizeM === "function" ? (getSizeM() || 100) : 100;
      if (typeof KinematicsEngine !== "undefined" && KinematicsEngine.sampleObjectAtTime) {
        return KinematicsEngine.sampleObjectAtTime(obj, t, sizeM);
      }
      const pts = obj.kinematics?.trajectoryPoints;
      if (!pts || pts.length < 2) return null;

      const nominalSpeed =
        Number(obj.kinematics.speedKmh) > 0
          ? Number(obj.kinematics.speedKmh)
          : 50;

      const segments = [];
      let cumT = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const c1 = this.resolvePt(p1, sizeM);
        const c2 = this.resolvePt(p2, sizeM);

        const wait =
          p1.type === "final_rest" || p1.waitTimeSec > 0
            ? Math.max(0, parseFloat(p1.waitTimeSec) || 0)
            : 0;
        if (wait > 0) {
          segments.push({
            isWait: true,
            p1,
            p2,
            c1,
            c2,
            startT: cumT,
            endT: cumT + wait,
          });
          cumT += wait;
        }

        const d = Math.hypot(c2.x - c1.x, c2.z - c1.z);
        const v1 =
          (p1.speedKmh !== undefined && p1.speedKmh > 0
            ? p1.speedKmh
            : nominalSpeed) / 3.6;
        const v2 =
          (p2.type === "final_rest" && i + 1 === pts.length - 1
            ? 0
            : p2.speedKmh !== undefined && p2.speedKmh > 0
              ? p2.speedKmh
              : nominalSpeed) / 3.6;
        const vAvg = Math.max(0.1, (v1 + v2) / 2);
        const dt = d / vAvg;
        const a = (v2 * v2 - v1 * v1) / (2 * Math.max(0.01, d));
        segments.push({
          isWait: false,
          p1,
          p2,
          c1,
          c2,
          d,
          v1,
          v2,
          vAvg,
          dt,
          a,
          startT: cumT,
          endT: cumT + dt,
        });
        cumT += dt;
      }

      const lastP = pts[pts.length - 1];
      const lastWait =
        lastP && (lastP.type === "final_rest" || lastP.waitTimeSec > 0)
          ? Math.max(0, parseFloat(lastP.waitTimeSec) || 0)
          : 0;
      if (lastWait > 0) {
        const lastC = this.resolvePt(lastP, sizeM);
        segments.push({
          isWait: true,
          p1: lastP,
          p2: lastP,
          c1: lastC,
          c2: lastC,
          startT: cumT,
          endT: cumT + lastWait,
        });
        cumT += lastWait;
      }

      if (t <= 0) {
        const s0 = segments[0];
        const rad = Math.atan2(s0.c2.z - s0.c1.z, s0.c2.x - s0.c1.x);
        return {
          x: s0.c1.x,
          z: s0.c1.z,
          rotationDeg: (rad * 180) / Math.PI,
          currentSpeedKmh: s0.isWait ? 0 : s0.v1 * 3.6,
          phase: s0.p1.type || "start",
          progress: 0,
        };
      }

      if (t >= cumT) {
        const lastSeg = segments[segments.length - 1];
        const rad = Math.atan2(
          lastSeg.c2.z - lastSeg.c1.z,
          lastSeg.c2.x - lastSeg.c1.x,
        );
        return {
          x: lastSeg.c2.x,
          z: lastSeg.c2.z,
          rotationDeg: (rad * 180) / Math.PI,
          currentSpeedKmh: lastSeg.isWait ? 0 : lastSeg.v2 * 3.6,
          phase: lastSeg.p2.type || "final_rest",
          progress: 1,
        };
      }

      for (const seg of segments) {
        if (t >= seg.startT && t <= seg.endT) {
          if (seg.isWait) {
            const rad = Math.atan2(seg.c2.z - seg.c1.z, seg.c2.x - seg.c1.x);
            return {
              x: seg.c1.x,
              z: seg.c1.z,
              rotationDeg: (rad * 180) / Math.PI,
              currentSpeedKmh: 0,
              phase: "final_rest",
              progress: cumT > 0 ? t / cumT : 0,
            };
          }

          const tau = t - seg.startT;
          let dist = seg.v1 * tau + 0.5 * seg.a * tau * tau;
          dist = Math.max(0, Math.min(seg.d, dist));
          const alpha = seg.d > 0 ? dist / seg.d : 0;

          const x = seg.c1.x + alpha * (seg.c2.x - seg.c1.x);
          const z = seg.c1.z + alpha * (seg.c2.z - seg.c1.z);
          const rad = Math.atan2(seg.c2.z - seg.c1.z, seg.c2.x - seg.c1.x);
          const curV = Math.max(0, seg.v1 + seg.a * tau);

          return {
            x,
            z,
            rotationDeg: (rad * 180) / Math.PI,
            currentSpeedKmh: curV * 3.6,
            phase: alpha > 0.85 ? seg.p2.type : seg.p1.type,
            progress: cumT > 0 ? t / cumT : 0,
          };
        }
      }
      return null;
    },

    seek(timeSec) {
      if (!this.bake) {
        this.rebake();
      }
      this.currentTime = Math.max(0, Math.min(this.maxTime, timeSec));
      const data = getData();
      const sizeM = getSizeM();
      const sceneObjects3D = getSceneObjects();
      const sceneHitboxes3D = getSceneHitboxes();
      if (!data || !Array.isArray(data.objects)) return;

      // 1. Muestreo de cinemática y física para cada objeto
      data.objects.forEach((obj) => {
        const sObj = sceneObjects3D[obj.id];
        if (!sObj || !sObj.group) return;

        if (!this.originalStates.has(obj.id)) {
          this.originalStates.set(obj.id, {
            x: sObj.group.position.x,
            z: sObj.group.position.z,
            rotationY: sObj.group.rotation.y,
          });
        }

        const physPose =
          this.bake && this.bake.frames && this.bake.frames[obj.id]
            ? samplePhysicsPose(this.bake, obj.id, this.currentTime)
            : null;

        if (physPose) {
          // Pose gobernada por Rapier Physics 3D
          sObj.group.position.x = physPose.x;
          const objH =
            (obj.dimensions && obj.dimensions.heightM) ||
            (obj.type === "moto" || obj.type === "motorcycle" ? 1.1 : 1.45);
          const vehHalfH = objH / 2;
          sObj.group.position.y =
            physPose.y !== undefined
              ? Math.max(obj.baseElevationMeters || 0, physPose.y - vehHalfH)
              : obj.baseElevationMeters || 0;
          sObj.group.position.z = physPose.z;
          sObj.group.quaternion.set(
            physPose.quaternion[0],
            physPose.quaternion[1],
            physPose.quaternion[2],
            physPose.quaternion[3],
          );

          obj._simCurrentSpeed = physPose.speedKmh;
          obj._simPhase = physPose.phase;
          obj._simX = physPose.x;
          obj._simZ = physPose.z;
          obj.normX = physPose.x / sizeM + 0.5;
          obj.normY = physPose.z / sizeM + 0.5;

          const hb = sceneHitboxes3D[obj.id];
          if (hb && hb.wireframe) {
            hb.wireframe.position.copy(sObj.group.position);
            hb.wireframe.quaternion.copy(sObj.group.quaternion);
            if (hb.material && hb.material.color) {
              hb.material.color.setHex(
                physPose.inContact ? 0xef4444 : 0x10b981,
              );
            }
          }
        } else if (
          obj.kinematics &&
          Array.isArray(obj.kinematics.trajectoryPoints) &&
          obj.kinematics.trajectoryPoints.length >= 2
        ) {
          // Cinemática estándar para objetos no vehiculares con trayectoria (e.g. peatones)
          const sample = this.sampleObjectAtTime(obj, this.currentTime);
          if (sample) {
            sObj.group.position.x = sample.x;
            sObj.group.position.z = sample.z;
            sObj.group.rotation.y = -THREE.MathUtils.degToRad(
              sample.rotationDeg,
            );
            obj._simCurrentSpeed = sample.currentSpeedKmh;
            obj._simPhase = sample.phase;
            obj._simX = sample.x;
            obj._simZ = sample.z;
            obj.normX = sample.x / sizeM + 0.5;
            obj.normY = sample.z / sizeM + 0.5;
            obj.rotationDeg = sample.rotationDeg;
          }
          const hb = sceneHitboxes3D[obj.id];
          if (hb && hb.wireframe) {
            hb.wireframe.position.copy(sObj.group.position);
            hb.wireframe.quaternion.copy(sObj.group.quaternion);
          }
        } else {
          // Objetos estáticos
          const orig = this.originalStates.get(obj.id);
          const px = orig
            ? orig.x
            : obj.positionMeters
              ? obj.positionMeters.x
              : 0;
          const pz = orig
            ? orig.z
            : obj.positionMeters
              ? obj.positionMeters.z
              : 0;
          sObj.group.position.x = px;
          sObj.group.position.z = pz;
          sObj.group.rotation.y = orig
            ? orig.rotationY
            : -THREE.MathUtils.degToRad(obj.rotationDeg || 0);

          obj._simX = px;
          obj._simZ = pz;
          obj.normX = px / sizeM + 0.5;
          obj.normY = pz / sizeM + 0.5;

          const hb = sceneHitboxes3D[obj.id];
          if (hb && hb.wireframe) {
            hb.wireframe.position.copy(sObj.group.position);
            hb.wireframe.quaternion.copy(sObj.group.quaternion);
            if (hb.material && hb.material.color) {
              hb.material.color.setHex(0x10b981);
            }
          }
        }

        // Actualizar cinemática, O1 (giro ruedas), O2 (lean angle) y rider si es motocicleta
        if (obj.catalogId === "moto" || sObj.riderGroup) {
          let yawRate = 0;
          if (
            obj.kinematics &&
            Array.isArray(obj.kinematics.trajectoryPoints) &&
            obj.kinematics.trajectoryPoints.length >= 2
          ) {
            const pNow = this.sampleObjectAtTime(obj, this.currentTime);
            const pNext = this.sampleObjectAtTime(
              obj,
              this.currentTime + 0.05,
            );
            if (pNow && pNext) {
              let dYaw = pNext.rotationDeg - pNow.rotationDeg;
              while (dYaw > 180) dYaw -= 360;
              while (dYaw < -180) dYaw += 360;
              yawRate = (dYaw * Math.PI) / 180 / 0.05;
            }
          }
          updateMotoRider3D({
            sObj,
            obj,
            t: this.currentTime,
            speedKmh: obj._simCurrentSpeed,
            physPose,
            bake: this.bake,
            dt: 1 / 60,
            yawRateRadSec: yawRate,
          });
        }
      });

      this.updateDynamicSkidMarks();

      // 2. Banner HUD forense de impacto basado en Rapier (situado en el área superior central)
      const stBadge = $("simCollisionStatus");
      const stText = $("simCollisionText");
      if (this.bake && this.bake.firstImpact) {
        if (this.currentTime >= this.bake.firstImpact.time) {
          if (stBadge) {
            stBadge.style.display = "inline-flex";
            if (this.bake.firstImpact.isPOI) {
              stBadge.style.background = "rgba(6, 78, 59, 0.85)";
              stBadge.style.borderColor = "rgba(16, 185, 129, 0.75)";
              stBadge.style.color = "#a7f3d0";
            } else {
              stBadge.style.background = "rgba(127, 29, 29, 0.88)";
              stBadge.style.borderColor = "rgba(239, 68, 68, 0.8)";
              stBadge.style.color = "#fecaca";
            }
          }
          if (stText) {
            stText.textContent = this.bake.firstImpact.isPOI
              ? `💥 Impacto verificado en POI (t = ${this.bake.firstImpact.time.toFixed(2)}s)`
              : `⚠️ Colisión registrada (t = ${this.bake.firstImpact.time.toFixed(2)}s): ${this.bake.firstImpact.objA.name} ↔ ${this.bake.firstImpact.objB.name}`;
          }
        } else {
          if (stBadge) stBadge.style.display = "none";
        }
      } else {
        if (stBadge) stBadge.style.display = "none";
      }

      this.updateTimelineUI();
    },

    updateDynamicSkidMarks() {
      const data = getData();
      const sceneObjects3D = getSceneObjects();
      if (!data || !Array.isArray(data.objects)) return;
      data.objects.forEach((skid) => {
        const sSkid = sceneObjects3D[skid.id];
        if (!sSkid || !sSkid.group) return;

        if (
          (skid.catalogId === "huella_frenado" ||
            skid.category === "evidencia") &&
          skid.triggerOnPass
        ) {
          let maxFrac = 0;
          data.objects.forEach((v) => {
            if (
              v.id !== skid.id &&
              v._simPhase &&
              (v._simPhase === "brake_start" ||
                v._simPhase === "impact_point" ||
                v._simPhase === "final_rest")
            ) {
              const dM = Math.hypot(
                (v.positionMeters ? v.positionMeters.x : 0) -
                  (skid.positionMeters ? skid.positionMeters.x : 0),
                (v.positionMeters ? v.positionMeters.z : 0) -
                  (skid.positionMeters ? skid.positionMeters.z : 0),
              );
              if (dM < 16) {
                const frac = Math.max(0.1, 1 - dM / 16);
                if (frac > maxFrac) maxFrac = frac;
              } else if (
                v._simPhase === "impact_point" ||
                v._simPhase === "final_rest"
              ) {
                maxFrac = 1.0;
              }
            }
          });

          if (this.currentTime <= 0.05) {
            sSkid.group.visible = false;
          } else if (maxFrac > 0) {
            sSkid.group.visible = true;
            sSkid.group.scale.set(Math.max(0.05, maxFrac), 1, 1);
          } else {
            sSkid.group.visible = false;
          }
        }
      });
    },

    togglePlay() {
      if (this.isPlaying) this.pause();
      else this.play();
    },

    stepForward(delta = 0.05) {
      if (this.isPlaying) this.pause();
      this.calculateTotalDuration();
      this.seek(Math.min(this.maxTime, this.currentTime + delta));
    },

    stepBackward(delta = 0.05) {
      if (this.isPlaying) this.pause();
      this.calculateTotalDuration();
      this.seek(Math.max(0, this.currentTime - delta));
    },

    toggleReverse() {
      if (this.isPlaying && this.isReverse) this.pause();
      else this.playReverse();
    },

    playReverse() {
      if (this.isPlaying && !this.isReverse) this.pause();
      this.calculateTotalDuration();
      if (this.currentTime <= 0.02) this.seek(this.maxTime);
      this.isPlaying = true;
      this.isReverse = true;
      this.lastTimestamp = performance.now();
      this.updateButtonsUI();
    },

    play() {
      if (this.isPlaying && !this.isReverse) return;
      if (this.isPlaying && this.isReverse) this.pause();
      this.calculateTotalDuration();
      if (this.currentTime >= this.maxTime - 0.05) this.seek(0);
      this.isPlaying = true;
      this.isReverse = false;
      this.lastTimestamp = performance.now();
      this.updateButtonsUI();
    },

    pause() {
      this.isPlaying = false;
      this.isReverse = false;
      this.lastTimestamp = null;
      this.updateButtonsUI();
    },

    updateButtonsUI() {
      const playIcon = $("simPlayIcon");
      const playText = $("simPlayText");
      const btnPlay = $("btnSimPlay");
      const btnRev = $("btnSimReverse");
      if (playIcon) playIcon.textContent = this.isPlaying ? "⏸️" : "▶️";
      if (playText)
        playText.textContent = this.isPlaying ? "Pausar" : "Reproducir";
      if (btnRev)
        btnRev.classList.toggle("active", this.isPlaying && this.isReverse);
      if (btnPlay) {
        btnPlay.classList.toggle("play", !this.isPlaying);
        btnPlay.classList.toggle("pause", this.isPlaying);
      }

      const pIcon = $("panelSimPlayIcon");
      const pText = $("panelSimPlayText");
      const pBtnPlay = $("panelBtnSimPlay");
      const pBtnRev = $("panelBtnSimReverse");
      if (pIcon) pIcon.textContent = this.isPlaying ? "⏸️" : "▶️";
      if (pText) pText.textContent = this.isPlaying ? "Pausar" : "Reproducir";
      if (pBtnRev)
        pBtnRev.classList.toggle("active", this.isPlaying && this.isReverse);
      if (pBtnPlay) {
        pBtnPlay.classList.toggle("primary", !this.isPlaying);
        pBtnPlay.classList.toggle("warning", this.isPlaying);
      }
    },

    reset() {
      this.pause();
      const sceneObjects3D = getSceneObjects();
      const data = getData();
      this.originalStates.forEach((st, id) => {
        const sObj = sceneObjects3D[id];
        if (sObj && sObj.group) {
          sObj.group.position.x = st.x;
          sObj.group.position.z = st.z;
          sObj.group.rotation.y = st.rotationY;
          if (sObj.motoBody) sObj.motoBody.rotation.set(0, 0, 0);
          if (
            sObj.rider &&
            typeof sObj.rider.setRagdollFactor === "function"
          ) {
            sObj.rider.setRagdollFactor(0);
          }
        }
        if (data && Array.isArray(data.objects)) {
          const obj = data.objects.find((o) => o.id === id);
          if (obj) {
            obj._simCurrentSpeed = obj.kinematics ? obj.kinematics.speedKmh : 0;
            obj._simPhase = "start";
          }
        }
      });
      this.seek(0);
      toast("⏮️ Simulación 3D en tiempo cero (t = 0.000s)");
    },

    update(now) {
      if (!this.isPlaying) return;
      if (!this.lastTimestamp) this.lastTimestamp = now;
      const dt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;

      if (this.isReverse) {
        const nextT = this.currentTime - dt * this.speed;
        if (nextT <= 0) {
          this.seek(0);
          this.pause();
          toast("⏮️ Inicio de la reconstrucción 3D.");
          return;
        }
        this.seek(nextT);
      } else {
        const nextT = this.currentTime + dt * this.speed;
        if (nextT >= this.maxTime) {
          this.seek(this.maxTime);
          this.pause();
          toast("🏁 Reconstrucción 3D completada.");
          return;
        }
        this.seek(nextT);
      }
    },

    updateTimelineUI() {
      const curTimeEl = $("simCurrentTime");
      const totTimeEl = $("simTotalTime");
      const sliderEl = $("simTimeSlider");
      const pTimeBadge = $("panelSimTimeBadge");

      if (curTimeEl) curTimeEl.textContent = `${this.currentTime.toFixed(3)} s`;
      if (totTimeEl) {
        const tag = this.userManualDuration ? " (Manual)" : " (Auto)";
        totTimeEl.textContent = `${this.maxTime.toFixed(3)} s${tag}`;
      }
      if (pTimeBadge)
        pTimeBadge.textContent = `${this.currentTime.toFixed(3)} s / ${this.maxTime.toFixed(2)} s`;
      if (sliderEl && this.maxTime > 0) {
        sliderEl.value = (this.currentTime / this.maxTime) * 100;
      }

      const badge = $("simLiveTelemetry");
      const data = getData();
      const selectedObjectId = getSelectedObjectId();
      if (badge && data && Array.isArray(data.objects)) {
        const selObj = selectedObjectId
          ? data.objects.find(
              (o) => o.id === selectedObjectId && o.category === "vehiculo",
            )
          : data.objects.find((o) => o.category === "vehiculo" && o.kinematics);
        if (selObj && selObj._simCurrentSpeed !== undefined) {
          badge.style.display = "flex";
          const vEl = $("simTelemetryVehicle");
          const sEl = $("simTelemetrySpeed");
          if (vEl) vEl.textContent = selObj.name || "Vehículo";
          if (sEl)
            sEl.textContent = `${Math.round(selObj._simCurrentSpeed)} km/h`;
        } else {
          badge.style.display = "none";
        }
      }
    },
  };

  return Sim3D;
}

export function bindSimControls(Sim3D, $, renderer, toast) {
  const recorder = new Scene3dRecorder();

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const btnRecordPlay = $("btnSimRecordPlay");
  const btnStopRecord = $("btnSimStopRecord");
  const badgeRec = $("recStatusBadge");
  const txtRecTimer = $("recTimerText");

  if (btnRecordPlay) {
    btnRecordPlay.addEventListener("click", () => {
      const canvas =
        renderer && renderer.domElement
          ? renderer.domElement
          : document.querySelector("#viewport canvas") ||
            document.querySelector("canvas");

      if (!canvas) {
        if (typeof toast === "function")
          toast("Error: Canvas 3D no encontrado.");
        return;
      }

      const ok = recorder.start(canvas, {
        maxDurationSec: 300,
        onTick: ({ elapsedSec }) => {
          if (txtRecTimer) {
            txtRecTimer.textContent = `${formatTimer(elapsedSec)} / 05:00`;
          }
        },
        onStop: ({ filename, durationSec }) => {
          if (btnRecordPlay) btnRecordPlay.style.display = "flex";
          if (btnStopRecord) btnStopRecord.style.display = "none";
          if (badgeRec) badgeRec.style.display = "none";
          if (typeof toast === "function") {
            toast(
              `🎬 Vídeo guardado: ${filename} (${durationSec.toFixed(1)}s)`,
              4000,
            );
          }
        },
      });

      if (ok) {
        if (btnRecordPlay) btnRecordPlay.style.display = "none";
        if (btnStopRecord) btnStopRecord.style.display = "flex";
        if (badgeRec) {
          badgeRec.style.display = "flex";
          if (txtRecTimer) txtRecTimer.textContent = "00:00 / 05:00";
        }
        if (!Sim3D.isPlaying) {
          Sim3D.play();
        }
        if (typeof toast === "function") {
          toast("🔴 Grabación iniciada (Máx 5 min / MP4 H.264)");
        }
      }
    });
  }

  if (btnStopRecord) {
    btnStopRecord.addEventListener("click", () => {
      recorder.stop();
    });
  }

  if ($("btnSimPlay"))
    $("btnSimPlay").addEventListener("click", () => Sim3D.togglePlay());
  if ($("btnSimReset"))
    $("btnSimReset").addEventListener("click", () => Sim3D.reset());
  if ($("btnSimStepBack"))
    $("btnSimStepBack").addEventListener("click", () =>
      Sim3D.stepBackward(0.05),
    );
  if ($("btnSimReverse"))
    $("btnSimReverse").addEventListener("click", () => Sim3D.toggleReverse());
  if ($("btnSimStepForward"))
    $("btnSimStepForward").addEventListener("click", () =>
      Sim3D.stepForward(0.05),
    );

  if ($("simTimeSlider")) {
    $("simTimeSlider").addEventListener("input", (e) => {
      const frac = parseFloat(e.target.value) / 100;
      Sim3D.seek(frac * Sim3D.maxTime);
    });
  }

  document.querySelectorAll(".sim-speed-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".sim-speed-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      Sim3D.speed = parseFloat(btn.getAttribute("data-speed")) || 1.0;
    });
  });

  if ($("panelBtnSimPlay"))
    $("panelBtnSimPlay").addEventListener("click", () => Sim3D.togglePlay());
  if ($("panelBtnSimReset"))
    $("panelBtnSimReset").addEventListener("click", () => Sim3D.reset());
  if ($("panelBtnSimStepBack"))
    $("panelBtnSimStepBack").addEventListener("click", () =>
      Sim3D.stepBackward(0.05),
    );
  if ($("panelBtnSimReverse"))
    $("panelBtnSimReverse").addEventListener("click", () =>
      Sim3D.toggleReverse(),
    );
  if ($("panelBtnSimStepForward"))
    $("panelBtnSimStepForward").addEventListener("click", () =>
      Sim3D.stepForward(0.05),
    );

  if ($("btnEditSimDuration")) {
    $("btnEditSimDuration").addEventListener("click", () =>
      Sim3D.editDurationPrompt(),
    );
  }
  if ($("simTotalTime")) {
    $("simTotalTime").addEventListener("click", () =>
      Sim3D.editDurationPrompt(),
    );
  }
}
