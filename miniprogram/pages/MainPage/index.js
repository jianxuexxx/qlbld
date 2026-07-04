/* Main page of the app */
Page({
  data: {
    creditA: 0,
    creditB: 0,
    userA: '',
    userB: '',
    subscribed: false,
    requestSubscribeMessageResult: ''
  },

  async onShow() {
    const app = getApp();
    const subs = app.globalData.subscribedActions || {};
    this.setData({
      subscribed: Object.keys(subs).length > 0
    });
    this.getCreditA();
    this.getCreditB();
  },

  // 点击订阅按钮
  async onTapSubscribe() {
    const app = getApp();
    wx.showLoading({ title: '请求授权中…', mask: true });
    const accepted = await app.requestSubscribe('main');
    wx.hideLoading();
    if (accepted) {
      this.setData({ subscribed: true, requestSubscribeMessageResult: '成功' });
      wx.showToast({ title: '订阅成功 🎉', icon: 'success' });
    } else {
      this.setData({ requestSubscribeMessageResult: '失败（未同意）' });
      wx.showToast({ title: '订阅被拒绝', icon: 'none' });
    }
  },

  getCreditA() {
    wx.cloud.callFunction({ name: 'getElementByOpenId', data: { list: getApp().globalData.collectionUserList, _openid: getApp().globalData._openidA } })
      .then(res => {
        this.setData({ creditA: (res.result.data && res.result.data[0] && res.result.data[0].credit) || 0 });
      }).catch(() => {});
  },

  getCreditB() {
    wx.cloud.callFunction({ name: 'getElementByOpenId', data: { list: getApp().globalData.collectionUserList, _openid: getApp().globalData._openidB } })
      .then(res => {
        this.setData({ creditB: (res.result.data && res.result.data[0] && res.result.data[0].credit) || 0 });
      }).catch(() => {});
  },
});
