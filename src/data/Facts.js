// Curiosities database. Each fact: target object id (or a kind, or 'any'),
// category, EN/ES text. Categories: physics · scale · history · missions ·
// extreme · composition · life. Used by the info panel ("interesting facts"),
// the contextual "did you know" cards and the discovery events.
export const FACTS = [
  // ---- Sun
  { id: 'sun', cat: 'scale', en: 'The Sun holds 99.86 % of the Solar System\'s mass; Jupiter has most of the rest.', es: 'El Sol contiene el 99,86 % de la masa del Sistema Solar; Júpiter tiene casi todo lo demás.' },
  { id: 'sun', cat: 'physics', en: 'If the Sun vanished, Earth would keep seeing it — and orbiting it — for 8 minutes 19 seconds.', es: 'Si el Sol desapareciera, la Tierra seguiría viéndolo, y orbitándolo, durante 8 minutos y 19 segundos.' },
  { id: 'sun', cat: 'physics', en: 'A photon made in the core takes ~100,000 years to random-walk to the surface, then 8 minutes to reach Earth.', es: 'Un fotón creado en el núcleo tarda ~100.000 años en salir a la superficie y luego 8 minutos en llegar a la Tierra.' },
  { id: 'sun', cat: 'extreme', en: 'The corona is hotter than the surface: 1–3 million K against 5,500 K — a puzzle still not fully solved.', es: 'La corona está más caliente que la superficie: 1–3 millones de K frente a 5.500 K, un enigma aún sin resolver del todo.' },
  // ---- Mercury
  { id: 'mercury', cat: 'physics', en: 'Mercury\'s day–night temperature swing of 600 °C is the largest of any planet.', es: 'La oscilación día-noche de Mercurio, 600 °C, es la mayor de cualquier planeta.' },
  { id: 'mercury', cat: 'extreme', en: 'Ice survives in permanently shadowed polar craters on the planet closest to the Sun.', es: 'Hay hielo en cráteres polares permanentemente en sombra… en el planeta más cercano al Sol.' },
  // ---- Venus
  { id: 'venus', cat: 'physics', en: 'A day on Venus (243 Earth days) is longer than its year (225 days), and the Sun rises in the west.', es: 'Un día en Venus (243 días terrestres) dura más que su año (225 días), y el Sol sale por el oeste.' },
  { id: 'venus', cat: 'extreme', en: 'Surface pressure equals a 900 m dive on Earth; the Soviet Venera landers survived under two hours.', es: 'La presión en superficie equivale a 900 m de profundidad en el mar; los Venera soviéticos sobrevivieron menos de dos horas.' },
  // ---- Earth
  { id: 'earth', cat: 'scale', en: 'All the water on Earth would form a sphere just 1,385 km across — smaller than the Moon.', es: 'Toda el agua de la Tierra formaría una esfera de solo 1.385 km de diámetro, menor que la Luna.' },
  { id: 'earth', cat: 'physics', en: 'Earth is not falling toward the Sun only because it moves sideways at 30 km/s.', es: 'La Tierra no cae hacia el Sol solo porque se desplaza de lado a 30 km/s.' },
  { id: 'earth', cat: 'history', en: 'The footprints on the Moon will last millions of years; there is no wind to erase them.', es: 'Las huellas en la Luna durarán millones de años: no hay viento que las borre.' },
  { id: 'earth', cat: 'physics', en: 'Days are getting longer by about 1.7 milliseconds per century as the Moon drains Earth\'s spin.', es: 'Los días se alargan unos 1,7 milisegundos por siglo porque la Luna frena la rotación de la Tierra.' },
  // ---- Moon
  { id: 'moon', cat: 'scale', en: 'All seven other planets would fit, side by side, in the gap between Earth and the Moon.', es: 'Los otros siete planetas cabrían, uno junto a otro, en el hueco entre la Tierra y la Luna.' },
  { id: 'moon', cat: 'physics', en: 'The Moon is receding 3.8 cm per year — total solar eclipses will end in about 600 million years.', es: 'La Luna se aleja 3,8 cm al año: los eclipses solares totales se acabarán en unos 600 millones de años.' },
  // ---- Mars
  { id: 'mars', cat: 'extreme', en: 'Olympus Mons is 22 km high and so broad that from its summit the slopes vanish over the horizon.', es: 'El monte Olimpo mide 22 km de altura y es tan ancho que desde la cima las laderas se pierden tras el horizonte.' },
  { id: 'mars', cat: 'missions', en: 'Six rovers have driven on Mars; Opportunity, built for 90 days, lasted 15 years.', es: 'Seis rovers han recorrido Marte; Opportunity, diseñado para 90 días, duró 15 años.' },
  { id: 'mars', cat: 'physics', en: 'Martian sunsets are blue: fine dust scatters red light away from the Sun\'s direction.', es: 'Los atardeceres marcianos son azules: el polvo fino dispersa la luz roja lejos de la dirección del Sol.' },
  // ---- Jupiter
  { id: 'jupiter', cat: 'scale', en: 'Jupiter has 2.5 times the mass of all the other planets combined — yet only 0.1 % of the Sun\'s.', es: 'Júpiter tiene 2,5 veces la masa de todos los demás planetas juntos… y solo el 0,1 % de la del Sol.' },
  { id: 'jupiter', cat: 'extreme', en: 'The Great Red Spot is a storm wider than Earth that has raged for at least 190 years.', es: 'La Gran Mancha Roja es una tormenta más ancha que la Tierra activa desde hace al menos 190 años.' },
  { id: 'jupiter', cat: 'physics', en: 'Jupiter radiates more heat than it receives from the Sun: it is still contracting, about 2 cm per year.', es: 'Júpiter irradia más calor del que recibe del Sol: aún se contrae, unos 2 cm al año.' },
  { id: 'jupiter', cat: 'composition', en: 'Most of Jupiter is liquid metallic hydrogen — hydrogen crushed until it conducts like a metal.', es: 'La mayor parte de Júpiter es hidrógeno metálico líquido: hidrógeno comprimido hasta conducir como un metal.' },
  // ---- Saturn
  { id: 'saturn', cat: 'physics', en: 'Saturn is the only planet less dense than water; it would float — if you could find a big enough bath.', es: 'Saturno es el único planeta menos denso que el agua: flotaría, si hubiera una bañera lo bastante grande.' },
  { id: 'saturn', cat: 'scale', en: 'The rings span 280,000 km but are, on average, only about 10 metres thick.', es: 'Los anillos abarcan 280.000 km, pero de media tienen solo unos 10 metros de grosor.' },
  { id: 'saturn', cat: 'extreme', en: 'A hexagonal jet stream, wider than Earth, has circled Saturn\'s north pole since Voyager saw it in 1981.', es: 'Una corriente en chorro hexagonal, más ancha que la Tierra, rodea el polo norte de Saturno desde que la vio Voyager en 1981.' },
  // ---- Uranus / Neptune
  { id: 'uranus', cat: 'physics', en: 'Uranus rolls around the Sun on its side: each pole gets 42 years of sunlight, then 42 of darkness.', es: 'Urano rueda tumbado alrededor del Sol: cada polo recibe 42 años de luz y luego 42 de oscuridad.' },
  { id: 'neptune', cat: 'extreme', en: 'Neptune\'s winds reach 2,100 km/h, the fastest in the Solar System, despite receiving 0.1 % of Earth\'s sunlight.', es: 'Los vientos de Neptuno alcanzan 2.100 km/h, los más rápidos del Sistema Solar, aunque recibe el 0,1 % de la luz que llega a la Tierra.' },
  { id: 'neptune', cat: 'history', en: 'Neptune was found by mathematics: its position was predicted from Uranus\'s orbit before anyone looked.', es: 'Neptuno se descubrió con matemáticas: su posición se predijo a partir de la órbita de Urano antes de que nadie mirara.' },
  // ---- moons
  { id: 'io', cat: 'extreme', en: 'Io\'s volcanic plumes rise 500 km — more than the height of the ISS above Earth.', es: 'Las columnas volcánicas de Ío se elevan 500 km, más que la altura de la ISS sobre la Tierra.' },
  { id: 'europa', cat: 'life', en: 'Europa\'s ocean may hold twice the water of all Earth\'s oceans, under ice that has never seen the Sun.', es: 'El océano de Europa podría contener el doble de agua que todos los océanos terrestres, bajo un hielo que nunca ha visto el Sol.' },
  { id: 'enceladus', cat: 'life', en: 'Enceladus\'s geysers feed Saturn\'s E ring: the moon is literally snowing on its neighbours.', es: 'Los géiseres de Encélado alimentan el anillo E de Saturno: la luna literalmente nieva sobre sus vecinas.' },
  { id: 'titan', cat: 'life', en: 'On Titan it rains methane, and a human could fly by flapping strap-on wings in the thick, low-gravity air.', es: 'En Titán llueve metano, y un humano podría volar batiendo alas acopladas en su aire denso y de baja gravedad.' },
  { id: 'ganymede', cat: 'physics', en: 'Ganymede is the only moon with its own magnetic field, and it is larger than Mercury.', es: 'Ganímedes es la única luna con campo magnético propio, y es mayor que Mercurio.' },
  { id: 'triton', cat: 'physics', en: 'Triton orbits backwards — a captured Kuiper-belt object that will one day be torn into a ring.', es: 'Tritón orbita al revés: un objeto capturado del cinturón de Kuiper que un día será desgarrado en un anillo.' },
  { id: 'charon', cat: 'physics', en: 'Pluto and Charon are mutually locked: each shows the same face to the other, forever.', es: 'Plutón y Caronte están mutuamente acoplados: cada uno muestra siempre la misma cara al otro.' },
  // ---- small bodies & craft
  { id: 'voyager1', cat: 'missions', en: 'Voyager 1\'s signal takes over 23 hours to reach Earth, from a transmitter of 23 watts — a fridge bulb.', es: 'La señal de Voyager 1 tarda más de 23 horas en llegar a la Tierra, desde un transmisor de 23 vatios: la bombilla de una nevera.' },
  { id: 'voyager1', cat: 'history', en: 'The Golden Record carries 115 images, greetings in 55 languages and 90 minutes of music, playable for a billion years.', es: 'El Disco de Oro lleva 115 imágenes, saludos en 55 idiomas y 90 minutos de música, reproducibles durante mil millones de años.' },
  { id: 'iss', cat: 'scale', en: 'The ISS orbits at 7.66 km/s: its crew sees 16 sunrises a day.', es: 'La ISS orbita a 7,66 km/s: su tripulación ve 16 amaneceres al día.' },
  { id: 'jwst', cat: 'physics', en: 'JWST\'s sunshield keeps its mirror at −233 °C while the Sun-facing side sits at 85 °C.', es: 'El parasol del JWST mantiene su espejo a −233 °C mientras la cara al Sol está a 85 °C.' },
  { id: 'halley', cat: 'history', en: 'Halley\'s Comet appears in the Bayeux Tapestry (1066) and was recorded by Chinese astronomers in 240 BC.', es: 'El cometa Halley aparece en el tapiz de Bayeux (1066) y fue registrado por astrónomos chinos en el 240 a. C.' },
  // ---- stars & deep sky
  { id: 'star-betelgeuse', cat: 'extreme', en: 'Placed at the Sun, Betelgeuse would swallow the orbit of Jupiter. It may explode any time in the next 100,000 years.', es: 'En el lugar del Sol, Betelgeuse engulliría la órbita de Júpiter. Podría explotar en cualquier momento de los próximos 100.000 años.' },
  { id: 'star-sirius', cat: 'physics', en: 'Sirius B, the white dwarf companion, packs the Sun\'s mass into a body the size of Earth.', es: 'Sirio B, la enana blanca compañera, concentra la masa del Sol en un cuerpo del tamaño de la Tierra.' },
  { id: 'star-proxima-centauri', cat: 'scale', en: 'Voyager 1, our fastest outbound probe, would need 73,000 years to reach Proxima Centauri.', es: 'Voyager 1, nuestra sonda más rápida, tardaría 73.000 años en llegar a Próxima Centauri.' },
  { id: 'sgr-a', cat: 'extreme', en: 'Sagittarius A* has 4.3 million solar masses inside a horizon that would fit within Mercury\'s orbit.', es: 'Sagitario A* tiene 4,3 millones de masas solares dentro de un horizonte que cabría en la órbita de Mercurio.' },
  { id: 'sgr-a', cat: 'physics', en: 'The star S2 orbits Sgr A* every 16 years at up to 7,650 km/s — 2.5 % of the speed of light.', es: 'La estrella S2 orbita Sgr A* cada 16 años a hasta 7.650 km/s: el 2,5 % de la velocidad de la luz.' },
  { id: 'neb-orion-nebula', cat: 'scale', en: 'The Orion Nebula is 24 light-years across; its light left when the Renaissance was young.', es: 'La nebulosa de Orión mide 24 años luz; su luz partió cuando el Renacimiento era joven.' },
  { id: 'neb-crab-nebula', cat: 'extreme', en: 'The Crab pulsar spins 30 times a second and powers the whole nebula\'s blue glow.', es: 'El púlsar del Cangrejo gira 30 veces por segundo y alimenta todo el brillo azul de la nebulosa.' },
  { id: 'milkyway', cat: 'scale', en: 'Light takes 100,000 years to cross the Milky Way; the Sun has orbited its centre only ~20 times.', es: 'La luz tarda 100.000 años en cruzar la Vía Láctea; el Sol solo ha dado ~20 vueltas a su centro.' },
  { id: 'milkyway', cat: 'physics', en: 'Stars make up a few percent of the galaxy\'s mass; most is dark matter we have never directly seen.', es: 'Las estrellas son solo un pequeño porcentaje de la masa galáctica; casi toda es materia oscura que nunca hemos visto directamente.' },
  { id: 'gal-andromeda-galaxy', cat: 'physics', en: 'Andromeda approaches at 110 km/s; the merger in ~4.5 billion years will barely make any two stars collide.', es: 'Andrómeda se acerca a 110 km/s; en la fusión, dentro de ~4.500 millones de años, casi ninguna estrella chocará con otra.' },
  { id: 'gal-andromeda-galaxy', cat: 'scale', en: 'On the sky Andromeda spans six full Moons — but only its bright core is visible to the eye.', es: 'En el cielo Andrómeda abarca seis lunas llenas, pero a simple vista solo se ve su núcleo brillante.' },
  // ---- generic by kind
  { kind: 'star', cat: 'physics', en: 'Every star you see is a nuclear furnace balancing gravity against the pressure of fusion.', es: 'Cada estrella que ves es un horno nuclear que equilibra la gravedad con la presión de la fusión.' },
  { kind: 'nebula', cat: 'life', en: 'The carbon in your body was forged inside stars and scattered by clouds like this one.', es: 'El carbono de tu cuerpo se forjó dentro de estrellas y se dispersó en nubes como esta.' },
  { kind: 'galaxy', cat: 'scale', en: 'There are more galaxies in the observable universe (~2 trillion) than stars in the Milky Way.', es: 'Hay más galaxias en el universo observable (~2 billones) que estrellas en la Vía Láctea.' },
  { kind: 'blackhole', cat: 'physics', en: 'Time runs slower near a black hole: an hour at the horizon is centuries far away.', es: 'El tiempo transcurre más despacio junto a un agujero negro: una hora en el horizonte son siglos lejos de él.' },
];

const seen = new Set();
/** Facts for an object (by id first, then by kind). */
export function factsFor(o, lang = 'en', max = 6) {
  const byId = FACTS.filter(f => f.id && f.id === o.id);
  const byKind = FACTS.filter(f => f.kind && f.kind === o.kind);
  return [...byId, ...byKind].slice(0, max).map(f => f[lang] || f.en);
}
/** One fresh contextual fact (not shown yet this session), or null. */
export function freshFact(o, lang = 'en') {
  const pool = FACTS.filter(f => (f.id && f.id === o.id) || (f.kind && f.kind === o.kind && Math.random() < 0.3));
  const fresh = pool.filter(f => !seen.has(f));
  if (!fresh.length) return null;
  const f = fresh[Math.floor(Math.random() * fresh.length)];
  seen.add(f);
  return { text: f[lang] || f.en, cat: f.cat };
}
