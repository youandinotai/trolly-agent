<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import hermesPet from '../assets/pets/hermes-pet.png';
import { AGENCY_PETS, PET_POSES, type PetId, type PetPose } from '../lib/agency-pets';
import { appMode } from '../lib/mode';

const pet = ref<PetId>('hermes');
const pose = ref<PetPose>('idle');
let timer = 0;

function nextPose() {
  const index = PET_POSES.indexOf(pose.value);
  pose.value = PET_POSES[(index + 1) % PET_POSES.length];
}

function nextPet() {
  const index = AGENCY_PETS.findIndex((item) => item.id === pet.value);
  pet.value = AGENCY_PETS[(index + 1) % AGENCY_PETS.length].id;
  pose.value = 'hop';
}

onMounted(() => {
  timer = window.setInterval(nextPose, 2400);
});
onBeforeUnmount(() => window.clearInterval(timer));
</script>

<template>
  <button class="float-pet" :class="pose" type="button" :title="AGENCY_PETS.find((item) => item.id === pet)?.role" @click="nextPet">
    <img v-if="appMode.adult && pet === 'hermes'" class="float-pet-sprite" :src="hermesPet" alt="" />
    <span v-else class="float-pet-mark" aria-hidden="true" />
    <span class="float-pet-name">{{ AGENCY_PETS.find((item) => item.id === pet)?.name }}</span>
  </button>
</template>
