/**
 * render_2d_vehicle_models.js
 * Modelos y siluetas vectoriales de alta fidelidad para vehículos en 2D (Sinistra 3D).
 * Compatible con scripts clásicos en navegador (<script src="...">) y con módulos ESM.
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.drawVehicleSilhouette2D = factory().drawVehicleSilhouette2D;
  }
})(typeof self !== "undefined" ? self : this, function () {
  function drawVehicleSilhouette2D({
    ctx,
    cId,
    obj,
    halfL,
    halfW,
    lenPx,
    widthPx,
    vColor,
    strokeColor,
    strokeW,
    zoom,
  }) {
    // ---------------- A.1 TRACTOMULA / ARTICULADO (16.5m) ----------------
    if (cId === "tractomula") {
      const cabL = lenPx * (3.6 / 16.5);
      const cabW = widthPx * 0.95;
      const cabFrontX = halfL;
      const cabRearX = halfL - cabL;
      const trailerL = lenPx * (13.2 / 16.5);
      const trailerRearX = -halfL;

      // Semirremolque
      ctx.fillStyle = "#e2e8f0";
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeW;
      ctx.beginPath();
      ctx.roundRect(trailerRearX, -halfW, trailerL, widthPx, 2 / zoom);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = "rgba(100, 116, 139, 0.45)";
      ctx.lineWidth = 1 / zoom;
      const numRibs = 8;
      for (let i = 1; i < numRibs; i++) {
        const rx = trailerRearX + (trailerL / numRibs) * i;
        ctx.beginPath();
        ctx.moveTo(rx, -halfW + 2 / zoom);
        ctx.lineTo(rx, halfW - 2 / zoom);
        ctx.stroke();
      }

      // Triple eje
      ctx.fillStyle = "#0f172a";
      const tWheelL = lenPx * 0.055;
      const tWheelW = widthPx * 0.16;
      for (let e = 0; e < 3; e++) {
        const wx = trailerRearX + lenPx * 0.08 + e * (lenPx * 0.065);
        ctx.fillRect(wx, -halfW - tWheelW * 0.4, tWheelL, tWheelW);
        ctx.fillRect(wx, halfW - tWheelW * 0.6, tWheelL, tWheelW);
      }

      ctx.fillStyle = "#ef4444";
      ctx.fillRect(trailerRearX, -halfW + 2 / zoom, 3 / zoom, 4 / zoom);
      ctx.fillRect(trailerRearX, halfW - 6 / zoom, 3 / zoom, 4 / zoom);
      ctx.fillStyle = "#eab308";
      ctx.fillRect(trailerRearX, -2 / zoom, 2 / zoom, 4 / zoom);

      // Cabina tractora
      ctx.fillStyle = vColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeW;
      ctx.beginPath();
      ctx.roundRect(cabRearX, -cabW / 2, cabL, cabW, 4 / zoom);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.beginPath();
      ctx.roundRect(
        cabRearX + cabL * 0.5,
        -cabW * 0.42,
        cabL * 0.35,
        cabW * 0.84,
        2 / zoom,
      );
      ctx.fill();

      ctx.fillStyle = "#cbd5e1";
      ctx.fillRect(
        cabRearX + cabL * 0.1,
        -cabW / 2 - 3 / zoom,
        4 / zoom,
        3 / zoom,
      );
      ctx.fillRect(cabRearX + cabL * 0.1, cabW / 2, 4 / zoom, 3 / zoom);

      ctx.fillStyle = "#64748b";
      ctx.fillRect(
        cabRearX - lenPx * 0.04,
        -halfW - 2 / zoom,
        lenPx * 0.08,
        4 / zoom,
      );
      ctx.fillRect(
        cabRearX - lenPx * 0.04,
        halfW - 2 / zoom,
        lenPx * 0.08,
        4 / zoom,
      );

      ctx.fillStyle = "#fef08a";
      ctx.fillRect(cabFrontX - 3 / zoom, -cabW * 0.45, 3 / zoom, 4 / zoom);
      ctx.fillRect(
        cabFrontX - 3 / zoom,
        cabW * 0.45 - 4 / zoom,
        3 / zoom,
        4 / zoom,
      );

      ctx.fillStyle = "#0f172a";
      const cWheelL = lenPx * 0.055;
      const cWheelW = widthPx * 0.16;
      ctx.fillRect(
        cabFrontX - cabL * 0.25,
        -cabW / 2 - cWheelW * 0.4,
        cWheelL,
        cWheelW,
      );
      ctx.fillRect(
        cabFrontX - cabL * 0.25,
        cabW / 2 - cWheelW * 0.6,
        cWheelL,
        cWheelW,
      );
      ctx.fillRect(
        cabRearX + lenPx * 0.02,
        -cabW / 2 - cWheelW * 0.4,
        cWheelL,
        cWheelW,
      );
      ctx.fillRect(
        cabRearX + lenPx * 0.02,
        cabW / 2 - cWheelW * 0.6,
        cWheelL,
        cWheelW,
      );

      // ---------------- A.2 CAMIÓN DE CARGA (8.5m) ----------------
    } else if (cId === "truck") {
      const cabL = lenPx * 0.32;
      const cargoL = lenPx * 0.64;
      const cabFrontX = halfL;
      const cabRearX = halfL - cabL;
      const cargoRearX = -halfL;

      ctx.fillStyle = "#f1f5f9";
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeW;
      ctx.beginPath();
      ctx.roundRect(cargoRearX, -halfW, cargoL, widthPx, 2 / zoom);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.moveTo(cargoRearX, -halfW * 0.5);
      ctx.lineTo(cargoRearX, halfW * 0.5);
      ctx.stroke();

      ctx.fillStyle = vColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeW;
      ctx.beginPath();
      ctx.roundRect(cabRearX, -halfW * 0.94, cabL, widthPx * 0.94, 3 / zoom);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.beginPath();
      ctx.roundRect(
        cabRearX + cabL * 0.45,
        -halfW * 0.8,
        cabL * 0.38,
        widthPx * 0.8,
        2 / zoom,
      );
      ctx.fill();

      ctx.fillStyle = "#0f172a";
      const wL = lenPx * 0.11;
      const wW = widthPx * 0.15;
      ctx.fillRect(cabFrontX - cabL * 0.35, -halfW - wW * 0.4, wL, wW);
      ctx.fillRect(cabFrontX - cabL * 0.35, halfW - wW * 0.6, wL, wW);
      ctx.fillRect(cargoRearX + lenPx * 0.12, -halfW - wW * 0.4, wL, wW);
      ctx.fillRect(cargoRearX + lenPx * 0.12, halfW - wW * 0.6, wL, wW);

      ctx.fillStyle = "#fef08a";
      ctx.fillRect(cabFrontX - 3 / zoom, -halfW * 0.85, 3 / zoom, 4 / zoom);
      ctx.fillRect(
        cabFrontX - 3 / zoom,
        halfW * 0.85 - 4 / zoom,
        3 / zoom,
        4 / zoom,
      );
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(cargoRearX, -halfW + 2 / zoom, 3 / zoom, 4 / zoom);
      ctx.fillRect(cargoRearX, halfW - 6 / zoom, 3 / zoom, 4 / zoom);

      // ---------------- A.3 AUTOBÚS URBANO (10.5m) ----------------
    } else if (cId === "bus") {
      ctx.fillStyle = vColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeW;
      ctx.beginPath();
      ctx.roundRect(-halfL, -halfW, lenPx, widthPx, 5 / zoom);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.beginPath();
      ctx.roundRect(
        halfL - lenPx * 0.14,
        -halfW * 0.85,
        lenPx * 0.12,
        widthPx * 0.85,
        2 / zoom,
      );
      ctx.fill();

      ctx.beginPath();
      ctx.roundRect(
        -halfL + 2 / zoom,
        -halfW * 0.75,
        lenPx * 0.05,
        widthPx * 0.75,
        1 / zoom,
      );
      ctx.fill();

      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      const numWindows = 6;
      const winL = lenPx * 0.09;
      const winW = widthPx * 0.18;
      const startX = -halfL + lenPx * 0.14;
      for (let i = 0; i < numWindows; i++) {
        const wx = startX + i * (lenPx * 0.115);
        ctx.fillRect(wx, -halfW + 2 / zoom, winL, winW);
        ctx.fillRect(wx, halfW - winW - 2 / zoom, winL, winW);
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.fillRect(-halfL * 0.6, -halfW * 0.35, lenPx * 0.7, widthPx * 0.7);

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-halfL * 0.3, -widthPx * 0.2, lenPx * 0.08, widthPx * 0.4);
      ctx.fillRect(halfL * 0.1, -widthPx * 0.2, lenPx * 0.08, widthPx * 0.4);

      ctx.fillStyle = "#0f172a";
      const wL = lenPx * 0.09;
      const wW = widthPx * 0.14;
      ctx.fillRect(halfL * 0.5, -halfW - wW * 0.4, wL, wW);
      ctx.fillRect(halfL * 0.5, halfW - wW * 0.6, wL, wW);
      ctx.fillRect(-halfL * 0.65, -halfW - wW * 0.4, wL, wW);
      ctx.fillRect(-halfL * 0.65, halfW - wW * 0.6, wL, wW);

      ctx.fillStyle = "#fef08a";
      ctx.fillRect(halfL - 3 / zoom, -halfW + 3 / zoom, 3 / zoom, 4 / zoom);
      ctx.fillRect(halfL - 3 / zoom, halfW - 7 / zoom, 3 / zoom, 4 / zoom);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(-halfL, -halfW + 3 / zoom, 3 / zoom, 4 / zoom);
      ctx.fillRect(-halfL, halfW - 7 / zoom, 3 / zoom, 4 / zoom);

      // ---------------- A.4 CAMIONETA / SUV (4.85m) ----------------
    } else if (cId === "suv") {
      ctx.fillStyle = vColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeW;
      ctx.beginPath();
      ctx.roundRect(-halfL, -halfW, lenPx, widthPx, 5 / zoom);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.moveTo(halfL * 0.3, -halfW * 0.45);
      ctx.lineTo(halfL * 0.85, -halfW * 0.45);
      ctx.moveTo(halfL * 0.3, halfW * 0.45);
      ctx.lineTo(halfL * 0.85, halfW * 0.45);
      ctx.stroke();

      const cabL = lenPx * 0.58;
      const cabW = widthPx * 0.82;
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.beginPath();
      ctx.roundRect(
        -halfL + lenPx * 0.18,
        -cabW / 2,
        cabL,
        cabW,
        3 / zoom,
      );
      ctx.fill();

      ctx.fillStyle = vColor;
      ctx.beginPath();
      ctx.roundRect(
        -halfL + lenPx * 0.25,
        -cabW * 0.38,
        cabL * 0.72,
        cabW * 0.76,
        2 / zoom,
      );
      ctx.fill();

      ctx.fillStyle = "#cbd5e1";
      ctx.fillRect(
        -halfL + lenPx * 0.24,
        -cabW * 0.42,
        cabL * 0.65,
        2.5 / zoom,
      );
      ctx.fillRect(
        -halfL + lenPx * 0.24,
        cabW * 0.42 - 2.5 / zoom,
        cabL * 0.65,
        2.5 / zoom,
      );

      ctx.fillStyle = "#0f172a";
      const wL = lenPx * 0.2;
      const wW = widthPx * 0.16;
      ctx.fillRect(halfL * 0.4, -halfW - wW * 0.4, wL, wW);
      ctx.fillRect(halfL * 0.4, halfW - wW * 0.6, wL, wW);
      ctx.fillRect(-halfL * 0.7, -halfW - wW * 0.4, wL, wW);
      ctx.fillRect(-halfL * 0.7, halfW - wW * 0.6, wL, wW);

      ctx.fillStyle = "#fef08a";
      ctx.fillRect(halfL - 3 / zoom, -halfW + 2 / zoom, 3 / zoom, 5 / zoom);
      ctx.fillRect(halfL - 3 / zoom, halfW - 7 / zoom, 3 / zoom, 5 / zoom);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(-halfL, -halfW + 3 / zoom, 3 / zoom, 4 / zoom);
      ctx.fillRect(-halfL, halfW - 7 / zoom, 3 / zoom, 4 / zoom);

      // ---------------- A.5 MOTOCICLETA (2.1m) ----------------
    } else if (cId === "moto") {
      ctx.fillStyle = "#0f172a";
      const wL = lenPx * 0.32;
      const wW = widthPx * 0.35;
      ctx.fillRect(halfL * 0.5, -wW / 2, wL, wW);
      ctx.fillRect(-halfL * 0.85, -wW / 2, wL, wW);

      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 2 / zoom;
      ctx.beginPath();
      ctx.moveTo(halfL * 0.6, 0);
      ctx.lineTo(halfL * 0.25, 0);
      ctx.stroke();

      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 2.5 / zoom;
      ctx.beginPath();
      ctx.moveTo(halfL * 0.3, -halfW);
      ctx.lineTo(halfL * 0.3, halfW);
      ctx.stroke();

      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(halfL * 0.32, -halfW - 2 / zoom, 3 / zoom, 2.5 / zoom);
      ctx.fillRect(halfL * 0.32, halfW, 3 / zoom, 2.5 / zoom);

      ctx.fillStyle = vColor;
      ctx.beginPath();
      ctx.ellipse(
        halfL * 0.05,
        0,
        lenPx * 0.22,
        widthPx * 0.42,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.2 / zoom;
      ctx.stroke();

      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.roundRect(
        -halfL * 0.45,
        -widthPx * 0.32,
        lenPx * 0.38,
        widthPx * 0.64,
        3 / zoom,
      );
      ctx.fill();

      ctx.fillStyle = "#cbd5e1";
      ctx.fillRect(-halfL * 0.65, halfW * 0.35, lenPx * 0.45, widthPx * 0.2);

      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.arc(halfL * 0.85, 0, 3 / zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(-halfL * 0.88, -2 / zoom, 2.5 / zoom, 4 / zoom);

      // ---------------- A.6 BICICLETA (1.75m) ----------------
    } else if (cId === "bici") {
      const wL = lenPx * 0.36;
      const wW = Math.max(2, widthPx * 0.16);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(halfL * 0.55, -wW / 2, wL, wW);
      ctx.fillRect(-halfL * 0.85, -wW / 2, wL, wW);

      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 2 / zoom;
      ctx.beginPath();
      ctx.moveTo(halfL * 0.4, -halfW);
      ctx.lineTo(halfL * 0.4, halfW);
      ctx.stroke();

      ctx.strokeStyle = vColor;
      ctx.lineWidth = 2.5 / zoom;
      ctx.beginPath();
      ctx.moveTo(halfL * 0.4, 0);
      ctx.lineTo(-halfL * 0.35, 0);
      ctx.stroke();

      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.ellipse(
        -halfL * 0.15,
        0,
        lenPx * 0.12,
        widthPx * 0.28,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      ctx.fillStyle = "#cbd5e1";
      ctx.fillRect(-halfL * 0.05, -halfW * 0.6, 2 / zoom, widthPx * 1.2);

      // ---------------- A.7 AUTOMÓVIL SEDÁN / PREDETERMINADO ----------------
    } else {
      ctx.beginPath();
      ctx.roundRect(-halfL, -halfW, lenPx, widthPx, 4 / zoom);
      ctx.fillStyle = vColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeW;
      ctx.stroke();

      const cabL = lenPx * 0.52;
      const cabW = widthPx * 0.76;
      ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
      ctx.beginPath();
      ctx.roundRect(-halfL + lenPx * 0.28, -cabW / 2, cabL, cabW, 2 / zoom);
      ctx.fill();

      ctx.fillStyle = vColor;
      ctx.beginPath();
      ctx.roundRect(
        -halfL + lenPx * 0.35,
        -cabW * 0.38,
        cabL * 0.65,
        cabW * 0.76,
        1 / zoom,
      );
      ctx.fill();

      ctx.fillStyle = "#fef08a";
      ctx.fillRect(halfL - 3 / zoom, -halfW + 2 / zoom, 3 / zoom, 4 / zoom);
      ctx.fillRect(halfL - 3 / zoom, halfW - 6 / zoom, 3 / zoom, 4 / zoom);

      ctx.fillStyle = "#ef4444";
      ctx.fillRect(-halfL, -halfW + 2 / zoom, 3 / zoom, 4 / zoom);
      ctx.fillRect(-halfL, halfW - 6 / zoom, 3 / zoom, 4 / zoom);

      const wheelL = lenPx * 0.18;
      const wheelW = Math.max(2, widthPx * 0.12);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(halfL * 0.45, -halfW - wheelW / 2, wheelL, wheelW);
      ctx.fillRect(halfL * 0.45, halfW - wheelW / 2, wheelL, wheelW);
      ctx.fillRect(-halfL * 0.75, -halfW - wheelW / 2, wheelL, wheelW);
      ctx.fillRect(-halfL * 0.75, halfW - wheelW / 2, wheelL, wheelW);
    }
  }

  return { drawVehicleSilhouette2D };
});
