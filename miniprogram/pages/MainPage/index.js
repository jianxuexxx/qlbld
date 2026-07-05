/* Main page of the app */
Page({
  data: {
    creditA: 0,
    creditB: 0,
    userA: '',
    userB: '',
    currentOpenid: '',
    currentUser: '',
    subscribed: false,
    requestSubscribeMessageResult: ''
  },

  async onShow() {
    const app = getApp();
    const subs = app.globalData.subscribedActions || {};
    console.log('[MainPage onShow] start, before refresh: userA=', app.globalData.userA, 'userB=', app.globalData.userB);
    // 每次 onShow 都同步一次真实用户名
    await (app.refreshUserNames && app.refreshUserNames());
    console.log('[MainPage onShow] after refresh: userA=', app.globalData.userA, 'userB=', app.globalData.userB);
    // 当前登录者 openid + 名字
    let currentOpenid = '';
    let currentUser = '';
    try {
      const r = await wx.cloud.callFunction({ name: 'getOpenId' });
      currentOpenid = (r && r.result) || '';
      const g = app.globalData;
      if (currentOpenid === g._openidA) currentUser = g.userA;
      else if (currentOpenid === g._openidB) currentUser = g.userB;
      else currentUser = '未知用户';
    } catch (e) {}
    console.log('[MainPage onShow] setData: userA=', app.globalData.userA, 'userB=', app.globalData.userB, 'currentUser=', currentUser);
    this.setData({
      userA: app.globalData.userA,
      userB: app.globalData.userB,
      currentOpenid,
      currentUser,
      subscribed: Object.keys(subs).length > 0
    });
    this.getCreditA();
    this.getCreditB();
  },

  // 刷新 userA/userB（拉 UserList -> 写入 globalData -> 同步页面）
  async refreshUserNames() {
    const app = getApp();
    await (app.refreshUserNames && app.refreshUserNames());
    this.setData({
      userA: app.globalData.userA,
      userB: app.globalData.userB
    });
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
