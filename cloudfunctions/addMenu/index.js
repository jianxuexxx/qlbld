// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ // 初始化云开发环境
  env: cloud.DYNAMIC_CURRENT_ENV // 当前环境的常量
})
const db = cloud.database()

// 云函数入口函数
exports.main = async (context) => {
  const OPENID = cloud.getWXContext().OPENID || '';
  // 添加新菜单项到集合
  // 新规则：_openid 始终使用服务端 OPENID，避免客户端伪造
  const res = await db.collection(context.list).add({
    data: {
      title: context.title,
      category: context.category,
      desc: context.desc,
      credit: context.credit,
      _openid: OPENID,
      date: context.date,
      available: context.available,
      ordered: context.ordered,
      accepted: context.accepted,
      star: context.star
    }
  });
  // 返回真实写入的 openid，便于前端排查
  return Object.assign({}, res, { _openid: OPENID });
}
