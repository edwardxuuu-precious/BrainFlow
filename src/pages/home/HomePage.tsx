import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NetworkConstellation } from '../../components/illustrations/NetworkConstellation'
import { Button, SearchField, StatusPill, SurfacePanel, ToolbarGroup } from '../../components/ui'
import {
  documentService,
  getRecentDocumentId,
  setRecentDocumentId,
} from '../../features/documents/document-service'
import type { DocumentService, DocumentSummary, MindMapDocument } from '../../features/documents/types'
import styles from './HomePage.module.css'

interface HomePageProps {
  service?: DocumentService
}

// 500+ 人性洞察名言 - 关于欲望、自我、人性、爱情、孤独、成长、记忆、存在的智慧
const HOME_QUOTES = [
  // ========== 1. 人性欲望与动机 ==========
  { text: '人是欲望的动物，欲望得不到满足便痛苦，得到满足便无聊。', author: '叔本华' },
  { text: '我们追求幸福，却发现幸福往往在我们停止追求时降临。', author: '老子' },
  { text: '欲望是一把双刃剑，它推动我们前进，也使我们迷失。', author: '佛陀' },
  { text: '人类的动机，归根结底只有两个：恐惧与渴望。', author: '弗洛伊德' },
  { text: '得不到的永远在骚动，被偏爱的都有恃无恐。', author: '张爱玲' },
  { text: '人的欲望没有穷尽，就像海水越喝越渴。', author: '庄子' },
  { text: '我们一生追求的目标，往往是我们无法拥有的东西。', author: '普鲁斯特' },
  { text: '欲望的本质是匮乏，而满足欲望只会制造新的匮乏。', author: '拉康' },
  { text: '金钱买不到幸福，但贫困却能买来无数痛苦。', author: '塞涅卡' },
  { text: '人类的贪婪是无底洞，唯有知足才能常乐。', author: '老子' },
  { text: '我们所渴望的，往往不是事物本身，而是事物缺失时心中的空缺。', author: '帕斯卡尔' },
  { text: '野心是灵魂的火焰，它可以照亮前路，也能焚毁一切。', author: '莎士比亚' },
  { text: '人的需求很简单，但人的欲望却很复杂。', author: '苏格拉底' },
  { text: '我们追逐影子，却忘记了阳光。', author: '柏拉图' },
  { text: '贪婪者永远贫穷，知足者永远富有。', author: '佛陀' },
  { text: '欲望使人成为奴隶，节制使人获得自由。', author: '爱比克泰德' },
  { text: '权力腐蚀人心，绝对权力绝对腐蚀人心。', author: '阿克顿勋爵' },
  { text: '名利的追逐是一场没有终点的赛跑。', author: '孔子' },
  { text: '人为了逃避思考，愿意做任何事。', author: '亨利·福特' },
  { text: '我们消费的不是物品，而是物品背后的意义。', author: '鲍德里亚' },
  { text: '懒惰是身体的欲望，勤奋是灵魂的需求。', author: '塞缪尔·约翰逊' },
  { text: '食欲是生命的本能，贪婪是灵魂的病态。', author: '奥古斯丁' },
  { text: '占有欲使爱变质，给予使爱升华。', author: '纪伯伦' },
  { text: '人总是在得到时不珍惜，失去后才追悔莫及。', author: '歌德' },
  { text: '我们需要的越少，我们越接近神。', author: '苏格拉底' },
  { text: '奢华是穷人的梦想，简朴是智者的选择。', author: '爱默生' },
  { text: '欲望如火焰，不添加柴火，自然熄灭。', author: '佛陀' },
  { text: '人类的历史，就是一部欲望膨胀与克制的历史。', author: '汤因比' },
  { text: '自由不是想做什么就做什么，而是不想做什么就可以不做。', author: '康德' },
  { text: '人最难战胜的敌人，是自己内心的欲望。', author: '王阳明' },
  { text: '我们追求的快乐，往往在追求的过程中被错过了。', author: '约翰·列侬' },
  { text: '满足一千个欲望，还是战胜一个欲望，这是人生的选择。', author: '释迦牟尼' },
  { text: '人的价值不在于他拥有什么，而在于他是什么。', author: '爱因斯坦' },
  { text: '虚荣心使人戴上假面具，真诚使人卸下伪装。', author: '卢梭' },
  { text: '成功是一个相对的概念，它取决于你定义欲望的方式。', author: '荣格' },
  { text: '我们以为自己在追求幸福，其实只是在追求欲望的实现。', author: '罗素' },
  { text: '渴望认可是人的天性，但过分渴望是自卑的表现。', author: '阿德勒' },
  { text: '物质的丰富带来便利，精神的丰富带来幸福。', author: '泰戈尔' },
  { text: '人只有在匮乏时，才知道自己真正需要什么。', author: '海德格尔' },
  { text: '欲望使人年轻，满足使人老去。', author: '王尔德' },
  { text: '我们追逐的很多东西，其实从来没有真正属于我们。', author: '庄子' },
  { text: '最大的贫困是精神的贫困，最大的富有是精神的富有。', author: '孟子' },
  { text: '欲望是生命的动力，也是痛苦的根源。', author: '叔本华' },
  { text: '人之所以痛苦，在于追求错误的东西。', author: '佛陀' },
  { text: '拥有越少，负担越轻；欲望越少，心灵越自由。', author: '老子' },
  { text: '我们总是低估自己拥有的，高估自己没有的。', author: '爱比克泰德' },
  { text: '人类的野心如同海水，喝得越多，越觉得渴。', author: '莎士比亚' },
  { text: '真正的富有，是敢于放下的勇气。', author: '梭罗' },
  { text: '欲望是无尽的，而生命是有限的，用有限追逐无限，是人生的悲哀。', author: '庄子' },
  { text: '人最大的敌人是自己的内心。', author: '老子' },
  { text: '贪婪的眼睛永远看不到满足。', author: '塞万提斯' },
  { text: '知足不辱，知止不殆，可以长久。', author: '老子' },
  { text: '欲望满足的瞬间，即是偿还的时刻。', author: '傅雷' },
  { text: '人的欲望越大，他的苦难就越多。', author: '托尔斯泰' },
  { text: '减少欲望，才能增加幸福。', author: '塞涅卡' },
  { text: '欲望是深渊，凝视它时，它也在凝视你。', author: '尼采' },
  { text: '我们占有的东西，同时也在占有我们。', author: '弗洛姆' },
  { text: '真正的自由是免于恐惧的自由。', author: '罗斯福' },

  // ========== 2. 自我欺骗与真实 ==========
  { text: '人最难认识的是自己，因为认识需要勇气。', author: '苏格拉底' },
  { text: '谎言重复一千遍也不会成为真理，但人们会开始相信它。', author: '戈培尔' },
  { text: '我们欺骗自己，是因为真相往往太痛苦。', author: '弗洛伊德' },
  { text: '自欺是人类的特权，也是人类的诅咒。', author: '萨特' },
  { text: '认知失调是心灵的防御机制，但它阻碍成长。', author: '费斯廷格' },
  { text: '人们相信他们想要相信的，看到想要看到的。', author: '尼采' },
  { text: '真相往往难以接受，所以我们选择生活在幻觉中。', author: '柏拉图' },
  { text: '人最大的幻觉，是以为自己了解自己。', author: '荣格' },
  { text: '我们为自己的行为寻找理由，而不是根据理由行动。', author: '费斯廷格' },
  { text: '自欺是一种保护，但也是一种囚禁。', author: '卡伦·霍妮' },
  { text: '镜子不会说谎，但人会选择不看镜子。', author: '奥斯卡·王尔德' },
  { text: '承认错误需要智慧，改正错误需要勇气。', author: '亚里士多德' },
  { text: '我们在黑暗中探索真理，却常常被自己的影子吓到。', author: '庄子' },
  { text: '偏见是思考的捷径，但通往的是错误的终点。', author: '丹尼尔·卡尼曼' },
  { text: '人宁愿相信一个美好的谎言，也不愿面对残酷的现实。', author: '弗洛伊德' },
  { text: '我们看到的不是事物本身，而是我们想看到的样子。', author: '阿娜伊斯·宁' },
  { text: '逃避真实就是逃避自己。', author: '存在主义' },
  { text: '真相只有一个，但谎言有无数种形式。', author: '孔子' },
  { text: '自我欺骗是人类最强大的心理防御机制。', author: '弗洛伊德' },
  { text: '承认无知是智慧的开端，自以为知是愚昧的根源。', author: '苏格拉底' },
  { text: '我们为自己的缺点辩护，比为优点辩护更加卖力。', author: '拉罗什福科' },
  { text: '人最难的不是认识世界，而是认识自己。', author: '老子' },
  { text: '意识是冰山一角，潜意识才是冰山的主体。', author: '弗洛伊德' },
  { text: '我们评判他人时很严苛，评判自己时很宽容。', author: '阿德勒' },
  { text: '真理往往披着朴素的外衣，而谎言戴着华丽的面具。', author: '托尔斯泰' },
  { text: '人只相信自己愿意相信的，这是人性的弱点。', author: '培根' },
  { text: '认识自己是一切智慧的开端，也是最难的旅程。', author: '德尔斐神谕' },
  { text: '我们害怕的不是黑暗，而是黑暗中的真实。', author: '爱伦·坡' },
  { text: '人的记忆是会骗人的，它根据我们的需要改写过去。', author: '弗洛伊德' },
  { text: '面对真相需要勇气，接纳真相需要智慧。', author: '释迦牟尼' },
  { text: '我们常常被自己的偏见蒙蔽，却以为看到了全部。', author: '笛卡尔' },
  { text: '人最大的幻觉是以为自己掌控了一切。', author: '叔本华' },
  { text: '我们为自己的愚蠢辩护，比为智慧辩护更加积极。', author: '蒙田' },
  { text: '真相往往藏在最不愿意看的地方。', author: '佛陀' },
  { text: '人欺骗自己比欺骗别人更容易。', author: '拉罗什福科' },
  { text: '我们所恐惧的，往往是我们不愿意面对的真相。', author: '荣格' },
  { text: '认知偏见是我们大脑的快捷方式，但常常导致错误。', author: '卡尼曼' },
  { text: '承认自己的无知，是获得知识的开始。', author: '孔子' },
  { text: '人们总是高估自己的理性，低估自己的情感。', author: '休谟' },
  { text: '我们逃避的不是问题，而是面对问题的自己。', author: '萨特' },
  { text: '真相是锋利的刀，它能切开一切虚假。', author: '老子' },
  { text: '最危险的幻觉是以为自己没有幻觉。', author: '克里希那穆提' },
  { text: '自我欺骗是一种艺术，人类都是艺术家。', author: '尼采' },
  { text: '人最难承认的，是自己的错误。', author: '毛泽东' },
  { text: '我们看到的世界，是我们内心的投射。', author: '荣格' },
  { text: '真相使人自由，但首先它会使人痛苦。', author: '圣经' },
  { text: '人的理性常为情感服务，而不是相反。', author: '大卫·休谟' },
  { text: '承认自己的阴暗面，是走向完整的第一步。', author: '荣格' },
  { text: '我们不是为了了解真相而思考，而是为了证明自己的观点。', author: '弗朗西斯·培根' },
  { text: '人最大的自欺，是假装不在乎自己在乎的东西。', author: '司汤达' },

  // ========== 3. 人性的二元性 ==========
  { text: '人一半是天使，一半是野兽。', author: '柏拉图' },
  { text: '善与恶都存在于人性之中，关键在于选择。', author: '孟子' },
  { text: '光明与黑暗共存于人的灵魂。', author: '荣格' },
  { text: '我们既有创造的能力，也有毁灭的冲动。', author: '弗洛伊德' },
  { text: '人的内心住着两个人，一个想成为圣人，一个想做回野兽。', author: '陀思妥耶夫斯基' },
  { text: '人性如同一枚硬币，一面是自私，一面是同情。', author: '亚当·斯密' },
  { text: '我们既是理性的动物，也是情感的奴隶。', author: '帕斯卡尔' },
  { text: '善与恶不是对立的两极，而是光谱上的不同位置。', author: '尼采' },
  { text: '人有能力做出最高尚的事，也有能力做出最卑鄙的事。', author: '汉娜·阿伦特' },
  { text: '我们既渴望被爱，又害怕爱带来的脆弱。', author: '卡伦·霍妮' },
  { text: '人性的复杂在于，一个人可以同时是天使和魔鬼。', author: '歌德' },
  { text: '爱与恨往往只有一线之隔。', author: '弗洛伊德' },
  { text: '人既有寻求安全的需求，也有冒险的渴望。', author: '马斯洛' },
  { text: '我们的理性和情感永远在交战。', author: '柏拉图' },
  { text: '人有合群的天性，也有独处的需求。', author: '叔本华' },
  { text: '我们既是独立的个体，也是社会的一部分。', author: '涂尔干' },
  { text: '人既追求自由，又寻求归属。', author: '弗洛姆' },
  { text: '善良与残忍并存于同一个人心中。', author: '陀思妥耶夫斯基' },
  { text: '我们既有创造美的能力，也有制造丑的冲动。', author: '弗洛伊德' },
  { text: '人的本性是矛盾的统一体。', author: '黑格尔' },
  { text: '我们既是过去的奴隶，也是未来的主人。', author: '萨特' },
  { text: '人既需要秩序，又渴望破坏。', author: '荣格' },
  { text: '我们既有自我保护的本能，也有自我牺牲的能力。', author: '达尔文' },
  { text: '人性是神性与兽性的混合物。', author: '尼采' },
  { text: '我们既想被理解，又害怕被看穿。', author: '里尔克' },
  { text: '人有追求真理的冲动，也有自欺欺人的本领。', author: '弗洛伊德' },
  { text: '我们既是有限的肉身，也是无限的精神。', author: '帕斯卡尔' },
  { text: '人的内心既有慈悲，也有残忍。', author: '荀子' },
  { text: '善恶之分在人性中本是模糊的。', author: '王阳明' },
  { text: '我们既渴望永恒，又活在瞬间。', author: '海德格尔' },
  { text: '人有尊严，也有卑微。', author: '康德' },
  { text: '我们既是问题的制造者，也是问题的解决者。', author: '萨特' },
  { text: '人的本性是自由，却常常选择囚禁自己。', author: '存在主义' },
  { text: '我们既有向上的力量，也有下沉的倾向。', author: '弗洛伊德' },
  { text: '人既是理性的，也是非理性的。', author: '荣格' },
  { text: '我们既是创造者，也是破坏者。', author: '纪伯伦' },
  { text: '人性是天使与魔鬼的永恒斗争。', author: '歌德' },
  { text: '我们既需要孤独，又害怕孤独。', author: '叔本华' },
  { text: '人有善的根，也有恶的苗。', author: '孟子/荀子' },
  { text: '我们既是历史的结果，也是未来的原因。', author: '萨特' },
  { text: '人既是主体，也是客体。', author: '萨特' },
  { text: '我们既有选择的能力，也有逃避选择的倾向。', author: '萨特' },
  { text: '人既有强大的一面，也有脆弱的一面。', author: '荣格' },
  { text: '善恶同源，正邪一体。', author: '道德经' },
  { text: '我们既是观察者，也是被观察者。', author: '量子力学/心理学' },
  { text: '人的内心住着两个人，一个向外看，一个向内看。', author: '赫尔曼·黑塞' },
  { text: '人性是流动的，不是固定的。', author: '威廉·詹姆斯' },
  { text: '我们既生活在现实中，也生活在想象中。', author: '弗洛伊德' },
  { text: '人是唯一会脸红的动物，也是唯一需要脸红的动物。', author: '马克·吐温' },
  { text: '光明与黑暗在每个人心中都有一席之地。', author: '荣格' },

  // ========== 4. 自我与谦逊 ==========
  { text: '认识自己的无知，是最大的智慧。', author: '苏格拉底' },
  { text: '谦逊是智者的美德，骄傲是愚者的标志。', author: '老子' },
  { text: '越是智慧的人，越知道自己的无知。', author: '苏格拉底' },
  { text: '自我是一切的根源，也是一切的障碍。', author: '佛陀' },
  { text: '骄傲在毁灭之前，狂心在跌倒之前。', author: '圣经' },
  { text: '空杯心态才能容纳新知识。', author: '禅宗' },
  { text: '自我越小，世界越大。', author: '老子' },
  { text: '真正的强者不是战胜别人，而是战胜自己。', author: '老子' },
  { text: '谦逊的人看到的是自己的不足，骄傲的人看到的是别人的缺点。', author: '富兰克林' },
  { text: 'ego 是成长的敌人。', author: '荣格' },
  { text: '知之为知之，不知为不知，是知也。', author: '孔子' },
  { text: '越是成熟的稻穗，越懂得弯腰。', author: '中国谚语' },
  { text: '无我之境，是最高的境界。', author: '庄子' },
  { text: '虚心使人进步，骄傲使人落后。', author: '毛泽东' },
  { text: '大智者必谦和，大善者必宽容。', author: '尼采' },
  { text: '人外有人，天外有天。', author: '中国谚语' },
  { text: '承认自己的渺小，是走向伟大的开始。', author: '苏格拉底' },
  { text: '自我是牢笼，放下自我才能获得自由。', author: '佛陀' },
  { text: '真正的谦卑不是自我贬低，而是如实看待自己。', author: 'C.S.路易斯' },
  { text: '骄傲使人孤立，谦逊使人连接。', author: '孔子' },
  { text: '山外有山，人上有人。', author: '中国谚语' },
  { text: '最浅薄的知识产生骄傲，最深的知识产生谦逊。', author: '艾萨克·牛顿' },
  { text: '小我则大，大我则小。', author: '老子' },
  { text: '谦逊是真理之母，骄傲是错误之父。', author: '托马斯·阿奎那' },
  { text: '知道自己的无知，是通向智慧的第一步。', author: '苏格拉底' },
  { text: '满招损，谦受益。', author: '尚书' },
  { text: '真正的力量来自内在，而非外在的炫耀。', author: '老子' },
  { text: '一个人越是有智慧，越是不张扬。', author: '庄子' },
  { text: '自我膨胀的人，内心往往是空虚的。', author: '阿德勒' },
  { text: '大海所以能为百谷王者，以其善下之。', author: '老子' },
  { text: '放下我执，方见真如。', author: '禅宗' },
  { text: '谦逊是最高级的自信。', author: '老子' },
  { text: '不懂装懂是愚蠢，懂装不懂是智慧。', author: '老子' },
  { text: '真正的伟大从不炫耀自己的伟大。', author: '老子' },
  { text: '高人往往低调，庸人往往张扬。', author: '庄子' },
  { text: '骄傲是失败的开端，谦逊是成功的基石。', author: '富兰克林' },
  { text: '能够承认错误的人，比始终正确的人更值得尊敬。', author: '孔子' },
  { text: '忘掉自我，才能找到自我。', author: '赫拉克利特' },
  { text: '越是 empty 的容器，声音越响亮。', author: '老子' },
  { text: '低调做人，高调做事。', author: '曾国藩' },
  { text: '真正的强者不需要证明自己的强大。', author: '老子' },
  { text: 'ego 是一面墙，把人与真理隔开。', author: '克里希那穆提' },
  { text: '越是高手，越懂得敬畏。', author: '孔子' },
  { text: '自满的人停在原地，谦虚的人不断前行。', author: '荀子' },
  { text: '学习的敌人是自己的满足。', author: '毛泽东' },
  { text: '虚怀若谷，方能容纳百川。', author: '庄子' },
  { text: '承认不如人，是进步的开始。', author: '孔子' },
  { text: '内心充实的人不需要外界的认可。', author: '荣格' },
  { text: '真正的智慧是知道自己一无所知。', author: '苏格拉底' },
  { text: '谦受益，满招损，时乃天道。', author: '尚书' },

  // ========== 5. 恐惧与勇气 ==========
  { text: '最大的恐惧是对恐惧本身的恐惧。', author: '罗斯福' },
  { text: '勇气不是没有恐惧，而是带着恐惧前行。', author: '纳尔逊·曼德拉' },
  { text: '我们唯一需要恐惧的，就是恐惧本身。', author: '罗斯福' },
  { text: '恐惧是想象的产物，勇气是行动的结果。', author: '亚里士多德' },
  { text: '勇敢不是不害怕，而是害怕时还去做正确的事。', author: '圣雄甘地' },
  { text: '恐惧让人成为奴隶，勇气让人获得自由。', author: '爱比克泰德' },
  { text: '勇气是战胜恐惧，而不是没有恐惧。', author: '马克·吐温' },
  { text: '你所恐惧的，往往是你需要面对的。', author: '约瑟夫·坎贝尔' },
  { text: '恐惧是心灵的黑暗，勇气是点燃黑暗的火焰。', author: '柏拉图' },
  { text: '不敢冒险的人，永远不会成长。', author: '爱因斯坦' },
  { text: '恐惧让我们保守，勇气让我们突破。', author: '尼采' },
  { text: '真正的勇敢，是明知会输还要去做。', author: '哈珀·李' },
  { text: '恐惧使人想到最坏的可能，勇气使人创造最好的可能。', author: '塞涅卡' },
  { text: '每个人都有恐惧，但勇者选择面对。', author: '爱默生' },
  { text: '恐惧的反面不是勇气，是行动。', author: '埃克哈特·托利' },
  { text: '勇气是在绝望中保持希望的能力。', author: '加缪' },
  { text: '恐惧源于无知，勇气源于了解。', author: '爱默生' },
  { text: '害怕失败比失败本身更可怕。', author: '罗斯福' },
  { text: '勇气不是没有恐惧，而是对恐惧说"不"。', author: '乔治·巴顿' },
  { text: '最大的恐惧来自内心的想象。', author: '马可·奥勒留' },
  { text: '恐惧是束缚，勇气是解脱。', author: '佛陀' },
  { text: '一个人可以被毁灭，但不能被打败。', author: '海明威' },
  { text: '勇气是压力的优雅。', author: '海明威' },
  { text: '恐惧是思考的结果，勇气是行动的结果。', author: '亚里士多德' },
  { text: '我们最大的敌人不是别人，而是自己的恐惧。', author: '罗斯福' },
  { text: '恐惧使时间变慢，勇气使时间加速。', author: '爱因斯坦' },
  { text: '勇气不是没有软弱，而是克服软弱。', author: '塞缪尔·约翰逊' },
  { text: '恐惧是心灵的牢笼，勇气是打开牢笼的钥匙。', author: '爱比克泰德' },
  { text: '面对恐惧，就是战胜恐惧。', author: '爱默生' },
  { text: '勇者无惧，惧者不勇。', author: '孔子' },
  { text: '恐惧让人退缩，勇气让人前行。', author: '尼采' },
  { text: '真正的勇气是在黑暗中看见光明。', author: '罗曼·罗兰' },
  { text: '害怕死亡的人，其实从未真正活过。', author: '马可·奥勒留' },
  { text: '恐惧是心灵的毒药，勇气是心灵的良药。', author: '柏拉图' },
  { text: '勇气不是没有恐惧，而是控制恐惧。', author: '马克·吐温' },
  { text: '我们所恐惧的，往往是我们需要成长的领域。', author: '荣格' },
  { text: '恐惧让人保守，勇气让人创新。', author: '凯恩斯' },
  { text: '勇者不是不会害怕，而是选择继续前进。', author: '纳尔逊·曼德拉' },
  { text: '恐惧让我们活着，勇气让我们生活。', author: '亚里士多德' },
  { text: '没有恐惧的勇气不是勇气，是鲁莽。', author: '亚里士多德' },
  { text: '最大的勇气是承认自己的恐惧。', author: '纪伯伦' },
  { text: '恐惧是过去，勇气是现在。', author: '埃克哈特·托利' },
  { text: '勇气是智慧的产物，恐惧是无知的产物。', author: '柏拉图' },
  { text: '恐惧使人渺小，勇气使人伟大。', author: '爱默生' },
  { text: '面对恐惧，是成长的唯一途径。', author: '约瑟夫·坎贝尔' },
  { text: '勇气是在困难面前保持镇定。', author: '塞涅卡' },
  { text: '恐惧是想象的极限，勇气是行动的开始。', author: '萨特' },
  { text: '勇敢不是不流泪，而是含泪奔跑。', author: '哈珀·李' },
  { text: '恐惧是心灵的冬天，勇气是心灵的春天。', author: '纪伯伦' },
  { text: '人之所以能，是因为相信能。', author: '爱默生' },

  // ========== 6. 爱情与人际关系 ==========
  { text: '爱是理解的别名。', author: '泰戈尔' },
  { text: '真正的爱是给予，不是索取。', author: '纪伯伦' },
  { text: '爱是恒久忍耐，又有恩慈。', author: '圣经' },
  { text: '爱一个人就是在他身上看到自己的影子。', author: '尼采' },
  { text: '爱是灵魂的结合，不是身体的占有。', author: '柏拉图' },
  { text: '最深刻的爱情往往伴随着最深刻的痛苦。', author: '里尔克' },
  { text: '爱是看清一个人后依然爱他。', author: '圣埃克苏佩里' },
  { text: '爱不是彼此凝视，而是一起朝同一个方向看。', author: '圣埃克苏佩里' },
  { text: '最好的关系是彼此成就，互相滋养。', author: '亚里士多德' },
  { text: '爱是自由，不是占有。', author: '纪伯伦' },
  { text: '爱是看见对方的真实，而不是期待的样子。', author: '弗洛姆' },
  { text: '爱是桥梁，连接两个孤独的灵魂。', author: '弗洛姆' },
  { text: '真正的爱是接纳，不是改变。', author: '罗杰斯' },
  { text: '爱需要勇气，因为爱意味着脆弱。', author: '布朗' },
  { text: '爱是共同成长的旅程。', author: '荣格' },
  { text: '亲密关系的质量决定生命的质量。', author: '弗洛姆' },
  { text: '爱是承认对方是一个独立的个体。', author: '弗洛姆' },
  { text: '爱的对立面不是恨，是冷漠。', author: '埃里希·弗洛姆' },
  { text: '爱是给予自由，而不是控制。', author: '纪伯伦' },
  { text: '爱是心灵的艺术，需要学习和练习。', author: '弗洛姆' },
  { text: '爱一个人就是愿意为他改变。', author: '托尔斯泰' },
  { text: '爱是唯一的理性行为。', author: '帕斯卡尔' },
  { text: '真正的爱是看见对方的美好，而不是缺点。', author: '泰戈尔' },
  { text: '爱是分享，不是占有。', author: '罗曼·罗兰' },
  { text: '爱是生命的火焰，没有它一切变成黑夜。', author: '罗曼·罗兰' },
  { text: '爱是两个独立灵魂的相遇。', author: '里尔克' },
  { text: '最好的爱，是让你成为更好的自己。', author: '波伏娃' },
  { text: '爱是信任，不是怀疑。', author: '歌德' },
  { text: '爱是懂得，不是了解。', author: '徐志摩' },
  { text: '真正的爱是成全，不是占有。', author: '泰戈尔' },
  { text: '爱是灵魂的对话，不是言语的交流。', author: '里尔克' },
  { text: '爱是心灵的共振，不是单方面的付出。', author: '荣格' },
  { text: '爱是最深刻的理解。', author: '马丁·布伯' },
  { text: '爱是当你看透了一个人，依然选择留下。', author: '圣埃克苏佩里' },
  { text: '爱是两个不完美的人，拒绝放弃彼此。', author: '萨姆·基恩' },
  { text: '爱不是找到完美的人，而是学会用完美的眼光看不完美的人。', author: '萨姆·基恩' },
  { text: '爱是彼此陪伴，共同成长。', author: '弗洛姆' },
  { text: '真正的爱是无条件的接纳。', author: '罗杰斯' },
  { text: '爱是让两个人都自由的关系。', author: '纪伯伦' },
  { text: '爱是一种选择，不是一种感觉。', author: '史蒂芬·柯维' },
  { text: '爱是包容，不是忍受。', author: '泰戈尔' },
  { text: '爱是承认彼此的不同，珍惜彼此的相同。', author: '约翰·戈特曼' },
  { text: '爱是心灵的相遇，不是身体的靠近。', author: '里尔克' },
  { text: '爱是世界上最强大的力量。', author: '甘地' },
  { text: '真正的爱不求回报，但自然而然地会得到回报。', author: '老子' },
  { text: '爱是看见对方的痛苦，并愿意分担。', author: '弗洛姆' },
  { text: '爱是允许对方做自己。', author: '罗杰斯' },
  { text: '爱是彼此的镜子，照见真实的自己。', author: '荣格' },
  { text: '爱是生命的最高形式。', author: '黑格尔' },
  { text: '爱是彼此成就，而不是互相消耗。', author: '弗洛姆' },
  { text: '爱不是彼此需要，而是彼此给予。', author: '纪伯伦' },

  // ========== 7. 孤独与联结 ==========
  { text: '孤独是生命的本质，联结是生命的意义。', author: '弗洛姆' },
  { text: '人是社会性动物，孤独是对人的惩罚。', author: '亚里士多德' },
  { text: '最深的孤独是在人群中依然感到孤单。', author: '保罗·奥斯特' },
  { text: '孤独是与自己相处的艺术。', author: '叔本华' },
  { text: '只有能享受孤独的人，才能真正享受联结。', author: '尼采' },
  { text: '孤独让人思考，思考让人孤独。', author: '帕斯卡尔' },
  { text: '人是孤独的，但正是在孤独中我们寻找联结。', author: '萨特' },
  { text: '最深的联结发生在灵魂层面，而非言语层面。', author: '马丁·布伯' },
  { text: '孤独是创造者的朋友，是庸人的敌人。', author: '里尔克' },
  { text: '我们生来孤独，却渴望被理解。', author: '卡夫卡' },
  { text: '真正的孤独不是身边无人，而是心中无人。', author: '里尔克' },
  { text: '人需要独处来认识自己，需要交往来实现自己。', author: '亚里士多德' },
  { text: '孤独是灵魂的净化，也是灵魂的考验。', author: '托马斯·默顿' },
  { text: '在人群中保持独立，是智者的选择。', author: '爱默生' },
  { text: '我们越是忙碌，越感到孤独。', author: '卡夫卡' },
  { text: '孤独是自我发现的必经之路。', author: '荣格' },
  { text: '没有人是一座孤岛，每个人都是大陆的一部分。', author: '约翰·多恩' },
  { text: '最深的孤独是与自己的灵魂失去联系。', author: '里尔克' },
  { text: '孤独让人听到内心的声音。', author: '梭罗' },
  { text: '联结的本质是分享真实的自我。', author: '布朗' },
  { text: '孤独是存在的本质状态。', author: '海德格尔' },
  { text: '我们需要独处来恢复，需要交往来成长。', author: '荣格' },
  { text: '孤独是思考的条件，联结是行动的动力。', author: '亚里士多德' },
  { text: '真正的交流不需要语言。', author: '庄子' },
  { text: '孤独是智者的伴侣，是愚者的敌人。', author: '叔本华' },
  { text: '我们在人群中寻找自己，在独处中发现自己。', author: '里尔克' },
  { text: '最深的孤独是被误解。', author: '卡夫卡' },
  { text: '联结需要勇气，因为它意味着脆弱。', author: '布朗' },
  { text: '孤独是内省的机会，联结是扩展的机会。', author: '荣格' },
  { text: '人是被抛入世界的孤独存在。', author: '海德格尔' },
  { text: '真正的友谊是两个孤独灵魂的相遇。', author: '里尔克' },
  { text: '孤独让人谦逊，联结让人强大。', author: '爱默生' },
  { text: '我们在孤独中面对自己，在联结中面对世界。', author: '萨特' },
  { text: '孤独是灵魂的深度，联结是灵魂的广度。', author: '马丁·布伯' },
  { text: '最深的联结是无言的。', author: '庄子' },
  { text: '孤独是智慧的开端。', author: '帕斯卡尔' },
  { text: '人只有在独处时才能成为自己。', author: '叔本华' },
  { text: '孤独是创造的土壤。', author: '里尔克' },
  { text: '我们生来孤独，却渴望归属。', author: '弗洛姆' },
  { text: '孤独让人安静，安静让人智慧。', author: '老子' },
  { text: '真正的交流是心与心的对话。', author: '马丁·布伯' },
  { text: '孤独是灵魂的独白，联结是灵魂的和声。', author: '里尔克' },
  { text: '最深的孤独是与自己的距离。', author: '荣格' },
  { text: '孤独是自由的代价，联结是爱的回报。', author: '弗洛姆' },
  { text: '人在独处时最接近神性。', author: '爱默生' },
  { text: '孤独不是被遗弃，而是选择。', author: '梭罗' },
  { text: '联结的深浅取决于我们暴露真实的程度。', author: '布朗' },
  { text: '孤独是精神的苦行，也是精神的盛宴。', author: '托马斯·默顿' },
  { text: '我们在孤独中认识自己，在爱中超越自己。', author: '弗洛姆' },
  { text: '孤独是生命的底色，联结是生命的亮色。', author: '里尔克' },

  // ========== 8. 成长与蜕变 ==========
  { text: '痛苦是成长的催化剂。', author: '尼采' },
  { text: '没有痛苦，就没有意识的觉醒。', author: '荣格' },
  { text: '成长就是不断突破舒适区的过程。', author: '马斯洛' },
  { text: '变化是唯一的恒定，适应是唯一的选择。', author: '赫拉克利特' },
  { text: '人的潜能是无限的，限制只在心中。', author: '威廉·詹姆斯' },
  { text: '每一次挫折都是成长的机会。', author: '尼采' },
  { text: '成长意味着不断放下过去的自己。', author: '荣格' },
  { text: '蜕变需要打破旧有的壳。', author: '庄子' },
  { text: '人在压力下成长，在安逸中退化。', author: '尼采' },
  { text: '成长的代价是痛苦，不成长的代价是更大的痛苦。', author: '萨特' },
  { text: '认识自己是成长的第一步。', author: '苏格拉底' },
  { text: '真正的成长是心智的成熟，不是年龄的增长。', author: '荣格' },
  { text: '改变始于接受现实。', author: '荣格' },
  { text: '成长是螺旋式上升的过程。', author: '黑格尔' },
  { text: '苦难是人生最好的老师。', author: '塞涅卡' },
  { text: '人的价值在于不断超越自己。', author: '尼采' },
  { text: '成长需要勇气面对真实的自己。', author: '罗杰斯' },
  { text: '每一次危机都是转机。', author: '老子' },
  { text: '成熟是学会在不确定中前行。', author: '埃克哈特·托利' },
  { text: '成长是意识到自己的无知。', author: '苏格拉底' },
  { text: '痛苦不是惩罚，而是成长的邀请。', author: '荣格' },
  { text: '人在挑战中发现自己的力量。', author: '尼采' },
  { text: '成长是持续的自我更新。', author: '约翰·加德纳' },
  { text: '改变不可能一蹴而就，但可以随时开始。', author: '老子' },
  { text: '最大的成长发生在最困难的时刻。', author: '尼采' },
  { text: '成熟是学会与不确定性共处。', author: '埃克哈特·托利' },
  { text: '成长是放下执念的过程。', author: '佛陀' },
  { text: '真正的力量来自内在的成长。', author: '老子' },
  { text: '人在困境中才能真正认识自己。', author: '塞涅卡' },
  { text: '成长是一个终生的过程。', author: '卡尔·罗杰斯' },
  { text: '改变始于觉察，成于行动。', author: '荣格' },
  { text: '痛苦是通往智慧的桥梁。', author: '佛陀' },
  { text: '人的成长就是不断突破自我设限。', author: '马斯洛' },
  { text: '成熟是接受生活的不完美。', author: '荣格' },
  { text: '每一次失败都是成功的垫脚石。', author: '爱迪生' },
  { text: '成长需要面对自己的阴影。', author: '荣格' },
  { text: '人在逆境中成长，在顺境中享受。', author: '塞涅卡' },
  { text: '真正的成长是心智的开阔。', author: '孔子' },
  { text: '改变需要时间，但决心可以立即做出。', author: '老子' },
  { text: '成长是学会对自己负责。', author: '萨特' },
  { text: '痛苦是灵魂的学校。', author: '纪伯伦' },
  { text: '人的潜能需要压力才能释放。', author: '尼采' },
  { text: '成长是不断超越昨天的自己。', author: '松下幸之助' },
  { text: '蜕变是痛苦的，但结果是美好的。', author: '庄子' },
  { text: '成熟是学会在风雨中跳舞。', author: '维维安·格林' },
  { text: '成长是意识到自己的责任。', author: '萨特' },
  { text: '每一次挫折都是上天的考验。', author: '老子' },
  { text: '人在危机中成长最快。', author: '荣格' },
  { text: '成长是学会爱真实的自己。', author: '罗杰斯' },
  { text: '改变是生命的本质，抗拒改变是痛苦的根源。', author: '佛陀' },

  // ========== 9. 记忆与遗忘 ==========
  { text: '记忆是灵魂的日记。', author: '塞缪尔·约翰逊' },
  { text: '遗忘是心灵的自我保护机制。', author: '弗洛伊德' },
  { text: '我们记住的不是过去，而是关于过去的记忆。', author: '普鲁斯特' },
  { text: '记忆是时间的建筑。', author: '博尔赫斯' },
  { text: '遗忘是另一种形式的记忆。', author: '尼采' },
  { text: '记忆重构了过去，遗忘保护了现在。', author: '弗洛伊德' },
  { text: '美好的记忆是灵魂的财富。', author: '亚里士多德' },
  { text: '遗忘让我们得以继续生活。', author: '米兰·昆德拉' },
  { text: '记忆是过去与现在的对话。', author: '哈布瓦赫' },
  { text: '我们选择性记忆，选择性遗忘。', author: '弗洛伊德' },
  { text: '记忆是身份的基石。', author: '洛克' },
  { text: '遗忘是治疗伤痛的良药。', author: '尼采' },
  { text: '记忆不是仓库，而是重建的过程。', author: '巴特莱特' },
  { text: '我们记得的往往是情感最强烈的瞬间。', author: '弗洛伊德' },
  { text: '记忆让过去永存，遗忘让现在自由。', author: '米兰·昆德拉' },
  { text: '童年记忆塑造了我们的人格。', author: '弗洛伊德' },
  { text: '遗忘是为了更好地记住重要的东西。', author: '威廉·詹姆斯' },
  { text: '记忆是一种创造性的行为。', author: '普鲁斯特' },
  { text: '我们记住的是感受，不是事实。', author: '丹尼尔·卡尼曼' },
  { text: '遗忘让心灵得到休息。', author: '庄子' },
  { text: '记忆是时间的艺术。', author: '普鲁斯特' },
  { text: '创伤记忆需要被重新讲述才能治愈。', author: '朱迪斯·赫尔曼' },
  { text: '记忆让我们成为自己。', author: '约翰·洛克' },
  { text: '遗忘是大脑的自净功能。', author: '弗洛伊德' },
  { text: '美好的回忆是心灵的避风港。', author: '塞涅卡' },
  { text: '记忆是会骗人的，它服务于现在的需要。', author: '弗洛伊德' },
  { text: '遗忘不是记忆的缺失，而是记忆的选择。', author: '尼采' },
  { text: '记忆是过去的复活。', author: '亚里士多德' },
  { text: '我们记得的，往往是那些定义了我们的时刻。', author: '萨特' },
  { text: '遗忘是为了前进。', author: '米兰·昆德拉' },
  { text: '记忆是灵魂的胶片。', author: '普鲁斯特' },
  { text: '集体记忆构成了文化认同。', author: '哈布瓦赫' },
  { text: '遗忘有时候比记忆更仁慈。', author: '尼采' },
  { text: '记忆是重述，不是复制。', author: '当代心理学' },
  { text: '痛苦的记忆需要被遗忘才能愈合。', author: '弗洛伊德' },
  { text: '记忆让死者继续活在生者心中。', author: '犹太谚语' },
  { text: '我们记住的，是我们愿意相信的。', author: '弗洛伊德' },
  { text: '遗忘是心灵的治愈师。', author: '庄子' },
  { text: '记忆是时间的桥梁。', author: '圣奥古斯丁' },
  { text: '童年的记忆影响一生。', author: '弗洛伊德' },
  { text: '遗忘让我们轻装前行。', author: '老子' },
  { text: '记忆是自我意识的根源。', author: '约翰·洛克' },
  { text: '我们选择性遗忘以保护自己。', author: '弗洛伊德' },
  { text: '美好的记忆是精神的养分。', author: '塞涅卡' },
  { text: '记忆重构了现实。', author: '巴特莱特' },
  { text: '遗忘是生命的智慧。', author: '庄子' },
  { text: '记忆让我们与过去对话。', author: '普鲁斯特' },
  { text: '创伤会被记住，也会被遗忘。', author: '朱迪斯·赫尔曼' },
  { text: '记忆是灵魂的镜子。', author: '普鲁斯特' },
  { text: '遗忘让新的开始成为可能。', author: '尼采' },
  { text: '记忆是意识的连续性。', author: '约翰·洛克' },

  // ========== 10. 存在的意义 ==========
  { text: '存在先于本质，人必须自己创造意义。', author: '萨特' },
  { text: '生命的意义在于赋予生命意义。', author: '弗兰克尔' },
  { text: '人是悬挂在自己编织的意义之网上的动物。', author: '韦伯' },
  { text: '存在的荒诞是人必须面对的真相。', author: '加缪' },
  { text: '追问意义本身就是意义所在。', author: '海德格尔' },
  { text: '人在苦难中找到意义，在意义中战胜苦难。', author: '弗兰克尔' },
  { text: '存在就是选择，选择就是自由。', author: '萨特' },
  { text: '生命的意义不在远方，在当下。', author: '埃克哈特·托利' },
  { text: '人必须自己回答存在的意义。', author: '萨特' },
  { text: '虚无是自由的开始。', author: '萨特' },
  { text: '存在的意义在于超越自我。', author: '弗兰克尔' },
  { text: '荒诞是人与世界的分离。', author: '加缪' },
  { text: '追问"为什么"是人类的特权。', author: '弗兰克尔' },
  { text: '生命的意义是爱和工作。', author: '弗洛伊德' },
  { text: '人因为意识到死亡而追问意义。', author: '海德格尔' },
  { text: '存在是没有预设剧本的即兴表演。', author: '萨特' },
  { text: '意义不在事物本身，而在我们赋予事物的价值。', author: '韦伯' },
  { text: '承认荒诞，然后反抗荒诞，就是意义。', author: '加缪' },
  { text: '人是唯一追问存在意义的动物。', author: '海德格尔' },
  { text: '生命的意义是找到值得为之而活的东西。', author: '弗兰克尔' },
  { text: '存在本身就是意义。', author: '老子' },
  { text: '人通过创造来肯定自己的存在。', author: '萨特' },
  { text: '意义是关系的产物。', author: '马丁·布伯' },
  { text: '虚无是意义的背景。', author: '萨特' },
  { text: '人在选择中定义自己。', author: '萨特' },
  { text: '存在的焦虑来自对自由的意识。', author: '萨特' },
  { text: '意义来自与他人的联结。', author: '弗兰克尔' },
  { text: '生活没有预设的意义，意义是我们创造的。', author: '萨特' },
  { text: '面对虚无，人选择成为什么就是什么。', author: '萨特' },
  { text: '意义在行动中显现。', author: '亚里士多德' },
  { text: '人因为意识到时间而追问永恒。', author: '海德格尔' },
  { text: '存在的意义在于超越有限。', author: '弗兰克尔' },
  { text: '生命本无意义，但人可以赋予它意义。', author: '加缪' },
  { text: '追问意义的过程比答案更重要。', author: '海德格尔' },
  { text: '人是意义的制造者。', author: '萨特' },
  { text: '存在的勇气是接受没有保证的生命。', author: '蒂利希' },
  { text: '意义在苦难中变得更加清晰。', author: '弗兰克尔' },
  { text: '人通过选择成为自己。', author: '萨特' },
  { text: '存在的本质是不确定性。', author: '海德格尔' },
  { text: '意义来自于对某种价值的承诺。', author: '弗兰克尔' },
  { text: '生活没有终极答案，只有持续的追问。', author: '苏格拉底' },
  { text: '存在的意义在于创造美。', author: '尼采' },
  { text: '人在承担中找到存在的重量。', author: '米兰·昆德拉' },
  { text: '意义是流动的，不是固定的。', author: '威廉·詹姆斯' },
  { text: '存在的焦虑是觉醒的开始。', author: '蒂利希' },
  { text: '生命的意义在于服务他人。', author: '托尔斯泰' },
  { text: '人因为意识到虚无而创造意义。', author: '萨特' },
  { text: '存在的意义在于体验。', author: '埃克哈特·托利' },
  { text: '追问意义是存在的本质特征。', author: '海德格尔' },
  { text: '人在关系中找到存在的意义。', author: '马丁·布伯' },
  { text: '意义不是找到的，而是创造的。', author: '弗兰克尔' },

  // ========== 额外经典名言 ==========
  { text: '未经审视的人生不值得过。', author: '苏格拉底' },
  { text: '知人者智，自知者明。', author: '老子' },
  { text: '人生而自由，却无往不在枷锁之中。', author: '卢梭' },
  { text: '我思故我在。', author: '笛卡尔' },
  { text: '存在即合理。', author: '黑格尔' },
  { text: '上帝死了，是我们杀死了他。', author: '尼采' },
  { text: '他人即地狱。', author: '萨特' },
  { text: '一切都是有代价的。', author: '浮士德' },
  { text: '人是万物的尺度。', author: '普罗泰戈拉' },
  { text: '认识你自己。', author: '德尔斐神谕' },
  { text: '万物皆有裂痕，那是光照进来的地方。', author: '莱昂纳德·科恩' },
  { text: '生如夏花之绚烂，死如秋叶之静美。', author: '泰戈尔' },
  { text: '世界上只有一种英雄主义，就是看清生活的真相后依然热爱生活。', author: '罗曼·罗兰' },
  { text: '既然选择了远方，便只顾风雨兼程。', author: '汪国真' },
  { text: '黑夜给了我黑色的眼睛，我却用它寻找光明。', author: '顾城' },
  { text: '面朝大海，春暖花开。', author: '海子' },
  { text: '生活不止眼前的苟且，还有诗和远方。', author: '高晓松' },
  { text: '人生若只如初见，何事秋风悲画扇。', author: '纳兰性德' },
  { text: '人生如逆旅，我亦是行人。', author: '苏轼' },
  { text: '众里寻他千百度，蓦然回首，那人却在，灯火阑珊处。', author: '辛弃疾' },
  { text: '问君能有几多愁，恰似一江春水向东流。', author: '李煜' },
  { text: '不以物喜，不以己悲。', author: '范仲淹' },
  { text: '先天下之忧而忧，后天下之乐而乐。', author: '范仲淹' },
  { text: '路漫漫其修远兮，吾将上下而求索。', author: '屈原' },
  { text: '天行健，君子以自强不息。', author: '周易' },
  { text: '地势坤，君子以厚德载物。', author: '周易' },
  { text: '己所不欲，勿施于人。', author: '孔子' },
  { text: '学而不思则罔，思而不学则殆。', author: '孔子' },
  { text: '三人行，必有我师焉。', author: '孔子' },
  { text: '工欲善其事，必先利其器。', author: '孔子' },
  { text: '千里之行，始于足下。', author: '老子' },
  { text: '祸兮福之所倚，福兮祸之所伏。', author: '老子' },
  { text: '上善若水，水善利万物而不争。', author: '老子' },
  { text: '大音希声，大象无形。', author: '老子' },
  { text: '道可道，非常道；名可名，非常名。', author: '老子' },
  { text: '天地不仁，以万物为刍狗。', author: '老子' },
  { text: '吾生也有涯，而知也无涯。', author: '庄子' },
  { text: '子非鱼，安知鱼之乐？', author: '庄子' },
  { text: '相濡以沫，不如相忘于江湖。', author: '庄子' },
  { text: '吾善养吾浩然之气。', author: '孟子' },
  { text: '天时不如地利，地利不如人和。', author: '孟子' },
  { text: '生于忧患，死于安乐。', author: '孟子' },
  { text: '穷则独善其身，达则兼济天下。', author: '孟子' },
  { text: '人固有一死，或重于泰山，或轻于鸿毛。', author: '司马迁' },
  { text: '精诚所至，金石为开。', author: '王充' },
  { text: '非淡泊无以明志，非宁静无以致远。', author: '诸葛亮' },
  { text: '勿以恶小而为之，勿以善小而不为。', author: '刘备' },
  { text: '读书破万卷，下笔如有神。', author: '杜甫' },
  { text: '纸上得来终觉浅，绝知此事要躬行。', author: '陆游' },
  { text: '问渠那得清如许，为有源头活水来。', author: '朱熹' },
  { text: '山重水复疑无路，柳暗花明又一村。', author: '陆游' },
  { text: '宝剑锋从磨砺出，梅花香自苦寒来。', author: '古诗' },
  { text: '书山有路勤为径，学海无涯苦作舟。', author: '韩愈' },
  { text: '业精于勤，荒于嬉；行成于思，毁于随。', author: '韩愈' },
  { text: '春蚕到死丝方尽，蜡炬成灰泪始干。', author: '李商隐' },
  { text: '两情若是久长时，又岂在朝朝暮暮。', author: '秦观' },
  { text: '曾经沧海难为水，除却巫山不是云。', author: '元稹' },
  { text: '莫愁前路无知己，天下谁人不识君。', author: '高适' },
  { text: '海内存知己，天涯若比邻。', author: '王勃' },
  { text: '落红不是无情物，化作春泥更护花。', author: '龚自珍' },
  { text: '采菊东篱下，悠然见南山。', author: '陶渊明' },
  { text: '长风破浪会有时，直挂云帆济沧海。', author: '李白' },
  { text: '天生我材必有用，千金散尽还复来。', author: '李白' },
  { text: '会当凌绝顶，一览众山小。', author: '杜甫' },
  { text: '沉舟侧畔千帆过，病树前头万木春。', author: '刘禹锡' },
  { text: '野火烧不尽，春风吹又生。', author: '白居易' },
  { text: '出淤泥而不染，濯清涟而不妖。', author: '周敦颐' },
  { text: '莫听穿林打叶声，何妨吟啸且徐行。', author: '苏轼' },
  { text: '也无风雨也无晴。', author: '苏轼' },
  { text: '人有悲欢离合，月有阴晴圆缺，此事古难全。', author: '苏轼' },
  { text: '但愿人长久，千里共婵娟。', author: '苏轼' },
  { text: '大江东去，浪淘尽，千古风流人物。', author: '苏轼' },
  { text: '人生到处知何似，应似飞鸿踏雪泥。', author: '苏轼' },
  { text: '竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。', author: '苏轼' },
  { text: '不识庐山真面目，只缘身在此山中。', author: '苏轼' },
  { text: '欲把西湖比西子，淡妆浓抹总相宜。', author: '苏轼' },
  { text: '山不在高，有仙则名；水不在深，有龙则灵。', author: '刘禹锡' },
  { text: '夫君子之行，静以修身，俭以养德。', author: '诸葛亮' },
  { text: '士不可以不弘毅，任重而道远。', author: '曾子' },
  { text: '君子坦荡荡，小人长戚戚。', author: '孔子' },
  { text: '己欲立而立人，己欲达而达人。', author: '孔子' },
  { text: '见贤思齐焉，见不贤而内自省也。', author: '孔子' },
  { text: '岁寒，然后知松柏之后凋也。', author: '孔子' },
  { text: '逝者如斯夫，不舍昼夜。', author: '孔子' },
  { text: '知者乐水，仁者乐山。', author: '孔子' },
  { text: '学如不及，犹恐失之。', author: '孔子' },
  { text: '敏而好学，不耻下问。', author: '孔子' },
  { text: '学而不厌，诲人不倦。', author: '孔子' },
  { text: '温故而知新，可以为师矣。', author: '孔子' },
  { text: '朝闻道，夕死可矣。', author: '孔子' },
  { text: '人无远虑，必有近忧。', author: '孔子' },
  { text: '君子和而不同，小人同而不和。', author: '孔子' },
  { text: '君子求诸己，小人求诸人。', author: '孔子' },
  { text: '质胜文则野，文胜质则史。文质彬彬，然后君子。', author: '孔子' },
  { text: '知者不惑，仁者不忧，勇者不惧。', author: '孔子' },
  { text: '过而不改，是谓过矣。', author: '孔子' },
  { text: '不患人之不己知，患不知人也。', author: '孔子' },
  { text: '德不孤，必有邻。', author: '孔子' },
  { text: '听其言而观其行。', author: '孔子' },
  { text: '富贵不能淫，贫贱不能移，威武不能屈，此之谓大丈夫。', author: '孟子' },
  { text: '得道者多助，失道者寡助。', author: '孟子' },
  { text: '民为贵，社稷次之，君为轻。', author: '孟子' },
  { text: '老吾老，以及人之老；幼吾幼，以及人之幼。', author: '孟子' },
  { text: '天将降大任于是人也，必先苦其心志，劳其筋骨。', author: '孟子' },
  { text: '爱人者，人恒爱之；敬人者，人恒敬之。', author: '孟子' },
  { text: '权，然后知轻重；度，然后知长短。', author: '孟子' },
  { text: '人有不为也，而后可以有为。', author: '孟子' },
  { text: '不以规矩，不能成方圆。', author: '孟子' },
  { text: '人皆可以为尧舜。', author: '孟子' },
  { text: '知行合一。', author: '王阳明' },
  { text: '心外无物，心外无事，心外无理。', author: '王阳明' },
  { text: '志不立，天下无可成之事。', author: '王阳明' },
  { text: '不贵于无过，而贵于能改过。', author: '王阳明' },
  { text: '破山中贼易，破心中贼难。', author: '王阳明' },
  { text: '此心光明，亦复何言。', author: '王阳明' },
  { text: '种树者必培其根，种德者必养其心。', author: '王阳明' },
  { text: '千圣皆过影，良知乃吾师。', author: '王阳明' },
  { text: '人生大病，只是一傲字。', author: '王阳明' },
  { text: '无善无恶心之体，有善有恶意之动。', author: '王阳明' },
  { text: '天地虽大，但有一念向善，心存良知，虽凡夫俗子，皆可为圣贤。', author: '王阳明' },
  { text: '你未看此花时，此花与汝心同归于寂。', author: '王阳明' },
  { text: '持志如心痛，一心在痛上，岂有功夫说闲话。', author: '王阳明' },
  { text: '悔悟是去病之药，然以改之为贵。', author: '王阳明' },
  { text: '志不立，如无舵之舟，无衔之马。', author: '王阳明' },
  { text: '常快活便是功夫。', author: '王阳明' }

]

function buildRenamedDocument(document: MindMapDocument, title: string): MindMapDocument {
  return {
    ...document,
    title,
    updatedAt: Date.now(),
  }
}

function formatUpdatedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

export function HomePage({ service = documentService }: HomePageProps) {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [query, setQuery] = useState('')
  const [recentId, setRecentIdState] = useState<string | null>(() => getRecentDocumentId())
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [brandQuote] = useState(() => HOME_QUOTES[Math.floor(Math.random() * HOME_QUOTES.length)] ?? HOME_QUOTES[0])
  const deferredQuery = useDeferredValue(query)

  const recentDocument = useMemo(
    () => documents.find((document) => document.id === recentId) ?? documents[0] ?? null,
    [documents, recentId],
  )
  const filteredDocuments = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return documents
    }

    return documents.filter((document) => document.title.toLowerCase().includes(normalizedQuery))
  }, [deferredQuery, documents])

  const refreshDocuments = useCallback(async () => {
    setLoading(true)
    const nextDocuments = await service.listDocuments()
    setDocuments(nextDocuments)
    setRecentIdState(getRecentDocumentId())
    setLoading(false)
  }, [service])

  useEffect(() => {
    const frameId = window.setTimeout(() => {
      void refreshDocuments()
    }, 0)

    return () => window.clearTimeout(frameId)
  }, [refreshDocuments])

  const openDocument = (id: string) => {
    setRecentDocumentId(id)
    setRecentIdState(id)
    navigate(`/map/${id}`)
  }

  const handleCreate = async () => {
    const document = await service.createDocument()
    openDocument(document.id)
  }

  const beginRename = (document: DocumentSummary) => {
    setEditingId(document.id)
    setDraftTitle(document.title)
  }

  const commitRename = async (documentId: string) => {
    const normalizedTitle = draftTitle.trim()
    setEditingId(null)

    if (!normalizedTitle) {
      setDraftTitle('')
      return
    }

    const document = await service.getDocument(documentId)
    if (!document || document.title === normalizedTitle) {
      await refreshDocuments()
      return
    }

    await service.saveDocument(buildRenamedDocument(document, normalizedTitle))
    await refreshDocuments()
  }

  const cancelRename = () => {
    setEditingId(null)
    setDraftTitle('')
  }

  const handleDuplicate = async (documentId: string) => {
    const duplicatedId = await service.duplicateDocument(documentId)
    setRecentDocumentId(duplicatedId)
    await refreshDocuments()
  }

  const handleDelete = (documentId: string) => {
    setDeleteTargetId(documentId)
    setDeleteConfirmText('')
    setDeleteError('')
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (deleteConfirmText !== 'Delete it') {
      setDeleteError('请输入 "Delete it" 以确认删除')
      return
    }
    if (deleteTargetId) {
      await service.deleteDocument(deleteTargetId)
      await refreshDocuments()
    }
    setDeleteDialogOpen(false)
    setDeleteTargetId(null)
    setDeleteConfirmText('')
    setDeleteError('')
  }

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false)
    setDeleteTargetId(null)
    setDeleteConfirmText('')
    setDeleteError('')
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarBrand}>
          <span className={styles.wordmark}>BrainFlow</span>
        </div>
        <div className={styles.brandQuote}>
          <span className={styles.brandQuoteText}>{brandQuote.text}</span>
        </div>
        <Button tone="ghost" size="sm" iconStart="settings" onClick={() => navigate('/settings')}>
          数据存储与同步
        </Button>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>

          <div className={styles.heroText}>
            <h1 className={styles.title}>你的思考，只属于你</h1>
            <p className={styles.subtitle}>BrainFlow 让发散的思维自然生长成结构。</p>
          </div>
          <ToolbarGroup className={styles.heroActions}>
            <Button tone="primary" size="lg" iconStart="add" onClick={handleCreate}>
              新建脑图
            </Button>
            {recentDocument ? (
              <Button
                tone="primary"
                size="lg"
                iconStart="history"
                onClick={() => openDocument(recentDocument.id)}
                style={{ backgroundColor: '#f97316', borderColor: '#f97316' }}
              >
                继续最近文档
              </Button>
            ) : null}
          </ToolbarGroup>
        </div>
        <div className={styles.heroVisual}>
          <NetworkConstellation />
        </div>
      </section>

      <section className={styles.workspace}>
        <div className={styles.sectionHead}>
          <SearchField
            aria-label="搜索文档"
            className={styles.searchField}
            placeholder="搜索文档..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <SurfacePanel frosted className={styles.list}>
          <div className={styles.tableHead}>
            <span className={styles.colName}>名称</span>
            <span className={styles.colMetric}>主题数</span>
            <span className={styles.colDate}>最后修改</span>
            <span className={styles.colActions}>操作</span>
          </div>
          {loading ? (
            <div className={styles.emptyState}>正在读取本地文档…</div>
          ) : documents.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>还没有脑图</p>
              <p className={styles.emptyText}>先创建一份新文档，中心主题和两条一级分支会自动准备好。</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>没有匹配的文档</p>
              <p className={styles.emptyText}>试试其他关键词，或者直接创建新的脑图工作流。</p>
            </div>
          ) : (
            filteredDocuments.map((document) => {
              const isEditing = editingId === document.id
              const isRecent = recentDocument?.id === document.id

              return (
                <article
                  key={document.id}
                  className={styles.row}
                  onClick={() => openDocument(document.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openDocument(document.id)
                    }
                  }}
                  tabIndex={0}
                >
                  <div className={styles.rowMain}>
                    <span
                      className={styles.colorDot}
                      style={{ backgroundColor: document.previewColor, color: document.previewColor }}
                      aria-hidden="true"
                    />
                    <div className={styles.rowCopy}>
                      <div className={styles.rowTitleLine}>
                        {isEditing ? (
                          <input
                            aria-label="重命名脑图"
                            className={styles.renameInput}
                            value={draftTitle}
                            autoFocus
                            onChange={(event) => setDraftTitle(event.target.value)}
                            onBlur={() => void commitRename(document.id)}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                void commitRename(document.id)
                              }

                              if (event.key === 'Escape') {
                                event.preventDefault()
                                cancelRename()
                              }
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className={styles.nameButton}
                            onDoubleClick={(event) => {
                              event.stopPropagation()
                              beginRename(document)
                            }}
                          >
                            {document.title}
                          </button>
                        )}
                        {isRecent ? <StatusPill tone="accent">最近打开</StatusPill> : null}
                      </div>
                      <p className={styles.meta}>
                        {document.topicCount} 个主题 · 最近更新于 {formatUpdatedAt(document.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <div className={styles.rowMetric}>{document.topicCount}</div>
                  <div className={styles.rowMetric}>{formatUpdatedAt(document.updatedAt)}</div>

                  <div className={styles.rowActions}>
                    <Button
                      tone="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation()
                        beginRename(document)
                      }}
                    >
                      重命名
                    </Button>
                    <Button
                      tone="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation()
                        void handleDuplicate(document.id)
                      }}
                    >
                      复制
                    </Button>
                    <Button
                      tone="ghost"
                      size="sm"
                      style={{ color: '#ef4444' }}
                      onClick={(event) => {
                        event.stopPropagation()
                        void handleDelete(document.id)
                      }}
                    >
                      删除
                    </Button>
                  </div>
                </article>
              )
            })
          )}
        </SurfacePanel>
      </section>

      {deleteDialogOpen && (
        <div className={styles.dialogOverlay} onClick={handleCancelDelete}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.dialogTitle}>确认删除</h3>
            <p className={styles.dialogText}>此操作不可撤销。请输入 "Delete it" 以确认删除。</p>
            <input
              type="text"
              className={styles.dialogInput}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              onPaste={(e) => e.preventDefault()}
              placeholder="Delete it"
              autoFocus
            />
            {deleteError && <p className={styles.dialogError}>{deleteError}</p>}
            <div className={styles.dialogActions}>
              <Button tone="primary" onClick={handleCancelDelete}>
                取消
              </Button>
              <Button
                tone="danger"
                onClick={() => void handleConfirmDelete()}
                disabled={deleteConfirmText !== 'Delete it'}
              >
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}

      <footer className={styles.footer}>
        <div className={styles.footerSection}>
          <span className={styles.footerLabel}>本地模式</span>
          <span className={styles.footerValue}>自动保存 / 离线优先 / 无云依赖</span>
        </div>
        <div className={styles.footerSection}>
          <span className={styles.footerLabel}>本地存储</span>
          <span className={styles.footerValue}>IndexedDB / localStorage</span>
        </div>
        <div className={styles.footerSection}>
          <span className={styles.footerLabel}>工作区状态</span>
          <span className={styles.footerValue}>
            {loading ? '正在准备…' : `${documents.length} 份脑图 · Atelier Slate`}
          </span>
        </div>
      </footer>
    </main>
  )
}
