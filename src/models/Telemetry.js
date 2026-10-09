const mongoose = require("mongoose");

const TelemetrySchema = new mongoose.Schema({
  device_id: String,
  distance_cm: Number,
  percentage: Number,
  volume_liters: Number,
  trr_hours: Number,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Telemetry", TelemetrySchema);