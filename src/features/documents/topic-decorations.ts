import type { TopicMarker, TopicSticker } from './types'

export const topicMarkerLabels: Record<TopicMarker, string> = {
  important: '重点',
  question: '问题',
  idea: '灵感',
  warning: '风险',
  decision: '决策',
  blocked: '阻塞',
}

export const topicStickerLabels: Record<TopicSticker, string> = {
  smile: '开心',
  party: '庆祝',
  heart: '喜欢',
  star: '星标',
  fire: '火花',
  rocket: '冲刺',
  bulb: '想法',
  target: '目标',
  coffee: '咖啡',
  clap: '鼓掌',
  rainbow: '彩虹',
  sparkles: '闪耀',
}

export const topicStickerGlyphs: Record<TopicSticker, string> = {
  smile: '😊',
  party: '🥳',
  heart: '💙',
  star: '⭐',
  fire: '🔥',
  rocket: '🚀',
  bulb: '💡',
  target: '🎯',
  coffee: '☕',
  clap: '👏',
  rainbow: '🌈',
  sparkles: '✨',
}
