import mongoose from "mongoose";

export const connectDB = async () => {
  const conn = await mongoose.connect(process.env.MONGODB_URL);
  console.log(`MongoDB connected: ${conn.connection.host}`);
};
