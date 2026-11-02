/**
 * Sinistra 3D - Módulo de Delimitación de Zona 2D
 * Prototipo para reconstrucción forense de accidentes de tránsito
 */

// Coordenadas iniciales: Santiago de Cali, Colombia
const CALI_CONFIG = {
  lng: -76.531985,
  lat: 3.425347,
  zoom: 12, // Vista panorámica amplia
};

// Estado centralizado de la aplicación
const state = {
  selectedLngLat: null,
  currentZoneSizeMeters: 100, // 100m como tamaño estándar inicial
  zoneBearing: 0, // Ángulo de orientación de la zona en grados
  marker: null,
  baseMapStyle: "google-streets", // Google Calles sin negocios activo por defecto para trabajo forense
};

// Referencias a elementos del DOM
const ui = {
  statusBanner: document.getElementById("statusBanner"),
  statusText: document.getElementById("statusText"),
  latValue: document.getElementById("latValue"),
  lngValue: document.getElementById("lngValue"),
  summaryDim: document.getElementById("summaryDim"),
  summaryArea: document.getElementById("summaryArea"),
  rotationValue: document.getElementById("rotationValue"),
  rotationRange: document.getElementById("rotationRange"),
  sliderAngleText: document.getElementById("sliderAngleText"),
  btnRotateStepFastLeft: document.getElementById("btnRotateStepFastLeft"),
  btnRotateLeft: document.getElementById("btnRotateLeft"),
  btnRotateReset: document.getElementById("btnRotateReset"),
  btnRotateRight: document.getElementById("btnRotateRight"),
  btnRotateStepFastRight: document.getElementById("btnRotateStepFastRight"),
  forensicCompassWidget: document.getElementById("forensicCompassWidget"),
  compassDial: document.getElementById("compassDial"),
  compassNeedle: document.getElementById("compassNeedle"),
  btnMapRotateLeft: document.getElementById("btnMapRotateLeft"),
  btnMapRotateRight: document.getElementById("btnMapRotateRight"),
  btnCrop: document.getElementById("btnCrop"),
  btnRecenter: document.getElementById("btnRecenter"),
  btnClear: document.getElementById("btnClear"),
  btnGoCali: document.getElementById("btnGoCali"),
  cropModalOverlay: document.getElementById("cropModalOverlay"),
  cropCanvas: document.getElementById("cropCanvas"),
  cropModalDim: document.getElementById("cropModalDim"),
  cropModalRes: document.getElementById("cropModalRes"),
  btnImplementCrop: document.getElementById("btnImplementCrop"),
  btnDownloadCrop: document.getElementById("btnDownloadCrop"),
  btnCloseCropModal: document.getElementById("btnCloseCropModal"),
  btnCloseCropSecondary: document.getElementById("btnCloseCropSecondary"),
  sizeButtons: document.querySelectorAll("[data-size]"),
  styleButtons: document.querySelectorAll("[data-map-style]"),
  cursorCoords: document.getElementById("cursorCoords"),
  compassHeading: document.getElementById("compassHeading"),
  toast: document.getElementById("toast"),
  toastMessage: document.getElementById("toastMessage"),
  errorOverlay: document.getElementById("errorOverlay"),
  errorMessage: document.getElementById("errorMessage"),
};

// Mensaje de notificación tipo toast
let toastTimeout = null;
function showToast(msg, duration = 2400) {
  if (toastTimeout) clearTimeout(toastTimeout);
  ui.toastMessage.textContent = msg;
  ui.toast.classList.add("show");
  toastTimeout = setTimeout(() => {
    ui.toast.classList.remove("show");
  }, duration);
}

// Validación de carga de la librería MapLibre
function checkMapLibreAvailability() {
  if (typeof window.maplibregl === "undefined") {
    ui.errorOverlay.style.display = "flex";
    ui.errorMessage.textContent =
      "No se pudo cargar la librería MapLibre GL JS desde el CDN. Verifique su conexión de red.";
    return false;
  }
  return true;
}

if (!checkMapLibreAvailability()) {
  console.error("Entorno no compatible con MapLibre GL JS");
} else {
  initApp();
}

function initApp() {
  /**
   * Estilo cartográfico basado en OpenStreetMap
   * Se utiliza OpenFreeMap (Liberty), una fuente pública y libre de teselas vectoriales
   * basada 100% en datos de OpenStreetMap, optimizada para MapLibre GL sin API key.
   */
  const osmMapStyle = "https://tiles.openfreemap.org/styles/liberty";

  // Instanciación del mapa
  let map;
  try {
    map = new maplibregl.Map({
      container: "map",
      style: osmMapStyle,
      center: [CALI_CONFIG.lng, CALI_CONFIG.lat],
      zoom: CALI_CONFIG.zoom,
      pitch: 0,
      bearing: 0,
      maxPitch: 60,
      maxZoom: 22,
      attributionControl: false,
      preserveDrawingBuffer: true,
    });
  } catch (err) {
    ui.errorOverlay.style.display = "flex";
    ui.errorMessage.textContent = "Error al instanciar el mapa: " + err.message;
    return;
  }

  // Controles integrados de navegación, escala métrica y atribución
  map.addControl(
    new maplibregl.NavigationControl({
      showCompass: false,
      visualizePitch: true,
    }),
    "top-right",
  );

  map.addControl(
    new maplibregl.ScaleControl({
      maxWidth: 120,
      unit: "metric",
    }),
    "bottom-left",
  );

  map.addControl(
    new maplibregl.AttributionControl({
      compact: false,
    }),
    "bottom-right",
  );

  /**
   * Garantiza que la fuente GeoJSON y las capas de dibujo existan en el mapa.
   * Evita problemas de carrera asíncrona si el usuario hace clic antes de que el estilo termine de cargar.
   */
  function ensureZoneLayers() {
    if (!map.getSource("accident-zone-source")) {
      map.addSource("accident-zone-source", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      // Capa de relleno semitransparente
      map.addLayer({
        id: "accident-zone-fill",
        type: "fill",
        source: "accident-zone-source",
        paint: {
          "fill-color": "#0284c7",
          "fill-opacity": 0.28,
        },
      });

      // Capa de contorno principal brillante
      map.addLayer({
        id: "accident-zone-line",
        type: "line",
        source: "accident-zone-source",
        paint: {
          "line-color": "#00f0ff",
          "line-width": 3.0,
        },
      });

      // Capa de sombra de contraste
      map.addLayer({
        id: "accident-zone-line-shadow",
        type: "line",
        source: "accident-zone-source",
        paint: {
          "line-color": "#0f172a",
          "line-width": 1.2,
          "line-gap-width": 3.0,
          "line-opacity": 0.65,
        },
      });
    }
  }

  /**
   * Cálculo geográfico de un rectángulo cerrado de S × S metros centrado en (lng, lat)
   * y orientado con un ángulo de rotación (bearingDeg).
   * Retorna la Feature GeoJSON y el bounding box geográfico para fitBounds.
   */
  function calculateGeodesicSquare(
    centerLng,
    centerLat,
    sizeMeters,
    bearingDeg = 0,
  ) {
    const halfSize = sizeMeters / 2;
    const earthRadius = 6378137; // Radio ecuatorial WGS84 en metros

    const latRad = (centerLat * Math.PI) / 180;
    const cosLat = Math.cos(latRad);
    const safeCosLat = Math.max(Math.abs(cosLat), 0.0001);

    // Ángulo de orientación en radianes (sentido horario desde el Norte)
    const theta = (bearingDeg * Math.PI) / 180;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);

    // 4 esquinas en metros locales de pantalla:
    // u = eje horizontal (-halfSize a +halfSize)
    // v = eje vertical (-halfSize a +halfSize)
    const localCorners = [
      { u: -halfSize, v: halfSize }, // Superior Izquierda
      { u: halfSize, v: halfSize }, // Superior Derecha
      { u: halfSize, v: -halfSize }, // Inferior Derecha
      { u: -halfSize, v: -halfSize }, // Inferior Izquierda
    ];

    let minLng = Infinity,
      maxLng = -Infinity,
      minLat = Infinity,
      maxLat = -Infinity;

    const ring = localCorners.map((corner) => {
      // Rotación del plano local por el ángulo bearing
      const deltaEast = corner.u * cosTheta + corner.v * sinTheta;
      const deltaNorth = -corner.u * sinTheta + corner.v * cosTheta;

      // Conversión de desplazamiento métrico a grados geográficos
      const deltaLat = (deltaNorth / earthRadius) * (180 / Math.PI);
      const deltaLng =
        (deltaEast / (earthRadius * safeCosLat)) * (180 / Math.PI);

      const ptLng = centerLng + deltaLng;
      const ptLat = centerLat + deltaLat;

      if (ptLng < minLng) minLng = ptLng;
      if (ptLng > maxLng) maxLng = ptLng;
      if (ptLat < minLat) minLat = ptLat;
      if (ptLat > maxLat) maxLat = ptLat;

      return [ptLng, ptLat];
    });

    // Cerrar el polígono repitiendo el primer vértice
    ring.push([ring[0][0], ring[0][1]]);

    return {
      geojson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              sizeMeters: sizeMeters,
              areaM2: sizeMeters * sizeMeters,
              bearingDeg: bearingDeg,
              centerLng: centerLng,
              centerLat: centerLat,
            },
            geometry: {
              type: "Polygon",
              coordinates: [ring],
            },
          },
        ],
      },
      bounds: [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
    };
  }

  /**
   * Creación de elemento DOM para el marcador con animación de pulso radar
   */
  function createMarkerElement() {
    const el = document.createElement("div");
    el.className = "custom-accident-marker";
    el.title = "Epicentro del accidente";

    const pulse = document.createElement("div");
    pulse.className = "marker-pulse";

    const pin = document.createElement("div");
    pin.className = "marker-pin";

    const dot = document.createElement("div");
    dot.className = "marker-center-dot";

    pin.appendChild(dot);
    el.appendChild(pulse);
    el.appendChild(pin);

    return el;
  }

  /**
   * Inicializa las capas ráster de Google Maps: Calles (sin negocios) e Híbrido (satelital de validación)
   */
  function ensureBaseRasterLayers() {
    // 1. Google Calles: Mapa vial nítido sin marcas comerciales ni tiendas (opción 2 apistyle=s.t:2|p.v:off)
    if (!map.getSource("google-streets-source")) {
      map.addSource("google-streets-source", {
        type: "raster",
        tiles: [
          "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&apistyle=s.t:2|p.v:off",
        ],
        tileSize: 256,
        maxzoom: 20,
      });
      map.addLayer({
        id: "google-streets-layer",
        type: "raster",
        source: "google-streets-source",
        layout: { visibility: "visible" },
      });
    }

    // 2. Google Híbrido: Satélite con vías para referencia visual de la realidad
    if (!map.getSource("google-hybrid-source")) {
      map.addSource("google-hybrid-source", {
        type: "raster",
        tiles: ["https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"],
        tileSize: 256,
        maxzoom: 20,
      });
      map.addLayer({
        id: "google-hybrid-layer",
        type: "raster",
        source: "google-hybrid-source",
        layout: { visibility: "none" },
      });
    }
  }

  /**
   * Cambia dinámicamente la capa base activa del mapa
   */
  function setBaseMapStyle(styleKey) {
    state.baseMapStyle = styleKey;

    const isStreets = styleKey === "google-streets";
    const isHybrid = styleKey === "google-hybrid";

    if (map.getLayer("google-streets-layer")) {
      map.setLayoutProperty(
        "google-streets-layer",
        "visibility",
        isStreets ? "visible" : "none",
      );
    }
    if (map.getLayer("google-hybrid-layer")) {
      map.setLayoutProperty(
        "google-hybrid-layer",
        "visibility",
        isHybrid ? "visible" : "none",
      );
    }

    // Actualizar botones de la UI
    ui.styleButtons.forEach((btn) => {
      const active = btn.getAttribute("data-map-style") === styleKey;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
    });

    const titles = {
      "google-streets": "🗺️ Google Calles (Sin Comercios ni Negocios)",
      "google-hybrid": "🛰️ Google Híbrido (Referencia Satelital)",
    };
    showToast(`Capa activada: ${titles[styleKey] || styleKey}`);
  }

  // Registro de capas cuando el mapa esté listo
  map.on("load", () => {
    ensureBaseRasterLayers();
    ensureZoneLayers();
    if (state.selectedLngLat) {
      updateAccidentZone(state.selectedLngLat, false);
    }
  });

  // Manejo de eventos de error de red
  map.on("error", (e) => {
    if (
      e &&
      e.error &&
      (e.error.status === 404 || e.error.message?.includes("aborted"))
    ) {
      return;
    }
    console.warn("Evento de notificación MapLibre:", e);
  });

  // Actualizar lectura de brújula al rotar el mapa
  map.on("rotate", () => {
    const b = map.getBearing();
    const normB = ((b % 360) + 360) % 360;
    ui.compassHeading.textContent = `Brújula: ${normB.toFixed(1)}°`;
  });

  /**
   * Actualiza o crea la zona de trabajo y el marcador
   * @param {Object} lngLat { lng, lat }
   * @param {Boolean} autoFit Si debe ajustar el zoom automáticamente para ocupar la pantalla verticalmente
   */
  function updateAccidentZone(lngLat, autoFit = false) {
    if (!lngLat) return;

    const { lng, lat } = lngLat;
    state.selectedLngLat = { lng, lat };

    // 1. Manejo de marcador único (sin duplicación)
    if (!state.marker) {
      const markerEl = createMarkerElement();
      state.marker = new maplibregl.Marker({
        element: markerEl,
        anchor: "center",
      })
        .setLngLat([lng, lat])
        .addTo(map);
    } else {
      state.marker.setLngLat([lng, lat]);
    }

    // 2. Cálculo geográfico con la orientación (bearing) actual de la zona
    const { geojson, bounds } = calculateGeodesicSquare(
      lng,
      lat,
      state.currentZoneSizeMeters,
      state.zoneBearing,
    );

    // 3. Asegurar capas y actualizar datos de la fuente en el mapa
    try {
      ensureZoneLayers();
    } catch (e) {
      console.warn("Capa pendiente de estilo:", e);
    }

    const source = map.getSource("accident-zone-source");
    if (source) {
      source.setData(geojson);
    }

    // 4. Actualización de interfaz con seis decimales
    ui.latValue.textContent = lat.toFixed(6) + "°";
    ui.latValue.classList.remove("empty");

    ui.lngValue.textContent = lng.toFixed(6) + "°";
    ui.lngValue.classList.remove("empty");

    // Actualizar interfaz de rotación completa
    updateRotationUI(state.zoneBearing);

    // Estado visual activo
    ui.statusBanner.className = "status-banner active";
    ui.statusText.textContent = `Zona fijada (${state.currentZoneSizeMeters} × ${state.currentZoneSizeMeters} m)`;

    // Habilitar botones de acción
    ui.btnCrop.disabled = false;
    ui.btnRecenter.disabled = false;
    ui.btnClear.disabled = false;

    // 5. Ajuste automático de zoom vertical mediante fitBounds para ocupar la pantalla completa
    if (autoFit && bounds) {
      const isDesktop = window.innerWidth > 768;
      map.fitBounds(bounds, {
        padding: {
          top: 12,
          bottom: 12,
          left: isDesktop ? 375 : 12,
          right: 18,
        },
        bearing: map.getBearing(),
        pitch: map.getPitch(),
        maxZoom: 22,
        duration: 800,
        essential: true,
      });
    }
  }

  /**
   * Limpia la selección actual del mapa y reinicia el panel
   */
  function clearSelection() {
    state.selectedLngLat = null;
    state.zoneBearing = map.getBearing();

    // Remover marcador
    if (state.marker) {
      state.marker.remove();
      state.marker = null;
    }

    // Vaciar geometría en el mapa
    const source = map.getSource("accident-zone-source");
    if (source) {
      source.setData({
        type: "FeatureCollection",
        features: [],
      });
    }

    // Resetear panel UI
    ui.latValue.textContent = "No seleccionada";
    ui.latValue.classList.add("empty");
    ui.lngValue.textContent = "No seleccionada";
    ui.lngValue.classList.add("empty");
    updateRotationUI(map.getBearing());

    ui.statusBanner.className = "status-banner empty";
    ui.statusText.textContent =
      "Haz clic en una intersección para delimitar la zona";

    ui.btnCrop.disabled = true;
    ui.btnRecenter.disabled = true;
    ui.btnClear.disabled = true;

    showToast("Selección de zona eliminada");
  }

  /**
   * Actualiza métricas de dimensión y área en pantalla
   */
  function updateSizeSummary(size) {
    const area = size * size;
    const ha = (area / 10000).toFixed(1);
    ui.summaryDim.textContent = `${size} × ${size} m`;
    ui.summaryArea.textContent = `${area.toLocaleString()} m² (${ha} ha)`;
  }

  // Evento: Clic en el mapa para fijar epicentro
  map.on("click", (e) => {
    const coords = {
      lng: e.lngLat.lng,
      lat: e.lngLat.lat,
    };

    // Al hacer clic, adoptar la orientación actual de la brújula/cámara
    // para que el cuadro quede perfectamente encuadrado con la vista de la pantalla
    state.zoneBearing = map.getBearing();

    // Actualizar zona y hacer zoom vertical inmediato a la zona
    updateAccidentZone(coords, true);
    showToast(
      `Zona encuadrada verticalmente en [${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}]`,
    );
  });

  // Evento: Coordenadas en tiempo real al mover el cursor
  map.on("mousemove", (e) => {
    const b = map.getBearing();
    const normB = ((b % 360) + 360) % 360;
    ui.cursorCoords.firstElementChild.textContent = `Lat: ${e.lngLat.lat.toFixed(6)}°  |  Lng: ${e.lngLat.lng.toFixed(6)}°`;
    ui.compassHeading.textContent = `Brújula: ${normB.toFixed(1)}°`;
  });

  // Evento: Selector de tamaño de la zona (50m, 100m, 200m, 300m)
  ui.sizeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const size = parseInt(btn.getAttribute("data-size"), 10);
      if (isNaN(size) || size === state.currentZoneSizeMeters) return;

      state.currentZoneSizeMeters = size;

      ui.sizeButtons.forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-checked", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-checked", "true");

      updateSizeSummary(size);

      // Si hay una ubicación seleccionada, redibujar y reajustar zoom vertical a la nueva dimensión
      if (state.selectedLngLat) {
        updateAccidentZone(state.selectedLngLat, true);
        showToast(`Área ajustada a ${size} × ${size} m`);
      }
    });
  });

  /**
   * Funciones de Gestión y Sincronización de Brújula y Orientación
   */
  function getCardinalDirection(deg) {
    const directions = [
      "Norte",
      "NNE",
      "NE",
      "ENE",
      "Este",
      "ESE",
      "SE",
      "SSE",
      "Sur",
      "SSO",
      "SO",
      "OSO",
      "Oeste",
      "ONO",
      "NO",
      "NNO",
    ];
    const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
    return directions[idx];
  }

  function updateRotationUI(bearingDeg) {
    const norm = ((bearingDeg % 360) + 360) % 360;
    const cardinal = getCardinalDirection(norm);

    if (ui.rotationValue) {
      ui.rotationValue.textContent = `${norm.toFixed(1)}° (${cardinal})`;
    }
    if (ui.sliderAngleText) {
      ui.sliderAngleText.textContent = `${Math.round(norm)}°`;
    }
    if (ui.rotationRange && document.activeElement !== ui.rotationRange) {
      ui.rotationRange.value = Math.round(norm);
    }
    if (ui.compassNeedle) {
      ui.compassNeedle.style.transform = `rotate(${-norm}deg)`;
    }
    if (ui.compassHeading) {
      ui.compassHeading.textContent = `Brújula: ${norm.toFixed(1)}° (${cardinal})`;
    }
  }

  function setMapAndZoneBearing(bearingDeg, animate = false) {
    const norm = ((bearingDeg % 360) + 360) % 360;
    state.zoneBearing = norm;

    if (animate) {
      map.easeTo({ bearing: norm, duration: 250, essential: true });
    } else {
      map.setBearing(norm);
    }

    if (state.selectedLngLat) {
      updateAccidentZone(state.selectedLngLat, false);
    }

    updateRotationUI(norm);
  }

  // Evento: Al girar el mapa por gestos de ratón, brújula o atajos
  map.on("rotate", () => {
    const b = map.getBearing();
    const norm = ((b % 360) + 360) % 360;
    state.zoneBearing = norm;
    if (state.selectedLngLat) {
      updateAccidentZone(state.selectedLngLat, false);
    }
    updateRotationUI(norm);
  });

  // Evento: Control deslizante de ángulo continuo
  if (ui.rotationRange) {
    ui.rotationRange.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      setMapAndZoneBearing(val, false);
    });
  }

  // Eventos: Botones de giro rápido y fino en el panel lateral
  if (ui.btnRotateStepFastLeft) {
    ui.btnRotateStepFastLeft.addEventListener("click", () => {
      setMapAndZoneBearing(map.getBearing() - 15, true);
    });
  }
  if (ui.btnRotateLeft) {
    ui.btnRotateLeft.addEventListener("click", () => {
      setMapAndZoneBearing(map.getBearing() - 2, false);
    });
  }
  if (ui.btnRotateReset) {
    ui.btnRotateReset.addEventListener("click", () => {
      setMapAndZoneBearing(0, true);
      showToast("Orientación restablecida al Norte (0°)");
    });
  }
  if (ui.btnRotateRight) {
    ui.btnRotateRight.addEventListener("click", () => {
      setMapAndZoneBearing(map.getBearing() + 2, false);
    });
  }
  if (ui.btnRotateStepFastRight) {
    ui.btnRotateStepFastRight.addEventListener("click", () => {
      setMapAndZoneBearing(map.getBearing() + 15, true);
    });
  }

  // Eventos: Brújula Flotante sobre el Mapa
  if (ui.btnMapRotateLeft) {
    ui.btnMapRotateLeft.addEventListener("click", () => {
      setMapAndZoneBearing(map.getBearing() - 10, true);
    });
  }
  if (ui.btnMapRotateRight) {
    ui.btnMapRotateRight.addEventListener("click", () => {
      setMapAndZoneBearing(map.getBearing() + 10, true);
    });
  }
  if (ui.compassDial) {
    ui.compassDial.addEventListener("click", () => {
      setMapAndZoneBearing(0, true);
      showToast("Brújula orientada al Norte (0°)");
    });
  }

  // Evento: Re-centrar en la ubicación seleccionada con zoom vertical
  ui.btnRecenter.addEventListener("click", () => {
    if (state.selectedLngLat) {
      updateAccidentZone(state.selectedLngLat, true);
      showToast("Vista re-centrada verticalmente en el accidente");
    }
  });

  // Evento: Limpiar selección
  ui.btnClear.addEventListener("click", () => {
    clearSelection();
  });

  // Evento: Centrar vista en Santiago de Cali
  ui.btnGoCali.addEventListener("click", () => {
    map.flyTo({
      center: [CALI_CONFIG.lng, CALI_CONFIG.lat],
      zoom: CALI_CONFIG.zoom,
      bearing: 0,
      pitch: 0,
      speed: 1.1,
      essential: true,
    });
    setMapAndZoneBearing(0, true);
    showToast("Navegando al centro de Cali, Colombia");
  });

  /**
   * Recorta el área seleccionada del mapa hacia el canvas con sus colores originales
   * Oculta temporalmente el recuadro azul y el marcador, renderiza el mapa puro,
   * extrae y rota la porción seleccionada en el canvas y restaura la visualización.
   */
  function cropZoneToCanvas() {
    if (!state.selectedLngLat) {
      showToast("Primero selecciona una zona en el mapa");
      return;
    }

    showToast("Capturando mapa con colores originales...", 1500);

    // 1. Ocultar capas del recuadro y marcador para que el mapa quede puro
    const hasFill = map.getLayer("accident-zone-fill");
    const hasLine = map.getLayer("accident-zone-line");
    const hasShadow = map.getLayer("accident-zone-line-shadow");

    if (hasFill)
      map.setLayoutProperty("accident-zone-fill", "visibility", "none");
    if (hasLine)
      map.setLayoutProperty("accident-zone-line", "visibility", "none");
    if (hasShadow)
      map.setLayoutProperty("accident-zone-line-shadow", "visibility", "none");
    if (state.marker) state.marker.getElement().style.display = "none";

    const restoreOverlays = () => {
      if (hasFill)
        map.setLayoutProperty("accident-zone-fill", "visibility", "visible");
      if (hasLine)
        map.setLayoutProperty("accident-zone-line", "visibility", "visible");
      if (hasShadow)
        map.setLayoutProperty(
          "accident-zone-line-shadow",
          "visibility",
          "visible",
        );
      if (state.marker) state.marker.getElement().style.display = "";
    };

    // 2. Esperar al siguiente render del mapa limpio
    map.once("render", () => {
      try {
        const mapCanvas = map.getCanvas();
        if (!mapCanvas) {
          showToast("Error: Canvas del mapa no disponible");
          return;
        }

        // Calcular esquinas geodésicas del recuadro
        const { geojson } = calculateGeodesicSquare(
          state.selectedLngLat.lng,
          state.selectedLngLat.lat,
          state.currentZoneSizeMeters,
          state.zoneBearing,
        );
        const ring = geojson.features[0].geometry.coordinates[0];

        // Proyectar vértices y epicentro a coordenadas de pantalla (CSS px)
        const pTL = map.project(ring[0]);
        const pTR = map.project(ring[1]);
        const pCenter = map.project([
          state.selectedLngLat.lng,
          state.selectedLngLat.lat,
        ]);

        // Relación entre buffer interno WebGL y tamaño CSS
        const dprX = mapCanvas.width / mapCanvas.clientWidth;
        const dprY = mapCanvas.height / mapCanvas.clientHeight;

        // Longitud del lado y ángulo en pantalla
        const dx = pTR.x - pTL.x;
        const dy = pTR.y - pTL.y;
        const sideScreenPx = Math.hypot(dx, dy);
        const screenAngleRad = Math.atan2(dy, dx);

        // Resolución del canvas de recorte (mínimo 512px para alta definición forense)
        const outputSize = Math.max(512, Math.round(sideScreenPx * dprX));

        const canvas = ui.cropCanvas;
        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext("2d");

        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, outputSize, outputSize);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        ctx.save();
        // Centrar el origen en el canvas destino
        ctx.translate(outputSize / 2, outputSize / 2);
        // Rotar en sentido opuesto para enderezar el cuadrado
        ctx.rotate(-screenAngleRad);
        // Escalar para ajustar exactamente el tamaño deseado
        const scale = outputSize / (sideScreenPx * dprX);
        ctx.scale(scale, scale);

        // Dibujar canvas de MapLibre centrado en el epicentro
        ctx.drawImage(mapCanvas, -pCenter.x * dprX, -pCenter.y * dprY);
        ctx.restore();

        // Actualizar datos del modal
        ui.cropModalDim.textContent = `${state.currentZoneSizeMeters} × ${state.currentZoneSizeMeters} m`;
        ui.cropModalRes.textContent = `${outputSize} × ${outputSize} px`;

        const texEl = document.getElementById("cropModalTexture");
        if (texEl) {
          texEl.textContent =
            state.baseMapStyle === "google-hybrid"
              ? "Google Híbrido"
              : "Google Calles (Limpio)";
        }

        // Abrir modal de inspección
        ui.cropModalOverlay.classList.add("active");
        showToast("¡Zona recortada exitosamente con colores originales!");
      } catch (err) {
        console.error("Error al recortar zona:", err);
        showToast("No se pudo procesar el recorte de imagen");
      } finally {
        // Restaurar visibilidad del recuadro y marcador
        restoreOverlays();
      }
    });

    // Disparar renderizado del mapa con capas limpias
    map.triggerRepaint();
  }

  // Evento: Botón Recortar
  ui.btnCrop.addEventListener("click", () => {
    cropZoneToCanvas();
  });

  // Evento: Cerrar modal
  function closeCropModal() {
    ui.cropModalOverlay.classList.remove("active");
  }

  ui.btnCloseCropModal.addEventListener("click", closeCropModal);
  ui.btnCloseCropSecondary.addEventListener("click", closeCropModal);

  ui.cropModalOverlay.addEventListener("click", (e) => {
    if (e.target === ui.cropModalOverlay) {
      closeCropModal();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      ui.cropModalOverlay.classList.contains("active")
    ) {
      closeCropModal();
    }
  });

  // Evento: Descargar imagen recortada
  ui.btnDownloadCrop.addEventListener("click", () => {
    if (!ui.cropCanvas) return;
    const link = document.createElement("a");
    link.download = `sinistra3d_zona_${state.currentZoneSizeMeters}m_${Date.now()}.png`;
    link.href = ui.cropCanvas.toDataURL("image/png");
    link.click();
    showToast("Imagen descargada con éxito");
  });

  const SceneStorage = window.SceneStorage;

  // Evento: Implementar imagen en el nuevo espacio de trabajo (scene.html)
  ui.btnImplementCrop.addEventListener("click", async () => {
    if (!ui.cropCanvas || !state.selectedLngLat) {
      showToast("No hay imagen recortada disponible");
      return;
    }

    const size = state.currentZoneSizeMeters;
    const resPx = ui.cropCanvas.width;

    // Obtener textura fotográfica calibrada (JPEG 0.92 mantiene perfecta nitidez forense y tamaño ligero < 250KB)
    let dataUrl = ui.cropCanvas.toDataURL("image/jpeg", 0.92);
    if (!dataUrl || dataUrl === "data:," || dataUrl.length < 100) {
      dataUrl = ui.cropCanvas.toDataURL("image/png");
    }

    const payload = {
      textureDataUrl: dataUrl,
      metadata: {
        sizeMeters: size,
        resolutionPx: resPx,
        metersPerPixel: size / resPx,
        center: {
          lat: state.selectedLngLat.lat,
          lng: state.selectedLngLat.lng,
        },
        bearingDeg: state.zoneBearing,
        baseMapStyle: state.baseMapStyle || "google-hybrid",
        timestamp: Date.now(),
      },
    };

    showToast("Transfiriendo textura al espacio de trabajo...", 1000);

    try {
      await SceneStorage.save(payload);
    } catch (e) {
      console.error("Error al transferir textura:", e);
    }

    window.location.href = "scene.html";
  });

  // Evento: Selector de capa de mapa base
  ui.styleButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const styleKey = btn.getAttribute("data-map-style");
      if (styleKey && styleKey !== state.baseMapStyle) {
        setBaseMapStyle(styleKey);
      }
    });
  });

  // Inicializar texto de dimensiones y rotación
  updateSizeSummary(state.currentZoneSizeMeters);
  updateRotationUI(0);
}
