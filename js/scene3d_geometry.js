/**
 * scene3d_geometry.js
 * Motor de geometría 3D, teselación, limpieza topológica, imantado y construcción de volúmenes viales.
 */

import * as THREE from "three";

export const STOREY_M = 3.5; // Altura estimada por piso
export const FLAG_PCT = 3; // Umbral de cambio de área para marcar en ámbar
export const TYPE_PRIORITY = { edificio: 4, separador: 3, anden: 2, calzada: 1 };
export const TYPE_INFO = {
  anden: { label: "Andén", color: "#00f0ff" },
  separador: { label: "Separador", color: "#10b981" },
  calzada: { label: "Calzada", color: "#94a3b8" },
  edificio: { label: "Edificación", color: "#a855f7" },
};

const PC = window.polygonClipping;

/* =====================================================================
 * Geometría 2D: utilidades (coordenadas métricas [x, z])
 * ===================================================================== */
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function closeRing(r) {
  const c = r.slice();
  const f = c[0],
    l = c[c.length - 1];
  if (f[0] !== l[0] || f[1] !== l[1]) c.push([f[0], f[1]]);
  return c;
}

export function openRing(r) {
  const o = r.slice();
  if (
    o.length > 1 &&
    o[0][0] === o[o.length - 1][0] &&
    o[0][1] === o[o.length - 1][1]
  )
    o.pop();
  return o;
}

export function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
}

export function ringPerimeter(ring) {
  let p = 0;
  for (let i = 0; i < ring.length - 1; i++) p += dist(ring[i], ring[i + 1]);
  return p;
}

export function mpArea(mp) {
  let a = 0;
  for (const poly of mp) {
    a += Math.abs(ringArea(poly[0]));
    for (let h = 1; h < poly.length; h++) a -= Math.abs(ringArea(poly[h]));
  }
  return a;
}

export function mpPerimeter(mp) {
  let p = 0;
  for (const poly of mp) for (const r of poly) p += ringPerimeter(r);
  return p;
}

export function closestOnSeg(p, a, b) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  if (l2 === 0) return { q: [a[0], a[1]], t: 0, d: dist(p, a) };
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  const q = [a[0] + t * dx, a[1] + t * dz];
  return { q, t, d: dist(p, q) };
}

/** Quita puntos duplicados y colineales (anillo abierto) */
export function cleanRing(pts, tolDup = 0.001, tolCol = 0.02) {
  let out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || dist(p, q) > tolDup) out.push(p);
  }
  while (out.length > 1 && dist(out[0], out[out.length - 1]) <= tolDup)
    out.pop();
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    const n = out.length;
    for (let i = 0; i < n; i++) {
      const a = out[(i - 1 + n) % n],
        b = out[i],
        c = out[(i + 1) % n];
      if (closestOnSeg(b, a, c).d < tolCol) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/** Anillo abierto -> MultiPolygon válido (resuelve autointersecciones) */
export function toMP(open) {
  if (open.length < 3) return [];
  try {
    return PC.union([closeRing(open)]);
  } catch (e) {
    console.warn("No se pudo normalizar polígono:", e);
    return [];
  }
}

export function cloneMP(mp) {
  return JSON.parse(JSON.stringify(mp));
}

/* ---- Desplazamiento (buffer) mediante unión/diferencia de franjas ---- */
export function discPoly(cx, cz, r, n = 8) {
  const rr = r / Math.cos(Math.PI / n);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) * 2 * Math.PI) / n;
    pts.push([cx + rr * Math.cos(a), cz + rr * Math.sin(a)]);
  }
  pts.push(pts[0]);
  return [pts];
}

export function bandPolys(mp, r) {
  const out = [];
  for (const poly of mp) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i],
          b = ring[i + 1];
        const dx = b[0] - a[0],
          dz = b[1] - a[1];
        const L = Math.hypot(dx, dz);
        if (L < 1e-9) continue;
        const nx = (-dz / L) * r,
          nz = (dx / L) * r;
        out.push([
          [
            [a[0] + nx, a[1] + nz],
            [b[0] + nx, b[1] + nz],
            [b[0] - nx, b[1] - nz],
            [a[0] - nx, a[1] - nz],
            [a[0] + nx, a[1] + nz],
          ],
        ]);
        out.push(discPoly(a[0], a[1], r));
      }
    }
  }
  return out;
}

export function buffer(mp, r) {
  if (!mp.length || r === 0) return mp;
  const factors = [1, 1.0007, 0.9993, 1.0031];
  for (const f of factors) {
    try {
      const bands = bandPolys(mp, Math.abs(r) * f);
      return r > 0 ? PC.union(mp, ...bands) : PC.difference(mp, ...bands);
    } catch (e) {}
  }
  let acc = mp;
  for (const b of bandPolys(mp, Math.abs(r))) {
    try {
      acc = r > 0 ? PC.union(acc, b) : PC.difference(acc, b);
    } catch (e) {}
  }
  return acc;
}

export function tidyMP(mp) {
  const out = [];
  for (const poly of mp) {
    const outer = cleanRing(openRing(poly[0]), 0.001, 0.01);
    if (outer.length < 3) continue;
    if (Math.abs(ringArea(closeRing(outer))) < 0.01) continue;
    const rings = [closeRing(outer)];
    for (let h = 1; h < poly.length; h++) {
      const hr = cleanRing(openRing(poly[h]), 0.001, 0.01);
      if (hr.length >= 3 && Math.abs(ringArea(closeRing(hr))) >= 0.01)
        rings.push(closeRing(hr));
    }
    out.push(rings);
  }
  return out;
}

export function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i++) {
    const xi = ring[i][0],
      zi = ring[i][1],
      xj = ring[j][0],
      zj = ring[j][1];
    if (
      zi > p[1] !== zj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi
    )
      inside = !inside;
  }
  return inside;
}

export function pointInMP(p, mp) {
  for (const poly of mp) {
    if (!pointInRing(p, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++)
      if (pointInRing(p, poly[h])) {
        inHole = true;
        break;
      }
    if (!inHole) return true;
  }
  return false;
}

export function mpBBox(mp) {
  let x0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    z1 = -Infinity;
  for (const poly of mp)
    for (const p of poly[0]) {
      x0 = Math.min(x0, p[0]);
      z0 = Math.min(z0, p[1]);
      x1 = Math.max(x1, p[0]);
      z1 = Math.max(z1, p[1]);
    }
  return { x0, z0, x1, z1 };
}

export function minDistToMP(p, mp) {
  let best = Infinity;
  for (const poly of mp)
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const d = closestOnSeg(p, ring[i], ring[i + 1]).d;
        if (d < best) best = d;
      }
    }
  return best;
}

/* =====================================================================
 * Limpieza geométrica, Imantado (Snapping) y Resolución de Jerarquías
 * ===================================================================== */
export function snapAll(items, tol) {
  const refs = [];
  items.forEach((it, zi) => {
    it.mp.forEach((poly) => poly.forEach((ring) => refs.push({ zi, ring })));
  });
  const verts = [];
  refs.forEach((rf) => {
    for (let i = 0; i < rf.ring.length - 1; i++)
      verts.push({ zi: rf.zi, rf, i, merged: false });
  });
  const P = (v) => v.rf.ring[v.i];
  const setV = (v, x, z) => {
    const old = P(v);
    const sh = Math.hypot(x - old[0], z - old[1]);
    v.rf.ring[v.i] = [x, z];
    if (v.i === 0) v.rf.ring[v.rf.ring.length - 1] = [x, z];
    const st = items[v.zi].stats;
    st.snapped++;
    st.maxShift = Math.max(st.maxShift, sh);
  };

  // a) Vértice con vértice de otra zona -> punto medio
  for (const v of verts) {
    if (v.merged) continue;
    const pv = P(v);
    let best = null,
      bd = tol;
    for (const w of verts) {
      if (w.zi === v.zi || w.merged) continue;
      const d = dist(pv, P(w));
      if (d < bd) {
        bd = d;
        best = w;
      }
    }
    if (best) {
      if (bd > 1e-6) {
        const pw = P(best);
        const mx = (pv[0] + pw[0]) / 2,
          mz = (pv[1] + pw[1]) / 2;
        setV(v, mx, mz);
        setV(best, mx, mz);
      }
      v.merged = true;
      best.merged = true;
    }
  }

  // b) Vértice con arista de otra zona -> proyección sobre la arista
  const inserts = new Map();
  for (const v of verts) {
    if (v.merged) continue;
    const pv = P(v);
    let best = null;
    for (const rf of refs) {
      if (rf.zi === v.zi) continue;
      for (let e = 0; e < rf.ring.length - 1; e++) {
        const c = closestOnSeg(pv, rf.ring[e], rf.ring[e + 1]);
        if (c.d < tol && (!best || c.d < best.d)) best = { ...c, rf, e };
      }
    }
    if (best && best.d > 1e-4 && best.t > 0.001 && best.t < 0.999) {
      setV(v, best.q[0], best.q[1]);
      if (!inserts.has(best.rf)) inserts.set(best.rf, []);
      inserts.get(best.rf).push({ e: best.e, t: best.t, q: best.q });
      v.merged = true;
    }
  }
  inserts.forEach((list, rf) => {
    list.sort((A, B) => B.e - A.e || B.t - A.t);
    for (const ins of list) rf.ring.splice(ins.e + 1, 0, ins.q);
  });
}

export function fillCracks(items, tol) {
  const act = items.filter((it) => it.mp.length);
  if (act.length < 1) return;
  const U = act.length > 1 ? PC.union(...act.map((it) => it.mp)) : act[0].mp;
  const closed = buffer(buffer(U, tol / 2), -tol / 2);
  let slivers;
  try {
    slivers = PC.difference(closed, U);
  } catch (e) {
    slivers = PC.difference(closed, buffer(U, 0.002));
  }

  const boxes = items.map((it) => (it.mp.length ? mpBBox(it.mp) : null));
  for (const poly of slivers) {
    const outer = poly[0];
    let a = Math.abs(ringArea(outer));
    for (let h = 1; h < poly.length; h++) a -= Math.abs(ringArea(poly[h]));
    const per = ringPerimeter(outer);
    if (a < 0.002 || (2 * a) / per < 0.03) continue;

    const samples = [];
    for (let i = 0; i < outer.length - 1; i++) {
      const A = outer[i],
        B = outer[i + 1];
      const L = dist(A, B);
      const n = Math.max(1, Math.ceil(L / 0.15));
      for (let k = 0; k < n; k++) {
        samples.push([
          A[0] + ((B[0] - A[0]) * k) / n,
          A[1] + ((B[1] - A[1]) * k) / n,
        ]);
      }
    }
    const counts = new Array(items.length).fill(0);
    for (const s of samples) {
      for (let zi = 0; zi < items.length; zi++) {
        const bb = boxes[zi];
        if (!bb) continue;
        if (
          s[0] < bb.x0 - 0.05 ||
          s[0] > bb.x1 + 0.05 ||
          s[1] < bb.z0 - 0.05 ||
          s[1] > bb.z1 + 0.05
        )
          continue;
        if (minDistToMP(s, items[zi].mp) < 0.03) counts[zi]++;
      }
    }
    let best = -1;
    for (let zi = 0; zi < items.length; zi++) {
      if (counts[zi] === 0) continue;
      if (
        best < 0 ||
        counts[zi] > counts[best] ||
        (counts[zi] === counts[best] && items[zi].prio > items[best].prio)
      )
        best = zi;
    }
    if (best >= 0) {
      try {
        items[best].mp = PC.union(items[best].mp, poly);
        items[best].stats.sliverArea += a;
        boxes[best] = mpBBox(items[best].mp);
      } catch (e) {
        console.warn("No se pudo asignar rendija:", e);
      }
    }
  }
}

export function resolveOverlaps(items) {
  const order = items
    .map((it, i) => i)
    .filter((i) => items[i].mp.length)
    .sort((a, b) => {
      const pa = items[a].prio,
        pb = items[b].prio;
      if (pa !== pb) return pb - pa;
      return mpArea(items[a].mp) - mpArea(items[b].mp);
    });
  let acc = null;
  for (const i of order) {
    const it = items[i];
    const before = mpArea(it.mp);
    let fin = it.mp;
    if (acc) {
      try {
        fin = PC.difference(it.mp, acc);
      } catch (e) {
        console.warn(e);
        fin = it.mp;
      }
    }
    it.final = fin;
    it.stats.overlapRemoved = Math.max(0, before - mpArea(fin));
    try {
      acc = acc ? PC.union(acc, it.mp) : it.mp;
    } catch (e) {
      console.warn(e);
    }
  }
}

export async function buildGeometry(data, stepFn) {
  const m = data.metadata;
  const pxm = m.wandProcPixelMeters || 0.17;
  const tol = Math.max(0.15, 2.5 * pxm);

  const items = [];
  const skipped = [];
  for (const z of data.zones) {
    const raw = z.pointsMeters.map((p) => [p.x, p.z]);
    const cleaned = cleanRing(raw);
    const orig = toMP(cleaned);
    if (!orig.length || mpArea(orig) < 0.01) {
      skipped.push(z.name);
      continue;
    }
    items.push({
      zone: z,
      prio: TYPE_PRIORITY[z.type] || 1,
      cleaned,
      orig,
      origArea: mpArea(orig),
      mp: null,
      final: null,
      stats: {
        snapped: 0,
        maxShift: 0,
        sliverArea: 0,
        overlapRemoved: 0,
        compensated: false,
      },
    });
  }

  if (stepFn) await stepFn("Normalizando y compensando contornos de la varita...");
  for (const it of items) {
    it.mp = cloneMP(it.orig);
    if (it.zone.origin === "wand") {
      try {
        const shifted = it.cleaned.map((p) => [p[0] + pxm / 2, p[1] + pxm / 2]);
        const mp = toMP(shifted);
        const grown = mp.length ? buffer(mp, pxm / 2) : [];
        if (grown.length) {
          it.mp = grown;
          it.stats.compensated = true;
        }
      } catch (e) {
        console.warn("Compensación omitida para", it.zone.name, e);
      }
    }
  }

  if (stepFn) await stepFn("Imantando bordes entre zonas vecinas...");
  try {
    const backup = items.map((it) => cloneMP(it.mp));
    snapAll(items, tol);
    items.forEach((it, i) => {
      try {
        it.mp = PC.union(it.mp);
      } catch (e) {
        it.mp = backup[i];
      }
    });
  } catch (e) {
    console.warn("Imantado omitido:", e);
  }

  if (stepFn) await stepFn("Cerrando grietas entre zonas contiguas...");
  try {
    fillCracks(items, tol);
  } catch (e) {
    console.warn("Relleno de grietas omitido:", e);
  }

  if (stepFn) await stepFn("Resolviendo superposiciones por jerarquía...");
  resolveOverlaps(items);

  if (stepFn) await stepFn("Optimizando geometría...");
  for (const it of items) {
    it.geomArea = mpArea(it.mp);
    it.final = tidyMP(it.final || it.mp);
    it.orig = tidyMP(it.orig);
    it.corrArea = mpArea(it.final);
    it.deltaPct =
      it.origArea > 0 ? ((it.geomArea - it.origArea) / it.origArea) * 100 : 0;
    it.flagged = Math.abs(it.deltaPct) > FLAG_PCT;
  }
  return { items, skipped, tol };
}

/* =====================================================================
 * Constructores de Mallas Three.js para Zonas Urbanas
 * ===================================================================== */
export const toV2 = (ring) => {
  const pts = [];
  for (let i = 0; i < ring.length - 1; i++)
    pts.push(new THREE.Vector2(ring[i][0], -ring[i][1]));
  return pts;
};

export function makeShape(poly) {
  const shape = new THREE.Shape(toV2(poly[0]));
  for (let h = 1; h < poly.length; h++)
    shape.holes.push(new THREE.Path(toV2(poly[h])));
  return shape;
}

export function makeProjTexture(floorTex, sizeM, renderer) {
  const t = floorTex.clone();
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(1 / sizeM, 1 / sizeM);
  t.offset.set(0.5, 0.5);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.needsUpdate = true;
  return t;
}

export function disposeObject(obj, floorTex) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach((mt) => {
        if (mt.map && mt.map !== floorTex) mt.map.dispose();
        mt.dispose();
      });
    }
  });
}

export function collectFacade(item, h, allBuildings, useCorrected, out) {
  const mp = useCorrected ? item.final : item.orig;
  const floors = Math.max(1, Math.round(h / STOREY_M));
  for (const poly of mp) {
    const ring = poly[0];
    const s = ringArea(ring);
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i],
        b = ring[i + 1];
      const dx = b[0] - a[0],
        dz = b[1] - a[1];
      const L = Math.hypot(dx, dz);
      if (L < 3) continue;
      const ux = dx / L,
        uz = dz / L;
      const nx = s > 0 ? uz : -uz,
        nz = s > 0 ? -ux : ux;
      const mid = [(a[0] + b[0]) / 2 + nx * 0.3, (a[1] + b[1]) / 2 + nz * 0.3];
      let shared = false;
      for (const other of allBuildings) {
        if (other === item) continue;
        if (pointInMP(mid, useCorrected ? other.final : other.orig)) {
          shared = true;
          break;
        }
      }
      if (shared) continue;

      const slots = Math.max(1, Math.floor((L - 1) / 3));
      const doorSlot = Math.floor(slots / 2);
      const rotY = Math.atan2(nx, nz);
      for (let k = 0; k < slots; k++) {
        const t = ((k + 0.5) * L) / slots;
        const cx = a[0] + ux * t,
          cz = a[1] + uz * t;
        if (k === doorSlot) {
          out.doors.push({
            x: cx + nx * 0.012,
            y: 1.05,
            z: cz + nz * 0.012,
            rotY,
          });
        }
        for (let f = 0; f < floors; f++) {
          if (f === 0 && k === doorSlot) continue;
          const cy = f * STOREY_M + 1.7;
          if (cy + 0.6 > h - 0.15) continue;
          out.windows.push({
            x: cx + nx * 0.02,
            y: cy,
            z: cz + nz * 0.02,
            rotY,
          });
        }
      }
    }
  }
}

export function buildInstanced(list, w, hgt, colorHex, opts = {}) {
  if (!list.length) return null;
  const geom = new THREE.PlaneGeometry(w, hgt);
  const mat = new THREE.MeshLambertMaterial({
    color: colorHex,
    emissive: opts.emissive || 0x000000,
    polygonOffset: true,
    polygonOffsetFactor: opts.offset || -1,
    polygonOffsetUnits: opts.offset || -1,
  });
  const mesh = new THREE.InstancedMesh(geom, mat, list.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const sc = new THREE.Vector3(1, 1, 1);
  list.forEach((it, i) => {
    q.setFromAxisAngle(up, it.rotY);
    m4.compose(new THREE.Vector3(it.x, it.y, it.z), q, sc);
    mesh.setMatrixAt(i, m4);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.raycast = () => {};
  mesh.userData.isDecor = true;
  return mesh;
}

export function labelCenter(item, useCorrected) {
  const mp = useCorrected ? item.final : item.orig;
  let best = null,
    ba = -1;
  for (const poly of mp) {
    const a = Math.abs(ringArea(poly[0]));
    if (a > ba) {
      ba = a;
      best = poly;
    }
  }
  if (!best) return [0, 0];
  const ring = best[0];
  let cx = 0,
    cz = 0,
    A = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const f = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    cx += (ring[i][0] + ring[i + 1][0]) * f;
    cz += (ring[i][1] + ring[i + 1][1]) * f;
    A += f;
  }
  let c = A !== 0 ? [cx / (3 * A), cz / (3 * A)] : ring[0];
  if (!pointInMP(c, [best])) {
    const bb = mpBBox([best]);
    let found = null,
      bd = -1;
    for (let i = 1; i < 12 && !found; i++)
      for (let j = 1; j < 12; j++) {
        const p = [
          bb.x0 + ((bb.x1 - bb.x0) * i) / 12,
          bb.z0 + ((bb.z1 - bb.z0) * j) / 12,
        ];
        if (pointInMP(p, [best])) {
          const d = minDistToMP(p, [best]);
          if (d > bd) {
            bd = d;
            found = p;
          }
        }
      }
    if (found) c = found;
  }
  return c;
}
