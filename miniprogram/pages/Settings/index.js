// pages/Settings/index.js
const app = getApp();

Page({
  data: {
    userInfo: {
      name: '我',
      avatar: ''
    },
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

  async refreshUser() {
    try {
      // 同步刷新一次全局用户名（数据库优先）
      await app.refreshUserNames && app.refreshUserNames();
      const { _openidA, _openidB, userA, userB, currentOpenid } = app.globalData;
      const openidRes = await wx.cloud.callFunction({ name: 'getOpenId' }).catch(() => null);
      const openid = (openidRes && openidRes.result) || currentOpenid || '';
      const name = openid === _openidA ? userA : (openid === _openidB ? userB : '我');
      this.setData({
        currentOpenid: openid,
        'userInfo.name': name || '我'
      });

      // 加载用户名（优先用 UserList.name 字段）
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
      const pickName = (u) => u && (u.name || u.username || u.nickname || '');
      if (me) {
        // 用数据库的 name 同步到顶部 userInfo
        const dbName = pickName(me);
        if (dbName) this.setData({ 'userInfo.name': dbName });
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