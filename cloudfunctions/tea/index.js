// 云函数入口文件 - 奶茶记录
// 单一云函数带 action 字段路由：add / update / delete / list
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const COLLECTION = 'TeaList'

// 1. 新增一条
async function addRecord(context) {
  const OPENID = cloud.getWXContext().OPENID
  // 校验必填
  const { date, brand, product, rating } = context
  if (!date || !brand || !product || !rating) {
    return { errMsg: '参数不完整', success: false }
  }
  if (!['good', 'normal', 'bad'].includes(rating)) {
    return { errMsg: 'rating 非法', success: false }
  }
  const now = db.serverDate()
  const data = {
    _openid: OPENID,
    date,
    brand,
    product,
    rating,
    note: (context.note || '').trim().slice(0, 200),
    createdAt: now,
    updatedAt: now,
  }
  const res = await db.collection(COLLECTION).add({ data })
  return { success: true, _id: res._id }
}

// 2. 更新一条（限定 _openid）
async function updateRecord(context) {
  const OPENID = cloud.getWXContext().OPENID
  const { _id, date, brand, product, rating, note } = context
  if (!_id) return { errMsg: '_id 必填', success: false }
  if (rating && !['good', 'normal', 'bad'].includes(rating)) {
    return { errMsg: 'rating 非法', success: false }
  }
  // 先校验权限
  const existing = await db.collection(COLLECTION).doc(_id).get().catch(() => null)
  if (!existing || !existing.data) return { errMsg: '记录不存在', success: false }
  if (existing.data._openid !== OPENID) return { errMsg: '无权编辑他人记录', success: false }

  const update = { updatedAt: db.serverDate() }
  if (date !== undefined) update.date = date
  if (brand !== undefined) update.brand = brand
  if (product !== undefined) update.product = product
  if (rating !== undefined) update.rating = rating
  if (note !== undefined) update.note = (note || '').trim().slice(0, 200)

  await db.collection(COLLECTION).doc(_id).update({ data: update })
  return { success: true }
}

// 3. 删除一条（限定 _openid）
async function deleteRecord(context) {
  const OPENID = cloud.getWXContext().OPENID
  const { _id } = context
  if (!_id) return { errMsg: '_id 必填', success: false }
  const existing = await db.collection(COLLECTION).doc(_id).get().catch(() => null)
  if (!existing || !existing.data) return { errMsg: '记录不存在', success: false }
  if (existing.data._openid !== OPENID) return { errMsg: '无权删除他人记录', success: false }
  await db.collection(COLLECTION).doc(_id).remove()
  return { success: true }
}

// 4. 查询列表（限定 _openid = 当前用户）
async function listRecords(context) {
  const OPENID = cloud.getWXContext().OPENID
  const where = { _openid: OPENID }
  // 可选日期范围过滤
  if (context.startDate && context.endDate) {
    where.date = _.gte(context.startDate).and(_.lte(context.endDate))
  } else if (context.startDate) {
    where.date = _.gte(context.startDate)
  } else if (context.endDate) {
    where.date = _.lte(context.endDate)
  }
  // 取最近 1000 条（足够个人使用）
  const res = await db.collection(COLLECTION).where(where).limit(1000).orderBy('date', 'desc').orderBy('createdAt', 'desc').get()
  return { success: true, data: res.data || [] }
}

exports.main = async (context) => {
  const action = context.action
  try {
    switch (action) {
      case 'add':    return await addRecord(context)
      case 'update': return await updateRecord(context)
      case 'delete': return await deleteRecord(context)
      case 'list':   return await listRecords(context)
      default: return { errMsg: '未知 action: ' + action, success: false }
    }
  } catch (err) {
    console.error('[tea] error:', err)
    return { errMsg: err.message || '服务器错误', success: false }
  }
}