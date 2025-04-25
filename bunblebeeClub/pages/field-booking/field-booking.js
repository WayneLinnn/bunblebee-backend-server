// pages/field-booking/field-booking.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    isLoading: true,
    fields: [],
    selectedField: null,
    availableDates: [],
    selectedDate: "",
    timeSlots: [],
    selectedTimeSlot: "",
    totalPrice: 0,
    canSubmit: false,
    calculateEndTime: "",
    existingReservations: [],
    showConfirmDialog: false,
    isSubmitting: false,
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
    this.initAvailableDates();
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {},

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    if (this.data.selectedField && this.data.selectedDate) {
      this.fetchReservations();
    }
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {},

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {},

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    this.setData({ isLoading: true });
    this.fetchFields();
    wx.stopPullDownRefresh();
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

  /**
   * 初始化可用日期（只显示今天和明天）
   */
  initAvailableDates() {
    const dates = [];
    const today = new Date();

    // 只生成今天和明天两天的日期
    for (let i = 0; i < 2; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      const value = this.formatDateForAPI(date);
      const displayValue = this.formatDateForDisplay(date);

      let label = i === 0 ? "今天" : "明天";

      dates.push({
        value,
        displayValue,
        label,
      });
    }

    this.setData({
      availableDates: dates,
      selectedDate: dates[0].value,
    });
  },

  /**
   * 初始化时间段（9:00-22:00，每30分钟一个时间段）
   */
  initTimeSlots() {
    const slots = [];
    const startHour = this.data.selectedField.available_from
      ? parseInt(this.data.selectedField.available_from.split(":")[0])
      : 9;
    const endHour = this.data.selectedField.available_to
      ? parseInt(this.data.selectedField.available_to.split(":")[0])
      : 22;

    for (let hour = startHour; hour <= endHour; hour++) {
      // 每小时有两个30分钟的时间段，除了最后一个小时
      if (hour < endHour) {
        slots.push({
          time: `${hour.toString().padStart(2, "0")}:00`,
          isReserved: false,
        });
        slots.push({
          time: `${hour.toString().padStart(2, "0")}:30`,
          isReserved: false,
        });
      } else {
        // 最后一个小时只有整点
        slots.push({
          time: `${hour.toString().padStart(2, "0")}:00`,
          isReserved: false,
        });
      }
    }

    // 标记已预订的时间段
    this.markReservedTimeSlots(slots);

    this.setData({ timeSlots: slots });
  },

  /**
   * 标记已被预订的时间段
   */
  markReservedTimeSlots(slots) {
    if (
      !this.data.existingReservations ||
      !this.data.existingReservations.length
    ) {
      return slots;
    }

    // 为每个时间段检查是否有重叠的预订
    slots.forEach((slot, index) => {
      const slotStartMinutes = this.timeToMinutes(slot.time);
      const slotEndMinutes = slotStartMinutes + 30; // 每个时间段为30分钟

      // 检查是否与任何现有预订重叠
      const isReserved = this.data.existingReservations.some((reservation) => {
        if (reservation.status === "cancelled") return false;

        const reservationStartMinutes = this.timeToMinutes(
          reservation.start_time
        );
        const reservationEndMinutes = this.timeToMinutes(reservation.end_time);

        // 检查重叠条件: 开始时间在预订时间段内，或结束时间在预订时间段内
        return (
          slotStartMinutes < reservationEndMinutes &&
          slotEndMinutes > reservationStartMinutes
        );
      });

      slots[index].isReserved = isReserved;
    });

    return slots;
  },

  /**
   * 获取所有场地
   */
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
          const fields = res.data.data;

          // 确保场地数据有效
          if (fields && fields.length > 0) {
            this.setData({
              fields,
              selectedField: fields[0],
              isLoading: false,
            });

            // 初始化时间段
            this.initTimeSlots();

            // 获取所选场地的预订情况
            this.fetchReservations();
          } else {
            wx.showToast({
              title: "暂无可用场地",
              icon: "none",
            });
            this.setData({ isLoading: false });
          }
        } else {
          wx.showToast({
            title: res.data.message || "获取场地失败",
            icon: "none",
          });
          this.setData({ isLoading: false });
        }
      },
      fail: (err) => {
        console.error("获取场地失败:", err);
        wx.showToast({
          title: "获取场地失败",
          icon: "none",
        });
        this.setData({ isLoading: false });
      },
    });
  },

  /**
   * 获取特定场地和日期的预订
   */
  fetchReservations() {
    if (!this.data.selectedField || !this.data.selectedDate) {
      return;
    }

    this.setData({ isLoading: true });

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
      path: `/fields/${this.data.selectedField.id}/reservations?date=${this.data.selectedDate}`,
      header: {
        "X-WX-SERVICE": "bunblebee-back",
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "GET",
      success: (res) => {
        if (res.data.success) {
          // 获取预订数据
          const reservations =
            res.data.data && res.data.data.reservations
              ? res.data.data.reservations.filter(
                  (r) => r.status !== "cancelled"
                )
              : [];

          this.setData({
            existingReservations: reservations,
            isLoading: false,
          });

          // 重新初始化时间段以标记已预订的时间
          this.initTimeSlots();
        } else {
          wx.showToast({
            title: res.data.message || "获取预订信息失败",
            icon: "none",
          });
          this.setData({ isLoading: false });
        }
      },
      fail: (err) => {
        console.error("获取预订信息失败:", err);
        wx.showToast({
          title: "获取预订信息失败",
          icon: "none",
        });
        this.setData({ isLoading: false });
      },
    });
  },

  /**
   * 处理场地选择
   */
  handleFieldSelect(e) {
    const field = e.currentTarget.dataset.field;

    if (this.data.selectedField && this.data.selectedField.id === field.id) {
      return; // 已经选中该场地
    }

    // 更新选中的场地
    this.setData({
      selectedField: field,
      selectedTimeSlot: "", // 清除时间选择
      totalPrice: 0,
      canSubmit: false,
    });

    // 获取新选场地的预订情况
    this.fetchReservations();
  },

  /**
   * 处理日期选择
   */
  handleDateSelect(e) {
    const date = e.currentTarget.dataset.date;

    if (this.data.selectedDate === date) {
      return; // 已经选中该日期
    }

    // 更新选中的日期
    this.setData({
      selectedDate: date,
      selectedTimeSlot: "", // 清除时间选择
      totalPrice: 0,
      canSubmit: false,
    });

    // 获取新选日期的预订情况
    this.fetchReservations();
  },

  /**
   * 处理时间选择
   */
  handleTimeSelect(e) {
    const time = e.currentTarget.dataset.time;

    // 更新选中的时间和可提交状态
    const endTime = this.calculateEndTime(time);

    this.setData({
      selectedTimeSlot: time,
      calculateEndTime: endTime,
      totalPrice: this.calculatePrice(time),
      canSubmit: true,
    });
  },

  /**
   * 显示确认预订弹窗
   */
  showConfirmationDialog() {
    if (!this.data.canSubmit) {
      return;
    }

    this.setData({
      showConfirmDialog: true,
    });
  },

  /**
   * 隐藏确认预订弹窗
   */
  hideConfirmationDialog() {
    this.setData({
      showConfirmDialog: false,
    });
  },

  /**
   * 提交预订
   */
  handleSubmitBooking() {
    // 如果正在提交中，则不重复操作
    if (this.data.isSubmitting) {
      return;
    }

    // 设置提交中状态
    this.setData({
      showConfirmDialog: false,
      isSubmitting: true,
    });

    const token = wx.getStorageSync("token");
    if (!token) {
      wx.showToast({
        title: "请先登录",
        icon: "none",
      });
      this.setData({ isSubmitting: false });
      return;
    }

    // 显示加载状态
    wx.showLoading({
      title: "正在检查...",
      mask: true,
    });

    // 再次检查时间段是否可用（防止他人刚刚预订了该时段）
    this.fetchReservationsBeforeSubmit(() => {
      this.submitReservation();
    });
  },

  /**
   * 预订提交前再次检查时间段
   */
  fetchReservationsBeforeSubmit(callback) {
    const token = wx.getStorageSync("token");

    wx.cloud.callContainer({
      path: `/fields/${this.data.selectedField.id}/reservations?date=${this.data.selectedDate}`,
      header: {
        "X-WX-SERVICE": "bunblebee-back",
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "GET",
      success: (res) => {
        if (res.data.success) {
          // 获取预订数据
          const reservations =
            res.data.data && res.data.data.reservations
              ? res.data.data.reservations
              : [];

          // 检查所选时间段是否已被预订
          const selectedStartMinutes = this.timeToMinutes(
            this.data.selectedTimeSlot
          );
          const selectedEndMinutes = this.timeToMinutes(
            this.data.calculateEndTime
          );

          const isTimeSlotAvailable = !reservations.some((reservation) => {
            if (reservation.status === "cancelled") return false;

            const reservationStartMinutes = this.timeToMinutes(
              reservation.start_time
            );
            const reservationEndMinutes = this.timeToMinutes(
              reservation.end_time
            );

            return (
              selectedStartMinutes < reservationEndMinutes &&
              selectedEndMinutes > reservationStartMinutes
            );
          });

          if (isTimeSlotAvailable) {
            // 时间段可用，继续提交预订
            callback();
          } else {
            // 时间段已被预订，提示用户
            wx.hideLoading();
            this.setData({ isSubmitting: false });
            wx.showModal({
              title: "提示",
              content: "抱歉，该时间段已被其他用户预订，请重新选择时间",
              showCancel: false,
              success: () => {
                // 刷新预订列表
                this.fetchReservations();
              },
            });
          }
        } else {
          wx.hideLoading();
          this.setData({ isSubmitting: false });
          wx.showToast({
            title: res.data.message || "检查时间段失败",
            icon: "none",
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        this.setData({ isSubmitting: false });
        console.error("检查时间段失败:", err);
        wx.showToast({
          title: "网络错误，请重试",
          icon: "none",
        });
      },
    });
  },

  /**
   * 发送预订请求
   */
  submitReservation() {
    const token = wx.getStorageSync("token");

    // 准备预订数据
    const bookingData = {
      field_id: this.data.selectedField.id,
      reservation_date: this.data.selectedDate,
      start_time: this.data.selectedTimeSlot,
      end_time: this.data.calculateEndTime,
      total_price: this.data.totalPrice,
    };

    // 更新加载提示
    wx.showLoading({
      title: "提交中...",
      mask: true,
    });

    // 发送预订请求
    wx.cloud.callContainer({
      path: `/fields/${this.data.selectedField.id}/reserve`,
      header: {
        "X-WX-SERVICE": "bunblebee-back",
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "POST",
      data: bookingData,
      success: (res) => {
        if (res.data.success) {
          wx.showToast({
            title: "预订成功",
            icon: "success",
          });

          // 更新本地数据，将预订时间段标记为已预订
          this.markTimeSlotAsReserved();

          // 延迟跳转到"我的预订"页面
          setTimeout(() => {
            // 保存预订ID以便在预订详情页使用
            const reservationId = res.data.data.reservationId;

            // 直接跳转到预订详情页，可以让用户立即查看预订详情
            wx.navigateTo({
              url: `/pages/reservation-detail/reservation-detail?id=${reservationId}`,
            });
          }, 1500);
        } else {
          wx.showToast({
            title: res.data.message || "预订失败",
            icon: "none",
          });
        }
      },
      fail: (err) => {
        console.error("预订失败:", err);
        wx.showToast({
          title: "预订失败，请重试",
          icon: "none",
        });
      },
      complete: () => {
        wx.hideLoading();
        this.setData({ isSubmitting: false });
      },
    });
  },

  /**
   * 将刚预订的时间段标记为已预订
   */
  markTimeSlotAsReserved() {
    const { timeSlots, selectedTimeSlot, calculateEndTime } = this.data;

    // 创建新的预订记录
    const newReservation = {
      field_id: this.data.selectedField.id,
      start_time: selectedTimeSlot,
      end_time: calculateEndTime,
      status: "confirmed",
    };

    // 添加到现有预订列表
    const existingReservations = [
      ...this.data.existingReservations,
      newReservation,
    ];

    // 更新数据
    this.setData({
      existingReservations,
      selectedTimeSlot: "",
      canSubmit: false,
    });

    // 重新标记时间段
    this.initTimeSlots();
  },

  /**
   * 计算结束时间（开始时间 + 30分钟）
   */
  calculateEndTime(startTime) {
    const [hours, minutes] = startTime.split(":").map(Number);

    let endHours = hours;
    let endMinutes = minutes + 30;

    if (endMinutes >= 60) {
      endHours += 1;
      endMinutes -= 60;
    }

    return `${endHours.toString().padStart(2, "0")}:${endMinutes
      .toString()
      .padStart(2, "0")}`;
  },

  /**
   * 计算价格（基于场地每小时价格，按30分钟计算）
   */
  calculatePrice(startTime) {
    if (!this.data.selectedField || !startTime) {
      return 0;
    }

    // 获取场地每小时价格并计算30分钟价格
    const pricePerHour = parseFloat(this.data.selectedField.price_per_hour);
    const priceFor30Min = pricePerHour / 2;

    return priceFor30Min.toFixed(2);
  },

  /**
   * 将时间转换为从凌晨开始的分钟数
   */
  timeToMinutes(timeStr) {
    if (!timeStr) return 0;

    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  },

  /**
   * 格式化日期为API使用的格式（YYYY-MM-DD）
   */
  formatDateForAPI(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");

    return `${year}-${month}-${day}`;
  },

  /**
   * 格式化日期为显示格式（MM月DD日）
   */
  formatDateForDisplay(date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();

    return `${month}月${day}日`;
  },
});
