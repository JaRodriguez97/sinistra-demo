/**
 * scene3d_recorder.js
 * Módulo especializado en la captura y grabación de vídeo del canvas 3D de Three.js.
 * Utiliza MediaRecorder, MP4 con códec H.264 (avc1), bitrate forense y límite de 300s (5 min).
 */

export class Scene3dRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.stream = null;
    this.isRecording = false;
    this.startTime = 0;
    this.timerInterval = null;
    this.maxDurationSec = 300; // 5 minutos
    this.mimeType = "";
    this.onTick = null;
    this.onStop = null;
  }

  /**
   * Determina el mejor formato y códec de vídeo soportado por el navegador.
   * Prioriza MP4 con H.264 (avc1) para máxima compatibilidad al compartir en móviles y mensajería.
   */
  static getBestMimeType() {
    if (typeof MediaRecorder === "undefined") {
      return null;
    }

    const candidateTypes = [
      "video/mp4;codecs=avc1",
      "video/mp4;codecs=avc1.42E01E",
      "video/mp4;codecs=h264",
      "video/mp4",
      "video/webm;codecs=h264",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];

    for (const type of candidateTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return "";
  }

  /**
   * Genera una cadena formateada con fecha, hora, minutos y segundos locales.
   * Formato: YYYY-MM-DD_HH-mm-ss
   */
  static getFormattedTimestamp() {
    const pad = (n) => String(n).padStart(2, "0");
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const timeStr = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    return `${dateStr}_${timeStr}`;
  }

  /**
   * Inicia la captura del canvas y la codificación de vídeo.
   * @param {HTMLCanvasElement} canvas - Elemento canvas Three.js
   * @param {Object} options - { onTick, onStop, maxDurationSec }
   */
  start(canvas, options = {}) {
    if (this.isRecording) {
      console.warn("Scene3dRecorder: Ya hay una grabación en curso.");
      return false;
    }

    if (!canvas || typeof canvas.captureStream !== "function") {
      console.error(
        "Scene3dRecorder: El canvas no soporta captureStream() o es inválido.",
      );
      return false;
    }

    this.mimeType = Scene3dRecorder.getBestMimeType();
    if (!this.mimeType && typeof MediaRecorder !== "undefined") {
      this.mimeType = ""; // El navegador elegirá su códec por defecto
    }

    try {
      // 30 FPS constantes para el flujo de vídeo
      this.stream = canvas.captureStream(30);
    } catch (err) {
      console.error("Error al obtener stream del canvas:", err);
      return false;
    }

    this.recordedChunks = [];
    this.maxDurationSec = options.maxDurationSec || 300;
    this.onTick = options.onTick || null;
    this.onStop = options.onStop || null;

    const recorderOptions = {
      videoBitsPerSecond: 7_500_000, // 7.5 Mbps para alta calidad y definición pericial
    };
    if (this.mimeType) {
      recorderOptions.mimeType = this.mimeType;
    }

    try {
      this.mediaRecorder = new MediaRecorder(this.stream, recorderOptions);
    } catch (err) {
      console.warn(
        "Fallo al instanciar MediaRecorder con opciones, reintentando con valores estándar:",
        err,
      );
      try {
        this.mediaRecorder = new MediaRecorder(this.stream);
      } catch (errFallback) {
        console.error("No se pudo iniciar MediaRecorder:", errFallback);
        return false;
      }
    }

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      this._finalizeRecording();
    };

    // Solicita chunks cada 1000ms para evitar acumulación excesiva en memoria
    this.mediaRecorder.start(1000);
    this.isRecording = true;
    this.startTime = Date.now();

    // Temporizador preciso con actualización cada 250ms
    this.timerInterval = setInterval(() => {
      if (!this.isRecording) return;
      const elapsedSec = (Date.now() - this.startTime) / 1000;
      const remainingSec = Math.max(0, this.maxDurationSec - elapsedSec);

      if (typeof this.onTick === "function") {
        this.onTick({
          elapsedSec,
          remainingSec,
          progressPct: Math.min(100, (elapsedSec / this.maxDurationSec) * 100),
        });
      }

      // Límite de 5 minutos alcanzado: finalizar automáticamente
      if (elapsedSec >= this.maxDurationSec) {
        this.stop();
      }
    }, 250);

    return true;
  }

  /**
   * Detiene la grabación y dispara el guardado del archivo.
   */
  stop() {
    if (!this.isRecording) return;
    this.isRecording = false;

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
  }

  /**
   * Finaliza el ensamblado del Blob y desencadena la descarga del vídeo.
   */
  _finalizeRecording() {
    const elapsedSec = (Date.now() - this.startTime) / 1000;
    const finalMime = this.mimeType || "video/mp4";
    const blob = new Blob(this.recordedChunks, { type: finalMime });

    // Determinar extensión del archivo (prioriza .mp4)
    const isMp4 = finalMime.includes("mp4");
    const ext = isMp4 ? "mp4" : "webm";
    const timestamp = Scene3dRecorder.getFormattedTimestamp();
    const filename = `sinistra_reconstruccion_${timestamp}.${ext}`;

    // Descarga automática en navegador
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 2000);

    // Liberar tracks del stream
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (typeof this.onStop === "function") {
      this.onStop({
        blob,
        filename,
        durationSec: elapsedSec,
        mimeType: finalMime,
      });
    }

    this.recordedChunks = [];
  }
}
