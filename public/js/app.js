/**
 * AQUA-PREDICT - Sistema de Monitoreo y Analítica Predictiva de Agua
 * Archivo: public/js/app.js
 */

// 1. CONTROL DE ACCESO (AUTENTICACIÓN)
// ============================================================================
const currentUser = JSON.parse(localStorage.getItem('aqua_user'));

if (!currentUser) {
  if (!window.location.pathname.endsWith('login.html')) {
    window.location.replace('login.html');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('aqua_user');
      window.location.replace('login.html');
    });
  }

  // 2. INICIALIZACIÓN DE CHART.JS
  // ============================================================================
  const ctx = document.getElementById('consumptionChart')?.getContext('2d');
  let historyChart = null;

  if (ctx) {
    historyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Nivel del Tanque (%)',
          data: [],
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { min: 0, max: 100, grid: { color: '#334155' } },
          x: { grid: { color: '#334155' } }
        },
        plugins: { legend: { labels: { color: '#f8fafc' } } }
      }
    });
  }

  // 3. ACTUALIZACIÓN DE INTERFAZ GRÁFICA
  // ============================================================================
  function updateDashboard(data) {
    const percentage = Math.max(0, Math.min(100, Number(data.percentage) || 0));
    const volume = Number(data.volume_liters) || 0;
    const distance = Number(data.distance_cm) || 0;
    const trr = (percentage * 0.24).toFixed(1);

    const percentageEl = document.getElementById('metric-percentage');
    const volumeEl = document.getElementById('metric-volume');
    const trrEl = document.getElementById('metric-trr');
    const distanceEl = document.getElementById('metric-distance');
    const tankWaterEl = document.getElementById('tank-water');
    const tankTextEl = document.getElementById('tank-text');
    const statusBadge = document.getElementById('status-badge');

    if (percentageEl) percentageEl.textContent = `${percentage.toFixed(1)} %`;
    if (volumeEl) volumeEl.textContent = `${volume.toFixed(0)} L`;
    if (trrEl) trrEl.textContent = `${trr} hrs`;
    if (distanceEl) distanceEl.textContent = `${distance.toFixed(1)} cm`;

    if (tankWaterEl) tankWaterEl.style.height = `${percentage}%`;
    if (tankTextEl) tankTextEl.textContent = `${percentage.toFixed(0)}%`;

    if (statusBadge) {
      if (percentage <= 20) {
        statusBadge.className = "px-3 py-1 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-2";
        statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span> Alerta Crítica`;
      } else if (percentage <= 50) {
        statusBadge.className = "px-3 py-1 text-xs rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-2";
        statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span> Nivel Moderado`;
      } else {
        statusBadge.className = "px-3 py-1 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-2";
        statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Sistema Normal`;
      }
    }

    if (historyChart) {
      const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (historyChart.data.labels.length >= 10) {
        historyChart.data.labels.shift();
        historyChart.data.datasets[0].data.shift();
      }
      historyChart.data.labels.push(timeLabel);
      historyChart.data.datasets[0].data.push(percentage);
      historyChart.update();
    }
  }

  // 4. CARGAR DATOS INICIALES DESDE MONGODB (REST API)
  // ============================================================================
  async function loadInitialData() {
    try {
      // Cargar el último estado guardado
      const latestRes = await fetch('https://aqua-predict-web.onrender.com/api/telemetry/latest');
      if (latestRes.ok) {
        const latestData = await latestRes.json();
        updateDashboard(latestData);
      }

      // Cargar historial reciente para la gráfica
      const historyRes = await fetch('https://aqua-predict-web.onrender.com/api/telemetry/history');
      if (historyRes.ok && historyChart) {
        const historyData = await historyRes.json();
        historyChart.data.labels = [];
        historyChart.data.datasets[0].data = [];

        historyData.forEach(item => {
          const timeLabel = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          historyChart.data.labels.push(timeLabel);
          historyChart.data.datasets[0].data.push(item.percentage);
        });
        historyChart.update();
      }
    } catch (err) {
      console.warn('[API] No se pudo recuperar el historial inicial:', err);
    }
  }

  loadInitialData();

  // 5. CONEXIÓN EN TIEMPO REAL (WEBSOCKETS)
  // ============================================================================
  const socket = new WebSocket('wss://aqua-predict-web.onrender.com');

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      updateDashboard(data);
    } catch (err) {
      console.error('[WebSocket] Error al parsear JSON:', err);
    }
  };
});