/**
 * Debates and humour, Togolese style: the debate of the day (two camps, defended by the real
 * players in the « Togo » room) and the joke of the day. Everyday life and its frustrations,
 * laughed at by those who live them: food and the single meal of the day, transport, the market,
 * family, the weather, power cuts, roads and works never finished, the students' bursary, the
 * dream of leaving. Never a party, a minister, a real person, an ethnic group or a faith.
 * The rumour of the day and the Sunday live are in ./togo-buzz.ts. Original texts written for
 * the game.
 */

export interface Debate {
  id: string
  question: string
  sides: [string, string]
}

export const DEBATES: Debate[] = [
  { id: 'akoume-fufu', question: 'Le vrai repas du dimanche ?', sides: ['Akoumé', 'Foufou'] },
  {
    id: 'zem-taxi',
    question: 'Pour aller au Grand marché à 8 h ?',
    sides: ['Zémidjan, on se faufile', 'Taxi, on arrive propre'],
  },
  {
    id: 'ablo-koliko',
    question: 'Au bord de la route, le meilleur grignotage ?',
    sides: ['Ablo bien chaud', 'Koliko (frites d’igname)'],
  },
  {
    id: 'mariage-heure',
    question: 'Invité à un mariage à 15 h, tu arrives quand ?',
    sides: ['15 h pile, je suis sérieux', '17 h, comme tout le monde'],
  },
  {
    id: 'pluie-sortir',
    question: 'Il pleut fort sur Lomé. Ton rendez-vous ?',
    sides: ['J’y vais quand même', 'La pluie, c’est un congé'],
  },
  {
    id: 'plage-cocotier',
    question: 'Le dimanche après-midi, c’est où ?',
    sides: ['À la plage', 'À la maison, devant le foot'],
  },
  {
    id: 'piment',
    question: 'La sauce sans piment, c’est…',
    sides: ['Toujours de la sauce', 'De l’eau colorée'],
  },
  {
    id: 'marchander',
    question: 'Au marché, le premier prix annoncé…',
    sides: ['On le paie, par respect', 'On divise par deux, par principe'],
  },
  {
    id: 'reveil',
    question: 'Le meilleur réveil du matin ?',
    sides: ['Le coq du voisin', 'L’alarme du téléphone'],
  },
  {
    id: 'bouillie',
    question: 'Au petit déjeuner ?',
    sides: ['Bouillie de mil', 'Pain-omelette'],
  },
  {
    id: 'match',
    question: 'Regarder le match ?',
    sides: ['Au maquis, avec le quartier', 'Chez moi, tranquille'],
  },
  {
    id: 'appel-message',
    question: 'Pour annoncer une nouvelle ?',
    sides: ['J’appelle, c’est plus chaud', 'Message vocal, ça suffit'],
  },
  {
    id: 'pagne-jean',
    question: 'Pour une fête, la tenue qui gagne ?',
    sides: ['Le pagne bien cousu', 'Le jean propre'],
  },
  {
    id: 'harmattan',
    question: 'Pire saison pour la peau ?',
    sides: ['L’harmattan qui sèche tout', 'La chaleur de mars'],
  },
  {
    id: 'mayi-essime',
    question: 'Partir en Europe ou réussir au pays ?',
    sides: ['Mayi Essimé !', 'On construit ici'],
  },
  {
    id: 'delestage',
    question: 'Délestage à 20 h. Le programme ?',
    sides: ['Bougie et histoires de grand-mère', 'Chez le voisin qui a un groupe'],
  },
  {
    id: 'tranche',
    question: 'La tranche tombe enfin. Premier achat ?',
    sides: ['Rembourser les amis', 'Un poulet braisé, j’ai souffert'],
  },
  {
    id: 'zero-zero-un',
    question: 'Un seul repas aujourd’hui : on le prend quand ?',
    sides: ['À midi, pour tenir', 'Le soir, pour bien dormir'],
  },
  {
    id: 'chantier',
    question: 'Le boulevard en travaux depuis des années…',
    sides: ['Il sera fini un jour', 'Mes petits-enfants le verront'],
  },
  {
    id: 'buzz',
    question: 'Une vidéo du quartier fait le buzz…',
    sides: ['Je partage tout de suite', 'Je vérifie d’abord'],
  },
]

export const JOKES: string[] = [
  'Le zém m’a dit « montez, c’est tout près ». Trois quartiers plus tard, il m’a demandé le chemin.',
  'À Lomé, « j’arrive » veut dire : je n’ai pas encore pris ma douche.',
  'Ma tante dit qu’elle ne mange pas beaucoup. C’est juste l’assiette qui est grande.',
  'Le taxi était plein à sept. Le chauffeur a dit : « Serrez-vous, il reste de la place pour la joie. »',
  'J’ai demandé le prix au marché. La dame m’a regardé et a dit : « Pour toi, c’est le prix d’ami. » Il était plus cher.',
  'Au Togo, on ne dit pas « il pleut ». On dit : « Aujourd’hui, personne ne viendra au travail. »',
  'Mon voisin a un coq qui chante à 3 h du matin. Même le coq a des problèmes de réseau.',
  '« Je suis à côté » peut vouloir dire Bè, Tokoin… ou Kpalimé.',
  'Le délestage est revenu, le ventilateur s’est arrêté, et toute la maison a soudain eu une opinion sur la chaleur.',
  'Le vendeur de pain passe à 6 h en criant. Mon réveil est au chômage depuis.',
  'Mon frère a mis 200 francs de crédit et il appelle en disant : « Rappelle-moi, je n’ai pas d’unités. »',
  'Au maquis, quand on dit « une dernière », c’est le début de la soirée.',
  'Le car Lomé – Kara part « à 7 h ». Le chauffeur, lui, part quand le car est plein.',
  'J’ai dit à ma mère que j’étais au régime. Elle m’a servi du foufou « léger ».',
  'Au feu rouge, les zéms attendent… que le feu les regarde ailleurs.',
  'Quand le ballon de la sélection rentre, même les voisins fâchés s’embrassent.',
  'Ma grand-mère n’a pas de téléphone, mais elle connaît toutes les nouvelles avant nous.',
  'À l’harmattan, on ne se reconnaît plus : tout le monde a le même visage gris de poussière.',
  'Régime 0-0-1 : zéro le matin, zéro à midi, un repas le soir. Le docteur dit « jeûne intermittent », nous on dit « fin du mois ».',
  'On m’a demandé combien de repas je prends par jour. J’ai répondu : « Tu parles de cette semaine ou de la semaine du 25 ? »',
  'Mon cousin a crié « Mayi Essimé ! » à tout le quartier. Trois jours après, on l’a vu au marché d’Adawlato. Il dit que c’est l’escale.',
  'Au Togo il y a trois saisons : la saison sèche, la saison des pluies et la saison des résultats de la DV.',
  'La CEET coupe juste avant le but. Elle doit soutenir l’autre équipe.',
  'Chez nous, le congélateur sert surtout à garder la sauce tiède pendant le délestage.',
  'La route était tellement abîmée que le zém a demandé un supplément « tout-terrain ».',
  'Le panneau du chantier dit « fin des travaux : 2021 ». Il est poli : il n’a pas précisé quelle année 2021.',
  'À l’université, on ne demande pas « ça va ? ». On demande : « La tranche est tombée ? »',
  'Une vidéo de mon quartier a fait le buzz. Tout le monde est célèbre, sauf celui qui a filmé : plus de forfait pour la poster.',
  'Il a plu vingt minutes. Le caniveau a décidé de devenir une rivière, et le zém un piroguier.',
]

/** Same debate and joke for everyone on a given game day. */
export const debateOfDay = (day: number) =>
  DEBATES[((Math.floor(day) % DEBATES.length) + DEBATES.length) % DEBATES.length]
export const jokeAt = (n: number) =>
  JOKES[((Math.floor(n) % JOKES.length) + JOKES.length) % JOKES.length]

/** The message a vote posts in the « Togo » room. */
export const voteMessage = (d: Debate, side: 0 | 1) =>
  `🎤 Débat du jour — ${d.question} Moi je suis pour : ${d.sides[side]} !`
export const jokeMessage = (joke: string) => `😂 Blague du jour : ${joke}`
