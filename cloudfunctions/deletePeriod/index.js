// 云函数入口文件 - 删除经期记录
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

// 云函数入口函数
exports.main = async (context) => {
  const OPENID = cloud.getWXContext().OPENID;
  // 限定只能删除自己的记录
  return await db.collection(context.list).where({
    _id: context._id,
    _openid: OPENID
  }).remove();
}