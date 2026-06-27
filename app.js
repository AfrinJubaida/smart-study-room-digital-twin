"use strict";

// ==========================================================
// 1. BABYLON ENGINE
// ==========================================================

const canvas = document.getElementById("renderCanvas");

const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    adaptToDeviceRatio: true
});

let scene = null;
let camera = null;
let roomModel = null;

const MODEL_FILE = "./assets/room.compressed.ply";

// Keep this true while positioning markers.
// Change it to false before the final recording.
const ENABLE_MARKER_EDITING = true;

// Marker spheres are the actual movable anchor objects.
const markerSpheres = {};

let gizmoManager = null;
let selectedMarkerName = null;

// ==========================================================
// 2. DIGITAL-TWIN STATE
// ==========================================================

const defaultState = {
    temperature: 23.4,
    humidity: 47,
    occupancy: 2,
    light: 340,
    deviceOn: true,
    power: 67
};

let twinState = { ...defaultState };
let simulationMode = "normal";

// ==========================================================
// 3. INITIAL MARKER COORDINATES
//
// Replace these values later with the coordinates printed
// after you move all five coloured spheres.
// ==========================================================

const markerPositions = {
    temperature: new BABYLON.Vector3(0, 1.5, 0),
    humidity: new BABYLON.Vector3(-1.5, 1.5, 0),
    occupancy: new BABYLON.Vector3(1.8, 1.4, 1),
    light: new BABYLON.Vector3(0.8, 1.6, -1),
    power: new BABYLON.Vector3(0.3, 1.1, -0.8)
};

const markerElements = {
    temperature: document.getElementById("temperatureMarker"),
    humidity: document.getElementById("humidityMarker"),
    occupancy: document.getElementById("occupancyMarker"),
    light: document.getElementById("lightMarker"),
    power: document.getElementById("powerMarker")
};

// ==========================================================
// 4. CREATE SCENE
// ==========================================================

async function createScene() {
    const newScene = new BABYLON.Scene(engine);

    newScene.clearColor = new BABYLON.Color4(
        0.035,
        0.045,
        0.055,
        1
    );

    createCamera(newScene);

    setLoadingMessage("Loading the Gaussian-splat room…");

    try {
        const result = await BABYLON.ImportMeshAsync(
            MODEL_FILE,
            newScene
        );

        if (!result.meshes || result.meshes.length === 0) {
            throw new Error(
                "No Gaussian-splat model was returned."
            );
        }

        roomModel =
            result.meshes.find(
                mesh =>
                    mesh instanceof
                    BABYLON.GaussianSplattingMesh
            ) || result.meshes[0];

        console.log("Loaded model:", roomModel);

        console.log(
            "Gaussian splat loaded:",
            roomModel instanceof BABYLON.GaussianSplattingMesh
        );

        roomModel.position = BABYLON.Vector3.Zero();
        roomModel.scaling = BABYLON.Vector3.One();

        roomModel.computeWorldMatrix(true);

        focusCameraOnModel(roomModel);

        createMarkerSpheres(newScene);

        if (ENABLE_MARKER_EDITING) {
            enableMarkerPlacement(newScene);
        }

        hideLoadingScreen();
    } catch (error) {
        console.error(
            "Gaussian-splat loading error:",
            error
        );

        showLoadingError(error);
    }

    setupButtons();

    updateDisplay();
    evaluateRecommendations();

    window.setInterval(updateSimulation, 2000);

    return newScene;
}

// ==========================================================
// 5. CAMERA
// ==========================================================

function createCamera(currentScene) {
    camera = new BABYLON.ArcRotateCamera(
        "camera",
        -Math.PI / 2,
        Math.PI / 2.3,
        12,
        BABYLON.Vector3.Zero(),
        currentScene
    );

    camera.attachControl(canvas, true);

    camera.fov = BABYLON.Tools.ToRadians(50);

    /*
     * Smaller wheelPrecision means faster wheel zoom.
     */
    camera.wheelPrecision = 18;

    camera.panningSensibility = 120;
    camera.angularSensibilityX = 900;
    camera.angularSensibilityY = 900;

    /*
     * Temporary general limits.
     * These are updated after the model dimensions are known.
     */
    camera.lowerRadiusLimit = 0.1;
    camera.upperRadiusLimit = 1000;

    camera.minZ = 0.01;
    camera.maxZ = 5000;

    /*
     * Makes right-drag panning easier.
     */
    camera.useNaturalPinchZoom = true;
    camera.pinchPrecision = 50;
    camera.panningInertia = 0.85;
    camera.inertia = 0.85;
}

function focusCameraOnModel(model) {
    if (!model || !camera) {
        return;
    }

    model.computeWorldMatrix(true);

    const boundingInfo = model.getBoundingInfo();

    if (!boundingInfo) {
        camera.setTarget(BABYLON.Vector3.Zero());
        camera.radius = 10;
        camera.lowerRadiusLimit = 0.1;
        camera.upperRadiusLimit = 100;

        return;
    }

    const centre =
        boundingInfo.boundingBox.centerWorld.clone();

    const extent =
        boundingInfo.boundingBox.extendSizeWorld;

    const largestDimension =
        Math.max(
            extent.x,
            extent.y,
            extent.z
        ) * 2;

    console.log("Room centre:", centre);
    console.log("Room size:", largestDimension);

    camera.setTarget(centre);

    /*
     * Start outside the whole room,
     * but not excessively far away.
     */
    camera.radius = Math.max(
        largestDimension * 2.2,
        5
    );

    camera.alpha = -Math.PI / 2;
    camera.beta = Math.PI / 2.25;

    /*
     * This fixes the earlier zoom problem.
     * The camera may now move much closer to the room.
     */
    camera.lowerRadiusLimit = Math.max(
        largestDimension * 0.01,
        0.05
    );

    camera.upperRadiusLimit = Math.max(
        largestDimension * 10,
        100
    );

    console.log(
        "Starting camera radius:",
        camera.radius
    );

    console.log(
        "Minimum camera radius:",
        camera.lowerRadiusLimit
    );
}

function resetCamera() {
    if (roomModel) {
        focusCameraOnModel(roomModel);
    }
}

// ==========================================================
// 6. CREATE MOVABLE MARKER SPHERES
//
// The spheres are temporary placement handles.
// The data labels follow their positions.
// ==========================================================

function createMarkerSpheres(currentScene) {
    const markerColors = {
        temperature: new BABYLON.Color3(1, 0.2, 0.2),
        humidity: new BABYLON.Color3(0.2, 0.55, 1),
        occupancy: new BABYLON.Color3(0.75, 0.25, 1),
        light: new BABYLON.Color3(1, 0.85, 0.15),
        power: new BABYLON.Color3(0.2, 1, 0.4)
    };

    Object.entries(markerPositions).forEach(
        ([name, position]) => {
            const sphere =
                BABYLON.MeshBuilder.CreateSphere(
                    `${name}MarkerSphere`,
                    {
                        diameter: getMarkerDiameter()
                    },
                    currentScene
                );

            /*
             * The sphere itself stores the world coordinates.
             * This fixes the earlier issue where unchanged parent
             * TransformNode values were printed.
             */
            sphere.position.copyFrom(position);

            sphere.isPickable =
                ENABLE_MARKER_EDITING;

            sphere.metadata = {
                markerName: name
            };

            const material =
                new BABYLON.StandardMaterial(
                    `${name}MarkerMaterial`,
                    currentScene
                );

            material.diffuseColor =
                markerColors[name];

            material.emissiveColor =
                markerColors[name];

            material.disableLighting = true;

            material.alpha =
                ENABLE_MARKER_EDITING ? 1 : 0;

            sphere.material = material;

            /*
             * Invisible final anchor spheres still exist so that
             * the HTML labels can follow their coordinates.
             */
            sphere.visibility =
                ENABLE_MARKER_EDITING ? 1 : 0;

            markerSpheres[name] = sphere;
        }
    );
}

function getMarkerDiameter() {
    if (!roomModel) {
        return 0.12;
    }

    const boundingInfo =
        roomModel.getBoundingInfo();

    if (!boundingInfo) {
        return 0.12;
    }

    const extent =
        boundingInfo.boundingBox.extendSizeWorld;

    const largestDimension =
        Math.max(
            extent.x,
            extent.y,
            extent.z
        ) * 2;

    /*
     * Marker size scales with the room.
     */
    return Math.max(
        largestDimension * 0.018,
        0.06
    );
}

// ==========================================================
// 7. MARKER PLACEMENT GIZMO
// ==========================================================

function enableMarkerPlacement(currentScene) {
    gizmoManager =
        new BABYLON.GizmoManager(currentScene);

    gizmoManager.positionGizmoEnabled = true;
    gizmoManager.rotationGizmoEnabled = false;
    gizmoManager.scaleGizmoEnabled = false;
    gizmoManager.boundingBoxGizmoEnabled = false;

    /*
     * We attach it ourselves after a sphere is clicked.
     */
    gizmoManager.usePointerToAttachGizmos = false;

    if (gizmoManager.gizmos.positionGizmo) {
        gizmoManager.gizmos
            .positionGizmo
            .updateGizmoRotationToMatchAttachedMesh = false;

        gizmoManager.gizmos
            .positionGizmo
            .scaleRatio = 1;
    }

    currentScene.onPointerObservable.add(
        pointerInfo => {
            if (
                pointerInfo.type !==
                BABYLON.PointerEventTypes.POINTERPICK
            ) {
                return;
            }

            const pickedMesh =
                pointerInfo.pickInfo?.pickedMesh;

            const markerName =
                pickedMesh?.metadata?.markerName;

            if (!markerName) {
                return;
            }

            selectMarkerForPlacement(markerName);
        }
    );

    console.log(
        "Marker editing enabled. Click a coloured sphere."
    );
}

function selectMarkerForPlacement(markerName) {
    const sphere = markerSpheres[markerName];

    if (!sphere || !gizmoManager) {
        return;
    }

    selectedMarkerName = markerName;

    /*
     * Attach directly to the movable sphere.
     */
    gizmoManager.attachToMesh(sphere);

    console.log(
        `Selected marker: ${markerName}`
    );

    console.log(
        "Current position:",
        sphere.position.x.toFixed(3),
        sphere.position.y.toFixed(3),
        sphere.position.z.toFixed(3)
    );
}

// ==========================================================
// 8. PRINT AND COPY MARKER COORDINATES
// ==========================================================

function printAllMarkerCoordinates() {
    const coordinates = {};

    Object.entries(markerSpheres).forEach(
        ([name, sphere]) => {
            /*
             * Use the actual absolute position of the sphere.
             */
            const position =
                sphere.getAbsolutePosition();

            coordinates[name] = {
                x: Number(position.x.toFixed(3)),
                y: Number(position.y.toFixed(3)),
                z: Number(position.z.toFixed(3))
            };
        }
    );

    console.table(coordinates);

    const generatedCode = `
const markerPositions = {
    temperature: new BABYLON.Vector3(
        ${coordinates.temperature.x},
        ${coordinates.temperature.y},
        ${coordinates.temperature.z}
    ),

    humidity: new BABYLON.Vector3(
        ${coordinates.humidity.x},
        ${coordinates.humidity.y},
        ${coordinates.humidity.z}
    ),

    occupancy: new BABYLON.Vector3(
        ${coordinates.occupancy.x},
        ${coordinates.occupancy.y},
        ${coordinates.occupancy.z}
    ),

    light: new BABYLON.Vector3(
        ${coordinates.light.x},
        ${coordinates.light.y},
        ${coordinates.light.z}
    ),

    power: new BABYLON.Vector3(
        ${coordinates.power.x},
        ${coordinates.power.y},
        ${coordinates.power.z}
    )
};
`;

    console.log(generatedCode);

    if (
        navigator.clipboard &&
        window.isSecureContext
    ) {
        navigator.clipboard
            .writeText(generatedCode)
            .then(() => {
                console.log(
                    "Marker coordinate code copied to clipboard."
                );
            })
            .catch(error => {
                console.warn(
                    "Automatic copy failed. Copy it manually:",
                    error
                );
            });
    }
}

// ==========================================================
// 9. LOADING SCREEN
// ==========================================================

function setLoadingMessage(message) {
    const element =
        document.getElementById("loadingStatus");

    if (element) {
        element.textContent = message;
    }
}

function hideLoadingScreen() {
    document
        .getElementById("loadingScreen")
        ?.classList
        .add("hidden");
}

function showLoadingError(error) {
    const message =
        error instanceof Error
            ? error.message
            : String(error);

    const element =
        document.getElementById("loadingStatus");

    if (element) {
        element.innerHTML =
            "The room could not be loaded.<br>" +
            "Check that assets/room.compressed.ply exists." +
            "<br><br>" +
            message;
    }
}

// ==========================================================
// 10. SIMULATED LIVE DATA
// ==========================================================

function noise(amount) {
    return (
        Math.random() * 2 - 1
    ) * amount;
}

function clamp(value, minimum, maximum) {
    return Math.max(
        minimum,
        Math.min(maximum, value)
    );
}

function updateSimulation() {
    switch (simulationMode) {
        case "normal":
            updateNormalScenario();
            break;

        case "lowLight":
            updateLowLightScenario();
            break;

        case "emptyRoom":
            updateEmptyRoomScenario();
            break;

        case "crowdedRoom":
            updateCrowdedRoomScenario();
            break;

        default:
            simulationMode = "normal";
            updateNormalScenario();
    }

    updateDisplay();
    evaluateRecommendations();
}

function updateNormalScenario() {
    twinState.temperature = clamp(
        twinState.temperature + noise(0.08),
        20,
        25
    );

    twinState.humidity = clamp(
        twinState.humidity + noise(0.3),
        35,
        58
    );

    twinState.light = clamp(
        twinState.light + noise(5),
        300,
        500
    );

    twinState.power =
        twinState.deviceOn
            ? clamp(
                twinState.power + noise(1.2),
                55,
                80
            )
            : 0;
}

function updateLowLightScenario() {
    twinState.occupancy = 2;

    twinState.light = clamp(
        twinState.light + noise(4),
        130,
        220
    );

    twinState.temperature = clamp(
        twinState.temperature + noise(0.05),
        21,
        25
    );

    twinState.humidity = clamp(
        twinState.humidity + noise(0.2),
        40,
        55
    );
}

function updateEmptyRoomScenario() {
    twinState.occupancy = 0;
    twinState.deviceOn = true;

    twinState.power = clamp(
        twinState.power + noise(1),
        60,
        75
    );

    twinState.light = clamp(
        twinState.light + noise(3),
        80,
        160
    );
}

function updateCrowdedRoomScenario() {
    twinState.occupancy = 4;

    twinState.temperature = clamp(
        twinState.temperature +
            0.08 +
            noise(0.03),
        26,
        28.5
    );

    twinState.humidity = clamp(
        twinState.humidity +
            0.15 +
            noise(0.1),
        61,
        70
    );

    twinState.light = clamp(
        twinState.light + noise(4),
        250,
        380
    );
}

// ==========================================================
// 11. UPDATE DISPLAY
// ==========================================================

function updateDisplay() {
    setText(
        "temperatureValue",
        `${twinState.temperature.toFixed(1)} °C`
    );

    setText(
        "humidityValue",
        `${twinState.humidity.toFixed(0)}%`
    );

    setText(
        "occupancyValue",
        `${twinState.occupancy} ${
            twinState.occupancy === 1
                ? "person"
                : "people"
        }`
    );

    setText(
        "lightValue",
        `${twinState.light.toFixed(0)} lux`
    );

    setText(
        "powerValue",
        twinState.deviceOn
            ? `ON · ${twinState.power.toFixed(0)} W`
            : "OFF · 0 W"
    );

    updateTemperatureStatus();
    updateHumidityStatus();
    updateOccupancyStatus();
    updateLightStatus();
    updatePowerStatus();

    setText(
        "lastUpdated",
        `Last updated: ${new Date().toLocaleTimeString()}`
    );
}

function setText(id, text) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = text;
    }
}

function updateTemperatureStatus() {
    const comfortable =
        twinState.temperature <= 25.5;

    setSensorStatus(
        "temperature",
        comfortable
            ? "Comfortable"
            : "Too warm",
        comfortable
            ? "normal"
            : "danger"
    );
}

function updateHumidityStatus() {
    const normal =
        twinState.humidity <= 60;

    setSensorStatus(
        "humidity",
        normal
            ? "Normal"
            : "High humidity",
        normal
            ? "normal"
            : "warning"
    );
}

function updateOccupancyStatus() {
    let message = "Occupied";
    let level = "normal";

    if (twinState.occupancy === 0) {
        message = "Unoccupied";
    } else if (twinState.occupancy >= 4) {
        message = "High occupancy";
        level = "warning";
    }

    setSensorStatus(
        "occupancy",
        message,
        level
    );
}

function updateLightStatus() {
    const adequate =
        twinState.light >= 300;

    setSensorStatus(
        "light",
        adequate
            ? "Adequate"
            : "Insufficient",
        adequate
            ? "normal"
            : "warning"
    );
}

function updatePowerStatus() {
    const wastingEnergy =
        twinState.occupancy === 0 &&
        twinState.deviceOn;

    let message = "Off";
    let level = "normal";

    if (wastingEnergy) {
        message = "Potential energy waste";
        level = "danger";
    } else if (twinState.deviceOn) {
        message = "Active";
    }

    setSensorStatus(
        "power",
        message,
        level
    );
}

function setSensorStatus(
    sensor,
    message,
    level
) {
    const marker =
        markerElements[sensor];

    if (!marker) {
        return;
    }

    marker.classList.remove(
        "warning",
        "danger"
    );

    if (
        level === "warning" ||
        level === "danger"
    ) {
        marker.classList.add(level);
    }

    setText(
        `${sensor}Status`,
        message
    );
}

// ==========================================================
// 12. DECISION LAYER
// ==========================================================

function evaluateRecommendations() {
    const recommendations = [];

    if (
        twinState.occupancy > 0 &&
        twinState.light < 300
    ) {
        recommendations.push({
            priority: "Medium priority",
            level: "",
            action: "Increase desk lighting",
            reason:
                "The occupied workspace is receiving " +
                `${twinState.light.toFixed(0)} lux.`
        });
    }

    if (
        twinState.occupancy === 0 &&
        twinState.deviceOn &&
        twinState.power > 10
    ) {
        recommendations.push({
            priority: "High priority",
            level: "high",
            action:
                "Turn off unused computer equipment",
            reason:
                "The room is empty while the computer " +
                `is consuming ${twinState.power.toFixed(0)} W.`
        });
    }

    if (
        twinState.occupancy > 0 &&
        twinState.temperature > 25.5
    ) {
        recommendations.push({
            priority: "High priority",
            level: "high",
            action:
                "Increase ventilation or cooling",
            reason:
                `Room temperature is ` +
                `${twinState.temperature.toFixed(1)} °C ` +
                `with ${twinState.occupancy} occupants.`
        });
    }

    if (twinState.humidity > 60) {
        recommendations.push({
            priority: "Medium priority",
            level: "",
            action: "Improve room ventilation",
            reason:
                `Relative humidity has reached ` +
                `${twinState.humidity.toFixed(0)}%.`
        });
    }

    if (recommendations.length === 0) {
        recommendations.push({
            priority: "Normal",
            level: "normal",
            action:
                "No immediate intervention required",
            reason:
                "Current environmental and energy " +
                "conditions are within the configured limits."
        });
    }

    renderRecommendations(
        recommendations.slice(0, 3)
    );
}

function renderRecommendations(
    recommendations
) {
    const container =
        document.getElementById(
            "recommendations"
        );

    if (!container) {
        return;
    }

    container.innerHTML = "";

    recommendations.forEach(
        recommendation => {
            const card =
                document.createElement("div");

            card.className =
                `recommendation ${recommendation.level}`;

            const title =
                document.createElement("strong");

            title.textContent =
                recommendation.action;

            const description =
                document.createElement("p");

            description.textContent =
                `${recommendation.priority}: ` +
                recommendation.reason;

            card.appendChild(title);
            card.appendChild(description);

            container.appendChild(card);
        }
    );
}

// ==========================================================
// 13. BUTTONS AND SCENARIOS
// ==========================================================

function setupButtons() {
    addClickListener(
        "normalButton",
        activateNormalScenario
    );

    addClickListener(
        "lowLightButton",
        activateLowLightScenario
    );

    addClickListener(
        "emptyRoomButton",
        activateEmptyRoomScenario
    );

    addClickListener(
        "crowdedRoomButton",
        activateCrowdedRoomScenario
    );

    addClickListener(
        "resetCameraButton",
        resetCamera
    );

    addClickListener(
        "printCoordinatesButton",
        printAllMarkerCoordinates
    );
}

function addClickListener(id, handler) {
    document
        .getElementById(id)
        ?.addEventListener(
            "click",
            handler
        );
}

function activateNormalScenario() {
    simulationMode = "normal";
    twinState = { ...defaultState };

    refreshDigitalTwin();
}

function activateLowLightScenario() {
    simulationMode = "lowLight";

    twinState = {
        temperature: 23.6,
        humidity: 48,
        occupancy: 2,
        light: 175,
        deviceOn: true,
        power: 66
    };

    refreshDigitalTwin();
}

function activateEmptyRoomScenario() {
    simulationMode = "emptyRoom";

    twinState = {
        temperature: 22.8,
        humidity: 45,
        occupancy: 0,
        light: 110,
        deviceOn: true,
        power: 69
    };

    refreshDigitalTwin();
}

function activateCrowdedRoomScenario() {
    simulationMode = "crowdedRoom";

    twinState = {
        temperature: 26.8,
        humidity: 63,
        occupancy: 4,
        light: 280,
        deviceOn: true,
        power: 72
    };

    refreshDigitalTwin();
}

function refreshDigitalTwin() {
    updateDisplay();
    evaluateRecommendations();
}

// ==========================================================
// 14. KEEP HTML CARDS ATTACHED TO 3D MARKERS
// ==========================================================

function updateMarkerPositions() {
    if (
        !scene ||
        !camera ||
        !roomModel
    ) {
        hideAllMarkers();
        return;
    }

    const viewport =
        camera.viewport.toGlobal(
            engine.getRenderWidth(),
            engine.getRenderHeight()
        );

    Object.entries(markerSpheres).forEach(
        ([name, sphere]) => {
            const worldPosition =
                sphere.getAbsolutePosition();

            const screenPosition =
                BABYLON.Vector3.Project(
                    worldPosition,
                    BABYLON.Matrix.Identity(),
                    scene.getTransformMatrix(),
                    viewport
                );

            const marker =
                markerElements[name];

            if (!marker) {
                return;
            }

            const outsideDepth =
                screenPosition.z < 0 ||
                screenPosition.z > 1;

            const outsideScreen =
                screenPosition.x < 0 ||
                screenPosition.x >
                    engine.getRenderWidth() ||
                screenPosition.y < 0 ||
                screenPosition.y >
                    engine.getRenderHeight();

            if (
                outsideDepth ||
                outsideScreen
            ) {
                marker.style.display = "none";
                return;
            }

            marker.style.display = "block";

            marker.style.left =
                `${screenPosition.x}px`;

            marker.style.top =
                `${screenPosition.y}px`;
        }
    );
}

function hideAllMarkers() {
    Object.values(markerElements).forEach(
        marker => {
            if (marker) {
                marker.style.display = "none";
            }
        }
    );
}

// ==========================================================
// 15. START APPLICATION
// ==========================================================

createScene()
    .then(createdScene => {
        scene = createdScene;

        engine.runRenderLoop(() => {
            scene.render();
            updateMarkerPositions();
        });
    })
    .catch(error => {
        console.error(
            "Application startup failed:",
            error
        );

        showLoadingError(error);
    });

window.addEventListener(
    "resize",
    () => {
        engine.resize();
    }
);
