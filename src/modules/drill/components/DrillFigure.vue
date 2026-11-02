<script setup lang="ts">
/**
 * 演练观察窗里的「人」。
 *
 * 纯 SVG 拼装，不依赖美术资源：头盔 + 面罩 + 躯干 + 四肢，
 * 颜色由己方/对照组区分，动作由外层 class 驱动（出击 / 受击 / 施法 / 退役）。
 */

defineProps<{
  side: 'ally' | 'enemy'
  dead?: boolean
}>()
</script>

<template>
  <svg
    class="drill__fig"
    :class="[`is-${side}`, { 'is-dead': dead }]"
    viewBox="0 0 24 34"
    aria-hidden="true"
  >
    <g class="drill__fig-legs">
      <line class="leg" x1="10" y1="23.5" x2="9.4" y2="31" />
      <line class="leg" x1="14" y1="23.5" x2="14.8" y2="31" />
    </g>

    <g class="drill__fig-arms">
      <line class="arm arm--back" x1="8.2" y1="15" x2="5" y2="22" />
      <line class="arm arm--front" x1="15.8" y1="15" x2="19.2" y2="21.4" />
    </g>

    <g class="drill__fig-body">
      <path class="torso" d="M8 12.6 L16 12.6 L17.4 24 L6.6 24 Z" />
      <path class="chest" d="M12 13.4 L15.6 14.6 L15 19 L12 18.2 Z" />
      <circle class="head" cx="12" cy="8" r="5.4" />
      <rect class="visor" x="8" y="6.4" width="8" height="2.6" rx="1.2" />
      <line class="crest" x1="12" y1="2.2" x2="12" y2="4.4" />
    </g>
  </svg>
</template>
