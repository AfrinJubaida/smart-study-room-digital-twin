"use strict";

// ==========================================================
// 1. BASIC BABYLON SETUP
// ==========================================================

const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true
});

let scene;
let camera;
let roomModel;

// Change this to "./assets/room.ply" if you use PLY instead.
const MODEL_FILE = "./assets/room.sog";

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
// 3. SENSOR MARKER POSITIONS
//
// These are initial example coordinates.
// You will adjust them after seeing your room.
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

    camera = new BABYLON.ArcRotateCamera(
        "camera",
        -Math.PI / 2,
        Math.PI / 2.4,
        5,
        BABYLON.Vector3.Zero(),
        newScene
    );

    camera.attachControl(canvas, true);

    camera.wheelPrecision = 35;
    camera.panningSensibility = 110;
    camera.angularSensibilityX = 800;
    camera.angularSensibilityY = 800;

    camera.lowerRadiusLimit = 0.15;
    camera.upperRadiusLimit = 30;

    camera.minZ = 0.01;
    camera.maxZ = 1000;

    window.addEventListener("keydown", handleKeyboardMovement);

    document.getElementById("loadingStatus").textContent =
        "Loading the Gaussian-splat room…";

    try {
        const result =
            await BABYLON.SceneLoader.ImportMeshAsync(
                "",
                "",
                MODEL_FILE,
                newScene
            );

        if (!result.meshes || result.meshes.length === 0) {
            throw new Error("No Gaussian-splat mesh was returned.");
        }

        roomModel =
            result.meshes.find(mesh =>
                mesh instanceof BABYLON.GaussianSplattingMesh
            ) || result.meshes[0];

        // Keep the model at its original transform first.
        roomModel.position = BABYLON.Vector3.Zero();

        // Automatically focus the camera on the room.
        focusCameraOnModel(roomModel);

        document
            .getElementById("loadingScreen")
            .classList.add("hidden");
    } catch (error) {
        console.error(error);

        document.getElementById("loadingStatus").innerHTML =
            "The room could not be loaded.<br>" +
            "Check that assets/room.sog exists.<br><br>" +
            error.message;
    }

    setupButtons();
    updateDisplay();
    evaluateRecommendations();

    window.setInterval(updateSimulation, 2000);

    return newScene;
}

// ==========================================================
// 5. CAMERA POSITIONING
// ==========================================================

function focusCameraOnModel(model) {
    const boundingInfo = model.getBoundingInfo();

    if (!boundingInfo) {
        camera.setTarget(BABYLON.Vector3.Zero());
        camera.radius = 5;
        return;
    }

    const centre =
        boundingInfo.boundingBox.centerWorld.clone();

    const extent =
        boundingInfo.boundingBox.extendSizeWorld;

    const largestDimension =
        Math.max(extent.x, extent.y, extent.z) * 2;

    camera.setTarget(centre);

    camera.radius =
        Math.max(largestDimension * 1.25, 1);

    camera.alpha = -Math.PI / 2;
    camera.beta = Math.PI / 2.4;

    camera.upperRadiusLimit =
        Math.max(largestDimension * 4, 10);
}

function resetCamera() {
    if (roomModel) {
        focusCameraOnModel(roomModel);
    }
}

// Optional keyboard support.
function handleKeyboardMovement(event) {
    if (!camera) return;

    const step = camera.radius * 0.025;

    const forward = camera.getForwardRay().direction.clone();
    forward.y = 0;

    if (forward.lengthSquared() > 0) {
        forward.normalize();
    }

    const right = BABYLON.Vector3.Cross(
        forward,
        BABYLON.Axis.Y
    ).normalize();

    switch (event.key.toLowerCase()) {
        case "w":
            camera.target.addInPlace(forward.scale(step));
            break;

        case "s":
            camera.target.addInPlace(forward.scale(-step));
            break;

        case "a":
            camera.target.addInPlace(right.scale(-step));
            break;

        case "d":
            camera.target.addInPlace(right.scale(step));
            break;
    }
}

// ==========================================================
// 6. LIVE SENSOR SIMULATION
// ==========================================================

function noise(amount) {
    return (Math.random() * 2 - 1) * amount;
}

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

function updateSimulation() {
    if (simulationMode === "normal") {
        twinState.temperature =
            clamp(twinState.temperature + noise(0.08), 20, 25);

        twinState.humidity =
            clamp(twinState.humidity + noise(0.3), 35, 58);

        twinState.light =
            clamp(twinState.light + noise(5), 300, 500);

        twinState.power =
            twinState.deviceOn
                ? clamp(twinState.power + noise(1.2), 55, 80)
                : 0;
    }

    if (simulationMode === "lowLight") {
        twinState.light =
            clamp(twinState.light + noise(4), 130, 220);

        twinState.temperature += noise(0.05);
        twinState.humidity += noise(0.2);
    }

    if (simulationMode === "emptyRoom") {
        twinState.occupancy = 0;
        twinState.deviceOn = true;
        twinState.power =
            clamp(twinState.power + noise(1), 60, 75);
    }

    if (simulationMode === "crowdedRoom") {
        twinState.occupancy = 4;

        twinState.temperature =
            clamp(twinState.temperature + 0.08 + noise(0.03),
                  26,
                  28.5);

        twinState.humidity =
            clamp(twinState.humidity + 0.15 + noise(0.1),
                  61,
                  70);

        twinState.light =
            clamp(twinState.light + noise(4), 250, 380);
    }

    updateDisplay();
    evaluateRecommendations();
}

// ==========================================================
// 7. UPDATE SENSOR TEXT
// ==========================================================

function updateDisplay() {
    document.getElementById("temperatureValue").textContent =
        `${twinState.temperature.toFixed(1)} °C`;

    document.getElementById("humidityValue").textContent =
        `${twinState.humidity.toFixed(0)}%`;

    document.getElementById("occupancyValue").textContent =
        `${twinState.occupancy} ${
            twinState.occupancy === 1 ? "person" : "people"
        }`;

    document.getElementById("lightValue").textContent =
        `${twinState.light.toFixed(0)} lux`;

    document.getElementById("powerValue").textContent =
        twinState.deviceOn
            ? `ON · ${twinState.power.toFixed(0)} W`
            : "OFF · 0 W";

    setSensorStatus(
        "temperature",
        twinState.temperature <= 25.5
            ? "Comfortable"
            : "Too warm",
        twinState.temperature <= 25.5
            ? "normal"
            : "danger"
    );

    setSensorStatus(
        "humidity",
        twinState.humidity <= 60
            ? "Normal"
            : "High humidity",
        twinState.humidity <= 60
            ? "normal"
            : "warning"
    );

    setSensorStatus(
        "occupancy",
        twinState.occupancy === 0
            ? "Unoccupied"
            : twinState.occupancy >= 4
                ? "High occupancy"
                : "Occupied",
        twinState.occupancy >= 4
            ? "warning"
            : "normal"
    );

    setSensorStatus(
        "light",
        twinState.light >= 300
            ? "Adequate"
            : "Insufficient",
        twinState.light >= 300
            ? "normal"
            : "warning"
    );

    setSensorStatus(
        "power",
        twinState.occupancy === 0 &&
        twinState.deviceOn
            ? "Potential energy waste"
            : twinState.deviceOn
                ? "Active"
                : "Off",
        twinState.occupancy === 0 &&
        twinState.deviceOn
            ? "danger"
            : "normal"
    );

    document.getElementById("lastUpdated").textContent =
        `Last updated: ${new Date().toLocaleTimeString()}`;
}

function setSensorStatus(sensor, message, level) {
    const marker = markerElements[sensor];

    marker.classList.remove("warning", "danger");

    if (level === "warning" || level === "danger") {
        marker.classList.add(level);
    }

    document.getElementById(
        `${sensor}Status`
    ).textContent = message;
}

// ==========================================================
// 8. DECISION LAYER
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
                `The occupied workspace is receiving only ` +
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
            action: "Turn off unused computer equipment",
            reason:
                `The room is empty while the computer is ` +
                `consuming ${twinState.power.toFixed(0)} W.`
        });
    }

    if (
        twinState.occupancy > 0 &&
        twinState.temperature > 25.5
    ) {
        recommendations.push({
            priority: "High priority",
            level: "high",
            action: "Increase ventilation or cooling",
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
            action: "Improve ventilation",
            reason:
                `Relative humidity has reached ` +
                `${twinState.humidity.toFixed(0)}%.`
        });
    }

    if (recommendations.length === 0) {
        recommendations.push({
            priority: "Normal",
            level: "normal",
            action: "No immediate intervention required",
            reason:
                "Current comfort, lighting and energy conditions " +
                "are within the configured operating ranges."
        });
    }

    renderRecommendations(recommendations.slice(0, 3));
}

function renderRecommendations(recommendations) {
    const container =
        document.getElementById("recommendations");

    container.innerHTML = "";

    recommendations.forEach(item => {
        const card = document.createElement("div");

        card.className =
            `recommendation ${item.level}`;

        card.innerHTML = `
            <strong>${item.action}</strong>
            <p>
                ${item.priority}: ${item.reason}
            </p>
        `;

        container.appendChild(card);
    });
}

// ==========================================================
// 9. DEMONSTRATION SCENARIOS
// ==========================================================

function setupButtons() {
    document
        .getElementById("normalButton")
        .addEventListener("click", () => {
            simulationMode = "normal";
            twinState = { ...defaultState };

            updateDisplay();
            evaluateRecommendations();
        });

    document
        .getElementById("lowLightButton")
        .addEventListener("click", () => {
            simulationMode = "lowLight";

            twinState = {
                temperature: 23.6,
                humidity: 48,
                occupancy: 2,
                light: 175,
                deviceOn: true,
                power: 66
            };

            updateDisplay();
            evaluateRecommendations();
        });

    document
        .getElementById("emptyRoomButton")
        .addEventListener("click", () => {
            simulationMode = "emptyRoom";

            twinState = {
                temperature: 22.8,
                humidity: 45,
                occupancy: 0,
                light: 110,
                deviceOn: true,
                power: 69
            };

            updateDisplay();
            evaluateRecommendations();
        });

    document
        .getElementById("crowdedRoomButton")
        .addEventListener("click", () => {
            simulationMode = "crowdedRoom";

            twinState = {
                temperature: 26.8,
                humidity: 63,
                occupancy: 4,
                light: 280,
                deviceOn: true,
                power: 72
            };

            updateDisplay();
            evaluateRecommendations();
        });

    document
        .getElementById("resetCameraButton")
        .addEventListener("click", resetCamera);
}

// ==========================================================
// 10. PROJECT 3D MARKERS INTO SCREEN SPACE
// ==========================================================

function updateMarkerPositions() {
    if (!scene || !camera) return;

    const viewport =
        camera.viewport.toGlobal(
            engine.getRenderWidth(),
            engine.getRenderHeight()
        );

    Object.entries(markerPositions).forEach(
        ([name, worldPosition]) => {
            const screenPosition =
                BABYLON.Vector3.Project(
                    worldPosition,
                    BABYLON.Matrix.Identity(),
                    scene.getTransformMatrix(),
                    viewport
                );

            const marker = markerElements[name];

            const isBehindCamera =
                screenPosition.z < 0 ||
                screenPosition.z > 1;

            if (isBehindCamera) {
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

// ==========================================================
// 11. RUN APPLICATION
// ==========================================================

createScene().then(createdScene => {
    scene = createdScene;

    engine.runRenderLoop(() => {
        scene.render();
        updateMarkerPositions();
    });
});

window.addEventListener("resize", () => {
    engine.resize();
});
