App({
  async onLaunch() {
    this.initcloud()

    this.globalData = {
      //记录使用者的openid
      _openidA: 'oT6085LEVOtIsSV7zBCh8PLTS6mk',
      _openidB: 'oT6085Ga7IUxYt-mmP0IdFvaLT0I',

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
      subscribeTemplateId: 'tkhfBTA9LoKMkBpq8nxv8bDh5_GSeVYOz157x_Zfsd8',
      // 已订阅动作的累计集合（按动作名记录）
      subscribedActions: wx.getStorageSync('subscribedActions') || {},
    }
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