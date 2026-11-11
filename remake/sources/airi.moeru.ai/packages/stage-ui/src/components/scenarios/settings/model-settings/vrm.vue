<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { useModelStore } from '@proj-airi/stage-ui-three'
import { Button, Callout, GhostButton, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { Container, PropertyColor, PropertyNumber, PropertyPoint } from '../../../data-pane'
import { ColorPalette } from '../../../widgets'

const props = withDefaults(defineProps<{
  palette: string[]
  allowExtractColors?: boolean
  runtimeSnapshot: ModelSettingsRuntimeSnapshot
}>(), {
  allowExtractColors: true,
})

defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()

const { t } = useI18n()

const modelStore = useModelStore()
const {
  modelSize,
  maxFps,
  modelOffset,
  cameraFOV,
  modelRotationY,
  cameraDistance,
  trackingMode,

  directionalLightRotation,
  directionalLightIntensity,
  directionalLightColor,

  ambientLightIntensity,
  ambientLightColor,

  hemisphereLightIntensity,
  hemisphereSkyColor,
  hemisphereGroundColor,

  envSelect,
  skyBoxIntensity,
} = storeToRefs(modelStore)
const controlsLocked = computed(() => props.runtimeSnapshot.controlsLocked)
// Bare numbers and an i18n'd unlimited label, matching the Live2D and Spine frame-rate controls.
const fpsOptions = computed(() => [
  { value: 0, label: t('settings.vrm.fps.options.unlimited') },
  { value: 60, label: '60' },
  { value: 30, label: '30' },
])
const canExtractColors = computed(() => props.runtimeSnapshot.canCapturePreview)
const trackingOptions = computed<{
  value: 'camera' | 'mouse' | 'none'
  label: string
  class: string
}[]>(() => [
  { value: 'camera', label: t('settings.vrm.scale-and-position.eye-tracking-mode.options.option.camera'), class: 'col-start-3' },
  { value: 'mouse', label: t('settings.vrm.scale-and-position.eye-tracking-mode.options.option.mouse'), class: 'col-start-4' },
  { value: 'none', label: t('settings.vrm.scale-and-position.eye-tracking-mode.options.option.disabled'), class: 'col-start-5' },
])

// switch between hemisphere light and sky box
const settingsLockClass = computed(() => {
  return controlsLocked.value ? ['pointer-events-none', 'opacity-60'] : []
})

const envOptions = computed(() => [
  {
    value: 'hemisphere',
    label: 'Hemisphere',
    icon: envSelect.value === 'hemisphere'
      ? 'i-solar:forbidden-circle-bold rotate-45'
      : 'i-solar:forbidden-circle-linear rotate-45',
  },
  {
    value: 'skyBox',
    label: 'SkyBox',
    icon: envSelect.value === 'skyBox'
      ? 'i-solar:gallery-circle-bold'
      : 'i-solar:gallery-circle-linear',
  },
])
</script>

<template>
  <Container :data-settings-search="'settings.vrm.fps.title'" :title="t('settings.vrm.fps.title')" icon="i-solar:speedometer-bold-duotone">
    <p :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.vrm.fps.description') }}
    </p>
    <SelectTab :data-settings-search="'value:04d26e14d5f6'" v-model="maxFps" :options="fpsOptions" size="sm" :class="['shrink-0']" />
  </Container>
  <Container :data-settings-search="'settings.pages.models.sections.section.scene'"
    :title="t('settings.pages.models.sections.section.scene')"
    icon="i-solar:people-nearby-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <template v-if="allowExtractColors">
      <ColorPalette class="mb-4 mt-2" :colors="palette.map(hex => ({ hex, name: hex }))" mx-auto />
      <Button :disabled="controlsLocked || !canExtractColors" @click="$emit('extractColorsFromModel')">
        {{ t('settings.vrm.theme-color-from-model.button-extract.title') }}
      </Button>
    </template>

    <div grid="~ cols-5 gap-1" p-2 :class="settingsLockClass">
      <PropertyPoint :data-settings-search="['value:684d0a2a6a16', 'value:51dfb1c3ceae', 'value:c6d3ce741dc1'].join(' ')"
        v-model:x="modelOffset.x"
        v-model:y="modelOffset.y"
        v-model:z="modelOffset.z"
        :disabled="controlsLocked"
        label="Model Position"
        :x-config="{ min: -modelSize.x * 2, max: modelSize.x * 2, step: modelSize.x / 10000, label: 'X', formatValue: val => val?.toFixed(4) }"
        :y-config="{ min: -modelSize.y * 2, max: modelSize.y * 2, step: modelSize.y / 10000, label: 'Y', formatValue: val => val?.toFixed(4) }"
        :z-config="{ min: -modelSize.z * 2, max: modelSize.z * 2, step: modelSize.z / 10000, label: 'Z', formatValue: val => val?.toFixed(4) }"
      />
      <PropertyNumber :data-settings-search="['value:42131901361d', 'settings.vrm.scale-and-position.fov'].join(' ')"
        v-model="cameraFOV"
        :config="{ min: 1, max: 180, step: 1, label: t('settings.vrm.scale-and-position.fov'), disabled: controlsLocked }"
        :label="t('settings.vrm.scale-and-position.fov')"
      />
      <PropertyNumber :data-settings-search="['value:318e7cda18e6', 'settings.vrm.scale-and-position.camera-distance'].join(' ')"
        v-model="cameraDistance"
        :config="{ min: modelSize.z, max: modelSize.z * 20, step: modelSize.z / 100, label: t('settings.vrm.scale-and-position.camera-distance'), formatValue: val => val?.toFixed(4), disabled: controlsLocked }"
        :label="t('settings.vrm.scale-and-position.camera-distance')"
      />
      <PropertyNumber :data-settings-search="['value:581b3ecede91', 'settings.vrm.scale-and-position.rotation-y'].join(' ')"
        v-model="modelRotationY"
        :config="{ min: -180, max: 180, step: 1, label: t('settings.vrm.scale-and-position.rotation-y'), disabled: controlsLocked }"
        :label="t('settings.vrm.scale-and-position.rotation-y')"
      />

      <!-- Set eye tracking mode -->
      <div class="text-xs">
        {{ t('settings.vrm.scale-and-position.eye-tracking-mode.title') }}:
      </div>
      <div />
      <template v-for="option in trackingOptions" :key="option.value">
        <GhostButton
          :class="[option.class, 'w-auto']"
          :disabled="controlsLocked"
          size="sm"
          :active="trackingMode === option.value"
          :label="option.label"
          @click="trackingMode = option.value"
        />
      </template>

      <PropertyNumber :data-settings-search="'value:fa1169112198'"
        v-model="directionalLightRotation.x"
        :config="{ min: -180, max: 180, step: 1, label: 'RotationXDeg', formatValue: val => val?.toFixed(0), disabled: controlsLocked }"
        label="Directional Light Rotation - X"
      />
      <PropertyNumber :data-settings-search="'value:5dea1d0f1f15'"
        v-model="directionalLightRotation.y"
        :config="{ min: -180, max: 180, step: 1, label: 'RotationYDeg', formatValue: val => val?.toFixed(0), disabled: controlsLocked }"
        label="Directional Light Rotation - Y"
      />
      <PropertyColor :data-settings-search="'value:21360658aafa'"
        v-model="directionalLightColor"
        :disabled="controlsLocked"
        label="Directional Light Color"
      />

      <PropertyNumber :data-settings-search="'value:e70811e490ff'"
        v-model="directionalLightIntensity"
        :config="{ min: 0, max: 10, step: 0.01, label: 'Intensity', disabled: controlsLocked }"
        label="Directional Light Intensity"
      />

      <PropertyNumber :data-settings-search="'value:bcc096870143'"
        v-model="ambientLightIntensity"
        :config="{ min: 0, max: 10, step: 0.01, label: 'Intensity', disabled: controlsLocked }"
        label="Ambient Light Intensity"
      />
      <PropertyColor :data-settings-search="'value:4907e69cb1c3'"
        v-model="ambientLightColor"
        :disabled="controlsLocked"
        label="Ambient Light Color"
      />
    </div>
    <div>
      <div
        :class="[
          'px-2',
          'pt-2',
          'text-xs',
          'text-neutral-500',
          'dark:text-neutral-400',
        ]"
      >
        Environment
      </div>
      <div :class="['p-2', ...settingsLockClass]">
        <SelectTab :data-settings-search="'value:5493c636320b'" v-model="envSelect" :options="envOptions" :disabled="controlsLocked" size="sm" />
      </div>
      <div v-if="envSelect === 'hemisphere'">
        <!-- hemisphere settings -->
        <div grid="~ cols-5 gap-1" p-2 :class="settingsLockClass">
          <PropertyNumber :data-settings-search="'value:37750b6e159f'"
            v-model="hemisphereLightIntensity"
            :config="{ min: 0, max: 10, step: 0.01, label: 'Intensity', disabled: controlsLocked }"
            label="Hemisphere Light Intensity"
          />
          <PropertyColor :data-settings-search="'value:1b8701fc0c5b'"
            v-model="hemisphereSkyColor"
            :disabled="controlsLocked"
            label="Hemisphere Sky Color"
          />
          <PropertyColor :data-settings-search="'value:3ea3cf813335'"
            v-model="hemisphereGroundColor"
            :disabled="controlsLocked"
            label="Hemisphere Ground Color"
          />
        </div>
      </div>
      <div v-else>
        <!-- skybox settings -->
        <div grid="~ cols-5 gap-1" p-2 :class="settingsLockClass">
          <PropertyNumber :data-settings-search="['value:d1a91271174c', 'settings.vrm.skybox.skybox-intensity'].join(' ')"
            v-model="skyBoxIntensity"
            :config="{ min: 0, max: 1, step: 0.01, label: 'Intensity', disabled: controlsLocked }"
            :label="t('settings.vrm.skybox.skybox-intensity')"
          />
        </div>
      </div>
    </div>
  </Container>
  <Container :data-settings-search="'settings.vrm.change-model.title'"
    :title="t('settings.vrm.change-model.title')"
    icon="i-solar:magic-stick-3-bold-duotone"
    inner-class="text-sm"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <Callout :data-settings-search="'settings.vrm.scale-and-position.model-info-title'" :label="t('settings.vrm.scale-and-position.model-info-title')">
      <div>
        <div class="text-sm text-neutral-600 space-y-1 dark:text-neutral-400">
          <div class="flex justify-between">
            <span>{{ t('settings.vrm.scale-and-position.model-info-x') }}</span>
            <span>{{ modelSize.x.toFixed(4) }}</span>
          </div>
          <div class="flex justify-between">
            <span>{{ t('settings.vrm.scale-and-position.model-info-y') }}</span>
            <span>{{ modelSize.y.toFixed(4) }}</span>
          </div>
          <div class="flex justify-between">
            <span>{{ t('settings.vrm.scale-and-position.model-info-z') }}</span>
            <span>{{ modelSize.z.toFixed(4) }}</span>
          </div>
        </div>
      </div>
    </Callout>
    <Callout
      theme="lime"
      label="Tips!"
    >
      <div class="text-sm text-neutral-600 space-y-1 dark:text-neutral-400">
        {{ t('settings.vrm.scale-and-position.tips') }}
      </div>
    </Callout>
  </Container>
</template>
