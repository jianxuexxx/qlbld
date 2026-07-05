// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ // 初始化云开发
  env: cloud.DYNAMIC_CURRENT_ENV // 当前环境的常量
})
const db = cloud.database()

// 云函数入口函数
exports.main = async (context) => {
  // 通用字段写入：
  //   - 未传 field 时，沿用旧行为：写入 available
  //   - 传入 field/value 时，写入指定字段（如 orderStatus、star 等）
  const data = {}
  if (context.field) {
    // 如果客户端没传 value（如"标记完成"），且字段是时间戳类的，默认用服务端时间
    if (context.value === undefined || context.value === null) {
      if (/At$|Time$|Date$/i.test(context.field)) {
        data[context.field] = db.serverDate()
      } else {
        data[context.field] = context.value
      }
    } else {
      data[context.field] = context.value
    }
  } else {
    data.available = context.value
  }

  return await db.collection(context.list).where({
    _id: context._id
  }).update({
    data
  })
}