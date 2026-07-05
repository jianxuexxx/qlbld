// 云函数入口文件 - 更新经期记录（标记结束或更新备注）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()
const db_date = db.serverDate()

// 云函数入口函数
exports.main = async (context) => {
  const OPENID = cloud.getWXContext().OPENID;
  const updateData = {
    updatedAt: db_date,
  };
  if (context.endDate !== undefined) updateData.endDate = context.endDate;
  if (context.note !== undefined) updateData.note = context.note;

  return await db.collection(context.list).where({
    _id: context._id,
    _openid: OPENID
  }).update({
    data: updateData
  });
}