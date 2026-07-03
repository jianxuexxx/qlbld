// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ // 初始化云开发环境
  env: cloud.DYNAMIC_CURRENT_ENV // 当前环境的常量
})
const db = cloud.database()
const db_date =  db.serverDate()

// 云函数入口函数
exports.main = async (context) => {
  // 新规则：当传入 ownerOpenid 时，校验必须等于调用者 OPENID（避免外部伪造给他人加物品）
  const OPENID = cloud.getWXContext().OPENID;
  let ownerOpenid = OPENID;
  if (context.ownerOpenid) {
    if (context.ownerOpenid !== OPENID) {
      return { errMsg: 'FORBIDDEN: ownerOpenid 与 OPENID 不一致' };
    }
    ownerOpenid = context.ownerOpenid;
  }

  // 通用兜底：如果 list 是 StorageList（购买入库），总是写入 ownerOpenid
  const isStorageList = context.list && /storage/i.test(context.list);

  const data = {
    _openid: OPENID,

    date: db_date,
    credit: Number(context.credit),

    title: context.title,
    desc: context.desc,

    available: true,
    star: false
  };
  if (context.ownerOpenid || isStorageList) {
    data.ownerOpenid = ownerOpenid;
  }

  return await db.collection(context.list).add({ data });
}
