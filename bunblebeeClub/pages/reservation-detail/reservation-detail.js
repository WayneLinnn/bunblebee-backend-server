// pages/reservation-detail/reservation-detail.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    reservation: null,
    isLoading: true,
    statusText: "",
    statusClass: "",
    fields: [],
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 初始化云环境
    wx.cloud.init({
      env: "prod-4gv7hplz5e8dc437",
    });

    // 获取预订ID
    const { id } = options;
    this.reservationId = id; // 保存ID便于刷新使用

    if (!id) {
      wx.showToast({
        title: "缺少预订ID",
        icon: "none",
      });
      this.setData({ isLoading: false });
      return;
    }

    // 先获取场地信息
    this.fetchFields();

    // 获取预订详情
    this.fetchReservationDetail(id);
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 如果有预订ID，则刷新数据
    if (this.reservationId) {
      this.fetchReservationDetail(this.reservationId);
    }

    // 设置自动刷新
    this.startAutoRefresh();
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    // 清除自动刷新
    this.stopAutoRefresh();
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    // 清除自动刷新
    this.stopAutoRefresh();
  },

  /**
   * 开始自动刷新
   */
  startAutoRefresh() {
    // 清除可能存在的计时器
    this.stopAutoRefresh();

    // 每30秒刷新一次数据
    this.refreshTimer = setInterval(() => {
      console.log("自动刷新预订详情");
      if (this.reservationId) {
        this.fetchReservationDetail(this.reservationId);
      }
    }, 30000); // 30秒
  },

  /**
   * 停止自动刷新
   */
  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  },

  /**
   * 获取场地信息
   */
  fetchFields() {
    const token = wx.getStorageSync("token");
    if (!token) return;

    wx.cloud.callContainer({
      path: "/fields",
      header: {
        "X-WX-SERVICE": "bunblebee-back",
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "GET",
      success: (res) => {
        if (res.data.success) {
          this.setData({
            fields: res.data.data || [],
          });
        }
      },
    });
  },

  /**
   * 获取预订详情
   */
  fetchReservationDetail(id) {
    const token = wx.getStorageSync("token");
    if (!token) {
      wx.showToast({
        title: "请先登录",
        icon: "none",
      });
      this.setData({ isLoading: false });
      return;
    }

    wx.cloud.callContainer({
      path: `/fields/reservations/${id}`,
      header: {
        "X-WX-SERVICE": "bunblebee-back",
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "GET",
      success: (res) => {
        if (res.data.success) {
          // 处理预订数据
          const reservation = this.processReservation(res.data.data);

          // 设置状态信息
          this.setPageStatus(reservation);

          this.setData({
            reservation,
            isLoading: false,
          });
        } else {
          wx.showToast({
            title: res.data.message || "获取预订详情失败",
            icon: "none",
          });
          this.setData({ isLoading: false });
        }
      },
      fail: (err) => {
        console.error("获取预订详情失败:", err);
        wx.showToast({
          title: "获取预订详情失败",
          icon: "none",
        });
        this.setData({ isLoading: false });
      },
    });
  },

  /**
   * 处理预订数据
   */
  processReservation(reservation) {
    if (!reservation) return null;

    // 查找场地信息
    const field = this.findFieldById(reservation.field_id);

    // 获取当前日期（不包含时间）
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 检查预订是否已过期
    const reservationDate = new Date(reservation.reservation_date);
    const isExpired =
      reservationDate < today && reservation.status === "confirmed";

    // 格式化日期
    const formattedReservation = {
      ...reservation,
      reservation_date: this.formatDate(reservation.reservation_date),
      created_at: this.formatDateTime(reservation.created_at),
      field_name: field ? field.name : `场地 ${reservation.field_id}`,
      field_location: field ? field.location : "",
      isExpired,
      // 只有在未过期且状态为pending或confirmed时才能取消
      canCancel:
        ["pending", "confirmed"].includes(reservation.status) && !isExpired,
    };

    return formattedReservation;
  },

  /**
   * 根据场地ID查找场地信息
   */
  findFieldById(fieldId) {
    return this.data.fields.find((field) => field.id === fieldId);
  },

  /**
   * 获取状态文本
   */
  getStatusText(status) {
    const statusMap = {
      pending: "待确认",
      confirmed: "已确认",
      cancelled: "已取消",
    };
    return statusMap[status] || status;
  },

  /**
   * 获取状态样式类
   */
  getStatusClass(status) {
    const classMap = {
      pending: "status-pending",
      confirmed: "status-confirmed",
      cancelled: "status-cancelled",
    };
    return classMap[status] || "";
  },

  /**
   * 设置页面状态
   */
  setPageStatus(reservation) {
    // 处理预订状态
    let statusText = this.getStatusText(reservation.status);
    let statusClass = this.getStatusClass(reservation.status);

    // 如果预订已过期，修改状态显示
    if (reservation.isExpired) {
      statusText = "已过期";
      statusClass = "status-expired";
    }

    this.setData({
      statusText,
      statusClass,
    });
  },

  /**
   * 取消预订
   */
  handleCancelReservation() {
    if (!this.data.reservation) return;

    wx.showModal({
      title: "确认取消",
      content: "您确定要取消这个预订吗？",
      success: (res) => {
        if (res.confirm) {
          this.cancelReservation(this.data.reservation.id);
        }
      },
    });
  },

  /**
   * 发送取消预订请求
   */
  cancelReservation(id) {
    const token = wx.getStorageSync("token");
    if (!token) return;

    wx.showLoading({
      title: "取消中...",
      mask: true,
    });

    wx.cloud.callContainer({
      path: `/fields/reservations/${id}/cancel`,
      header: {
        "X-WX-SERVICE": "bunblebee-back",
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "POST",
      success: (res) => {
        if (res.data.success) {
          wx.showToast({
            title: "取消成功",
            icon: "success",
          });
          // 更新预订状态
          this.fetchReservationDetail(id);
        } else {
          wx.showToast({
            title: res.data.message || "取消失败",
            icon: "none",
          });
        }
      },
      fail: (err) => {
        console.error("取消预订失败:", err);
        wx.showToast({
          title: "取消失败，请重试",
          icon: "none",
        });
      },
      complete: () => {
        wx.hideLoading();
      },
    });
  },

  /**
   * 返回上一页
   */
  navigateBack() {
    wx.navigateBack();
  },

  /**
   * 格式化日期
   */
  formatDate(dateStr) {
    if (!dateStr) return "";

    try {
      const date = new Date(dateStr);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();

      return `${year}年${month}月${day}日`;
    } catch (e) {
      return dateStr;
    }
  },

  /**
   * 格式化日期时间
   */
  formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return "";

    try {
      const date = new Date(dateTimeStr);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");

      return `${year}/${month}/${day} ${hours}:${minutes}`;
    } catch (e) {
      return dateTimeStr;
    }
  },
});
