/**
 * Modele du defilement : combien de coupes pour un evenement de molette, et a
 * quel rythme les envoyer. Aucune dependance au SDK ni a Windows, pour pouvoir
 * rejouer des evenements enregistres hors du plugin.
 */

/**
 * Reglages du defilement. Le SDK Logi 0.1.1 n'expose aucun panneau de
 * configuration : ces valeurs se modifient ici, puis `npm run build`.
 */
export const Tuning = {
  /**
   * Valeur de `tick` qui vaut une coupe.
   *
   * Fixe, et non plus calibree sur le plus petit `tick` recu : mesure le
   * 2026-09-15, le grand cadran et la roulette envoient des echelles differentes
   * (roulette 2 a 7, cadran 7 a 80) a la meme action. Le minimum partage passait
   * de 10 a 3 puis a 2 en pleine session, et chaque recalage rendait d'un coup
   * le cadran trois a cinq fois plus rapide. A 2, la roulette tourne a une coupe
   * par cran.
   */
  ticksPerSlice: 2,

  /**
   * Nombre de coupes par evenement en dessous duquel le defilement reste
   * strictement proportionnel.
   */
  threshold: 5,

  /**
   * Force de l'acceleration ajoutee au-dela du seuil :
   * coupes = n x (1 + gain x ln(1 + (n - threshold) / knee)).
   *
   * Volontairement faible, parce que ce n'est pas la seule acceleration en jeu :
   * mesure le 2026-09-15, le grand cadran accelere deja de lui-meme, ses `tick`
   * passant de 7 a 80 selon la vitesse. La table visee a l'origine (1, 2, 3, 4,
   * 5, 7, 10, 12) supposait notre courbe seule ; superposee a celle de
   * l'appareil, elle triplait la vitesse de pointe. A 0.3 la progression reste
   * sensible sans emballement : 1, 2, 3, 4, 5, 6, 8, 9.
   *
   * 0 = on s'en remet entierement a l'acceleration de l'appareil.
   */
  gain: 0.3,

  /** Etalement de la montee apres le seuil, en coupes. */
  knee: 4,

  /**
   * Bornes de la duree sur laquelle les coupes d'un evenement sont etalees.
   *
   * La console envoie un evenement toutes les 32 ms environ, parfois deux a 5 ms
   * d'intervalle. Envoyer toutes les coupes d'un coup faisait des marches
   * d'escalier : 20 coupes sur une image, rien sur les deux suivantes. On les
   * repartit sur l'intervalle observe entre evenements, dans ces bornes.
   */
  spreadMinMs: 16,
  spreadMaxMs: 48,

  /**
   * Periode de la minuterie qui distribue les coupes etalees. Windows arrondit
   * `setTimeout` a 15.6 ms : inutile de demander moins, et c'est une image a
   * 60 Hz, la plus fine qu'OHIF puisse afficher.
   */
  tickMs: 16,

  /**
   * Inertie du debit, entre 0 et 1 : part du debit vise reprise a chaque
   * evenement. 1 = aucune inertie, le debit saute a chaque evenement comme les
   * `tick` eux-memes (2, 7, 3, 5...) ; plus la valeur est basse, plus la montee
   * en vitesse est progressive. Le debit ne descend jamais sous ce qu'il faut
   * pour ecouler les coupes en attente en `spreadMaxMs`, donc l'inertie ralentit
   * la montee sans jamais allonger la traine.
   */
  rateSmoothing: 0.35,

  /** Duree sans evenement au-dela de laquelle un geste est considere comme fini. */
  idleResetMs: 400,

  /** Plafond de securite : coupes en attente a un instant donne. */
  maxPending: 80,

  /**
   * Journalise chaque evenement recu et chaque coupe envoyee, dans
   * `DialAccel.log`. A n'activer que pour regler la courbe : c'est ce releve,
   * rejoue hors du plugin, qui a servi a choisir les valeurs ci-dessus.
   */
  debugLog: false,
} as const;

/** Nombre de coupes, fractionnaire, demande par un evenement de molette. */
export function slicesForTick(tick: number): number {
  const base = Math.abs(tick) / Tuning.ticksPerSlice;
  const excess = Math.max(0, base - Tuning.threshold);
  return base * (1 + Tuning.gain * Math.log(1 + excess / Tuning.knee));
}

/**
 * Repartit dans le temps les coupes demandees par la molette.
 *
 * Chaque evenement ajoute ses coupes a un reliquat, qui s'ecoule a debit
 * constant sur la duree typique entre deux evenements. La premiere coupe d'un
 * mouvement part tout de suite, sans attendre la minuterie. Le reliquat
 * fractionnaire est conserve d'un evenement au suivant, puis abandonne a la fin
 * du geste ou sur un demi-tour : un cran isole ne recoit jamais les restes du
 * geste precedent, et revenir en arriere arrete net le defilement en cours.
 */
export class SlicePacer {
  private pendingSlices = 0;
  private budget = 0;
  private slicesPerMs = 0;
  private currentDirection: 1 | -1 = 1;
  private lastEventAt = Number.NEGATIVE_INFINITY;
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private lastTickAt = 0;
  private typicalIntervalMs = 32;

  /** Sens des coupes renvoyees par `push` et `tick`. */
  get direction(): 1 | -1 {
    return this.currentDirection;
  }

  /** Vrai tant qu'au moins une coupe entiere attend d'etre envoyee. */
  get hasPending(): boolean {
    return this.pendingSlices >= 1;
  }

  /** Enregistre un evenement et renvoie le nombre de coupes a envoyer tout de suite. */
  push(now: number, direction: 1 | -1, slices: number): number {
    const gap = now - this.lastEventAt;

    if (direction !== this.currentDirection || gap > Tuning.idleResetMs) {
      this.pendingSlices = 0;
      this.budget = 0;
      this.slicesPerMs = 0;
      // Un demi-tour doit repondre tout de suite, meme si une coupe vient de partir.
      this.lastSentAt = Number.NEGATIVE_INFINITY;
    }

    // Moyenne glissante de l'intervalle entre evenements, repartie de la valeur
    // typique apres une pause pour ne pas etaler un nouveau geste sur un temps mort.
    this.typicalIntervalMs = gap > 150 ? 32 : 0.7 * this.typicalIntervalMs + 0.3 * gap;
    this.currentDirection = direction;
    this.lastEventAt = now;

    this.pendingSlices = Math.min(Tuning.maxPending, this.pendingSlices + slices);

    // Le debit vise ecoule ce qui attend sur l'intervalle typique entre deux
    // evenements ; on ne s'en approche que par fractions, pour que la vitesse
    // monte en pente douce plutot qu'en marches. Le plancher garantit malgre
    // tout l'ecoulement complet en `spreadMaxMs`.
    const spreadMs = Math.min(Tuning.spreadMaxMs, Math.max(Tuning.spreadMinMs, this.typicalIntervalMs));
    const target = this.pendingSlices / spreadMs;
    const floor = this.pendingSlices / Tuning.spreadMaxMs;
    this.slicesPerMs = Math.max(floor, this.slicesPerMs + (target - this.slicesPerMs) * Tuning.rateSmoothing);
    this.lastTickAt = now;

    if (this.pendingSlices >= 1 && now - this.lastSentAt >= Tuning.tickMs) {
      this.pendingSlices -= 1;
      this.budget = 0;
      this.lastSentAt = now;
      return 1;
    }

    return 0;
  }

  /** A appeler par la minuterie : renvoie le nombre de coupes echues depuis le dernier appel. */
  tick(now: number): number {
    const elapsed = Math.min(Tuning.spreadMaxMs, now - this.lastTickAt);
    this.lastTickAt = now;
    this.budget += this.slicesPerMs * elapsed;

    const due = Math.floor(Math.min(this.budget, this.pendingSlices));
    this.pendingSlices -= due;
    this.budget -= due;

    if (due > 0) {
      this.lastSentAt = now;
    }

    // Le debit est conserve entre deux evenements : c'est lui qui porte
    // l'inertie d'un geste. Seul le credit accumule est remis a zero, pour
    // qu'une attente ne se transforme pas en rafale au prochain evenement.
    if (this.pendingSlices < 1) {
      this.budget = 0;
    }

    return due;
  }
}
