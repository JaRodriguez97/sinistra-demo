/**
 * scene_shortcuts.js
 * Atajos de teclado e interacciones globales de teclado para Sinistra 3D.
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.initSceneKeyboardShortcuts = factory().initSceneKeyboardShortcuts;
  }
})(typeof self !== "undefined" ? self : this, function () {
  function initSceneKeyboardShortcuts(state, ui, helpers, getIsSpacePressed, setIsSpacePressed) {
    const {
      setZoom,
      resetZoom,
      repaintScene,
      showToast,
      History,
      selectZone,
      selectObject,
      removeSelectedVertex,
      removeSelectedObject,
      removeSelectedTrajPoint,
      toggleTraceTrajectory,
      scheduleSave,
      setActiveMode,
    } = helpers;

    window.addEventListener("keydown", (e) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT")
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) History.redo();
        else History.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        History.redo();
        return;
      }

      if (e.code === "Space") {
        if (typeof setIsSpacePressed === "function") setIsSpacePressed(true);
        if (!state.isPanning) ui.canvas.style.cursor = "grab";
      } else if (e.key === "Escape") {
        if (state.dimensionDraft) {
          state.dimensionDraft = null;
          repaintScene();
          showToast("Medición cancelada.");
          return;
        }
        if (state.selectedDimensionId) {
          state.selectedDimensionId = null;
          repaintScene();
          return;
        }
        if (state.isTracingTrajectory) toggleTraceTrajectory();
        else if (state.selectedTrajPoint) {
          state.selectedTrajPoint = null;
          repaintScene();
        } else if (state.selectedVertex) {
          state.selectedVertex = null;
          repaintScene();
        } else if (state.freePolygonPoints && state.freePolygonPoints.length > 0) {
          state.freePolygonPoints = [];
          repaintScene();
          showToast("Trazado cancelado");
        } else if (state.selectedObjectId) selectObject(null);
        else if (state.selectedZoneId) selectZone(null);
        else if (state.activeMode !== "select") setActiveMode("select");
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (state.selectedDimensionId) {
          e.preventDefault();
          const idx = (state.dimensions || []).findIndex(
            (d) => d.id === state.selectedDimensionId,
          );
          if (idx !== -1) {
            History.push();
            state.dimensions.splice(idx, 1);
            state.selectedDimensionId = null;
            scheduleSave();
            repaintScene();
            showToast("Cota eliminada.");
            return;
          }
        }
        if (state.selectedTrajPoint) {
          e.preventDefault();
          removeSelectedTrajPoint();
          return;
        }
        if (state.selectedObjectId) {
          e.preventDefault();
          removeSelectedObject();
          return;
        }
        if (state.selectedVertex) {
          e.preventDefault();
          removeSelectedVertex();
          return;
        }
        if (state.selectedZoneId) {
          e.preventDefault();
          History.push();
          state.zones = state.zones.filter(
            (z) => z.id !== state.selectedZoneId,
          );
          selectZone(null);
          showToast("Zona eliminada");
        }
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setZoom(state.zoom * 1.25);
      } else if (e.key === "-") {
        e.preventDefault();
        setZoom(state.zoom / 1.25);
      } else if (e.key === "0") {
        e.preventDefault();
        resetZoom();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (typeof Simulation !== "undefined") Simulation.stepForward(0.05);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (typeof Simulation !== "undefined") {
          if (e.shiftKey) Simulation.toggleReverse();
          else Simulation.stepBackward(0.05);
        }
      } else if (e.key.toLowerCase() === "r" && !e.ctrlKey) {
        if (!state.isDrawing && !state.isDraggingObject) {
          e.preventDefault();
          if (typeof Simulation !== "undefined") Simulation.reset();
        }
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        if (typeof setIsSpacePressed === "function") setIsSpacePressed(false);
        if (!state.isPanning) {
          ui.canvas.style.cursor =
            state.activeMode === "select" ? "default" : "crosshair";
        }
      }
    });
  }

  return { initSceneKeyboardShortcuts };
});
