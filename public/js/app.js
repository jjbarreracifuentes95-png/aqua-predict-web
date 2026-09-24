// ==========================================
// CONFIGURACIÓN DE ELEMENTOS DEL DOM
// ==========================================
const metricPercentage = document.getElementById('metric-percentage');
const metricVolume = document.getElementById('metric-volume');
const metricDistance = document.getElementById('metric-distance');
const metricTrr = document.getElementById('metric-trr');
const tankWater = document.getElementById('tank-water');
const tankText = document.getElementById('tank-text');
const statusBadge = document.getElementById('status-badge');
const logoutBtn = document.getElementById('logout-btn');

// ==========================================
// INICIALIZACIÓN DE CHART.JS
// ==========================================
const ctx = document.getElementById('consumptionChart').getContext('2d');
const consumptionChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'Nivel del Tanque (%)',
      data: [],
      borderColor: '#3b82f6', // Tailwind blue-500
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      borderWidth: 2,
      fill: true,
      tension: 0.3,
      pointRadius: 4,
      pointBackgroundColor: '#60a5fa'
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        min: 0,
        max: 100,
        grid: { color: '#334155' },
        ticks: { color: '#94a3b8', callback: (val) => `${val}%` }
      },
      x: {
        grid: { color: '#334155' },
        ticks: { color: '#94a3b8' }
      }
    },
    plugins: {
      legend: { labels: { color: '#f8fafc' } }
    }
  }
});

// ==========================================
// LÓGICA DE ACTUALIZACIÓN DE LA INTERFAZ
// ==========================================
function updateUI(data) {
  const percentage = Number(data.percentage || 0).toFixed(1);
  const volume = Math.round(Number(data.volume_liters || 0));
  const distance = Number(data.distance_cm || 0).toFixed(1);

  // 1. Tarjetas de métricas (KPIs)
  if (metricPercentage) metricPercentage.innerText = `${percentage} %`;
  if (metricVolume) metricVolume.innerText = `${volume} L`;
  if (metricDistance) metricDistance.innerText = `${distance} cm`;

  // Estimación TRR básica (ejemplo: asumiendo consumo promedio)
  if (metricTrr) {
    const estimatedHours = ((volume / 1000) * 24).toFixed(1); // Cálculo demostrativo
    metricTrr.innerText = `${estimatedHours} hrs`;
  }

  // 2. Tanque animado
  if (tankWater && tankText) {
    tankWater.style.height = `${percentage}%`;
    tankText.innerText = `${percentage}%`;
  }

  // 3. Gráfica en tiempo real
  const timeLabel = new Date(data.timestamp || Date.now()).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  if (consumptionChart.data.labels.length >= 12) {
    consumptionChart.data.labels.shift();
    consumptionChart.data.datasets[0].data.shift();
  }

  consumptionChart.data.labels.push(timeLabel);
  consumptionChart.data.datasets[0].data.push(percentage);
  consumptionChart.update();
}

// ==========================================
// CARGA INICIAL (HISTORIAL DE MONGODB)
// ==========================================
async function loadHistory() {
  try {
    const res = await fetch('/api/telemetry/history');
    if (!res.ok) throw new Error("Error consultando API");
    const history = await res.json();
    
    if (Array.isArray(history)) {
      history.forEach(item => updateUI(item));
    }
  } catch (err) {
    console.error("[API Error]:", err.message);
  }
}

// ==========================================
// CONEXIÓN WEBSOCKET EN TIEMPO REAL
// ==========================================
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("[WS] Conectado al servidor en tiempo real");
    if (statusBadge) {
      statusBadge.className = "px-3 py-1 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-2";
      statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Sistema En Vivo`;
    }
  };

  ws.onmessage = (event) => {
    try {
      const liveData = JSON.parse(event.data);
      console.log("[WS Data]:", liveData);
      updateUI(liveData);
    } catch (e) {
      console.error("[WS Error de parseo]:", e);
    }
  };

  ws.onclose = () => {
    console.warn("[WS] Conexión cerrada. Reintentando en 3s...");
    if (statusBadge) {
      statusBadge.className = "px-3 py-1 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-2";
      statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-400"></span> Desconectado`;
    }
    setTimeout(initWebSocket, 3000);
  };
}

// Botón de logout (redirección a login.html si existe)
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    window.location.href = 'login.html';
  });
}

// Inicializar
loadHistory();
initWebSocket();