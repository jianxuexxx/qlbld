Page({
  data: {
    screenWidth: 1000,
    screenHeight: 1000,

    search: "",

    allMissions: [],
    unfinishedMissions: [],
    finishedMissions: [],

    currentOpenid: '',  // 当前用户 openid（用于判断发布者身份）
    _openidA : getApp().globalData._openidA,
    _openidB : getApp().globalData._openidB,

    slideButtons: [
      {extClass: 'markBtn', text: '标记', src: "Images/icon_mark.svg"},
      {extClass: 'starBtn', text: '星标', src: "Images/icon_star.svg"},
      {extClass: 'removeBtn', text: '删除', src: 'Images/icon_del.svg'}
    ],
  },

  //页面加载时运行
  async onShow(){
    // 获取当前用户 openid（用于发布者判定）
    try {
      const oid = await wx.cloud.callFunction({name: 'getOpenId'});
      this.setData({ currentOpenid: oid.result });
    } catch (e) { /* ignore */ }
    await wx.cloud.callFunction({name: 'getList', data: {list: getApp().globalData.collectionMissionList}}).then(data => {
      this.setData({allMissions: data.result.data})
      this.filterMission()
      this.getScreenSize()
    })
  },

  //获取页面大小
  async getScreenSize(){
    wx.getSystemInfo({
      success: (res) => {
        this.setData({
          screenWidth: res.windowWidth,
          screenHeight: res.windowHeight
        })
      }
    })
  },

  //转到任务详情
  async toDetailPage(element, isUpper) {
    const missionIndex = element.currentTarget.dataset.index
    const mission = isUpper ? this.data.unfinishedMissions[missionIndex] : this.data.finishedMissions[missionIndex]
    wx.navigateTo({url: '../MissionDetail/index?id=' + mission._id})
  },
  //转到任务详情[上]
  async toDetailPageUpper(element) {
    this.toDetailPage(element, true)
  },  
  //转到任务详情[下]
  async toDetailPageLower(element) {
    this.toDetailPage(element, false)
  },
  //转到添加任务
  async toAddPage() {
    wx.navigateTo({url: '../MissionAdd/index'})
  },

  //设置搜索
  onSearch(element){
    this.setData({
      search: element.detail.value
    })

    this.filterMission()
  },

  //将任务划分为：完成，未完成
  filterMission(){
    let missionList = []
    if(this.data.search != ""){
      for(let i in this.data.allMissions){
        if(this.data.allMissions[i].title.match(this.data.search) != null){
          missionList.push(this.data.allMissions[i])
        }
      }
    }else{
      missionList = this.data.allMissions
    }

    // 统一时间戳比较：date / completedAt 都是 Date 对象或 ISO 字符串
    const ts = (v) => {
      if (!v) return 0
      if (typeof v === 'object' && typeof v.getTime === 'function') return v.getTime()
      const t = new Date(v).getTime()
      return isNaN(t) ? 0 : t
    }
    const byDateDesc = (a, b) => ts(b.date) - ts(a.date)
    const byCompletedDesc = (a, b) => ts(b.completedAt) - ts(a.completedAt)

    const unfinished = missionList
      .filter(item => item.available === true)
      .sort(byDateDesc)
    const finished = missionList
      .filter(item => item.available === false)
      .sort(byCompletedDesc)

    this.setData({
      unfinishedMissions: unfinished,
      finishedMissions: finished,
    })
  },

  //响应左划按钮事件[上]
  async slideButtonTapUpper(element) {
    this.slideButtonTap(element, true)
  },

  //响应左划按钮事件[下]
  async slideButtonTapLower(element) {
    this.slideButtonTap(element, false)
  },

  //响应左划按钮事件逻辑
  async slideButtonTap(element, isUpper){
    //得到UI序号
    const {index} = element.detail

    //根据序号获得任务
    const missionIndex = element.currentTarget.dataset.index
    const mission = isUpper === true ? this.data.unfinishedMissions[missionIndex] : this.data.finishedMissions[missionIndex]

    await wx.cloud.callFunction({name: 'getOpenId'}).then(async openid => {

        //处理完成点击事件
        if (index === 0) {
            if(isUpper) {
                this.finishMission(element)
            }else{
                wx.showToast({
                    title: '任务已经完成',
                    icon: 'error',
                    duration: 2000
                })
            }

        }else if(mission._openid === openid.result){
            //处理星标按钮点击事件
            if (index === 1) {
                wx.cloud.callFunction({name: 'editStar', data: {_id: mission._id, list: getApp().globalData.collectionMissionList, value: !mission.star}})
                //更新本地数据
                mission.star = !mission.star
            }
            
            //处理删除按钮点击事件
            else if (index === 2) {
                wx.cloud.callFunction({name: 'deleteElement', data: {_id: mission._id, list: getApp().globalData.collectionMissionList}})
                //更新本地数据
                if(isUpper) this.data.unfinishedMissions.splice(missionIndex, 1) 
                else this.data.finishedMissions.splice(missionIndex, 1) 
                //如果删除完所有事项，刷新数据，让页面显示无事项图片
                if (this.data.unfinishedMissions.length === 0 && this.data.finishedMissions.length === 0) {
                    this.setData({
                    allMissions: [],
                    unfinishedMissions: [],
                    finishedMissions: []
                    })
                }
            }

            //触发显示更新
            this.setData({finishedMissions: this.data.finishedMissions, unfinishedMissions: this.data.unfinishedMissions})

        //如果编辑的不是自己的任务，显示提醒
        }else{
            wx.showToast({
            title: '只能编辑自己的任务',
            icon: 'error',
            duration: 2000
            })
        }
    })
  },

  //完成任务
  async finishMission(element) {
    //根据序号获得触发切换事件的待办
    const missionIndex = element.currentTarget.dataset.index
    const mission = this.data.unfinishedMissions[missionIndex]

    await wx.cloud.callFunction({name: 'getOpenId'}).then(async openid => {
      if(mission._openid != openid.result){
        //完成对方任务，奖金打入对方账号
        await wx.cloud.callFunction({name: 'editAvailable', data: {_id: mission._id, value: false, list: getApp().globalData.collectionMissionList}})
        await wx.cloud.callFunction({name: 'editCredit', data: {_openid: mission._openid, value: mission.credit, list: getApp().globalData.collectionUserList}})
        // 新规则：记录完成人 + 完成时间
        await wx.cloud.callFunction({
          name: 'editAvailable',
          data: { _id: mission._id, list: getApp().globalData.collectionMissionList, field: 'completedByOpenid', value: openid.result }
        }).catch(() => {})
        // 不传 value：云函数会用服务端时间写入（避免客户端时间不准）
        await wx.cloud.callFunction({
          name: 'editAvailable',
          data: { _id: mission._id, list: getApp().globalData.collectionMissionList, field: 'completedAt' }
        }).catch(() => {})

        //触发显示更新
        mission.available = false
        this.filterMission()

        //显示提示
        wx.showToast({
            title: '任务完成',
            icon: 'success',
            duration: 2000
        })

        // ===== 推送给任务发布者 =====
        const app = getApp();
        const me = app.getMyName(openid.result);
        app.notify('mission_done', {
          me,
          name: mission.title || '任务',
          page: 'pages/Mission/index'
        }).catch(() => {});

      }else{
        wx.showToast({
          title: '不能完成自己的任务',
          icon: 'error',
          duration: 2000
        })
      }
    })
  },
})