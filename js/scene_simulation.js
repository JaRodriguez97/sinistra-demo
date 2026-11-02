/**
 * scene_simulation.js
 * Motor de Simulación Cinemática y Física Forense 2D
 * Control de línea de tiempo, scrubber milimétrico, velocidades y resolución física de colisiones.
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Simulation = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const Simulation = {
    isPlaying: false,
    currentTime: 0.0,
    maxTime: 4.0,
    speed: 1.0,
    animId: null,
    lastTimestamp: null,
    originalStates: new Map(),
    isReverse: false,
    userManualDuration: null,

    calculateTotalDuration() {
      if (typeof state === "undefined" || !state.objects) return 3.0;

      // 1. Respetar duración manual fijada por el perito si existe
      if (this.userManualDuration && this.userManualDuration > 0) {
        this.maxTime = this.userManualDuration;
        this.updateTimelineUI();
        return this.maxTime;
      }
      let storedDur =
        state.metadata && Number(state.metadata.manualDuration) > 0
          ? Number(state.metadata.manualDuration)
          : null;
      if (!storedDur) {
        try {
          const l = localStorage.getItem("sinistra_manual_duration");
          if (l && Number(l) > 0) storedDur = Number(l);
        } catch (e) {}
      }
      if (storedDur && storedDur > 0) {
        this.userManualDuration = storedDur;
        this.maxTime = storedDur;
        if (state.metadata) state.metadata.manualDuration = storedDur;
        this.updateTimelineUI();
        return this.maxTime;
      }

      // 2. Cálculo automático: abarcar el 100% de la trayectoria de TODOS los vehículos
      let maxT = 0;
      const size = (state.metadata && state.metadata.sizeMeters) || 100;
      state.objects.forEach((obj) => {
        if (
          obj.kinematics &&
          Array.isArray(obj.kinematics.trajectoryPoints) &&
          obj.kinematics.trajectoryPoints.length >= 2
        ) {
          const dur = this.getObjectDuration(obj, size);
          if (dur > maxT) maxT = dur;
        }
      });
      this.maxTime = Math.max(3.0, maxT);
      this.updateTimelineUI();
      return this.maxTime;
    },

    setManualDuration(sec) {
      const val = parseFloat(sec);
      if (!isNaN(val) && val > 0) {
        this.userManualDuration = val;
        this.maxTime = val;
        try {
          localStorage.setItem("sinistra_manual_duration", String(val));
        } catch (e) {}
        if (typeof state !== "undefined") {
          if (!state.metadata) state.metadata = {};
          state.metadata.manualDuration = val;
          if (typeof scheduleSave === "function") scheduleSave();
        }
        if (typeof showToast === "function") {
          showToast(
            `⏱️ Duración de escena fijada en ${val.toFixed(2)} s (Manual)`,
          );
        }
      } else {
        this.userManualDuration = null;
        try {
          localStorage.removeItem("sinistra_manual_duration");
        } catch (e) {}
        if (typeof state !== "undefined" && state.metadata) {
          delete state.metadata.manualDuration;
          if (typeof scheduleSave === "function") scheduleSave();
        }
        if (typeof showToast === "function") {
          showToast(
            "⏱️ Duración de escena en modo AUTOMÁTICO (abarca todas las rutas)",
          );
        }
      }
      this.calculateTotalDuration();
      this.seek(this.currentTime);
    },

    editDurationPrompt() {
      const current = this.userManualDuration
        ? this.userManualDuration.toFixed(2)
        : this.maxTime.toFixed(2);
      const isAuto = !this.userManualDuration;
      const resp = prompt(
        `Duración total de la escena en segundos:\n(Modo actual: ${isAuto ? "AUTOMÁTICO" : "MANUAL"})\n\n• Ingresa un número (ej: 8.5) para fijar el tiempo manualmente.\n• Deja vacío o ingresa 0 para cálculo AUTOMÁTICO (abarca todas las rutas sin cortes).`,
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

    getObjectDuration(obj, sizeMeters = 100) {
      if (
        typeof KinematicsEngine !== "undefined" &&
        KinematicsEngine.getObjectDuration
      ) {
        return KinematicsEngine.getObjectDuration(obj, sizeMeters);
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

        const d = Math.hypot(
          (p2.normX - p1.normX) * sizeMeters,
          (p2.normY - p1.normY) * sizeMeters,
        );
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
        totalT += d / vAvg;
      }
      const lastP = pts[pts.length - 1];
      if (lastP && (lastP.type === "final_rest" || lastP.waitTimeSec > 0)) {
        totalT += Math.max(0, parseFloat(lastP.waitTimeSec) || 0);
      }
      return totalT;
    },

    sampleObjectAtTime(obj, t, sizeMeters = 100) {
      if (
        typeof KinematicsEngine !== "undefined" &&
        KinematicsEngine.sampleObjectAtTime
      ) {
        return KinematicsEngine.sampleObjectAtTime(obj, t, sizeMeters);
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
        const wait =
          p1.type === "final_rest" || p1.waitTimeSec > 0
            ? Math.max(0, parseFloat(p1.waitTimeSec) || 0)
            : 0;
        if (wait > 0) {
          segments.push({
            isWait: true,
            p1,
            p2,
            startT: cumT,
            endT: cumT + wait,
          });
          cumT += wait;
        }

        const d = Math.hypot(
          (p2.normX - p1.normX) * sizeMeters,
          (p2.normY - p1.normY) * sizeMeters,
        );
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
        segments.push({
          isWait: true,
          p1: lastP,
          p2: lastP,
          startT: cumT,
          endT: cumT + lastWait,
        });
        cumT += lastWait;
      }

      if (t <= 0) {
        const s0 = segments[0];
        const rad = Math.atan2(
          s0.p2.normY - s0.p1.normY,
          s0.p2.normX - s0.p1.normX,
        );
        return {
          normX: s0.p1.normX,
          normY: s0.p1.normY,
          rotationDeg: (rad * 180) / Math.PI,
          currentSpeedKmh: s0.isWait ? 0 : s0.v1 * 3.6,
          phase: s0.p1.type || "start",
          progress: 0,
        };
      }

      if (t >= cumT) {
        const lastSeg = segments[segments.length - 1];
        const rad = Math.atan2(
          lastSeg.p2.normY - lastSeg.p1.normY,
          lastSeg.p2.normX - lastSeg.p1.normX,
        );
        return {
          normX: lastSeg.p2.normX,
          normY: lastSeg.p2.normY,
          rotationDeg: (rad * 180) / Math.PI,
          currentSpeedKmh: lastSeg.isWait ? 0 : lastSeg.v2 * 3.6,
          phase: lastSeg.p2.type || "final_rest",
          progress: 1,
        };
      }

      for (const seg of segments) {
        if (t >= seg.startT && t <= seg.endT) {
          if (seg.isWait) {
            const rad = Math.atan2(
              seg.p2.normY - seg.p1.normY,
              seg.p2.normX - seg.p1.normX,
            );
            return {
              normX: seg.p1.normX,
              normY: seg.p1.normY,
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

          const normX = seg.p1.normX + alpha * (seg.p2.normX - seg.p1.normX);
          const normY = seg.p1.normY + alpha * (seg.p2.normY - seg.p1.normY);
          const rad = Math.atan2(
            seg.p2.normY - seg.p1.normY,
            seg.p2.normX - seg.p1.normX,
          );
          const curV = Math.max(0, seg.v1 + seg.a * tau);

          return {
            normX,
            normY,
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
      this.currentTime = Math.max(0, Math.min(this.maxTime, timeSec));
      const size = (state.metadata && state.metadata.sizeMeters) || 100;

      // 1. Asignar estados base de muestra
      state.objects.forEach((obj) => {
        if (!this.originalStates.has(obj.id)) {
          this.originalStates.set(obj.id, {
            normX: obj.normX,
            normY: obj.normY,
            rotationDeg: obj.rotationDeg,
          });
        }

        if (
          obj.kinematics &&
          Array.isArray(obj.kinematics.trajectoryPoints) &&
          obj.kinematics.trajectoryPoints.length >= 2
        ) {
          const sample = this.sampleObjectAtTime(obj, this.currentTime, size);
          if (sample) {
            obj.normX = sample.normX;
            obj.normY = sample.normY;
            obj.rotationDeg = sample.rotationDeg;
            obj._simCurrentSpeed = sample.currentSpeedKmh;
            obj._simPhase = sample.phase;
            obj._simX = (sample.normX - 0.5) * size;
            obj._simZ = (sample.normY - 0.5) * size;
            obj._simRotDeg = sample.rotationDeg;
          }
        } else {
          const orig = this.originalStates.get(obj.id);
          obj.normX = orig ? orig.normX : obj.normX;
          obj.normY = orig ? orig.normY : obj.normY;
          obj.rotationDeg = orig ? orig.rotationDeg : obj.rotationDeg || 0;
          obj._simX = (obj.normX - 0.5) * size;
          obj._simZ = (obj.normY - 0.5) * size;
          obj._simRotDeg = obj.rotationDeg;
          obj._simCurrentSpeed = 0;
          obj._simPhase = "static";
        }
      });

      this.updateDynamicSkidMarks(size);

      // 2. Verificación e Inspección Forense de Colisiones (CollisionEngine)
      if (typeof CollisionEngine !== "undefined") {
        const colReport = CollisionEngine.inspectSceneCollisions(
          state.objects,
          this.currentTime,
          size,
        );

        state.objects.forEach((o) => {
          o._isColliding = false;
        });

        if (colReport.hasCollisions) {
          colReport.collisions.forEach((col) => {
            const oA = state.objects.find((o) => o.id === col.objA.id);
            const oB = state.objects.find((o) => o.id === col.objB.id);
            if (oA) oA._isColliding = true;
            if (oB) oB._isColliding = true;

            // SOLIDIFICACIÓN FÍSICA: Separar los cuerpos para impedir penetración visual
            if (col.deflection) {
              if (oA && col.deflection.pushbackA) {
                oA.normX += col.deflection.pushbackA.x / size;
                oA.normY += col.deflection.pushbackA.z / size;
                oA._simX = (oA.normX - 0.5) * size;
                oA._simZ = (oA.normY - 0.5) * size;

                // Desviación angular editable por usuario o física
                const devA =
                  oA.deviationAngleDeg !== undefined &&
                  oA.deviationAngleDeg !== 0
                    ? oA.deviationAngleDeg
                    : (col.deflection.objectA &&
                        col.deflection.objectA.deviationDeg) ||
                      18;
                oA.rotationDeg = (oA.rotationDeg || 0) + devA;
                oA._simRotDeg = oA.rotationDeg;
                oA._simCurrentSpeed = col.deflection.objectA.postImpactSpeedKmh;
              }

              if (oB && col.deflection.pushbackB) {
                oB.normX += col.deflection.pushbackB.x / size;
                oB.normY += col.deflection.pushbackB.z / size;
                oB._simX = (oB.normX - 0.5) * size;
                oB._simZ = (oB.normY - 0.5) * size;

                const devB =
                  oB.deviationAngleDeg !== undefined &&
                  oB.deviationAngleDeg !== 0
                    ? oB.deviationAngleDeg
                    : (col.deflection.objectB &&
                        col.deflection.objectB.deviationDeg) ||
                      -18;
                oB.rotationDeg = (oB.rotationDeg || 0) + devB;
                oB._simRotDeg = oB.rotationDeg;
                oB._simCurrentSpeed = col.deflection.objectB.postImpactSpeedKmh;
              }
            }
          });

          if (colReport.hasUnplannedCollision) {
            if (ui.simCollisionStatus) {
              ui.simCollisionStatus.style.display = "inline-flex";
              ui.simCollisionStatus.style.background =
                "rgba(127, 29, 29, 0.88)";
              ui.simCollisionStatus.style.borderColor =
                "rgba(239, 68, 68, 0.8)";
              ui.simCollisionStatus.style.color = "#fecaca";
              if (ui.simCollisionText) {
                const col =
                  colReport.collisions.find((c) => !c.isPOI) ||
                  colReport.collisions[0];
                ui.simCollisionText.textContent = `⚠️ Colisión registrada: ${col.objA.name} ↔ ${col.objB.name}`;
              }
            }
          } else if (colReport.hasPOIImpact) {
            if (ui.simCollisionStatus) {
              ui.simCollisionStatus.style.display = "inline-flex";
              ui.simCollisionStatus.style.background = "rgba(6, 78, 59, 0.85)";
              ui.simCollisionStatus.style.borderColor =
                "rgba(16, 185, 129, 0.75)";
              ui.simCollisionStatus.style.color = "#a7f3d0";
              if (ui.simCollisionText) {
                ui.simCollisionText.textContent =
                  "💥 Impacto verificado en POI";
              }
            }
          }
        } else {
          if (ui.simCollisionStatus) {
            ui.simCollisionStatus.style.display = "none";
          }
        }
      }

      this.updateTimelineUI();
      if (typeof repaintScene === "function") repaintScene();
    },

    updateDynamicSkidMarks(size) {
      if (!state.objects) return;
      state.objects.forEach((skid) => {
        if (
          (skid.catalogId === "huella_frenado" ||
            skid.category === "evidencia") &&
          skid.triggerOnPass
        ) {
          let maxFrac = 0;
          state.objects.forEach((v) => {
            if (
              v.id !== skid.id &&
              v._simPhase &&
              (v._simPhase === "brake_start" ||
                v._simPhase === "impact_point" ||
                v._simPhase === "final_rest")
            ) {
              const dM = Math.hypot(
                (v.normX - skid.normX) * size,
                (v.normY - skid.normY) * size,
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
          skid._simFraction = maxFrac;
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
      const nextT = Math.min(this.maxTime, this.currentTime + delta);
      this.seek(nextT);
    },

    stepBackward(delta = 0.05) {
      if (this.isPlaying) this.pause();
      this.calculateTotalDuration();
      const nextT = Math.max(0, this.currentTime - delta);
      this.seek(nextT);
    },

    toggleReverse() {
      if (this.isPlaying && this.isReverse) this.pause();
      else this.playReverse();
    },

    playReverse() {
      if (this.isPlaying && !this.isReverse) this.pause();
      this.calculateTotalDuration();
      if (this.currentTime <= 0.02) {
        this.seek(this.maxTime);
      }
      this.isPlaying = true;
      this.isReverse = true;
      this.lastTimestamp = performance.now();
      if (ui.simPlayIcon) ui.simPlayIcon.textContent = "⏸️";
      if (ui.simPlayText) ui.simPlayText.textContent = "Pausar";
      if (ui.btnSimReverse) ui.btnSimReverse.classList.add("active");
      if (ui.btnSimPlay) {
        ui.btnSimPlay.classList.remove("play");
        ui.btnSimPlay.classList.add("pause");
      }

      const loop = (ts) => {
        if (!this.isPlaying || !this.isReverse) return;
        const dt = (ts - this.lastTimestamp) / 1000;
        this.lastTimestamp = ts;

        const nextT = this.currentTime - dt * this.speed;
        if (nextT <= 0) {
          this.seek(0);
          this.pause();
          showToast("⏮️ Inicio de la reconstrucción alcanzado.");
          return;
        }

        this.seek(nextT);
        this.animId = requestAnimationFrame(loop);
      };

      this.animId = requestAnimationFrame(loop);
    },

    play() {
      if (this.isPlaying && !this.isReverse) return;
      if (this.isPlaying && this.isReverse) this.pause();
      this.calculateTotalDuration();
      if (this.currentTime >= this.maxTime - 0.05) {
        this.seek(0);
      }
      this.isPlaying = true;
      this.isReverse = false;
      this.lastTimestamp = performance.now();
      if (ui.simPlayIcon) ui.simPlayIcon.textContent = "⏸️";
      if (ui.simPlayText) ui.simPlayText.textContent = "Pausar";
      if (ui.btnSimReverse) ui.btnSimReverse.classList.remove("active");
      if (ui.btnSimPlay) {
        ui.btnSimPlay.classList.remove("play");
        ui.btnSimPlay.classList.add("pause");
      }

      const loop = (ts) => {
        if (!this.isPlaying || this.isReverse) return;
        const dt = (ts - this.lastTimestamp) / 1000;
        this.lastTimestamp = ts;

        const nextT = this.currentTime + dt * this.speed;
        if (nextT >= this.maxTime) {
          this.seek(this.maxTime);
          this.pause();
          showToast("🏁 Reconstrucción completada.");
          return;
        }

        this.seek(nextT);
        this.animId = requestAnimationFrame(loop);
      };

      this.animId = requestAnimationFrame(loop);
    },

    pause() {
      this.isPlaying = false;
      this.isReverse = false;
      if (this.animId) cancelAnimationFrame(this.animId);
      this.animId = null;
      if (ui.simPlayIcon) ui.simPlayIcon.textContent = "▶️";
      if (ui.simPlayText) ui.simPlayText.textContent = "Reproducir";
      if (ui.btnSimReverse) ui.btnSimReverse.classList.remove("active");
      if (ui.btnSimPlay) {
        ui.btnSimPlay.classList.add("play");
        ui.btnSimPlay.classList.remove("pause");
      }
      if (typeof repaintScene === "function") repaintScene();
    },

    reset() {
      this.pause();
      this.originalStates.forEach((st, id) => {
        const obj = state.objects.find((o) => o.id === id);
        if (obj) {
          obj.normX = st.normX;
          obj.normY = st.normY;
          obj.rotationDeg = st.rotationDeg;
          obj._simCurrentSpeed = obj.kinematics ? obj.kinematics.speedKmh : 0;
          obj._simPhase = "start";
        }
      });
      this.seek(0);
      showToast("⏮️ Reconstrucción en tiempo cero (t = 0.000s)");
    },

    updateTimelineUI() {
      if (ui.simCurrentTime)
        ui.simCurrentTime.textContent = `${this.currentTime.toFixed(3)} s`;
      if (ui.simTotalTime) {
        const tag = this.userManualDuration ? " (Manual)" : " (Auto)";
        ui.simTotalTime.textContent = `${this.maxTime.toFixed(3)} s${tag}`;
      }
      if (ui.simTimeSlider && this.maxTime > 0) {
        ui.simTimeSlider.value = (this.currentTime / this.maxTime) * 100;
      }

      if (ui.simLiveTelemetry) {
        const selObj = state.objects.find(
          (o) => o.id === state.selectedObjectId && o.category === "vehiculo",
        );
        if (selObj && selObj._simCurrentSpeed !== undefined) {
          ui.simLiveTelemetry.style.display = "flex";
          if (ui.simTelemetryVehicle)
            ui.simTelemetryVehicle.textContent = selObj.name;
          if (ui.simTelemetrySpeed)
            ui.simTelemetrySpeed.textContent = `${Math.round(selObj._simCurrentSpeed)} km/h`;
        } else {
          ui.simLiveTelemetry.style.display = "none";
        }
      }
    },
  };

  return Simulation;
});
