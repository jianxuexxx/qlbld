App({
  async onLaunch() {
    this.initcloud()

    this.globalData = {
      //记录使用者的openid
      _openidA: 'oKXTkxUJqooRziKJ142WuTQhqPZw',
      _openidB: 'oKXTkxeh5kNqUA2TAPh8hKxw48-4',

      //记录使用者的名字
      userA: '薛师傅',
      userB: '宝宝',

      //用于存储待办记录的集合名称
      collectionMissionList: 'MissionList',
      collectionMarketList: 'MarketList',
      collectionStorageList: 'StorageList',
      collectionUserList: 'UserList',

      //最多单次交易积分
      maxCredit: 500,

      // ===== 订阅消息（统一模板） =====
      subscribeTemplateId: 'fipB8zzrCo5upD3L7jvYB1wEeTQ3ohXaMCJyQcjYQS8',
      // 已订阅动作的累计集合（按动作名记录）
      subscribedActions: wx.getStorageSync('subscribedActions') || {},
    }
    // globalData 初始化完成后再拉真实用户名（异步，不阻塞启动）
    this.refreshUserNames && this.refreshUserNames();
  },

  flag: false,

  // 弹出订阅授权（必须先订阅才能 send）
  // actionKey：本次要执行的动作 key，例如 'mission_new'
  requestSubscribe(actionKey) {
    const tmpl = this.globalData.subscribeTemplateId;
    if (!tmpl) return Promise.resolve(false);
    return new Promise(resolve => {
      wx.requestSubscribeMessage({
        tmplIds: [tmpl],
        success: (res) => {
          const accepted = res[tmpl] === 'accept';
          if (accepted) {
            const map = { ...this.globalData.subscribedActions };
            map[actionKey] = Date.now();
            this.globalData.subscribedActions = map;
            wx.setStorageSync('subscribedActions', map);
          }
          resolve(accepted);
        },
        fail: () => resolve(false)
      });
    });
  },

  // 推送消息（封装 information 云函数）
  // options: { action, me, name, extra1, page, targetOpenid }
  sendNotification(options) {
    const { action } = options || {};
    return new Promise(resolve => {
      wx.cloud.callFunction({
        name: 'information',
        data: {
          templateId: this.globalData.subscribeTemplateId,
          ...options
        },
        success: res => resolve(res.result || { success: false }),
        fail: err => resolve({ success: false, error: err })
      });
    });
  },

  // 便捷：先请求订阅 → 再推送（一气呵成）
  // 如果订阅失败仍然尝试推送（云函数会返回错误码但不阻塞主流程）
  async notify(action, { me = '', name = '', extra1 = '', page = 'pages/MainPage/index' } = {}) {
    try {
      await this.requestSubscribe(action);
    } catch (e) {}
    return this.sendNotification({ action, me, name, extra1, page });
  },

  // 便捷：取自己名字（userA 或 userB）
  getMyName(currentOpenid) {
    const g = this.globalData;
    if (currentOpenid === g._openidA) return g.userA;
    if (currentOpenid === g._openidB) return g.userB;
    return '我';
  },

  // 异步获取自己名字
  async fetchMyName() {
    try {
      const r = await wx.cloud.callFunction({ name: 'getOpenId' });
      return this.getMyName(r && r.result);
    } catch (e) {
      return '我';
    }
  },

  // 从 UserList 拉取真实用户名，覆盖到 globalData.userA/userB
  // 命中字段顺序：name > username > nickname > 默认值
  async refreshUserNames() {
    const g = this.globalData;
    if (!g) {
      return;
    }
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserList',
        data: { list: g.collectionUserList }
      });
      const list = (res && res.result && res.result.data) || [];
      const pickName = (u) => u && (u.name || u.username || u.nickname || '');
      const a = list.find(u => u._openid === g._openidA);
      const b = list.find(u => u._openid === g._openidB);
      if (a && pickName(a)) g.userA = pickName(a);
      if (b && pickName(b)) g.userB = pickName(b);
      // 缓存，供后续同步
      try { wx.setStorageSync('userNameCache', { userA: g.userA, userB: g.userB, ts: Date.now() }); } catch (_) {}
    } catch (e) {
      console.error('[refreshUserNames] getUserList 调用失败：', e);
      // 网络/云函数失败时使用本地缓存
      try {
        const cache = wx.getStorageSync('userNameCache') || {};
        if (cache.userA) g.userA = cache.userA;
        if (cache.userB) g.userB = cache.userB;
      } catch (_) {}
    }
  },

  // 根据 openid 取名字（A/B/我 + 缓存优先）
  resolveUserName(currentOpenid) {
    const g = this.globalData;
    if (currentOpenid === g._openidA) return g.userA || '薛师傅';
    if (currentOpenid === g._openidB) return g.userB || '宝宝';
    return '我';
  },

  /**
   * 初始化云开发环境
   */
  async initcloud() {
    const normalinfo = require('./envList.js').envList || [] // 读取 envlist 文件
    if (normalinfo.length != 0 && normalinfo[0].envId != null) { // 如果文件中 envlist 存在
      wx.cloud.init({ // 初始化云开发环境
        traceUser: true,
        env: normalinfo[0].envId
      })
      // 装载云函数操作对象返回方法
      this.cloud = () => {
        return wx.cloud // 直接返回 wx.cloud
      }
    } else { // 如果文件中 envlist 不存在，提示要配置环境
      this.cloud = () => {
        wx.showModal({
          content: '无云开发环境', 
          showCancel: false
        })
        throw new Error('无云开发环境')
      }
    }
  },

  // 获取云数据库实例
  async database() {
    return (await this.cloud()).database()
  },
})