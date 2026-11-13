export interface SessionPreferences {
  ageVerified: boolean;
  adultContent: boolean;
}

export interface SessionModeSnapshot {
  adult: boolean;
  ageVerified: boolean;
  epoch: number;
  visuals: 'adult' | 'protected';
  agentAvailable: true;
  speechAction: 'none' | 'stop';
}

export interface AdultWorkTicket {
  epoch: number;
}

export type AdultWorkCompletion<T> =
  | { kind: 'visible'; result: T }
  | { kind: 'suppressed' };

/**
 * Current-session content authority. Saved preferences prove eligibility, but
 * never restore adult visuals. Clean changes presentation only; the agent and
 * its tools remain available. An epoch invalidates late adult async results.
 */
export class SessionMode {
  private adult = false;
  private ageVerified = false;
  private epoch = 0;

  restore(prefs: SessionPreferences): SessionModeSnapshot {
    this.ageVerified = prefs?.ageVerified === true;
    this.adult = false;
    this.epoch += 1;
    return this.snapshot();
  }

  unlock(prefs: SessionPreferences): SessionModeSnapshot {
    if (!prefs?.ageVerified) throw new Error('Complete the age check in Mind before using After Dark.');
    if (!prefs.adultContent) throw new Error('Enable adult content in Mind before using After Dark.');
    this.ageVerified = true;
    this.adult = true;
    this.epoch += 1;
    return this.snapshot();
  }

  clean(prefs?: SessionPreferences): SessionModeSnapshot {
    if (prefs) this.ageVerified = prefs.ageVerified === true;
    this.adult = false;
    this.epoch += 1;
    return { ...this.snapshot(), speechAction: 'stop' };
  }

  snapshot(): SessionModeSnapshot {
    return {
      adult: this.adult,
      ageVerified: this.ageVerified,
      epoch: this.epoch,
      visuals: this.adult ? 'adult' : 'protected',
      agentAvailable: true,
      speechAction: 'none',
    };
  }

  beginAdultWork(prefs: SessionPreferences): AdultWorkTicket {
    if (!prefs?.ageVerified) throw new Error('Complete the age check in Mind before using After Dark.');
    if (!prefs.adultContent) throw new Error('Enable adult content in Mind before using After Dark.');
    if (!this.adult) throw new Error('Adult content is not unlocked in the current session.');
    return { epoch: this.epoch };
  }

  finishAdultWork<T>(ticket: AdultWorkTicket, result: T): AdultWorkCompletion<T> {
    if (!this.adult || ticket.epoch !== this.epoch) return { kind: 'suppressed' };
    return { kind: 'visible', result };
  }
}
