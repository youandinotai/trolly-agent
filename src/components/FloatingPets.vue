<script setup lang="ts">
import hermesPet from '../assets/pets/hermes-pet.png';
import { setAdultMode } from '../lib/mode';
</script>

<template>
  <button class="float-pet" type="button" title="Hermes pet. Clean now." @click="setAdultMode(false)">
    <img class="float-pet-sprite" :src="hermesPet" alt="Hermes" />
  </button>
</template>
