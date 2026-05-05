import { clusterRoutes } from "/frontend/route_clustering.js";

let hrChartInstance = null;
let activityMap = null;
let currentPolyline = null;

document.addEventListener("DOMContentLoaded", () => {

  initNav();

  loadDashboard();
  loadActivities();
  loadRoutes();
});


/* ================= NAV ================= */

function initNav() {
  document.querySelectorAll(".nav-icon").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-icon").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const page = btn.dataset.page;
      document.querySelectorAll(".page").forEach(p => p.classList.remove("visible"));
      document.getElementById(page)?.classList.add("visible");
    });
  });
}


/* ================= DASHBOARD ================= */

async function loadDashboard() {
  try {
    const res = await fetch("/dashboard");
    if (!res.ok) throw new Error("Dashboard fetch failed");

    const data = await res.json();

    document.getElementById("athleteName").textContent = data.athlete_name || "You";
    document.getElementById("avatar").textContent = (data.athlete_name || "U")[0];
    document.getElementById("riskScore").textContent = data.risk_score ?? "-";
    document.getElementById("riskLevel").textContent = data.risk_level || "-";
    document.getElementById("riskDesc").textContent = data.risk_desc || "";
    document.getElementById("riskBar").style.width = (data.risk_score || 0) + "%";

    renderLoadChart(data);

  } catch (err) {
    console.error("Dashboard error:", err);
  }
}


/* ================= DASHBOARD CHART ================= */

function renderLoadChart(data) {
  const el = document.getElementById("loadChart");
  if (!el) return;

  if (window.loadChartInstance) {
    window.loadChartInstance.destroy();
  }

  window.loadChartInstance = new Chart(el, {
    type: "bar",
    data: {
      labels: ["Acute", "Chronic"],
      datasets: [{
        data: [
          data.acute_load || 0,
          data.chronic_load || 0
        ],
        backgroundColor: ["#f03e3e", "#1dd3b0"]
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}


/* ================= ACTIVITIES ================= */

async function loadActivities() {
  try {
    const res = await fetch("/activities");
    if (!res.ok) throw new Error("Failed activities");

    const activities = await res.json();

    const table = document.getElementById("historyTable");
    if (!table) return;

    table.innerHTML = "";

    let selectedRow = null;

    activities.slice(0, 10).forEach(a => {

      const avg_hr = a.avg_hr || 0;

      const typeClass =
        a.type === "Run"  ? "type-badge--run"  :
        a.type === "Ride" ? "type-badge--ride" : "type-badge--other";

      let hrClass = "good";
      if (avg_hr > 170) hrClass = "bad";
      else if (avg_hr > 155) hrClass = "warn";

      const row = document.createElement("tr");
      row.className = "history-row";

      row.innerHTML = `
        <td class="mono">${a.date || "-"}</td>
        <td>${a.name || "-"}</td>
        <td><span class="type-badge ${typeClass}">${a.type || "-"}</span></td>
        <td class="mono">${a.distance?.toFixed(1) || "-"} km</td>
        <td class="mono ${hrClass}">${avg_hr || "-"}</td>
        <td class="mono">-</td>
        <td><span class="risk-pill risk-pill--low">-</span></td>
      `;

      row.onclick = () => {
        if (selectedRow) selectedRow.classList.remove("selected");
        row.classList.add("selected");
        selectedRow = row;
        openActivity(a);
      };

      table.appendChild(row);
    });

  } catch (err) {
    console.error("Activities error:", err);
  }
}


/* ================= ACTIVITY DETAIL ================= */

function openActivity(activity) {
  if (!activity) return;

  document.querySelectorAll(".page").forEach(p => p.classList.remove("visible"));
  document.getElementById("activity")?.classList.add("visible");

  document.querySelectorAll(".nav-icon").forEach(b => b.classList.remove("active"));
  document.querySelector('[data-page="activity"]')?.classList.add("active");

  const title = document.querySelector(".activity-name");
  if (title) title.textContent = activity.name || "Activity";

  if (hrChartInstance) {
    hrChartInstance.destroy();
    hrChartInstance = null;
  }

  /* ===== STREAMS ===== */
  fetch(`/activity/${activity.id}/streams`)
    .then(res => res.json())
    .then(streams => {

      const rawHR = streams.heartrate || [];
      const rawPace = streams.pace || [];
      const labels = streams.time || [];

      const smooth = (arr, w = 20) =>
        arr.map((_, i) => {
          let sum = 0, count = 0;
          for (let j = i - w + 1; j <= i; j++) {
            if (j >= 0 && arr[j] != null) {
              sum += arr[j];
              count++;
            }
          }
          return count ? sum / count : null;
        });

      hrChartInstance = new Chart(document.getElementById("hrChart"), {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "HR",
              data: smooth(rawHR),
              borderColor: "#f03e3e",
              tension: 0.4,
              pointRadius: 0
            },
            {
              label: "Pace",
              data: smooth(rawPace),
              borderColor: "#1dd3b0",
              borderDash: [5,5],
              tension: 0.4,
              pointRadius: 0
            }
          ]
        },
        options: {
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false }
        }
      });

    })
    .catch(err => console.error("Streams error:", err));

  /* ===== MAP ===== */
  fetch(`/activity/${activity.id}`)
    .then(res => res.json())
    .then(data => {
      if (!data.polyline) return;

      const coords = decodePolyline(data.polyline);

      if (!activityMap) {
        activityMap = L.map("leafletMap");
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png")
          .addTo(activityMap);
      }

      if (currentPolyline) {
        activityMap.removeLayer(currentPolyline);
      }

      currentPolyline = L.polyline(coords, {
        color: "#f03e3e",
        weight: 4
      }).addTo(activityMap);

      activityMap.fitBounds(currentPolyline.getBounds());
    })
    .catch(err => console.error("Map error:", err));
}


/* ================= ROUTES ================= */

async function loadRoutes() {
  try {
    const res = await fetch("/routes");
    if (!res.ok) throw new Error("Routes failed");

    const routes = await res.json();

    const processed = routes
      .map(r => ({
        ...r,
        latlngs: r.polyline ? decodePolyline(r.polyline) : []
      }))
      .filter(r => r.latlngs.length);

    const clusters = clusterRoutes(processed);

    renderClusters(clusters);

  } catch (err) {
    console.error("Routes error:", err);
  }
}


function renderClusters(clusters) {
  const routesList = document.getElementById("routesList");
  if (!routesList) return;

  routesList.innerHTML = "";

  clusters.slice(0, 10).forEach((cluster, idx) => {
    const rep = cluster.representative;

    const row = document.createElement("div");
    row.className = "route-row";

    row.innerHTML = `
      <div class="route-rank">#${idx + 1}</div>
      <div class="route-info">
        <div class="route-name">${rep.name || "Route"}</div>
        <div class="route-meta">
          <span class="mono">${rep.distance_km?.toFixed(1) || "-"} km</span>
        </div>
      </div>
      <div class="route-right">
        <span class="freq-badge">${cluster.count}×</span>
      </div>
    `;

    row.onclick = () => openRouteCluster(cluster.routes);

    routesList.appendChild(row);
  });
}


function openRouteCluster(routes) {
  if (!routes || !routes.length) return;

  const panel = document.getElementById("routeMapPanel");
  panel?.classList.add("map-panel--open");

  if (!window.routeMap) {
    window.routeMap = L.map("leafletMap");
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png")
      .addTo(window.routeMap);
  }

  if (window.routeLines) {
    window.routeLines.forEach(l => window.routeMap.removeLayer(l));
  }

  window.routeLines = [];

  routes.forEach(r => {
    const line = L.polyline(r.latlngs, {
      color: "#1dd3b0",
      weight: 3,
      opacity: 0.6
    }).addTo(window.routeMap);

    window.routeLines.push(line);
  });

  const group = L.featureGroup(window.routeLines);
  window.routeMap.fitBounds(group.getBounds());
}


/* ================= POLYLINE ================= */

function decodePolyline(str) {
  let index = 0, lat = 0, lng = 0, coords = [];

  while (index < str.length) {
    let b, shift = 0, result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    coords.push([lat / 1e5, lng / 1e5]);
  }

  return coords;
}