const mqtt = require("mqtt");
const WebSocket = require("ws");
const Telemetry = require("../models/Telemetry");
const { sendTelegramAlert } = require("./telegramService");

const TANK_HEIGHT_CM = 170.0;
const SENSOR_OFFSET_CM = 10.00;
const MAX_VOLUME_LITERS = 50.00;

let lastTelemetry = null;
let lastAlertTime = 0;
let isCurrentlyCritical = false;

function initMQTTAndWebSocket(wss) {
  const MQTT_BROKER = process.env.MQTT_BROKER || "broker.hivemq.com";
  const MQTT_TOPIC = process.env.MQTT_TOPIC || "aquapredict/mixco/tanque1/telemetria";
  const mqttClient = mqtt.connect(`mqtt://${MQTT_BROKER}:1883`);

  mqttClient.on("connect", () => {
    console.log("[MQTT] Conectado exitosamente a HiveMQ");
    mqttClient.subscribe(MQTT_TOPIC);
  });

  mqttClient.on("message", async (topic, message) => {
    try {
      const parsedData = JSON.parse(message.toString());
      console.log("[MQTT] Lectura recibida:", parsedData);

      const rawDistance = Number(parsedData.distance_cm) || 0;

      let waterHeight = TANK_HEIGHT_CM - (rawDistance + SENSOR_OFFSET_CM);
      if (waterHeight < 0) waterHeight = 0;
      if (waterHeight > TANK_HEIGHT_CM) waterHeight = TANK_HEIGHT_CM;

      const calculatedPercentage = Number(((waterHeight / TANK_HEIGHT_CM) * 100).toFixed(1));
      const calculatedVolume = Number(((calculatedPercentage / 100) * MAX_VOLUME_LITERS).toFixed(3));

      const now = new Date();
      let trrHours = Number((calculatedVolume / 2.0).toFixed(1));

      if (lastTelemetry && lastTelemetry.volume_liters > calculatedVolume) {
        const volumeDelta = lastTelemetry.volume_liters - calculatedVolume;
        const timeDeltaHours = (now - new Date(lastTelemetry.timestamp)) / (1000 * 60 * 60);

        if (timeDeltaHours > 0 && volumeDelta > 0) {
          const consumptionRate = volumeDelta / timeDeltaHours;
          trrHours = Number((calculatedVolume / consumptionRate).toFixed(1));
        }
      }

      const nowMs = Date.now();
      if (calculatedPercentage < 20) {
        if (!isCurrentlyCritical || (nowMs - lastAlertTime > 30 * 60 * 1000)) {
          sendTelegramAlert(
            `🚨 *¡ALERTA CRÍTICA DE AGUA - AQUAPREDICT!*\n\n` +
            `El nivel del tanque en *Mixco* ha bajado al *${calculatedPercentage}%* (${calculatedVolume} L).\n` +
            `⏱️ *Reserva estimada:* ${trrHours} hrs.\n\n` +
            `Por favor, verifica la bomba o el suministro de agua.`
          );
          lastAlertTime = nowMs;
          isCurrentlyCritical = true;
        }
      } else if (calculatedPercentage >= 50 && isCurrentlyCritical) {
        sendTelegramAlert(
          `✅ *¡TANQUE RELLENADO - AQUAPREDICT!*\n\n` +
          `El nivel del agua ha subido al *${calculatedPercentage}%* (${calculatedVolume} L).\n` +
          `El sistema ha vuelto a su estado normal.`
        );
        isCurrentlyCritical = false;
      }

      const telemetryToSave = {
        device_id: parsedData.device_id || "ESP32_MIXCO_01",
        distance_cm: rawDistance,
        percentage: calculatedPercentage,
        volume_liters: calculatedVolume,
        trr_hours: trrHours,
        timestamp: now
      };

      const newRecord = new Telemetry(telemetryToSave);
      const saved = await newRecord.save();
      console.log("[MongoDB] Guardado en Atlas con ID:", saved._id);

      lastTelemetry = saved;

      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(saved));
        }
      });
    } catch (err) {
      console.error("[Error MongoDB/MQTT]:", err.message);
    }
  });
}

module.exports = { initMQTTAndWebSocket };