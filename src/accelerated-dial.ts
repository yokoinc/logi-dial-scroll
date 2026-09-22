import { AdjustmentAction, type AdjustmentActionExecuteEvent } from '@logitech/plugin-sdk';

import { Pacing, type ScrollProfile, SlicePacer } from './scroll-model';

/**
 * Base des actions de molette : convertit chaque evenement en coupes selon le
 * profil du controle, puis les distribue dans le temps et delegue l'envoi a la
 * sous-classe.
 *
 * Chaque action a son propre `SlicePacer` : le grand cadran et la petite molette
 * ne partagent ni reliquat, ni vitesse mesuree, ni echelle.
 */
export abstract class AcceleratedDialAction extends AdjustmentAction {
  readonly hasReset = false;

  private readonly pacer: SlicePacer;

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(profile: ScrollProfile) {
    super();
    this.pacer = new SlicePacer(profile);
  }

  /**
   * Envoie une rafale de coupes.
   *
   * @param direction  +1 si la molette a tourne vers l'avant, -1 vers l'arriere
   * @param repeats    nombre de coupes a envoyer maintenant
   */
  protected abstract emit(direction: 1 | -1, repeats: number): void;

  execute(event: AdjustmentActionExecuteEvent) {
    const immediate = this.pacer.push(performance.now(), event.tick);

    if (Pacing.debugLog) {
      console.log(
        `[diag] ${this.name} tick=${event.tick} vitesse=${this.pacer.slicesPerSecond.toFixed(0)} immediat=${immediate}`,
      );
    }

    if (immediate > 0) {
      this.emit(this.pacer.direction, immediate);
    }

    this.scheduleTick();
  }

  private scheduleTick() {
    if (this.timer !== null || !this.pacer.hasPending) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;

      const due = this.pacer.tick(performance.now());
      if (due > 0) {
        if (Pacing.debugLog) {
          console.log(`[diag] ${this.name} minuterie -> ${due}`);
        }

        this.emit(this.pacer.direction, due);
      }

      this.scheduleTick();
    }, Pacing.tickMs);
  }
}
