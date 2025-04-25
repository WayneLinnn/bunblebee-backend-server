Page({
  data: {
    fieldId: null,
    date: "",
    startTime: "",
    endTime: "",
    field: null,
    totalPrice: 0,
    duration: 30, // 默认30分钟
  },

  onLoad(options) {
    // 初始化云环境
    wx.cloud.init({
      env: "prod-4gv7hplz5e8dc437",
    });

    const { fieldId, date, time } = options;

    // 计算结束时间（默认30分钟）
    const [hour, minute] = time.split(":");
    const startDate = new Date();
    startDate.setHours(parseInt(hour));
    startDate.setMinutes(parseInt(minute));

    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + 30);

    const endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(
      endDate.getMinutes()
    ).padStart(2, "0")}`;

    // 获取场地信息
    const fields = [
      {
        id: 1,
        name: "5V5 足球场",
        location: "主场地区域 A",
        price_per_hour: 200.0,
      },
      {
        id: 2,
        name: "8V8 足球场",
        location: "主场地区域 B",
        price_per_hour: 300.0,
      },
    ];

    const field = fields.find((f) => f.id === parseInt(fieldId));
    const totalPrice = (field.price_per_hour / 60) * 30; // 计算30分钟的价格

    this.setData({
      fieldId: parseInt(fieldId),
      date,
      startTime: time,
      endTime,
      field,
      totalPrice,
    });
  },

  // 创建订单
  handleCreateOrder() {
    const token = wx.getStorageSync("token");
    if (!token) {
      wx.showToast({
        title: "请先登录",
        icon: "none",
      });
      return;
    }

    wx.showLoading({
      title: "创建订单中...",
    });

    wx.cloud.callContainer({
      path: `/fields/${this.data.fieldId}/reserve`,
      header: {
        "X-WX-SERVICE": "bunblebee-back",
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "POST",
      data: {
        reservation_date: this.data.date,
        start_time: this.data.startTime,
        end_time: this.data.endTime,
      },
      success: (res) => {
        if (res.data.success) {
          wx.showToast({
            title: "预订成功",
            icon: "success",
          });

          // 延时返回，以便用户看到成功提示
          setTimeout(() => {
            // 返回场地预订页面，并刷新数据
            const pages = getCurrentPages();
            const prevPage = pages[pages.length - 2]; // 上一个页面

            if (prevPage && prevPage.route.includes("field-booking")) {
              // 如果上一页是场地预订页面，则返回并刷新数据
              // 这会调用场地预订页面的 onShow 方法，进而调用 loadReservations 方法刷新数据
              wx.navigateBack({
                delta: 1,
                success: () => {
                  // 确保数据已刷新
                  if (prevPage.loadReservations) {
                    prevPage.loadReservations();
                  }
                },
              });
            } else {
              // 如果没有上一页或上一页不是场地预订页面，直接跳转到预订列表
              wx.redirectTo({
                url: "/pages/my-bookings/my-bookings",
              });
            }
          }, 1500);
        } else {
          wx.showToast({
            title: res.data.message || "预订失败",
            icon: "none",
          });
        }
      },
      fail: (error) => {
        console.error("创建订单失败:", error);
        wx.showToast({
          title: "创建订单失败",
          icon: "none",
        });
      },
      complete: () => {
        wx.hideLoading();
      },
    });
  },
});
