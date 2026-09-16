const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mqtt = require("mqtt");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));

app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://jjbarreracifuentes95_db_user:wImDv0Bo2xBTViGU@cluster0.02qvazb.mongodb.net/aquapredict?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log("[MongoDB] Conectado exitosamente a la base de datos Atlas."))
  .catch(err => console.error("[MongoDB] Error de conexion:", err.message));

const TelemetrySchema = new mongoose.Schema({
  device_id: String,
  distance_cm: Number,
  percentage: Number,
  volume_liters: Number,
  timestamp: { type: Date, default: Date.now }
});

const Telemetry = mongoose.model("Telemetry", TelemetrySchema);

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
  res.send("AQUA-PREDICT Backend Activo");
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

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

    let dateObj = new Date();
    if (parsedData.timestamp) {
      const ts = Number(parsedData.timestamp);
      dateObj = ts > 10000000000 ? new Date(ts) : new Date(ts * 1000);
    }

    const newRecord = new Telemetry({
      device_id: parsedData.device_id || "ESP32_MIXCO_01",
      distance_cm: Number(parsedData.distance_cm) || 0,
      percentage: Number(parsedData.percentage) || 0,
      volume_liters: Number(parsedData.volume_liters) || 0,
      timestamp: dateObj
    });

    const saved = await newRecord.save();
    console.log("[MongoDB] Guardado en Atlas con ID:", saved._id);

    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(parsedData));
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