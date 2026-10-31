<script setup lang="ts">
/** Agent 形象：纯 CSS 3D（无 WebGL/三方依赖），三种形态 + 主题色可配。 */
withDefaults(
  defineProps<{
    style?: 'orb' | 'cube' | 'ring'
    primary?: string
    accent?: string
    size?: number
    spin?: boolean
  }>(),
  { style: 'orb', primary: '#58a6ff', accent: '#a371f7', size: 96, spin: true },
)
</script>

<template>
  <div
    class="avatar"
    :class="[`avatar--${style}`, { 'is-spin': spin }]"
    :style="{ '--c1': primary, '--c2': accent, '--size': `${size}px` }"
    aria-hidden="true"
  >
    <div class="avatar__stage">
      <div class="avatar__spin">
        <template v-if="style === 'cube'">
          <span v-for="face in ['front', 'back', 'right', 'left', 'top', 'bottom']" :key="face" class="cube__face" :class="`cube__face--${face}`" />
        </template>
        <template v-else-if="style === 'ring'">
          <span class="ring ring--x" />
          <span class="ring ring--y" />
          <span class="ring ring--z" />
          <span class="ring__core" />
        </template>
        <template v-else>
          <span class="orb__glow" />
          <span class="orb__ring orb__ring--a" />
          <span class="orb__ring orb__ring--b" />
          <span class="orb__core" />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.avatar {
  width: var(--size);
  height: var(--size);
  display: grid;
  place-items: center;
  perspective: 560px;
  flex: 0 0 auto;
}

.avatar__stage {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  animation: avatar-float 6.5s ease-in-out infinite;
}

.avatar__spin {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  transform: rotateX(-16deg);
}

.avatar.is-spin .avatar__spin {
  animation: avatar-spin 14s linear infinite;
}

/* ---------- orb：核心球 + 两道 3D 轨道环 ---------- */
.orb__core {
  position: absolute;
  inset: 19%;
  border-radius: 50%;
  background:
    radial-gradient(circle at 32% 26%, rgba(255, 255, 255, 0.85), transparent 42%),
    radial-gradient(circle at 72% 78%, var(--c2), transparent 62%),
    linear-gradient(145deg, var(--c1), var(--c2));
  box-shadow:
    inset -6px -8px 16px rgba(0, 0, 0, 0.45),
    0 0 26px color-mix(in srgb, var(--c1) 60%, transparent);
}

.orb__glow {
  position: absolute;
  inset: 8%;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--c2) 40%, transparent), transparent 68%);
  filter: blur(6px);
  opacity: 0.7;
}

.orb__ring {
  position: absolute;
  left: 6%;
  top: 36%;
  width: 88%;
  height: 28%;
  border: 1.5px solid color-mix(in srgb, var(--c1) 70%, transparent);
  border-radius: 50%;
  box-shadow: 0 0 10px color-mix(in srgb, var(--c1) 35%, transparent);
}

.orb__ring--a {
  transform: rotateX(74deg) rotateZ(14deg);
  animation: orb-tilt 9s ease-in-out infinite;
}

.orb__ring--b {
  transform: rotateX(-64deg) rotateZ(-22deg);
  animation: orb-tilt 11s ease-in-out infinite reverse;
}

/* ---------- cube：六面体 ---------- */
.cube__face {
  position: absolute;
  left: 25%;
  top: 25%;
  width: 50%;
  height: 50%;
  border: 1px solid color-mix(in srgb, var(--c1) 65%, transparent);
  background: linear-gradient(150deg, color-mix(in srgb, var(--c1) 42%, transparent), color-mix(in srgb, var(--c2) 30%, transparent));
  box-shadow: inset 0 0 12px color-mix(in srgb, var(--c2) 45%, transparent);
}

.cube__face--front { transform: translateZ(calc(var(--size) * 0.25)); }
.cube__face--back { transform: rotateY(180deg) translateZ(calc(var(--size) * 0.25)); }
.cube__face--right { transform: rotateY(90deg) translateZ(calc(var(--size) * 0.25)); }
.cube__face--left { transform: rotateY(-90deg) translateZ(calc(var(--size) * 0.25)); }
.cube__face--top { transform: rotateX(90deg) translateZ(calc(var(--size) * 0.25)); }
.cube__face--bottom { transform: rotateX(-90deg) translateZ(calc(var(--size) * 0.25)); }

/* ---------- ring：三向陀螺环 + 核心 ---------- */
.ring {
  position: absolute;
  inset: 10%;
  border: 2px solid color-mix(in srgb, var(--c1) 70%, transparent);
  border-radius: 50%;
  box-shadow: 0 0 12px color-mix(in srgb, var(--c1) 30%, transparent);
}

.ring--x {
  transform: rotateY(72deg);
  border-color: color-mix(in srgb, var(--c2) 75%, transparent);
}

.ring--y {
  transform: rotateX(70deg);
}

.ring--z {
  transform: rotateX(24deg) rotateY(-28deg);
  border-color: color-mix(in srgb, var(--c1) 45%, transparent);
}

.ring__core {
  position: absolute;
  inset: 37%;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff, transparent 55%), linear-gradient(150deg, var(--c1), var(--c2));
  box-shadow: 0 0 20px color-mix(in srgb, var(--c2) 55%, transparent);
}

@keyframes avatar-float {
  0%,
  100% {
    transform: translateY(-3%);
  }
  50% {
    transform: translateY(3%);
  }
}

@keyframes avatar-spin {
  from {
    transform: rotateX(-16deg) rotateY(0deg);
  }
  to {
    transform: rotateX(-16deg) rotateY(360deg);
  }
}

@keyframes orb-tilt {
  0%,
  100% {
    transform: rotateX(74deg) rotateZ(14deg);
  }
  50% {
    transform: rotateX(58deg) rotateZ(-10deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .avatar__stage,
  .avatar.is-spin .avatar__spin,
  .orb__ring--a,
  .orb__ring--b {
    animation: none;
  }
}
</style>
