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

// LEDs Virtuales del Dashboard
const ledGreen = document.getElementById('led-green');
const ledYellow = document.getElementById('led-yellow');
const ledRed = document.getElementById('led-red');

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
      borderColor: '#3b82f6',
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
        ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 0 }
      }
    },
    plugins: {
      legend: { labels: { color: '#f8fafc' } }
    }
  }
});

// ==========================================
// CONTROL DEL SEMÁFORO LED VIRTUAL
// ==========================================
function updateLeds(percentage) {
  if (ledGreen) ledGreen.className = "w-5 h-5 rounded-full bg-slate-700 border border-slate-600 transition-all duration-300";
  if (ledYellow) ledYellow.className = "w-5 h-5 rounded-full bg-slate-700 border border-slate-600 transition-all duration-300";
  if (ledRed) ledRed.className = "w-5 h-5 rounded-full bg-slate-700 border border-slate-600 transition-all duration-300";

  if (percentage > 50) {
    if (ledGreen) ledGreen.className = "w-5 h-5 rounded-full bg-emerald-500 border border-emerald-400 shadow-[0_0_12px_#10b981] transition-all duration-300";
  } else if (percentage >= 20) {
    if (ledYellow) ledYellow.className = "w-5 h-5 rounded-full bg-amber-500 border border-amber-400 shadow-[0_0_12px_#f59e0b] transition-all duration-300";
  } else {
    if (ledRed) ledRed.className = "w-5 h-5 rounded-full bg-red-500 border border-red-400 shadow-[0_0_12px_#ef4444] animate-pulse transition-all duration-300";
  }
}

// ==========================================
// LÓGICA DE ACTUALIZACIÓN DE LA INTERFAZ
// ==========================================
function updateUI(data, isLive = false) {
  const percentage = Number(data.percentage || 0).toFixed(1);
  const volume = Math.round(Number(data.volume_liters || 0));
  const distance = Number(data.distance_cm || 0).toFixed(1);

  // 1. Tarjetas de métricas (KPIs)
  if (metricPercentage) metricPercentage.innerText = `${percentage} %`;
  if (metricVolume) metricVolume.innerText = `${volume} L`;
  if (metricDistance) metricDistance.innerText = `${distance} cm`;

  // Estimación TRR
  if (metricTrr) {
    const estimatedHours = ((volume / 1000) * 24).toFixed(1);
    metricTrr.innerText = `${estimatedHours} hrs`;
  }

  // 2. Tanque animado
  if (tankWater && tankText) {
    tankWater.style.height = `${percentage}%`;
    tankText.innerText = `${percentage}%`;
  }

  // 3. Semáforo LED
  updateLeds(Number(percentage));

  // 4. Generar hora actual si es un evento en vivo (WebSocket) o formatear la recibida
  let timeLabel = "";
  if (isLive || !data.timestamp) {
    timeLabel = new Date().toLocaleTimeString('es-GT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  } else {
    const parsedDate = new Date(data.timestamp);
    timeLabel = !isNaN(parsedDate.getTime()) 
      ? parsedDate.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
      : new Date().toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  }

  // Evitar duplicar consecutivamente la misma etiqueta en el eje X
  const lastLabel = consumptionChart.data.labels[consumptionChart.data.labels.length - 1];
  if (lastLabel === timeLabel && consumptionChart.data.labels.length > 0) {
    // Si la hora es idéntica a la anterior, actualiza solo el último valor
    consumptionChart.data.datasets[0].data[consumptionChart.data.datasets[0].data.length - 1] = percentage;
  } else {
    if (consumptionChart.data.labels.length >= 10) {
      consumptionChart.data.labels.shift();
      consumptionChart.data.datasets[0].data.shift();
    }
    consumptionChart.data.labels.push(timeLabel);
    consumptionChart.data.datasets[0].data.push(percentage);
  }

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
    
    if (Array.isArray(history) && history.length > 0) {
      // Tomar únicamente los últimos 10 registros guardados
      const recentHistory = history.slice(-10);
      recentHistory.forEach(item => updateUI(item, false));
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
    console.log("[WS] Conectado al servidor");
    if (statusBadge) {
      statusBadge.className = "px-3 py-1 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-2";
      statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Sistema En Vivo`;
    }
  };

  ws.onmessage = (event) => {
    try {
      const liveData = JSON.parse(event.data);
      // Forzar que los datos en vivo marquen la hora actual del cliente
      updateUI(liveData, true);
    } catch (e) {
      console.error("[WS Error]:", e);
    }
  };

  ws.onclose = () => {
    if (statusBadge) {
      statusBadge.className = "px-3 py-1 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-2";
      statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-400"></span> Desconectado`;
    }
    setTimeout(initWebSocket, 3000);
  };
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    window.location.href = 'login.html';
  });
}

// Inicializar
loadHistory();
initWebSocket();