// 云函数入口文件
// 新增菜单，并自动同步新增分类到 CategoryList
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

exports.main = async (context) => {
  const OPENID = cloud.getWXContext().OPENID;

  // 1. 写入菜单（_openid 用服务端，禁伪造）
  const addRes = await db.collection(context.list).add({
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

  // 2. 同步分类：若 category 非空且 CategoryList 中无同名，自动新增
  const cat = (context.category || '').trim();
  let categoryCreated = false;
  if (cat && context.categoryListName) {
    try {
      const exist = await db.collection('CategoryList').where({
        name: cat
      }).limit(1).get();
      if (!exist.data || exist.data.length === 0) {
        await db.collection('CategoryList').add({
          data: {
            name: cat,
            _openid: OPENID,
            date: new Date(),
            // 默认排序靠后
            sort: 9999
          }
        });
        categoryCreated = true;
      }
    } catch (e) {
      console.warn('addMenu 同步分类失败：', e);
    }
  }

  return {
    ...addRes,
    categoryCreated,
    categoryName: cat
  };
};
