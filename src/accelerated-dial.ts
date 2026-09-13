import { AdjustmentAction, type AdjustmentActionExecuteEvent } from '@logitech/plugin-sdk';

/**
 * Reglages de l'acceleration. Le SDK Logi 0.1.1 n'expose aucun panneau de
 * configuration : ces valeurs se modifient ici, puis `npm run build`.
 */
export const Tuning = {
  /**
   * Nombre de crans pendant lesquels le defilement reste strictement
   * proportionnel : sous ce seuil, un cran vaut exactement une coupe.
   *
   * C'est la zone de precision. Un `ln` brut part de zero avec une pente
   * infinie : sans seuil, la cadence doublait des le deuxieme cran, ce qui se
   * sentait comme un a-coup au moindre ajustement fin.
   */
  threshold: 5,

  /**
   * Force de l'acceleration au-dela du seuil :
   * frappes = crans x (1 + gain x ln(1 + (crans - threshold) / knee)).
   *
   * Mesure sur la roulette le 2026-08-29 : de 1 a 6 crans par evenement.
   * A 0.9 avec `threshold: 5` et `knee: 4`, cela donne 1, 2, 3, 4, 5, 7, 10, 12
   * frappes — le reglage retenu apres essais dans OHIF.
   *
   * 0 = aucune acceleration, le defilement devient strictement proportionnel.
   */
  gain: 0.9,

  /**
   * Etalement de la montee apres le seuil, en crans.
   *
   * Plus la valeur est petite, plus la courbe monte vite : vers 2 elle redevient
   * nerveuse, vers 8 elle reste quasi lineaire longtemps.
   */
  knee: 4,

  /**
   * Duree d'inactivite au-dela de laquelle une rotation est consideree comme
   * terminee. Le reste fractionnaire accumule est alors remis a zero, pour
   * qu'un cran isole n'herite jamais du reliquat du geste precedent.
   */
  idleResetMs: 400,

  /** Pause entre deux frappes d'une meme rafale. Zero = une seule salve `SendInput`. */
  repeatDelayMs: 0,

  /** Plafond de securite : nombre de frappes envoyees pour un seul evenement. */
  maxRepeats: 80,
} as const;

/**
 * Base des actions de molette : applique la courbe d'acceleration a chaque
 * evenement recu, puis delegue l'envoi a la sous-classe.
 *
 * Aucune temporisation : la console fournit deja un `tick` proportionnel a la
 * vitesse de rotation, donc la courbe s'applique directement et la frappe part
 * sans le moindre delai ajoute. Seul le reste fractionnaire est reporte d'un
 * evenement au suivant, ce qui ne retarde rien.
 */
export abstract class AcceleratedDialAction extends AdjustmentAction {
  readonly hasReset = false;

  /**
   * Plus petit `tick` jamais recu, qui sert d'unite « un cran ».
   *
   * Chaque controle a sa propre echelle : le gros cadran comme la roulette
   * envoient 2 pour un cran, mais le curseur « Vitesse de la molette »
   * d'Options+ change cette echelle. Plutot que de figer une constante mesuree
   * sur un seul controle, on retient le plus petit mouvement observe et on s'y
   * cale. Le premier evenement vaut donc toujours un cran, et le calibrage
   * s'affine des que l'utilisateur tourne plus lentement.
   */
  private smallestTick = Number.POSITIVE_INFINITY;

  /**
   * Reste fractionnaire reporte d'un evenement au suivant.
   *
   * La courbe rend rarement un entier. Arrondir chaque evenement isolement
   * perdait la virgule a chaque fois, et toujours dans le meme sens : a 7 crans
   * soutenus, 9.56 arrondi rendait 10 frappes a chaque evenement, un surplus
   * permanent. En reportant le reste, la suite alterne (10, 9, 10, 9) et la
   * moyenne colle a la courbe.
   */
  private carry = 0;

  /** Sens du dernier evenement, pour detecter un demi-tour. */
  private lastDirection = 0;

  /** Horodatage du dernier evenement, pour detecter la fin d'un geste. */
  private lastEventAt = 0;

  /**
   * Envoie l'effet correspondant a une rafale.
   *
   * @param direction  +1 si la molette a tourne vers l'avant, -1 vers l'arriere
   * @param repeats    nombre de repetitions calcule par la courbe
   * @param delayMs    pause a respecter entre deux repetitions
   */
  protected abstract emit(direction: 1 | -1, repeats: number, delayMs: number): void;

  execute(event: AdjustmentActionExecuteEvent) {
    const magnitude = Math.abs(event.tick);
    if (magnitude === 0) {
      return;
    }

    const direction: 1 | -1 = event.tick > 0 ? 1 : -1;
    const now = Date.now();
    const previousSmallestTick = this.smallestTick;

    this.smallestTick = Math.min(this.smallestTick, magnitude);

    // Un demi-tour, une pause, ou un recalibrage de l'unite ouvrent un nouveau
    // geste : le reste accumule ne veut plus rien dire.
    const startsNewGesture =
      direction !== this.lastDirection ||
      now - this.lastEventAt > Tuning.idleResetMs ||
      this.smallestTick !== previousSmallestTick;

    if (startsNewGesture) {
      this.carry = 0;
    }

    this.lastDirection = direction;
    this.lastEventAt = now;

    const detents = magnitude / this.smallestTick;
    const excess = Math.max(0, detents - Tuning.threshold);
    const amplified = detents * (1 + Tuning.gain * Math.log(1 + excess / Tuning.knee)) + this.carry;

    let repeats = Math.max(1, Math.round(amplified));
    this.carry = amplified - repeats;

    if (repeats > Tuning.maxRepeats) {
      repeats = Tuning.maxRepeats;
      this.carry = 0;
    }

    this.emit(direction, repeats, Tuning.repeatDelayMs);
  }
}
