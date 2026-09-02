// Real (observed) exoplanet systems. Host-star data: [name, RA°, Dec°, dist ly, apparent mag, spectral type].
// Planets: a (AU), radius (Earth radii), period (days), recipe for the procedural surface, equilibrium T (K).
// Everything here is observed or published-estimate data; only surfaces are procedural (flagged in the UI).
export const KNOWN_HOSTS = [
  ['Proxima Centauri', 217.429, -62.679, 4.246, 11.13, 'M5.5V'],
  ['TRAPPIST-1', 346.622, -5.041, 40.66, 18.80, 'M8V'],
  ['Kepler-186', 298.482, 43.955, 579, 14.6, 'M1V'],
  ['Kepler-452', 291.664, 44.279, 1800, 13.4, 'G2V'],
  ['51 Pegasi', 344.367, 20.769, 50.6, 5.46, 'G2IV'],
  ['HD 189733', 300.182, 22.711, 64.5, 7.67, 'K1.5V'],
  ['Kepler-22', 289.217, 47.885, 638, 11.7, 'G5V'],
  ['TOI-700', 97.096, -65.577, 101.6, 13.1, 'M2V'],
];

export const KNOWN_SYSTEMS = {
  'Proxima Centauri': {
    lum: 0.0017, temp: 3042,
    planets: [
      { letter: 'b', a: 0.04857, radiusE: 1.07, periodD: 11.19, recipe: 'desert', teq: 234, mass: '≥ 1.07 M⊕', discovered: '2016 (radial velocity, ESO)', hz: true,
        desc: { en: 'The closest known exoplanet, in the habitable zone of the nearest star. Tidally locked and blasted by flares, it may or may not retain an atmosphere. A candidate target for Breakthrough Starshot.', es: 'El exoplaneta conocido más cercano, en la zona habitable de la estrella más próxima. Está anclado por marea y azotado por fulguraciones; puede o no conservar atmósfera. Objetivo candidato de Breakthrough Starshot.' },
        astro: { en: 'Receives 65 % of Earth\'s sunlight; liquid water is possible if it has an atmosphere. Proxima\'s flares (400× Earth\'s X-ray dose) are the main concern for habitability.', es: 'Recibe el 65 % de la luz que recibe la Tierra; el agua líquida es posible si tiene atmósfera. Las fulguraciones de Próxima (400 veces la dosis de rayos X terrestre) son la principal duda para su habitabilidad.' } },
      { letter: 'd', a: 0.02885, radiusE: 0.81, periodD: 5.12, recipe: 'lava', teq: 360, mass: '≈ 0.26 M⊕', discovered: '2022 (radial velocity, ESPRESSO)' },
      { letter: 'c', a: 1.489, radiusE: 1.5, periodD: 1928, recipe: 'ice', teq: 39, mass: '≈ 7 M⊕ (candidate)', discovered: '2019 (candidate)', provenance: 'estimated' },
    ],
  },
  'TRAPPIST-1': {
    lum: 0.000553, temp: 2566,
    planets: [
      { letter: 'b', a: 0.01154, radiusE: 1.116, periodD: 1.511, recipe: 'lava', teq: 400, mass: '1.37 M⊕' },
      { letter: 'c', a: 0.0158, radiusE: 1.097, periodD: 2.422, recipe: 'desert', teq: 342, mass: '1.31 M⊕' },
      { letter: 'd', a: 0.02227, radiusE: 0.788, periodD: 4.05, recipe: 'desert', teq: 288, mass: '0.39 M⊕', hz: true },
      { letter: 'e', a: 0.02925, radiusE: 0.92, periodD: 6.10, recipe: 'ocean', teq: 251, mass: '0.69 M⊕', hz: true,
        astro: { en: 'The most Earth-like of the seven in size, density and irradiation; JWST is probing whether it kept an atmosphere.', es: 'El más parecido a la Tierra de los siete en tamaño, densidad e irradiación; el JWST está sondeando si conservó atmósfera.' } },
      { letter: 'f', a: 0.03849, radiusE: 1.045, periodD: 9.21, recipe: 'ice', teq: 219, mass: '1.04 M⊕', hz: true },
      { letter: 'g', a: 0.04683, radiusE: 1.129, periodD: 12.35, recipe: 'ice', teq: 199, mass: '1.32 M⊕', hz: true },
      { letter: 'h', a: 0.06189, radiusE: 0.755, periodD: 18.77, recipe: 'ice', teq: 173, mass: '0.33 M⊕' },
    ],
    desc: { en: 'Seven Earth-sized rocky planets around an ultracool dwarf barely larger than Jupiter, all orbiting closer than Mercury does to the Sun. Three lie in the habitable zone. From planet e, the neighbours would loom larger than our Moon.', es: 'Siete planetas rocosos de tamaño terrestre alrededor de una enana ultrafría apenas mayor que Júpiter, todos más cerca que Mercurio del Sol. Tres están en la zona habitable. Desde el planeta e, los vecinos se verían mayores que nuestra Luna.' },
  },
  'Kepler-186': { lum: 0.055, temp: 3755, planets: [
    { letter: 'b', a: 0.0343, radiusE: 1.07, periodD: 3.89, recipe: 'lava', teq: 590 },
    { letter: 'c', a: 0.0451, radiusE: 1.25, periodD: 7.27, recipe: 'lava', teq: 510 },
    { letter: 'd', a: 0.0781, radiusE: 1.4, periodD: 13.34, recipe: 'desert', teq: 390 },
    { letter: 'e', a: 0.11, radiusE: 1.27, periodD: 22.41, recipe: 'desert', teq: 330 },
    { letter: 'f', a: 0.432, radiusE: 1.17, periodD: 129.9, recipe: 'ice', teq: 188, hz: true, discovered: '2014 (Kepler transit)',
      desc: { en: 'The first Earth-sized planet found in another star\'s habitable zone. It receives a third of Earth\'s starlight; a thick atmosphere would be needed for liquid water.', es: 'El primer planeta de tamaño terrestre hallado en la zona habitable de otra estrella. Recibe un tercio de la luz que recibe la Tierra; necesitaría una atmósfera densa para tener agua líquida.' } },
  ] },
  'Kepler-452': { lum: 1.2, temp: 5757, planets: [
    { letter: 'b', a: 1.046, radiusE: 1.63, periodD: 384.8, recipe: 'ocean', teq: 265, hz: true, discovered: '2015 (Kepler transit)', provenance: 'estimated',
      desc: { en: '"Earth\'s older cousin": a super-Earth in a 385-day orbit around a Sun-like star 1.5 billion years older than ours. Its mass is unknown; it could be rocky or a small gas world. Some analyses question the detection.', es: '"La prima mayor de la Tierra": una supertierra en una órbita de 385 días alrededor de una estrella similar al Sol, 1.500 millones de años más vieja. Su masa se desconoce; podría ser rocoso o un pequeño mundo gaseoso. Algunos análisis cuestionan la detección.' } },
  ] },
  '51 Pegasi': { lum: 1.36, temp: 5768, planets: [
    { letter: 'b', a: 0.0527, radiusE: 21, periodD: 4.23, recipe: 'gas', teq: 1260, mass: '0.46 M♃', discovered: '1995 (radial velocity) — first exoplanet around a Sun-like star',
      desc: { en: 'Dimidium, the planet that started it all: a "hot Jupiter" racing around its star every 4.2 days, discovered by Mayor and Queloz in 1995 (Nobel Prize 2019). Nobody expected a giant so close to its star.', es: 'Dimidium, el planeta que lo empezó todo: un "júpiter caliente" que da la vuelta a su estrella cada 4,2 días, descubierto por Mayor y Queloz en 1995 (Nobel 2019). Nadie esperaba un gigante tan cerca de su estrella.' } },
  ] },
  'HD 189733': { lum: 0.33, temp: 5040, planets: [
    { letter: 'b', a: 0.0313, radiusE: 12.7, periodD: 2.219, recipe: 'gas', teq: 1200, mass: '1.13 M♃', discovered: '2005 (transit)',
      desc: { en: 'A deep-blue hot Jupiter (the first exoplanet colour ever measured) where it may rain molten glass sideways in 8,700 km/h winds. Its atmosphere was the first mapped in temperature and the first found to contain water vapour and hydrogen sulfide.', es: 'Un júpiter caliente azul intenso (el primer color de un exoplaneta jamás medido) donde podría llover vidrio fundido de lado con vientos de 8.700 km/h. Su atmósfera fue la primera cartografiada en temperatura y la primera con vapor de agua y sulfuro de hidrógeno.' } },
  ] },
  'Kepler-22': { lum: 0.79, temp: 5518, planets: [
    { letter: 'b', a: 0.849, radiusE: 2.1, periodD: 289.9, recipe: 'ocean', teq: 262, hz: true, discovered: '2011 (Kepler transit)', provenance: 'estimated',
      desc: { en: 'The first transiting planet confirmed in a habitable zone: a 2.1-Earth-radius world that may be an ocean planet or a mini-Neptune.', es: 'El primer planeta en tránsito confirmado en una zona habitable: un mundo de 2,1 radios terrestres que podría ser un planeta océano o un mini-Neptuno.' } },
  ] },
  'TOI-700': { lum: 0.023, temp: 3480, planets: [
    { letter: 'b', a: 0.0677, radiusE: 0.91, periodD: 9.98, recipe: 'lava', teq: 410 },
    { letter: 'c', a: 0.0929, radiusE: 2.6, periodD: 16.05, recipe: 'gas', teq: 350 },
    { letter: 'd', a: 0.163, radiusE: 1.07, periodD: 37.42, recipe: 'ocean', teq: 269, hz: true, discovered: '2020 (TESS)',
      desc: { en: 'TESS\'s first Earth-sized habitable-zone planet, around a quiet red dwarf 100 light-years away.', es: 'El primer planeta de tamaño terrestre en zona habitable hallado por TESS, alrededor de una enana roja tranquila a 100 años luz.' } },
    { letter: 'e', a: 0.134, radiusE: 0.95, periodD: 27.8, recipe: 'desert', teq: 290, hz: true, discovered: '2023 (TESS)' },
  ] },
};

/** Conservative habitable zone (Kopparapu 2013 "runaway greenhouse" – "maximum greenhouse") in AU for a star of luminosity L (L☉). */
export function habitableZone(L) { const s = Math.sqrt(L); return { inner: 0.95 * s, outer: 1.67 * s, optimisticInner: 0.75 * s, optimisticOuter: 1.77 * s }; }
