const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

// 获取场地列表
router.get("/", async (req, res) => {
  try {
    const [fields] = await req.app.locals.db.query(
      "SELECT * FROM fields ORDER BY created_at DESC"
    );
    res.json({
      success: true,
      data: fields,
    });
  } catch (error) {
    console.error("获取场地列表失败:", error);
    res.status(500).json({
      success: false,
      message: "获取场地列表失败",
    });
  }
});

// 获取场地详情
router.get("/:id", async (req, res) => {
  try {
    const [field] = await req.app.locals.db.query(
      "SELECT * FROM fields WHERE id = ?",
      [req.params.id]
    );
    if (field.length === 0) {
      return res.status(404).json({
        success: false,
        message: "场地不存在",
      });
    }
    res.json({
      success: true,
      data: field[0],
    });
  } catch (error) {
    console.error("获取场地详情失败:", error);
    res.status(500).json({
      success: false,
      message: "获取场地详情失败",
    });
  }
});

// 预订场地
router.post("/:id/reserve", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "未登录",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const { reservation_date, start_time, end_time } = req.body;

    // 验证时间是否在场地可用时间内
    const [field] = await req.app.locals.db.query(
      "SELECT * FROM fields WHERE id = ?",
      [req.params.id]
    );

    if (field.length === 0) {
      return res.status(404).json({
        success: false,
        message: "场地不存在",
      });
    }

    // 检查时间段是否已被预订
    const [existingReservations] = await req.app.locals.db.query(
      `SELECT * FROM reservations 
       WHERE field_id = ? 
       AND reservation_date = ? 
       AND status != 'cancelled'
       AND (
         (start_time <= ? AND end_time > ?) OR
         (start_time < ? AND end_time >= ?) OR
         (start_time >= ? AND end_time <= ?)
       )`,
      [
        req.params.id,
        reservation_date,
        end_time,
        start_time,
        end_time,
        start_time,
        start_time,
        end_time,
      ]
    );

    if (existingReservations.length > 0) {
      return res.status(400).json({
        success: false,
        message: "该时间段已被预订",
      });
    }

    // 创建预订记录
    const [result] = await req.app.locals.db.query(
      `INSERT INTO reservations 
       (user_id, field_id, reservation_date, start_time, end_time, status) 
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [userId, req.params.id, reservation_date, start_time, end_time]
    );

    res.json({
      success: true,
      data: {
        reservationId: result.insertId,
      },
    });
  } catch (error) {
    console.error("预订场地失败:", error);
    res.status(500).json({
      success: false,
      message: "预订场地失败",
    });
  }
});

// 获取用户的预订列表
router.get("/user/my-reservations", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "未登录",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const [reservations] = await req.app.locals.db.query(
      `SELECT r.*, f.name as field_name, f.location 
       FROM reservations r 
       JOIN fields f ON r.field_id = f.id 
       WHERE r.user_id = ? 
       ORDER BY r.reservation_date DESC, r.start_time DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: reservations,
    });
  } catch (error) {
    console.error("获取用户预订列表失败:", error);
    res.status(500).json({
      success: false,
      message: "获取用户预订列表失败",
    });
  }
});

// 取消预订
router.post("/reservations/:id/cancel", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "未登录",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    // 验证预订是否属于当前用户
    const [reservation] = await req.app.locals.db.query(
      "SELECT * FROM reservations WHERE id = ? AND user_id = ?",
      [req.params.id, userId]
    );

    if (reservation.length === 0) {
      return res.status(404).json({
        success: false,
        message: "预订不存在或无权限取消",
      });
    }

    // 更新预订状态
    await req.app.locals.db.query(
      "UPDATE reservations SET status = 'cancelled' WHERE id = ?",
      [req.params.id]
    );

    res.json({
      success: true,
      message: "预订已取消",
    });
  } catch (error) {
    console.error("取消预订失败:", error);
    res.status(500).json({
      success: false,
      message: "取消预订失败",
    });
  }
});

module.exports = router;
