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

    const { reservation_date, start_time, end_time, total_price } = req.body;

    if (!reservation_date || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: "预订信息不完整",
        error_code: "INCOMPLETE_DATA",
      });
    }

    // 验证时间是否在场地可用时间内
    const [field] = await req.app.locals.db.query(
      "SELECT * FROM fields WHERE id = ?",
      [req.params.id]
    );

    if (field.length === 0) {
      return res.status(404).json({
        success: false,
        message: "场地不存在",
        error_code: "FIELD_NOT_FOUND",
      });
    }

    // 检查预订日期是否已过期
    const currentDate = new Date();
    const reservationDateObj = new Date(reservation_date);
    if (
      reservationDateObj < currentDate &&
      reservationDateObj.toDateString() !== currentDate.toDateString()
    ) {
      return res.status(400).json({
        success: false,
        message: "不能预订过去的日期",
        error_code: "PAST_DATE",
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
        error_code: "TIME_CONFLICT",
        conflicting_reservation: existingReservations[0].id,
      });
    }

    // 根据场地价格和预订时长计算总价（如果未提供）
    let finalTotalPrice = total_price;
    if (!finalTotalPrice) {
      const startTimeObj = new Date(`2000-01-01T${start_time}`);
      const endTimeObj = new Date(`2000-01-01T${end_time}`);
      const durationHours = (endTimeObj - startTimeObj) / (1000 * 60 * 60);
      finalTotalPrice = field[0].price_per_hour * durationHours;
    }

    // 创建预订记录
    const [result] = await req.app.locals.db.query(
      `INSERT INTO reservations 
       (user_id, field_id, reservation_date, start_time, end_time, status, total_price) 
       VALUES (?, ?, ?, ?, ?, 'confirmed', ?)`,
      [
        userId,
        req.params.id,
        reservation_date,
        start_time,
        end_time,
        finalTotalPrice,
      ]
    );

    // 自动处理预订过期的定时任务
    scheduleReservationExpiry(result.insertId, reservation_date, end_time);

    // 通知预订变化
    notifyReservationChange(req.params.id, reservation_date);

    res.json({
      success: true,
      data: {
        reservationId: result.insertId,
        total_price: finalTotalPrice,
      },
    });
  } catch (error) {
    console.error("预订场地失败:", error);
    res.status(500).json({
      success: false,
      message: "预订场地失败: " + error.message,
      error_code: "RESERVATION_FAILED",
    });
  }
});

// 自动处理预订过期的函数
function scheduleReservationExpiry(reservationId, reservationDate, endTime) {
  const reservationEnd = new Date(`${reservationDate}T${endTime}`);
  const now = new Date();

  if (reservationEnd > now) {
    const timeUntilExpiry = reservationEnd.getTime() - now.getTime();

    // 设置定时器，在预订结束时间后自动标记为过期
    setTimeout(async () => {
      try {
        // 直接使用当前模块中的数据库连接
        const pool = require("../app").locals.db;
        // 更新状态为已过期（这里我们使用 'completed' 作为已完成/过期的状态）
        await pool.query(
          "UPDATE reservations SET status = 'completed' WHERE id = ? AND status = 'confirmed'",
          [reservationId]
        );
        console.log(`预订 ${reservationId} 已自动标记为已完成`);

        // 获取预订信息以便发送通知
        const [reservation] = await pool.query(
          "SELECT field_id, reservation_date FROM reservations WHERE id = ?",
          [reservationId]
        );

        if (reservation.length > 0) {
          // 通知预订已完成
          notifyReservationChange(
            reservation[0].field_id,
            reservation[0].reservation_date
          );
        }
      } catch (err) {
        console.error(`自动标记预订 ${reservationId} 失败:`, err);
      }
    }, timeUntilExpiry);

    console.log(
      `预订 ${reservationId} 将在 ${new Date(
        now.getTime() + timeUntilExpiry
      ).toISOString()} 自动标记为已完成`
    );
  }
}

// 获取用户的预订列表
router.get("/user/my-reservations", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "未登录",
        error_code: "NOT_LOGGED_IN",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    // 获取查询参数
    const { status, sort_by, sort_order, start_date, end_date, limit, offset } =
      req.query;

    // 构建查询条件
    let queryConditions = ["r.user_id = ?"];
    let queryParams = [userId];

    // 按状态过滤
    if (status) {
      // 状态可以是单个或多个（逗号分隔）
      const statusValues = status.split(",").map((s) => s.trim());
      if (statusValues.length > 0) {
        queryConditions.push(
          `r.status IN (${statusValues.map((_) => "?").join(",")})`
        );
        queryParams.push(...statusValues);
      }
    }

    // 按日期范围过滤
    if (start_date) {
      queryConditions.push("r.reservation_date >= ?");
      queryParams.push(start_date);
    }

    if (end_date) {
      queryConditions.push("r.reservation_date <= ?");
      queryParams.push(end_date);
    }

    // 自动检测和处理过期的预订
    const today = new Date().toISOString().split("T")[0]; // 今天的日期，格式为YYYY-MM-DD
    const now = new Date().toTimeString().split(" ")[0]; // 当前时间，格式为HH:MM:SS

    // 更新过期预订的状态
    await req.app.locals.db.query(
      `UPDATE reservations 
       SET status = 'completed' 
       WHERE status = 'confirmed'
       AND (
         (reservation_date < ?) OR 
         (reservation_date = ? AND end_time < ?)
       )`,
      [today, today, now]
    );

    // 构建排序条件
    let orderClause = "r.reservation_date DESC, r.start_time DESC";

    if (sort_by) {
      const validSortFields = [
        "reservation_date",
        "start_time",
        "status",
        "created_at",
      ];
      const sortField = validSortFields.includes(sort_by)
        ? `r.${sort_by}`
        : "r.reservation_date";

      const sortDirection =
        sort_order && sort_order.toUpperCase() === "ASC" ? "ASC" : "DESC";
      orderClause = `${sortField} ${sortDirection}`;
    }

    // 构建分页条件
    const pageLimit = limit ? parseInt(limit) : 20; // 默认每页20条
    const pageOffset = offset ? parseInt(offset) : 0;

    // 构建最终查询
    const query = `
      SELECT r.*, f.name as field_name, f.location, f.price_per_hour
      FROM reservations r 
      JOIN fields f ON r.field_id = f.id 
      WHERE ${queryConditions.join(" AND ")} 
      ORDER BY ${orderClause}
      LIMIT ? OFFSET ?
    `;

    // 添加分页参数
    queryParams.push(pageLimit, pageOffset);

    // 执行查询
    const [reservations] = await req.app.locals.db.query(query, queryParams);

    // 获取符合条件的总记录数（用于分页）
    const [countResult] = await req.app.locals.db.query(
      `SELECT COUNT(*) as total 
       FROM reservations r 
       WHERE ${queryConditions.join(" AND ")}`,
      queryParams.slice(0, -2) // 移除 LIMIT 和 OFFSET 参数
    );

    const total = countResult[0].total;

    // 返回结果
    res.json({
      success: true,
      data: {
        reservations,
        pagination: {
          total,
          limit: pageLimit,
          offset: pageOffset,
          has_more: total > pageOffset + pageLimit,
        },
        filters: {
          status: status || "all",
          date_range: {
            start: start_date || null,
            end: end_date || null,
          },
        },
      },
    });
  } catch (error) {
    console.error("获取用户预订列表失败:", error);
    res.status(500).json({
      success: false,
      message: "获取用户预订列表失败: " + error.message,
      error_code: "FETCH_RESERVATIONS_FAILED",
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
        error_code: "NOT_LOGGED_IN",
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
        error_code: "RESERVATION_NOT_FOUND",
      });
    }

    // 检查是否可以取消预订（例如，不能取消已完成的预订）
    if (reservation[0].status === "completed") {
      return res.status(400).json({
        success: false,
        message: "已完成的预订不能取消",
        error_code: "CANNOT_CANCEL_COMPLETED",
      });
    }

    // 更新预订状态
    await req.app.locals.db.query(
      "UPDATE reservations SET status = 'cancelled' WHERE id = ?",
      [req.params.id]
    );

    // 记录取消操作
    console.log(`用户 ${userId} 取消了预订 ${req.params.id}`);

    // 通知预订变化
    notifyReservationChange(
      reservation[0].field_id,
      reservation[0].reservation_date
    );

    // 向可能在查看同一场地的其他用户发送实时通知
    const notificationMessage = JSON.stringify({
      type: "reservation_cancelled",
      reservation_id: req.params.id,
      field_id: reservation[0].field_id,
      date: reservation[0].reservation_date,
      time_range: `${reservation[0].start_time} - ${reservation[0].end_time}`,
      timestamp: new Date().toISOString(),
    });

    // 查找该场地当天的所有订阅客户端
    const clientKey = `field_${reservation[0].field_id}_${reservation[0].reservation_date}`;
    const clients = SSE_CLIENTS.get(clientKey) || [];

    if (clients.length > 0) {
      console.log(
        `通知 ${clients.length} 个客户端预订 ${req.params.id} 已取消`
      );
      clients.forEach((client) => {
        client.res.write(`data: ${notificationMessage}\n\n`);
      });
    }

    // 返回成功响应
    res.json({
      success: true,
      message: "预订已取消",
      data: {
        reservation_id: req.params.id,
        field_id: reservation[0].field_id,
        date: reservation[0].reservation_date,
      },
    });
  } catch (error) {
    console.error("取消预订失败:", error);
    res.status(500).json({
      success: false,
      message: "取消预订失败: " + error.message,
      error_code: "CANCELLATION_FAILED",
    });
  }
});

// 获取单个预订详情
router.get("/reservations/:id", async (req, res) => {
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

    // 获取预订详情并关联场地信息
    const [reservation] = await req.app.locals.db.query(
      `SELECT r.*, f.name as field_name, f.location, f.price_per_hour 
       FROM reservations r 
       JOIN fields f ON r.field_id = f.id 
       WHERE r.id = ? AND r.user_id = ?`,
      [req.params.id, userId]
    );

    if (reservation.length === 0) {
      return res.status(404).json({
        success: false,
        message: "预订不存在或无权限查看",
        error_code: "RESERVATION_NOT_FOUND",
      });
    }

    // 构建响应数据
    const reservationData = {
      ...reservation[0],
      // 计算时间差(小时)，用于前端展示
      duration_hours:
        (new Date(`2000-01-01T${reservation[0].end_time}`) -
          new Date(`2000-01-01T${reservation[0].start_time}`)) /
        (1000 * 60 * 60),
    };

    // 记录查询日志
    console.log(`用户 ${userId} 查询了预订 ${req.params.id} 的详情`);

    res.json({
      success: true,
      data: reservationData,
    });
  } catch (error) {
    console.error("获取预订详情失败:", error);
    res.status(500).json({
      success: false,
      message: "获取预订详情失败: " + error.message,
      error_code: "INTERNAL_ERROR",
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
