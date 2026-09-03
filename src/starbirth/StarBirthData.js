// STAR FORMATION — data, texts (EN/ES) and per-mass parameters.
// Everything shown is a conceptual, time-compressed simulation inspired by real
// astrophysics (Jeans collapse, first/second cores, Keplerian discs,
// magnetocentrifugal jets, Hayashi contraction, hydrogen ignition).
const T = (en, es) => ({ en, es });

/** Star-mass variants. years[]: real duration of phases 0..5 (cloud, collapse, protostar, disc, jets, contraction). */
export const MASSES = {
  low: {
    key: 'low', mass: 0.2, radiusSun: 0.25, tempMS: 3300, lumSun: 0.006, protoTemp: 2800, protoRadiusSun: 1.6, protoLum: 0.3,
    cloudPc: 0.06, diskAU: 80, jet: 0.55, ion: 0, lifeYr: 1e12, coreTempMS: 6e6, coreDens: 500, cno: false,
    years: [2.5e6, 5e5, 6e5, 4e6, 2e6, 6e8], tIgnite: T('~1 billion years', '~1.000 millones de años'),
    name: T('Low-mass star', 'Estrella de baja masa'), sub: T('0.2 solar masses · red dwarf', '0,2 masas solares · enana roja'),
    note: T('A red dwarf. It collapses slowly, ignites only after a billion years of contraction, glows dim and red at 3,300 K — and will burn for trillions of years, longer than the universe has existed.',
      'Una enana roja. Colapsa despacio, se enciende tras mil millones de años de contracción, brilla tenue y roja a 3.300 K, y arderá durante billones de años: más de lo que el universo ha existido.'),
  },
  solar: {
    key: 'solar', mass: 1, radiusSun: 1, tempMS: 5772, lumSun: 1, protoTemp: 3600, protoRadiusSun: 4, protoLum: 12,
    cloudPc: 0.08, diskAU: 150, jet: 1, ion: 0.18, lifeYr: 1e10, coreTempMS: 1.5e7, coreDens: 150, cno: false,
    years: [1e6, 1.5e5, 3e5, 2e6, 1e6, 4e7], tIgnite: T('~40 million years', '~40 millones de años'),
    name: T('Sun-like star', 'Estrella tipo Sol'), sub: T('1 solar mass · yellow dwarf', '1 masa solar · enana amarilla'),
    note: T('A Sun. It ignites after some 40 million years of contraction, shines yellow-white at 5,800 K for 10 billion years, then swells into a red giant.',
      'Un Sol. Se enciende tras unos 40 millones de años de contracción, brilla blanco-amarillo a 5.800 K durante 10.000 millones de años y después se hincha en gigante roja.'),
  },
  massive: {
    key: 'massive', mass: 15, radiusSun: 5.5, tempMS: 31000, lumSun: 25000, protoTemp: 5200, protoRadiusSun: 28, protoLum: 4000,
    cloudPc: 0.25, diskAU: 400, jet: 1.8, ion: 1, lifeYr: 1.2e7, coreTempMS: 3.2e7, coreDens: 6, cno: true,
    years: [3e5, 3e4, 5e4, 1e5, 1e5, 1e5], tIgnite: T('~100,000 years', '~100.000 años'),
    name: T('Massive star', 'Estrella masiva'), sub: T('15 solar masses · blue giant', '15 masas solares · gigante azul'),
    note: T('A blue giant. It forms in only 100,000 years and ignites while still accreting, blazes at 31,000 K with the light of 25,000 Suns, ionises its birth cloud into an HII region and dies as a supernova after 12 million years.',
      'Una gigante azul. Se forma en solo 100.000 años y se enciende mientras aún acreta, arde a 31.000 K con la luz de 25.000 soles, ioniza su nube natal en una región HII y muere como supernova a los 12 millones de años.'),
  },
};

/** Visual seconds per phase at 1× (phase 6, the main sequence, is open-ended). */
export const PHASE_SECONDS = [30, 50, 40, 45, 45, 35, 240];

export const PHASES = [
  {
    id: 'cloud', name: T('Molecular cloud', 'Nube molecular'), title: T('A giant molecular cloud', 'Una nube molecular gigante'),
    text: T('Stars are born in the coldest, darkest places in the galaxy: clouds of molecular hydrogen, helium and dust at just 10–20 K. This one spans light-years, holds the mass of thousands of Suns, and turbulence has combed it into filaments and dense knots.',
      'Las estrellas nacen en los lugares más fríos y oscuros de la galaxia: nubes de hidrógeno molecular, helio y polvo a solo 10–20 K. Esta abarca años luz, contiene la masa de miles de soles y la turbulencia la ha peinado en filamentos y nudos densos.'),
    points: [T('~71 % hydrogen, 27 % helium, 2 % heavier elements and dust', '~71 % hidrógeno, 27 % helio, 2 % elementos pesados y polvo'),
      T('100–1,000 molecules per cm³ — a better vacuum than any lab on Earth', '100–1.000 moléculas por cm³: mejor vacío que cualquier laboratorio'),
      T('The densest knots, the cores, are where single stars will form', 'Los nudos más densos, los núcleos, son donde se formarán estrellas')],
    stats: (m) => [[T('Temperature', 'Temperatura'), '10–20 K'], [T('Density', 'Densidad'), '10²–10³ cm⁻³ · core 10⁴–10⁶'], [T('Cloud mass', 'Masa de la nube'), '10⁴–10⁶ M☉'], [T('This core', 'Este núcleo'), `${m.cloudPc} pc ≈ ${Math.round(m.cloudPc * 206265 / 100) * 100} AU`]],
  },
  {
    id: 'collapse', name: T('Collapse', 'Colapso'), title: T('Gravity wins', 'La gravedad gana'),
    text: T('In a dense core gravity finally overcomes the gas pressure that held the cloud up — the Jeans criterion. A shock from a nearby supernova or a passing spiral arm can tip the balance. Material streams inward from the inside out and its density climbs twenty orders of magnitude on the way to becoming a star.',
      'En un núcleo denso la gravedad vence por fin a la presión del gas que sostenía la nube: el criterio de Jeans. La onda de choque de una supernova cercana o el paso de un brazo espiral pueden inclinar la balanza. El material cae de dentro afuera y su densidad crece veinte órdenes de magnitud en su camino a ser estrella.'),
    points: [T('Free-fall time of a core: about 100,000 years', 'Tiempo de caída libre de un núcleo: unos 100.000 años'),
      T('Any slight spin is amplified as the core shrinks: angular momentum is conserved', 'Cualquier giro leve se amplifica al encoger el núcleo: se conserva el momento angular'),
      T('Cores fragment — most stars are born with siblings', 'Los núcleos se fragmentan: la mayoría de estrellas nace con hermanas')],
    stats: () => [[T('Trigger', 'Detonante'), T('turbulence · cloud collisions · supernova shocks', 'turbulencia · choques de nubes · supernovas')], [T('Jeans mass', 'Masa de Jeans'), '≈ 1–5 M☉ (10 K)'], [T('Free-fall time', 'Tiempo de caída libre'), '~10⁵ yr'], [T('Density gain', 'Ganancia de densidad'), '×10²⁰']],
  },
  {
    id: 'protostar', name: T('Protostar', 'Protoestrella'), title: T('A protostar is born', 'Nace una protoestrella'),
    text: T('When the centre turns opaque to its own radiation, heat can no longer escape: a first core forms at ~2,000 K, molecular hydrogen breaks apart and the collapse resumes to a second, stellar core — the protostar. Only a few solar radii wide, it glows with the energy of infalling gas, not fusion. At one million kelvin deuterium starts to burn: the first nuclear fire.',
      'Cuando el centro se vuelve opaco a su propia radiación el calor ya no escapa: se forma un primer núcleo a ~2.000 K, el hidrógeno molecular se rompe y el colapso continúa hasta un segundo núcleo estelar: la protoestrella. Con solo unos radios solares, brilla por la energía del gas que cae, no por la fusión. A un millón de kelvin empieza a quemar deuterio: el primer fuego nuclear.'),
    points: [T('Buried in its envelope, it is seen only in infrared and radio', 'Enterrada en su envoltura, solo se ve en infrarrojo y radio'),
      T('It swallows ~10⁻⁵ solar masses of gas every year', 'Traga ~10⁻⁵ masas solares de gas cada año'),
      T('Class 0 → Class I: 100,000–500,000 years', 'Clase 0 → Clase I: 100.000–500.000 años')],
    stats: (m) => [[T('Surface temperature', 'Temperatura superficial'), `${m.protoTemp.toLocaleString('en-US')} K`], [T('Core temperature', 'Temperatura del núcleo'), '10⁵ → 10⁶ K'], [T('Radius', 'Radio'), `${m.protoRadiusSun} R☉`], [T('Energy source', 'Fuente de energía'), T('gravity (accretion)', 'gravedad (acreción)')]],
  },
  {
    id: 'disk', name: T('Disc', 'Disco'), title: T('The disc that builds planets', 'El disco que fabrica planetas'),
    text: T('Infalling gas cannot reach the star directly: its spin flattens it into a rotating disc a few hundred AU across, a percent of the star\'s mass. Inside, it turns once a year like Earth; at the rim, once in a thousand years. Dust grains stick into pebbles, then planetesimals — the seeds of planets. ALMA sees rings and gaps in real discs where young planets are already clearing their orbits.',
      'El gas que cae no puede llegar directo a la estrella: su giro lo aplana en un disco rotatorio de unos cientos de UA y un uno por ciento de la masa estelar. Por dentro da una vuelta al año, como la Tierra; en el borde, una cada mil años. Los granos de polvo se pegan en guijarros y luego en planetesimales: las semillas de los planetas. ALMA ve anillos y huecos en discos reales donde planetas jóvenes ya despejan sus órbitas.'),
    points: [T('Keplerian rotation: fast inside, slow outside', 'Rotación kepleriana: rápida dentro, lenta fuera'),
      T('1,000 K next to the star, 20 K at the rim', '1.000 K junto a la estrella, 20 K en el borde'),
      T('Discs live 1–10 million years; then planets, or dispersal', 'Los discos viven 1–10 millones de años; luego planetas, o dispersión')],
    stats: (m) => [[T('Radius', 'Radio'), `${m.diskAU} AU`], [T('Mass', 'Masa'), T('~1 % of the star', '~1 % de la estrella')], [T('Temperature', 'Temperatura'), '1,000 K → 20 K'], [T('Orbit at 1 AU', 'Órbita a 1 UA'), T('1 year', '1 año')], [T('Lifetime', 'Vida'), '1–10 Myr']],
  },
  {
    id: 'jets', name: T('Bipolar jets', 'Chorros bipolares'), title: T('Jets: the star\'s exhaust', 'Chorros: el escape de la estrella'),
    text: T('Rotation twists the magnetic field threading the inner disc into a spring that flings gas out along both poles at hundreds of km/s. The jets carry away the angular momentum that would otherwise stop accretion — without them the star could not grow. Where they slam into the cloud they light up as Herbig–Haro objects, and over time they carve bipolar cavities through the envelope.',
      'La rotación retuerce el campo magnético del disco interno como un muelle que lanza gas por ambos polos a cientos de km/s. Los chorros se llevan el momento angular que, de otro modo, frenaría la acreción: sin ellos la estrella no podría crecer. Donde chocan con la nube se iluminan como objetos Herbig-Haro y, con el tiempo, excavan cavidades bipolares en la envoltura.'),
    points: [T('100–400 km/s, and lengths of light-years', '100–400 km/s y longitudes de años luz'),
      T('About a tenth of the accreted mass is thrown back out', 'Alrededor de una décima parte de la masa acretada sale despedida'),
      T('Why two? The field is symmetric about the disc, so gas escapes along both poles', '¿Por qué dos? El campo es simétrico respecto al disco: el gas escapa por ambos polos')],
    stats: () => [[T('Speed', 'Velocidad'), '100–400 km/s'], [T('Length', 'Longitud'), T('up to parsecs', 'hasta pársecs')], [T('Mass ejected', 'Masa expulsada'), T('~10 % of accretion', '~10 % de la acreción')], [T('Engine', 'Motor'), T('magnetic field + rotation', 'campo magnético + rotación')], [T('Seen as', 'Se ven como'), T('Herbig–Haro objects', 'objetos Herbig-Haro')]],
  },
  {
    id: 'ignition', name: T('Ignition', 'Ignición'), title: T('The core ignites', 'El núcleo se enciende'),
    text: T('Freed from its envelope, the young star keeps contracting and heats its core by gravity alone — the Hayashi track. When the centre passes ~10 million kelvin, protons fuse into helium. It is a gradual switch-on, not an explosion, but it marks the moment gravity meets its match. A wind from the new star sweeps the last gas away.',
      'Liberada de su envoltura, la estrella joven sigue contrayéndose y calienta su núcleo solo con la gravedad: la traza de Hayashi. Cuando el centro supera los ~10 millones de kelvin, los protones se fusionan en helio. Es un encendido progresivo, no una explosión, pero marca el momento en que la gravedad encuentra su rival. Un viento de la nueva estrella barre el gas restante.'),
    points: [T('4 H → He: 0.7 % of the mass becomes energy (E = mc²)', '4 H → He: el 0,7 % de la masa se convierte en energía (E = mc²)'),
      T('Time to ignition: 40 Myr for a Sun · 100,000 yr at 15 M☉ · ~1 Gyr at 0.2 M☉', 'Tiempo hasta la ignición: 40 Ma para un Sol · 100.000 años a 15 M☉ · ~1.000 Ma a 0,2 M☉'),
      T('Below 0.08 M☉ the core never gets hot enough: a brown dwarf', 'Por debajo de 0,08 M☉ el núcleo nunca se calienta bastante: una enana marrón')],
    stats: (m) => [[T('Core temperature', 'Temperatura del núcleo'), '≈ 1 × 10⁷ K'], [T('Core density', 'Densidad del núcleo'), '~100 g/cm³'], [T('Reaction', 'Reacción'), m.cno ? T('CNO cycle', 'ciclo CNO') : T('proton–proton chain', 'cadena protón-protón')], [T('Time to ignition', 'Tiempo hasta la ignición'), m.tIgnite]],
  },
  {
    id: 'main', name: T('Main sequence', 'Secuencia principal'), title: T('A star is born', 'Ha nacido una estrella'),
    text: T('The outward push of fusion-heated gas now exactly balances the inward pull of gravity: hydrostatic equilibrium. The star will keep this truce for most of its life — 10 billion years for a Sun, 12 million for a 15-solar-mass giant, trillions for a red dwarf. Its light disperses what is left of the cloud; in the disc, planets finish forming within 100 million years.',
      'El empuje hacia fuera del gas calentado por la fusión equilibra ahora exactamente el tirón de la gravedad: equilibrio hidrostático. La estrella mantendrá esta tregua la mayor parte de su vida: 10.000 millones de años para un Sol, 12 millones para una gigante de 15 masas solares, billones para una enana roja. Su luz dispersa lo que queda de la nube; en el disco, los planetas terminan de formarse en 100 millones de años.'),
    points: [T('Luminosity rises steeply with mass: L ∝ M³·⁵', 'La luminosidad crece muy rápido con la masa: L ∝ M³·⁵'),
      T('Lifetime ∝ M / L — heavier stars burn out sooner', 'Vida ∝ M / L: las estrellas pesadas se agotan antes'),
      T('The Sun was born this way 4.6 billion years ago, probably with ~1,000 siblings', 'El Sol nació así hace 4.600 millones de años, probablemente con ~1.000 hermanas')],
    stats: (m) => [[T('Surface temperature', 'Temperatura superficial'), `${m.tempMS.toLocaleString('en-US')} K`], [T('Radius', 'Radio'), `${m.radiusSun} R☉ ≈ ${Math.round(m.radiusSun * 695700).toLocaleString('en-US')} km`], [T('Luminosity', 'Luminosidad'), `${m.lumSun} L☉`], [T('Lifetime', 'Vida'), fmtYears(m.lifeYr)], [T('Equilibrium', 'Equilibrio'), T('gravity = pressure', 'gravedad = presión')]],
  },
];

/** Timed explanations (explanatory mode & guided tour), keyed to the simulation clock u ∈ [0, 7). */
export const EVENTS = [
  { u: 0.3, en: ['Dense knots', 'Turbulence and magnetic fields pile gas into filaments; the densest knots are the cores that will collapse.'], es: ['Nudos densos', 'La turbulencia y los campos magnéticos apilan el gas en filamentos; los nudos más densos son los núcleos que colapsarán.'] },
  { u: 1.05, en: ['Inside-out collapse', 'The centre falls first; the outer envelope follows in free fall.'], es: ['Colapso de dentro afuera', 'El centro cae primero; la envoltura exterior lo sigue en caída libre.'] },
  { u: 1.5, en: ['Spin-up', 'As the core shrinks it spins faster — like a skater pulling in her arms.'], es: ['Aceleración del giro', 'Al encoger, el núcleo gira más deprisa, como una patinadora que recoge los brazos.'] },
  { u: 2.05, en: ['First core', 'At 2,000 K molecular hydrogen dissociates and the collapse resumes to a stellar core.'], es: ['Primer núcleo', 'A 2.000 K el hidrógeno molecular se disocia y el colapso continúa hasta un núcleo estelar.'] },
  { u: 2.55, en: ['Deuterium burning', 'One million kelvin: the first nuclear reactions, still far from hydrogen fusion.'], es: ['Combustión del deuterio', 'Un millón de kelvin: las primeras reacciones nucleares, aún lejos de fusionar hidrógeno.'] },
  { u: 3.15, en: ['Keplerian rotation', 'The inner disc turns fastest: one orbit per year at 1 AU.'], es: ['Rotación kepleriana', 'El disco interno gira más deprisa: una órbita al año a 1 UA.'] },
  { u: 3.6, en: ['From grains to pebbles', 'Dust sticks together; in a few million years, planetesimals.'], es: ['De granos a guijarros', 'El polvo se pega; en unos millones de años, planetesimales.'] },
  { u: 4.1, en: ['Magnetic launch', 'Twisted field lines fling gas out along both poles at ~300 km/s.'], es: ['Lanzamiento magnético', 'Las líneas de campo retorcidas lanzan gas por ambos polos a ~300 km/s.'] },
  { u: 4.55, en: ['Herbig–Haro objects', 'Where the jets hit the cloud, shocked gas glows red and green.'], es: ['Objetos Herbig-Haro', 'Donde los chorros golpean la nube, el gas chocado brilla rojo y verde.'] },
  { u: 5.1, en: ['Hayashi track', 'The star contracts for millions of years, heating its core by gravity alone.'], es: ['Traza de Hayashi', 'La estrella se contrae durante millones de años y calienta su núcleo solo con la gravedad.'] },
  { u: 5.82, en: ['Ignition', '10 million kelvin: hydrogen fuses into helium.'], es: ['Ignición', '10 millones de kelvin: el hidrógeno se fusiona en helio.'] },
  { u: 6.05, en: ['Hydrostatic equilibrium', 'Pressure out, gravity in — a balance kept for billions of years.'], es: ['Equilibrio hidrostático', 'Presión hacia fuera, gravedad hacia dentro: un equilibrio que dura miles de millones de años.'] },
  { u: 6.35, en: ['The cloud clears', 'Wind and light disperse the envelope; the new star becomes visible.'], es: ['La nube se despeja', 'El viento y la luz dispersan la envoltura; la nueva estrella se hace visible.'] },
];

export const FACTS = [
  T('Stellar nurseries: the Orion Nebula, 1,344 light-years away, is the closest place where massive stars are forming right now — visible to the naked eye as the middle "star" of Orion\'s sword.', 'Viveros estelares: la nebulosa de Orión, a 1.344 años luz, es el lugar más cercano donde nacen estrellas masivas ahora mismo; se ve a simple vista como la "estrella" central de la espada de Orión.'),
  T('The Milky Way makes only one or two new stars\' worth of gas into stars each year — a slow, steady birth rate for a galaxy of 200 billion stars.', 'La Vía Láctea convierte en estrellas solo una o dos masas solares de gas al año: una natalidad lenta y constante para una galaxia de 200.000 millones de estrellas.'),
  T('The Sun formed this way 4.6 billion years ago, probably in a cluster of about a thousand siblings that has long since drifted apart.', 'El Sol se formó así hace 4.600 millones de años, probablemente en un cúmulo de unas mil hermanas que hace mucho se dispersó.'),
  T('Radioactive aluminium-26 found in meteorites suggests a supernova exploded close to the newborn Sun — and may even have triggered its birth.', 'El aluminio-26 radiactivo hallado en meteoritos sugiere que una supernova estalló cerca del Sol recién nacido, y quizá incluso desencadenó su nacimiento.'),
  T('Three out of four stars in the galaxy are red dwarfs of less than half a solar mass. None of them has died yet: their lifetimes exceed the age of the universe.', 'Tres de cada cuatro estrellas de la galaxia son enanas rojas de menos de media masa solar. Ninguna ha muerto todavía: sus vidas superan la edad del universo.'),
  T('Below 8 % of the Sun\'s mass the core never reaches fusion temperature: the object becomes a brown dwarf, a "failed star" that slowly cools forever.', 'Por debajo del 8 % de la masa del Sol el núcleo nunca alcanza la temperatura de fusión: el objeto se convierte en enana marrón, una "estrella fallida" que se enfría para siempre.'),
  T('Molecular clouds are the coldest places in the galaxy, about 10 K — cold enough for water, carbon monoxide and even methanol to freeze onto dust grains.', 'Las nubes moleculares son los lugares más fríos de la galaxia, unos 10 K: bastante para que el agua, el monóxido de carbono y hasta el metanol se congelen sobre los granos de polvo.'),
  T('A protostar hides inside so much dust that visible light cannot escape. We discovered them only with infrared and radio telescopes.', 'Una protoestrella se esconde entre tanto polvo que la luz visible no puede escapar. Solo las descubrimos con telescopios infrarrojos y de radio.'),
  T('In 2014 ALMA imaged the disc of HL Tauri: concentric rings and gaps where planets are forming — around a star just one million years old.', 'En 2014 ALMA fotografió el disco de HL Tauri: anillos y huecos concéntricos donde se forman planetas, alrededor de una estrella de solo un millón de años.'),
  T('The planets carry 99 % of the Solar System\'s angular momentum although they hold 0.1 % of its mass — the disc, not the Sun, kept the spin.', 'Los planetas llevan el 99 % del momento angular del Sistema Solar aunque tienen el 0,1 % de su masa: el giro se lo quedó el disco, no el Sol.'),
  T('Protostellar jets such as HH 34 and HH 47 stretch for light-years, with knots that can be seen moving in Hubble images taken a few years apart.', 'Chorros protoestelares como HH 34 y HH 47 se extienden años luz, con nudos que se ven moverse en imágenes del Hubble tomadas con pocos años de diferencia.'),
  T('The first stars, born 100–200 million years after the Big Bang, formed from pure hydrogen and helium and may have weighed hundreds of solar masses.', 'Las primeras estrellas, nacidas 100–200 millones de años tras el Big Bang, se formaron de hidrógeno y helio puros y pudieron pesar cientos de masas solares.'),
  T('A newborn massive star is so bright that its ultraviolet light strips electrons from the surrounding hydrogen, blowing a glowing HII bubble like the Rosette Nebula.', 'Una estrella masiva recién nacida es tan brillante que su luz ultravioleta arranca electrones al hidrógeno circundante y sopla una burbuja HII luminosa como la nebulosa Roseta.'),
];

/** Selectable structures inside the simulation. */
export const STRUCTS = {
  core: { name: T('Dense core', 'Núcleo denso'), desc: T('The knot of cold gas that is collapsing. A few solar masses in a tenth of a parsec, held together by its own gravity against thermal pressure, turbulence and magnetic fields.', 'El nudo de gas frío que está colapsando. Unas masas solares en una décima de pársec, unidas por su propia gravedad frente a la presión térmica, la turbulencia y los campos magnéticos.') },
  star: { name: T('Protostar', 'Protoestrella'), desc: T('The stellar core growing at the centre. It shines with the gravitational energy of the gas raining onto it; hydrogen fusion will not start until the core reaches ten million kelvin.', 'El núcleo estelar que crece en el centro. Brilla con la energía gravitatoria del gas que llueve sobre él; la fusión del hidrógeno no empezará hasta que el núcleo alcance diez millones de kelvin.') },
  starMS: { name: T('Young star', 'Estrella joven'), desc: T('A newborn main-sequence star in hydrostatic equilibrium: the pressure of fusion-heated gas balances gravity exactly.', 'Una estrella recién nacida de secuencia principal en equilibrio hidrostático: la presión del gas calentado por la fusión equilibra exactamente la gravedad.') },
  disk: { name: T('Accretion disc', 'Disco de acreción'), desc: T('A rotating disc of gas and dust flattened by its own spin. Friction lets material spiral slowly onto the star; dust grains grow into the seeds of planets.', 'Un disco de gas y polvo aplanado por su propio giro. La fricción deja que el material caiga en espiral lentamente sobre la estrella; los granos de polvo crecen hasta ser semillas de planetas.') },
  jetN: { name: T('Northern jet', 'Chorro norte'), desc: T('A collimated beam of gas launched by twisted magnetic fields at hundreds of km/s. The bright knots are shocks (Herbig–Haro objects) where the jet rams the cloud.', 'Un haz colimado de gas lanzado por campos magnéticos retorcidos a cientos de km/s. Los nudos brillantes son choques (objetos Herbig-Haro) donde el chorro embiste la nube.') },
  jetS: { name: T('Southern jet', 'Chorro sur'), desc: T('The twin of the northern jet: the magnetic field is symmetric about the disc, so gas escapes along both poles.', 'El gemelo del chorro norte: el campo magnético es simétrico respecto al disco, así que el gas escapa por ambos polos.') },
  sib: { name: T('Sibling protostar', 'Protoestrella hermana'), desc: T('Another knot of the same cloud collapsing at the same time. Stars are almost never born alone: cores fragment into clusters of tens to thousands.', 'Otro nudo de la misma nube colapsando a la vez. Las estrellas casi nunca nacen solas: los núcleos se fragmentan en cúmulos de decenas a miles.') },
};

/** Guided-tour camera keyframes: u → view. dist is [scale, multiple]: scale ∈ cloud|disk|jet|star. phi = elevation (rad). */
export const TOUR = [
  { u: 0.0, dist: ['cloud', 3.6], phi: 0.22 },
  { u: 0.9, dist: ['cloud', 1.7], phi: 0.28 },
  { u: 1.0, dist: ['cloud', 0.95], phi: 0.3 },
  { u: 1.9, dist: ['cloud', 0.16], phi: 0.35 },
  { u: 2.0, dist: ['disk', 7], phi: 0.4 },
  { u: 2.9, dist: ['disk', 2.6], phi: 0.45 },
  { u: 3.0, dist: ['disk', 2.2], phi: 0.55 },
  { u: 3.95, dist: ['disk', 1.5], phi: 0.18 },
  { u: 4.0, dist: ['jet', 1.5], phi: 0.08 },
  { u: 4.5, dist: ['jet', 0.8], phi: 0.12 },
  { u: 4.95, dist: ['jet', 1.3], phi: 0.2 },
  { u: 5.0, dist: ['disk', 1.1], phi: 0.3 },
  { u: 5.7, dist: ['star', 60], phi: 0.2 },
  { u: 5.85, dist: ['star', 30], phi: 0.15 },
  { u: 6.05, dist: ['star', 9], phi: 0.2 },
  { u: 6.35, dist: ['disk', 1.8], phi: 0.4 },
  { u: 6.7, dist: ['cloud', 0.7], phi: 0.3 },
];
export const TOUR_END_U = 6.72;

export function fmtYears(y, lang = 'en') {
  const es = lang === 'es';
  const f = (n, d = 3) => n.toLocaleString(es ? 'es-ES' : 'en-US', { maximumSignificantDigits: d });
  if (y < 1e3) return `${Math.round(y)} ${es ? 'años' : 'years'}`;
  if (y < 1e6) return `${f(y / 1e3)} ${es ? 'mil años' : 'thousand years'}`;
  if (y < 1e9) return `${f(y / 1e6)} ${es ? 'millones de años' : 'million years'}`;
  if (y < 1e12) return `${f(y / 1e9)} ${es ? 'miles de millones de años' : 'billion years'}`;
  return `${f(y / 1e12)} ${es ? 'billones de años' : 'trillion years'}`;
}
