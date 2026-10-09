require("dotenv").config();

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const path = require("path");

const connectDB = require("./src/config/db");
const telemetryRoutes = require("./src/routes/telemetry.routes");
const chatRoutes = require("./src/routes/chat.routes");
const { initMQTTAndWebSocket } = require("./src/services/mqttService");

const app = express();

// Conexión a Base de Datos
connectDB();

// Middlewares
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Rutas de API REST
app.use("/api/telemetry", telemetryRoutes);
app.use("/api/chat", chatRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Servidor HTTP y WebSockets
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

// Inicializar Servicios MQTT y WebSockets
initMQTTAndWebSocket(wss);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Servidor] AQUA-PREDICT escuchando en el puerto ${PORT}`);
});