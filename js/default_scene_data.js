/**
 * default_scene_data.js
 * Generador de mapa aéreo y escena de contingencia por defecto (Sinistra 3D).
 * Compatible con scripts clásicos en navegador (<script src="...">) y con módulos ESM.
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    const exp = factory();
    root.generateAerialMapTexture = exp.generateAerialMapTexture;
    root.makeDefault2DScene = exp.makeDefault2DScene;
  }
})(typeof self !== "undefined" ? self : this, function () {
  function generateAerialMapTexture(sizePx = 800) {
    const c = document.createElement("canvas");
    c.width = sizePx;
    c.height = sizePx;
    const ctx = c.getContext("2d");

    // Fondo terreno/asfalto base
    ctx.fillStyle = "#0b0f19";
    ctx.fillRect(0, 0, sizePx, sizePx);

    // Cuadrícula sutil de 10m (cada 80px)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= sizePx; i += 80) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, sizePx);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(sizePx, i);
      ctx.stroke();
    }

    // Calzada este-oeste (y: 38% a 62% = 304px a 496px, alto 192px = 24m)
    const roadY = sizePx * 0.38;
    const roadH = sizePx * 0.24;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, roadY, sizePx, roadH);

    // Borde de calzada / cordón cuneta
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, roadY);
    ctx.lineTo(sizePx, roadY);
    ctx.moveTo(0, roadY + roadH);
    ctx.lineTo(sizePx, roadY + roadH);
    ctx.stroke();

    // Líneas divisorias de carril (blanca discontinua)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 16]);
    ctx.beginPath();
    ctx.moveTo(0, roadY + roadH * 0.33);
    ctx.lineTo(sizePx, roadY + roadH * 0.33);
    ctx.moveTo(0, roadY + roadH * 0.67);
    ctx.lineTo(sizePx, roadY + roadH * 0.67);
    ctx.stroke();
    ctx.setLineDash([]);

    // Línea central doble amarilla
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, roadY + roadH * 0.5 - 2);
    ctx.lineTo(sizePx, roadY + roadH * 0.5 - 2);
    ctx.moveTo(0, roadY + roadH * 0.5 + 2);
    ctx.lineTo(sizePx, roadY + roadH * 0.5 + 2);
    ctx.stroke();

    // Paso de cebra peatonal
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    for (let y = roadY + 8; y < roadY + roadH - 8; y += 18) {
      ctx.fillRect(520, y, 32, 10);
    }

    // Andenes superiores e inferiores
    ctx.fillStyle = "#334155";
    ctx.fillRect(0, roadY - 40, sizePx, 40);
    ctx.fillRect(0, roadY + roadH, sizePx, 40);

    // Césped / áreas verdes
    ctx.fillStyle = "#14532d";
    ctx.fillRect(0, 0, sizePx, roadY - 40);
    ctx.fillRect(0, roadY + roadH + 40, sizePx, sizePx - (roadY + roadH + 40));

    // Manzanas / edificios
    ctx.fillStyle = "#1e1b4b";
    ctx.strokeStyle = "#312e81";
    ctx.lineWidth = 2;
    ctx.fillRect(40, 40, 240, 180);
    ctx.strokeRect(40, 40, 240, 180);
    ctx.fillRect(520, 40, 240, 180);
    ctx.strokeRect(520, 40, 240, 180);

    ctx.fillRect(40, roadY + roadH + 60, 240, 160);
    ctx.strokeRect(40, roadY + roadH + 60, 240, 160);
    ctx.fillRect(520, roadY + roadH + 60, 240, 160);
    ctx.strokeRect(520, roadY + roadH + 60, 240, 160);

    return c.toDataURL("image/jpeg", 0.92);
  }

  function makeDefault2DScene() {
    return {
      schemaVersion: 1,
      source: { app: "Sinistra 3D Demo", stage: 2 },
      metadata: {
        sizeMeters: 100,
        resolutionPx: 800,
        metersPerPixel: 0.125,
        center: { lat: 3.4516, lng: -76.5319 },
        bearingDeg: 0,
        baseMapStyle: "google-hybrid",
      },
      textureDataUrl: generateAerialMapTexture(800),
      zones: [
        {
          id: "d_calz",
          name: "Calzada Principal",
          type: "calzada",
          elevationMeters: 0.0,
          color: "#94a3b8",
          origin: "polygon",
          points: [
            { x: 0.0, y: 0.38 },
            { x: 1.0, y: 0.38 },
            { x: 1.0, y: 0.62 },
            { x: 0.0, y: 0.62 },
          ],
        },
        {
          id: "d_nw",
          name: "Andén Noroeste",
          type: "anden",
          elevationMeters: 0.15,
          color: "#00f0ff",
          origin: "wand",
          points: [
            { x: 0.0, y: 0.0 },
            { x: 0.376, y: 0.0 },
            { x: 0.376, y: 0.376 },
            { x: 0.0, y: 0.376 },
          ],
        },
        {
          id: "d_ne",
          name: "Andén Noreste",
          type: "anden",
          elevationMeters: 0.15,
          color: "#00f0ff",
          origin: "wand",
          points: [
            { x: 0.624, y: 0.0 },
            { x: 1.0, y: 0.0 },
            { x: 1.0, y: 0.376 },
            { x: 0.624, y: 0.376 },
          ],
        },
        {
          id: "d_sw",
          name: "Andén Suroeste",
          type: "anden",
          elevationMeters: 0.15,
          color: "#00f0ff",
          origin: "wand",
          points: [
            { x: 0.0, y: 0.624 },
            { x: 0.376, y: 0.624 },
            { x: 0.376, y: 1.0 },
            { x: 0.0, y: 1.0 },
          ],
        },
        {
          id: "d_se",
          name: "Andén Sureste",
          type: "anden",
          elevationMeters: 0.15,
          color: "#00f0ff",
          origin: "wand",
          points: [
            { x: 0.624, y: 0.624 },
            { x: 1.0, y: 0.624 },
            { x: 1.0, y: 1.0 },
            { x: 0.624, y: 1.0 },
          ],
        },
      ],
      objects: [
        {
          id: "demo_veh_01",
          catalogId: "sedan",
          name: "Vehículo 1 (Sedán Azul)",
          category: "vehiculo",
          normX: 0.545,
          normY: 0.42,
          rotationDeg: 90.0,
          deviationAngleDeg: 0.0,
          baseElevationMeters: 0.0,
          zoneId: "d_calz",
          isAccidentInvolved: true,
          role: "impactante",
          color: "#2563eb",
          kinematics: {
            speedKmh: 55.0,
            brakeDistanceM: 12.5,
            trajectoryPoints: [
              { normX: 0.545, normY: 0.22, type: "start", speedKmh: 55.0 },
              {
                normX: 0.545,
                normY: 0.34,
                type: "brake_start",
                speedKmh: 55.0,
              },
              {
                normX: 0.545,
                normY: 0.48,
                type: "impact_point",
                speedKmh: 55.0,
              },
              { normX: 0.545, normY: 0.52, type: "final_rest", speedKmh: 55.0 },
            ],
          },
        },
        {
          id: "demo_veh_02",
          catalogId: "sedan",
          name: "Vehículo 2 (Sedán Detenido)",
          category: "vehiculo",
          normX: 0.545,
          normY: 0.49,
          rotationDeg: 90.0,
          deviationAngleDeg: 0.0,
          baseElevationMeters: 0.0,
          zoneId: "d_calz",
          isAccidentInvolved: true,
          role: "impactado",
          color: "#1d4ed8",
          kinematics: null,
        },
      ],
    };
  }

  return { generateAerialMapTexture, makeDefault2DScene };
});
