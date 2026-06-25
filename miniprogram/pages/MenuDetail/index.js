Page({
  data: {
    menuDetail: {},
    currentOpenid: '',
    _openidA: getApp().globalData._openidA,
    _openidB: getApp().globalData._openidB,
    userA: getApp().globalData.userA,
    userB: getApp().globalData.userB
  },

  onLoad(options) {
    const menuId = options.id;
    this.getMenuDetail(menuId);
    this.getCurrentOpenid();
  },

  async getCurrentOpenid() {
    wx.cloud.callFunction({ name: 'getOpenId' }).then(res => {
      this.setData({
        currentOpenid: res.result
      });
    });
  },

  async getMenuDetail(id) {
    wx.cloud.callFunction({
      name: 'getElementById',
      data: { list: 'MenuList', id: id }
    }).then(res => {
      this.setData({
        menuDetail: res.result.data[0]
      });
    });
  },

  getStatusText() {
    const detail = this.data.menuDetail;
    if (!detail.ordered) {
      return '未被点';
    } else if (!detail.accepted) {
      return '已被点';
    } else if (detail.available) {
      return '制作中';
    } else {
      return '已完成';
    }
  },

  async orderMenu() {
    const menu = this.data.menuDetail;

    if (menu._openid === this.data.currentOpenid) {
      wx.showToast({
        title: '不能点自己的菜',
        icon: 'error'
      });
      return;
    }

    if (menu.ordered) {
      wx.showToast({
        title: '此菜已被点',
        icon: 'error'
      });
      return;
    }

    wx.cloud.callFunction({
      name: 'editMenuOrdered',
      data: { _id: menu._id, value: true, list: 'MenuList' }
    }).then(() => {
      wx.showToast({
        title: '点菜成功',
        icon: 'success'
      });

      // 更新本地数据
      this.setData({
        'menuDetail.ordered': true
      });
    }).catch(error => {
      console.error('点菜失败:', error);
      wx.showToast({
        title: '点菜失败',
        icon: 'error'
      });
    });
  },

  async acceptOrder() {
    const menu = this.data.menuDetail;

    if (menu._openid !== this.data.currentOpenid) {
      wx.showToast({
        title: '只能接自己的菜品订单',
        icon: 'error'
      });
      return;
    }

    if (!menu.ordered) {
      wx.showToast({
        title: '该菜品尚未被点',
        icon: 'error'
      });
      return;
    }

    if (menu.accepted) {
      wx.showToast({
        title: '订单已被接受',
        icon: 'error'
      });
      return;
    }

    wx.cloud.callFunction({
      name: 'editMenuAccepted',
      data: { _id: menu._id, value: true, list: 'MenuList' }
    }).then(() => {
      wx.showToast({
        title: '接单成功',
        icon: 'success'
      });

      // 更新本地数据
      this.setData({
        'menuDetail.accepted': true
      });
    }).catch(error => {
      console.error('接单失败:', error);
      wx.showToast({
        title: '接单失败',
        icon: 'error'
      });
    });
  },

  async completeOrder() {
    const menu = this.data.menuDetail;

    // 确保是点菜的用户才能完成订单
    if (menu._openid === this.data.currentOpenid) {
      wx.showToast({
        title: '创建者无法完成订单',
        icon: 'error'
      });
      return;
    }

    if (!menu.accepted) {
      wx.showToast({
        title: '订单尚未被接受',
        icon: 'error'
      });
      return;
    }

    if (!menu.ordered) {
      wx.showToast({
        title: '订单不存在',
        icon: 'error'
      });
      return;
    }

    if (!menu.available) {
      wx.showToast({
        title: '订单已完成',
        icon: 'error'
      });
      return;
    }

    // 完成订单：将积分奖励给点菜者
    wx.cloud.callFunction({
      name: 'editMenuAvailable',
      data: { _id: menu._id, value: false, list: 'MenuList' }
    }).then(async () => {
      // 奖励积分给点菜者
      await wx.cloud.callFunction({
        name: 'editCredit',
        data: { _openid: this.data.currentOpenid, value: menu.credit, list: getApp().globalData.collectionUserList }
      });

      wx.showToast({
        title: '订单完成，积分已奖励',
        icon: 'success'
      });

      // 更新本地数据
      this.setData({
        'menuDetail.available': false
      });
    }).catch(error => {
      console.error('完成订单失败:', error);
      wx.showToast({
        title: '完成订单失败',
        icon: 'error'
      });
    });
  },

  editMenu() {
    // 编辑功能暂不实现，可以跳转到编辑页面
    wx.showToast({
      title: '编辑功能待完善',
      icon: 'none'
    });
  },

  deleteMenu() {
    const menu = this.data.menuDetail;

    if (menu._openid !== this.data.currentOpenid) {
      wx.showToast({
        title: '只能删除自己的菜品',
        icon: 'error'
      });
      return;
    }

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个菜品吗？',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'deleteMenu',
            data: { _id: menu._id, list: 'MenuList' }
          }).then(() => {
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            });

            setTimeout(() => {
              wx.navigateBack();
            }, 1500);
          }).catch(error => {
            console.error('删除失败:', error);
            wx.showToast({
              title: '删除失败',
              icon: 'error'
            });
          });
        }
      }
    });
  }
})