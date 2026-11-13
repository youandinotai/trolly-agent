<script setup lang="ts">
import { computed } from 'vue';
import { appMode } from '../lib/mode';

const props = withDefaults(defineProps<{
  src: string;
  kind?: 'image' | 'video';
  alt?: string;
  controls?: boolean;
  autoplay?: boolean;
  loop?: boolean;
}>(), { kind: 'image', alt: 'Generated media', controls: true, autoplay: false, loop: false });

/** Unreviewed media is not even mounted in Clean, so video cannot autoplay. */
const protectedNow = computed(() => !appMode.adult);
</script>

<template>
  <div class="safe-media" :class="{ covered: protectedNow }">
    <div v-if="protectedNow" class="safe-media-cover" role="status">
      <strong>Clean preview</strong>
      <span>Unreviewed {{ props.kind }} hidden</span>
      <small>Agent work continues · unlock Adult to view</small>
    </div>
    <video
      v-else-if="props.kind === 'video'"
      class="safe-media-content"
      :src="props.src"
      :controls="props.controls"
      :autoplay="props.autoplay"
      :loop="props.loop"
      muted
    />
    <img v-else class="safe-media-content" :src="props.src" :alt="props.alt" />
  </div>
</template>

<style scoped>
.safe-media { position: relative; width: 100%; min-height: 92px; overflow: hidden; border-radius: var(--radius-sm); }
.safe-media-content { display: block; width: 100%; max-width: 100%; border-radius: var(--radius-sm); }
.safe-media.covered { display: grid; place-items: center; min-height: 116px; border: 1px solid #31545b; background: radial-gradient(circle at 50% 0%, #1d3439, #111820 72%); }
.safe-media-cover { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 18px; text-align: center; color: #bce8e2; }
.safe-media-cover strong { font-size: 13px; letter-spacing: .04em; }
.safe-media-cover span { font: 10px var(--mono); color: #7fb8b2; text-transform: uppercase; }
.safe-media-cover small { color: var(--text-dim); font-size: 11px; }
</style>
