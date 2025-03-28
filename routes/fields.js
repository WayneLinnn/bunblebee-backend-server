const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

// 存储SSE客户端连接
const SSE_CLIENTS = new Map();

// 用于通知预订变化的函数
function notifyReservationChange(fieldId, date) {
  // 构建客户端标识
  const clientKey = `field_${fieldId}_${date}`;
  const clients = SSE_CLIENTS.get(clientKey) || [];

  if (clients.length > 0) {
    console.log(
      `通知 ${clients.length} 个客户端场地 ${fieldId} 在 ${date} 的预订变化`
    );

    // 构建事件数据
    const eventData = JSON.stringify({
      type: "reservation_change",
      fieldId,
      date,
      timestamp: new Date().toISOString(),
    });

    // 向所有关注该场地和日期的客户端发送通知
    clients.forEach((client) => {
      client.res.write(`data: ${eventData}\n\n`);
    });
  }
}

// SSE连接端点
router.get("/:id/sse", async (req, res) => {
  const fieldId = req.params.id;
  const { date } = req.query;

  if (!fieldId || !date) {
    return res.status(400).json({
      success: false,
      message: "场地ID和日期必须提供",
    });
  }

  // 设置SSE响应头
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // Nginx特定配置
  });

  // 初始连接确认
  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

  // 生成客户端ID
  const clientId = Date.now().toString();

  // 构建客户端标识
  const clientKey = `field_${fieldId}_${date}`;

  // 将客户端添加到映射
  if (!SSE_CLIENTS.has(clientKey)) {
    SSE_CLIENTS.set(clientKey, []);
  }

  const clientInfo = {
    id: clientId,
    res,
  };

  SSE_CLIENTS.get(clientKey).push(clientInfo);
  console.log(
    `客户端 ${clientId} 已连接到场地 ${fieldId} 在 ${date} 的实时更新`
  );

  // 设置ping间隔以保持连接
  const pingInterval = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 30000);

  // 监听连接关闭
  req.on("close", () => {
    clearInterval(pingInterval);

    // 从映射中移除客户端
    const clients = SSE_CLIENTS.get(clientKey) || [];
    const updatedClients = clients.filter((client) => client.id !== clientId);

    if (updatedClients.length > 0) {
      SSE_CLIENTS.set(clientKey, updatedClients);
    } else {
      SSE_CLIENTS.delete(clientKey);
    }

    console.log(`客户端 ${clientId} 已断开连接`);
  });
});

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
       VALUES (?, ?, ?, ?, ?, 'confirmed')`,
      [userId, req.params.id, reservation_date, start_time, end_time]
    );

    // 通知预订变化
    notifyReservationChange(req.params.id, reservation_date);

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

    // 通知预订变化
    notifyReservationChange(
      reservation[0].field_id,
      reservation[0].reservation_date
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

// 获取特定场地和日期的所有预订信息
router.get("/:id/reservations", async (req, res) => {
  try {
    const { date } = req.query;
    const fieldId = req.params.id;

    if (!date || !fieldId) {
      return res.status(400).json({
        success: false,
        message: "场地ID和日期必须提供",
      });
    }

    // 验证日期格式
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        success: false,
        message: "日期格式不正确，请使用YYYY-MM-DD格式",
      });
    }

    // 查询该日期所有预订
    const [reservations] = await req.app.locals.db.query(
      `SELECT r.id, r.user_id, r.field_id, r.reservation_date, 
       r.start_time, r.end_time, r.status, r.created_at,
       u.nickname as user_name, u.avatar_url
       FROM reservations r
       JOIN users u ON r.user_id = u.id
       WHERE r.field_id = ? 
       AND r.reservation_date = ?
       AND r.status != 'cancelled'
       ORDER BY r.start_time ASC`,
      [fieldId, date]
    );

    // 查询场地信息
    const [field] = await req.app.locals.db.query(
      "SELECT * FROM fields WHERE id = ?",
      [fieldId]
    );

    if (field.length === 0) {
      return res.status(404).json({
        success: false,
        message: "场地不存在",
      });
    }

    res.json({
      success: true,
      data: {
        field: field[0],
        date,
        reservations,
      },
    });
  } catch (error) {
    console.error("获取预订信息失败:", error);
    res.status(500).json({
      success: false,
      message: "获取预订信息失败: " + error.message,
    });
  }
});

// 预订锁定（临时锁定场地时段）
router.post("/:id/lock", async (req, res) => {
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
    const fieldId = req.params.id;

    if (!reservation_date || !start_time || !end_time || !fieldId) {
      return res.status(400).json({
        success: false,
        message: "缺少必要参数",
      });
    }

    // 检查场地是否存在
    const [field] = await req.app.locals.db.query(
      "SELECT * FROM fields WHERE id = ?",
      [fieldId]
    );

    if (field.length === 0) {
      return res.status(404).json({
        success: false,
        message: "场地不存在",
      });
    }

    // 检查时间段是否已被预订或锁定
    const [existingReservations] = await req.app.locals.db.query(
      `SELECT * FROM reservations 
       WHERE field_id = ? 
       AND reservation_date = ? 
       AND status IN ('pending', 'confirmed', 'locked')
       AND (
         (start_time <= ? AND end_time > ?) OR
         (start_time < ? AND end_time >= ?) OR
         (start_time >= ? AND end_time <= ?)
       )`,
      [
        fieldId,
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
        message: "该时间段已被预订或锁定",
      });
    }

    // 创建锁定记录，设置5分钟后过期
    const [result] = await req.app.locals.db.query(
      `INSERT INTO reservations 
       (user_id, field_id, reservation_date, start_time, end_time, status) 
       VALUES (?, ?, ?, ?, ?, 'locked')`,
      [userId, fieldId, reservation_date, start_time, end_time]
    );

    const lockId = result.insertId;

    // 设置5分钟后自动释放锁定
    setTimeout(async () => {
      try {
        // 检查该锁定是否仍为locked状态，如果是则释放
        const [lockRecord] = await req.app.locals.db.query(
          "SELECT * FROM reservations WHERE id = ? AND status = 'locked'",
          [lockId]
        );

        if (lockRecord.length > 0) {
          await req.app.locals.db.query(
            "UPDATE reservations SET status = 'cancelled' WHERE id = ?",
            [lockId]
          );
          console.log(`自动释放锁定: ${lockId}`);

          // 这里可以添加通知机制，如WebSocket广播
          notifyReservationChange(fieldId, reservation_date);
        }
      } catch (err) {
        console.error("自动释放锁定失败:", err);
      }
    }, 5 * 60 * 1000); // 5分钟后自动释放

    res.json({
      success: true,
      data: {
        lockId,
        expiresIn: 5 * 60, // 返回过期时间（秒）
      },
      message: "场地已锁定，请在5分钟内完成预订",
    });
  } catch (error) {
    console.error("锁定场地失败:", error);
    res.status(500).json({
      success: false,
      message: "锁定场地失败: " + error.message,
    });
  }
});

// 取消锁定
router.post("/locks/:id/cancel", async (req, res) => {
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
    const lockId = req.params.id;

    // 验证锁定是否属于当前用户
    const [lock] = await req.app.locals.db.query(
      "SELECT * FROM reservations WHERE id = ? AND user_id = ? AND status = 'locked'",
      [lockId, userId]
    );

    if (lock.length === 0) {
      return res.status(404).json({
        success: false,
        message: "锁定不存在或无权限取消",
      });
    }

    // 更新锁定状态为取消
    await req.app.locals.db.query(
      "UPDATE reservations SET status = 'cancelled' WHERE id = ?",
      [lockId]
    );

    // 通知其他用户锁定已释放
    notifyReservationChange(lock[0].field_id, lock[0].reservation_date);

    res.json({
      success: true,
      message: "锁定已取消",
    });
  } catch (error) {
    console.error("取消锁定失败:", error);
    res.status(500).json({
      success: false,
      message: "取消锁定失败: " + error.message,
    });
  }
});

// 将锁定转为正式预订
router.post("/locks/:id/confirm", async (req, res) => {
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
    const lockId = req.params.id;

    // 验证锁定是否属于当前用户
    const [lock] = await req.app.locals.db.query(
      "SELECT * FROM reservations WHERE id = ? AND user_id = ? AND status = 'locked'",
      [lockId, userId]
    );

    if (lock.length === 0) {
      return res.status(404).json({
        success: false,
        message: "锁定不存在或无权限确认",
      });
    }

    // 更新锁定状态为已确认
    await req.app.locals.db.query(
      "UPDATE reservations SET status = 'confirmed' WHERE id = ?",
      [lockId]
    );

    // 通知预订确认
    notifyReservationChange(lock[0].field_id, lock[0].reservation_date);

    res.json({
      success: true,
      data: {
        reservationId: lockId,
      },
      message: "预订已确认",
    });
  } catch (error) {
    console.error("确认预订失败:", error);
    res.status(500).json({
      success: false,
      message: "确认预订失败: " + error.message,
    });
  }
});

module.exports = router;
