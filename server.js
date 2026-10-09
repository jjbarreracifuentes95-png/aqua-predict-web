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
// PARÁMETROS DEL TANQUE DE PRUEBA
// ==========================================
const TANK_HEIGHT_CM = 170.0;    // Altura útil del tanque
const SENSOR_OFFSET_CM = 10.00;   // Distancia del sensor al nivel máximo (offset)
const MAX_VOLUME_LITERS = 50.00; // Capacidad máxima (50 Litros)

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

// ==========================================
// ENDPOINT API PARA EL ASISTENTE VIRTUAL (CHAT)
// ==========================================
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    const userMsg = (message || "").toLowerCase();

    // Obtener la última lectura guardada en Atlas
    const lastData = await Telemetry.findOne().sort({ timestamp: -1 });

    let reply = "No tengo lecturas del tanque registradas en este momento.";

    if (lastData) {
      const porcentaje = lastData.percentage;
      const volumen = lastData.volume_liters;
      const trr = lastData.trr_hours;
      const distancia = lastData.distance_cm;

      if (userMsg.includes("hola") || userMsg.includes("buenas")) {
        reply = "¡Hola! Soy AquaBot. Puedo informarte sobre el nivel del agua, volumen actual, reserva estimada (TRR) o alertas del sistema.";
      } else if (userMsg.includes("nivel") || userMsg.includes("porcentaje") || userMsg.includes("cuanto agua")) {
        reply = `El nivel actual del tanque es del **${porcentaje}%** (${volumen} Litros).`;
      } else if (userMsg.includes("volumen") || userMsg.includes("litro")) {
        reply = `El tanque cuenta actualmente con **${volumen} L** de agua disponible.`;
      } else if (userMsg.includes("tiempo") || userMsg.includes("reserva") || userMsg.includes("trr") || userMsg.includes("dura")) {
        reply = `Según las proyecciones de consumo, la reserva estimada durará aproximadamente **${trr} horas**.`;
      } else if (userMsg.includes("distancia") || userMsg.includes("sensor")) {
        reply = `La distancia actual medida por el sensor es de **${distancia} cm**.`;
      } else if (userMsg.includes("alerta") || userMsg.includes("estado") || userMsg.includes("fuga") || userMsg.includes("semaforo")) {
        if (porcentaje < 20) {
          reply = `⚠️ **¡Alerta Crítica!** El nivel está por debajo del 20% (${porcentaje}%). El semáforo está en ROJO.`;
        } else if (porcentaje <= 50) {
          reply = `🟡 **Advertencia:** El nivel está entre el 20% y 50% (${porcentaje}%). Semáforo en AMARILLO.`;
        } else {
          reply = `🟢 **Estado Normal:** El nivel del tanque es óptimo (${porcentaje}%). Semáforo en VERDE.`;
        }
      } else {
        reply = `Entendido. Te informo que el tanque está al **${porcentaje}%** (${volumen}L) con una reserva estimada de **${trr} hrs**.`;
      }
    }

    res.json({ reply });
  } catch (error) {
    console.error("[Chat API Error]:", error);
    res.status(500).json({ reply: "Ocurrió un error al consultar la base de datos." });
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

    // --- CÁLCULO AJUSTADO ---
    let waterHeight = TANK_HEIGHT_CM - (rawDistance + SENSOR_OFFSET_CM);
    if (waterHeight < 0) waterHeight = 0;
    if (waterHeight > TANK_HEIGHT_CM) waterHeight = TANK_HEIGHT_CM;

    const calculatedPercentage = Number(((waterHeight / TANK_HEIGHT_CM) * 100).toFixed(1));
    const calculatedVolume = Number(((calculatedPercentage / 100) * MAX_VOLUME_LITERS).toFixed(3));

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