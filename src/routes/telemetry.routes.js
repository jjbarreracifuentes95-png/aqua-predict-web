const express = require("express");
const router = express.Router();
const telemetryController = require("../controllers/telemetryController");

router.get("/latest", telemetryController.getLatestTelemetry);
router.get("/history", telemetryController.getTelemetryHistory);

module.exports = router;