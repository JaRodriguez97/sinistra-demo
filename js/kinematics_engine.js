/**
 * kinematics_engine.js
 * Motor cinemático pericial universal para Sinistra 3D.
 * Unifica el cálculo de aceleración, velocidades, desaceleraciones por frenado,
 * interpolación de trayectorias milimétricas y activación dinámica de huellas.
 * Compatible con scripts clásicos en navegador (<script src="...">) y con módulos ESM.
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.KinematicsEngine = exports;
  }
})(typeof self !== "undefined" ? self : this, function () {
  /**
   * Extrae limpiamente las coordenadas { x, y } de un punto según sea normalizado o métrico
   */
  function getPtCoord(p, isNorm) {
    if (!p) return { x: 0, y: 0 };
    if (isNorm) {
      return {
        x: p.normX !== undefined ? p.normX : 0.5,
        y: p.normY !== undefined ? p.normY : 0.5,
      };
    } else {
      return {
        x: p.x !== undefined ? p.x : 0,
        y: p.z !== undefined ? p.z : (p.y !== undefined ? p.y : 0),
      };
    }
  }

  /**
   * Evalúa un tramo cúbico de spline Catmull-Rom con tensión paramétrica tau (0.5 = estándar).
   * @param {Object} p0 - Punto previo { x, y }
   * @param {Object} p1 - Punto inicial del tramo { x, y }
   * @param {Object} p2 - Punto final del tramo { x, y }
   * @param {Object} p3 - Punto posterior { x, y }
   * @param {number} u - Fracción normalizada [0, 1]
   * @param {number} [tau=0.5] - Tensión del spline (0.5 = natural/centrípeto, 0.28 = curva cerrada 90°, 0.72 = curva amplia/rotonda)
   * @returns {{ x: number, y: number, tx: number, ty: number }} Posición y vector tangente continuo
   */
  function evalSplineSegment(p0, p1, p2, p3, u, tau = 0.5) {
    const p0x = p0 ? (p0.x !== undefined ? p0.x : 0) : 0;
    const p0y = p0 ? (p0.y !== undefined ? p0.y : (p0.z !== undefined ? p0.z : 0)) : 0;
    const p1x = p1 ? (p1.x !== undefined ? p1.x : 0) : 0;
    const p1y = p1 ? (p1.y !== undefined ? p1.y : (p1.z !== undefined ? p1.z : 0)) : 0;
    const p2x = p2 ? (p2.x !== undefined ? p2.x : 0) : 0;
    const p2y = p2 ? (p2.y !== undefined ? p2.y : (p2.z !== undefined ? p2.z : 0)) : 0;
    const p3x = p3 ? (p3.x !== undefined ? p3.x : 0) : 0;
    const p3y = p3 ? (p3.y !== undefined ? p3.y : (p3.z !== undefined ? p3.z : 0)) : 0;

    const m1x = tau * (p2x - p0x);
    const m1y = tau * (p2y - p0y);
    const m2x = tau * (p3x - p1x);
    const m2y = tau * (p3y - p1y);

    const u2 = u * u;
    const u3 = u2 * u;

    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;

    const x = h00 * p1x + h10 * m1x + h01 * p2x + h11 * m2x;
    const y = h00 * p1y + h10 * m1y + h01 * p2y + h11 * m2y;

    const dh00 = 6 * u2 - 6 * u;
    const dh10 = 3 * u2 - 4 * u + 1;
    const dh01 = -6 * u2 + 6 * u;
    const dh11 = 3 * u2 - 2 * u;

    let tx = dh00 * p1x + dh10 * m1x + dh01 * p2x + dh11 * m2x;
    let ty = dh00 * p1y + dh10 * m1y + dh01 * p2y + dh11 * m2y;

    if (Math.hypot(tx, ty) < 1e-6) {
      tx = p2x - p1x;
      ty = p2y - p1y;
    }

    return { x, y, tx, ty };
  }

  /**
   * Calcula la longitud real del arco de un tramo curvilíneo mediante cuadratura
   */
  function getSplineSegmentLength(p0, p1, p2, p3, tau = 0.5, scale = 1) {
    let prev = evalSplineSegment(p0, p1, p2, p3, 0, tau);
    let len = 0;
    const steps = 8;
    for (let s = 1; s <= steps; s++) {
      const curr = evalSplineSegment(p0, p1, p2, p3, s / steps, tau);
      len += Math.hypot((curr.x - prev.x) * scale, (curr.y - prev.y) * scale);
      prev = curr;
    }
    return Math.max(0.001, len);
  }

  /**
   * Obtiene la duración total en segundos que tarda un objeto en recorrer su trayectoria
   */
  function getObjectDuration(obj, sizeMeters = 100) {
    const pts = obj.kinematics?.trajectoryPoints;
    if (!pts || pts.length < 2) return 0;

    const isNorm = pts[0].normX !== undefined;
    const isCurved = obj.kinematics?.curveMode !== "linear" && pts.length >= 3;
    const tau = obj.kinematics?.curveTension !== undefined
      ? obj.kinematics.curveTension
      : (obj.kinematics?.curveMode === "tight" ? 0.28 : (obj.kinematics?.curveMode === "wide" ? 0.72 : 0.5));

    let totalT = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const wait =
        p1.type === "final_rest" || p1.waitTimeSec > 0
          ? Math.max(0, parseFloat(p1.waitTimeSec) || 0)
          : 0;
      totalT += wait;

      let d = 0;
      if (isCurved) {
        const c1 = getPtCoord(p1, isNorm);
        const c2 = getPtCoord(p2, isNorm);
        const c0 = i > 0 ? getPtCoord(pts[i - 1], isNorm) : { x: 2 * c1.x - c2.x, y: 2 * c1.y - c2.y };
        const c3 = i + 2 < pts.length ? getPtCoord(pts[i + 2], isNorm) : { x: 2 * c2.x - c1.x, y: 2 * c2.y - c1.y };
        d = getSplineSegmentLength(c0, c1, c2, c3, tau, isNorm ? sizeMeters : 1);
      } else {
        if (isNorm) {
          d = Math.hypot((p2.normX - p1.normX) * sizeMeters, (p2.normY - p1.normY) * sizeMeters);
        } else {
          d = Math.hypot(p2.x - p1.x, p2.z - p1.z);
        }
      }

      const nominalSpeed =
        Number(obj.kinematics?.speedKmh) > 0
          ? Number(obj.kinematics.speedKmh)
          : 50;
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
  }

  /**
   * Calcula la duración total de la reconstrucción basada en el objeto más demorado
   */
  function calculateTotalDuration(objects, sizeMeters = 100) {
    let maxT = 0;
    (objects || []).forEach((obj) => {
      if (
        obj.kinematics &&
        Array.isArray(obj.kinematics.trajectoryPoints) &&
        obj.kinematics.trajectoryPoints.length >= 2
      ) {
        const dur = getObjectDuration(obj, sizeMeters);
        if (dur > maxT) maxT = dur;
      }
    });
    return Math.max(3.0, maxT);
  }

  /**
   * Muestrea la posición cinemática, orientación, velocidad y fase a un tiempo t exacto
   */
  function sampleObjectAtTime(obj, t, sizeMeters = 100) {
    const pts = obj.kinematics?.trajectoryPoints;
    if (!pts || pts.length < 2) return null;

    const isNorm = pts[0].normX !== undefined;
    const isCurved = obj.kinematics?.curveMode !== "linear" && pts.length >= 3;
    const tau = obj.kinematics?.curveTension !== undefined
      ? obj.kinematics.curveTension
      : (obj.kinematics?.curveMode === "tight" ? 0.28 : (obj.kinematics?.curveMode === "wide" ? 0.72 : 0.5));

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

      let c0 = null, c1 = null, c2 = null, c3 = null, d = 0;
      if (isCurved) {
        c1 = getPtCoord(p1, isNorm);
        c2 = getPtCoord(p2, isNorm);
        c0 = i > 0 ? getPtCoord(pts[i - 1], isNorm) : { x: 2 * c1.x - c2.x, y: 2 * c1.y - c2.y };
        c3 = i + 2 < pts.length ? getPtCoord(pts[i + 2], isNorm) : { x: 2 * c2.x - c1.x, y: 2 * c2.y - c1.y };
        d = getSplineSegmentLength(c0, c1, c2, c3, tau, isNorm ? sizeMeters : 1);
      } else {
        if (isNorm) {
          d = Math.hypot((p2.normX - p1.normX) * sizeMeters, (p2.normY - p1.normY) * sizeMeters);
        } else {
          d = Math.hypot(p2.x - p1.x, p2.z - p1.z);
        }
      }

      const nominalSpeed =
        Number(obj.kinematics?.speedKmh) > 0
          ? Number(obj.kinematics.speedKmh)
          : 50;
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
        c0,
        c1,
        c2,
        c3,
        p1,
        p2,
        isCurved,
        tau,
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

    // Antes de iniciar (t <= 0)
    if (t <= 0) {
      const s0 = segments[0];
      let normX, normY, posX, posZ, rad;
      if (s0.isCurved) {
        const evalPt = evalSplineSegment(s0.c0, s0.c1, s0.c2, s0.c3, 0, s0.tau);
        rad = Math.atan2(evalPt.ty, evalPt.tx);
        if (isNorm) {
          normX = evalPt.x;
          normY = evalPt.y;
          posX = (normX - 0.5) * sizeMeters;
          posZ = (normY - 0.5) * sizeMeters;
        } else {
          posX = evalPt.x;
          posZ = evalPt.y;
          normX = (posX / sizeMeters) + 0.5;
          normY = (posZ / sizeMeters) + 0.5;
        }
      } else {
        rad = isNorm
          ? Math.atan2(s0.p2.normY - s0.p1.normY, s0.p2.normX - s0.p1.normX)
          : Math.atan2(s0.p2.z - s0.p1.z, s0.p2.x - s0.p1.x);
        normX = isNorm ? s0.p1.normX : (s0.p1.x / sizeMeters) + 0.5;
        normY = isNorm ? s0.p1.normY : (s0.p1.z / sizeMeters) + 0.5;
        posX = isNorm ? (s0.p1.normX - 0.5) * sizeMeters : s0.p1.x;
        posZ = isNorm ? (s0.p1.normY - 0.5) * sizeMeters : s0.p1.z;
      }

      return {
        normX,
        normY,
        x: posX,
        z: posZ,
        rotationDeg: (rad * 180) / Math.PI,
        rotationRad: rad,
        currentSpeedKmh: s0.isWait ? 0 : s0.v1 * 3.6,
        phase: s0.p1.type || "start",
        progress: 0,
      };
    }

    // Tras finalizar la trayectoria (t >= cumT)
    if (t >= cumT) {
      const lastSeg = segments[segments.length - 1];
      let normX, normY, posX, posZ, rad;
      if (lastSeg.isCurved) {
        const evalPt = evalSplineSegment(lastSeg.c0, lastSeg.c1, lastSeg.c2, lastSeg.c3, 1, lastSeg.tau);
        rad = Math.atan2(evalPt.ty, evalPt.tx);
        if (isNorm) {
          normX = evalPt.x;
          normY = evalPt.y;
          posX = (normX - 0.5) * sizeMeters;
          posZ = (normY - 0.5) * sizeMeters;
        } else {
          posX = evalPt.x;
          posZ = evalPt.y;
          normX = (posX / sizeMeters) + 0.5;
          normY = (posZ / sizeMeters) + 0.5;
        }
      } else {
        rad = isNorm
          ? Math.atan2(lastSeg.p2.normY - lastSeg.p1.normY, lastSeg.p2.normX - lastSeg.p1.normX)
          : Math.atan2(lastSeg.p2.z - lastSeg.p1.z, lastSeg.p2.x - lastSeg.p1.x);
        normX = isNorm ? lastSeg.p2.normX : (lastSeg.p2.x / sizeMeters) + 0.5;
        normY = isNorm ? lastSeg.p2.normY : (lastSeg.p2.z / sizeMeters) + 0.5;
        posX = isNorm ? (lastSeg.p2.normX - 0.5) * sizeMeters : lastSeg.p2.x;
        posZ = isNorm ? (lastSeg.p2.normY - 0.5) * sizeMeters : lastSeg.p2.z;
      }

      return {
        normX,
        normY,
        x: posX,
        z: posZ,
        rotationDeg: (rad * 180) / Math.PI,
        rotationRad: rad,
        currentSpeedKmh: lastSeg.isWait ? 0 : lastSeg.v2 * 3.6,
        phase: lastSeg.p2.type || "final_rest",
        progress: 1,
      };
    }

    // En curso
    for (const seg of segments) {
      if (t >= seg.startT && t <= seg.endT) {
        if (seg.isWait) {
          const rad = isNorm
            ? Math.atan2(seg.p2.normY - seg.p1.normY, seg.p2.normX - seg.p1.normX)
            : Math.atan2(seg.p2.z - seg.p1.z, seg.p2.x - seg.p1.x);
          return {
            normX: isNorm ? seg.p1.normX : (seg.p1.x / sizeMeters) + 0.5,
            normY: isNorm ? seg.p1.normY : (seg.p1.z / sizeMeters) + 0.5,
            x: isNorm ? (seg.p1.normX - 0.5) * sizeMeters : seg.p1.x,
            z: isNorm ? (seg.p1.normY - 0.5) * sizeMeters : seg.p1.z,
            rotationDeg: (rad * 180) / Math.PI,
            rotationRad: rad,
            currentSpeedKmh: 0,
            phase: "final_rest",
            progress: cumT > 0 ? t / cumT : 0,
          };
        }

        const tauTime = t - seg.startT;
        let dist = seg.v1 * tauTime + 0.5 * seg.a * tauTime * tauTime;
        dist = Math.max(0, Math.min(seg.d, dist));
        const alpha = seg.d > 0 ? dist / seg.d : 0;
        const curV = Math.max(0, seg.v1 + seg.a * tauTime);

        let normX, normY, posX, posZ, rad;
        if (seg.isCurved) {
          const evalPt = evalSplineSegment(seg.c0, seg.c1, seg.c2, seg.c3, alpha, seg.tau);
          rad = Math.atan2(evalPt.ty, evalPt.tx);
          if (isNorm) {
            normX = evalPt.x;
            normY = evalPt.y;
            posX = (normX - 0.5) * sizeMeters;
            posZ = (normY - 0.5) * sizeMeters;
          } else {
            posX = evalPt.x;
            posZ = evalPt.y;
            normX = (posX / sizeMeters) + 0.5;
            normY = (posZ / sizeMeters) + 0.5;
          }
        } else {
          if (isNorm) {
            normX = seg.p1.normX + alpha * (seg.p2.normX - seg.p1.normX);
            normY = seg.p1.normY + alpha * (seg.p2.normY - seg.p1.normY);
            rad = Math.atan2(seg.p2.normY - seg.p1.normY, seg.p2.normX - seg.p1.normX);
            posX = (normX - 0.5) * sizeMeters;
            posZ = (normY - 0.5) * sizeMeters;
          } else {
            posX = seg.p1.x + alpha * (seg.p2.x - seg.p1.x);
            posZ = seg.p1.z + alpha * (seg.p2.z - seg.p1.z);
            rad = Math.atan2(seg.p2.z - seg.p1.z, seg.p2.x - seg.p1.x);
            normX = (posX / sizeMeters) + 0.5;
            normY = (posZ / sizeMeters) + 0.5;
          }
        }

        return {
          normX,
          normY,
          x: posX,
          z: posZ,
          rotationDeg: (rad * 180) / Math.PI,
          rotationRad: rad,
          currentSpeedKmh: curV * 3.6,
          phase: alpha > 0.85 ? seg.p2.type : seg.p1.type,
          progress: cumT > 0 ? t / cumT : 0,
        };
      }
    }

    return null;
  }

  /**
   * Actualiza el progreso de revelado de huellas de frenado dependientes del paso vehicular
   */
  function updateDynamicSkidMarks(objects, sizeMeters) {
    (objects || []).forEach((skid) => {
      if (
        (skid.catalogId === "huella_frenado" || skid.category === "evidencia") &&
        skid.triggerOnPass
      ) {
        let maxFrac = 0;
        objects.forEach((v) => {
          if (
            v.id !== skid.id &&
            v._simPhase &&
            (v._simPhase === "brake_start" ||
              v._simPhase === "impact_point" ||
              v._simPhase === "final_rest")
          ) {
            const vX = v.normX !== undefined ? v.normX * sizeMeters : v.x;
            const vY = v.normY !== undefined ? v.normY * sizeMeters : v.z;
            const sX = skid.normX !== undefined ? skid.normX * sizeMeters : skid.x;
            const sY = skid.normY !== undefined ? skid.normY * sizeMeters : skid.z;

            const dM = Math.hypot(vX - sX, vY - sY);
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
  }

  return {
    getObjectDuration,
    calculateTotalDuration,
    sampleObjectAtTime,
    updateDynamicSkidMarks,
    evalSplineSegment,
    getSplineSegmentLength,
  };
});
