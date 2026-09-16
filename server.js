/**
 * AQUA-PREDICT - Servidor Backend & Pasarela de Datos
 * Archivo: server.js
 * Descripción: Recibe datos del Broker MQTT (ESP32) y los retransmite 
 *              a la aplicación web mediante WebSockets.
 */

// Importamos las librerías necesarias
const mqtt = require('mqtt');
const WebSocket = require('ws');

// CONFIGURACIONES PRINCIPALES
const MQTT_BROKER = 'mqtt://broker.hivemq.com:1883'; // Broker MQTT gratuito para pruebas
const MQTT_TOPIC = 'aquapredict/mixco/tanque1/telemetria'; // Dirección donde publicará el ESP32
const WS_PORT = 8080; // Puerto para la comunicación en tiempo real con la web

// 1. INICIALIZAR EL SERVIDOR WEBSOCKET
// Este servidor mantiene una puerta abierta para hablar directamente con el navegador
const wss = new WebSocket.Server({ port: WS_PORT }, () => {
  console.log(`[WebSocket] Servidor activo escuchando en ws://localhost:${WS_PORT}`);
});

// Función para enviar los datos a todas las pestañas de la web que estén abiertas
function sendToWebClients(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// 2. CONECTARSE AL BROKER MQTT
const mqttClient = mqtt.connect(MQTT_BROKER);

mqttClient.on('connect', () => {
  console.log('[MQTT] Conectado exitosamente al Broker de mensajería');
  
  // Nos suscribimos al tópico para escuchar cuando el ESP32 envíe datos
  mqttClient.subscribe(MQTT_TOPIC, (err) => {
    if (!err) {
      console.log(`[MQTT] Escuchando el tópico: ${MQTT_TOPIC}`);
    }
  });
});

// 3. RECEPCIÓN Y REENVÍO DE DATOS
// Cada vez que el ESP32 envía un mensaje, se ejecuta este bloque
mqttClient.on('message', (topic, message) => {
  try {
    // Convertimos el mensaje de texto JSON a un objeto JavaScript
    const telemetryData = JSON.parse(message.toString());
    console.log('[MQTT] Lectura recibida del sensor:', telemetryData);

    // Retransmitimos los datos hacia el Dashboard Web de inmediato
    sendToWebClients(telemetryData);

  } catch (error) {
    console.error('[Error] El mensaje recibido no es un JSON válido:', error.message);
  }
});