<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'

import ArenaHeatmap from './ArenaHeatmap.vue'
import ArenaTopology from './ArenaTopology.vue'
import BlindLossRow from './BlindLossRow.vue'
import BlindXiangqiBoard from './BlindXiangqiBoard.vue'
import ExerciseArena from './ExerciseArena.vue'
import GomokuBoard from './GomokuBoard.vue'
import { useMatchWindow } from './useMatchWindow'

const emit = defineEmits<{ close: [] }>()

const {
  store,
  match,
  isDuel,
  matchLoading,
  matchError,
  chatLoading,
  chatError,
  tournament,
  round,
  selfId,
  participant,
  isBlind,
  firstSideName,
  secondSideName,
  lostByColor,
  player1BlindColor,
  player2BlindColor,
  gameId,
  arenaMode,
  arenaState,
  heatmapState,
  topologyState,
  exerciseState,
  playerNames,
  myColor,
  arenaRemaining,
  arenaInteractive,
  blackName,
  whiteName,
  turnName,
  isMyTurn,
  boardInteractive,
  canReady,
  restSeconds,
  moveSeconds,
  maxGames,
  gameLabel,
  stateLabel,
  winnerName,
  resultReason,
  blindActionText,
  chatClosed,
  chatMessages,
  privateTabVisible,
  chatHint,
  chatPlaceholder,
  readyState,
  firstGameLabel,
  ownsFirstGame,
  bothReady,
  isWinner,
  colorFor,
  chipClass,
  hasReady,
  sendChat,
  ready,
  chooseGame,
  place,
  arenaAction,
  exerciseInput,
  openBoardWindow,
  closeBoardWindow,
  reveal,
  move,
  resign,
  DRAW_OPTIONS,
  drawChoice,
  resigning,
  boardExpanded,
  actionError,
  channel,
  chatInput,
  chatBody,
  formatClock,
  formatDuration,
  formatLabel,
  playerName,
  scriptLabel,
} = useMatchWindow()
</script>

<template>
  <div
    class="match-window"
    role="dialog"
    aria-modal="true"
    :aria-label="isDuel ? '一对一约战对局' : '演练执行窗口'"
  >
    <div class="match-window__panel" :class="{ 'is-duel': isDuel }">
      <header class="match-window__head">
        <div class="match-window__title">
          <span class="match-window__mark">{{ isDuel ? 'D' : isBlind ? 'B' : 'T' }}</span>
          <div>
            <div class="match-window__eyebrow">
              <template v-if="isDuel">
                {{ tournament?.name || '一对一约战' }} / DUEL SESSION
              </template>
              <template v-else>
                {{ tournament?.name || (isBlind ? '盲棋推演' : '联调演练') }} /
                {{ isBlind ? 'BLIND SESSION' : 'DRILL SESSION' }}
              </template>
            </div>
            <h2>
              {{ match ? `${gameLabel} · ${stateLabel}` : '正在连接执行通道…' }}
              <span v-if="tournament" class="match-window__format">
                {{ tournament.format }}
              </span>
            </h2>
          </div>
        </div>
        <div class="match-window__head-actions">
          <span class="match-window__mode">
            <span class="match-window__dot" :class="{ 'is-live': store.status === 'online' }" />
            {{
              isDuel
                ? '约战参与方'
                : participant
                  ? myColor
                    ? `你是${myColor}`
                    : '参与方'
                  : '只读查看'
            }}
          </span>
          <button
            class="match-window__close"
            :title="isDuel ? '关闭约战窗口' : '关闭执行窗口'"
            @click="emit('close')"
          >
            ×
          </button>
        </div>
      </header>

      <div v-if="matchLoading" class="match-window__loading">正在载入执行记录…</div>
      <div v-else-if="matchError" class="match-window__error">
        <span>{{ matchError }}</span>
        <button type="button" @click="store.currentMatchId && store.watch(store.currentMatchId)">
          重试
        </button>
      </div>

      <div v-else-if="match" class="match-window__body" :class="{ 'is-duel': isDuel }">
        <section class="match-window__game">
          <div class="match-window__scoreboard">
            <div
              class="match-window__player"
              :class="{
                'is-turn': round?.turnUserId === match.player1UserId,
                'is-winner': isWinner(match.player1UserId),
                'is-self': match.player1UserId === selfId,
              }"
            >
              <span class="match-window__chip" :class="chipClass(match.player1UserId)">
                {{ colorFor(match.player1UserId) || '·' }}
              </span>
              <div class="match-window__player-main">
                <b>{{ playerName(match.player1UserId, match.player1Nickname) }}</b>
                <span v-if="hasReady(match.player1UserId)" class="match-window__ready">已就绪</span>
                <BlindLossRow
                  v-if="isBlind"
                  :color="player1BlindColor"
                  :groups="player1BlindColor ? lostByColor[player1BlindColor] : []"
                  align="left"
                />
              </div>
              <strong>{{ match.player1Score }}</strong>
            </div>
            <div class="match-window__vs">
              <span>{{ round?.status === 'REST' ? 'REST' : 'VS' }}</span>
              <em v-if="round?.status === 'REST'">
                {{ formatDuration(restSeconds) }}
              </em>
            </div>
            <div
              class="match-window__player match-window__player--right"
              :class="{
                'is-turn': round?.turnUserId === match.player2UserId,
                'is-winner': isWinner(match.player2UserId),
                'is-self': match.player2UserId === selfId,
              }"
            >
              <strong>{{ match.player2Score }}</strong>
              <div class="match-window__player-main">
                <b>{{ playerName(match.player2UserId, match.player2Nickname) }}</b>
                <span v-if="hasReady(match.player2UserId)" class="match-window__ready">已就绪</span>
                <BlindLossRow
                  v-if="isBlind"
                  :color="player2BlindColor"
                  :groups="player2BlindColor ? lostByColor[player2BlindColor] : []"
                  align="right"
                />
              </div>
              <span class="match-window__chip" :class="chipClass(match.player2UserId)">
                {{ colorFor(match.player2UserId) || '·' }}
              </span>
            </div>
          </div>

          <div v-if="ownsFirstGame" class="match-window__draw">
            <div class="match-window__draw-info">
              <span>页面淘汰 · 首局选图权</span>
              <em>当前首局：{{ firstGameLabel }}</em>
            </div>
            <div class="match-window__draw-options">
              <button
                v-for="option in DRAW_OPTIONS"
                :key="option.id"
                type="button"
                :class="{ 'is-active': drawChoice === option.id }"
                @click="drawChoice = option.id"
              >
                {{ option.shortName }}
              </button>
            </div>
            <button
              type="button"
              class="match-window__primary"
              :disabled="!drawChoice || drawChoice === match.firstGameId"
              @click="chooseGame"
            >
              确认剧本
            </button>
          </div>

          <div class="match-window__statusbar">
            <template v-if="match.status === 'READY'">
              <span class="match-window__hint">
                {{ readyState }} · 首局剧本 {{ firstGameLabel }}
              </span>
              <button
                v-if="canReady"
                class="match-window__primary"
                :disabled="hasReady(selfId)"
                @click="ready"
              >
                {{ hasReady(selfId) ? '已就绪，等待对方' : '开始执行' }}
              </button>
            </template>
            <template v-else-if="match.status === 'RUNNING' && round?.status === 'REST'">
              <span class="match-window__hint">
                {{ readyState }} · 休息 {{ formatDuration(restSeconds) }}
              </span>
              <button
                v-if="canReady"
                class="match-window__primary"
                :disabled="hasReady(selfId)"
                @click="ready"
              >
                {{ hasReady(selfId) ? (bothReady ? '双方已确认，即将开始' : '已就绪，等待对方') : '立即继续' }}
              </button>
            </template>
            <template v-else-if="match.status === 'RUNNING'">
              <template v-if="arenaMode">
                <span class="match-window__hint">
                  {{ scriptLabel(gameId) }} · {{ round?.moveCount ?? 0 }} 个动作
                  <template v-if="arenaState?.finished"> · 已结算</template>
                  <template v-else-if="participant"> · 你是{{ myColor }}</template>
                  <template v-else> · 只读查看</template>
                </span>
                <span
                  class="match-window__clock"
                  :class="{ 'is-danger': arenaRemaining <= 15 }"
                >
                  {{ formatDuration(arenaRemaining) }}
                </span>
                <button v-if="participant" class="match-window__ghost" :disabled="resigning" @click="resign">
                  终止本轮
                </button>
              </template>
              <template v-else>
                <span class="match-window__hint">
                  {{ turnName }} 轮次 · {{ round?.moveCount ?? 0 }} 步
                  <template v-if="isMyTurn"> · 请提交</template>
                  <template v-else-if="participant"> · 等待对方</template>
                </span>
                <span
                  class="match-window__clock"
                  :class="{ 'is-danger': moveSeconds <= 10 }"
                >
                  {{ formatDuration(moveSeconds) }}
                </span>
                <button v-if="participant" class="match-window__ghost" :disabled="resigning" @click="resign">
                  终止本轮
                </button>
              </template>
            </template>
            <template v-else-if="match.status === 'FINISHED'">
              <span class="match-window__hint">
                结果：<b>{{ winnerName }}</b>
                <template v-if="resultReason"> · {{ resultReason }}</template>
              </span>
              <span class="match-window__finished">FINISHED</span>
            </template>
            <span v-else class="match-window__hint">
              {{ readyState }}
            </span>
          </div>

          <div v-if="match.status === 'FINISHED'" class="match-window__result">
            <span class="match-window__result-title">
              {{ winnerName }} 完成本轮
            </span>
            <span class="match-window__result-score">
              {{ match.player1Score }} : {{ match.player2Score }}
            </span>
            <span class="match-window__result-note">
              {{
                isDuel
                  ? '战报仅双方可见'
                  : chatClosed
                    ? '聊天记录仅供回看'
                    : '演练仍在进行，可继续留在公开频道'
              }}
            </span>
          </div>

          <div v-if="isDuel" class="match-window__duel-note">
            <AppIcon name="user" :size="12" />
            一对一约战 · 不计积分 · 无聊天与观战 · 战报仅双方可见
          </div>

          <div
            v-else-if="!participant && match.status !== 'FINISHED'"
            class="match-window__spectator"
          >
            <AppIcon name="user" :size="12" />
            只读查看 · 公开频道可参与讨论
          </div>

          <BlindXiangqiBoard
            v-if="isBlind"
            :pieces="round?.blindBoard ?? []"
            :moves="round?.moves ?? []"
            :self-user-id="selfId"
            :first-user-id="round?.firstUserId ?? round?.blackUserId ?? ''"
            :second-user-id="round?.secondUserId ?? round?.whiteUserId ?? ''"
            :turn-user-id="round?.turnUserId ?? null"
            :interactive="boardInteractive"
            :disabled="match.status !== 'RUNNING' || round?.status !== 'RUNNING'"
            @reveal="reveal"
            @move="move"
          />
          <ArenaTopology
            v-else-if="topologyState"
            :state="topologyState"
            :self-user-id="selfId"
            :player-names="playerNames"
            :interactive="arenaInteractive"
            @action="arenaAction"
          />
          <ArenaHeatmap
            v-else-if="heatmapState"
            :state="heatmapState"
            :self-user-id="selfId"
            :player-names="playerNames"
            :interactive="arenaInteractive"
            @action="arenaAction"
          />
          <ExerciseArena
            v-else-if="exerciseState"
            :state="exerciseState"
            :self-user-id="selfId"
            :interactive="arenaInteractive"
            @input="exerciseInput"
          />
          <div v-else-if="arenaMode" class="match-window__arena-loading">
            正在同步演练状态…
          </div>
          <GomokuBoard
            v-else
            :moves="round?.moves ?? []"
            :black-user-id="round?.blackUserId ?? match.player1UserId ?? ''"
            :white-user-id="round?.whiteUserId ?? match.player2UserId ?? ''"
            :self-user-id="selfId"
            :turn-user-id="round?.turnUserId ?? null"
            :interactive="boardInteractive"
            :disabled="match.status !== 'RUNNING' || round?.status !== 'RUNNING'"
            @place="place"
            @expand="openBoardWindow"
          />

          <p v-if="isBlind && blindActionText" class="match-window__blind-action">
            {{ blindActionText }}
          </p>

          <div class="match-window__footer">
            <template v-if="isBlind">
              <span>{{ firstSideName }} 红方 · {{ secondSideName }} 黑方</span>
              <span v-if="tournament">{{ formatLabel(tournament.format) }}</span>
              <span v-if="round">{{ gameLabel }}</span>
              <span v-if="match.status === 'RUNNING' && round">
                提交倒计时 {{ formatDuration(moveSeconds) }}
              </span>
            </template>
            <template v-else-if="arenaMode">
              <span>{{ scriptLabel(gameId) }}</span>
              <span v-if="tournament">{{ formatLabel(tournament.format) }}</span>
              <span v-if="round">第 {{ round.gameNo }} / {{ maxGames }} 阶段</span>
              <span v-if="arenaState">剩余 {{ formatDuration(arenaRemaining) }}</span>
            </template>
            <template v-else>
              <span>{{ blackName }} 先手 · {{ whiteName }} 后手</span>
              <span v-if="tournament">{{ formatLabel(tournament.format) }}</span>
              <span v-if="round">第 {{ round.gameNo }} / {{ maxGames }} 阶段</span>
              <span v-if="match.status === 'RUNNING' && round">
                提交倒计时 {{ formatDuration(moveSeconds) }}
              </span>
              <button type="button" class="match-window__expand" @click="openBoardWindow">
                <AppIcon name="external" :size="10" />
                双击棋盘放大
              </button>
            </template>
          </div>

          <p v-if="actionError || store.lastError" class="match-window__action-error">
            {{ actionError || store.lastError }}
          </p>
        </section>

        <aside v-if="!isDuel" class="match-window__chat">
          <header class="match-window__chat-head">
            <div class="match-window__tabs">
              <button
                type="button"
                :class="{ 'is-active': channel === 'PUBLIC' }"
                @click="channel = 'PUBLIC'"
              >
                公开频道
              </button>
              <button
                v-if="privateTabVisible"
                type="button"
                :class="{ 'is-active': channel === 'PLAYER_DM' }"
                @click="channel = 'PLAYER_DM'"
              >
                双方私聊
              </button>
            </div>
            <span class="match-window__chat-hint">{{ chatHint }}</span>
          </header>

          <div ref="chatBody" class="match-window__messages">
            <div v-if="chatLoading" class="match-window__chat-empty">正在同步聊天记录…</div>
            <div v-else-if="chatMessages.length === 0" class="match-window__chat-empty">
              {{ channel === 'PLAYER_DM' ? '还没有私聊消息，先和对方打个招呼吧' : '暂时没有消息' }}
            </div>
            <div
              v-for="message in chatMessages"
              :key="message.id"
              class="match-window__message"
              :class="{ 'is-self': message.fromUserId === selfId }"
            >
              <div class="match-window__message-meta">
                <b>{{ message.fromNickname }}</b>
                <span>{{ formatClock(message.createdAt) }}</span>
              </div>
              <p>{{ message.content }}</p>
            </div>
            <p v-if="chatError" class="match-window__chat-error">{{ chatError }}</p>
          </div>

          <form class="match-window__composer" @submit.prevent="sendChat">
            <input
              v-model="chatInput"
              type="text"
              :placeholder="chatPlaceholder"
              :disabled="chatClosed || store.chatSending"
              maxlength="1000"
            />
            <button
              type="submit"
              class="match-window__send"
              :disabled="chatClosed || store.chatSending || !chatInput.trim()"
            >
              发送
            </button>
          </form>
        </aside>
      </div>
    </div>

    <div
      v-if="boardExpanded && !arenaMode && !isBlind"
      class="board-window"
      role="dialog"
      aria-modal="true"
      aria-label="放大棋盘"
      @click.self="closeBoardWindow"
    >
      <section class="board-window__panel">
        <header class="board-window__head">
          <div class="board-window__title">
            <span class="board-window__mark">15×15</span>
            <div>
              <div class="board-window__eyebrow">BOARD / FOCUS VIEW</div>
              <b>{{ blackName }} 先手 · {{ whiteName }} 后手</b>
            </div>
          </div>
          <div class="board-window__actions">
            <span class="board-window__status">
              {{ stateLabel }}
              <template v-if="match?.status === 'RUNNING' && round">
                · {{ turnName }} 轮次 · {{ formatDuration(moveSeconds) }}
              </template>
            </span>
            <span class="board-window__hint">
              拖动右下角调整大小 · 双击棋盘或按 Esc 退出
            </span>
            <button
              type="button"
              class="board-window__close"
              title="关闭放大棋盘"
              @click="closeBoardWindow"
            >
              ×
            </button>
          </div>
        </header>
        <div class="board-window__stage">
          <GomokuBoard
            fluid
            :moves="round?.moves ?? []"
            :black-user-id="round?.blackUserId ?? match?.player1UserId ?? ''"
            :white-user-id="round?.whiteUserId ?? match?.player2UserId ?? ''"
            :self-user-id="selfId"
            :turn-user-id="round?.turnUserId ?? null"
            :interactive="boardInteractive"
            :disabled="match?.status !== 'RUNNING' || round?.status !== 'RUNNING'"
            @place="place"
            @expand="closeBoardWindow"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped src="./match-window.css"></style>
<style scoped src="./match-window-chat.css"></style>
