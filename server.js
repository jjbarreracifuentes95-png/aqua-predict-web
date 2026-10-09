require("dotenv").config();

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mqtt = require("mqtt");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const https = require("https");

const app = express();

// ==========================================
// PARÁMETROS DEL TANQUE DE PRUEBA
// ==========================================
const TANK_HEIGHT_CM = 170.0;    // Altura útil del tanque
const SENSOR_OFFSET_CM = 10.00;   // Distancia del sensor al nivel máximo (offset)
const MAX_VOLUME_LITERS = 50.00; // Capacidad máxima (50 Litros)

// Configuración de Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
let lastAlertTime = 0; // Control antispam para alertas

// Función helper para enviar mensajes por Telegram
function sendTelegramAlert(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("[Telegram] Token o Chat ID no configurados.");
    return;
  }

  const postData = JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: "Markdown"
  });

  const options = {
    hostname: "api.telegram.org",
    port: 443,
    path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    res.on("data", () => {});
  });

  req.on("error", (e) => {
    console.error("[Telegram Error]:", e.message);
  });

  req.write(postData);
  req.end();
}

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

    // ----------------------------------------------------
    // 1. DETECCIÓN DE CONSULTAS HISTÓRICAS / POR FECHA
    // ----------------------------------------------------
    const dateRegex = /del?\s+(\d{1,2})\s+de\s+([a-z]+)(?:\s+al?\s+(\d{1,2})\s+de\s+([a-z]+))?/i;
    const dateMatch = userMsg.match(dateRegex);

    if (dateMatch || userMsg.includes("semana pasada") || userMsg.includes("ultimos 7 dias") || userMsg.includes("ayer")) {
      let startDate, endDate;
      const now = new Date();

      if (dateMatch) {
        const months = {
          enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
          julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
        };

        const startDay = parseInt(dateMatch[1]);
        const startMonth = months[dateMatch[2].toLowerCase()] ?? now.getMonth();
        startDate = new Date(now.getFullYear(), startMonth, startDay, 0, 0, 0);

        if (dateMatch[3] && dateMatch[4]) {
          const endDay = parseInt(dateMatch[3]);
          const endMonth = months[dateMatch[4].toLowerCase()] ?? now.getMonth();
          endDate = new Date(now.getFullYear(), endMonth, endDay, 23, 59, 59);
        } else {
          endDate = new Date(now.getFullYear(), startMonth, startDay, 23, 59, 59);
        }
      } else if (userMsg.includes("ayer")) {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);

        endDate = new Date(now);
        endDate.setDate(now.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
      } else {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        endDate = now;
      }

      const firstData = await Telemetry.findOne({ timestamp: { $gte: startDate,$lte: endDate } }).sort({ timestamp: 1 });
      const lastData = await Telemetry.findOne({ timestamp: { $gte: startDate,$lte: endDate } }).sort({ timestamp: -1 });

      if (firstData && lastData) {
        const volumenInicial = firstData.volume_liters;
        const volumenFinal = lastData.volume_liters;
        const consumoEstimado = Number((volumenInicial - volumenFinal).toFixed(1));

        const opcionesFecha = { day: 'numeric', month: 'short' };
        const fInicioStr = startDate.toLocaleDateString('es-ES', opcionesFecha);
        const fFinStr = endDate.toLocaleDateString('es-ES', opcionesFecha);

        let reply = "";
        if (consumoEstimado > 0) {
          reply = `Entre el **${fInicioStr}** y el **${fFinStr}**, el consumo estimado fue de **${consumoEstimado} Litros**.`;
        } else {
          reply = `Entre el **${fInicioStr}** y el **${fFinStr}**, no se registró una disminución neta de agua (posible rellenado o tanque inactivo).`;
        }

        return res.json({ reply });
      } else {
        return res.json({ 
          reply: `No encontré registros de telemetría guardados en el rango de fechas solicitado.` 
        });
      }
    }

    // ----------------------------------------------------
    // 2. CONSULTA EN TIEMPO REAL (ÚLTIMA LECTURA)
    // ----------------------------------------------------
    const lastData = await Telemetry.findOne().sort({ timestamp: -1 });
    let reply = "No tengo lecturas del tanque registradas en este momento.";

    if (lastData) {
      const porcentaje = lastData.percentage ?? 0;
      const volumen = lastData.volume_liters ?? 0;
      const trr = (lastData.trr_hours !== undefined && lastData.trr_hours !== null && lastData.trr_hours > 0) 
        ? lastData.trr_hours 
        : Number((volumen / 2.0).toFixed(1));
      const distancia = lastData.distance_cm ?? 0;

      if (userMsg.includes("hola") || userMsg.includes("buenas") || userMsg.includes("que tal")) {
        reply = "¡Hola! Soy AquaBot. Puedo informarte sobre el nivel actual del agua, consumo por fechas (ej: *del 1 de octubre al 5 de octubre*), reserva estimada (TRR) o alertas del sistema.";
      } else if (
        userMsg.includes("tiempo") || 
        userMsg.includes("reserva") || 
        userMsg.includes("reserve") || 
        userMsg.includes("trr") || 
        userMsg.includes("dura") || 
        userMsg.includes("durara") || 
        userMsg.includes("queda")
      ) {
        reply = `Según las proyecciones de consumo, la reserva estimada durará aproximadamente **${trr} horas**.`;
      } else if (userMsg.includes("nivel") || userMsg.includes("porcentaje") || userMsg.includes("cuanto agua")) {
        reply = `El nivel actual del tanque es del **${porcentaje}%** (${volumen} Litros).`;
      } else if (userMsg.includes("volumen") || userMsg.includes("litro")) {
        reply = `El tanque cuenta actualmente con **${volumen} L** de agua disponible.`;
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
        reply