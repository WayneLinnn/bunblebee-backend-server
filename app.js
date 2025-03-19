require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");

const app = express();
const port = process.env.PORT || 80;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 数据库连接配置
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// 测试路由
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Bunblebee backend server" });
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

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res
    .status(500)
    .json({ message: "Something went wrong!", error: err.message });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
