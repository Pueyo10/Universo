// Alpha stores normal-incidence opacity. The same optical depth drives the
// viewed ring and its shadow on the planet (Beer-Lambert extinction).
export const RING_OPTICS = /* glsl */`
  // The opaque B ring core reaches tau ~ 5-6 (Cassini UVIS); keep that range.
  float ringOpticalDepth(float opacity) {
    return -log(max(1.0 - clamp(opacity, 0.0, 0.9975), 0.0025));
  }
  // Phase functions normalised to 4 pi, as functions of cos(phase angle) =
  // dot(to-sun, to-viewer). Centimetre-to-metre ice particles scatter like
  // rough Lambert spheres (strongly backwards, nothing at full forward) with a
  // narrow opposition surge; micron dust diffracts light forwards (two-term HG).
  float ringPhaseParticles(float cosA) {
    float a = acos(clamp(cosA, -1.0, 1.0));
    return 0.8488 * (sqrt(max(1.0 - cosA * cosA, 0.0)) + (3.14159265 - a) * cosA) * (1.0 + 0.5 * exp(-a * 25.0));
  }
  float ringHG(float g, float c) { return (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5); }
  float ringPhaseDust(float cosA) {
    return 0.93 * ringHG(0.75, -cosA) + 0.07 * ringHG(-0.3, -cosA);
  }
  float ringTransmission(float tau, float mu) {
    return exp(-min(tau / max(abs(mu), 0.015), 80.0));
  }
  // Single scattering integrated through a uniform slab; already premultiplied
  // by its density. Equal paths use the analytic limit, avoiding 0/0.
  float ringScatter(float tau, float muLight, float muView, bool sameSide) {
    float il = 1.0 / max(muLight, 0.015), iv = 1.0 / max(muView, 0.015);
    if (sameSide) return iv / (il + iv) * (1.0 - exp(-min(tau * (il + iv), 80.0)));
    float delta = abs(il - iv);
    float path = tau * delta;
    float integral = path < 0.01 ? tau * (1.0 - path * 0.5 + path * path / 6.0) : (1.0 - exp(-min(path, 80.0))) / delta;
    return iv * exp(-min(tau * min(il, iv), 80.0)) * integral;
  }
`;

export const RING_ECLIPSE = /* glsl */`
  // Fraction of the finite solar disc visible past a spherical moon. The
  // expensive overlap case only runs inside its penumbra; tiny moons cannot
  // cast a black shadow larger than their apparent disc.
  float ringMoonVisibility(vec3 P, vec3 L, vec4 moon, float sunAngular) {
    vec3 pm = moon.xyz - P;
    float along = dot(pm, L);
    if (along <= 0.0) return 1.0;
    float d = length(pm - L * along), r = moon.w;
    float s = max(sunAngular * along, 1e-6);
    float aa = max(fwidth(d), 1e-5);
    if (s < aa) return smoothstep(r - aa, r + aa, d);
    if (d >= r + s) return 1.0;
    if (d <= abs(r - s)) return 1.0 - min(1.0, r * r / (s * s));
    float x = (d * d + s * s - r * r) / (2.0 * d);
    float y = sqrt(max(s * s - x * x, 0.0));
    float area = s * s * acos(clamp(x / s, -1.0, 1.0))
      + r * r * acos(clamp((d - x) / r, -1.0, 1.0)) - d * y;
    return clamp(1.0 - area / (3.14159265 * s * s), 0.0, 1.0);
  }
`;
