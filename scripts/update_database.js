/**
 * 数据库更新脚本
 * 用于应用数据库迁移
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

async function updateDatabase() {
  console.log("开始数据库更新...");

  // 创建数据库连接
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "10.41.111.100",
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "Linfeng19960110",
    database: process.env.DB_DATABASE || "bunblebee",
    multipleStatements: true, // 允许执行多条SQL语句
  });

  try {
    console.log("数据库连接成功");

    // 读取迁移SQL文件
    const migrationFile = path.join(
      __dirname,
      "../database/migration_add_total_price.sql"
    );
    const migrationSQL = fs.readFileSync(migrationFile, "utf8");

    console.log("执行数据库迁移...");

    // 执行迁移SQL
    const [results] = await connection.query(migrationSQL);

    console.log("数据库迁移完成");
    console.log("结果: ", results[results.length - 1][0]);

    // 备份当前表结构（可选）
    console.log("备份当前数据库结构...");
    const backupFolder = path.join(__dirname, "../database/backup");

    // 确保备份目录存在
    if (!fs.existsSync(backupFolder)) {
      fs.mkdirSync(backupFolder, { recursive: true });
    }

    // 生成备份文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFileName = `database_schema_${timestamp}.sql`;
    const backupFilePath = path.join(backupFolder, backupFileName);

    // 获取表结构
    const [tables] = await connection.query("SHOW TABLES");
    let schemaBackup = "";

    for (const tableRow of tables) {
      const tableName = tableRow[Object.keys(tableRow)[0]];
      const [createTable] = await connection.query(
        `SHOW CREATE TABLE ${tableName}`
      );
      const createTableStmt = createTable[0]["Create Table"];

      schemaBackup += `-- Table structure for ${tableName}\n`;
      schemaBackup += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
      schemaBackup += `${createTableStmt};\n\n`;
    }

    // 写入备份文件
    fs.writeFileSync(backupFilePath, schemaBackup);
    console.log(`数据库结构已备份至: ${backupFilePath}`);
  } catch (error) {
    console.error("数据库更新失败:", error);
    throw error;
  } finally {
    await connection.end();
    console.log("数据库连接已关闭");
  }
}

// 执行更新
updateDatabase()
  .then(() => {
    console.log("数据库更新程序执行完成");
    process.exit(0);
  })
  .catch((error) => {
    console.error("数据库更新程序执行失败:", error);
    process.exit(1);
  });
