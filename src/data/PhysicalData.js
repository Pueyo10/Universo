// Extended physical data for the science panel. Values from NASA planetary fact
// sheets / JPL / IAU (observed or well-constrained estimates). Numbers here are
// SI-ish: mass kg, radius km, temperatures °C, pressure bar, periods hours/days.
// Derived quantities (volume, density, gravity, escape velocity, light time…)
// are computed, never typed.
export const PHYS = {
  sun:     { mass: 1.9885e30, radius: 695700, tempMean: 5499, rotationH: 609.12, ageGy: 4.6, tilt: 7.25, luminosityW: 3.828e26,
             composition: [['H', 73.5], ['He', 24.9], ['O', 0.8], ['C', 0.3], ['Fe', 0.15], ['Ne', 0.12], ['other', 0.23]],
             notes: { en: 'Composition by mass (photosphere). Hydrogen fuses into helium in the core at 15.7 million K.', es: 'Composición en masa (fotosfera). El hidrógeno se fusiona en helio en el núcleo a 15,7 millones de K.' } },
  mercury: { mass: 3.3011e23, radius: 2439.7, tilt: 0.034, tempMean: 167, tempMin: -173, tempMax: 427, pressure: 1e-14, rotationH: 1407.6, dayH: 4222.6, yearD: 87.969, orbitalV: 47.36, ageGy: 4.5, moons: 0,
             atmosphere: [['O₂', 42], ['Na', 29], ['H₂', 22], ['He', 6], ['K', 0.5]], atmoNote: { en: 'A tenuous exosphere, not a true atmosphere.', es: 'Una exosfera tenue, no una atmósfera real.' },
             composition: [['iron core', 60], ['silicate mantle & crust', 40]] },
  venus:   { mass: 4.8675e24, radius: 6051.8, tilt: 177.36, tempMean: 464, tempMin: 438, tempMax: 482, pressure: 92, rotationH: -5832.5, dayH: 2802, yearD: 224.701, orbitalV: 35.02, ageGy: 4.5, moons: 0,
             atmosphere: [['CO₂', 96.5], ['N₂', 3.5], ['SO₂', 0.015], ['Ar', 0.007]], atmoNote: { en: 'Runaway greenhouse; clouds of sulfuric acid at 50–70 km.', es: 'Efecto invernadero desbocado; nubes de ácido sulfúrico a 50–70 km.' },
             composition: [['iron core', 32], ['silicate mantle', 68]] },
  earth:   { mass: 5.9722e24, radius: 6371.0, tilt: 23.44, tempMean: 15, tempMin: -89, tempMax: 57, pressure: 1.013, rotationH: 23.9345, dayH: 24, yearD: 365.256, orbitalV: 29.78, ageGy: 4.54, moons: 1,
             atmosphere: [['N₂', 78.08], ['O₂', 20.95], ['Ar', 0.93], ['CO₂', 0.042], ['H₂O (variable)', 0.4], ['Ne', 0.0018]], atmoNote: { en: 'Free oxygen is a signature of photosynthetic life.', es: 'El oxígeno libre es una firma de la vida fotosintética.' },
             composition: [['iron–nickel core', 32.5], ['silicate mantle', 67], ['crust', 0.5]] },
  mars:    { mass: 6.4171e23, radius: 3389.5, tilt: 25.19, tempMean: -65, tempMin: -153, tempMax: 20, pressure: 0.0063, rotationH: 24.6229, dayH: 24.66, yearD: 686.98, orbitalV: 24.07, ageGy: 4.5, moons: 2,
             atmosphere: [['CO₂', 95.1], ['N₂', 2.6], ['Ar', 1.9], ['O₂', 0.16], ['CO', 0.06]], atmoNote: { en: 'Less than 1 % of Earth\'s pressure; water is stable only as ice or vapour.', es: 'Menos del 1 % de la presión terrestre; el agua solo es estable como hielo o vapor.' },
             composition: [['iron–sulfur core', 25], ['silicate mantle & crust', 75]] },
  jupiter: { mass: 1.8982e27, radius: 69911, tilt: 3.13, tempMean: -110, pressure: null, rotationH: 9.925, dayH: 9.925, yearD: 4332.59, orbitalV: 13.07, ageGy: 4.6, moons: 95,
             atmosphere: [['H₂', 89.8], ['He', 10.2], ['CH₄', 0.3], ['NH₃', 0.026], ['H₂O', 0.004]], atmoNote: { en: 'No solid surface: temperatures and pressures are quoted at the 1-bar level.', es: 'Sin superficie sólida: temperatura y presión se dan al nivel de 1 bar.' },
             composition: [['hydrogen', 71], ['helium', 24], ['heavier elements & rocky core', 5]] },
  saturn:  { mass: 5.6834e26, radius: 58232, tilt: 26.73, tempMean: -140, pressure: null, rotationH: 10.656, dayH: 10.656, yearD: 10759.22, orbitalV: 9.68, ageGy: 4.6, moons: 146,
             atmosphere: [['H₂', 96.3], ['He', 3.25], ['CH₄', 0.45], ['NH₃', 0.0125]], atmoNote: { en: 'Mean density 0.687 g/cm³ — less than water.', es: 'Densidad media 0,687 g/cm³: menos que el agua.' },
             composition: [['hydrogen', 75], ['helium', 22], ['ices & rocky core', 3]] },
  uranus:  { mass: 8.6810e25, radius: 25362, tilt: 97.77, tempMean: -195, pressure: null, rotationH: -17.24, dayH: 17.24, yearD: 30688.5, orbitalV: 6.80, ageGy: 4.6, moons: 28,
             atmosphere: [['H₂', 82.5], ['He', 15.2], ['CH₄', 2.3]], atmoNote: { en: 'Methane absorbs red light and gives the cyan colour. Coldest planetary atmosphere: 49 K.', es: 'El metano absorbe el rojo y da el color cian. La atmósfera planetaria más fría: 49 K.' },
             composition: [['water–ammonia–methane ices', 60], ['rock', 25], ['hydrogen–helium envelope', 15]] },
  neptune: { mass: 1.02413e26, radius: 24622, tilt: 28.32, tempMean: -200, pressure: null, rotationH: 16.11, dayH: 16.11, yearD: 60182, orbitalV: 5.43, ageGy: 4.6, moons: 16,
             atmosphere: [['H₂', 80], ['He', 19], ['CH₄', 1.5]], atmoNote: { en: 'Fastest winds in the Solar System: 2,100 km/h.', es: 'Los vientos más rápidos del Sistema Solar: 2.100 km/h.' },
             composition: [['ices', 60], ['rock', 25], ['hydrogen–helium envelope', 15]] },
  pluto:   { mass: 1.303e22, radius: 1188.3, tilt: 122.53, tempMean: -229, tempMin: -240, tempMax: -218, pressure: 1e-5, rotationH: -153.29, dayH: 153.29, yearD: 90560, orbitalV: 4.74, ageGy: 4.5, moons: 5,
             atmosphere: [['N₂', 99], ['CH₄', 0.5], ['CO', 0.05]], composition: [['rock', 65], ['water ice', 35]] },
  ceres:   { mass: 9.38e20, radius: 469.7, tilt: 4, tempMean: -105, rotationH: 9.07, yearD: 1680, orbitalV: 17.9, moons: 0, composition: [['rock', 70], ['water ice & salts', 30]] },
  moon:    { mass: 7.342e22, radius: 1737.4, tilt: 6.68, tempMean: -20, tempMin: -173, tempMax: 127, pressure: 3e-15, rotationH: 655.72, dayH: 708.7, yearD: 27.3217, orbitalV: 1.022, ageGy: 4.51, moons: 0,
             composition: [['anorthositic crust', 10], ['silicate mantle', 88], ['small iron core', 2]] },
  io:      { mass: 8.9319e22, radius: 1821.6, tempMean: -143, tempMin: -183, tempMax: 1600, rotationH: 42.46, yearD: 1.769, orbitalV: 17.33, composition: [['silicate rock', 80], ['iron–sulfide core', 20]],
             astrobiology: null },
  europa:  { mass: 4.7998e22, radius: 1560.8, tempMean: -160, tempMin: -223, tempMax: -148, pressure: 1e-12, rotationH: 85.23, yearD: 3.551, orbitalV: 13.74, composition: [['water ice shell (15–25 km)', 8], ['salty ocean (60–150 km)', 20], ['silicate mantle & iron core', 72]],
             atmosphere: [['O₂', 100]],
             astrobiology: { en: 'A global salt-water ocean of ~2–3 times Earth\'s water volume lies under 15–25 km of ice, kept liquid by tidal heating. Hydrothermal vents on its floor could supply chemical energy. NASA\'s Europa Clipper (arrival 2030) will assess habitability — not search for life.', es: 'Un océano global de agua salada, con 2–3 veces el agua de la Tierra, yace bajo 15–25 km de hielo, mantenido líquido por el calor de marea. Fuentes hidrotermales en su fondo podrían aportar energía química. Europa Clipper (llegada 2030) evaluará su habitabilidad, no buscará vida.' } },
  ganymede:{ mass: 1.4819e23, radius: 2634.1, tempMean: -163, rotationH: 171.7, yearD: 7.155, orbitalV: 10.88, composition: [['ice shell', 30], ['subsurface ocean (est.)', 10], ['rock & iron core', 60]],
             astrobiology: { en: 'Magnetic-field measurements imply a salty ocean ~150 km down, possibly larger than all of Earth\'s oceans, sandwiched between ice layers. ESA\'s JUICE arrives in 2031.', es: 'Las medidas del campo magnético implican un océano salado a ~150 km de profundidad, quizá mayor que todos los océanos de la Tierra, entre capas de hielo. JUICE (ESA) llega en 2031.' } },
  callisto:{ mass: 1.0759e23, radius: 2410.3, tempMean: -139, rotationH: 400.5, yearD: 16.69, orbitalV: 8.20, composition: [['rock', 50], ['ice', 50]] },
  titan:   { mass: 1.3452e23, radius: 2574.7, tempMean: -179, pressure: 1.45, rotationH: 382.7, yearD: 15.945, orbitalV: 5.57,
             atmosphere: [['N₂', 94.2], ['CH₄', 5.65], ['H₂', 0.1]], atmoNote: { en: 'The only moon with a dense atmosphere; the only other world with stable surface liquids (methane–ethane lakes).', es: 'La única luna con atmósfera densa; el único otro mundo con líquidos estables en superficie (lagos de metano y etano).' },
             composition: [['water ice & organics crust', 15], ['subsurface water–ammonia ocean', 25], ['rock', 60]],
             astrobiology: { en: 'Titan has a methane cycle like Earth\'s water cycle, complex organic chemistry in its haze and an internal water ocean. Any biochemistry would be exotic (liquid methane at −180 °C). NASA\'s Dragonfly rotorcraft arrives in 2034.', es: 'Titán tiene un ciclo del metano análogo al del agua terrestre, química orgánica compleja en su neblina y un océano interno de agua. Cualquier bioquímica sería exótica (metano líquido a −180 °C). El dron Dragonfly de la NASA llega en 2034.' } },
  enceladus:{ mass: 1.0802e20, radius: 252.1, tempMean: -198, rotationH: 32.9, yearD: 1.370, orbitalV: 12.64, composition: [['ice shell (20–25 km)', 15], ['global ocean (~10 km)', 10], ['rocky core', 75]],
             astrobiology: { en: 'Geysers at the south pole vent water, salts, silica grains, molecular hydrogen and phosphates from a global subsurface ocean — evidence of hydrothermal activity and of every ingredient needed for life as we know it. Cassini flew through the plumes.', es: 'Los géiseres del polo sur expulsan agua, sales, granos de sílice, hidrógeno molecular y fosfatos de un océano global bajo el hielo: pruebas de actividad hidrotermal y de todos los ingredientes de la vida tal como la conocemos. Cassini atravesó las columnas.' } },
  triton:  { mass: 2.139e22, radius: 1353.4, tempMean: -235, pressure: 1.4e-5, rotationH: -141.04, yearD: 5.877, orbitalV: 4.39, atmosphere: [['N₂', 99.9], ['CH₄', 0.01]], composition: [['rock & metal core', 65], ['ice mantle', 35]] },
  mars_astro: null,
};
PHYS.mars.astrobiology = { en: 'Mars had rivers, lakes and possibly an ocean 3.5–4 billion years ago; clays, sulfates and organic molecules found by Curiosity and Perseverance record habitable ancient environments. Today\'s surface is cold, dry and irradiated; subsurface brines remain a possibility. Samples cached by Perseverance await return.', es: 'Marte tuvo ríos, lagos y quizá un océano hace 3.500–4.000 millones de años; arcillas, sulfatos y moléculas orgánicas halladas por Curiosity y Perseverance registran ambientes antiguos habitables. Hoy la superficie es fría, seca e irradiada; salmueras subterráneas siguen siendo posibles. Perseverance ha guardado muestras a la espera de su retorno.' };
PHYS.venus.astrobiology = { en: 'The surface is sterilising (464 °C, 92 bar), but the cloud layer at 50–60 km has Earth-like temperatures. A contested 2020 phosphine detection revived interest; DAVINCI and VERITAS will investigate in the 2030s.', es: 'La superficie es esterilizante (464 °C, 92 bar), pero la capa de nubes a 50–60 km tiene temperaturas terrestres. Una discutida detección de fosfina en 2020 reavivó el interés; DAVINCI y VERITAS lo investigarán en la década de 2030.' };
delete PHYS.mars_astro;

const G = 6.674e-11;
/** Derived physical rows for a body id (numbers in, formatted strings out). lang: 'en' | 'es' */
export function physicalRows(id, lang = 'en') {
  const d = PHYS[id]; if (!d) return [];
  const es = lang === 'es';
  const rows = [];
  const R = d.radius * 1e3, M = d.mass;
  const f = (n, digits = 3) => Number(n).toLocaleString(es ? 'es-ES' : 'en-US', { maximumSignificantDigits: digits });
  if (M && R) {
    const V = 4 / 3 * Math.PI * R ** 3; const rho = M / V; const g = G * M / (R * R); const vEsc = Math.sqrt(2 * G * M / R) / 1000;
    rows.push(['diameter', `${f(2 * d.radius, 4)} km`]);
    rows.push(['volume', `${(V / 1e9).toExponential(3).replace('e+', ' × 10^')} km³`]);
    rows.push(['density', `${f(rho / 1000, 3)} g/cm³`]);
    rows.push(['gravity', `${f(g, 3)} m/s² (${f(g / 9.80665, 2)} g)`]);
    rows.push(['escapeVelocity', `${f(vEsc, 3)} km/s`]);
  }
  if (d.tilt != null) rows.push(['axialTilt', `${f(d.tilt, 4)}°${d.tilt > 90 ? (es ? ' (rotación retrógrada)' : ' (retrograde rotation)') : ''}`]);
  if (d.rotationH != null) rows.push(['rotationPeriod', fmtHours(Math.abs(d.rotationH), es) + (d.rotationH < 0 ? (es ? ' (retrógrada)' : ' (retrograde)') : '')]);
  if (d.dayH != null && Math.abs(d.dayH - Math.abs(d.rotationH || 0)) > 0.05) rows.push(['dayLength', fmtHours(d.dayH, es)]);
  if (d.yearD != null) rows.push(['orbitalPeriod', d.yearD > 1000 ? `${f(d.yearD / 365.25, 4)} ${es ? 'años' : 'years'}` : `${f(d.yearD, 4)} ${es ? 'días' : 'days'}`]);
  if (d.orbitalV != null) rows.push(['orbitalVelocity', `${f(d.orbitalV, 3)} km/s`]);
  if (d.tempMean != null) rows.push(['meanTemp', `${d.tempMean} °C (${f(d.tempMean + 273.15, 4)} K)`]);
  if (d.tempMin != null) rows.push(['minTemp', `${d.tempMin} °C`]);
  if (d.tempMax != null) rows.push(['maxTemp', `${d.tempMax} °C`]);
  if (d.pressure != null) rows.push(['surfacePressure', d.pressure < 1e-3 ? `${d.pressure.toExponential(0)} bar` : `${f(d.pressure, 3)} bar`]);
  if (d.moons != null) rows.push(['moons', String(d.moons)]);
  if (d.ageGy != null) rows.push(['age', `≈ ${f(d.ageGy, 2)} ${es ? 'mil millones de años' : 'billion years'}`]);
  return rows;
}
function fmtHours(h, es) {
  if (h < 48) { const H = Math.floor(h), m = Math.round((h - H) * 60); return `${H} h ${m} min`; }
  const d = h / 24; return `${Number(d).toLocaleString(es ? 'es-ES' : 'en-US', { maximumSignificantDigits: 4 })} ${es ? 'días' : 'days'}`;
}

/** "If the Sun were a 1 m ball…" scale facts for a body id. */
export function scaleFact(id, lang = 'en') {
  const d = PHYS[id]; if (!d || id === 'sun') return null;
  const es = lang === 'es';
  const sunD = 2 * 695700; // km
  const bodyMm = (2 * d.radius) / sunD * 1000;
  const AU_KM = 149597870.7;
  const distAU = { mercury: 0.387, venus: 0.723, earth: 1, mars: 1.524, jupiter: 5.203, saturn: 9.537, uranus: 19.19, neptune: 30.07, pluto: 39.48, ceres: 2.77 }[id];
  const size = bodyMm >= 10 ? `${bodyMm.toFixed(0)} mm` : `${bodyMm.toFixed(1)} mm`;
  if (distAU) {
    const distM = distAU * AU_KM / sunD;
    return es ? `Si el Sol fuera una bola de 1 m, ${nameEs(id)} mediría ${size} y estaría a ${distM.toFixed(0)} m.` : `If the Sun were a 1 m ball, ${cap(id)} would be ${size} across and ${distM.toFixed(0)} m away.`;
  }
  return es ? `Si el Sol fuera una bola de 1 m, ${nameEs(id)} mediría ${size}.` : `If the Sun were a 1 m ball, ${cap(id)} would be ${size} across.`;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const nameEs = id => ({ mercury: 'Mercurio', venus: 'Venus', earth: 'la Tierra', mars: 'Marte', jupiter: 'Júpiter', saturn: 'Saturno', uranus: 'Urano', neptune: 'Neptuno', pluto: 'Plutón', ceres: 'Ceres', moon: 'la Luna', io: 'Ío', europa: 'Europa', ganymede: 'Ganímedes', callisto: 'Calisto', titan: 'Titán', enceladus: 'Encélado', triton: 'Tritón' }[id] || cap(id));

// ---------------------------------------------------------------------------
// Stars: physical profile from spectral type + luminosity (estimates, flagged as such)
// ---------------------------------------------------------------------------
const CLASS_TEMP = { O: 38000, B: 17000, A: 8500, F: 6800, G: 5700, K: 4400, M: 3300, L: 1800, W: 60000, D: 15000 };
export function starProfile(o, lang = 'en') {
  const es = lang === 'es';
  const sp = o.spectral || o.data?.spectralType || '';
  const L = o.lum || 1, T = o.temp || CLASS_TEMP[sp.charAt(0)] || 5700;
  const lumClass = /Ia|Ib|II\b/.test(sp) ? 'I' : /III/.test(sp) ? 'III' : /IV/.test(sp) ? 'IV' : /VII|D/.test(sp) || o.special?.kind === 'whitedwarf' ? 'D' : 'V';
  // mass: main sequence M ∝ L^(1/3.5); giants/supergiants from luminosity class
  let mass = Math.pow(L, 1 / 3.5);
  if (lumClass === 'III') mass = Math.max(1, Math.min(4, Math.pow(L / 40, 0.5)));
  if (lumClass === 'I') mass = Math.max(8, Math.min(60, 8 + Math.log10(Math.max(L, 1e4) / 1e4) * 20));
  if (lumClass === 'D') mass = 0.6;
  if (o.pulsar) mass = 1.4;
  const radius = Math.sqrt(L) * Math.pow(5772 / T, 2);           // R☉ from Stefan–Boltzmann
  const lifeGy = lumClass === 'V' ? 10 * mass / Math.max(L, 1e-4) : null;
  const stage = o.pulsar ? (es ? 'Estrella de neutrones (púlsar)' : 'Neutron star (pulsar)')
    : lumClass === 'D' ? (es ? 'Enana blanca' : 'White dwarf')
    : lumClass === 'I' ? (es ? 'Supergigante' : 'Supergiant')
    : lumClass === 'III' ? (es ? 'Gigante' : 'Giant')
    : lumClass === 'IV' ? (es ? 'Subgigante' : 'Subgiant')
    : mass < 0.08 ? (es ? 'Enana marrón' : 'Brown dwarf') : (es ? 'Secuencia principal' : 'Main sequence');
  // evolutionary track by mass
  let path;
  if (o.pulsar) path = es ? ['Nebulosa', 'Protoestrella', 'Secuencia principal (masiva)', 'Supergigante', 'Supernova', 'Estrella de neutrones'] : ['Nebula', 'Protostar', 'Massive main sequence', 'Supergiant', 'Supernova', 'Neutron star'];
  else if (mass < 0.5) path = es ? ['Nebulosa', 'Protoestrella', 'Enana roja (billones de años)', 'Enana blanca de helio'] : ['Nebula', 'Protostar', 'Red dwarf (trillions of years)', 'Helium white dwarf'];
  else if (mass < 8) path = es ? ['Nebulosa', 'Protoestrella', 'Secuencia principal', 'Gigante roja', 'Nebulosa planetaria', 'Enana blanca'] : ['Nebula', 'Protostar', 'Main sequence', 'Red giant', 'Planetary nebula', 'White dwarf'];
  else if (mass < 20) path = es ? ['Nebulosa', 'Protoestrella', 'Secuencia principal', 'Supergigante', 'Supernova', 'Estrella de neutrones'] : ['Nebula', 'Protostar', 'Main sequence', 'Supergiant', 'Supernova', 'Neutron star'];
  else path = es ? ['Nebulosa', 'Protoestrella', 'Secuencia principal (O/B)', 'Supergigante / Wolf–Rayet', 'Supernova', 'Agujero negro'] : ['Nebula', 'Protostar', 'O/B main sequence', 'Supergiant / Wolf–Rayet', 'Supernova', 'Black hole'];
  const current = o.pulsar ? path.length - 1 : lumClass === 'D' ? path.length - 1 : lumClass === 'I' ? 3 : lumClass === 'III' ? 3 : 2;
  const f = (n, d = 2) => Number(n).toLocaleString(es ? 'es-ES' : 'en-US', { maximumSignificantDigits: d });
  const rows = [
    ['mass', `≈ ${f(mass, 2)} M☉`],
    ['radius', `≈ ${f(radius, 3)} R☉${radius > 100 ? (es ? ' (' + f(radius * 0.00465, 2) + ' UA)' : ' (' + f(radius * 0.00465, 2) + ' AU)') : ''}`],
    ['stage', stage],
  ];
  if (lifeGy) rows.push(['lifespan', lifeGy > 1000 ? `> 1 ${es ? 'billón de años' : 'trillion years'}` : lifeGy >= 1 ? `≈ ${f(lifeGy, 2)} ${es ? 'mil millones de años' : 'billion years'}` : `≈ ${f(lifeGy * 1000, 2)} ${es ? 'millones de años' : 'million years'}`]);
  return { rows, path, current, mass, radius, lumClass };
}
