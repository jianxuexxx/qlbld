/* Main page of the app */
const app = getApp();

Page({
  data: {
    creditA: 0,
    creditB: 0,
    userA: '',
    userB: '',
    currentOpenid: '',
    currentUser: '',
    subscribed: false,
    requestSubscribeMessageResult: '',

    // Tab & 任务
    activeTab: 0,
    search: '',
    allMissions: [],
    unfinishedMissions: [],
    finishedMissions: [],
    pendingMissionCount: 0, // 当前用户**待完成**的任务数（对方发布的、available=true）

    _openidA: app.globalData._openidA,
    _openidB: app.globalData._openidB,

    slideButtons: [
      { extClass: 'markBtn', text: '标记', src: 'Images/icon_mark.svg' },
      { extClass: 'starBtn', text: '星标', src: 'Images/icon_star.svg' },
      { extClass: 'removeBtn', text: '删除', src: 'Images/icon_del.svg' }
    ],
  },

  async onShow() {
    const subs = app.globalData.subscribedActions || {};
    await (app.refreshUserNames && app.refreshUserNames());
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
    this.setData({
      userA: app.globalData.userA,
      userB: app.globalData.userB,
      currentOpenid,
      currentUser,
      subscribed: Object.keys(subs).length > 0
    });
    this.getCreditA();
    this.getCreditB();
    this.loadMissions();
  },

  refreshUserNames() {
    this.setData({
      userA: app.globalData.userA,
      userB: app.globalData.userB
    });
  },

  async onTapSubscribe() {
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
    wx.cloud.callFunction({ name: 'getElementByOpenId', data: { list: app.globalData.collectionUserList, _openid: app.globalData._openidA } })
      .then(res => {
        this.setData({ creditA: (res.result.data && res.result.data[0] && res.result.data[0].credit) || 0 });
      }).catch(() => {});
  },

  getCreditB() {
    wx.cloud.callFunction({ name: 'getElementByOpenId', data: { list: app.globalData.collectionUserList, _openid: app.globalData._openidB } })
      .then(res => {
        this.setData({ creditB: (res.result.data && res.result.data[0] && res.result.data[0].credit) || 0 });
      }).catch(() => {});
  },

  // ===== Tab 切换 =====
  switchTab(e) {
    const idx = Number(e.currentTarget.dataset.index) || 0;
    this.setData({ activeTab: idx });
  },
  onSwiperChange(e) {
    this.setData({ activeTab: e.detail.current });
  },
  goToMissionTab() {
    this.setData({ activeTab: 1 });
  },

  // ===== 任务数据 =====
  async loadMissions() {
    try {
      const data = await wx.cloud.callFunction({ name: 'getList', data: { list: app.globalData.collectionMissionList } });
      this.setData({ allMissions: data.result.data || [] });
      this.filterMission();
    } catch (e) {}
  },

  filterMission() {
    const list = this.data.allMissions;
    const me = this.data.currentOpenid;

    const ts = (v) => {
      if (!v) return 0;
      if (typeof v === 'object' && typeof v.getTime === 'function') return v.getTime();
      const t = new Date(v).getTime();
      return isNaN(t) ? 0 : t;
    };
    const byDateDesc = (a, b) => ts(b.date) - ts(a.date);
    const byCompletedDesc = (a, b) => ts(b.completedAt) - ts(a.completedAt);

    // 待办：对方发布的 + 未完成（只统计当前用户需要完成的）
    const pending = list.filter(it => it.available === true && it._openid && it._openid !== me);

    const unfinished = list.filter(it => it.available === true).sort(byDateDesc);
    const finished = list.filter(it => it.available === false).sort(byCompletedDesc);

    this.setData({
      unfinishedMissions: unfinished,
      finishedMissions: finished,
      pendingMissionCount: pending.length
    });
  },

  // 搜索
  onSearch(e) {
    const keyword = e.detail.value || '';
    this.setData({ search: keyword });
    this.filterMission();
    if (keyword) {
      // 简单标题匹配过滤
      const all = this.data.allMissions.filter(it => (it.title || '').includes(keyword));
      const ts = (v) => { if (!v) return 0; const t = new Date(v).getTime(); return isNaN(t) ? 0 : t; };
      this.setData({
        unfinishedMissions: all.filter(it => it.available === true).sort((a, b) => ts(b.date) - ts(a.date)),
        finishedMissions: all.filter(it => it.available === false).sort((a, b) => ts(b.completedAt) - ts(a.date))
      });
    }
  },

  // 跳详情
  toDetailPageUpper(e) {
    const idx = e.currentTarget.dataset.index;
    const m = this.data.unfinishedMissions[idx];
    if (!m) return;
    wx.navigateTo({ url: '../MissionDetail/index?id=' + m._id });
  },
  toDetailPageLower(e) {
    const idx = e.currentTarget.dataset.index;
    const m = this.data.finishedMissions[idx];
    if (!m) return;
    wx.navigateTo({ url: '../MissionDetail/index?id=' + m._id });
  },

  // 添加
  toAddPage() {
    wx.navigateTo({ url: '../MissionAdd/index' });
  },

  // ===== 左滑按钮 =====
  slideButtonTapUpper(e) { this.slideButtonTap(e, true); },
  slideButtonTapLower(e) { this.slideButtonTap(e, false); },

  async slideButtonTap(element, isUpper) {
    const { index } = element.detail;
    const missionIndex = element.currentTarget.dataset.index;
    const mission = isUpper ? this.data.unfinishedMissions[missionIndex] : this.data.finishedMissions[missionIndex];

    try {
      const oid = await wx.cloud.callFunction({ name: 'getOpenId' });
      const openid = oid.result;

      // 完成
      if (index === 0) {
        if (isUpper) {
          await this.finishMission(mission, openid);
        } else {
          wx.showToast({ title: '任务已经完成', icon: 'error', duration: 2000 });
        }
      }
      // 星标 / 删除：仅发布者可操作
      else if (mission && mission._openid === openid) {
        if (index === 1) {
          await wx.cloud.callFunction({ name: 'editStar', data: { _id: mission._id, list: app.globalData.collectionMissionList, value: !mission.star } });
          mission.star = !mission.star;
        } else if (index === 2) {
          await wx.cloud.callFunction({ name: 'deleteElement', data: { _id: mission._id, list: app.globalData.collectionMissionList } });
          if (isUpper) this.data.unfinishedMissions.splice(missionIndex, 1);
          else this.data.finishedMissions.splice(missionIndex, 1);
          if (this.data.unfinishedMissions.length === 0 && this.data.finishedMissions.length === 0) {
            this.setData({ allMissions: [], unfinishedMissions: [], finishedMissions: [] });
            return;
          }
        }
        this.setData({ finishedMissions: this.data.finishedMissions, unfinishedMissions: this.data.unfinishedMissions });
        this.filterMission();
      } else {
        wx.showToast({ title: '只能编辑自己的任务', icon: 'error', duration: 2000 });
      }
    } catch (e) {}
  },

  async finishMission(mission, openid) {
    if (!mission) return;
    if (mission._openid === openid) {
      wx.showToast({ title: '不能完成自己的任务', icon: 'error', duration: 2000 });
      return;
    }
    try {
      await wx.cloud.callFunction({ name: 'editAvailable', data: { _id: mission._id, value: false, list: app.globalData.collectionMissionList } });
      await wx.cloud.callFunction({ name: 'editCredit', data: { _openid: mission._openid, value: mission.credit, list: app.globalData.collectionUserList } });
      await wx.cloud.callFunction({
        name: 'editAvailable',
        data: { _id: mission._id, list: app.globalData.collectionMissionList, field: 'completedByOpenid', value: openid }
      }).catch(() => {});
      await wx.cloud.callFunction({
        name: 'editAvailable',
        data: { _id: mission._id, list: app.globalData.collectionMissionList, field: 'completedAt' }
      }).catch(() => {});

      // 本地重算
      await this.loadMissions();
      this.getCreditA();
      this.getCreditB();

      wx.showToast({ title: '任务完成', icon: 'success', duration: 2000 });

      const me = app.getMyName(openid);
      app.notify('mission_done', {
        me,
        name: mission.title || '任务',
        page: 'pages/Mission/index'
      }).catch(() => {});
    } catch (e) {}
  },
});