export function clusterRoutes(routes, options = {}) {
    const threshold = options.threshold || 300; // meters
    const sampleSize = options.sampleSize || 50;
  
    /* ───────── Haversine ───────── */
    function haversine(a, b) {
      const R = 6371000;
      const toRad = x => x * Math.PI / 180;
  
      const dLat = toRad(b[0] - a[0]);
      const dLon = toRad(b[1] - a[1]);
  
      const lat1 = toRad(a[0]);
      const lat2 = toRad(b[0]);
  
      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(dLon / 2) ** 2;
  
      return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }
  
    /* ───────── Sampling ───────── */
    function samplePoints(coords, n = sampleSize) {
      if (!coords || coords.length === 0) return [];
      if (coords.length <= n) return coords;
  
      const step = (coords.length - 1) / (n - 1);
  
      return Array.from({ length: n }, (_, i) =>
        coords[Math.round(i * step)]
      );
    }
  
    /* ───────── Similarity ───────── */
    function routesSimilar(r1, r2) {
      const c1 = samplePoints(r1.latlngs);
      const c2 = samplePoints(r2.latlngs);
  
      if (!c1.length || !c2.length) return false;
  
      let total = 0;
      const len = Math.min(c1.length, c2.length);
  
      for (let i = 0; i < len; i++) {
        total += haversine(c1[i], c2[i]);
      }
  
      return (total / len) < threshold;
    }
  
    /* ───────── Clustering ───────── */
    const clusters = [];
  
    for (const route of routes) {
      let placed = false;
  
      for (const cluster of clusters) {
        if (routesSimilar(route, cluster[0])) {
          cluster.push(route);
          placed = true;
          break;
        }
      }
  
      if (!placed) {
        clusters.push([route]);
      }
    }
  
    /* ───────── Sort clusters (largest first) ───────── */
    clusters.sort((a, b) => b.length - a.length);
  
    /* ───────── Add metadata ───────── */
    return clusters.map((cluster, idx) => ({
      id: idx + 1,
      count: cluster.length,
      representative: cluster[0],   // medoid-lite
      routes: cluster
    }));
  }