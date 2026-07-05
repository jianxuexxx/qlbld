// 云函数入口文件 - 新增经期记录（每天一条）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()
const db_date = db.serverDate()

// 云函数入口函数
exports.main = async (context) => {
  const OPENID = cloud.getWXContext().OPENID;

  // 记录结构：
  // date: YYYY-MM-DD（一天一条）
  // type: 'period'（经期中）/ 'end'（结束经期）
  // note: 备注
  const data = {
    _openid: OPENID,
    date: context.date,
    type: context.type || 'period',
    note: context.note || '',
    createdAt: db_date,
  };

  return await db.collection(context.list).add({ data });
}