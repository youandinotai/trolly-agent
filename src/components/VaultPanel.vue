<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type { VaultFile, VaultStatus } from '../env';
import { appMode } from '../lib/mode';

const emit = defineEmits<{ back: [] }>();
const page = ref<'images' | 'password' | 'reset'>('images');
const status = ref<VaultStatus>({ hasPassword: false, unlocked: false, encryptionVersion: null });
const items = ref<(VaultFile & { url?: string })[]>([]);
const password = ref('');
const nextPassword = ref('');
const confirmMigration = ref(false);
const confirmReset = ref(false);
const busy = ref(false);
const error = ref('');

function navigateTo(next: typeof page.value) {
  if (next !== 'reset') confirmReset.value = false;
  page.value = next;
}

async function refresh() {
  error.value = '';
  try {
    status.value = await window.trolly.vault.status();
    if (!status.value.unlocked || !appMode.adult || !appMode.ageVerified) {
      items.value = [];
      return;
    }
    const listed = await window.trolly.vault.list();
    const shown = [];
    for (const item of listed) {
      const file = await window.trolly.vault.read(item.id);
      shown.push({
        ...item,
        url: file ? `data:application/octet-stream;base64,${file.dataBase64}` : undefined,
      });
    }
    items.value = shown;
  } catch (err: any) {
    items.value = [];
    error.value = String(err?.message ?? err).replace(/^Error: /, '');
  }
}

async function submit() {
  if (busy.value) return;
  error.value = '';
  if (page.value === 'reset' && !confirmReset.value) {
    error.value = 'Confirm that you want to permanently delete the Vault files.';
    return;
  }
  if (status.value.encryptionVersion === 0 && page.value !== 'reset' && !confirmMigration.value) {
    error.value = 'Confirm encryption of existing Vault files before unlocking.';
    return;
  }
  busy.value = true;
  try {
    if (!status.value.hasPassword) status.value = await window.trolly.vault.setPassword(password.value);
    else if (page.value === 'password') {
      status.value = await window.trolly.vault.changePassword(password.value, nextPassword.value, confirmMigration.value);
    } else if (page.value === 'reset') status.value = await window.trolly.vault.reset(password.value);
    else status.value = await window.trolly.vault.unlock(password.value, confirmMigration.value);
    password.value = '';
    nextPassword.value = '';
    confirmMigration.value = false;
    confirmReset.value = false;
    page.value = 'images';
    await refresh();
  } catch (err: any) {
    error.value = String(err?.message ?? err).replace(/^Error: /, '');
  } finally {
    busy.value = false;
  }
}

async function addImages(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  error.value = '';
  try {
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '');
      reader.onerror = () => reject(new Error('Could not read that file.'));
      reader.readAsDataURL(file);
    });
    await window.trolly.vault.add({ name: file.name, dataBase64 });
    await refresh();
  } catch (err: any) {
    error.value = String(err?.message ?? err).replace(/^Error: /, '');
  }
}

async function remove(id: string) {
  error.value = '';
  try {
    await window.trolly.vault.remove(id);
    await refresh();
  } catch (err: any) {
    error.value = String(err?.message ?? err).replace(/^Error: /, '');
  }
}

async function close() {
  await window.trolly.vault.lock();
  items.value = [];
  emit('back');
}

watch(() => appMode.adult && appMode.ageVerified, async (allowed) => {
  if (!allowed) {
    items.value = [];
    try {
      status.value = await window.trolly.vault.status();
    } catch (err: any) {
      error.value = String(err?.message ?? err).replace(/^Error: /, '');
    }
  }
});
onMounted(refresh);
onBeforeUnmount(() => { void window.trolly.vault.lock(); });
</script>

<template>
  <section class="vault">
    <nav>
      <button type="button" :class="{ on: page === 'images' }" @click="navigateTo('images')">Images</button>
      <button type="button" :disabled="!status.hasPassword" :class="{ on: page === 'password' }" @click="navigateTo('password')">Change password</button>
      <button type="button" :disabled="!status.hasPassword" :class="{ on: page === 'reset' }" @click="navigateTo('reset')">Reset Vault</button>
      <button type="button" @click="close">Back and lock</button>
    </nav>
    <div class="vault-stage">
      <header>Private Vault</header>
      <p class="vault-note">
        Files and names are encrypted on this device. The decryption key is cleared when you lock the Vault.
      </p>
      <p v-if="!appMode.ageVerified" class="vault-note" role="status">Complete the 21+ age check in Mind to unlock the Vault.</p>
      <p v-else-if="!appMode.adult" class="vault-note" role="status">Switch to Adult mode to unlock the Vault. Clean mode locks it automatically.</p>
      <form v-else-if="!status.unlocked" @submit.prevent="submit">
        <label for="vault-password">{{ status.hasPassword ? (page === 'password' ? 'Current password' : 'Vault password') : 'Create a Vault password' }}</label>
        <input
          id="vault-password"
          v-model="password"
          type="password"
          :autocomplete="status.hasPassword ? 'current-password' : 'new-password'"
          :minlength="status.hasPassword ? undefined : 12"
          required
        />
        <p v-if="!status.hasPassword" class="vault-note">Use at least 12 characters. The password stays in Trolly.</p>
        <template v-if="page === 'password' && status.hasPassword">
          <label for="vault-next-password">New password</label>
          <input id="vault-next-password" v-model="nextPassword" type="password" autocomplete="new-password" minlength="12" required />
        </template>
        <label v-if="status.encryptionVersion === 0 && page !== 'reset'" class="vault-check">
          <input v-model="confirmMigration" type="checkbox" />
          Encrypt existing files and hide their names before unlocking.
        </label>
        <label v-if="page === 'reset'" class="vault-check">
          <input v-model="confirmReset" type="checkbox" />
          I understand this permanently deletes all Vault files.
        </label>
        <button type="submit" :disabled="busy || (page === 'reset' && !confirmReset)">
          {{ busy ? 'Working…' : page === 'reset' ? 'Delete Vault files' : page === 'password' ? 'Change password' : status.hasPassword ? 'Unlock Vault' : 'Set Vault password' }}
        </button>
      </form>
      <template v-else>
        <ul>
          <li v-for="item in items" :key="item.id">
            <span>{{ item.name }}</span>
            <button type="button" @click="remove(item.id)">Delete</button>
          </li>
        </ul>
        <p v-if="!items.length" class="vault-note">No files in the Vault yet.</p>
        <label class="vault-add">
          Add Images
          <input type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" @change="addImages" />
        </label>
      </template>
      <p v-if="error" class="vault-error" role="alert">{{ error }}</p>
    </div>
  </section>
</template>
