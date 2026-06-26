Page({
  // 保存任务的 _id 和详细信息
  data: {
    _id: '',
    mission: null,
    dateStr: '',
    timeStr: '',
    creditPercent: 0,
    from: '',
    to: '',
    maxCredit: getApp().globalData.maxCredit,
    list: getApp().globalData.collectionMissionList,

    // === 订单型任务 ===
    isOrder: false,                 // 是否订单视图
    currentOpenid: '',
    userA: getApp().globalData.userA,
    userB: getApp().globalData.userB,
    _openidA: getApp().globalData._openidA,
    _openidB: getApp().globalData._openidB,
    cookerNamesText: '',            // 厨师姓名拼接
    orderStatus: '',                // ordered / completed
  },

  onLoad(options) {
    if (options.id !== undefined) {
      this.setData({
        _id: options.id
      })
    }
  },

  getDate(dateStr){
    const milliseconds = Date.parse(dateStr)
    const date = new Date()
    date.setTime(milliseconds)
    return date
  },

  // 根据 _id 值查询并显示任务
  async onShow() {
    if (this.data._id.length > 0) {
      // 取当前用户 openid
      await wx.cloud.callFunction({ name: 'getOpenId' }).then(res => {
        this.setData({ currentOpenid: res.result });
      }).catch(() => {});

      // 根据 _id 拿到任务
      await wx.cloud.callFunction({name: 'getElementById', data: this.data}).then(data => {
        const mission = data.result.data[0];
        const isOrder = mission && mission.type === 'order';

        // 关系描述
        let from = '', to = '';
        if (mission._openid === getApp().globalData._openidA) {
          from = getApp().globalData.userA;
          to = getApp().globalData.userB;
        } else if (mission._openid === getApp().globalData._openidB) {
          from = getApp().globalData.userB;
          to = getApp().globalData.userA;
        }

        // 厨师姓名拼接
        let cookerNamesText = '';
        if (isOrder && Array.isArray(mission.cookerNames)) {
          cookerNamesText = mission.cookerNames.join('、');
        }

        this.setData({
          mission,
          dateStr: this.getDate(mission.date).toDateString(),
          timeStr: this.getDate(mission.date).toTimeString(),
          creditPercent: (mission.credit / getApp().globalData.maxCredit) * 100,
          from,
          to,
          isOrder,
          cookerNamesText,
          orderStatus: mission.orderStatus || (isOrder ? 'ordered' : '')
        })
      })
    }
  },

  // 完成订单型任务：标记 available=false + orderStatus=completed
  async finishOrder() {
    if (!this.data.isOrder) return;
    if (this.data.orderStatus === 'completed') {
      wx.showToast({ title: '订单已完成', icon: 'none' });
      return;
    }
    if (this.data.mission._openid !== this.data.currentOpenid) {
      wx.showToast({ title: '只有下单者可以确认完成', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中...', mask: true });
    try {
      await wx.cloud.callFunction({
        name: 'editAvailable',
        data: { _id: this.data._id, list: this.data.list, value: false }
      });
      await wx.cloud.callFunction({
        name: 'editAvailable',
        data: { _id: this.data._id, list: this.data.list, field: 'orderStatus', value: 'completed' }
      });

      // 本地刷新
      const mission = { ...this.data.mission, available: false, orderStatus: 'completed' };
      this.setData({ mission, orderStatus: 'completed' });

      wx.hideLoading();
      wx.showToast({ title: '订单已完成', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      console.error('完成订单失败', err);
      wx.showToast({ title: '操作失败', icon: 'error' });
    }
  },
})