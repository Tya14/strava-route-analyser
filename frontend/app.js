import { dashboardData, historyData } from "/frontend/data.js";
import { routesData } from "/frontend/routes_data.js";

let hrChartInstance = null;

document.addEventListener("DOMContentLoaded", () => {

  /* ================= NAV ================= */
  document.querySelectorAll(".nav-icon").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-icon").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const page = btn.dataset.page;
      document.querySelectorAll(".page").forEach(p => p.classList.remove("visible"));
      document.getElementById(page)?.classList.add("visible");
    });
  });

  /* ================= DASHBOARD ================= */
  document.getElementById("athleteName").textContent = dashboardData.athlete_name;
  document.getElementById("avatar").textContent = dashboardData.athlete_name[0];
  document.getElementById("riskScore").textContent = dashboardData.risk_score;
  document.getElementById("riskLevel").textContent = dashboardData.risk_level;
  document.getElementById("riskDesc").textContent = dashboardData.risk_desc;
  document.getElementById("riskBar").style.width = dashboardData.risk_score + "%";

  const alertsDiv = document.getElementById("alerts");
  dashboardData.alerts.forEach(a => {
    const el = document.createElement("div");
    el.className = "alert-item";
    el.innerHTML = `
      <div class="alert-dot alert-dot--teal"></div>
      <div class="alert-text">${a}</div>
    `;
    alertsDiv.appendChild(el);
  });

  new Chart(document.getElementById("loadChart"), {
    type: "line",
    data: {
      labels: dashboardData.chart.labels,
      datasets: [
        { data: dashboardData.chart.acute, borderColor: "#f03e3e", tension: 0.4, fill: false },
        { data: dashboardData.chart.chronic, borderColor: "#1dd3b0", tension: 0.4, fill: false }
      ]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });

  /* ================= HISTORY ================= */
  const table = document.getElementById("historyTable");
  table.innerHTML = "";
  let selectedRow = null;

  historyData.slice(0, 10).forEach(a => {

    let avg_hr = a.avg_hr;
    if (!avg_hr && a.chart?.hr?.length) {
      const valid = a.chart.hr.filter(v => v != null);
      avg_hr = valid.length
        ? Math.round(valid.reduce((x, y) => x + y, 0) / valid.length)
        : 0;
    }

    const typeClass =
      a.type === "Run"  ? "type-badge--run"  :
      a.type === "Ride" ? "type-badge--ride" : "type-badge--other";

    let hrClass = "good";
    if (avg_hr > 170) hrClass = "bad";
    else if (avg_hr > 155) hrClass = "warn";

    const riskClass =
      a.risk === "Low"      ? "risk-pill--low" :
      a.risk === "Moderate" ? "risk-pill--mod" : "risk-pill--high";

    const row = document.createElement("tr");
    row.className = "history-row";
    row.innerHTML = `
      <td class="mono">${a.date}</td>
      <td>${a.name}</td>
      <td><span class="type-badge ${typeClass}">${a.type}</span></td>
      <td class="mono">${a.distance.toFixed(1)} km</td>
      <td class="mono ${hrClass}">${avg_hr || "-"} bpm</td>
      <td class="mono">${a.tss}</td>
      <td><span class="risk-pill ${riskClass}">${a.risk}</span></td>
    `;

    row.onclick = () => {
      if (selectedRow) selectedRow.classList.remove("selected");
      row.classList.add("selected");
      selectedRow = row;
      openActivity(a);
    };

    table.appendChild(row);
  });

  /* ================= ROUTES ================= */
  let routeMap = null;
  let routePolyline = null;
  let drawing = false;
  let drawnPoints = [];
  let drawnLine = null;

  let matchPolylines = []; // ✅ NEW

  function haversine(p1, p2) {
    const R = 6371000;
    const toRad = x => x * Math.PI / 180;

    const dLat = toRad(p2[0] - p1[0]);
    const dLon = toRad(p2[1] - p1[1]);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(p1[0])) *
      Math.cos(toRad(p2[0])) *
      Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function routeMatchesSegment(routeLatLngs, segment, threshold = 40) {
    let matches = 0;

    for (let p of segment) {
      for (let r of routeLatLngs) {
        if (haversine(p, r) < threshold) {
          matches++;
          break;
        }
      }
    }

    return matches / segment.length > 0.6;
  }

  function renderMatchCard(matches) {
    const card = document.getElementById("matchCard");
    const list = document.getElementById("matchList");
  
    list.innerHTML = "";
  
    if (matches.length === 0) {
      card.classList.add("hidden");
      return;
    }
  
    card.classList.remove("hidden");
  
    matches.forEach(route => {
      const row = document.createElement("div");
      row.className = "match-row";
  
      row.innerHTML = `
        <div class="match-date">${route.date || "-"}</div>
        <div class="match-name">${route.name || "Activity"}</div>
        <div class="match-distance">${route.distance_km || "-"} km</div>
      `;
  
      // click = zoom to that route
      row.onclick = () => {
        if (!routeMap) return;
      
        // 🔥 remove ALL current match lines
        matchPolylines.forEach(l => routeMap.removeLayer(l));
        matchPolylines = [];
      
        // 🔥 draw ONLY selected route
        const line = L.polyline(route.latlngs, {
          color: "#f03e3e",
          weight: 6
        }).addTo(routeMap);
      
        // store it so it can be cleared later if needed
        matchPolylines.push(line);
      
        // zoom to it
        routeMap.fitBounds(line.getBounds(), { padding: [40, 40] });
      };
  
      list.appendChild(row);
    });
  }

  function highlightMatches(matches) {
    if (!routeMap) return;
  
    // clear previous
    matchPolylines.forEach(l => routeMap.removeLayer(l));
    matchPolylines = [];
  
    // color palette (nice + readable)
    const colors = [
      "#f03e3e", "#1dd3b0", "#4dabf7", "#ffd43b",
      "#845ef7", "#ff922b", "#20c997", "#e64980"
    ];
  
    matches.forEach((route, i) => {
      const color = colors[i % colors.length]; // cycle if many routes
  
      const line = L.polyline(route.latlngs, {
        color: color,
        weight: 5,
        opacity: 0.9
      }).addTo(routeMap);
  
      matchPolylines.push(line);
    });
  
    // auto-fit map
    if (matches.length > 0) {
      const group = L.featureGroup(
        matches.map(r => L.polyline(r.latlngs))
      );
      routeMap.fitBounds(group.getBounds(), { padding: [30, 30] });
    }
  }

  const routesList = document.getElementById("routesList");

  routesData.forEach((route, idx) => {
    const row = document.createElement("div");
    row.className = "route-row";

    row.innerHTML = `
      <div class="route-rank">#${idx + 1}</div>
      <div class="route-info">
        <div class="route-name">Route ${route.id}</div>
        <div class="route-meta">
          <span class="mono">${route.distance_km} km</span>
        </div>
      </div>
      <div class="route-right">
        <span class="freq-badge">${route.count}×</span>
      </div>
    `;

    row.onclick = () => openRouteMap(route);
    routesList.appendChild(row);
  });

  function openRouteMap(route) {
    const mapPanel = document.getElementById("routeMapPanel");
    mapPanel.classList.add("map-panel--open");

    if (!routeMap) {
      routeMap = L.map("leafletMap");

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png")
        .addTo(routeMap);

      routeMap.on("click", (e) => {
        if (!drawing) return;

        drawnPoints.push([e.latlng.lat, e.latlng.lng]);

        if (drawnLine) routeMap.removeLayer(drawnLine);

        drawnLine = L.polyline(drawnPoints, {
          color: "#1dd3b0",
          weight: 4,
          dashArray: "6,6"
        }).addTo(routeMap);
      });
    }

    if (routePolyline) routeMap.removeLayer(routePolyline);

    routePolyline = L.polyline(route.latlngs, {
      color: "#f03e3e",
      weight: 4
    }).addTo(routeMap);

    routeMap.fitBounds(routePolyline.getBounds());
  }

  document.getElementById("drawRouteBtn").onclick = () => {
    drawing = true;
    drawnPoints = [];

    if (drawnLine) {
      routeMap.removeLayer(drawnLine);
      drawnLine = null;
    }
  };

  document.getElementById("findRouteBtn").onclick = () => {
    if (!routeMap) return;
  
    if (drawnPoints.length < 2) {
      alert("Draw a segment first");
      return;
    }
  
    const matches = routesData.filter(r =>
      routeMatchesSegment(r.latlngs, drawnPoints)
    );
  
    if (routePolyline) routeMap.removeLayer(routePolyline);
  
    highlightMatches(matches);
  
    // ✅ ADD THIS LINE
    renderMatchCard(matches);
  };

  document.getElementById("clearDrawbtn").onclick = () => {
    drawnPoints = [];
  
    if (drawnLine) {
      routeMap.removeLayer(drawnLine);
      drawnLine = null;
    }
  
    matchPolylines.forEach(l => routeMap.removeLayer(l));
    matchPolylines = [];
  
    // ✅ hide card
    document.getElementById("matchCard").classList.add("hidden");
  };

  document.getElementById("closeMapBtn").onclick = () => {
    document.getElementById("routeMapPanel").classList.remove("map-panel--open");
  };

});


/* ================= ACTIVITY ================= */

function openActivity(activity) {

  document.querySelectorAll(".page").forEach(p => p.classList.remove("visible"));
  document.getElementById("activity").classList.add("visible");

  document.querySelectorAll(".nav-icon").forEach(b => b.classList.remove("active"));
  document.querySelector('[data-page="activity"]').classList.add("active");

  document.querySelector(".activity-name").textContent = activity.name;

  if (hrChartInstance) hrChartInstance.destroy();

  const rawHR = activity.chart?.hr || [];
  const rawPace = activity.chart?.pace || [];
  const labels = activity.chart?.labels || [];

  function movingAverage(arr, windowSize = 20) {
    const result = [];
    for (let i = 0; i < arr.length; i++) {
      let sum = 0, count = 0;
      for (let j = i - windowSize + 1; j <= i; j++) {
        if (j >= 0 && arr[j] != null) {
          sum += arr[j];
          count++;
        }
      }
      result.push(count ? sum / count : null);
    }
    return result;
  }

  const smoothHR = movingAverage(rawHR, 20);
  const smoothPace = movingAverage(rawPace, 20);

  hrChartInstance = new Chart(document.getElementById("hrChart"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Heart Rate",
          data: smoothHR,
          borderColor: "#f03e3e",
          tension: 0.4,
          pointRadius: 0,
          yAxisID: "yHR"
        },
        {
          label: "Pace",
          data: smoothPace,
          borderColor: "#1dd3b0",
          borderDash: [5, 5],
          tension: 0.4,
          pointRadius: 0,
          yAxisID: "yPace"
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#6b7280" } }
      },
      scales: {
        x: {
          ticks: { color: "#6b7280" },
          grid: { color: "rgba(255,255,255,0.05)" }
        },
        yHR: {
          type: "linear",
          position: "left",
          ticks: { color: "#f03e3e" },
          title: { display: true, text: "Heart Rate (bpm)", color: "#f03e3e" }
        },
        yPace: {
          type: "linear",
          position: "right",
          reverse: true,
          ticks: { color: "#1dd3b0" },
          grid: { drawOnChartArea: false },
          title: { display: true, text: "Pace (min/km)", color: "#1dd3b0" }
        }
      }
    }
  });
}