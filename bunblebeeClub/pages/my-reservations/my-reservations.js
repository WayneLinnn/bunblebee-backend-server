// pages/my-reservations/my-reservations.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    reservations: [],
    isLoading: true,
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

    this.fetchFields();
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {},

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    this.fetchReservations();

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
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    this.fetchReservations();
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {},

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {},

  /**
   * 返回上一页
   */
  navigateBack() {
    wx.navigateBack();
  },

  // 获取场地信息
  fetchFields() {
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

          // 获取预订信息
          this.fetchReservations();
        } else {
          this.setData({ isLoading: false });
        }
      },
      fail: (err) => {
        console.error("获取场地失败:", err);
        this.setData({ isLoading: false });
      },
    });
  },

  // 获取用户的预订列表
  async fetchReservations() {
    try {
      this.setData({ isLoading: true });
      const token = wx.getStorageSync("token");
      if (!token) {
        wx.showToast({
          title: "请先登录",
          icon: "none",
        });
        this.setData({ isLoading: false });
        wx.stopPullDownRefresh();
        return;
      }

      const response = await wx.cloud.callContainer({
        path: "/fields/user/my-reservations",
        header: {
          "X-WX-SERVICE": "bunblebee-back",
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        method: "GET",
      });

      if (response.data.success) {
        console.log("成功获取预订列表:", response.data.data);

        // 处理并排序预订数据
        const processedReservations = this.processReservations(
          response.data.data
        );
        const sortedReservations = this.sortReservations(processedReservations);

        // 将预订分为未来预订和历史预订
        const upcomingReservations = sortedReservations.filter(
          (r) => !r.isExpired && r.status !== "cancelled"
        );
        const historyReservations = sortedReservations.filter(
          (r) => r.isExpired || r.status === "cancelled"
        );

        // 设置数据
        this.setData({
          reservations: sortedReservations,
          upcomingReservations,
          historyReservations,
          hasUpcoming: upcomingReservations.length > 0,
          hasHistory: historyReservations.length > 0,
          isLoading: false,
        });
      } else {
        console.error("获取预订列表失败:", response.data.message);
        wx.showToast({
          title: response.data.message || "获取预订列表失败",
          icon: "none",
        });
        this.setData({ isLoading: false });
      }
    } catch (error) {
      console.error("获取预订列表出错:", error);
      wx.showToast({
        title: "获取预订列表出错，请稍后再试",
        icon: "none",
      });
      this.setData({ isLoading: false });
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  // 处理预订数据
  processReservations(data) {
    if (!Array.isArray(data)) return [];

    // 获取当前日期（不包含时间）
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return data.map((item) => {
      // 格式化状态显示
      let statusText = "";
      let statusClass = "";

      switch (item.status) {
        case "pending":
          statusText = "待确认";
          statusClass = "status-pending";
          break;
        case "confirmed":
          statusText = "已确认";
          statusClass = "status-confirmed";
          break;
        case "cancelled":
          statusText = "已取消";
          statusClass = "status-cancelled";
          break;
        default:
          statusText = "未知状态";
          statusClass = "status-unknown";
      }

      // 日期和时间格式化处理
      let formattedDate = item.reservation_date || "未知日期";
      let originalDate = null;
      if (
        !formattedDate.includes("年") &&
        !isNaN(new Date(formattedDate).getTime())
      ) {
        originalDate = new Date(formattedDate);
        formattedDate = `${originalDate.getFullYear()}年${
          originalDate.getMonth() + 1
        }月${originalDate.getDate()}日`;
      } else if (formattedDate.includes("年")) {
        // 如果已经格式化过，解析回Date对象用于比较
        originalDate = new Date(
          formattedDate.replace(/年|月/g, "-").replace("日", "")
        );
      }

      // 检查预订是否已过期
      const isExpired = originalDate && originalDate < today;

      // 如果预订已过期并且状态是"已确认"，添加"已过期"标记
      if (isExpired && item.status === "confirmed") {
        statusText = "已过期";
        statusClass = "status-expired";
      }

      // 返回处理后的预订项
      return {
        ...item,
        statusText,
        statusClass,
        reservation_date: formattedDate,
        canCancel: ["pending", "confirmed"].includes(item.status) && !isExpired,
        isExpired,
      };
    });
  },

  // 根据场地ID查找场地信息
  findFieldById(fieldId) {
    return this.data.fields.find((field) => field.id === fieldId);
  },

  // 获取状态文本
  getStatusText(status) {
    const statusMap = {
      pending: "待确认",
      confirmed: "已确认",
      cancelled: "已取消",
    };
    return statusMap[status] || status;
  },

  // 获取状态样式类
  getStatusClass(status) {
    const classMap = {
      pending: "status-pending",
      confirmed: "status-confirmed",
      cancelled: "status-cancelled",
    };
    return classMap[status] || "";
  },

  // 取消预订
  handleCancelReservation(e) {
    const reservationId = e.currentTarget.dataset.id;

    wx.showModal({
      title: "确认取消",
      content: "您确定要取消这个预订吗？",
      success: (res) => {
        if (res.confirm) {
          this.cancelReservation(reservationId);
        }
      },
    });
  },

  // 发送取消预订请求
  cancelReservation(reservationId) {
    const token = wx.getStorageSync("token");
    if (!token) return;

    wx.showLoading({
      title: "取消中...",
      mask: true,
    });

    wx.cloud.callContainer({
      path: `/fields/reservations/${reservationId}/cancel`,
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
          // 重新获取预订列表
          this.fetchReservations();
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

  // 跳转到预订页面
  navigateToBooking() {
    wx.navigateTo({
      url: "/pages/field-booking/field-booking",
    });
  },

  // 跳转到预订详情页
  navigateToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/reservation-detail/reservation-detail?id=${id}`,
    });
  },

  // 格式化日期
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

  // 格式化日期时间
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

  // 将时间转换为分钟数
  timeToMinutes(timeString) {
    if (!timeString) return 0;
    const [hours, minutes] = timeString.split(":").map(Number);
    return hours * 60 + minutes;
  },

  // 对预订进行排序：按状态（待确认>已确认>已取消）和日期时间排序
  sortReservations(reservations) {
    if (!Array.isArray(reservations)) return [];

    // 获取当前日期（不包含时间）
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 状态优先级
    const statusPriority = {
      pending: 0,
      confirmed: 1,
      cancelled: 2,
      unknown: 3,
    };

    return [...reservations].sort((a, b) => {
      // 首先按状态排序
      const statusA = a.status || "unknown";
      const statusB = b.status || "unknown";

      if (statusPriority[statusA] !== statusPriority[statusB]) {
        return statusPriority[statusA] - statusPriority[statusB];
      }

      // 解析日期
      const dateA = new Date(
        a.reservation_date.replace(/年|月/g, "-").replace("日", "")
      );
      const dateB = new Date(
        b.reservation_date.replace(/年|月/g, "-").replace("日", "")
      );

      // 判断预订是否已过期（预订日期早于今天）
      const isExpiredA = dateA < today;
      const isExpiredB = dateB < today;

      // 如果一个已过期而另一个未过期，则未过期的优先显示
      if (isExpiredA !== isExpiredB) {
        return isExpiredA ? 1 : -1;
      }

      // 如果都未过期，按日期从近到远排序
      // 如果都已过期，按日期从远到近排序（最近的过期预订排在前面）
      if (dateA.getTime() !== dateB.getTime()) {
        return isExpiredA
          ? dateB.getTime() - dateA.getTime() // 已过期，降序
          : dateA.getTime() - dateB.getTime(); // 未过期，升序
      }

      // 最后按时间排序
      const timeA = this.timeToMinutes(a.start_time);
      const timeB = this.timeToMinutes(b.start_time);
      return timeA - timeB;
    });
  },

  /**
   * 开始自动刷新
   */
  startAutoRefresh() {
    // 清除可能存在的计时器
    this.stopAutoRefresh();

    // 每60秒刷新一次数据
    this.refreshTimer = setInterval(() => {
      console.log("自动刷新预订列表");
      this.fetchReservations();
    }, 60000); // 60秒
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
});
