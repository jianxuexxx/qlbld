// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init()

// 项目为情侣双人应用，硬编码 A/B openid（仅两个用户角色）
const OPENID_A = 'oT6085LEVOtIsSV7zBCh8PLTS6mk'
const OPENID_B = '这里改成B的openid'

exports.main = async (event, context) => {
  try {
    console.log("Sending message with event data:", event);

    const myOpenid = cloud.getWXContext().OPENID;  // 当前用户 openid
    // 互换：当前是 A → 推送给 B；当前是 B → 推送给 A
    let openid = (myOpenid === OPENID_A) ? OPENID_B : OPENID_A;
    console.log('推送目标 openid:', openid);

    let taskName = '叮咚～任务更新提醒'
    // 获取发布任务最后一条信息进行推送
    await cloud.callFunction({ name: 'getList', data: { list: 'MissionList' } }).then(res => {
        const { data } = res.result
        const task = data.filter(task => task._openid == openid)
        if (task.length) {
            taskName = task[task.length - 1].title
        }
    })

    const result = await cloud.openapi.subscribeMessage.send({
      touser: openid,
      data: {
        thing6: {
          value: taskName
        },
        thing9: {
          value: '你的宝r在努力学习哦'
        }
      },

      templateId: event.templateId,
      miniprogramState: 'developer',
      page: 'pages/MainPage/index'
    })
    console.log("Message sent successfully:", result);
    return event.startdate
  } catch (err) {
    console.log("Error while sending message:", err);
    return err
  }
}
