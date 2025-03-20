const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
require("dotenv").config();
const { Sequelize } = require("sequelize");

const app = express();

// 启用 CORS，允许所有来源访问
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// 数据库连接配置
const pool = mysql.createPool({
  host: process.env.DB_HOST || "10.41.111.100",
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "Linfeng19960110",
  database: process.env.DB_DATABASE || "bunblebee",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// 将 pool.promise() 转换为全局变量以便重用
const promisePool = pool.promise();

// 欢迎页面
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to Bunblebee Backend Server",
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

// 测试数据库连接
app.get("/test-db", async (req, res) => {
  try {
    // 测试连接
    const [result] = await promisePool.query("SELECT 1 + 1 AS solution");

    // 获取数据库版本信息
    const [version] = await promisePool.query("SELECT VERSION() as version");

    // 获取当前数据库名
    const [database] = await promisePool.query(
      "SELECT DATABASE() as database_name"
    );

    res.json({
      status: "success",
      message: "Database connection successful",
      details: {
        solution: result[0].solution,
        version: version[0].version,
        database: database[0].database_name,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).json({
      status: "error",
      message: "Database connection failed",
      error: error.message,
    });
  }
});

// 健康检查接口
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "bunblebee-backend",
    environment: process.env.NODE_ENV || "development",
  });
});

const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Database host: ${process.env.DB_HOST || "10.41.111.100"}`);
});

const sequelize = new Sequelize("bunblebee", "root", "Linfeng19960110", {
  host: "10.41.111.100",
  dialect: "mysql",
});

// 自动执行迁移
sequelize
  .authenticate()
  .then(() => {
    console.log("Connection has been established successfully.");
    // return sequelize.sync(); // 同步模型到数据库
  })
  .then(() => {
    console.log("Database synchronized successfully.");
  })
  .catch((err) => {
    console.error("Unable to connect to the database:", err);
  });
