# smart-study-room-digital-twin

A browser-based digital-twin prototype that combines a photorealistic Gaussian-splat reconstruction of a real study room with simulated environmental monitoring and rule-based decision support.

## Live Prototype

**Application:**
https://afrinjubaida.github.io/smart-study-room-digital-twin/

## Project Overview

This project demonstrates how an indoor physical space can be represented as an interactive digital twin and enhanced with contextual environmental information.

The prototype contains:

* A photorealistic 3D reconstruction of a real study room
* Browser-based navigation through the reconstructed space
* Five spatially anchored environmental and operational indicators
* Realistically simulated values with bounded random variation
* A rule-based decision layer
* Demonstration scenarios for testing recommendations

The objective is to move beyond a static 3D room model by connecting spatial visualization with live-style data and actionable operational guidance.

## Main Features

### 1. Photorealistic room reconstruction

The room was captured using Scaniverse and represented using Gaussian Splatting. The exported point-based reconstruction was cleaned and compressed using SuperSplat.

The resulting '.ply' model is rendered directly in the browser with Babylon.js.

### 2. Interactive navigation

Users can:

* Rotate around the reconstructed room
* Zoom into the room
* Pan the camera
* Reset the camera to the default viewpoint

The initial camera position is configured inside the room reconstruction because an indoor Gaussian-splat model may appear as a blurred outer shell when viewed externally.

### 3. Five spatial data overlays

The prototype displays five indicators at meaningful physical locations:

| Indicator    | Example physical location    | Unit   |
| ------------ | ---------------------------- | ------ |
| Temperature  | Desk or occupied work area   | °C     |
| Humidity     | Window or external-wall area | %      |
| Occupancy    | Door or entrance             | People |
| Illumination | Desk lamp or work surface    | Lux    |
| Device power | Computer or monitor          | Watts  |

The overlay cards are HTML interface elements projected from 3D world coordinates. They remain attached to their corresponding room locations as the camera moves.

### 4. Simulated live data

The prototype currently uses realistically simulated data rather than physical IoT sensors.

Values are updated every two seconds and include bounded random noise to imitate changing sensor readings.

The simulation includes:

* Temperature variation
* Relative humidity variation
* Occupancy status
* Lighting-level variation
* Computer power consumption

**Data disclosure:** The displayed values are simulated and are not calibrated physical sensor measurements.

### 5. Decision-support layer

A transparent rule-based decision system evaluates the simulated room conditions.

Example rules include:

* If the room is occupied and illumination is below 300 lux, recommend increasing desk lighting.
* If the room is empty while equipment is consuming power, recommend turning off unused equipment.
* If the room is occupied and temperature exceeds 25.5 °C, recommend increasing cooling or ventilation.
* If relative humidity exceeds 60%, recommend improving ventilation.

Recommendations include a priority level, suggested action, and explanation.

## Demonstration Scenarios

The interface includes four scenarios.

### Normal Conditions

Represents acceptable temperature, humidity, lighting, occupancy, and power conditions.

Expected result:

* No immediate intervention required

### Low Light

Represents an occupied room with inadequate desk illumination.

Expected result:

* Increase desk lighting

### Empty Room

Represents an unoccupied room in which computer equipment remains active.

Expected result:

* Turn off unused computer equipment

### Crowded Room

Represents high occupancy, elevated temperature, high humidity, and potentially inadequate illumination.

Expected results include:

* Increase ventilation or cooling
* Improve room ventilation
* Increase desk lighting

This scenario demonstrates that the decision layer can produce multiple simultaneous recommendations.

## Technology Stack

* **Scaniverse** — room capture and Gaussian-splat generation
* **SuperSplat** — cleaning and compression of the Gaussian-splat model
* **Babylon.js** — browser-based 3D rendering and camera interaction
* **JavaScript** — simulation, recommendation rules, and interaction
* **HTML5** — interface structure
* **CSS3** — visual styling and responsive layout
* **GitHub Pages** — public deployment

## Repository Structure

smart-study-room-digital-twin/
│
├── assets/
│   └── room.compressed.ply
│
├── index.html
├── style.css
├── app.js
├── README.md
└── docs/
    ├── technical-write-up


## Running the Project

The public deployment can be opened directly through GitHub Pages.

To run a local copy, the project must be served through a local web server because browsers may block direct loading of the '.ply' asset from a 'file://' address.

Example using Python:

bash
python -m http.server 8000


Then open:

text

http://localhost:8000


## Marker-Placement Mode

During development, marker-editing mode can be enabled in 'app.js':

'''javascript
const ENABLE_MARKER_EDITING = true;
'''

In editing mode:

1. Click a coloured marker sphere.
2. Use the X, Y, and Z gizmo arrows to move it.
3. Place it at the relevant physical location.
4. Click **Print Marker Coordinates**.
5. Copy the coordinates from the browser console.
6. Replace the original 'markerPositions' values.

Before presentation or deployment, use:

'''javascript
const ENABLE_MARKER_EDITING = false;
'''

The marker spheres and gizmos are then hidden while the data overlays remain at their saved positions.

## System Architecture

Room capture
     │
Gaussian-splat reconstruction
     │
SuperSplat cleaning and compression
     │
Babylon.js browser renderer
     │
     ├── Spatial overlay projection
     │
     ├── Simulated environmental data
     │
     └── Rule-based decision engine
             │
       Actionable recommendations


## Potential B2B Application

The prototype could be developed into a building-monitoring service for:

* Universities
* Libraries
* Offices
* Co-working facilities
* Hotels
* Healthcare waiting rooms
* Property-management companies

A service provider could create digital twins of client rooms or buildings and connect them to real IoT sensors, smart meters, occupancy systems, and building-management platforms.

Facility managers could use the service to:

* Inspect rooms remotely
* Identify under-lit or uncomfortable areas
* Reduce unnecessary equipment use
* Prioritize ventilation or HVAC interventions
* Support preventive maintenance
* Compare operational conditions across multiple rooms or sites

A possible commercial model would be a subscription dashboard priced per room, building, or monitored asset.

## Current Limitations

* Environmental values are simulated rather than collected from physical sensors.
* The prototype represents one room.
* Recommendations are generated using fixed thresholds.
* The Gaussian-splat model may require a capable browser and graphics device.
* The mobile interface provides less viewing space than the desktop interface.
* There is no database or historical data storage.
* There is no user authentication or access control.
* The system does not currently control real equipment.

## Future Development

Possible future improvements include:

* Connecting real temperature, humidity, light, occupancy, and power sensors
* Storing time-series data in a cloud database
* Displaying historical charts
* Adding alerts and notifications
* Integrating HVAC and lighting controls
* Supporting multiple rooms and buildings
* Adding predictive models for comfort and energy consumption
* Detecting sensor anomalies
* Adding role-based access control
* Improving mobile responsiveness
* Comparing rooms across a building portfolio


## Author

**Afrin Jubaida**

M.Sc. in Computer Science
Brock University, Canada


