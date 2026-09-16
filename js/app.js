/**
 * AQUA-PREDICT - Sistema de Monitoreo y Analítica Predictiva de Agua
 * Archivo: js/app.js
 * Descripción: Manejo del Dashboard, verificación de sesión, botón de salida,
 *              renderizado de gráficas (Chart.js), algoritmo TRR,
 *              simulador dinámico y CONEXIÓN WEBSOCKET (Sub-paso 4.3).
 */

// ============================================================================
// 1. VERIFICACIÓN DE SEGURIDAD Y PROTECCIÓN DE RUTA
// ============================================================================
// Si el usuario intenta acceder a index.html directamente sin haber iniciado
// sesión en login.html, el sistema lo redirige de inmediato a login.html.
if (sessionStorage.getItem("aqua_authenticated") !== "true") {
  window.location.href = "login.html";
}

document.addEventListener("DOMContentLoaded", () => {
  
  // ==========================================================================
  // 2. LOGOUT / CIERRE DE SESIÓN
  // ==========================================================================
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      // Destruye las variables almacenadas en la sesión del navegador
      sessionStorage.removeItem("aqua_authenticated");
      sessionStorage.removeItem("aqua_user");

      // Redirige al usuario de vuelta a la pantalla de inicio de sesión
      window.location.href = "login.html";
    });
  }

  // ==========================================================================
  // 3. INICIALIZACIÓN DE LA GRÁFICA DE CONSUMO (Chart.js)
  // ==========================================================================
  const ctx = document.getElementById('consumptionChart').getContext('2d');
  const consumptionChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [], // Se llenarán dinámicamente con las horas
      datasets: [{
        label: 'Nivel de Agua (%)',
        data: [], // Se llenará dinámicamente
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
        y: { 
          min: 0, 
          max: 100, 
          grid: { color: '#334155' }, 
          ticks: { color: '#94a3b8' } 
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

  // Función auxiliar para agregar puntos a la gráfica dinámicamente
  const maxDataPoints = 8;
  function addChartPoint(label, value) {
    if (consumptionChart.data.labels.length >= maxDataPoints) {
      consumptionChart.data.labels.shift();
      consumptionChart.data.datasets[0].data.shift();
    }
    consumptionChart.data.labels.push(label);
    consumptionChart.data.datasets[0].data.push(value);
    consumptionChart.update();
  }

  // ==========================================================================
  // 4. ALGORITMO PREDICTIVO TRR (Tiempo Restante de Reserva)
  // ==========================================================================
  /**
   * Calcula cuántas horas de agua le quedan al tanque basándose en el volumen actual
   * y la tasa de consumo promedio por hora.
   * @param {number} currentLiters - Volumen actual en litros.
   * @param {number} consumptionRatePerHour - Consumo promedio (L/h).
   * @returns {number} Horas estimadas restantes.
   */
  function calculateTRR(currentLiters, consumptionRatePerHour) {
    if (consumptionRatePerHour <= 0) return Infinity; 
    const hoursRemaining = currentLiters / consumptionRatePerHour;
    return parseFloat(hoursRemaining.toFixed(1));
  }

  // ==========================================================================
  // 5. ACTUALIZACIÓN DINÁMICA DE LA INTERFAZ DE USUARIO (UI)
  // ==========================================================================
  function updateDashboard(percentage, volumeLiters, distanceCm, consumptionRate) {
    const trrHours = calculateTRR(volumeLiters, consumptionRate);

    // Inyección de métricas rápidas en las tarjetas
    document.getElementById('metric-percentage').innerText = `${percentage}%`;
    document.getElementById('metric-volume').innerText = `${Math.round(volumeLiters)} L`;
    document.getElementById('metric-distance').innerText = `${Math.round(distanceCm)} cm`;
    document.getElementById('metric-trr').innerText = isFinite(trrHours) && trrHours > 0 ? `${trrHours} hrs` : (trrHours <= 0 ? '0 hrs' : '-- hrs');

    // Animación visual del tanque
    const tankWater = document.getElementById('tank-water');
    const tankText = document.getElementById('tank-text');
    tankWater.style.height = `${percentage}%`;
    tankText.innerText = `${percentage}%`;

    // Estado del sistema mediante colores de alerta
    const badge = document.getElementById('status-badge');
    if (percentage < 20) {
      badge.className = "px-3 py-1 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-2";
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span> Crítico / Recarga Requerida`;
    } else if (percentage < 50) {
      badge.className = "px-3 py-1 text-xs rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-2";
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span> Advertencia / Nivel Medio`;
    } else {
      badge.className = "px-3 py-1 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-2";
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Sistema Normal`;
    }
  }

  // ==========================================================================
  // 6. SIMULADOR DINÁMICO EN TIEMPO REAL (Lógica de respaldo local)
  // ==========================================================================
  const TOTAL_CAPACITY_LITERS = 1100;
  const TANK_HEIGHT_CM = 120;
  const MIN_SENSOR_DIST_CM = 20;

  let currentPercentage = 85; 
  let isRefilling = false;
  let simulatedConsumptionRate = 40;
  let simulatedHour = 8;

  // Cargar punto inicial en la gráfica
  addChartPoint(`${simulatedHour.toString().padStart(2, '0')}:00`, currentPercentage);

  // Ciclo simulador (se detiene automáticamente si se activa la conexión WebSocket real)
  const simulationInterval = setInterval(() => {
    if (!isRefilling) {
      currentPercentage -= Math.floor(Math.random() * 4) + 3;
      if (currentPercentage <= 15) {
        currentPercentage = 15;
        isRefilling = true;
      }
    } else {
      currentPercentage += Math.floor(Math.random() * 5) + 8;
      if (currentPercentage >= 95) {
        currentPercentage = 95;
        isRefilling = false;
      }
    }

    const currentLiters = (currentPercentage / 100) * TOTAL_CAPACITY_LITERS;
    const usableHeight = TANK_HEIGHT_CM - MIN_SENSOR_DIST_CM;
    const waterHeight = (currentPercentage / 100) * usableHeight;
    const distanceCm = TANK_HEIGHT_CM - waterHeight;

    updateDashboard(currentPercentage, currentLiters, distanceCm, simulatedConsumptionRate);

    simulatedHour = (simulatedHour + 1) % 24;
    const timeLabel = `${simulatedHour.toString().padStart(2, '0')}:00`;
    addChartPoint(timeLabel, currentPercentage);
  }, 3000);

  // ==========================================================================
  // 7. CONEXIÓN WEBSOCKET EN TIEMPO REAL (SUB-PASO 4.3)
  // ==========================================================================
  // Conexión con el servidor Backend Node.js (server.js)
  const socket = new WebSocket('ws://localhost:8080');

  socket.onopen = () => {
    console.log('[WebSocket] Conectado exitosamente al servidor Backend en vivo.');
    // Si se conecta con éxito al servidor real, pausamos la simulación local
    clearInterval(simulationInterval);
  };

  socket.onmessage = (event) => {
    try {
      // Recibir el paquete JSON procesado desde server.js
      const data = JSON.parse(event.data);
      console.log('[WebSocket] Lectura en tiempo real recibida:', data);

      // Actualizar el Dashboard con los datos físicos reales enviados por el ESP32
      updateDashboard(
        data.percentage, 
        data.volume_liters, 
        data.distance_cm, 
        40 // Tasa de consumo estimada (L/h)
      );

      // Agregar el dato real a la gráfica con la hora actual
      const now = new Date();
      const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      addChartPoint(timeString, data.percentage);

    } catch (error) {
      console.error('[Error WebSocket] Formato de datos no reconocido:', error);
    }
  };

  socket.onerror = (error) => {
    console.log('[WebSocket] Servidor backend no detectado. Continuando en modo simulación local.');
  };

});