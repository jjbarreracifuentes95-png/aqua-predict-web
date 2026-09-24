require("dotenv").config();

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mqtt = require("mqtt");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));

app.use(express.json());

// SERVIR ARCHIVOS ESTÁTICOS (HTML, CSS, JS del Frontend)
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

// Variable global para cálculo de flujo/descarga (TRR)
let lastTelemetry = null;

// ENDPOINTS DE LA API REST
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

// Ruta principal para servir la interfaz web
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

// CLIENTE MQTT Y CONEXIÓN EN TIEMPO REAL
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

    const now = new Date();
    const currentVolume = Number(parsedData.volume_liters) || 0;
    let trrHours = 24.0; // Valor base por defecto

    // Lógica Predictiva: Calcular consumo basado en el delta de tiempo y volumen
    if (lastTelemetry && lastTelemetry.volume_liters > currentVolume) {
      const volumeDelta = lastTelemetry.volume_liters - currentVolume; // Litros consumidos
      const timeDeltaHours = (now - new Date(lastTelemetry.timestamp)) / (1000 * 60 * 60); // Horas transcurridas

      if (timeDeltaHours > 0 && volumeDelta > 0) {
        const consumptionRate = volumeDelta / timeDeltaHours; // Litros por hora
        trrHours = Number((currentVolume / consumptionRate).toFixed(1));
      }
    }

    // Crear el objeto estandarizado con la FECHA REAL ACTUAL del servidor
    const telemetryToSave = {
      device_id: parsedData.device_id || "ESP32_MIXCO_01",
      distance_cm: Number(parsedData.distance_cm) || 0,
      percentage: Number(parsedData.percentage) || 0,
      volume_liters: currentVolume,
      trr_hours: trrHours,
      timestamp: now
    };

    const newRecord = new Telemetry(telemetryToSave);
    const saved = await newRecord.save();
    console.log("[MongoDB] Guardado en Atlas con ID:", saved._id);

    // Actualizar última lectura
    lastTelemetry = saved;

    // Emitir el objeto ESTANDARIZADO a los clientes WebSocket
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