import { ref, type Ref } from 'vue'

import { formatApiError } from '@/lib/http'
import { fetchMatchChat, sendMatchChat } from '@/modules/games/gameApi'
import { isParticipant } from '@/modules/games/lib/gameFormat'
import type { GameChatChannel, GameChatMessage, GameMatch } from '@/types/games'

const MAX_CHAT_MESSAGES = 240

export interface ChatModuleDeps {
  currentMatch: Ref<GameMatch | null>
  ownUserId: Ref<string>
  opponentUserId: Ref<string | null>
}

/** 对局聊天：公开频道与选手私聊，约战不提供聊天。 */
export function createChatModule(deps: ChatModuleDeps) {
  const { currentMatch, ownUserId, opponentUserId } = deps

  const chatMessages = ref<GameChatMessage[]>([])
  const chatLoading = ref(false)
  const chatError = ref('')
  const chatSending = ref(false)

  function mergeChatMessage(message: GameChatMessage) {
    if (chatMessages.value.some((entry) => entry.id === message.id)) return
    chatMessages.value.push(message)
    chatMessages.value.sort((left, right) => left.createdAt - right.createdAt)
    if (chatMessages.value.length > MAX_CHAT_MESSAGES) {
      chatMessages.value.splice(0, chatMessages.value.length - MAX_CHAT_MESSAGES)
    }
  }

  function resetChat() {
    chatMessages.value = []
    chatError.value = ''
    chatLoading.value = false
  }

  async function loadChat() {
    const match = currentMatch.value
    if (!match) return
    // 一对一约战没有聊天，不请求聊天接口。
    if (match.kind === 'DUEL') {
      resetChat()
      return
    }
    chatLoading.value = true
    chatError.value = ''
    try {
      const publicMessages = await fetchMatchChat(match.id, 'PUBLIC', 80)
      let privateMessages: GameChatMessage[] = []
      if (isParticipant(match, ownUserId.value)) {
        try {
          privateMessages = await fetchMatchChat(match.id, 'PLAYER_DM', 80)
        } catch {
          // 阶梯决赛对手尚未产生时私聊不可用，不影响公开频道。
        }
      }
      const merged = new Map<string, GameChatMessage>()
      for (const message of [...publicMessages, ...privateMessages]) {
        merged.set(message.id, message)
      }
      chatMessages.value = [...merged.values()].sort(
        (left, right) => left.createdAt - right.createdAt,
      )
    } catch (error) {
      chatError.value = formatApiError(error, '聊天记录加载失败')
    } finally {
      chatLoading.value = false
    }
  }

  async function sendChat(content: string, channel: GameChatChannel): Promise<boolean> {
    const match = currentMatch.value
    const text = content.trim()
    if (!match || !text || chatSending.value) return false
    if (match.kind === 'DUEL') {
      chatError.value = '约战不提供聊天'
      return false
    }
    chatSending.value = true
    chatError.value = ''
    try {
      const toUserId = channel === 'PLAYER_DM' ? opponentUserId.value : null
      if (channel === 'PLAYER_DM' && !toUserId) {
        chatError.value = '对手尚未产生，暂时不能私聊'
        return false
      }
      const message = await sendMatchChat(match.id, {
        channel,
        toUserId,
        content: text,
      })
      mergeChatMessage(message)
      return true
    } catch (error) {
      chatError.value = formatApiError(error, '消息发送失败')
      return false
    } finally {
      chatSending.value = false
    }
  }

  return {
    chatMessages,
    chatLoading,
    chatError,
    chatSending,
    mergeChatMessage,
    resetChat,
    loadChat,
    sendChat,
  }
}
