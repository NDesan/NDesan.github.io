/* Contenu tiré du Gorin no sho (1645) et du Dokkōdō de Miyamoto Musashi.
 * Les textes français sont des paraphrases, pas des citations d'une traduction publiée.
 */
'use strict';

const MUSASHI = {
  terre: {
    jp: '地の巻',
    teach: 'Comme le maître charpentier : des outils entretenus, un ouvrage droit.',
    essence: "Le livre de la Terre pose les fondations. Musashi y compare le stratège au maître charpentier : il connaît ses outils, choisit chaque pièce de bois selon sa place et bâtit droit. Sans fondation, aucune technique ne tient.",
    teachings: [
      'Connais le petit pour connaître le grand : la Voie se voit dans les gestes ordinaires.',
      'Toute chose a son rythme (hyōshi) : apprends à sentir le bon moment, le tien comme celui des autres.',
      "N'aie pas d'arme favorite : maîtrise chaque outil assez pour t'en servir quand il le faut.",
    ],
    prompts: [
      'Quelle fondation as-tu posée aujourd’hui ?',
      'Qu’as-tu fait avec le soin d’un charpentier ?',
      'Qu’est-ce qui a fragilisé ta base aujourd’hui ?',
    ],
  },
  eau: {
    jp: '水の巻',
    teach: 'Souple comme l’eau : apprendre, s’adapter, recommencer.',
    essence: "Le livre de l'Eau décrit la technique, et surtout l'état d'esprit qui la porte. L'eau épouse la forme du récipient, elle peut être une goutte ou un océan : l'esprit doit rester aussi souple et aussi clair.",
    teachings: [
      "Garde un esprit calme au cœur de l'action, ni tendu ni relâché.",
      'Distingue deux regards : percevoir (kan) en profondeur et voir (ken) en surface. Le premier doit être le plus fort.',
      "Mille jours d'entraînement pour forger, dix mille pour polir : c'est le tanren.",
    ],
    prompts: [
      'Où as-tu dû t’adapter comme l’eau ?',
      'Qu’as-tu appris que tu ne savais pas hier ?',
      'Quelle idée lue mérite d’être mise en pratique ?',
    ],
  },
  feu: {
    jp: '火の巻',
    teach: 'Intensité et timing : prendre l’initiative.',
    essence: "Le livre du Feu traite du combat lui-même, à un contre un comme à dix mille contre dix mille. Le feu grandit ou s'éteint en un instant : tout y est affaire d'intensité et de timing.",
    teachings: [
      "Prends l'initiative (sen) : attaque le premier, ou réponds de façon à reprendre la main.",
      "Tiens l'oreiller : empêche l'adversaire de relever la tête, étouffe un obstacle avant qu'il grandisse.",
      "Montagne et mer : si une tactique échoue deux fois, n'en tente pas une troisième, change d'approche.",
    ],
    prompts: [
      'Où as-tu pris l’initiative aujourd’hui ?',
      'Quel effort as-tu mené jusqu’au bout ?',
      'Devant quoi as-tu reculé ?',
    ],
  },
  vent: {
    jp: '風の巻',
    teach: 'Connaître les autres pour se connaître.',
    essence: "Le livre du Vent examine les autres écoles (le « vent » désigne aussi le style, la tradition). Musashi y critique celles qui misent tout sur la force, sur une arme trop longue, sur une multitude de techniques ou sur des postures figées.",
    teachings: [
      'Connais les autres voies pour mieux connaître la tienne.',
      "Méfie-toi de l'excès : trop de force, trop de techniques, trop de forme.",
      'Une méthode figée devient une faiblesse : garde ce qui fonctionne, laisse le reste.',
    ],
    prompts: [
      'Qu’as-tu appris d’une autre personne aujourd’hui ?',
      'Quelle manière de faire, différente de la tienne, as-tu observée ?',
      'Qui as-tu vraiment écouté ?',
    ],
  },
  vide: {
    jp: '空の巻',
    teach: 'Un esprit sans confusion, une action sans hésitation.',
    essence: "Le livre du Vide est le plus court. Le vide, c'est ce qui n'a ni forme ni limite, et c'est l'esprit libéré de toute confusion. Quand la pratique est complète, on agit naturellement, sans hésiter.",
    teachings: [
      "Le vide n'est pas l'ignorance : c'est la clarté qui vient après l'étude.",
      'Polis ton esprit et ta volonté, aiguise ton regard et ta perception.',
      'Dans le vide il y a le bien et pas de mal : sagesse, principe et Voie s’y rejoignent.',
    ],
    prompts: [
      'Qu’est-ce qui a troublé ton esprit, et l’as-tu laissé passer ?',
      'À quel moment as-tu agi sans hésiter ?',
      'Qu’as-tu perçu qui ne se voyait pas ?',
    ],
  },
};

// Les neuf principes qui closent le livre de la Terre.
const PRINCIPLES = [
  { k: '正', jp: 'よこしまになき事をおもふ所', t: 'Ne nourris pas de pensées tortueuses',
    d: 'Pense droit et honnêtement, envers toi-même comme envers les autres.',
    q: 'Où as-tu été parfaitement honnête aujourd’hui ?' },
  { k: '練', jp: '道の鍛錬する所', t: 'La Voie est dans la pratique',
    d: 'La Voie ne se comprend pas en lisant : elle se forge par l’entraînement de chaque jour.',
    q: 'Qu’as-tu pratiqué, et pas seulement pensé ?' },
  { k: '芸', jp: '諸芸にさはる所', t: 'Touche à tous les arts',
    d: 'Explore d’autres disciplines : chacune éclaire la tienne.',
    q: 'As-tu essayé quelque chose hors de ta discipline ?' },
  { k: '職', jp: '諸職の道を知る事', t: 'Connais la Voie de tous les métiers',
    d: 'Comprends comment travaillent les autres, quel que soit leur métier.',
    q: 'Qu’as-tu appris du métier de quelqu’un d’autre ?' },
  { k: '得', jp: '物毎の損得をわきまゆる事', t: 'Distingue gain et perte en toute chose',
    d: 'Mesure ce que chaque choix te coûte et ce qu’il te rapporte.',
    q: 'Quel choix d’aujourd’hui t’a coûté plus qu’il ne t’a rapporté ?' },
  { k: '目', jp: '諸事目利を仕覚ゆる事', t: 'Développe ton discernement',
    d: 'Apprends à juger juste et vite, en toute situation.',
    q: 'As-tu bien jugé une situation, une personne, une décision ?' },
  { k: '察', jp: '目に見えぬ所をさとってしる事', t: 'Perçois ce qui ne se voit pas',
    d: 'Lis ce qui se cache derrière les apparences : les intentions, les tendances.',
    q: 'Qu’as-tu perçu que les autres n’ont pas vu ?' },
  { k: '細', jp: 'わずかなる事にも気を付くる事', t: 'Prête attention aux petites choses',
    d: 'Les détails font la différence : rien n’est trop petit pour être bien fait.',
    q: 'Quel détail as-tu soigné aujourd’hui ?' },
  { k: '無', jp: '役にたたぬ事をせざる事', t: 'Ne fais rien d’inutile',
    d: 'Élimine le superflu : chaque geste, chaque heure doit servir.',
    q: 'Qu’as-tu fait d’inutile aujourd’hui ?' },
];

// Dokkōdō, « la Voie de la solitude » : 21 préceptes écrits peu avant sa mort, en 1645.
const DOKKODO = [
  'Accepte les choses telles qu’elles sont.',
  'Ne recherche pas le plaisir pour lui-même.',
  'Ne te fie jamais à un sentiment partial.',
  'Pense peu à toi-même, beaucoup au monde.',
  'Reste détaché du désir toute ta vie.',
  'Ne regrette pas ce que tu as fait.',
  'Ne sois jamais jaloux.',
  'Ne te laisse pas abattre par une séparation.',
  'Rancœur et plainte ne conviennent ni à toi ni aux autres.',
  'Ne te laisse pas mener par le désir amoureux.',
  'En toute chose, n’aie pas de préférence.',
  'Sois indifférent au lieu où tu vis.',
  'Ne recherche pas le goût d’une bonne chère.',
  'Ne garde pas ce dont tu n’as plus besoin.',
  'N’agis pas selon les croyances coutumières.',
  'Ne collectionne pas les armes au-delà de l’utile.',
  'Ne crains pas la mort.',
  'Ne cherche pas à posséder biens ou terres pour tes vieux jours.',
  'Respecte les dieux et le Bouddha sans compter sur leur aide.',
  'Tu peux abandonner ton corps, mais préserve ton honneur.',
  'Ne t’écarte jamais de la Voie.',
];

const dayNum = s => Math.round(new Date(s + 'T12:00:00').getTime() / 864e5);
const principleIdx = s => ((dayNum(s) % 9) + 9) % 9;
const dokkodoIdx = s => ((dayNum(s) % 21) + 21) % 21;
const promptIdx = s => ((Math.floor(dayNum(s) / 9) % 3) + 3) % 3;
