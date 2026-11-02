/**
 * objects_catalog.js
 * Catálogo maestro universal de objetos viales, mobiliario urbano, vehículos y evidencias forenses.
 * Compatible con scripts clásicos en navegador (<script src="...">) y con módulos ESM.
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.OBJECT_CATEGORIES = exports.OBJECT_CATEGORIES;
    root.OBJECTS_CATALOG = exports.OBJECTS_CATALOG;
    root.getCatalogList = exports.getCatalogList;
    root.getCatalogByCategory = exports.getCatalogByCategory;
  }
})(typeof self !== "undefined" ? self : this, function () {
  const OBJECT_CATEGORIES = {
    vehiculo: { id: "vehiculo", label: "Vehículos", icon: "🚗" },
    persona: { id: "persona", label: "Peatones", icon: "🚶" },
    mobiliario: { id: "mobiliario", label: "Entorno / Mobiliario", icon: "🌳" },
    senal: { id: "senal", label: "Señales de Tránsito", icon: "🛑" },
    evidencia: { id: "evidencia", label: "Evidencias / Frenado", icon: "〰️" },
  };

  const OBJECTS_CATALOG = {
    // ===================== VEHÍCULOS =====================
    sedan: {
      id: "sedan",
      category: "vehiculo",
      name: "Automóvil Sedán",
      lengthM: 4.5,
      widthM: 1.8,
      heightM: 1.45,
      defaultColor: "#dc2626",
      icon: "🚗",
      isAccidentCandidate: true,
      description:
        "Automóvil estándar de 5 plazas para recreación de colisiones urbanas.",
    },
    suv: {
      id: "suv",
      category: "vehiculo",
      name: "Camioneta / SUV",
      lengthM: 4.85,
      widthM: 1.95,
      heightM: 1.75,
      defaultColor: "#2563eb",
      icon: "🚙",
      isAccidentCandidate: true,
      description:
        "Camioneta familiar o utilitaria deportiva con mayor centro de gravedad.",
    },
    truck: {
      id: "truck",
      category: "vehiculo",
      name: "Camión de Carga",
      lengthM: 8.5,
      widthM: 2.5,
      heightM: 3.2,
      defaultColor: "#f59e0b",
      icon: "🚚",
      isAccidentCandidate: true,
      description: "Vehículo pesado de carga con cabina y furgón cerrado.",
    },
    bus: {
      id: "bus",
      category: "vehiculo",
      name: "Autobús Urbano",
      lengthM: 10.5,
      widthM: 2.6,
      heightM: 3.1,
      defaultColor: "#10b981",
      icon: "🚌",
      isAccidentCandidate: true,
      description: "Transporte público colectivo interurbano.",
    },
    tractomula: {
      id: "tractomula",
      category: "vehiculo",
      name: "Tractomula / Articulado (Trailer)",
      lengthM: 16.5,
      widthM: 2.6,
      heightM: 4.1,
      cabLengthM: 3.5,
      trailerLengthM: 13.0,
      defaultColor: "#b45309",
      icon: "🚛",
      isAccidentCandidate: true,
      description:
        "Vehículo pesado articulado de gran tonelaje con cabina tractora de 3 ejes y semirremolque.",
    },
    moto: {
      id: "moto",
      category: "vehiculo",
      name: "Motocicleta",
      lengthM: 2.1,
      widthM: 0.8,
      heightM: 1.1,
      defaultColor: "#0284c7",
      icon: "🏍️",
      isAccidentCandidate: true,
      description:
        "Motocicleta urbana para análisis de trayectorias y derrapes.",
      rider: {
        enabled: true,
        massKg: 75,
        frictionGround: 0.66,
        launchAngleDeg: 15,
        finalRestDistanceM: 6.0,
        restitution: 0.1,
      },
    },
    bici: {
      id: "bici",
      category: "vehiculo",
      name: "Bicicleta",
      lengthM: 1.75,
      widthM: 0.6,
      heightM: 1.0,
      defaultColor: "#84cc16",
      icon: "🚲",
      isAccidentCandidate: true,
      description: "Vehículo de tracción humana / ciclista.",
    },

    // ===================== PEATONES =====================
    peaton: {
      id: "peaton",
      category: "persona",
      name: "Peatón Adulto",
      lengthM: 0.5,
      widthM: 0.4,
      heightM: 1.7,
      defaultColor: "#06b6d4",
      icon: "🚶",
      isAccidentCandidate: true,
      description: "Persona adulta en cruce peatonal o andén.",
    },
    peaton_nino: {
      id: "peaton_nino",
      category: "persona",
      name: "Peatón Menor / Niño",
      lengthM: 0.4,
      widthM: 0.35,
      heightM: 1.2,
      defaultColor: "#ec4899",
      icon: "🧒",
      isAccidentCandidate: true,
      description: "Menor de edad / infante en zona escolar o residencial.",
    },
    agente_transito: {
      id: "agente_transito",
      category: "persona",
      name: "Agente de Tránsito",
      lengthM: 0.5,
      widthM: 0.4,
      heightM: 1.75,
      defaultColor: "#eab308",
      icon: "👮",
      isAccidentCandidate: true,
      description: "Autoridad o regulador vial con chaleco reflectivo.",
    },

    // ===================== MOBILIARIO Y ENTORNO =====================
    arbol: {
      id: "arbol",
      category: "mobiliario",
      name: "Árbol Urbano",
      lengthM: 3.5, // Diámetro de copa
      widthM: 3.5,
      heightM: 4.8,
      trunkDiameterM: 0.45,
      defaultColor: "#166534",
      icon: "🌳",
      isAccidentCandidate: true,
      description: "Árbol con tronco rígido impactable y copa vegetal.",
    },
    arbusto: {
      id: "arbusto",
      category: "mobiliario",
      name: "Arbusto / Seto",
      lengthM: 1.4,
      widthM: 1.4,
      heightM: 0.9,
      defaultColor: "#22c55e",
      icon: "🌿",
      isAccidentCandidate: false,
      description:
        "Elemento vegetal bajo para delimitación o visibilidad reducida.",
    },
    zona_verde: {
      id: "zona_verde",
      category: "mobiliario",
      name: "Césped / Zona Verde",
      lengthM: 3.0,
      widthM: 2.0,
      heightM: 0.05,
      defaultColor: "#4ade80",
      icon: "🌱",
      isAccidentCandidate: false,
      description: "Franja de césped o jardín en separador o andén.",
    },
    poste_luz: {
      id: "poste_luz",
      category: "mobiliario",
      name: "Poste de Alumbrado",
      lengthM: 0.35,
      widthM: 0.35,
      heightM: 6.5,
      defaultColor: "#94a3b8",
      icon: "💡",
      isAccidentCandidate: true,
      description:
        "Poste metálico de energía o iluminación vial, objeto rígido de impacto.",
    },
    semaforo: {
      id: "semaforo",
      category: "mobiliario",
      name: "Semáforo con Brazo",
      lengthM: 3.2, // Brazo horizontal
      widthM: 0.4,
      heightM: 4.5,
      defaultColor: "#334155",
      icon: "🚦",
      isAccidentCandidate: true,
      description:
        "Semáforo vehicular de intersección con columna y cabezal de señales.",
    },
    camara_fotomulta: {
      id: "camara_fotomulta",
      category: "mobiliario",
      name: "Cámara Fotomulta / Radar",
      lengthM: 1.5,
      widthM: 0.4,
      heightM: 5.2,
      defaultColor: "#475569",
      icon: "📷",
      isAccidentCandidate: false,
      description:
        "Dispositivo de fiscalización electrónica de velocidad y carril.",
    },
    barrera_new_jersey: {
      id: "barrera_new_jersey",
      category: "mobiliario",
      name: "Barrera New Jersey",
      lengthM: 2.0,
      widthM: 0.6,
      heightM: 0.85,
      defaultColor: "#e2e8f0",
      icon: "🚧",
      isAccidentCandidate: true,
      description:
        "Bloque de hormigón para contención o canalización de tráfico.",
    },

    // ===================== SEÑALES DE TRÁNSITO =====================
    senal_pare: {
      id: "senal_pare",
      category: "senal",
      name: "Señal PARE (R1)",
      lengthM: 0.7,
      widthM: 0.1,
      heightM: 2.2,
      defaultColor: "#b91c1c",
      icon: "🛑",
      isAccidentCandidate: true,
      description: "Señal reglamentaria octagonal de detención obligatoria.",
    },
    senal_ceda: {
      id: "senal_ceda",
      category: "senal",
      name: "Señal Ceda el Paso (R2)",
      lengthM: 0.7,
      widthM: 0.1,
      heightM: 2.2,
      defaultColor: "#ef4444",
      icon: "🔻",
      isAccidentCandidate: true,
      description: "Señal reglamentaria triangular de prioridad de paso.",
    },
    senal_velocidad: {
      id: "senal_velocidad",
      category: "senal",
      name: "Límite Velocidad 50 (R30)",
      lengthM: 0.65,
      widthM: 0.1,
      heightM: 2.2,
      defaultColor: "#ffffff",
      icon: "⭕",
      isAccidentCandidate: true,
      description:
        "Señal reglamentaria circular con velocidad máxima de 50 km/h.",
    },
    senal_velocidad_30: {
      id: "senal_velocidad_30",
      category: "senal",
      name: "Límite Velocidad 30 (R30)",
      lengthM: 0.65,
      widthM: 0.1,
      heightM: 2.2,
      defaultColor: "#ffffff",
      icon: "🚸",
      isAccidentCandidate: true,
      description: "Velocidad máxima de 30 km/h en zona escolar o pacificada.",
    },
    senal_prohibido_parquear: {
      id: "senal_prohibido_parquear",
      category: "senal",
      name: "Prohibido Parquear (R28)",
      lengthM: 0.65,
      widthM: 0.1,
      heightM: 2.2,
      defaultColor: "#0284c7",
      icon: "🅿️",
      isAccidentCandidate: true,
      description: "Restricción de estacionamiento sobre la calzada.",
    },
    senal_giro_izq: {
      id: "senal_giro_izq",
      category: "senal",
      name: "Prohibido Giro Izquierda (R15)",
      lengthM: 0.65,
      widthM: 0.1,
      heightM: 2.2,
      defaultColor: "#dc2626",
      icon: "🚫",
      isAccidentCandidate: true,
      description: "Prohibición de maniobra de giro hacia la izquierda.",
    },

    // ===================== EVIDENCIAS Y FRENADO =====================
    huella_frenado: {
      id: "huella_frenado",
      category: "evidencia",
      name: "Huellas de Frenado",
      lengthM: 10.0, // Longitud de la marca
      widthM: 1.5, // Trocha de neumáticos
      tireWidthM: 0.22, // Ancho de banda de rodadura
      heightM: 0.005, // Superficial
      defaultColor: "#171717",
      icon: "〰️",
      isAccidentCandidate: true,
      triggerOnPass: false, // Si es true, solo aparece al pasar el vehículo
      description:
        "Marcas oscuras de fricción de neumático sobre pavimento o andén.",
    },
    huella_derrape: {
      id: "huella_derrape",
      category: "evidencia",
      name: "Huella de Derrape / Curva",
      lengthM: 8.0,
      widthM: 1.6,
      tireWidthM: 0.25,
      heightM: 0.005,
      defaultColor: "#262626",
      icon: "➰",
      isAccidentCandidate: true,
      triggerOnPass: false,
      description:
        "Marca de derrape lateral con estrías oblicuas por pérdida de control.",
    },
    escombros: {
      id: "escombros",
      category: "evidencia",
      name: "Dispersión de Vidrios / Escombros",
      lengthM: 2.5,
      widthM: 1.8,
      heightM: 0.05,
      defaultColor: "#e0f2fe",
      icon: "💥",
      isAccidentCandidate: true,
      triggerOnPass: false,
      description:
        "Área de dispersión de fragmentos y vidrios producidos en la colisión.",
    },
    mancha_aceite: {
      id: "mancha_aceite",
      category: "evidencia",
      name: "Derrame de Aceite / Líquido",
      lengthM: 1.8,
      widthM: 1.2,
      heightM: 0.01,
      defaultColor: "#1e1b4b",
      icon: "🛢️",
      isAccidentCandidate: true,
      triggerOnPass: false,
      description:
        "Fuga de lubricante o combustible tras la rotura del cárter.",
    },
  };

  function getCatalogList() {
    return Object.values(OBJECTS_CATALOG);
  }

  function getCatalogByCategory(category) {
    return getCatalogList().filter((o) => o.category === category);
  }

  return {
    OBJECT_CATEGORIES,
    OBJECTS_CATALOG,
    getCatalogList,
    getCatalogByCategory,
  };
});
