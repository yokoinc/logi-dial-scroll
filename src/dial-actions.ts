import { AcceleratedDialAction } from './accelerated-dial';
import { Profiles, type ScrollProfile } from './scroll-model';
import { Mod, Vk, sendKey } from './win-input';

/**
 * Defilement des coupes dans OHIF : Fleche bas / Fleche haut.
 *
 * Convention : rotation vers la droite = Fleche bas, on avance dans la serie.
 *
 * Les libelles portent leurs accents — c'est sur eux que porte la recherche
 * d'Options+, et « accéléré » sans accent ne se trouve pas. Les messages de
 * journal, eux, restent en ASCII : le fichier de log mange les caracteres
 * accentues.
 */
abstract class OhifScrollAction extends AcceleratedDialAction {
  constructor(profile: ScrollProfile) {
    super(profile);
  }

  protected emit(direction: 1 | -1, repeats: number) {
    sendKey(direction > 0 ? Vk.DOWN : Vk.UP, Mod.NONE, repeats, 0);
  }
}

/** Grand cadran : le deplacement rapide dans la serie. */
export class OhifDialScrollAction extends OhifScrollAction {
  /**
   * Ne pas renommer. Options+ retient les affectations par cet identifiant, et
   * celui-ci vient du niveau « doux » de l'ancienne serie de trois actions :
   * le changer obligerait a reassigner le cadran a la main.
   */
  readonly name = 'dial_scroll_arrows_gentle';

  displayName = 'Défilement OHIF — grand cadran';
  description =
    'Fait défiler les coupes au grand cadran. Flèche bas / Flèche haut, de plus en plus vite selon la vitesse de rotation.';

  constructor() {
    super(Profiles.dial);
  }
}

/** Petite molette : la precision, coupe par coupe, qui accelere si on roule vite. */
export class OhifRollerScrollAction extends OhifScrollAction {
  readonly name = 'dial_scroll_arrows_roller';

  displayName = 'Défilement OHIF — petite molette';
  description =
    'Fait défiler les coupes à la petite molette. Une coupe par cran en roulant lentement, plus vite en roulant vite.';

  constructor() {
    super(Profiles.roller);
  }
}
