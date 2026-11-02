/**
 * Sinistra 3D - Gestor de persistencia y transferencia de escena para Stage 1
 * Guarda recortes y metadatos periciales en sessionStorage, localStorage e IndexedDB.
 */

window.SceneStorage = {
  DB_NAME: "Sinistra3D_DB",
  STORE_NAME: "scene_store",
  KEY: "active_scene",

  openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e);
    });
  },

  async save(payload) {
    const rawJson = JSON.stringify(payload);

    // 1. Guardar en sessionStorage (canal prioritario para la navegación en la misma pestaña)
    try {
      sessionStorage.setItem("sinistra_scene_payload", rawJson);
    } catch (e) {
      console.warn("sessionStorage quota advertencia:", e);
    }

    // 2. Guardar en localStorage como persistencia entre pestañas
    try {
      localStorage.setItem("sinistra_scene_payload", rawJson);
    } catch (e) {
      console.warn("localStorage quota advertencia:", e);
    }

    // 3. Guardar en IndexedDB esperando tx.oncomplete para asegurar persistencia física
    try {
      const db = await this.openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE_NAME, "readwrite");
        const store = tx.objectStore(this.STORE_NAME);
        store.put(payload, this.KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = (err) => reject(err);
        tx.onabort = (err) => reject(err);
      });
    } catch (err) {
      console.warn("IndexedDB error:", err);
    }
  },
};
