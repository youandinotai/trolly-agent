export function assertAgeVerified(ageVerified: boolean, action: string): void {
  if (!ageVerified) throw new Error(`Complete the 21+ age check in Mind before ${action}.`);
}

export function assertVaultAccess(ageVerified: boolean, adultMode: boolean): void {
  if (!ageVerified || !adultMode) {
    throw new Error('Complete the 21+ age check and switch to Adult mode before opening the Vault.');
  }
}
