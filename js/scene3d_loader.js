/**
 * Sinistra 3D - Cargador de Datos Forenses y Generador de Escena Demo
 * Recupera escenas exportadas desde IndexedDB / sessionStorage o genera un caso pericial demo.
 */

export async function loadExport() {
  try {
    const fromDB = await new Promise((resolve) => {
      const req = indexedDB.open("Sinistra3D_DB", 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("scene_store"))
          db.createObjectStore("scene_store");
      };
      req.onerror = () => resolve(null);
      req.onsuccess = (e) => {
        const db = e.target.result;
        try {
          const tx = db.transaction("scene_store", "readonly");
          const g = tx.objectStore("scene_store").get("active_scene_3d");
          g.onsuccess = () => resolve(g.result || null);
          g.onerror = () => resolve(null);
        } catch (err) {
          resolve(null);
        }
      };
    });
    if (fromDB && Array.isArray(fromDB.zones)) {
      try {
        const l = localStorage.getItem("sinistra_manual_duration");
        if (l && Number(l) > 0) {
          if (!fromDB.metadata) fromDB.metadata = {};
          fromDB.metadata.manualDuration = Number(l);
        }
      } catch (e) {}
      return fromDB;
    }
  } catch (e) {}

  try {
    const raw = sessionStorage.getItem("sinistra_scene3d_zones");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.zones)) {
        try {
          const l = localStorage.getItem("sinistra_manual_duration");
          if (l && Number(l) > 0) {
            if (!parsed.metadata) parsed.metadata = {};
            parsed.metadata.manualDuration = Number(l);
          }
        } catch (e) {}
        return parsed;
      }
    }
  } catch (e) {}

  return null;
}

export function makeDemoExport() {
  const size = 100;
  const rect = (x0, z0, x1, z1) => [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ];
  const mk = (id, name, type, elev, pts, origin = "polygon", notes = "") => ({
    id,
    name,
    type,
    elevationMeters: elev,
    pointsMeters: pts,
    origin,
    notes,
  });

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    source: { app: "Sinistra 3D Demo", stage: 2 },
    metadata: {
      sizeMeters: size,
      resolutionPx: 800,
      metersPerPixel: size / 800,
      wandProcPixelMeters: size / 800,
      center: { lat: 3.4516, lng: -76.5319 },
      bearingDeg: 0,
      baseMapStyle: "google-hybrid",
    },
    textureDataUrl:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
           <rect width="800" height="800" fill="#0f172a"/>
           <line x1="0" y1="400" x2="800" y2="400" stroke="#334155" stroke-width="6"/>
           <line x1="400" y1="0" x2="400" y2="800" stroke="#334155" stroke-width="6"/>
         </svg>`,
      ),
    zones: [
      mk("d_calz", "Calzada Principal", "calzada", 0.0, [
        { x: -50, z: -12 },
        { x: 50, z: -12 },
        { x: 50, z: 12 },
        { x: -50, z: 12 },
      ]),
      mk(
        "d_nw",
        "Andén Noroeste",
        "anden",
        0.15,
        rect(-50, -50, -12.35, -12.35),
        "wand",
      ),
      mk(
        "d_ne",
        "Andén Noreste",
        "anden",
        0.15,
        rect(12.35, -50, 50, -12.35),
        "wand",
      ),
      mk(
        "d_sw",
        "Andén Suroeste",
        "anden",
        0.15,
        rect(-50, 12.35, -12.35, 50),
        "wand",
      ),
      mk(
        "d_se",
        "Andén Sureste",
        "anden",
        0.15,
        rect(12.35, 12.35, 50, 50),
        "wand",
      ),
      mk(
        "d_sep",
        "Separador Central Sur",
        "separador",
        0.2,
        rect(-1, 12, 1, 50),
        "polygon",
      ),
      mk(
        "d_b1",
        "Edificio Esquina NO",
        "edificio",
        10.5,
        rect(-44, -44, -22, -22),
        "polygon",
      ),
      mk(
        "d_b2",
        "Local Comercial NE",
        "edificio",
        3.5,
        rect(20, -44, 44, -30),
        "polygon",
      ),
    ],
    objects: [
      {
        id: "demo_veh_01",
        catalogId: "sedan",
        name: "Vehículo 1 (Sedán Azul)",
        category: "vehiculo",
        positionMeters: { x: 4.5, z: -8.0 },
        rotationDeg: 90.0,
        baseElevationMeters: 0.0,
        zoneId: "d_calz",
        isAccidentInvolved: true,
        role: "impactante",
        color: "#2563eb",
        dimensions: { lengthM: 4.5, widthM: 1.8, heightM: 1.45 },
        skidLengthM: 12.5,
        skidTrackWidthM: 1.5,
        triggerOnPass: false,
        deviationAngleDeg: 0.0,
        kinematics: {
          speedKmh: 55.0,
          brakeDistanceM: 12.5,
          trajectoryPoints: [
            { x: 4.5, z: -28.0, type: "start", speedKmh: 55.0 },
            { x: 4.5, z: -16.0, type: "brake_start", speedKmh: 55.0 },
            { x: 4.5, z: -2.0, type: "impact_point", speedKmh: 55.0 },
            { x: 4.5, z: 2.0, type: "final_rest", speedKmh: 55.0 },
          ],
        },
      },
      {
        id: "demo_veh_02",
        catalogId: "sedan",
        name: "Vehículo 2 (Sedán Detenido)",
        category: "vehiculo",
        positionMeters: { x: 4.5, z: -1.0 },
        rotationDeg: 90.0,
        baseElevationMeters: 0.0,
        zoneId: "d_calz",
        isAccidentInvolved: true,
        role: "impactado",
        color: "#1d4ed8",
        dimensions: { lengthM: 4.5, widthM: 1.8, heightM: 1.45 },
        deviationAngleDeg: 0.0,
        kinematics: null,
      },
    ],
  };
}
