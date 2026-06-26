// 云函数入口文件 - 积分批量分账
// 把积分按 openid 分组累加写入指定集合（默认 UserList）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()
const _ = db.command

exports.main = async (context) => {
  // context = {
  //   list: 'UserList',
  //   deltas: [{ openid: 'oTxxx1', delta: 30 }, { openid: 'oTxxx2', delta: 50 }]
  // }
  const list = context.list || 'UserList'
  const deltas = context.deltas || []

  const tasks = deltas.map(item =>
    db.collection(list).where({
      _openid: item.openid
    }).update({
      data: {
        credit: _.inc(Number(item.delta) || 0)
      }
    })
  )

  return await Promise.all(tasks)
}