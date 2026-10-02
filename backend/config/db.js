const mongoose = require('mongoose');

let connecting = null;

/**
 * Connects once and reuses the connection (important for serverless hosts like Vercel,
 * where the module may be re-used across invocations). Does not kill the process on failure.
 */
async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not defined in environment variables');

  if (!connecting) {
    mongoose.set('strictQuery', true);
    connecting = mongoose
      .connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000, maxPoolSize: 10 })
      .then((m) => {
        console.log(`MongoDB connected: ${m.connection.host}/${m.connection.name}`);
        return m.connection;
      })
      .catch((err) => {
        connecting = null; // allow retry on the next request
        throw err;
      });
  }
  return connecting;
}

module.exports = connectDB;
