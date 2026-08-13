// 云函数入口文件 - 奶茶记录 + 品牌管理
// 单一云函数带 action 字段路由
//   奶茶记录：add/update/delete/list
//   品牌管理：addBrand/editBrand/deleteBrand/listBrands/listEnabledBrands
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const COLLECTION_RECORD = 'TeaList'
const COLLECTION_BRAND = 'BrandList'

// 1. 奶茶记录 - 新增
async function addRecord(context) {
  const OPENID = cloud.getWXContext().OPENID
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
  const res = await db.collection(COLLECTION_RECORD).add({ data })
  return { success: true, _id: res._id }
}

// 2. 奶茶记录 - 更新
async function updateRecord(context) {
  const OPENID = cloud.getWXContext().OPENID
  const { _id, date, brand, product, rating, note } = context
  if (!_id) return { errMsg: '_id 必填', success: false }
  if (rating && !['good', 'normal', 'bad'].includes(rating)) {
    return { errMsg: 'rating 非法', success: false }
  }
  const existing = await db.collection(COLLECTION_RECORD).doc(_id).get().catch(() => null)
  if (!existing || !existing.data) return { errMsg: '记录不存在', success: false }
  if (existing.data._openid !== OPENID) return { errMsg: '无权编辑他人记录', success: false }

  const update = { updatedAt: db.serverDate() }
  if (date !== undefined) update.date = date
  if (brand !== undefined) update.brand = brand
  if (product !== undefined) update.product = product
  if (rating !== undefined) update.rating = rating
  if (note !== undefined) update.note = (note || '').trim().slice(0, 200)

  await db.collection(COLLECTION_RECORD).doc(_id).update({ data: update })
  return { success: true }
}

// 3. 奶茶记录 - 删除
async function deleteRecord(context) {
  const OPENID = cloud.getWXContext().OPENID
  const { _id } = context
  if (!_id) return { errMsg: '_id 必填', success: false }
  const existing = await db.collection(COLLECTION_RECORD).doc(_id).get().catch(() => null)
  if (!existing || !existing.data) return { errMsg: '记录不存在', success: false }
  if (existing.data._openid !== OPENID) return { errMsg: '无权删除他人记录', success: false }
  await db.collection(COLLECTION_RECORD).doc(_id).remove()
  return { success: true }
}

// 4. 奶茶记录 - 列表（限定 _openid）
async function listRecords(context) {
  const OPENID = cloud.getWXContext().OPENID
  const where = { _openid: OPENID }
  if (context.startDate && context.endDate) {
    where.date = _.gte(context.startDate).and(_.lte(context.endDate))
  } else if (context.startDate) {
    where.date = _.gte(context.startDate)
  } else if (context.endDate) {
    where.date = _.lte(context.endDate)
  }
  const res = await db.collection(COLLECTION_RECORD).where(where).limit(1000).orderBy('date', 'desc').orderBy('createdAt', 'desc').get()
  return { success: true, data: res.data || [] }
}

// ============== 品牌管理 ==============

// 5. 品牌 - 列出所有（含停用）
async function listBrands() {
  const res = await db.collection(COLLECTION_BRAND).limit(200).orderBy('createdAt', 'asc').get()
  return { success: true, data: res.data || [] }
}

// 6. 品牌 - 仅启用（Add 页用）
async function listEnabledBrands() {
  const res = await db.collection(COLLECTION_BRAND).where({ enabled: true }).limit(200).orderBy('createdAt', 'asc').get()
  return { success: true, data: res.data || [] }
}

// 7. 品牌 - 新增（校验重名）
async function addBrand(context) {
  const OPENID = cloud.getWXContext().OPENID
  const { name, products, color } = context
  if (!name || !name.trim()) return { errMsg: '品牌名不能为空', success: false }

  // 重名校验
  const exist = await db.collection(COLLECTION_BRAND).where({ name: name.trim() }).limit(1).get()
  if (exist.data && exist.data.length > 0) {
    return { errMsg: '品牌名已存在', success: false }
  }

  const now = db.serverDate()
  const data = {
    _openid: OPENID,
    name: name.trim(),
    products: Array.isArray(products) ? products : [],
    color: color || '#2196F3',
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }
  const res = await db.collection(COLLECTION_BRAND).add({ data })
  return { success: true, _id: res._id }
}

// 8. 品牌 - 编辑
async function editBrand(context) {
  const { _id, name, products, color, enabled } = context
  if (!_id) return { errMsg: '_id 必填', success: false }

  // 如果改了名字，校验重名
  if (name !== undefined && name !== null) {
    const exist = await db.collection(COLLECTION_BRAND).where({
      name: name.trim(),
      _id: _.neq(_id),
    }).limit(1).get()
    if (exist.data && exist.data.length > 0) {
      return { errMsg: '品牌名已存在', success: false }
    }
  }

  const update = { updatedAt: db.serverDate() }
  if (name !== undefined) update.name = name.trim()
  if (products !== undefined) update.products = Array.isArray(products) ? products : []
  if (color !== undefined) update.color = color
  if (enabled !== undefined) update.enabled = !!enabled

  await db.collection(COLLECTION_BRAND).doc(_id).update({ data: update })
  return { success: true }
}

// 9. 品牌 - 软删除（enabled=false）
async function deleteBrand(context) {
  const { _id } = context
  if (!_id) return { errMsg: '_id 必填', success: false }
  await db.collection(COLLECTION_BRAND).doc(_id).update({
    data: { enabled: false, updatedAt: db.serverDate() }
  })
  return { success: true }
}

exports.main = async (context) => {
  const action = context.action
  try {
    switch (action) {
      // 奶茶记录
      case 'add':           return await addRecord(context)
      case 'update':        return await updateRecord(context)
      case 'delete':        return await deleteRecord(context)
      case 'list':          return await listRecords(context)
      // 品牌管理
      case 'addBrand':      return await addBrand(context)
      case 'editBrand':     return await editBrand(context)
      case 'deleteBrand':   return await deleteBrand(context)
      case 'listBrands':    return await listBrands()
      case 'listEnabledBrands': return await listEnabledBrands()
      default: return { errMsg: '未知 action: ' + action, success: false }
    }
  } catch (err) {
    console.error('[tea] error:', err)
    return { errMsg: err.message || '服务器错误', success: false }
  }
}