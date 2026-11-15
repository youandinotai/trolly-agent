<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { appMode } from '../lib/mode';

const emit = defineEmits<{ back: [] }>();
const page = ref<'images' | 'password' | 'reset'>('images');
const status = ref({ hasPassword: false, unlocked: false });
const items = ref<{ name: string; url?: string }[]>([]);
const password = ref('');
const nextPassword = ref('');
const error = ref('');

async function refresh() {
  status.value = await window.trolly.vault.status();
  if (!status.value.unlocked || !appMode.adult) {
    items.value = [];
    return;
  }
  const listed = await window.trolly.vault.list();
  const shown = [];
  for (const item of listed) {
    const file = await window.trolly.vault.read(item.name);
    shown.push({
      name: item.name,
      url: file ? `data:application/octet-stream;base64,${file.dataBase64}` : undefined,
    });
  }
  items.value = shown;
}

async function submit() {
  error.value = '';
  try {
    if (!status.value.hasPassword) status.value = await window.trolly.vault.setPassword(password.value);
    else if (page.value === 'password') status.value = await window.trolly.vault.changePassword(password.value, nextPassword.value);
    else if (page.value === 'reset') status.value = await window.trolly.vault.reset(password.value);
    else status.value = await window.trolly.vault.unlock(password.value);
    password.value = '';
    nextPassword.value = '';
    page.value = 'images';
    await refresh();
  } catch (err: any) {
    error.value = String(err?.message ?? err).replace(/^Error: /, '');
  }
}

async function addImages(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
  await window.trolly.vault.add({ name: file.name, dataBase64 });
  await refresh();
}

async function remove(name: string) {
  await window.trolly.vault.remove(name);
  await refresh();
}

onMounted(refresh);
</script>

<template>
  <section class="vault">
    <nav>
      <button type="button" :class="{ on: page === 'images' }" @click="page = 'images'">Images</button>
      <button type="button" @click="page = 'password'">Change Password</button>
      <button type="button" @click="page = 'reset'">Reset</button>
      <button type="button" @click="emit('back')">Back</button>
    </nav>
    <div class="vault-stage">
      <header>Images</header>
      <p v-if="!appMode.adult" class="vault-note">SFW is on. The vault stays shut.</p>
      <form v-else-if="!status.unlocked" @submit.prevent="submit">
        <input v-model="password" type="password" autocomplete="current-password" placeholder="Vault password" />
        <input v-if="page === 'password' && status.hasPassword" v-model="nextPassword" type="password" placeholder="New password" />
        <button type="submit">{{ status.hasPassword ? 'Unlock' : 'Set password' }}</button>
        <p v-if="error">{{ error }}</p>
      </form>
      <template v-else>
        <ul>
          <li v-for="item in items" :key="item.name">
            <span>{{ item.name }}</span>
            <button type="button" @click="remove(item.name)">Delete</button>
          </li>
        </ul>
        <label class="vault-add">
          Add Images
          <input type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" @change="addImages" />
        </label>
      </template>
    </div>
  </section>
</template>
