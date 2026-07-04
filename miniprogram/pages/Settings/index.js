// pages/Settings/index.js
const app = getApp();

Page({
  data: {
    userInfo: {
      name: '我',
      avatar: ''
    },
    credit: 0,
    todayLabel: '',
    version: '1.0.0'
  },

  onLoad() {
    this.setData({
      version: (app.globalData && app.globalData.version) || '1.0.0'
    });
    this.refreshUser();
  },

  onShow() {
    this.refreshUser();
  },

  // 拉自己的积分与名称（兼容旧逻辑：credit 在 UserList）
  async refreshUser() {
    try {
      const { _openidA, _openidB, userA, userB, currentOpenid } = app.globalData;
      const openidRes = await wx.cloud.callFunction({ name: 'getOpenId' }).catch(() => null);
      const openid = (openidRes && openidRes.result) || currentOpenid || '';
      const name = openid === _openidA ? userA : (openid === _openidB ? userB : '我');
      this.setData({
        currentOpenid: openid,
        'userInfo.name': name || '我'
      });

      // 加载积分
      const creditRes = await wx.cloud.callFunction({
        name: 'getUserList',
        data: { list: 'UserList' }
      }).catch(() => null);
      let list = (creditRes && creditRes.result && creditRes.result.data) || [];
      // fallback：getUserList 不存在时用通用 getList
      if (!Array.isArray(list) || list.length === 0) {
        try {
          const fb = await wx.cloud.callFunction({ name: 'getList', data: { list: 'UserList' } });
          list = (fb && fb.result && (fb.result.data || fb.result)) || [];
        } catch (_) { list = []; }
      }
      const me = (Array.isArray(list) ? list : []).find(u => u._openid === openid);
      if (me) {
        this.setData({ credit: Number(me.credit) || 0 });
      }
    } catch (e) {
      console.error('Settings refreshUser', e);
    }

    // 今日日期标签
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    this.setData({ todayLabel: `${d.getFullYear()}-${m}-${day}` });
  },

  // 点击：维护菜单
  onTapMenuManage() {
    wx.navigateTo({ url: '/pages/Settings/menu-manage/index' });
  }
});
