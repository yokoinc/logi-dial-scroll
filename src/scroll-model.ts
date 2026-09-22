/**
 * Modele du defilement : combien de coupes pour un evenement de molette, et a
 * quel rythme les envoyer. Aucune dependance au SDK ni a Windows, pour pouvoir
 * rejouer des evenements enregistres hors du plugin.
 *
 * Le SDK Logi 0.1.1 n'expose aucun panneau de configuration : ces valeurs se
 * modifient ici, puis `npm run build`.
 */

/** Reglages propres a un controle : chaque molette a son echelle et son usage. */
export interface ScrollProfile {
  /** Valeur de `tick` qui vaut une coupe. */
  readonly ticksPerSlice: number;

  /**
   * Acceleration selon la taille du `tick`, au-dela de `threshold` coupes par
   * evenement : coupes = n x (1 + gain x ln(1 + (n - threshold) / knee)).
   */
  readonly threshold: number;
  readonly gain: number;
  readonly knee: number;

  /**
   * Acceleration selon la vitesse de rotation mesuree, en coupes par seconde,
   * au-dela de `speedThreshold` : x (1 + speedGain x ln(1 + (v - speedThreshold) / speedKnee)).
   */
  readonly speedThreshold: number;
  readonly speedGain: number;
  readonly speedKnee: number;

  /**
   * Gain de sensibilite a basse vitesse : multiplie les coupes par
   * (1 + lowSpeedBoost) a l'arret, puis decroit lineairement jusqu'a 1 a
   * `lowSpeedRef` coupes par seconde, ou il ne fait plus rien.
   *
   * C'est l'inverse d'une acceleration : il releve le bas de la courbe sans
   * toucher au haut. Sur le grand cadran, tourner lentement n'envoie pas des
   * `tick` plus petits — ils restent a 7 — mais des evenements plus espaces,
   * jusqu'a 190 ms. Sans ce gain, un geste lent tombait a 22 coupes/s quand un
   * geste rapide en donne 260.
   */
  readonly lowSpeedBoost: number;
  readonly lowSpeedRef: number;

  /**
   * Inertie du debit, entre 0 et 1 : part du debit vise reprise a chaque
   * evenement. 1 = le debit saute a chaque evenement comme les `tick` eux-memes ;
   * plus la valeur est basse, plus la montee en vitesse est progressive.
   */
  readonly rateSmoothing: number;
}

/**
 * Un profil par controle. Mesure le 2026-09-15, curseur « Vitesse de la molette »
 * d'Options+ a 50 % : la petite molette envoie des `tick` de 2 a 7, le grand
 * cadran de 7 a 80. Les deux partageaient autrefois une seule action et une
 * unite calibree sur le plus petit `tick` recu, qui sautait en pleine session.
 */
export const Profiles = {
  /**
   * Grand cadran : le deplacement rapide dans la serie.
   *
   * Il accelere deja de lui-meme, ses `tick` grossissant avec la vitesse : notre
   * courbe ne fait qu'y ajouter une pointe, volontairement faible. La table visee
   * a l'origine (1, 2, 3, 4, 5, 7, 10, 12, soit `gain: 0.9`) supposait notre
   * courbe seule ; superposee a celle de l'appareil, elle triplait la vitesse de
   * pointe. A 0.3 : 1, 2, 3, 4, 5, 6, 8, 9. Juge « globalement satisfaisant » a
   * l'essai le 2026-09-21.
   */
  dial: {
    ticksPerSlice: 2,
    threshold: 5,
    gain: 0.3,
    knee: 4,
    speedThreshold: 0,
    speedGain: 0,
    speedKnee: 1,
    // Releve du bas de la courbe, juge trop peu sensible a l'essai le 2026-09-22.
    // Au-dela de 150 coupes/s, la ou le ressenti etait deja bon, il ne fait rien.
    lowSpeedBoost: 0.8,
    lowSpeedRef: 150,
    rateSmoothing: 0.35,
  },

  /**
   * Petite molette : la precision, coupe par coupe.
   *
   * Ses `tick` restent petits meme en roulant vite ; sa vitesse se lit surtout
   * dans la cadence des evenements. L'acceleration suit donc la vitesse mesuree
   * et non la taille du `tick` : sous 30 coupes/s, un cran vaut exactement une
   * coupe ; a 60 coupes/s le debit est multiplie par 1.7, a 100 par 2.2.
   */
  roller: {
    ticksPerSlice: 2,
    threshold: 5,
    gain: 0,
    knee: 4,
    speedThreshold: 30,
    speedGain: 1,
    speedKnee: 30,
    // Juge « parfait » a l'essai le 2026-09-22 : rien a relever en bas.
    lowSpeedBoost: 0,
    lowSpeedRef: 1,
    rateSmoothing: 0.35,
  },
} as const satisfies Record<string, ScrollProfile>;

/** Reglages communs a tous les controles. */
export const Pacing = {
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

  /** Duree sans evenement au-dela de laquelle un geste est considere comme fini. */
  idleResetMs: 400,

  /**
   * Intervalle minimal pris en compte pour mesurer la vitesse. Deux evenements
   * arrivent parfois a 5 ms d'ecart : sans ce plancher, la paire passerait pour
   * un pic de vitesse.
   */
  minSpeedGapMs: 16,

  /** Plafond de securite : coupes en attente a un instant donne. */
  maxPending: 80,

  /**
   * Journalise chaque evenement recu et chaque coupe envoyee, dans
   * `DialAccel.log`. A n'activer que pour regler un profil : c'est ce releve,
   * rejoue hors du plugin, qui sert a choisir les valeurs ci-dessus. Le journal
   * est vide a chaque redemarrage du Logi Plugin Service : le copier aussitot.
   */
  debugLog: false,
} as const;

/** Nombre de coupes, fractionnaire, demande par la taille d'un `tick`. */
export function slicesForTick(tick: number, profile: ScrollProfile): number {
  const base = Math.abs(tick) / profile.ticksPerSlice;
  const excess = Math.max(0, base - profile.threshold);
  return base * (1 + profile.gain * Math.log(1 + excess / profile.knee));
}

/**
 * Convertit les evenements d'une molette en coupes, et les repartit dans le temps.
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
  private speed = 0;
  private readonly profile: ScrollProfile;

  constructor(profile: ScrollProfile) {
    this.profile = profile;
  }

  /** Sens des coupes renvoyees par `push` et `tick`. */
  get direction(): 1 | -1 {
    return this.currentDirection;
  }

  /** Vrai tant qu'au moins une coupe entiere attend d'etre envoyee. */
  get hasPending(): boolean {
    return this.pendingSlices >= 1;
  }

  /** Vitesse de rotation mesuree, en coupes par seconde. */
  get slicesPerSecond(): number {
    return this.speed;
  }

  /**
   * Enregistre un evenement de molette et renvoie le nombre de coupes a envoyer
   * tout de suite, dans le sens de `direction`.
   */
  push(now: number, tick: number): number {
    if (tick === 0) {
      return 0;
    }

    const direction: 1 | -1 = tick > 0 ? 1 : -1;
    const gap = now - this.lastEventAt;

    if (direction !== this.currentDirection || gap > Pacing.idleResetMs) {
      this.pendingSlices = 0;
      this.budget = 0;
      this.slicesPerMs = 0;
      this.speed = 0;
      // Un demi-tour doit repondre tout de suite, meme si une coupe vient de partir.
      this.lastSentAt = Number.NEGATIVE_INFINITY;
    }

    // Moyenne glissante de l'intervalle entre evenements, repartie de la valeur
    // typique apres une pause pour ne pas etaler un nouveau geste sur un temps mort.
    this.typicalIntervalMs = gap > 150 ? 32 : 0.7 * this.typicalIntervalMs + 0.3 * gap;
    this.currentDirection = direction;
    this.lastEventAt = now;

    const slices = slicesForTick(tick, this.profile);

    // Vitesse de rotation, mesuree sur les coupes de base et non sur les coupes
    // accelerees : l'acceleration ne se nourrit pas d'elle-meme. Le premier
    // evenement d'un geste n'a pas d'intervalle mesurable et vaut une vitesse
    // nulle, donc un cran isole n'est jamais accelere.
    if (gap <= Pacing.idleResetMs) {
      const instant = (1000 * slices) / Math.max(Pacing.minSpeedGapMs, gap);
      this.speed = 0.7 * this.speed + 0.3 * instant;
    }

    const { speedThreshold, speedGain, speedKnee, lowSpeedBoost, lowSpeedRef } = this.profile;
    const accelerated = 1 + speedGain * Math.log(1 + Math.max(0, this.speed - speedThreshold) / speedKnee);
    const lifted = 1 + lowSpeedBoost * Math.max(0, 1 - this.speed / lowSpeedRef);
    const boost = accelerated * lifted;

    this.pendingSlices = Math.min(Pacing.maxPending, this.pendingSlices + slices * boost);

    // Le debit vise ecoule ce qui attend sur l'intervalle typique entre deux
    // evenements ; on ne s'en approche que par fractions, pour que la vitesse
    // monte en pente douce plutot qu'en marches. Le plancher garantit malgre
    // tout l'ecoulement complet en `spreadMaxMs`.
    const spreadMs = Math.min(Pacing.spreadMaxMs, Math.max(Pacing.spreadMinMs, this.typicalIntervalMs));
    const target = this.pendingSlices / spreadMs;
    const floor = this.pendingSlices / Pacing.spreadMaxMs;
    this.slicesPerMs = Math.max(floor, this.slicesPerMs + (target - this.slicesPerMs) * this.profile.rateSmoothing);
    this.lastTickAt = now;

    if (this.pendingSlices >= 1 && now - this.lastSentAt >= Pacing.tickMs) {
      this.pendingSlices -= 1;
      this.budget = 0;
      this.lastSentAt = now;
      return 1;
    }

    return 0;
  }

  /** A appeler par la minuterie : renvoie le nombre de coupes echues depuis le dernier appel. */
  tick(now: number): number {
    const elapsed = Math.min(Pacing.spreadMaxMs, now - this.lastTickAt);
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
