// Logo Virkas (éditeur de la plateforme) — reconstruit en SVG plutôt qu'importé en image bitmap :
// net à toute taille/résolution d'écran, sans fichier binaire à maintenir dans le repo. Utilisé
// sur les écrans d'authentification (login, récupération de compte) pour ancrer la marque avant
// même que le thème propre à CHAQUE boutique (couleurs choisies par son propriétaire) ne s'applique.

// Le "V" biseauté/facetté : un polygone à 6 sommets (deux jambes qui se rejoignent en pointe en
// bas) dupliqué en une copie sombre légèrement décalée dessous (effet de profondeur/extrusion,
// voir la maquette fournie) puis la copie au dégradé violet->bleu au-dessus.
const V_POINTS = '8,8 50,90 92,8 74,8 50,62 26,8'

interface VirkasIconProps {
  className?: string
}

export function VirkasIcon({ className }: VirkasIconProps) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="virkas-v-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="55%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      {/* Ombre portée -> donne le relief 3D du logo source sans avoir besoin d'un vrai bitmap. */}
      <polygon points={V_POINTS} fill="#1e1b4b" opacity="0.55" transform="translate(4 5)" />
      <polygon points={V_POINTS} fill="url(#virkas-v-gradient)" />
      {/* Fine ligne claire sur l'arête gauche de chaque jambe -> reflet "facette taillée". */}
      <polyline points="8,8 50,90" fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="2.5" strokeLinecap="round" />
      <polyline points="26,8 50,62" fill="none" stroke="white" strokeOpacity="0.25" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

interface VirkasBadgeProps {
  className?: string
  iconClassName?: string
}

// Badge carré arrondi (fond sombre + liseré lumineux) autour du "V" — reprend le cadre de la
// maquette carrée (icône seule, utilisée en tête de la carte de connexion).
export function VirkasBadge({ className, iconClassName }: VirkasBadgeProps) {
  return (
    <div
      className={
        'relative rounded-2xl bg-gradient-to-br from-[#171335] to-[#0c0a1f] ' +
        'shadow-[0_0_0_1px_rgba(124,58,237,0.35),0_0_24px_rgba(56,189,248,0.25)] ' +
        (className ?? '')
      }
    >
      <VirkasIcon className={iconClassName ?? 'w-full h-full p-2.5'} />
    </div>
  )
}

interface VirkasWordmarkProps {
  className?: string
  tagline?: string
  // Sur fond sombre (écrans d'auth) le texte doit rester clair quel que soit le thème
  // clair/sombre choisi par l'utilisateur ailleurs dans l'app — jamais `text-foreground`, qui
  // suivrait ce thème et deviendrait illisible sur ce fond volontairement toujours sombre.
  tone?: 'light' | 'dark'
}

// Lock-up complet (icône + "Virkas" + sous-titre) — reprend la maquette horizontale.
export function VirkasWordmark({ className, tagline = 'DEV & DESIGN', tone = 'light' }: VirkasWordmarkProps) {
  const textColor = tone === 'light' ? 'text-white' : 'text-[#171335]'
  const taglineColor = tone === 'light' ? 'text-white/50' : 'text-[#171335]/50'
  return (
    <div className={'flex items-center gap-3 ' + (className ?? '')}>
      <VirkasBadge className="w-11 h-11 shrink-0" />
      <div className="leading-tight">
        <p className={'font-black tracking-tight text-lg ' + textColor}>Virkas</p>
        <p className={'text-[12px] font-bold tracking-[0.2em] uppercase ' + taglineColor}>{tagline}</p>
      </div>
    </div>
  )
}
