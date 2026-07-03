// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ // 初始化云开发环境
  env: cloud.DYNAMIC_CURRENT_ENV // 当前环境的常量
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (context) => {
  // 更新菜单的ordered状态
  // 新规则：写入 ordererOpenid（下单者），便于厨师完成时识别奖励对象
  const data = { ordered: context.value };
  if (context.openid) {
    data.ordererOpenid = context.openid;
  }
  if (context.value === false) {
    // 取消点菜时清理下单者
    data.ordererOpenid = null;
  }
  return await db.collection(context.list).doc(context._id).update({
    data
  })
}
