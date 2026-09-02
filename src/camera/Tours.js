// Guided tours: scripted flights with documentary captions (EN/ES). Each step:
// id (registry id) · dist (view distance in radii) · dwell (s) · orbit (rad/s drift)
// · duration (travel s) · speed (time speed during the dwell) · cap [title, text].
const S = (id, dist, dwell, orbit, duration, en, es, extra = {}) => ({ id, dist, dwell, orbit, duration, cap: { en, es }, ...extra });

export const TOURS = {
  solar: {
    name: { en: 'Solar System Tour', es: 'Tour del Sistema Solar' },
    desc: { en: 'From the Sun to the Kuiper belt: every world with its own story.', es: 'Del Sol al cinturón de Kuiper: cada mundo con su historia.' },
    speed: 600,
    steps: [
      S('sun', 9, 8, 0.08, 8, ['The Sun', 'A 4.6-billion-year-old G-type star holding 99.86 % of the system\'s mass. Its light takes 8 minutes to reach Earth.'], ['El Sol', 'Una estrella de tipo G de 4.600 millones de años que contiene el 99,86 % de la masa del sistema. Su luz tarda 8 minutos en llegar a la Tierra.']),
      S('mercury', 4.5, 5, 0.12, 6, ['Mercury', 'A cratered world of extremes: 427 °C by day, −173 °C by night. One solar day here lasts two of its years.'], ['Mercurio', 'Un mundo craterizado de extremos: 427 °C de día, −173 °C de noche. Un día solar dura aquí dos de sus años.']),
      S('venus', 4.5, 5, 0.1, 6, ['Venus', 'Under permanent clouds of sulfuric acid, a runaway greenhouse keeps the surface at 464 °C. It spins backwards, slower than it orbits.'], ['Venus', 'Bajo nubes permanentes de ácido sulfúrico, un efecto invernadero desbocado mantiene la superficie a 464 °C. Gira al revés, más despacio de lo que orbita.']),
      S('earth', 4.2, 9, 0.06, 7, ['Earth', 'The only world known to harbour life. Watch the terminator: night falls at 1,670 km/h at the equator.'], ['La Tierra', 'El único mundo del que se sabe que alberga vida. Observa el terminador: la noche avanza a 1.670 km/h en el ecuador.']),
      S('moon', 4.5, 5, 0.1, 5, ['The Moon', 'Born from a giant impact 4.5 billion years ago. Twelve humans have walked here; their footprints will last millions of years.'], ['La Luna', 'Nacida de un impacto gigante hace 4.500 millones de años. Doce humanos la han pisado; sus huellas durarán millones de años.']),
      S('mars', 4.5, 6, 0.1, 6, ['Mars', 'Rivers and lakes flowed here 3.5 billion years ago. Today six rovers have explored its rusty deserts.'], ['Marte', 'Aquí fluyeron ríos y lagos hace 3.500 millones de años. Hoy seis rovers han explorado sus desiertos oxidados.']),
      S('jupiter', 5.5, 9, 0.07, 7, ['Jupiter', 'Twice the mass of all the other planets combined. The Great Red Spot is a storm wider than Earth.'], ['Júpiter', 'El doble de masa que todos los demás planetas juntos. La Gran Mancha Roja es una tormenta más ancha que la Tierra.']),
      S('io', 5, 5, 0.12, 5, ['Io', 'The most volcanic world in the Solar System, kneaded by Jupiter\'s tides. Plumes rise 500 km.'], ['Ío', 'El mundo más volcánico del Sistema Solar, amasado por las mareas de Júpiter. Las columnas se elevan 500 km.']),
      S('europa', 5, 5, 0.1, 5, ['Europa', 'An ocean with twice the water of Earth\'s seas hides under 20 km of ice — a prime place to look for life.'], ['Europa', 'Un océano con el doble de agua que los mares terrestres se oculta bajo 20 km de hielo: un lugar prioritario para buscar vida.']),
      S('saturn', 6.5, 10, 0.06, 7, ['Saturn', 'Rings 280,000 km wide and ten metres thick. Saturn would float in water.'], ['Saturno', 'Anillos de 280.000 km de ancho y diez metros de grosor. Saturno flotaría en el agua.']),
      S('titan', 4.5, 5, 0.12, 5, ['Titan', 'Methane rain, hydrocarbon lakes and a nitrogen atmosphere denser than Earth\'s. Dragonfly arrives in 2034.'], ['Titán', 'Lluvia de metano, lagos de hidrocarburos y una atmósfera de nitrógeno más densa que la terrestre. Dragonfly llega en 2034.']),
      S('enceladus', 5, 5, 0.12, 5, ['Enceladus', 'Geysers of salty water erupt from its south pole, fed by a global ocean with all the ingredients for life.'], ['Encélado', 'Géiseres de agua salada brotan de su polo sur, alimentados por un océano global con todos los ingredientes de la vida.']),
      S('uranus', 5, 5, 0.08, 6, ['Uranus', 'Tipped over 98°, it rolls around the Sun. Each pole gets 42 years of daylight.'], ['Urano', 'Inclinado 98°, rueda alrededor del Sol. Cada polo recibe 42 años de luz.']),
      S('neptune', 5, 5, 0.08, 6, ['Neptune', 'The windiest world: 2,100 km/h. Found by mathematics before it was seen.'], ['Neptuno', 'El mundo más ventoso: 2.100 km/h. Hallado por las matemáticas antes de ser visto.']),
      S('pluto', 5, 6, 0.1, 7, ['Pluto', 'A world of nitrogen glaciers and a heart-shaped plain, locked in a mutual dance with Charon.'], ['Plutón', 'Un mundo de glaciares de nitrógeno y una llanura con forma de corazón, en una danza mutua con Caronte.']),
    ],
  },
  giants: {
    name: { en: 'Giants of the Universe', es: 'Gigantes del universo' },
    desc: { en: 'From the largest planet to stars that would swallow Jupiter\'s orbit and a galaxy of a trillion suns.', es: 'Del planeta más grande a estrellas que engullirían la órbita de Júpiter y una galaxia de un billón de soles.' },
    speed: 100,
    steps: [
      S('jupiter', 5, 7, 0.07, 7, ['Jupiter', '1,300 Earths would fit inside. Yet it is only a thousandth of the Sun.'], ['Júpiter', 'Cabrían 1.300 Tierras en su interior. Y aun así es solo una milésima del Sol.']),
      S('sun', 8, 6, 0.07, 8, ['The Sun', 'A million Earths. An ordinary star — most stars in the galaxy are smaller.'], ['El Sol', 'Un millón de Tierras. Una estrella corriente: la mayoría de las estrellas de la galaxia son más pequeñas.']),
      S('star-rigel', 14, 6, 0.06, 9, ['Rigel', 'A blue supergiant 120,000 times the Sun\'s luminosity, 860 light-years away.'], ['Rigel', 'Una supergigante azul con 120.000 veces la luminosidad del Sol, a 860 años luz.']),
      S('star-antares', 14, 6, 0.06, 8, ['Antares', 'A red supergiant 700 times the Sun\'s radius. Placed at the Sun, it would reach beyond Mars.'], ['Antares', 'Una supergigante roja de 700 radios solares. En el lugar del Sol llegaría más allá de Marte.']),
      S('star-betelgeuse', 14, 8, 0.05, 8, ['Betelgeuse', 'Nearly the orbit of Jupiter in size — and destined to explode as a supernova within 100,000 years.'], ['Betelgeuse', 'Casi del tamaño de la órbita de Júpiter, y destinada a explotar como supernova en menos de 100.000 años.']),
      S('sgr-a', 30, 8, 0.05, 10, ['Sagittarius A*', 'Four million solar masses inside a horizon smaller than Mercury\'s orbit. Light itself bends around it.'], ['Sagitario A*', 'Cuatro millones de masas solares dentro de un horizonte menor que la órbita de Mercurio. La propia luz se curva a su alrededor.']),
      S('milkyway', 3.2, 8, 0.05, 10, ['The Milky Way', '100,000 light-years across, 200 billion stars. Everything you saw before is inside this disc.'], ['La Vía Láctea', '100.000 años luz de diámetro, 200.000 millones de estrellas. Todo lo que viste antes está dentro de este disco.']),
      S('gal-andromeda-galaxy', 2.6, 9, 0.05, 10, ['Andromeda', 'A trillion stars, 2.5 million light-years away — and approaching at 110 km/s.'], ['Andrómeda', 'Un billón de estrellas a 2,5 millones de años luz… y acercándose a 110 km/s.']),
      S('gal-messier-87', 2.6, 8, 0.05, 10, ['Messier 87', 'A supergiant elliptical whose 6.5-billion-solar-mass black hole was the first ever imaged.'], ['Messier 87', 'Una elíptica supergigante cuyo agujero negro de 6.500 millones de masas solares fue el primero jamás fotografiado.']),
    ],
  },
  blackholes: {
    name: { en: 'Black Holes', es: 'Agujeros negros' },
    desc: { en: 'Gravity at its most extreme: lensing, shadows, accretion discs and time itself slowing down.', es: 'La gravedad en su extremo: lentes, sombras, discos de acreción y el propio tiempo frenándose.' },
    speed: 60,
    steps: [
      S('galactic-center', 3, 6, 0.05, 9, ['The Galactic Centre', 'Behind thick dust, 26,700 light-years from Earth, stars swarm around something invisible.'], ['El centro galáctico', 'Tras un polvo denso, a 26.700 años luz de la Tierra, las estrellas se arremolinan alrededor de algo invisible.']),
      S('sgr-a', 60, 8, 0.05, 8, ['Sagittarius A*', 'The star S2 whips around it every 16 years at 7,650 km/s — 2.5 % of the speed of light.'], ['Sagitario A*', 'La estrella S2 lo rodea cada 16 años a 7.650 km/s: el 2,5 % de la velocidad de la luz.']),
      S('sgr-a', 22, 12, 0.04, 8, ['Gravitational lensing', 'Light from stars behind the hole is bent into rings. The bright ring is the photon sphere; the dark centre, the shadow of the event horizon.'], ['Lente gravitacional', 'La luz de las estrellas de detrás se curva en anillos. El anillo brillante es la esfera de fotones; el centro oscuro, la sombra del horizonte de sucesos.']),
      S('sgr-a', 10, 12, 0.03, 8, ['Time dilation', 'This close, clocks run measurably slower than far away. At the horizon, time — as seen from outside — stops.'], ['Dilatación temporal', 'Tan cerca, los relojes van medibles más despacio que lejos. En el horizonte, el tiempo, visto desde fuera, se detiene.']),
      S('gal-messier-87', 2.6, 8, 0.05, 12, ['M87*', 'Six and a half billion solar masses; its shadow, 40 billion km across, was imaged by the Event Horizon Telescope in 2019.'], ['M87*', 'Seis mil quinientos millones de masas solares; su sombra, de 40.000 millones de km, fue fotografiada por el Event Horizon Telescope en 2019.']),
    ],
  },
  life: {
    name: { en: 'Search for Life', es: 'En busca de la vida' },
    desc: { en: 'Oceans under ice, ancient lakes and Earth-sized worlds in the habitable zones of other stars.', es: 'Océanos bajo el hielo, lagos antiguos y mundos del tamaño de la Tierra en zonas habitables de otras estrellas.' },
    speed: 300,
    steps: [
      S('earth', 4.2, 7, 0.06, 7, ['Earth', 'The only sample we have. Liquid water, a protective atmosphere and 4 billion years of biology.'], ['La Tierra', 'La única muestra que tenemos. Agua líquida, una atmósfera protectora y 4.000 millones de años de biología.']),
      S('mars', 4.5, 7, 0.08, 6, ['Mars', 'Habitable lakes 3.5 billion years ago. Perseverance is caching samples that may hold the answer.'], ['Marte', 'Lagos habitables hace 3.500 millones de años. Perseverance guarda muestras que quizá contengan la respuesta.']),
      S('europa', 4.5, 7, 0.1, 6, ['Europa', 'A salty ocean under the ice, warmed by tides; hydrothermal vents could feed chemistry like Earth\'s deep sea.'], ['Europa', 'Un océano salado bajo el hielo, calentado por mareas; fuentes hidrotermales podrían alimentar una química como la del fondo marino terrestre.']),
      S('enceladus', 5, 7, 0.1, 6, ['Enceladus', 'Cassini tasted its plumes: water, salts, organics, hydrogen and phosphorus. Every ingredient — but no life found.'], ['Encélado', 'Cassini probó sus columnas: agua, sales, orgánicos, hidrógeno y fósforo. Todos los ingredientes, pero ninguna vida hallada.']),
      S('titan', 4.5, 7, 0.1, 6, ['Titan', 'Chemistry in slow motion at −180 °C: methane seas above, a water ocean below.'], ['Titán', 'Química a cámara lenta a −180 °C: mares de metano arriba, un océano de agua abajo.']),
      S('star-proxima-centauri', 40, 8, 0.06, 9, ['Proxima Centauri', 'The nearest star hosts an Earth-mass planet in its habitable zone — 4.2 light-years away, 73,000 years by Voyager.'], ['Próxima Centauri', 'La estrella más cercana tiene un planeta de masa terrestre en su zona habitable, a 4,2 años luz: 73.000 años en Voyager.'], { hz: true }),
      S('star-trappist-1', 60, 10, 0.05, 9, ['TRAPPIST-1', 'Seven Earth-sized worlds around a star barely bigger than Jupiter; three in the habitable zone. JWST is checking for atmospheres.'], ['TRAPPIST-1', 'Siete mundos del tamaño de la Tierra alrededor de una estrella apenas mayor que Júpiter; tres en la zona habitable. El JWST busca atmósferas.'], { hz: true }),
    ],
  },
  evolution: {
    name: { en: 'Stellar Evolution', es: 'Evolución estelar' },
    desc: { en: 'The life of stars, from a collapsing cloud to a white dwarf or a neutron star.', es: 'La vida de las estrellas, de una nube en colapso a una enana blanca o una estrella de neutrones.' },
    speed: 100,
    steps: [
      S('neb-orion-nebula', 2.4, 9, 0.05, 9, ['Birth · Orion Nebula', 'A stellar nursery: 700 young stars condensing from a cloud lit by the Trapezium.'], ['Nacimiento · Nebulosa de Orión', 'Un vivero estelar: 700 estrellas jóvenes condensándose de una nube iluminada por el Trapecio.']),
      S('neb-pleiades', 2.4, 7, 0.06, 8, ['Youth · The Pleiades', 'A 100-million-year-old cluster of hot blue stars, still wrapped in dust.'], ['Juventud · Las Pléyades', 'Un cúmulo de 100 millones de años de estrellas azules calientes, aún envuelto en polvo.']),
      S('sun', 9, 7, 0.07, 8, ['Maturity · The Sun', 'Halfway through 10 billion years of fusing hydrogen. Stable, steady, ordinary.'], ['Madurez · El Sol', 'A mitad de 10.000 millones de años fusionando hidrógeno. Estable, constante, corriente.']),
      S('star-betelgeuse', 14, 8, 0.05, 9, ['Old age · Betelgeuse', 'Massive stars burn fast: after 10 million years it is a red supergiant about to die.'], ['Vejez · Betelgeuse', 'Las estrellas masivas arden deprisa: tras 10 millones de años es una supergigante roja a punto de morir.']),
      S('neb-crab-nebula', 2.4, 9, 0.05, 9, ['Death · Crab Nebula', 'A star that exploded in 1054. Its core is a pulsar spinning 30 times a second.'], ['Muerte · Nebulosa del Cangrejo', 'Una estrella que explotó en 1054. Su núcleo es un púlsar que gira 30 veces por segundo.']),
      S('neb-ring-nebula', 2.4, 8, 0.05, 9, ['Afterlife · Ring Nebula', 'Sun-like stars end gently: the shed outer layers glow around a white dwarf. This is the Sun\'s fate.'], ['Más allá · Nebulosa del Anillo', 'Las estrellas como el Sol acaban con suavidad: las capas expulsadas brillan alrededor de una enana blanca. Este es el destino del Sol.']),
    ],
  },
  galaxies: {
    name: { en: 'Galaxies', es: 'Galaxias' },
    desc: { en: 'Our island universe and its neighbours in the Local Group and beyond.', es: 'Nuestro universo isla y sus vecinas en el Grupo Local y más allá.' },
    speed: 1,
    steps: [
      S('milkyway', 3.2, 9, 0.05, 9, ['The Milky Way', 'A barred spiral of 200 billion stars. The Sun sits in the Orion Spur, two-thirds of the way out.'], ['La Vía Láctea', 'Una espiral barrada de 200.000 millones de estrellas. El Sol está en el Espolón de Orión, a dos tercios del centro.']),
      S('gal-large-magellanic-cloud', 2.6, 7, 0.05, 9, ['Large Magellanic Cloud', 'A satellite galaxy 160,000 light-years away, home of the Tarantula Nebula.'], ['Gran Nube de Magallanes', 'Una galaxia satélite a 160.000 años luz, hogar de la nebulosa de la Tarántula.']),
      S('gal-sagittarius-dwarf', 2.6, 6, 0.05, 8, ['Sagittarius Dwarf', 'Being torn apart by the Milky Way, leaving streams of stars around our galaxy.'], ['Enana de Sagitario', 'Desgarrada por la Vía Láctea, deja corrientes de estrellas alrededor de nuestra galaxia.']),
      S('gal-andromeda-galaxy', 2.6, 9, 0.05, 10, ['Andromeda', 'The nearest large galaxy. In 4.5 billion years it will merge with ours into a giant elliptical.'], ['Andrómeda', 'La gran galaxia más cercana. En 4.500 millones de años se fusionará con la nuestra en una elíptica gigante.']),
      S('gal-triangulum-galaxy', 2.6, 7, 0.05, 9, ['Triangulum', 'The third member of the Local Group\'s big three, rich in star-forming regions.'], ['Triángulo', 'La tercera de las tres grandes del Grupo Local, rica en regiones de formación estelar.']),
      S('gal-whirlpool-galaxy', 2.6, 8, 0.05, 10, ['Whirlpool', 'A grand-design spiral 23 million light-years away, interacting with a small companion.'], ['Remolino', 'Una espiral de gran diseño a 23 millones de años luz, en interacción con una pequeña compañera.']),
      S('gal-messier-87', 2.6, 8, 0.05, 10, ['Messier 87', 'The heart of the Virgo Cluster; the light you see left 54 million years ago.'], ['Messier 87', 'El corazón del cúmulo de Virgo; la luz que ves partió hace 54 millones de años.']),
    ],
  },
  extreme: {
    name: { en: 'Extreme Worlds', es: 'Mundos extremos' },
    desc: { en: 'Molten skies, backwards moons and planets that rain glass.', es: 'Cielos fundidos, lunas al revés y planetas donde llueve vidrio.' },
    speed: 300,
    steps: [
      S('venus', 4.5, 7, 0.1, 7, ['Venus', '92 bar and 464 °C under sulfuric-acid clouds: the hottest planet, hotter than Mercury.'], ['Venus', '92 bares y 464 °C bajo nubes de ácido sulfúrico: el planeta más caliente, más que Mercurio.']),
      S('io', 4.5, 7, 0.12, 6, ['Io', 'Four hundred active volcanoes and a surface repaved so fast it has no craters.'], ['Ío', 'Cuatrocientos volcanes activos y una superficie renovada tan deprisa que no tiene cráteres.']),
      S('triton', 4.5, 6, 0.1, 7, ['Triton', 'Orbits backwards at −235 °C, spouting nitrogen geysers. It will be torn into rings in a few billion years.'], ['Tritón', 'Orbita al revés a −235 °C y expulsa géiseres de nitrógeno. Será desgarrado en anillos en unos miles de millones de años.']),
      S('star-hd-189733', 30, 9, 0.06, 9, ['HD 189733 b', 'A deep-blue giant where glass rains sideways in 8,700 km/h winds, 2.2 days per orbit.'], ['HD 189733 b', 'Un gigante azul intenso donde llueve vidrio de lado con vientos de 8.700 km/h, 2,2 días por órbita.']),
      S('star-51-pegasi', 30, 8, 0.06, 9, ['51 Pegasi b', 'The first planet found around a Sun-like star: a hot Jupiter orbiting in 4.2 days.'], ['51 Pegasi b', 'El primer planeta hallado alrededor de una estrella similar al Sol: un júpiter caliente que orbita en 4,2 días.']),
      S('pulsar-crab-pulsar', 400, 8, 0.05, 9, ['Crab Pulsar', 'A city-sized neutron star spinning 30 times a second, heavier than the Sun, denser than an atomic nucleus.'], ['Púlsar del Cangrejo', 'Una estrella de neutrones del tamaño de una ciudad que gira 30 veces por segundo, más pesada que el Sol y más densa que un núcleo atómico.']),
    ],
  },
  scale: {
    name: { en: 'Cosmic Scale', es: 'Escala cósmica' },
    desc: { en: 'From a human horizon to the cosmic web, in factors of ten.', es: 'Del horizonte humano a la red cósmica, en factores de diez.' },
    speed: 1,
    steps: [
      S('earth', 1.5, 6, 0.04, 5, ['1 · Earth', 'From 3,000 km up, the whole of Europe fits in view. Everything humans ever built is on this surface.'], ['1 · La Tierra', 'Desde 3.000 km de altura, toda Europa cabe en la vista. Todo lo que los humanos han construido está en esta superficie.']),
      S('moon', 25, 6, 0.04, 6, ['2 · Earth–Moon', 'The Moon is 30 Earth-diameters away. Light needs 1.3 seconds; Apollo needed three days.'], ['2 · Tierra–Luna', 'La Luna está a 30 diámetros terrestres. La luz necesita 1,3 segundos; el Apolo, tres días.']),
      S('sun', 40, 7, 0.04, 8, ['3 · The Sun', 'A million Earths inside; 150 million km from home — 8 light-minutes.'], ['3 · El Sol', 'Un millón de Tierras dentro; a 150 millones de km de casa: 8 minutos luz.']),
      S('neptune', 400, 7, 0.04, 9, ['4 · The outer Solar System', 'Neptune is 30 times farther from the Sun than Earth. Sunlight takes 4 hours to get here.'], ['4 · El Sistema Solar exterior', 'Neptuno está 30 veces más lejos del Sol que la Tierra. La luz solar tarda 4 horas en llegar.']),
      S('star-proxima-centauri', 200, 7, 0.04, 10, ['5 · The nearest star', '4.2 light-years: 270,000 times the Earth–Sun distance. Our fastest probe would take 73,000 years.'], ['5 · La estrella más cercana', '4,2 años luz: 270.000 veces la distancia Tierra–Sol. Nuestra sonda más rápida tardaría 73.000 años.']),
      S('neb-orion-nebula', 2.4, 7, 0.04, 10, ['6 · The neighbourhood', '1,300 light-years to Orion. Its light left when the Vikings sailed.'], ['6 · El vecindario', '1.300 años luz hasta Orión. Su luz partió cuando navegaban los vikingos.']),
      S('milkyway', 3.2, 9, 0.04, 12, ['7 · The Milky Way', '100,000 light-years across. Our Sun is one of 200 billion stars, invisible at this scale.'], ['7 · La Vía Láctea', '100.000 años luz de diámetro. Nuestro Sol es una de 200.000 millones de estrellas, invisible a esta escala.']),
      S('gal-andromeda-galaxy', 12, 8, 0.04, 12, ['8 · The Local Group', 'Andromeda, the Milky Way and 80 dwarf galaxies bound together across 10 million light-years.'], ['8 · El Grupo Local', 'Andrómeda, la Vía Láctea y 80 galaxias enanas unidas a lo largo de 10 millones de años luz.']),
      S('cosmic-web', 1.2, 12, 0.03, 14, ['9 · The Cosmic Web', 'Galaxies gather along filaments around vast voids. This structure spans hundreds of millions of light-years — and the observable universe is a thousand times larger still.'], ['9 · La red cósmica', 'Las galaxias se agrupan en filamentos alrededor de vacíos inmensos. Esta estructura abarca cientos de millones de años luz; y el universo observable es aún mil veces mayor.']),
    ],
  },
};

/** Steps for OBSERVE: an automatic 25-second cinematic around one object. */
export function observeSteps(obj, lang = 'en') {
  const rings = obj.hasRings;
  const kind = obj.kind;
  const far = kind === 'galaxy' ? 2.8 : kind === 'nebula' ? 2.6 : kind === 'blackhole' ? 40 : kind === 'star' || kind === 'sun' ? 12 : rings ? 7 : 5;
  const near = kind === 'galaxy' ? 1.6 : kind === 'nebula' ? 1.3 : kind === 'blackhole' ? 16 : kind === 'star' || kind === 'sun' ? 5 : rings ? 3.2 : 2.2;
  const name = obj.name;
  return [
    { id: obj.id, dist: far, dwell: 7, orbit: 0.05, duration: 6, cap: { en: [name, ''], es: [name, ''] }, phi: 0.35 },
    { id: obj.id, dist: near, dwell: 9, orbit: 0.09, duration: 5, cap: { en: [name, ''], es: [name, ''] }, phi: -0.15, elevate: 0.4 },
    { id: obj.id, dist: far * 1.4, dwell: 6, orbit: 0.04, duration: 5, cap: { en: [name, ''], es: [name, ''] }, phi: 0.5 },
  ];
}
