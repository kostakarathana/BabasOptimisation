const defaultScenario = Object.freeze({
    stopMinutes: 18,
    maxCombos: 6,
    wasteTypes: [
        { id: "T1", name: "Type 1", description: "High volume, average 3 bins per stop", totalBins: 400, binsPerStop: 3 },
        { id: "T2", name: "Type 2", description: "Medium volume, average 2 bins per stop", totalBins: 160, binsPerStop: 2 },
        { id: "T3", name: "Type 3", description: "Low volume, single bin per stop", totalBins: 40, binsPerStop: 1 }
    ],
    fleets: [
        {
            id: "A",
            name: "Fleet A",
            note: "30 pantech trucks, single waste stream per day",
            singleWasteType: true,
            trucks: [
                { id: "A-1", name: "Pantech", count: 30, capacity: 80 }
            ]
        },
        {
            id: "B",
            name: "Fleet B",
            note: "30 pantech trucks, flexible waste stream",
            singleWasteType: false,
            trucks: [
                { id: "B-1", name: "Pantech", count: 30, capacity: 80 }
            ]
        },
        {
            id: "C",
            name: "Fleet C",
            note: "15 pantech (40 bin) + 15 compactor (120 bin), single waste stream",
            singleWasteType: true,
            trucks: [
                { id: "C-1", name: "Pantech", count: 15, capacity: 40 },
                { id: "C-2", name: "Compactor", count: 15, capacity: 120 }
            ]
        }
    ]
});

let runTimeoutId;

document.addEventListener("DOMContentLoaded", () => {
    renderInputs(getDefaultScenario());
    document.getElementById("run-btn").addEventListener("click", runOptimisation);
    document.getElementById("reset-btn").addEventListener("click", () => {
        renderInputs(getDefaultScenario());
        runOptimisation();
    });
    document.querySelector("main").addEventListener("input", scheduleRun);
    runOptimisation();
});

function getDefaultScenario() {
    return JSON.parse(JSON.stringify(defaultScenario));
}

function renderInputs(scenario) {
    const wasteContainer = document.getElementById("waste-inputs");
    const fleetContainer = document.getElementById("fleet-inputs");
    wasteContainer.innerHTML = "";
    fleetContainer.innerHTML = "";

    scenario.wasteTypes.forEach((waste) => {
        const block = document.createElement("div");
        block.className = "sub-card";
        block.dataset.wasteId = waste.id;
        block.innerHTML = `
            <div class="waste-header">
                <span class="badge">${waste.id}</span>
                <input class="title-input" type="text" data-field="name" value="${escapeHtml(waste.name)}" aria-label="${waste.id} name">
            </div>
            <p class="description">${escapeHtml(waste.description)}</p>
            <div class="field-row">
                <label class="field">
                    <span>Total bins</span>
                    <input type="number" min="0" step="1" data-field="totalBins" value="${waste.totalBins}">
                </label>
                <label class="field">
                    <span>Bins per stop</span>
                    <input type="number" min="0.1" step="0.1" data-field="binsPerStop" value="${waste.binsPerStop}">
                </label>
                <label class="field">
                    <span>Stops (computed)</span>
                    <input type="text" data-field="stops" value="${formatNumber(Math.ceil(waste.totalBins / waste.binsPerStop || 0))}" readonly>
                </label>
            </div>
        `;
        wasteContainer.appendChild(block);
    });

    scenario.fleets.forEach((fleet) => {
        const block = document.createElement("div");
        block.className = "sub-card";
        block.dataset.fleetId = fleet.id;
        block.innerHTML = `
            <div class="fleet-header">
                <div class="fleet-title">
                    <span class="badge">${fleet.id}</span>
                    <input class="title-input" type="text" data-field="name" value="${escapeHtml(fleet.name)}" aria-label="${fleet.id} name">
                </div>
                <p class="description">${escapeHtml(fleet.note)}</p>
            </div>
            <div class="truck-list" data-role="truck-list"></div>
        `;
        const truckList = block.querySelector("[data-role='truck-list']");
        fleet.trucks.forEach((truck, index) => {
            const row = document.createElement("div");
            row.className = "field-row truck-row";
            row.dataset.truckId = truck.id || `${fleet.id}-${index}`;
            row.innerHTML = `
                <label class="field">
                    <span>Truck type</span>
                    <input type="text" data-field="truck-name" value="${escapeHtml(truck.name)}">
                </label>
                <label class="field">
                    <span>Count</span>
                    <input type="number" min="0" step="1" data-field="truck-count" value="${truck.count}">
                </label>
                <label class="field">
                    <span>Bin capacity</span>
                    <input type="number" min="0" step="1" data-field="truck-capacity" value="${truck.capacity}">
                </label>
            `;
            truckList.appendChild(row);
        });
        fleetContainer.appendChild(block);
    });

    document.getElementById("stop-minutes").value = scenario.stopMinutes;
    document.getElementById("max-combos").value = scenario.maxCombos;
}

function scheduleRun() {
    window.clearTimeout(runTimeoutId);
    runTimeoutId = window.setTimeout(runOptimisation, 200);
}

function runOptimisation() {
    const scenario = collectScenario();
    const matrix = buildPerformanceMatrix(scenario);
    const bestPerWaste = computeBestPerWaste(scenario, matrix);
    const combos = computeAssignments(scenario, matrix);
    updateSummary(scenario, bestPerWaste, combos);
    renderHeatmap(scenario, matrix);
    renderAssignmentChart(combos.best, scenario);
    renderDetails(scenario, matrix, combos);
}

function collectScenario() {
    const stopMinutesInput = document.getElementById("stop-minutes");
    const maxCombosInput = document.getElementById("max-combos");
    const wasteNodes = document.querySelectorAll("[data-waste-id]");
    const fleetNodes = document.querySelectorAll("[data-fleet-id]");

    const scenario = {
        stopMinutes: toNumber(stopMinutesInput.value, defaultScenario.stopMinutes, 1),
        maxCombos: toNumber(maxCombosInput.value, defaultScenario.maxCombos, 1),
        wasteTypes: [],
        fleets: []
    };

    wasteNodes.forEach((node) => {
        const id = node.dataset.wasteId;
        const name = node.querySelector("[data-field='name']").value.trim() || id;
        const totalBins = toNumber(node.querySelector("[data-field='totalBins']").value, 0, 0);
        const binsPerStop = toNumber(node.querySelector("[data-field='binsPerStop']").value, 1, 0.1);
        const descriptionNode = node.querySelector(".description");
        scenario.wasteTypes.push({
            id,
            name,
            description: descriptionNode ? descriptionNode.textContent.trim() : "",
            totalBins,
            binsPerStop
        });
    });

    fleetNodes.forEach((node) => {
        const id = node.dataset.fleetId;
        const name = node.querySelector("[data-field='name']").value.trim() || id;
        const description = node.querySelector(".description").textContent.trim();
        const trucks = [];
        node.querySelectorAll(".truck-row").forEach((row) => {
            const truckName = row.querySelector("[data-field='truck-name']").value.trim() || "Truck";
            const count = toNumber(row.querySelector("[data-field='truck-count']").value, 0, 0);
            const capacity = toNumber(row.querySelector("[data-field='truck-capacity']").value, 0, 0);
            trucks.push({
                id: row.dataset.truckId,
                name: truckName,
                count,
                capacity
            });
        });
        const defaultFleet = defaultScenario.fleets.find((fleet) => fleet.id === id);
        scenario.fleets.push({
            id,
            name,
            note: description,
            singleWasteType: defaultFleet ? defaultFleet.singleWasteType : false,
            trucks
        });
    });

    scenario.wasteTypes.forEach((waste, index) => {
        const stopsField = wasteNodes[index].querySelector("[data-field='stops']");
        const stops = waste.binsPerStop > 0 ? Math.ceil(waste.totalBins / waste.binsPerStop) : 0;
        stopsField.value = formatNumber(stops);
    });

    return scenario;
}

function buildPerformanceMatrix(scenario) {
    const matrix = {};
    scenario.fleets.forEach((fleet) => {
        matrix[fleet.id] = {};
        scenario.wasteTypes.forEach((waste) => {
            matrix[fleet.id][waste.id] = calcFleetPerformance(fleet, waste, scenario.stopMinutes);
        });
    });
    return matrix;
}

function calcFleetPerformance(fleet, waste, stopMinutes) {
    if (waste.totalBins <= 0 || waste.binsPerStop <= 0) {
        return {
            minutes: 0,
            stops: 0,
            waves: 0,
            waveCapacity: 0,
            perTruckStops: [],
            waveDetails: []
        };
    }

    const totalStops = Math.ceil(waste.totalBins / waste.binsPerStop);
    const perTruckStops = [];

    fleet.trucks.forEach((truck, index) => {
        const count = Math.max(0, Math.floor(truck.count || 0));
        const capacity = Math.max(0, truck.capacity || 0);
        if (count <= 0 || capacity <= 0) {
            return;
        }
        const stopsPerTrip = Math.floor(capacity / waste.binsPerStop);
        if (stopsPerTrip <= 0) {
            return;
        }
        for (let i = 0; i < count; i++) {
            perTruckStops.push({
                id: `${fleet.id}-${index}-${i}`,
                name: truck.name,
                stops: stopsPerTrip
            });
        }
    });

    if (!perTruckStops.length) {
        return {
            minutes: Number.POSITIVE_INFINITY,
            stops: totalStops,
            waves: 0,
            waveCapacity: 0,
            perTruckStops: [],
            waveDetails: []
        };
    }

    perTruckStops.sort((a, b) => b.stops - a.stops);
    const capacityPerWave = perTruckStops.reduce((sum, item) => sum + item.stops, 0);

    let stopsRemaining = totalStops;
    let totalMinutes = 0;
    let waves = 0;
    const waveDetails = [];

    while (stopsRemaining > 0) {
        const waveDemand = Math.min(stopsRemaining, capacityPerWave);
        const assignments = new Array(perTruckStops.length).fill(0);
        const remainingCapacity = perTruckStops.map((item) => item.stops);
        let outstanding = waveDemand;
        let safety = 0;

        while (outstanding > 0 && safety < 100000) {
            safety += 1;
            let progress = false;
            for (let i = 0; i < remainingCapacity.length && outstanding > 0; i++) {
                if (remainingCapacity[i] > 0) {
                    assignments[i] += 1;
                    remainingCapacity[i] -= 1;
                    outstanding -= 1;
                    progress = true;
                }
            }
            if (!progress) {
                break;
            }
        }

        const maxStops = Math.max(...assignments);
        totalMinutes += maxStops * stopMinutes;
        stopsRemaining -= waveDemand;
        waves += 1;
        waveDetails.push({
            assignments,
            maxStops,
            waveDemand
        });
    }

    const maxRouteMinutes = waveDetails.length
        ? Math.max(...waveDetails.map((wave) => wave.maxStops * stopMinutes))
        : 0;

    return {
        minutes: totalMinutes,
        stops: totalStops,
        waves,
        waveCapacity: capacityPerWave,
        perTruckStops,
        waveDetails,
        maxRouteMinutes
    };
}

function computeBestPerWaste(scenario, matrix) {
    return scenario.wasteTypes.map((waste) => {
        let best = null;
        scenario.fleets.forEach((fleet) => {
            const performance = matrix[fleet.id][waste.id];
            if (!performance || !isFinite(performance.minutes)) {
                return;
            }
            if (!best || performance.minutes < best.minutes) {
                best = {
                    fleet,
                    waste,
                    minutes: performance.minutes
                };
            }
        });
        return best;
    }).filter(Boolean);
}

function computeAssignments(scenario, matrix) {
    const wasteIds = scenario.wasteTypes.map((w) => w.id);
    const fleetIds = scenario.fleets.map((f) => f.id);
    const combos = [];

    permute(wasteIds).forEach((assignment) => {
        if (assignment.length !== fleetIds.length) {
            return;
        }
        const entries = assignment.map((wasteId, idx) => {
            const fleetId = fleetIds[idx];
            const performance = matrix[fleetId][wasteId];
            return {
                fleetId,
                wasteId,
                performance
            };
        });
        if (entries.some((entry) => !entry.performance || !isFinite(entry.performance.minutes))) {
            return;
        }
        const maxMinutes = Math.max(...entries.map((entry) => entry.performance.minutes));
        const sumMinutes = entries.reduce((sum, entry) => sum + entry.performance.minutes, 0);
        combos.push({ entries, maxMinutes, sumMinutes });
    });

    combos.sort((a, b) => {
        if (a.maxMinutes === b.maxMinutes) {
            return a.sumMinutes - b.sumMinutes;
        }
        return a.maxMinutes - b.maxMinutes;
    });

    return {
        best: combos[0] || null,
        all: combos
    };
}

function updateSummary(scenario, bestPerWaste, combos) {
    const summaryPanel = document.getElementById("summary-panel");
    summaryPanel.innerHTML = "";

    const highlightCards = [];

    if (combos.best) {
        const card = document.createElement("div");
        card.className = "summary-card";
        const longestHours = formatHours(combos.best.maxMinutes);
        const assignmentText = combos.best.entries
            .map((entry) => `${entry.fleetId} → ${entry.wasteId}`)
            .join(", ");
        card.innerHTML = `
            <h4>Fastest full coverage</h4>
            <p>${assignmentText}</p>
            <p><strong>Longest route:</strong> ${longestHours} hours</p>
        `;
        highlightCards.push(card);
    }

    if (bestPerWaste.length) {
        const card = document.createElement("div");
        card.className = "summary-card";
        const lines = bestPerWaste
            .map((item) => `${item.waste.id}: ${item.fleet.id} (${formatHours(item.minutes)} h)`)
            .join("<br>");
        card.innerHTML = `
            <h4>Best fleet per waste type</h4>
            <p>${lines}</p>
        `;
        highlightCards.push(card);
    }

    const card = document.createElement("div");
    card.className = "summary-card";
    card.innerHTML = `
        <h4>Scenario snapshot</h4>
        <p>Stop duration: <strong>${scenario.stopMinutes}</strong> min<br>
        Fleets: ${scenario.fleets.length} · Waste streams: ${scenario.wasteTypes.length}</p>
    `;
    highlightCards.push(card);

    highlightCards.forEach((cardNode) => summaryPanel.appendChild(cardNode));
}

function renderHeatmap(scenario, matrix) {
    const xLabels = scenario.wasteTypes.map((waste) => `${waste.id} · ${waste.name}`);
    const yLabels = scenario.fleets.map((fleet) => `${fleet.id} · ${fleet.name}`);
    const zValues = scenario.fleets.map((fleet) => {
        return scenario.wasteTypes.map((waste) => {
            const performance = matrix[fleet.id][waste.id];
            if (!performance || !isFinite(performance.minutes)) {
                return null;
            }
            return Number((performance.minutes / 60).toFixed(2));
        });
    });

    const textValues = scenario.fleets.map((fleet) => {
        return scenario.wasteTypes.map((waste) => {
            const performance = matrix[fleet.id][waste.id];
            if (!performance || !isFinite(performance.minutes)) {
                return "Not serviceable";
            }
            return `${formatHours(performance.minutes)} h\nStops: ${formatNumber(performance.stops)}`;
        });
    });

    const data = [
        {
            type: "heatmap",
            x: xLabels,
            y: yLabels,
            z: zValues,
            hoverinfo: "text",
            text: textValues,
            colorscale: "Blues",
            showscale: true,
            colorbar: {
                title: "Hours"
            }
        }
    ];

    const layout = {
        margin: { t: 30, r: 10, b: 60, l: 140 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        xaxis: { automargin: true },
        yaxis: { automargin: true }
    };

    Plotly.react("heatmap", data, layout, { responsive: true });
}

function renderAssignmentChart(bestCombo, scenario) {
    const container = document.getElementById("assignment-chart");
    if (!bestCombo) {
        container.innerHTML = "<p>No feasible assignment found for current inputs.</p>";
        return;
    }

    const labels = bestCombo.entries.map((entry) => {
        const fleet = scenario.fleets.find((f) => f.id === entry.fleetId);
        const waste = scenario.wasteTypes.find((w) => w.id === entry.wasteId);
        return `${fleet.id} → ${waste.id}`;
    });

    const values = bestCombo.entries.map((entry) => Number((entry.performance.minutes / 60).toFixed(2)));

    const texts = bestCombo.entries.map((entry) => {
        const waste = scenario.wasteTypes.find((w) => w.id === entry.wasteId);
        const stops = entry.performance.stops;
        return `${formatHours(entry.performance.minutes)} h\n${formatNumber(stops)} stops`;
    });

    const data = [
        {
            type: "bar",
            x: labels,
            y: values,
            text: texts,
            textposition: "auto",
            marker: {
                color: "#3866ff"
            },
            hovertemplate: "%{x}<br>%{text}<extra></extra>"
        }
    ];

    const layout = {
        margin: { t: 30, r: 10, b: 60, l: 60 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        yaxis: { title: "Hours", zeroline: true }
    };

    Plotly.react("assignment-chart", data, layout, { responsive: true });
}

function renderDetails(scenario, matrix, combos) {
    const container = document.getElementById("details");
    container.innerHTML = "";

    const perWasteTable = document.createElement("div");
    perWasteTable.className = "table-wrapper";
    perWasteTable.innerHTML = buildPerWasteTable(scenario, matrix);
    container.appendChild(perWasteTable);

    const comboTable = document.createElement("div");
    comboTable.className = "table-wrapper";
    comboTable.innerHTML = buildComboTable(scenario, combos);
    container.appendChild(comboTable);
}

function buildPerWasteTable(scenario, matrix) {
    const headers = ["Waste type", ...scenario.fleets.map((fleet) => fleet.id)];
    const rows = scenario.wasteTypes.map((waste) => {
        const cells = scenario.fleets.map((fleet) => {
            const performance = matrix[fleet.id][waste.id];
            if (!performance || !isFinite(performance.minutes)) {
                return "–";
            }
            return `${formatHours(performance.minutes)} h`;
        });
        return `<tr><td><strong>${waste.id}</strong> · ${escapeHtml(waste.name)}</td>${cells
            .map((cell) => `<td>${cell}</td>`)
            .join("")}</tr>`;
    });

    return `
        <table>
            <thead>
                <tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr>
            </thead>
            <tbody>
                ${rows.join("")}
            </tbody>
        </table>
    `;
}

function buildComboTable(scenario, combos) {
    const limit = Math.max(1, scenario.maxCombos || defaultScenario.maxCombos);
    const rows = combos.all.slice(0, limit).map((combo, index) => {
        const assignment = combo.entries
            .map((entry) => `${entry.fleetId} → ${entry.wasteId}`)
            .join(", ");
        return `
            <tr>
                <td>${index + 1}</td>
                <td>${assignment}</td>
                <td>${formatHours(combo.maxMinutes)} h</td>
                <td>${formatHours(combo.sumMinutes)} h</td>
            </tr>
        `;
    });

    if (!rows.length) {
        return `
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Assignment</th>
                        <th>Longest route</th>
                        <th>Total hours</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td colspan="4">No feasible assignments for current inputs.</td></tr>
                </tbody>
            </table>
        `;
    }

    return `
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Assignment</th>
                    <th>Longest route</th>
                    <th>Total hours</th>
                </tr>
            </thead>
            <tbody>
                ${rows.join("")}
            </tbody>
        </table>
    `;
}

function permute(items) {
    if (!items.length) {
        return [[]];
    }
    const result = [];
    const [first, ...rest] = items;
    const subPermutations = permute(rest);
    subPermutations.forEach((perm) => {
        for (let i = 0; i <= perm.length; i++) {
            const copy = perm.slice();
            copy.splice(i, 0, first);
            result.push(copy);
        }
    });
    return result;
}

function toNumber(value, fallback, minValue) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return fallback;
    }
    if (typeof minValue === "number" && num < minValue) {
        return minValue;
    }
    return num;
}

function formatNumber(value) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value || 0);
}

function formatHours(minutes) {
    if (!Number.isFinite(minutes)) {
        return "∞";
    }
    return (minutes / 60).toFixed(2);
}

function escapeHtml(value) {
    const stringValue = value == null ? "" : String(value);
    return stringValue
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
