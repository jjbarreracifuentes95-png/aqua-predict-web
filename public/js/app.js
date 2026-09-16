// ============================================================================
// AQUA-PREDICT - DASHBOARD FRONTEND LOGIC
// ============================================================================

// 1. CONTROL DE ACCESO (AUTENTICACIÓN)
// ============================================================================
const currentUser = JSON.parse(localStorage.getItem('aqua_user'));

// Redirección limpia considerando la ruta de Vercel/Servidor local
if (!currentUser) {
  if (!window.location.pathname.endsWith('login.html')) {
    window.location.replace('login.html');
  }
} else {
  const userNameEl = document.getElementById('user-name');
  const userRoleEl = document.getElementById('user-role');
  if (userNameEl) userNameEl.textContent = currentUser.name;
  if (userRoleEl) userRoleEl.textContent = currentUser.role;
}

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('aqua_user');
    window.location.replace('login.html');
  });
}

// 2. ELEMENTOS DEL DOM
// ============================================================================
const waterLevelText = document.getElementById('water-level-percentage');
const waterVolumeText = document.getElementById('water-volume-liters');
const systemStatusBadge = document.getElementById('system-status');
const alertBox = document.getElementById('alert-box');
const alertText = document.getElementById('alert-text');
const liquidVisual = document.getElementById('water-liquid');

// 3. INICIALIZACIÓN DE GRÁFICA (CHART.JS)
// ============================================================================
const ctx = document.getElementById('historyChart')?.getContext('2d');
let historyChart;

if (ctx) {
  historyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Nivel de Agua (%)',
        data: [],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          max: 100,
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: '#94a3b8' }
        },
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: '#94a3b8' }
        }
      },
      plugins: {
        legend: { labels: { color: '#f8fafc' } }
      }
    }
  });
}

// 4. LÓGICA DE ACTUALIZACIÓN DE INTERFAZ
// ============================================================================
function updateDashboard(data) {
  const percentage = Math.max(0, Math.min(100, data.percentage));
  const volume = data.volume_liters;

  // Actualizar textos
  if (waterLevelText) waterLevelText.textContent = `${percentage.toFixed(1)}%`;
  if (waterVolumeText) waterVolumeText.textContent = `${volume.toFixed(0)} L`;

  // Actualizar animación del tanque
  if (liquidVisual) {
    liquidVisual.style.height = `${percentage}%`;
  }

  // Lógica de Estado y Alertas
  if (percentage <= 20) {
    if (systemStatusBadge) {
      systemStatusBadge.textContent = 'CRÍTICO';
      systemStatusBadge.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30';
    }
    if (alertBox && alertText) {
      alertBox.classList.remove('hidden');
      alertText.textContent = `¡ALERTA CRÍTICA! Nivel de agua extremadamente bajo (${percentage}%). Se requiere recarga.`;
    }
  } else if (percentage <= 50) {
    if (systemStatusBadge) {
      systemStatusBadge.textContent = 'MODERADO';
      systemStatusBadge.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
    }
    if (alertBox) alertBox.classList.add('hidden');
  } else {
    if (systemStatusBadge) {
      systemStatusBadge.textContent = 'OPTIMO';
      systemStatusBadge.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    }
    if (alertBox) alertBox.classList.add('hidden');
  }

  // Actualizar Gráfica
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

// 5. CONEXIÓN WEBSOCKET EN TIEMPO REAL
// ============================================================================
// Enrutamiento inteligente: En local usa ws://, en la nube usa wss://Render
const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
const backendUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? `${protocol}${window.location.hostname}:8080`
  : 'wss://aqua-predict-web.onrender.com';

console.log(`[WebSocket] Conectando a: ${backendUrl}`);
const ws = new WebSocket(backendUrl);

ws.onopen = () => {
  console.log('[WebSocket] Conectado exitosamente al servidor Backend.');
};

ws.onmessage = (event) => {
  try {
    const telemetryData = JSON.parse(event.data);
    console.log('[WebSocket] Lectura en tiempo real recibida:', telemetryData);
    updateDashboard(telemetryData);
  } catch (error) {
    console.error('[WebSocket] Error al procesar datos recibidos:', error);
  }
};

ws.onerror = (error) => {
  console.error('[WebSocket] Error de conexión:', error);
};

ws.onclose = () => {
  console.warn('[WebSocket] Conexión cerrada con el servidor.');
};