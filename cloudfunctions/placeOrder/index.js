// 云函数入口文件 - 点菜单下单
// 在 MissionList 集合中创建一条 type='order' 的订单型任务
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (context) => {
  // context = {
  //   list: 'MissionList',
  //   title: '点菜单 - 2026-06-26',
  //   credit: 总积分,
  //   dishes: [{ menuId, title, category, desc, credit, _openid }],
  //   cookerNames: ['薛师傅', '宝宝'],
  //   ordererName: '薛师傅'
  // }

  const orderId = (await db.collection(context.list).add({
    data: {
      _openid: cloud.getWXContext().OPENID,   // 下单者（监督方）

      date: db.serverDate(),
      credit: Number(context.credit),

      title: context.title,
      desc: context.desc || '',

      // === 订单型任务扩展字段 ===
      type: 'order',                          // 标识这是订单
      orderStatus: 'ordered',                 // 状态：ordered | completed
      dishes: context.dishes || [],           // 菜品快照
      cookerNames: context.cookerNames || [], // 去重的厨师名
      ordererName: context.ordererName || '', // 下单者姓名

      available: true,                        // 沿用任务完成标志位
      star: false
    }
  }))._id

  // 可选：把所选菜单项 ordered 置为 true，标记已点（与旧字段兼容）
  const dishes = context.dishes || []
  if (dishes.length > 0) {
    const menuIds = dishes.map(d => d.menuId).filter(Boolean)
    if (menuIds.length > 0) {
      try {
        await db.collection('MenuList').where({
          _id: _.in(menuIds)
        }).update({
          data: { ordered: true }
        })
      } catch (e) {
        // 兼容旧字段失败不影响主流程
      }
    }
  }

  return { _id: orderId }
}