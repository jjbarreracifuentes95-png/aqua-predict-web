const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mqtt = require('mqtt');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Habilitar CORS y parseo de JSON
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// 1. CONEXIÓN A MONGODB ATLAS
// ============================================================================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://jjbarreracifuentes95_db_user:wImDv0Bo2xBTViGU@cluster0.02qvazb.mongodb.net/aquapredict?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log('[MongoDB] Conectado exitosamente a la base de datos Atlas.'))
  .catch(err => console.error('[MongoDB] Error de conexión:', err));

// Definir el Esquema de Telemetría
const TelemetrySchema = new mongoose.Schema({
  device_id: String,
  distance_cm: Number,
  percentage: Number,
  volume_liters: Number,
  timestamp: { type: Date, default: Date.now }
});

const Telemetry = mongoose.model('Telemetry', TelemetrySchema);

// 2. ENDPOINTS REST PARA HISTORIAL Y ESTADO INICIAL
// ============================================================================
// Endpoint para obtener la última lectura registrada
app.get('/api/telemetry/latest', async (req, res) => {
  try {
    const latestData = await Telemetry.findOne().sort({ timestamp: -1 });
    if (!latestData) {
      return res.status(404).json({ message: 'No hay datos registrados aún.' });
    }
    res.json(latestData);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar MongoDB' });
  }
});

// Endpoint para obtener los últimos 10 registros (para la gráfica)
app.get('/api/telemetry/history', async (req, res) => {
  try {
    const history = await Telemetry.find().sort({ timestamp: -1 }).limit(10);
    res.json(history.reverse());
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar historial' });
  }
});

// 3. CONEXIÓN MQTT CON HIVEMQ
// ============================================================================
const MQTT_BROKER = 'broker.hivemq.com';
const MQTT_TOPIC = 'aquapredict/mixco/tanque1/telemetria';
const mqttClient = mqtt.connect(`mqtt://${MQTT_BROKER}:1883`);

mqttClient.on('connect', () => {
  console.log('[MQTT] Conectado exitosamente al Broker de mensajería HiveMQ');
  mqttClient.subscribe(MQTT_TOPIC);
  console.log(`[MQTT] Escuchando el tópico: ${MQTT_TOPIC}`);
});

mqttClient.on('message', async (topic, message) => {
  try {
    const parsedData = JSON.parse(message.toString());
    console.log('[MQTT] Lectura recibida:', parsedData);

    // Guardar persistencia en MongoDB Atlas
    const newRecord = new Telemetry({
      device_id: parsedData.device_id || 'ESP32_MIXCO_01',
      distance_cm: parsedData.distance_cm,
      percentage: parsedData.percentage,
      volume_liters: parsedData.volume_liters,
      timestamp: parsedData.timestamp ? new Date(parsedData.timestamp * 1000) : new Date()
    });
    await newRecord.save();
    console.log('[MongoDB] Registro de telemetría guardado en base de datos.');

    // Retransmitir a clientes WebSocket conectados
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(parsedData));
      }
    });
  } catch (err) {
    console.error('[Error] Fallo al procesar lectura MQTT:', err);
  }
});

// 4. INICIALIZACIÓN DEL SERVIDOR
// ============================================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[WebSocket] Servidor activo escuchando en el puerto ${PORT}`);
});