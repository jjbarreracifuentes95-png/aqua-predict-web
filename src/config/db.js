const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const MONGO_URI = process.env.MONGODB_URI || "mongodb+srv://admin:admin1234@cluster0.02qvazb.mongodb.net/aquapredict?retryWrites=true&w=majority";
    await mongoose.connect(MONGO_URI);
    console.log("[MongoDB] Conectado exitosamente a la base de datos Atlas.");
  } catch (err) {
    console.error("[MongoDB] Error de conexion:", err.message);
  }
};

module.exports = connectDB;