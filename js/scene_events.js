/**
 * scene_events.js
 * Controladores de eventos de lienzo (Pan, Zoom, Arrastre, Rotación),
 * sincronización de inspectores y atajos de teclado forenses.
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.initSceneEvents = factory().initSceneEvents;
  }
})(typeof self !== "undefined" ? self : this, function () {
  let isSpaceKeyPressed = false;

  function initSceneEvents(state, ui, helpers) {
    const {
      getCanvasRelativeCoords,
      setZoom,
      resetZoom,
      repaintScene,
      showToast,
      History,
      ZONE_CONFIG,
      selectZone,
      selectObject,
      updateZonesListUI,
      updateObjectsListUI,
      removeSelectedVertex,
      removeSelectedObject,
      findBestZoneAtCoords,
      getVertexAtCoords,
      getEdgeAtCoords,
      getZoneUnderNormCoords,
      getObjectAtCoords,
      getObjectRotateHandleAtCoords,
      getTrajectoryPointAtCoords,
      getTrajectoryEdgeAtCoords,
      removeSelectedTrajPoint,
      runMagicWandAt,
      finishFreePolygon,
      addTrajectoryPoint,
      toggleTraceTrajectory,
      createObjectAt,
      scheduleSave,
      setActiveMode,
      updateTrajectoryStats,
    } = helpers;

    // Rueda del ratón: Zoom suave centrado
    ui.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = ui.canvas.getBoundingClientRect();
        const mouseCanvasX =
          (e.clientX - rect.left) * (ui.canvas.width / rect.width);
        const mouseCanvasY =
          (e.clientY - rect.top) * (ui.canvas.height / rect.height);
        const zoomMultiplier = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        setZoom(state.zoom * zoomMultiplier, mouseCanvasX, mouseCanvasY);
      },
      { passive: false },
    );

    // Movimiento del ratón sobre Canvas
    ui.canvas.addEventListener("mousemove", (e) => {
      const coords = getCanvasRelativeCoords(e);
      state.mouseCanvasCoords = coords;

      if (ui.metaCoords) {
        ui.metaCoords.textContent = `X: ${coords.meterX.toFixed(1)} m | Y: ${coords.meterY.toFixed(1)} m`;
      }

      if (state.isPanning) {
        const dx = coords.canvasPxX - state.panStartX;
        const dy = coords.canvasPxY - state.panStartY;
        if (Math.hypot(dx, dy) > 2) state.hasPanned = true;
        state.panX += dx;
        state.panY += dy;
        state.panStartX = coords.canvasPxX;
        state.panStartY = coords.canvasPxY;
        repaintScene();
        return;
      }

      if (state.isRotatingObject && state.selectedObjectId) {
        const obj = state.objects.find((o) => o.id === state.selectedObjectId);
        if (obj) {
          const rad = Math.atan2(
            coords.normY - obj.normY,
            coords.normX - obj.normX,
          );
          let deg = (rad * 180) / Math.PI;
          if (deg < 0) deg += 360;
          obj.rotationDeg = Math.round(deg);
          if (ui.inputObjRotation) ui.inputObjRotation.value = obj.rotationDeg;
          repaintScene();
          return;
        }
      }

      if (state.isDraggingObject && state.selectedObjectId) {
        const obj = state.objects.find((o) => o.id === state.selectedObjectId);
        if (obj) {
          obj.normX = Math.max(
            0.01,
            Math.min(0.99, coords.normX - state.dragObjectOffset.x),
          );
          obj.normY = Math.max(
            0.01,
            Math.min(0.99, coords.normY - state.dragObjectOffset.y),
          );
          const zone = getZoneUnderNormCoords(obj.normX, obj.normY);
          obj.baseElevationMeters = zone ? zone.elevationMeters : 0.0;
          obj.zoneId = zone ? zone.id : null;
          if (ui.inputObjElevation)
            ui.inputObjElevation.value = obj.baseElevationMeters;
          if (ui.objZoneBadge) {
            ui.objZoneBadge.textContent = zone
              ? `Sobre ${zone.name} (+${zone.elevationMeters.toFixed(2)}m)`
              : "Sobre Calzada (Nivel 0.0m)";
          }
          repaintScene();
          return;
        }
      }

      if (state.draggingVertex) {
        const zone = state.zones.find(
          (z) => z.id === state.draggingVertex.zoneId,
        );
        if (zone && zone.points[state.draggingVertex.vertexIndex]) {
          zone.points[state.draggingVertex.vertexIndex] = {
            x: coords.normX,
            y: coords.normY,
          };
          repaintScene();
          return;
        }
      }

      if (state.draggingTrajPoint) {
        const obj = state.objects.find(
          (o) => o.id === state.draggingTrajPoint.objectId,
        );
        if (state.draggingTrajPoint.isRiderRest && obj) {
          const sz = state.metadata?.sizeMeters || 100;
          const curNormX = Math.max(0.005, Math.min(0.995, coords.normX));
          const curNormY = Math.max(0.005, Math.min(0.995, coords.normY));
          if (!obj.rider) obj.rider = { enabled: true };
          if (!obj.rider.finalRest) obj.rider.finalRest = {};
          obj.rider.finalRest.normX = curNormX;
          obj.rider.finalRest.normY = curNormY;
          obj.rider.finalRest.x = (curNormX - 0.5) * sz;
          obj.rider.finalRest.z = (curNormY - 0.5) * sz;

          const pts = obj.kinematics?.trajectoryPoints || [];
          const pImp =
            pts.find((p) => p.type === "impact_point") || pts[pts.length - 1];
          if (pImp) {
            const dNorm = Math.hypot(
              curNormX - pImp.normX,
              curNormY - pImp.normY,
            );
            const dMeters = dNorm * sz;
            obj.rider.finalRestDistanceM = parseFloat(dMeters.toFixed(1));
            obj.rider.finalRest.distanceM = obj.rider.finalRestDistanceM;
            if (ui.inputObjRiderRestDist) {
              ui.inputObjRiderRestDist.value =
                obj.rider.finalRestDistanceM.toFixed(1);
            }
          }
          repaintScene();
          return;
        }
        if (state.draggingTrajPoint.isVehicleRest) {
          const sz = state.metadata?.sizeMeters || 100;
          const curNormX = Math.max(0.005, Math.min(0.995, coords.normX));
          const curNormY = Math.max(0.005, Math.min(0.995, coords.normY));
          if (!obj.finalRest) obj.finalRest = {};
          obj.finalRest.normX = curNormX;
          obj.finalRest.normY = curNormY;
          obj.finalRest.x = (curNormX - 0.5) * sz;
          obj.finalRest.z = (curNormY - 0.5) * sz;

          const pts = obj.kinematics?.trajectoryPoints || [];
          const pRest = pts.find((p) => p.type === "final_rest");
          if (pRest) {
            pRest.normX = curNormX;
            pRest.normY = curNormY;
            pRest.x = (curNormX - 0.5) * sz;
            pRest.z = (curNormY - 0.5) * sz;
          }

          const pImp = pts.find((p) => p.type === "impact_point") || pts[pts.length - 1];
          if (pImp) {
            const dNorm = Math.hypot(curNormX - pImp.normX, curNormY - pImp.normY);
            obj.finalRestDistanceM = parseFloat((dNorm * sz).toFixed(1));
            obj.finalRest.distanceM = obj.finalRestDistanceM;
            if (ui.inputObjVehicleRestDist) {
              ui.inputObjVehicleRestDist.value = obj.finalRestDistanceM.toFixed(1);
            }
          }
          repaintScene();
          return;
        }
        if (
          obj &&
          obj.kinematics &&
          Array.isArray(obj.kinematics.trajectoryPoints) &&
          obj.kinematics.trajectoryPoints[state.draggingTrajPoint.pointIndex]
        ) {
          const pt =
            obj.kinematics.trajectoryPoints[state.draggingTrajPoint.pointIndex];
          pt.normX = Math.max(0.005, Math.min(0.995, coords.normX));
          pt.normY = Math.max(0.005, Math.min(0.995, coords.normY));
          const sz = state.metadata?.sizeMeters || 100;
          pt.x = (pt.normX - 0.5) * sz;
          pt.z = (pt.normY - 0.5) * sz;
          if (state.draggingTrajPoint.pointIndex === 0) {
            obj.normX = pt.normX;
            obj.normY = pt.normY;
          }
          if (typeof updateTrajectoryStats === "function") {
            updateTrajectoryStats(obj);
          }
          if (typeof Simulation !== "undefined") {
            Simulation.calculateTotalDuration();
          }
          repaintScene();
          return;
        }
      }

      if (
        state.activeMode === "polygon" &&
        state.freePolygonPoints.length > 0
      ) {
        repaintScene();
        ui.canvas.style.cursor = "crosshair";
        return;
      }

      if (state.isTracingTrajectory) {
        ui.canvas.style.cursor = "crosshair";
        return;
      }

      if (isSpaceKeyPressed) {
        ui.canvas.style.cursor = "grab";
        return;
      }

      if (
        state.activeMode === "dimension" ||
        state.draggingDimension ||
        state.draggingDimensionText
      ) {
        if (typeof SceneDimensions !== "undefined") {
          const shouldRepaint = SceneDimensions.handleMouseMove(
            coords,
            state,
            ui,
          );
          if (shouldRepaint) repaintScene();
        }
        return;
      }

      const rotHit = getObjectRotateHandleAtCoords(coords);
      if (rotHit) {
        ui.canvas.style.cursor = "crosshair";
        return;
      }

      const objHit = getObjectAtCoords(coords);
      if (objHit) {
        ui.canvas.style.cursor = "move";
        return;
      }

      if (state.activeMode === "select") {
        if (typeof SceneDimensions !== "undefined") {
          const dimHit = SceneDimensions.getDimensionAtCoords(
            coords,
            state,
            ui.canvas.width,
            ui.canvas.height,
          );
          if (dimHit) {
            state.hoveredDimensionId = dimHit.dimension.id;
            ui.canvas.style.cursor =
              dimHit.hitTarget === "p1" || dimHit.hitTarget === "p2"
                ? "grab"
                : "move";
            repaintScene();
            return;
          } else if (state.hoveredDimensionId) {
            state.hoveredDimensionId = null;
            repaintScene();
          }
        }

        const trajPtHit = getTrajectoryPointAtCoords(coords);
        if (trajPtHit) {
          state.hoveredTrajPoint = trajPtHit;
          ui.canvas.style.cursor = "pointer";
          repaintScene();
          return;
        }

        if (state.hoveredTrajPoint) {
          state.hoveredTrajPoint = null;
          repaintScene();
        }

        const trajEdgeHit = getTrajectoryEdgeAtCoords(coords);
        if (trajEdgeHit) {
          ui.canvas.style.cursor = "copy";
          return;
        }

        const hitV = getVertexAtCoords(coords);
        if (hitV) {
          state.hoveredVertex = hitV;
          ui.canvas.style.cursor = "move";
          repaintScene();
          return;
        }

        if (state.hoveredVertex) {
          state.hoveredVertex = null;
          repaintScene();
        }

        const edgeHit = getEdgeAtCoords(coords);
        if (edgeHit) {
          ui.canvas.style.cursor = "copy";
          return;
        }

        let foundHover = null;
        for (let i = state.zones.length - 1; i >= 0; i--) {
          if (
            isPointInPolygon(coords.normX, coords.normY, state.zones[i].points)
          ) {
            foundHover = state.zones[i].id;
            break;
          }
        }

        if (foundHover !== state.hoveredZoneId) {
          state.hoveredZoneId = foundHover;
          ui.canvas.style.cursor = foundHover ? "pointer" : "default";
          repaintScene();
        }
      } else if (state.activeMode === "object") {
        ui.canvas.style.cursor = "copy";
      } else {
        ui.canvas.style.cursor = "crosshair";
      }
    });

    // Clic del ratón (MouseDown)
    ui.canvas.addEventListener("mousedown", (e) => {
      const coords = getCanvasRelativeCoords(e);

      if (
        e.button === 1 ||
        e.button === 2 ||
        (e.button === 0 && isSpaceKeyPressed)
      ) {
        state.isPanning = true;
        state.hasPanned = false;
        state.panStartX = coords.canvasPxX;
        state.panStartY = coords.canvasPxY;
        ui.canvas.style.cursor = "grabbing";
        return;
      }

      if (e.button !== 0) return;

      if (state.activeMode === "dimension") {
        if (typeof SceneDimensions !== "undefined") {
          if (SceneDimensions.handleMouseDown(coords, state, ui, helpers)) {
            return;
          }
        }
      }

      if (state.isTracingTrajectory) {
        addTrajectoryPoint(coords.normX, coords.normY);
        return;
      }

      const trajHit = getTrajectoryPointAtCoords(coords);
      if (trajHit) {
        History.push();
        state.selectedTrajPoint = trajHit;
        state.draggingTrajPoint = trajHit;
        state.selectedVertex = null;
        selectZone(null);
        selectObject(trajHit.objectId);
        repaintScene();
        showToast(
          "Punto de trayectoria seleccionado. Arrástralo para moverlo o Supr para eliminarlo.",
          2500,
        );
        return;
      }

      const trajEdgeHit = getTrajectoryEdgeAtCoords(coords);
      if (trajEdgeHit) {
        const obj = state.objects.find((o) => o.id === trajEdgeHit.objectId);
        if (
          obj &&
          obj.kinematics &&
          Array.isArray(obj.kinematics.trajectoryPoints)
        ) {
          History.push();
          obj.kinematics.trajectoryPoints.splice(
            trajEdgeHit.insertIndex,
            0,
            trajEdgeHit.point,
          );
          state.selectedTrajPoint = {
            objectId: obj.id,
            pointIndex: trajEdgeHit.insertIndex,
          };
          state.draggingTrajPoint = {
            objectId: obj.id,
            pointIndex: trajEdgeHit.insertIndex,
          };
          if (typeof updateTrajectoryStats === "function") {
            updateTrajectoryStats(obj);
          }
          scheduleSave();
          if (typeof Simulation !== "undefined") {
            Simulation.calculateTotalDuration();
          }
          repaintScene();
          showToast(
            "Punto añadido a la trayectoria. Arrástralo para moldear la curva.",
          );
          return;
        }
      }

      const rotHit = getObjectRotateHandleAtCoords(coords);
      if (rotHit) {
        History.push();
        state.isRotatingObject = true;
        return;
      }

      const objHit = getObjectAtCoords(coords);
      if (objHit) {
        History.push();
        selectZone(null);
        selectObject(objHit.id);
        state.selectedTrajPoint = null;
        state.isDraggingObject = true;
        state.dragObjectOffset = {
          x: coords.normX - objHit.normX,
          y: coords.normY - objHit.normY,
        };
        repaintScene();
        return;
      }

      if (state.activeMode === "object") {
        createObjectAt(coords.normX, coords.normY);
        return;
      }

      if (state.activeMode === "select") {
        if (typeof SceneDimensions !== "undefined") {
          const dimHit = SceneDimensions.getDimensionAtCoords(
            coords,
            state,
            ui.canvas.width,
            ui.canvas.height,
          );
          if (dimHit) {
            SceneDimensions.handleMouseDown(coords, state, ui, helpers);
            return;
          }
        }

        if (state.selectedObjectId) selectObject(null);
        state.selectedTrajPoint = null;

        const hitV = getVertexAtCoords(coords);
        if (hitV) {
          History.push();
          state.selectedVertex = hitV;
          state.draggingVertex = hitV;
          repaintScene();
          showToast(
            "Vértice seleccionado. Pulsa Supr para eliminarlo o arrástralo.",
            2500,
          );
          return;
        }

        const edgeHit = getEdgeAtCoords(coords);
        if (edgeHit) {
          const zone = state.zones.find((z) => z.id === edgeHit.zoneId);
          if (zone) {
            History.push();
            zone.points.splice(edgeHit.insertIndex, 0, edgeHit.point);
            state.selectedVertex = {
              zoneId: zone.id,
              vertexIndex: edgeHit.insertIndex,
            };
            state.draggingVertex = {
              zoneId: zone.id,
              vertexIndex: edgeHit.insertIndex,
            };
            repaintScene();
            showToast("Vértice añadido. Arrástralo para moldear la curva.");
            return;
          }
        }

        const targetZoneId = findBestZoneAtCoords(coords);
        state.selectedVertex = null;
        selectZone(targetZoneId);
        repaintScene();
      } else if (state.activeMode === "wand") {
        runMagicWandAt(coords);
      } else if (state.activeMode === "polygon") {
        if (state.freePolygonPoints.length === 0) {
          state.freePolygonPoints.push(coords);
          repaintScene();
        } else {
          const p0 = state.freePolygonPoints[0];
          const distPx = Math.hypot(
            (coords.normX - p0.normX) * ui.canvas.width * state.zoom,
            (coords.normY - p0.normY) * ui.canvas.height * state.zoom,
          );
          if (distPx <= 16 && state.freePolygonPoints.length >= 3) {
            finishFreePolygon();
          } else {
            state.freePolygonPoints.push(coords);
            repaintScene();
          }
        }
      }
    });

    ui.canvas.addEventListener("mouseup", () => {
      if (state.isPanning) {
        state.isPanning = false;
        ui.canvas.style.cursor = isSpaceKeyPressed
          ? "grab"
          : state.activeMode === "select"
            ? "default"
            : "crosshair";
      }
      if (state.isDraggingObject) {
        state.isDraggingObject = false;
        scheduleSave();
      }
      if (state.isRotatingObject) {
        state.isRotatingObject = false;
        scheduleSave();
      }
      if (state.draggingVertex) {
        state.draggingVertex = null;
        repaintScene();
      }
      if (state.draggingTrajPoint) {
        state.draggingTrajPoint = null;
        scheduleSave();
        repaintScene();
      }
      if (state.draggingDimension) {
        state.draggingDimension = null;
        scheduleSave();
        repaintScene();
      }
      if (state.draggingDimensionText) {
        state.draggingDimensionText = null;
        scheduleSave();
        repaintScene();
      }
    });

    ui.canvas.addEventListener("dblclick", () => {
      if (
        state.activeMode === "polygon" &&
        state.freePolygonPoints.length >= 3
      ) {
        finishFreePolygon();
      } else if (
        state.activeMode === "dimension" &&
        state.selectedDimensionId
      ) {
        if (typeof SceneDimensions !== "undefined") {
          SceneDimensions.editSelectedDimensionValue(state, helpers);
        }
      }
    });

    ui.canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (state.hasPanned) {
        state.hasPanned = false;
        return;
      }
      const coords = getCanvasRelativeCoords(e);
      if (state.activeMode === "select") {
        const trajHit = getTrajectoryPointAtCoords(coords);
        if (trajHit) {
          state.selectedTrajPoint = trajHit;
          removeSelectedTrajPoint();
          return;
        }
        if (state.selectedZoneId) {
          const hitV = getVertexAtCoords(coords);
          if (hitV) {
            state.selectedVertex = hitV;
            removeSelectedVertex();
          }
        }
      }
    });

    // Sincronización Inspector de Zonas
    ui.inputZoneName.addEventListener("input", (e) => {
      const zone = state.zones.find((z) => z.id === state.selectedZoneId);
      if (zone) {
        zone.name = e.target.value;
        updateZonesListUI();
        repaintScene();
      }
    });

    ui.selectZoneType.addEventListener("change", (e) => {
      const zone = state.zones.find((z) => z.id === state.selectedZoneId);
      if (zone) {
        zone.type = e.target.value;
        const cfg = ZONE_CONFIG[zone.type];
        if (cfg) {
          zone.color = cfg.color;
          zone.elevationMeters = cfg.defaultElevation;
          ui.inputZoneElevation.value = zone.elevationMeters;
        }
        updateZonesListUI();
        repaintScene();
      }
    });

    ui.inputZoneElevation.addEventListener("input", (e) => {
      const zone = state.zones.find((z) => z.id === state.selectedZoneId);
      if (zone) {
        const val = parseFloat(e.target.value);
        zone.elevationMeters = isNaN(val) ? 0 : val;
        updateZonesListUI();
        repaintScene();
      }
    });

    ui.textareaZoneNotes.addEventListener("input", (e) => {
      const zone = state.zones.find((z) => z.id === state.selectedZoneId);
      if (zone) zone.notes = e.target.value;
    });

    ui.btnDeleteZone.addEventListener("click", () => {
      if (!state.selectedZoneId) return;
      History.push();
      state.zones = state.zones.filter((z) => z.id !== state.selectedZoneId);
      selectZone(null);
      showToast("Zona eliminada");
    });

    // Sincronización Inspector de Objetos
    if (ui.inputObjName) {
      ui.inputObjName.addEventListener("input", (e) => {
        const obj = state.objects.find((o) => o.id === state.selectedObjectId);
        if (obj) {
          obj.name = e.target.value;
          updateObjectsListUI();
          scheduleSave();
        }
      });
    }

    if (ui.inputObjElevation) {
      ui.inputObjElevation.addEventListener("input", (e) => {
        const obj = state.objects.find((o) => o.id === state.selectedObjectId);
        if (obj) {
          obj.baseElevationMeters = parseFloat(e.target.value) || 0;
          scheduleSave();
          repaintScene();
        }
      });
    }

    if (ui.inputObjRotation) {
      ui.inputObjRotation.addEventListener("input", (e) => {
        const obj = state.objects.find((o) => o.id === state.selectedObjectId);
        if (obj) {
          obj.rotationDeg = parseFloat(e.target.value) || 0;
          scheduleSave();
          repaintScene();
        }
      });
    }

    if (ui.inputObjColor) {
      ui.inputObjColor.addEventListener("input", (e) => {
        const obj = state.objects.find((o) => o.id === state.selectedObjectId);
        if (obj) {
          obj.color = e.target.value;
          scheduleSave();
          repaintScene();
        }
      });
    }

    if (ui.checkObjInvolved) {
      ui.checkObjInvolved.addEventListener("change", (e) => {
        const obj = state.objects.find((o) => o.id === state.selectedObjectId);
        if (obj) {
          obj.isAccidentInvolved = e.target.checked;
          if (ui.objAccidentFields) {
            ui.objAccidentFields.style.display = obj.isAccidentInvolved
              ? "flex"
              : "none";
          }
          updateObjectsListUI();
          scheduleSave();
          repaintScene();
        }
      });
    }

    if (ui.selectObjRole) {
      ui.selectObjRole.addEventListener("change", (e) => {
        const obj = state.objects.find((o) => o.id === state.selectedObjectId);
        if (obj) {
          obj.role = e.target.value;
          scheduleSave();
        }
      });
    }

    if (ui.inputObjSpeed) {
      ui.inputObjSpeed.addEventListener("input", (e) => {
        const obj = state.objects.find((o) => o.id === state.selectedObjectId);
        if (obj) {
          const newSpeed = Math.max(0, parseFloat(e.target.value) || 0);
          if (!obj.kinematics) {
            obj.kinematics = {
              speedKmh: newSpeed,
              brakeDistanceM: 0,
              trajectoryPoints: [],
            };
          } else {
            const oldSpeed = Number(obj.kinematics.speedKmh) || 50;
            const ratio = oldSpeed > 0 ? newSpeed / oldSpeed : 1;
            obj.kinematics.speedKmh = newSpeed;
            if (Array.isArray(obj.kinematics.trajectoryPoints)) {
              obj.kinematics.trajectoryPoints.forEach((p) => {
                if (newSpeed === 0) {
                  p.speedKmh = 0;
                } else if (p.speedKmh !== undefined && oldSpeed > 0) {
                  p.speedKmh = Math.round(p.speedKmh * ratio);
                } else {
                  p.speedKmh = newSpeed;
                }
              });
            }
          }
          if (
            typeof Simulation !== "undefined" &&
            typeof Simulation.calculateTotalDuration === "function"
          ) {
            Simulation.calculateTotalDuration();
          }
          updateTrajectoryStats(obj);
          scheduleSave();
        }
      });
    }

    if (ui.inputObjDeviationAngle) {
      ui.inputObjDeviationAngle.addEventListener("input", (e) => {
        const obj = state.objects.find((o) => o.id === state.selectedObjectId);
        if (obj) {
          obj.deviationAngleDeg = parseFloat(e.target.value) || 0;
          scheduleSave();
          repaintScene();
        }
      });
    }

    if (ui.inputObjRiderLaunchAngle) {
      ui.inputObjRiderLaunchAngle.addEventListener("input", (e) => {
        const obj = state.objects.find((o) => o.id === state.selectedObjectId);
        if (obj) {
          if (!obj.rider) {
            obj.rider = {
              enabled: true,
              massKg: 75,
              frictionGround: 0.66,
              launchAngleDeg: 15,
              restitution: 0.1,
            };
          }
          obj.rider.launchAngleDeg = Math.max(
            0,
            Math.min(60, parseFloat(e.target.value) || 15),
          );
          scheduleSave();
        }
      });
    }

    if (ui.inputObjRiderRestDist) {
      ui.inputObjRiderRestDist.addEventListener("input", (e) => {
        const obj = state.objects.find((o) => o.id === state.selectedObjectId);
        if (obj) {
          if (!obj.rider) {
            obj.rider = {
              enabled: true,
              massKg: 75,
              frictionGround: 0.66,
              launchAngleDeg: 15,
              restitution: 0.1,
            };
          }
          const distM = Math.max(0.5, Math.min(50, parseFloat(e.target.value) || 6.0));
          obj.rider.finalRestDistanceM = distM;
          const sz = state.metadata?.sizeMeters || 100;
          const pts = obj.kinematics?.trajectoryPoints || [];
          const pImpact = pts.find((p) => p.type === "impact_point") || pts[pts.length - 1];
          if (pImpact) {
            let angle;
            if (obj.rider.finalRest && obj.rider.finalRest.normX !== undefined) {
              angle = Math.atan2(obj.rider.finalRest.normY - pImpact.normY, obj.rider.finalRest.normX - pImpact.normX);
            } else {
              const idxImp = pts.indexOf(pImpact);
              let fwdAng = ((obj.rotationDeg || 0) * Math.PI) / 180;
              if (idxImp > 0) fwdAng = Math.atan2(pImpact.normY - pts[idxImp - 1].normY, pImpact.normX - pts[idxImp - 1].normX);
              angle = fwdAng + ((obj.deviationAngleDeg || 0) * Math.PI) / 180;
            }
            const dNorm = distM / sz;
            const nx = Math.max(0.005, Math.min(0.995, pImpact.normX + Math.cos(angle) * dNorm));
            const ny = Math.max(0.005, Math.min(0.995, pImpact.normY + Math.sin(angle) * dNorm));
            obj.rider.finalRest = { normX: nx, normY: ny, x: (nx - 0.5) * sz, z: (ny - 0.5) * sz, distanceM: distM };
          }
          scheduleSave();
          repaintScene();
        }
      });
    }

    if (ui.inputObjVehicleRestDist) {
      ui.inputObjVehicleRestDist.addEventListener("input", (e) => {
        const obj = state.objects.find((o) => o.id === state.selectedObjectId);
        if (obj) {
          const distM = Math.max(0.5, Math.min(60, parseFloat(e.target.value) || 5.0));
          obj.finalRestDistanceM = distM;
          const sz = state.metadata?.sizeMeters || 100;
          const pts = obj.kinematics?.trajectoryPoints || [];
          const pImpact = pts.find((p) => p.type === "impact_point") || pts[pts.length - 1];
          if (pImpact) {
            let angle;
            if (obj.finalRest?.normX !== undefined) {
              angle = Math.atan2(obj.finalRest.normY - pImpact.normY, obj.finalRest.normX - pImpact.normX);
            } else {
              const idxImp = pts.indexOf(pImpact);
              let fwdAng = ((obj.rotationDeg || 0) * Math.PI) / 180;
              if (idxImp > 0) fwdAng = Math.atan2(pImpact.normY - pts[idxImp - 1].normY, pImpact.normX - pts[idxImp - 1].normX);
              angle = fwdAng + ((obj.deviationAngleDeg || 0) * Math.PI) / 180;
            }
            const dNorm = distM / sz;
            const nx = Math.max(0.005, Math.min(0.995, pImpact.normX + Math.cos(angle) * dNorm));
            const ny = Math.max(0.005, Math.min(0.995, pImpact.normY + Math.sin(angle) * dNorm));
            obj.finalRest = { normX: nx, normY: ny, x: (nx - 0.5) * sz, z: (ny - 0.5) * sz, distanceM: distM };
            const pRest = pts.find((p) => p.type === "final_rest");
            if (pRest) {
              pRest.normX = nx;
              pRest.normY = ny;
              pRest.x = (nx - 0.5) * sz;
              pRest.z = (ny - 0.5) * sz;
            }
          }
          scheduleSave();
          repaintScene();
        }
      });
    }

    if (ui.btnTraceTrajectory) {
      ui.btnTraceTrajectory.addEventListener("click", () =>
        toggleTraceTrajectory(),
      );
    }

    if (ui.inputSkidLength) {
      ui.inputSkidLength.addEventListener("input", (e) => {
        const obj = state.objects.find((o) => o.id === state.selectedObjectId);
        if (obj) {
          obj.skidLengthM = Math.max(1, parseFloat(e.target.value) || 10);
          scheduleSave();
          repaintScene();
        }
      });
    }

    if (ui.inputSkidTrack) {
      ui.inputSkidTrack.addEventListener("input", (e) => {
        const obj = state.objects.find((o) => o.id === state.selectedObjectId);
        if (obj) {
          obj.skidTrackWidthM = Math.max(
            0.5,
            parseFloat(e.target.value) || 1.5,
          );
          scheduleSave();
          repaintScene();
        }
      });
    }

    if (ui.checkSkidTriggerOnPass) {
      ui.checkSkidTriggerOnPass.addEventListener("change", (e) => {
        const obj = state.objects.find((o) => o.id === state.selectedObjectId);
        if (obj) {
          obj.triggerOnPass = e.target.checked;
          scheduleSave();
          repaintScene();
        }
      });
    }

    if (ui.textareaObjNotes) {
      ui.textareaObjNotes.addEventListener("input", (e) => {
        const obj = state.objects.find((o) => o.id === state.selectedObjectId);
        if (obj) {
          obj.notes = e.target.value;
          scheduleSave();
        }
      });
    }

    if (ui.btnDeleteObject) {
      ui.btnDeleteObject.addEventListener("click", () =>
        removeSelectedObject(),
      );
    }

    // Atajos de teclado (Modularizados en scene_shortcuts.js)
    if (typeof initSceneKeyboardShortcuts === "function") {
      initSceneKeyboardShortcuts(
        state,
        ui,
        helpers,
        () => isSpaceKeyPressed,
        (v) => {
          isSpaceKeyPressed = v;
        },
      );
    }
  }

  return { initSceneEvents };
});
