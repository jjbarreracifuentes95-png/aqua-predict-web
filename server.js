require("dotenv").config();

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mqtt = require("mqtt");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();

// ==========================================
// PARÁMETROS DEL TANQUE DE PRUEBA (22cm / 350ml / 1cm offset)
// ==========================================
const TANK_HEIGHT_CM = 22.0;    // Altura del tanque
const SENSOR_OFFSET_CM = 1.0;   // Distancia del sensor al nivel máximo de agua
const MAX_VOLUME_LITERS = 0.35; // Capacidad máxima (350ml en litros)

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));

app.use(express.json());

// SERVIR ARCHIVOS ESTÁTICOS
app.use(express.static(path.join(__dirname, "public")));

// Cadena de conexión MongoDB Atlas
const MONGO_URI = process.env.MONGODB_URI || "mongodb+srv://admin:admin1234@cluster0.02qvazb.mongodb.net/aquapredict?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log("[MongoDB] Conectado exitosamente a la base de datos Atlas."))
  .catch(err => console.error("[MongoDB] Error de conexion:", err.message));

const TelemetrySchema = new mongoose.Schema({
  device_id: String,
  distance_cm: Number,
  percentage: Number,
  volume_liters: Number,
  trr_hours: Number,
  timestamp: { type: Date, default: Date.now }
});

const Telemetry = mongoose.model("Telemetry", TelemetrySchema);

let lastTelemetry = null;

// ENDPOINTS API REST
app.get("/api/telemetry/latest", async (req, res) => {
  try {
    const latestData = await Telemetry.findOne().sort({ timestamp: -1 });
    if (!latestData) return res.status(404).json({ message: "No hay datos aun." });
    res.json(latestData);
  } catch (error) {
    res.status(500).json({ error: "Error MongoDB" });
  }
});

app.get("/api/telemetry/history", async (req, res) => {
  try {
    const history = await Telemetry.find().sort({ timestamp: -1 }).limit(10);
    res.json(history.reverse());
  } catch (error) {
    res.status(500).json({ error: "Error Historial" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

// CLIENTE MQTT Y LÓGICA EN TIEMPO REAL
const MQTT_BROKER = "broker.hivemq.com";
const MQTT_TOPIC = "aquapredict/mixco/tanque1/telemetria";
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

    // --- CÁLCULO AJUSTADO (22cm / 1cm offset / 0.35L) ---
    let waterHeight = TANK_HEIGHT_CM - (rawDistance - SENSOR_OFFSET_CM);
    if (waterHeight < 0) waterHeight = 0;
    if (waterHeight > TANK_HEIGHT_CM) waterHeight = TANK_HEIGHT_CM;

    const calculatedPercentage = Number(((waterHeight / TANK_HEIGHT_CM) * 100).toFixed(1));
    const calculatedVolume = Number(((calculatedPercentage / 100) * MAX_VOLUME_LITERS).toFixed(3)); // Muestra hasta mililitros

    const now = new Date();
    let trrHours = 24.0;

    // Lógica Predictiva (TRR)
    if (lastTelemetry && lastTelemetry.volume_liters > calculatedVolume) {
      const volumeDelta = lastTelemetry.volume_liters - calculatedVolume;
      const timeDeltaHours = (now - new Date(lastTelemetry.timestamp)) / (1000 * 60 * 60);

      if (timeDeltaHours > 0 && volumeDelta > 0) {
        const consumptionRate = volumeDelta / timeDeltaHours;
        trrHours = Number((calculatedVolume / consumptionRate).toFixed(1));
      }
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Servidor] AQUA-PREDICT escuchando en el puerto ${PORT}`);
});