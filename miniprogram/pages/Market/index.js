// 占位：被废弃的市场页。
// 该页面原本是商城入口，现在被"设置"取代。
// 留存仅为了兼容旧的"自定义编译条件"，加载后立即跳转到首页。
Page({
  onLoad() {
    // 立即重定向走，0 毫秒闪屏
    setTimeout(() => {
      wx.reLaunch({ url: '/pages/MainPage/index' });
    }, 0);
  }
});
