const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// 数据库连接配置
const pool = mysql.createPool({
  host: process.env.DB_HOST || "10.41.111.100",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "%",
  database: "bunblebee",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// 测试路由
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Bunblebee Backend Server" });
});

// 测试数据库连接
app.get("/test-db", async (req, res) => {
  try {
    const [rows] = await pool.promise().query("SELECT 1");
    res.json({ message: "Database connection successful", data: rows });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Database connection failed", error: error.message });
  }
});

const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
