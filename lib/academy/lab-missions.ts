/**
 * Laboratoire AgriAcademy (cadre J3, simulation J5) : la scène « bureau de la coopérative »
 * et ses missions, décrites comme des données pour que la vue 2D et la future vue 3D lisent
 * la même chose. Données d'exercice uniquement ; le laboratoire n'écrit jamais dans la
 * progression (spec §6).
 */

export interface LabObject {
  key: 'computer' | 'register' | 'phone' | 'archive'
  label: string
  hint: string
}

export interface LabMission {
  number: number
  title: string
  brief: string
  steps: string[]
  /** Objet à utiliser pour l'étape en cours. */
  focus: LabObject['key']
  hint: string
}

export const LAB_SCENE = {
  title: 'Bureau de la coopérative Agbélé',
  objects: [
    { key: 'computer', label: 'Ordinateur de la coopérative', hint: 'Saisir et vérifier' },
    { key: 'register', label: 'Registre papier', hint: '6 producteurs' },
    { key: 'phone', label: 'Téléphone, scanner une carte', hint: 'Après l’enregistrement' },
    { key: 'archive', label: 'Archives de la campagne', hint: 'Mission 3' },
  ] satisfies LabObject[],
}

export const LAB_MISSIONS: LabMission[] = [
  {
    number: 1,
    title: 'Découvrir le bureau',
    brief: 'Repérez les quatre objets du bureau et ce que chacun permet de faire.',
    steps: ['Ouvrir le registre papier', 'Allumer l’ordinateur', 'Prendre le téléphone'],
    focus: 'register',
    hint: 'Chaque objet mène à une tâche réelle d’opérateur.',
  },
  {
    number: 2,
    title: 'Enregistrer un producteur à partir du registre papier',
    brief:
      'Le registre contient 6 producteurs. L’un d’eux existe déjà dans le système avec le même numéro. Trouvez-le et évitez le doublon.',
    steps: [
      'Ouvrir le registre papier',
      'Lire le numéro de téléphone de la personne',
      'Saisir le numéro sur l’ordinateur de la coopérative',
      'Décider : nouvelle fiche ou fiche existante',
      'Imprimer la carte membre',
    ],
    focus: 'computer',
    hint: 'Le système compare le numéro dès la saisie. Si une fiche apparaît, lisez-la avant de continuer.',
  },
  {
    number: 3,
    title: 'Vérifier une carte membre',
    brief: 'Scannez la carte d’un producteur et lisez ce que la vérification affiche.',
    steps: ['Prendre le téléphone', 'Scanner le code QR', 'Lire le statut et le niveau'],
    focus: 'phone',
    hint: 'Une carte valide montre le nom, la coopérative et le niveau Bronze, Argent ou Or.',
  },
]

/** Mission proposée pour une leçon : la 2 par défaut (pilote J5), la 3 pour la leçon des cartes. */
export function missionForLesson(lessonTitle: string): LabMission {
  const t = lessonTitle.toLowerCase()
  if (t.includes('carte')) return LAB_MISSIONS[2]
  if (t.includes('bienvenue') || t.includes('découv')) return LAB_MISSIONS[0]
  return LAB_MISSIONS[1]
}
