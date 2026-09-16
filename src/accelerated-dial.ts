import { AdjustmentAction, type AdjustmentActionExecuteEvent } from '@logitech/plugin-sdk';

import { SlicePacer, Tuning, slicesForTick } from './scroll-model';

export { Tuning } from './scroll-model';

/**
 * Base des actions de molette : convertit chaque evenement en coupes, puis les
 * distribue dans le temps et delegue l'envoi a la sous-classe.
 *
 * La console fournit deja un `tick` proportionnel a la vitesse de rotation. La
 * premiere coupe part des reception de l'evenement ; les suivantes sont
 * reparties sur la duree qui le separe du prochain, au lieu de partir toutes
 * dans la meme image.
 */
export abstract class AcceleratedDialAction extends AdjustmentAction {
  readonly hasReset = false;

  private readonly pacer = new SlicePacer();

  private timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Envoie une rafale de coupes.
   *
   * @param direction  +1 si la molette a tourne vers l'avant, -1 vers l'arriere
   * @param repeats    nombre de coupes a envoyer maintenant
   */
  protected abstract emit(direction: 1 | -1, repeats: number): void;

  execute(event: AdjustmentActionExecuteEvent) {
    if (event.tick === 0) {
      return;
    }

    const direction: 1 | -1 = event.tick > 0 ? 1 : -1;
    const slices = slicesForTick(event.tick);
    const immediate = this.pacer.push(performance.now(), direction, slices);

    if (Tuning.debugLog) {
      console.log(`[diag] tick=${event.tick} coupes=${slices.toFixed(2)} immediat=${immediate}`);
    }

    if (immediate > 0) {
      this.emit(direction, immediate);
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
        if (Tuning.debugLog) {
          console.log(`[diag] minuterie -> ${due}`);
        }

        this.emit(this.pacer.direction, due);
      }

      this.scheduleTick();
    }, Tuning.tickMs);
  }
}
