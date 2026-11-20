/* ============================================================================
 *  SETTINGS
 * ============================================================================
 *  Every tunable value of the game lives in this file. Nothing else in the
 *  code base hard-codes gameplay, rendering, timing, color or text values.
 *
 *  CONVENTIONS
 *  - Distances are in WORLD UNITS (1 unit ~ 1 meter; the reindeer is ~1.6 tall).
 *  - Distances measured "on the planet" (ranges, spawn distances, lake size...)
 *    are ARC LENGTHS along the surface, in world units.
 *  - Times are in SECONDS, except animation durations, which are in
 *    MILLISECONDS (their field is always called `durationMs`).
 *  - Angles are in DEGREES.
 *  - Colors are CSS hex strings '#rrggbb'.
 *  - A value written as [min, max] is a RANDOM RANGE: a uniform random value
 *    between min and max is picked every time it is used (per spawn, per
 *    instance...). Write [x, x] (or just x where noted) to make it fixed.
 *
 *  All in-game text is Spanish and lives in the `text`, `wisemen` and `candy`
 *  sections at the bottom.
 * ========================================================================== */

const settings = {

  /* --------------------------------------------------------------------------
   *  WORLD SEED
   *  null  -> a new random world every time (and on every retry).
   *  number -> always the same planet, mountains, lake and trees.
   * ------------------------------------------------------------------------ */
  seed: null,

  /* --------------------------------------------------------------------------
   *  DEBUG
   * ------------------------------------------------------------------------ */
  debug: {
    showStats: false,              // top-right box with FPS, stroke count, vertex counts. Toggle in-game with F2.
    logMeshStats: false,            // console.log min/max triangle edge length of every refined mesh
    timeScale: 1,                  // global speed multiplier (2 = everything twice as fast)
    godMode: false,                // player takes no damage
    skipWelcome: false,            // start the game immediately (no welcome page; audio needs a click anyway)
    skipPaintIn: false,            // world appears instantly, without the stroke painting intro
    showOcclusionGeometry: false,  // draw the hidden occlusion triangles as translucent shapes. Toggle with F3.
  },

  /* --------------------------------------------------------------------------
   *  BACKGROUND COLORS
   *  The background is also the FOG color: far strokes blend into it so that
   *  strokes dropped by the stroke cap (render.maxStrokes) are not noticeable.
   * ------------------------------------------------------------------------ */
  colors: {
    welcome: '#ffffff',            // welcome page color (and canvas color at the very start of the paint-in)
    night: '#020610',              // deep-blue night sky / fog color during the game
    gameOverOverlay: '#05060f',    // color the screen fades to on game over
    endingOverlay: '#ffffff',      // color the screen fades to when reaching the star
  },

  /* --------------------------------------------------------------------------
   *  TIMING  (intro paint-in, global pacing)
   *  After pressing Start, strokes appear from near to far around the player:
   *  first one by one, slowly, then very fast. Movement is already allowed.
   *  revealRadius(t) = revealMax * (t / paintInSeconds) ^ paintInPower
   * ------------------------------------------------------------------------ */
  timing: {
    paintInSeconds: 9,             // total duration of the paint-in
    paintInPower: 3.4,             // >1: slow start, fast end. Higher = longer "one by one" phase
    paintInRevealMax: 320,         // final reveal radius (world units). Must reach the moon/clouds.
    paintInJitter: 15.2,            // randomization of the reveal order (world units of distance noise)
    paintInEdgeSoftness: 0.8,      // strokes fade in over this distance at the reveal front
    backgroundFade: [0.05, 0.85],  // fraction of the paint-in where the background goes welcome -> night
    enemySpawnDelayAfterPaint: 4,  // seconds after the paint-in ends before the first enemy can spawn
    welcomeFadeSeconds: 0.6,       // welcome page fade-out when pressing Start
  },

  /* --------------------------------------------------------------------------
   *  PLANET  (tiny planet terrain)
   *  The radius is derived so that walking around the equator takes
   *  `walkAroundSeconds` at player.walkSpeed:
   *        radius = walkSpeed * walkAroundSeconds / (2 * PI)
   *
   *  MOUNTAINS: a random number of iterations; each one picks a pair of random
   *  angles (longitude, latitude) -> a direction from the center, and a random
   *  length from the center -> the peak height. Terrain rises smoothly toward
   *  each peak within `mountainWidth` (arc length).
   *
   *  Z NOISE: an extra eccentric layer: every terrain vertex is pushed in/out
   *  along its radial direction by 3D fractal noise.
   * ------------------------------------------------------------------------ */
  planet: {
    walkAroundSeconds: 20,         // seconds to walk once around the planet
    mountainCount: [15, 20],        // number of mountain iterations
    mountainPeakLength: [1.06, 1.3], // peak distance from center, as a multiple of the base radius
    mountainWidth: [6, 18],        // arc-length radius of the mountain base (world units)
    mountainShape: 1.7,            // falloff exponent: 1 = round hill, 3 = sharp peak
    mountainBlendSoftness: 0.6,    // smooth-max softness where mountains overlap (world units)
    lakeRadius: 9,                 // frozen lake flat ice radius (arc length, world units)
    lakeShore: 3.5,                // smooth shore width around the ice (world units)
    lakeDepth: 0.9,               // how far below the base radius the ice EDGE sits
    // The ice is a sunken bowl, not a shell following the planet's curve:
    //   extra sink = lakeCenterSink * (1 - t²) ^ lakeSinkFalloff,  t = distance from center / lakeRadius
    lakeCenterSink: 2.4,           // extra depth at the very center of the lake (world units)
    lakeSinkFalloff: 1.2,          // 1 = round bowl, >1 = deep only near the center, <1 = flat bottom, steep edges
    lakeMountainGap: 3,            // minimum free distance between the lake shore and any mountain base
    startLakeDistance: 5,         // player start point arc distance from the lake center
    zNoise: {
      amplitude: 1.75,             // max radial displacement (world units)
      frequency: 0.19,             // noise frequency (1 / world units)
      octaves: 3,                  // fractal octaves
      gain: 0.5,                   // amplitude multiplier per octave
      lacunarity: 2.1,             // frequency multiplier per octave
    },
    rockSlope: 0.4,               // vertices with normal·up below this use the rock material
    terrainChunks: 72,             // terrain is split in chunks for faster culling (no visual effect)
  },

  /* --------------------------------------------------------------------------
   *  MESH REFINEMENT  (triangle size range)
   *  Every mesh is subdivided (edges longer than maxEdge are split) and
   *  simplified (edges shorter than minEdge are collapsed) at runtime, in world
   *  units (after instance scale). Since there is ONE STROKE PER VERTEX, these
   *  numbers directly control stroke density.
   *  Keep minEdge <= maxEdge / 2, otherwise splitting creates edges that would
   *  immediately be collapsed again.
   *  There is a default range plus optional overrides per category, because a
   *  1.6-unit reindeer needs much denser vertices than a 30-unit planet.
   *  strokeSize: world size of the strokes of that category, as a multiple of maxEdge.
   * ------------------------------------------------------------------------ */
  mesh: {
    default:    { minEdge: 0.15, maxEdge: 0.4,  strokeSize: 1.1 },
    terrain:    { minEdge: 0.3,  maxEdge: 0.72, strokeSize: 1.1 },
    trees:      { minEdge: 0.14, maxEdge: 0.34, strokeSize: 4.0 },
    characters: { minEdge: 0.05, maxEdge: 0.13, strokeSize: 1.5 },
    props:      { minEdge: 0.04, maxEdge: 0.1,  strokeSize: 1.6 },  // projectiles, star, mistletoe
    sky:        { minEdge: 1.0,  maxEdge: 3.2,  strokeSize: 1.9 },  // moon and clouds
    maxRefineIterations: 14,       // safety limit for the subdivision loop
    // Thin parts would vanish when short edges are collapsed (minEdge). Vertices
    // with these model roles are never collapsed: they keep all their (extra)
    // vertices so they always get strokes.
    keepRoles: ['antler', 'boomPole', 'boomMic'],
    // SIMPLIFICATION ITERATIONS PER MODEL, applied when the model is loaded.
    // Each iteration collapses the edges shorter than minEdge once more:
    // 0 = keep the model exactly as built, higher = fewer vertices (fewer strokes).
    simplifyIterations: {
      default: 4,                  // any model not listed below
      treeA: 14, treeB: 14, treeC: 14,
      reindeer: 6,                 // player and crew
      enemy: 6,
      wiseman: 6,
      candy: 8,
      candyCane: 14,
      star: 4,
      projectile: 4,
      moon: 4,
      cloud: 4,
    },
  },

  /* --------------------------------------------------------------------------
   *  RENDERING  (strokes)
   *  No triangles are drawn on screen. Triangles are only rendered (invisibly)
   *  into a camera depth buffer and a lantern shadow map. Then one camera-
   *  facing brush stroke is drawn per visible vertex, far to near.
   *
   *  HOW THE VIEW GETS BLOCKED / CLIPPED  (every parameter involved)
   *  A stroke is drawn when it is inside the view, faces the camera and is not
   *  hidden behind occlusion triangles. Rules:
   *   - CLIPPED objects never hide what is behind them.
   *   - BACK FACES never hide anything (always on): from inside a mesh, or when
   *     the near plane cuts it open, its far wall does not block the world.
   *   - THE GROUND IS NEVER CLIPPED by the camera (render.near does not cut it)
   *     and its back faces are painted and do block: the planet is never seen
   *     from the inside. It only disappears under the UI clearing.
   *  Parameters:
   *   - render.near ................ near plane: closer strokes and objects are cut (never the ground)
   *   - render.backfaceThreshold ... strokes facing away more than this are skipped
   *   - render.depthBias / depthBiasScale / depthScale ... occlusion tolerance + resolution
   *   - trees.hideNearerThan ....... whole tree clipped by the depth of its base (signed)
   *   - trees.hideInsideMargin ..... whole tree clipped while the camera is inside it
   *                                  (+ the near plane's reach, added automatically)
   *   - camera.distance / targetHeight / minPitch / maxPitch ... where the camera sits
   *   - camera.groundClearance ..... the camera never goes below the ground
   *   - UI clearing (everything, ground included, is skipped there):
   *       ui.holePadding ("haz clic" text), dialog.arcHeight / arcEdgeJitter / arcMargin
   *  Clipped trees still cast the lamp's shadows. F3 shows the occlusion triangles.
   * ------------------------------------------------------------------------ */
  render: {
    maxStrokes: 256000,             // stroke cap: the farthest strokes are dropped first
    // ADAPTIVE CAP: while the frame rate is below targetFps the cap goes down
    // (never below minStrokes); when there is room again it climbs back to maxStrokes.
    minStrokes: 25600,
    targetFps: 30,
    maxDistance: 4000,               // vertices farther than this from the camera are never drawn
    pixelRatioMax: 1.5,            // cap on devicePixelRatio (performance) 1
    fovY: 62,                      // vertical field of view (degrees)
    near: 0.2,                     // camera near plane
    far: 4000,                      // camera far plane (must include sky.moonDistance)

    strokeMinPx: 2.0,              // smallest stroke on screen (CSS pixels, short side) 2
    strokeMaxPx: 100,              // largest stroke on screen (CSS pixels, short side). Too low = gaps near the camera 150
    strokeAspect: 1.5,             // long side / short side of a stroke
    strokeAspectJitter: 0.4,       // random variation of the aspect (0 = none)
    strokeScaleJitter: 1,       // random variation of stroke size (0 = none, 1 = +-50%)
    shrinkNear: 0,                 // distance where extra distance shrinking begins
    shrinkFar: 200,                 // distance where extra distance shrinking reaches `shrinkFarScale`
    shrinkFarScale: 0.35,          // further vertices render smaller strokes (on top of perspective) 0.45

    // Rotation of a stroke on the screen plane. It is tied to the vertex normal
    // (projected on screen) plus a per-vertex pseudo random value, so it looks
    // random but stays stable frame to frame.
    rotationNormalWeight: 0.8,     // 1 = stroke lies perpendicular to the projected normal (follows the surface)
    rotationRandom: 0.22,          // 0..1 random rotation added on top (1 = full random 360°)

    brushVariants: 4,              // number of different procedural brush dabs
    brushResolution: [128, 48],    // pixel size of each brush dab texture

    backfaceThreshold: -0.25,      // vertices whose normal faces away from the camera more than this are skipped
    depthScale: 0.4,               // camera occlusion depth buffer resolution (fraction of the screen)
    depthBias: 0.15,               // occlusion tolerance (world units) - raise if surfaces flicker
    depthBiasScale: 0.0,         // extra tolerance proportional to distance
    shadowMapSize: 1024,           // lantern shadow map resolution
    shadowBias: 0.13,              // shadow tolerance (world units)
    shadowNormalOffset: 0.08,      // push the shadow lookup along the normal (reduces acne)

    maxPointLights: 20,            // point lights (auras, flashes) applied at once; the most relevant
                                   // (strong, wide, close to the player) are kept. Higher = slower.
    // GLOBAL TONE (strokes + background). Two separate balances around the pivot;
    // pure black, the pivot and pure white always stay put. 1 = no change.
    darkBalance: 0.75,             // colors BELOW the pivot: < 1 = lighter darks, > 1 = deeper darks
    lightBalance: 1.0,             // colors ABOVE the pivot: > 1 = brighter brights, < 1 = dimmer brights
    contrastPivot: 0.5,            // where darks end and brights begin (0..1)
    fogNear: 22,                   // fog starts (world units from camera)
    fogFar: 500,                    // fully fogged (= background color)
  },

  /* --------------------------------------------------------------------------
   *  LIGHTING
   *  Ambient light has a DIRECTION (the moon). Luminance = ambientBase +
   *  diffuse * max(0, normal · ambientDirection). Vertices hit by the main
   *  light (the follower's cinema camera lamp: inside its cone, not occluded
   *  in its shadow map) get a boost. Strokes near the player get extra light.
   * ------------------------------------------------------------------------ */
  lighting: {
    ambientDirection: [0.45, 0.75, -0.35], // world direction TOWARD the moon (normalized automatically)
    ambientColor: '#1a2035',       // moonlight tint
    ambientBase: 0.3,             // light received by every vertex
    diffuse: 0.6,                  // extra light by facing the moon

    // MAIN LIGHT: the lamp of the cinema camera carried by the follower reindeer
    // (see `follower`). It casts shadows and always points at the player.
    lightColor: '#ffae55',         // very warm candle-like light
    lightBoost: 3.6,               // luminance boost of lit vertices (too high washes snow to white)
    lightRange: 6,                // light reach (world units)
    lightConeOuter: 40,            // half-angle where light reaches zero (degrees)
    lightConeInner: 20,            // half-angle of full intensity (degrees)
    lightEaseSeconds: 0.4,        // how fast the light re-aims at the player (ease out)
    lightFlicker: 0.12,            // candle flicker amount (0 = steady)

    // PROXIMITY LIGHT: strokes closer to the player get more light
    // added light = proximityColor * proximityBoost * (1 - distance / proximityRadius) ^ proximityFalloff
    proximityColor: '#ffd9a8',
    proximityBoost: 1.5,
    proximityRadius: 1,            // world units around the player
    proximityFalloff: 1.1,         // 1 = linear, higher = concentrated near the player

    twinkleSpeed: 2.6,             // speed of tree light bulbs twinkling

    // FLASH LIGHTS: short point lights (magic explosions and projectile hits)
    // share the same system: color, peak strength, radius, duration (ease-out decay).
    magicFlashColor: '#fff2c4',    // color of the wise man's magic explosion
    magicFlashStrength: 6,         // peak luminance added by the explosion
    magicFlashRadius: 26,          // world radius of the explosion light
    magicFlashSeconds: 1.8,        // decay time of the explosion light
    hitFlashColor: '#ff2a2a',      // very short red flash where a projectile hits
    hitFlashStrength: 12,
    hitFlashRadius: 5.2,
    hitFlashSeconds: 0.22,
  },

  /* --------------------------------------------------------------------------
   *  MATERIALS  (shared library)
   *  A material only determines the stroke COLOR (plus small options).
   *    color     : base color
   *    variance  : random brightness variation per vertex (0..1)
   *    emissive  : 0 = fully lit by lights, 1 = ignores lighting (glows),
   *                >1 = extra glow. Negative = twinkling light bulb.
   *    strokeScale (optional, default 1): stroke size multiplier, for thin
   *                parts (antlers, poles) that need small, fine strokes.
   *  Models reference these by name through their own material sets
   *  (see models/treePineA.js etc.). Materials can be shared between models.
   * ------------------------------------------------------------------------ */
  materials: {
    snow:          { color: '#eef3ff', variance: 0.08, emissive: 0 },
    rock:          { color: '#7b7f96', variance: 0.15, emissive: 0 },
    ice:           { color: '#6cc3f0', variance: 0.14, emissive: 0.18 },
    pineDark:      { color: '#1f5a3c', variance: 0.18, emissive: 0 },
    pineMid:       { color: '#2f7a4a', variance: 0.18, emissive: 0 },
    pineLight:     { color: '#4b9a5c', variance: 0.35, emissive: 0 },
    bark:          { color: '#6b3f26', variance: 0.12, emissive: 0 },
    snowCap:       { color: '#ffffff', variance: 0.05, emissive: 0.05 },
    mistletoeLeaf: { color: '#5fae3e', variance: 0.12, emissive: 0 },
    mistletoeBerry:{ color: '#fffbea', variance: 0.04, emissive: 0.35 },
    bulbRed:       { color: '#ff3b3b', variance: 0.0,  emissive: -1.6 },
    bulbGold:      { color: '#ffd25e', variance: 0.0,  emissive: -1.6 },
    bulbGreen:     { color: '#6dff8a', variance: 0.0,  emissive: -1.6 },
    reindeerFur:   { color: '#9a6236', variance: 0.12, emissive: 0 },
    reindeerBelly: { color: '#e8cfa6', variance: 0.08, emissive: 0 },
    reindeerHoof:  { color: '#3a2618', variance: 0.08, emissive: 0 },
    antler:        { color: '#e3cc9e', variance: 0.08, emissive: 0.15, strokeScale: 0.5 },
    reindeerNose:  { color: '#ff2a2a', variance: 0.0,  emissive: 0.9 },
    eyeWhite:      { color: '#ffffff', variance: 0.0,  emissive: 0.4 },
    eyeDark:       { color: '#14101a', variance: 0.0,  emissive: 0 },
    fawnFur:       { color: '#c4874e', variance: 0.12, emissive: 0 },
    fawnBelly:     { color: '#f4e2c4', variance: 0.08, emissive: 0 },
    cameraBody:    { color: '#2b2b33', variance: 0.08, emissive: 0 },
    cameraReel:    { color: '#4a4a56', variance: 0.08, emissive: 0 },
    cameraLens:    { color: '#14141c', variance: 0.04, emissive: 0.1 },
    cameraLamp:    { color: '#ffc46b', variance: 0.0,  emissive: 1.8 },
    cocoaFur:      { color: '#6e4429', variance: 0.12, emissive: 0 },
    cocoaBelly:    { color: '#dcbb92', variance: 0.08, emissive: 0 },
    boomPole:      { color: '#b9bcc6', variance: 0.06, emissive: 0.1, strokeScale: 0.4 },
    boomMic:       { color: '#5d5a63', variance: 0.25, emissive: 0, strokeScale: 0.6 }, // furry windscreen
    santaRed:      { color: '#d8222e', variance: 0.08, emissive: 0 },
    santaWhite:    { color: '#ffffff', variance: 0.04, emissive: 0.1 },
    wiseSkin:      { color: '#e6b48a', variance: 0.06, emissive: 0 },
    wiseSkinDark:  { color: '#7a4a2c', variance: 0.06, emissive: 0 },
    beard:         { color: '#f4f1ea', variance: 0.05, emissive: 0 },
    beardDark:     { color: '#2a1d16', variance: 0.05, emissive: 0 },
    gold:          { color: '#ffcf4a', variance: 0.08, emissive: 0.25 },
    starGold:      { color: '#ffd54a', variance: 0.06, emissive: 1.0 },
    snowball:      { color: '#ffffff', variance: 0.05, emissive: 0.1 },
    coal:          { color: '#26232b', variance: 0.2,  emissive: 0 },
    giftBox:       { color: '#d8222e', variance: 0.05, emissive: 0 },
    giftRibbon:    { color: '#ffd25e', variance: 0.05, emissive: 0.2 },
    moon:          { color: '#fff6d8', variance: 0.06, emissive: 1.0 },
    cloud:         { color: '#3a4c80', variance: 0.12, emissive: 0.1 },
    sparkle:       { color: '#fff7c2', variance: 0.0,  emissive: 1.5 },
    caneRed:       { color: '#e0202c', variance: 0.06, emissive: 0.05, strokeScale: 0.7 },
    caneWhite:     { color: '#fffaf2', variance: 0.04, emissive: 0.05, strokeScale: 0.7 },
  },

  /* --------------------------------------------------------------------------
   *  PLAYER  (humanoid reindeer)
   * ------------------------------------------------------------------------ */
  player: {
    walkSpeed: 7.2,                // world units / second (also defines planet size)
    backwardSpeedFactor: 0.8,      // speed multiplier when walking backward (S / right click)
    accelerateSeconds: 0.25,       // ease-out-cubic time to reach the target speed
    stopSeconds: 0.6,             // ease-out-cubic time to stop
    turnSeconds: 0.3,              // ease-out-cubic time to turn to face the movement direction
    scale: 0.6,                    // model scale
    collisionRadius: 0.45,         // body radius for collisions
    maxLife: 200,                  // starting / maximum life
    walkAnimSpeedRef: 4.2,         // walk animation plays at normal speed at this movement speed
    walkThreshold: 0.4,            // speed above which the walk animation is used
    groundSink: -0.15,              // sink feet slightly into the snow
    hitFlashSeconds: 0.35,         // a hit reindeer (player or follower) tints red for this long
    hitFlashColor: '#ff5050',
  },

  /* --------------------------------------------------------------------------
   *  REINDEER BODY  (shared by the player and the crew; models/reindeer.js)
   *  The body is lowered onto the legs, so the feet always touch the ground.
   * ------------------------------------------------------------------------ */
  reindeerBody: {
    legLength: 0.21,               // hips to ground (model units). The original long legs were 0.62
    legThickness: 0.11,            // leg radius (model units). Was 0.085
  },

  /* --------------------------------------------------------------------------
   *  FOLLOWERS  (smaller reindeer crew that follows the player)
   *  They follow the player's path with a delay and less speed, always facing
   *  the player. Enemies can target them too; hits on them also reduce the
   *  (shared) life.
   *  The values below are COMMON to every follower; each entry of `crew` can
   *  override any of them (e.g. its own scale or followDelay).
   * ------------------------------------------------------------------------ */
  follower: {
    crew: [
      {
        // carries the cinema camera: its lamp is the MAIN LIGHT, always aimed at the player
        prop: 'camera',
        scale: 0.9,
        colors: { fur: 'fawnFur', belly: 'fawnBelly' }, // material role overrides (see models/reindeer.js)
        side: -0.9,                // follows this far to the player's right (-) / left (+)
        speedFactor: 0.65,         // seconds: it walks toward where the player was this long ago
        followDistance: 5,
        baseRotation: 0,           // degrees the model is turned around its vertical axis (it still faces the player)
      },
      {
        // holds a boom pole with a microphone over the player
        prop: 'boom',
        scale: 0.86,
        colors: { fur: 'cocoaFur', belly: 'cocoaBelly' },
        side: 1.9,
        followDelay: 0.95,
        speedFactor: 0.7,
        baseRotation: 60,          // degrees the model is turned (walks slightly sideways)
        boomRotation: -10,           // degrees the boom pole is turned, INDEPENDENT of baseRotation
                                   // (0 = the pole points where the crew member faces: at the player)
        boomOffset: [-0.4, +0.0, -0.2],     // [x, y, z] model units: moves the whole boom pole + mic
                                   // relative to the reindeer (x = its left, y = up, z = forward)
      },
    ],
    followDelay: 0.7,              // seconds: it walks toward where the player was this long ago
    followDistance: 2.1,           // stops when this close to the player
    separation: 1.1,               // followers keep at least this far from each other
    speedFactor: 0.72,             // speed relative to player.walkSpeed (less speed)
    catchUpDistance: 9,            // when farther than this...
    catchUpSpeedFactor: 1.3,       // ...it hurries at this speed factor so it is never lost
    startDistance: 2.1,            // spawns this far behind the player
    accelerateSeconds: 0.45,       // ease-out-cubic time to reach its speed
    stopSeconds: 0.6,              // ease-out-cubic time to stop
    turnSeconds: 0.4,              // ease-out-cubic time to turn toward the player
    collisionRadius: 0.35,
    walkAnimSpeedRef: 3.4,
    walkThreshold: 0.3,
    groundSink: 0.05,
    lightHeight: 1.01,             // camera lamp height above its feet (model units, times scale)
                                   // (was 1.42 before the legs got shorter: the body dropped 0.41)
    lightForward: 0.75,            // light origin in front of it (just ahead of the lens)
    // LIGHT CONE: a modeled translucent cone along the camera lamp's real light,
    // to emphasize its direction. Same approach as the beams: flipped normals,
    // translucent strokes (see `beams`).
    lightCone: {
      enabled: true,
      length: 7.5,                // world units; null = lighting.lightRange
      angle: 15,                 // half-angle in degrees; null = lighting.lightConeOuter
      startOffset: 0.3,            // the cone starts this far in front of the lamp
      segments: 18,                // vertices around the cone
      ringStep: 0.2,              // distance between rings (smaller = more strokes)
      color: '#ffc67a',
      variance: 0.1,
      alpha: 0.1,                 // transparency of every stroke (0..1)
      emissive: 1.0,
      strokeSize: 0.15,
      fog: 0.6,
    },
    boomLength: 2.5,               // boom pole length (model units, times scale)
    boomTilt: 50,                  // degrees the pole rises above horizontal
  },

  /* --------------------------------------------------------------------------
   *  CAMERA  (third person; the MOUSE POSITION orbits the eye around the player)
   *  Cursor X across the window -> orbit angle (left edge = -orbitRange/2,
   *  right edge = +orbitRange/2). Cursor Y -> pitch: top = minPitch,
   *  center = initialPitch, bottom = maxPitch.
   *  With lockPointer the real mouse is captured (it cannot leave the browser
   *  window) and drives a virtual cursor; Esc frees it, a click captures it again.
   *  While captured there is NO horizontal limit: moving the mouse sideways keeps
   *  orbiting forever (orbitRange = degrees turned per window width of movement).
   * ------------------------------------------------------------------------ */
  camera: {
    lockPointer: true,             // keep the mouse inside the game until Esc is pressed
    cursorSpeed: 1.0,              // virtual cursor speed (1 = same as the real cursor)
    distance: 6.2,                 // distance from the look target
    targetHeight: 1.75,            // look target above the player's feet
    orbitRange: 360,               // degrees of orbit per window width of mouse movement
    initialPitch: 27,              // pitch with the cursor at the vertical center (positive = looking down)
    minPitch: -8,                  // pitch with the cursor at the top (degrees)
    maxPitch: 72,                  // pitch with the cursor at the bottom (degrees)
    invertY: false,
    easeSeconds: 0.25,             // ease-out-cubic time for the camera to follow the mouse
    // TOUCH SCREENS: holding a finger walks forward, moving it orbits the camera
    // (both at once). A touch that STARTS in the lower touchBackZone walks backward.
    // In dialogs a tap is always "next" (long press = one page back).
    touchSpeed: 1.0,               // orbit speed of a moving finger (1 = like the mouse)
    touchBackZone: 0.27,           // lower fraction of the screen where a touch walks backward
    groundClearance: 0.9,          // keep the camera this far above the terrain
                                   // (the ground is never clipped by the camera, whatever render.near is)
  },

  /* --------------------------------------------------------------------------
   *  ENEMIES  (snow goblins with Santa hats)
   *  Every spawned enemy picks its own values from these [min, max] ranges.
   *  States: emerge -> idle -> walk (player within walkRange)
   *          -> throw (player within throwRange). Priorities in `statePriority`.
   * ------------------------------------------------------------------------ */
  enemies: {
    scale: [0.75, 1.35],           // model scale
    walkRange: [9, 21],            // start chasing when the player is closer than this
    throwRange: [4.5, 5.8],        // stop and throw when the player is closer than this
    speed: [2.1, 3.9],             // walking speed (world units / s)
    damage: [4, 15],               // life removed per hit
    throwCycleMs: [1300, 2200],    // duration of one throw animation cycle = one throw
    accelerateSeconds: 0.2,        // ease-out-cubic speed changes
    turnSeconds: 0.35,             // ease-out-cubic turning
    collisionRadius: 0.42,         // multiplied by the enemy scale
    sidestepSeconds: [0.5, 1.1],   // after bumping a tree, walk sideways (random left/right) this long
    bodyColors: ['#c8202c', '#1f8a3b', '#a8141f', '#2fa34c', '#7a1020', '#1a6630'],
    headColors: ['#e8f0e0', '#cfe8c8', '#f3d9cf'],
    hatColors: ['#d8222e', '#1f8a3b', '#b81c26'],
    hatTrimColor: '#ffffff',
    projectileTypes: ['snowball', 'coal', 'gift'], // one picked per enemy
    glowColor: '#fff3b0',          // color they glow when killed by magic
    dieSeconds: 3.5,               // glow-and-disappear duration
    dieGrow: 0.9,                  // strokes grow this much while dying
    groundSink: 0.02,

    // spawning
    spawnIntervalStart: [1, 3],    // seconds between spawns at the beginning
    spawnIntervalEnd: [1, 2],    // seconds between spawns after the ramp
    spawnRampSeconds: 30,         // time for the interval to go from start to end
    maxAlive: 48,                  // never more enemies than this at once
    spawnDistance: [5, 34],       // arc distance from the player where they emerge
    spawnTreeClearance: 1.2,       // do not spawn inside trees

    statePriority: { dying: 100, emerge: 90, throw: 30, walk: 20, idle: 10 },

    // red point light around every enemy (same light system as the wise men's aura).
    // Only the most relevant render.maxPointLights lights are applied at once.
    aura: {
      color: '#ff3030',
      strength: 0.8,
      radius: 3.2,
      height: 1.2,                 // above its feet (times the enemy scale)
      pulse: 0.3,
      pulseSpeed: 1.6,
      fadeInSeconds: 0.9,          // eases in while emerging (it fades out while dying)
    },
  },

  /* --------------------------------------------------------------------------
   *  PROJECTILES  (thrown by enemies; they always hit)
   * ------------------------------------------------------------------------ */
  projectiles: {
    flightSeconds: [0.75, 1.3],    // time from release to impact
    arcHeight: [0.9, 1.9],         // height of the throw arc
    easing: 'easeOutCubic',        // movement easing along the flight
    spinSpeed: 590,                // degrees / second
    releaseHeight: 1.35,           // release point above enemy feet (times enemy scale)
    targetHeight: 1.0,             // impact point above the player's feet
    scale: { snowball: 1.0, coal: 0.9, gift: 1.0 },
    dissolveInMagic: true,         // projectiles inside the magic range vanish too
  },

  /* --------------------------------------------------------------------------
   *  ANIMATIONS
   *  An animation = a sequence of POSTURES (named vertex position sets of the
   *  model), a duration, an interpolation and a trigger mode:
   *    mode 'loop'     : p0 -> p1 -> ... -> pn -> p0 ...
   *    mode 'pingpong' : p0 -> ... -> pn -> ... -> p0 ...
   *    mode 'once'     : p0 -> ... -> pn, then stops and triggers `triggers`
   *  triggers   : state to switch to when a 'once' animation ends (or null)
   *  events     : [{ at: 0..1 of the cycle, name }] fired every cycle
   *  blendMs    : ease-out-cubic crossfade from the previous pose
   *  interpolation: 'linear' | 'easeOutCubic' | 'easeInCubic' | 'easeInOutSine' | 'easeInOutCubic' | 'step'
   * ------------------------------------------------------------------------ */
  animations: {
    enemy: {
      emerge: { postures: ['emerge0', 'emerge1'], durationMs: 500, interpolation: 'easeOutCubic', mode: 'once', triggers: 'idle', blendMs: 0 },
      idle:   { postures: ['idleL', 'idleR'], durationMs: 1800, interpolation: 'easeInOutSine', mode: 'pingpong', blendMs: 200 },
      walk:   { postures: ['walkA', 'walkB'], durationMs: 650, interpolation: 'easeInOutSine', mode: 'pingpong', blendMs: 150 },
      // ======================================================================
      // ===  SANTA THROW ANIMATION  — tweak here  =============================
      // ======================================================================
      //  postures      : throwA = arm cocked back, throwB = arm thrown forward
      //  durationMs    : IGNORED, each enemy uses its own enemies.throwCycleMs
      //  interpolation : 'easeInCubic'  = slow wind-up, then a fast snap forward
      //                  'easeOutCubic' = fast start, slow finish (the old feel)
      //  mode          : 'loop' = one throw per cycle (A -> B, back to A)
      //  events.at     : moment of the cycle (0..1) when the projectile leaves the hand
      // ======================================================================
      throw:  { postures: ['throwA', 'throwB'], durationMs: 1600, interpolation: 'easeInCubic', mode: 'loop', blendMs: 180,
                events: [{ at: 0.5, name: 'release' }] },
    },
    player: {
      idle: { postures: ['idle1', 'idle2'], durationMs: 2200, interpolation: 'easeInOutSine', mode: 'pingpong', blendMs: 250 },
      walk: { postures: ['walk1', 'walk2'], durationMs: 620, interpolation: 'easeInOutSine', mode: 'pingpong', blendMs: 160,
              events: [{ at: 0.0, name: 'step' }, { at: 0.5, name: 'step' }] },
    },
    follower: {                    // used by every follower in follower.crew
      idle: { postures: ['idle1', 'idle2'], durationMs: 2000, interpolation: 'easeInOutSine', mode: 'pingpong', blendMs: 250 },
      walk: { postures: ['walk1', 'walk2'], durationMs: 520, interpolation: 'easeInOutSine', mode: 'pingpong', blendMs: 160 },
    },
    wiseman: {
      idle:  { postures: ['idle1', 'idle2'], durationMs: 2600, interpolation: 'easeInOutSine', mode: 'pingpong', blendMs: 300 },
      magic: { postures: ['idle1', 'magic1', 'magic2'], durationMs: 1500, interpolation: 'easeOutCubic', mode: 'once', triggers: null, blendMs: 200,
               events: [{ at: 0.98, name: 'burst' }] },
    },
    candy: {
      idle: { postures: ['lookL', 'lookR', 'lookL', 'blink'], durationMs: 3200, interpolation: 'easeInOutSine', mode: 'loop', blendMs: 200 },
    },
  },

  /* --------------------------------------------------------------------------
   *  WISE MEN  (NPCs, same model, different colors)
   *  The first appears at `firstSpawnTime` in front of the player. Talking
   *  (entering talkRange) opens a dialog; after the last page the wise man does
   *  his magic: a light explosion kills every enemy within killRange (+1 point
   *  each). The next wise man appears `nextDelay` seconds later. After the
   *  third, the star appears over the frozen lake.
   * ------------------------------------------------------------------------ */
  wisemen: {
    firstSpawnTime: 20,            // seconds of game time (from pressing Start) - "00:20"
    nextDelay: 22,                 // seconds after a magic until the next wise man
    spawnDistance: [10, 13],       // arc distance in front of the camera (the horizon is ~12 away)
    spawnAngleJitter: 25,          // degrees left/right of the camera direction
    talkRange: 2.6,                // dialog opens when the player is this close
    killRange: 30,                 // magic kills every enemy closer than this
    pointsPerKill: 1,
    scale: 1.15,
    collisionRadius: 0.5,
    faceSeconds: 0.6,              // ease time to turn toward the player
    fadeSeconds: 1.4,              // after the magic he glows and fades out
    afterMagicPause: 0.6,          // seconds between the burst and the end of the freeze
    voicePitch: 0.7,               // reserved for future voice blips
    // AURA: a soft point light floating over every wise man (same light system
    // as the magic / hit flashes, but permanent while he is there).
    aura: {
      color: '#ffe3a1',
      strength: 0.9,               // luminance added at the light's center
      radius: 7,                 // world units reached by the light
      height: 2.2,                 // above his feet (world units)
      pulse: 0.5,                  // 0..1 slow breathing of the strength
      pulseSpeed: 1.3,             // pulses per second
      fadeInSeconds: 1.2,          // the aura eases in when he appears (it fades out with him)
      farBoost: 4,                 // strength multiplier when the player is far (beams.farStart .. farEnd)
    },
    beam: {},                      // overrides of `beams` for the wise men's beams (e.g. { color: '#ffffff' })
    // one entry per wise man, in order. Colors map to the model's material roles.
    list: [
      {
        name: 'Melchor',
        colors: { robe: '#f2e7c9', cape: '#c9a23a', skin: 'wiseSkin', beard: 'beard', crown: '#ffcf4a', sash: '#b8282f' },
        pages: [
          '¡Hola, pequeños renos cineastas!',
          '¡¡SÍ!! ¡Qué casualidad! Nosotros también hemos venido a estas lejanas tierras buscando una estrella.',
          '¡¿QUÉ?! ¿Una estrella de... "cine"? No entiendo muy bien eso del "rodaje"... Pero bueno, no soy de aquí...',
          'No conozco el idioma lo suficiente y aquí todo el mundo quiere repatriarnos y dicen algo de Sebta...',
          'En fin, voy a reventar a esos Santacloses. Buscad a mis hermanos. Ellos os ayudarán. ¡Alá es grande!',
        ],
      },
      {
        name: 'Gaspar',
        colors: { robe: '#2f7a4a', cape: '#a0262e', skin: 'wiseSkin', beard: 'beardDark', crown: '#ffcf4a', sash: '#f2e7c9' },
        pages: [
          '¡Qué candil tan extraño, jóvenes! Jamás había visto uno igual, ¿usa el famoso aceite de Bobadilla?',
          '¿"Rodar" un "corto"? Debe de ser un modismo que cuyo significado desconozco, lo siento.',
          'Pero en lo de la estrella sí os puedo ayudar. Presiento que mi hermano Baltasar la ha encontrado.',
          'Yo me he quedado atrás para vigilar a estos Santacloses infieles. ¡ALLAHU AKBAR!',
        ],
      },
      {
        name: 'Baltasar',
        colors: { robe: '#5b2f86', cape: '#ffcf4a', skin: 'wiseSkinDark', beard: 'beardDark', crown: '#ffcf4a', sash: '#2f7a4a' },
        pages: [
          'Habéis llegado muy lejos, valientes renos, igual que nosotros, los tres Sabios del Oriente. Sí, yo soy Baltasar.',
          'Venimos desde muy lejos buscando una vida mejor. Nuestros profundos conocimientos sobre la matemática y astronomía',
          'nos han permitido seguir la estrella hasta aquí. Por desgracia, en esta tierra sólo hay guiris barbudos que nos lanzan cosas.',
          'La estrella se ha posado sobre el lago helado.¡Seguidla, que yo me fundo a estos Santacloses herejes!',
        ],
      },
    ],
  },

  /* --------------------------------------------------------------------------
   *  LIGHT BEAMS  (world/beams.js)
   *  When a wise man or the star appears, a very tall beam of light rises from
   *  it straight up (away from the planet center) into the sky. It is a cylinder
   *  with FLIPPED normals drawn as translucent strokes: the near side is culled,
   *  so the wise man / star inside stays visible. wisemen.beam and star.beam can
   *  override any of these values.
   * ------------------------------------------------------------------------ */
  beams: {
    height: 90,                    // world units, from the entity up into the sky
    radius: 3.4,                   // radius at the bottom
    topRadius: 5.6,                // radius at the top (slightly opening beam)
    startBelow: 2,               // the beam starts this far below the entity's feet / center
    segments: 36,                  // vertices around the beam
    ringStep: 0.5,                 // distance between rings of vertices (smaller = more strokes)
    color: '#fff1c2',
    variance: 0.12,                // per-stroke brightness variation
    alpha: 0.11,                   // transparency of every stroke (0..1)
    emissive: 1.0,                 // 1 = glows, ignores the lighting
    strokeSize: 0.3,               // world size of the beam strokes
    fog: 0.3,                      // 0 = beams ignore fog, 1 = fully fogged
    fadeInSeconds: 3,              // ease-out fade-in when it appears (it fades out with its owner)
    // PULSE (sawtooth wave): every `pulse` seconds a beam restarts thin
    // (`minRadius`) at full `alpha`, then widens with ease-out cubic to `radius`
    // (and `topRadius` at the top). Its alpha stays full until the radius
    // reaches `dimStart` x radius, then falls to 0 at the full radius. 0 = no pulse.
    // `count` beams are alive at the same time, offset by pulse / count.
    pulse: 2,                      // seconds per pulse
    minRadius: 0.2,                // bottom radius at the start of each pulse
    dimStart: 0.7,                 // fraction of `radius` where the alpha starts to dim
    count: 3,                      // beams alive at once (each one costs its strokes)
    // FAR PLAYER: so the beam can be seen from far away. Closer than farStart the
    // beam is straight and normal size; from farStart to farEnd (smoothly) it
    // leans toward the player (pivoting at its foot) and gets wider and longer.
    farStart: 15,                  // world units (distance on the ground to the player)
    farEnd: 50,                    // full effect from here on
    farTilt: 50,                   // degrees the beam leans toward the player at farEnd
    farRadiusScale: 2.5,           // radius multiplier at farEnd
    farLengthScale: 3,           // length multiplier at farEnd
  },

  /* --------------------------------------------------------------------------
   *  STAR  (appears over the middle of the frozen lake after the 3 wise men)
   * ------------------------------------------------------------------------ */
  star: {
    spawnDelay: 1,                 // seconds after the third magic
    height: 2.2,                   // height above the ice
    scale: 1.3,
    spinSpeed: 35,                 // degrees / second
    glow: 0.4,                     // idle glow (extra emissive)
    glowPulse: 0.25,               // idle pulsing amount
    viewRange: 45,                 // "star enters view range" sound plays when closer than this and on screen
    nearRange: 24,                 // the "near star" music plays when closer than this
    triggerRange: 4.2,             // reaching this distance starts the ending
    endGlow: 4,                    // glow reached during the ending
    endGlowSeconds: 3,             // time to reach endGlow
    whiteoutSeconds: 5,            // time for the screen to become fully white
    textDelaySeconds: 0.8,         // pause between full white and the final text
    // point light around the star (same system as the wise men's aura)
    aura: {
      color: '#ffe08a',
      strength: 1.4,
      radius: 9,
      height: 0,                   // offset above the star itself
      pulse: 0.25,
      pulseSpeed: 0.8,
      fadeInSeconds: 1.5,
      endBoost: 2.5,               // strength multiplier reached during the ending
    },
    beam: { color: '#ffe08a', alpha: 0.26 }, // overrides of `beams` for the star's beam
  },

  /* --------------------------------------------------------------------------
   *  CANDY CREATURES  (friendly; talk to them to heal)
   * ------------------------------------------------------------------------ */
  candy: {
    spawnInterval: [14, 26],       // seconds between spawns
    firstSpawnDelay: 12,           // seconds after the paint-in
    maxAlive: 3,
    spawnDistance: [8, 26],        // arc distance from the player
    scale: [0.8, 1.1],
    hover: 0.55,                   // float height above the snow
    talkRange: 2.2,
    heal: 18,                      // life restored after talking
    fadeSeconds: 0.9,              // sparkle-and-disappear duration
    collisionRadius: 0.4,
    bodyColors: ['#ff6fa8', '#ff3b3b', '#6fe3c1', '#ffd25e', '#b98bff'],
    wrapperColors: ['#ffe3f0', '#fff6c9', '#d8fff2'],
    names: ['Caramelito', 'Gominola', 'Turroncito', 'Piruleta', 'Mazapán'],
    lines: [
      '¡Hola! Me sobra azúcar. ¡Toma un poco, te vendrá bien!',
      'Psst... los duendes odian los villancicos. Tararea uno.',
      '¿Has visto mi envoltorio? Es de edición limitada.',
      'Dicen que la estrella solo sale si los Reyes Magos te ayudan.',
      'No me muerdas, ¿vale? Mejor un abrazo dulce.',
      'El lago helado brilla más que yo... casi.',
      '¡Feliz Navidad! Toma energía de caramelo.',
    ],
  },

  /* --------------------------------------------------------------------------
   *  TREES  (3 pine models; see models/treePineA.js, B, C)
   * ------------------------------------------------------------------------ */
  trees: {
    count: 150,                    // number of trees on the planet
    minSpacing: 2.4,               // minimum arc distance between trees
    playerClearance: 4,            // keep this free around the start point
    lakeClearance: 1.5,            // keep this free around the lake shore
    variantWeights: { A: 2, B: 1, C: 1 }, // relative probability of each model
    scale: [2.8, 3.45],            // random instance scale
    scaleBuckets: 4,               // refined meshes are cached per scale bucket
    hideNearerThan: 0.01,           // camera depth (world units) of the TREE BASE along the game camera's
                                   // view: below this the whole tree is not painted and does not occlude.
                                   // Positive = hidden a little before the camera reaches it,
                                   // negative = hidden a little after the camera has passed it.
    hideInsideMargin: 0.2,         // world units: the whole tree is ALSO hidden while the camera is inside
                                   // its shape (trunk + crown) grown by this much PLUS the reach of the
                                   // near plane (added automatically from render.near), so the near plane
                                   // never cuts a visible tree open.
    // Every tree = a COMMON TRUNK (models/treeTrunk.js) + its own crown of leaves.
    // These are model units: they grow proportionally with the instance scale
    // (world trunk height = trunkHeight * scale).
    trunkHeight: 1.5,              // distance from the base to where the leaves start
    trunkRadius: 0.17,
    trunkOverlap: 0.3,             // the trunk continues this far up inside the crown (hides the joint)
    collisionRadius: 0.45,         // trunk radius for collisions (times scale)
    mistletoeChance: 0.25,         // probability that a tree carries mistletoe
    lightsChance: 0.3,             // probability that a tree carries light bulbs
    lightsDensity: 0.12,           // fraction of foliage vertices that become bulbs on those trees
    bulbMaterials: ['bulbRed', 'bulbGold', 'bulbGreen'],
  },

  /* --------------------------------------------------------------------------
   *  CANDY CANES  (red and white inverted "J" stuck into the snow at random;
   *  models/candyCane.js, world/canes.js). Model units are scaled by `scale`.
   * ------------------------------------------------------------------------ */
  canes: {
    count: 97,                     // how many on the planet
    scale: [0.9, 1.4],             // random instance scale
    scaleBuckets: 3,               // refined meshes are cached per scale bucket
    shaftHeight: 1.0,              // straight part (model units)
    hookRadius: 0.2,               // radius of the hook at the top
    tailLength: 0.12,              // the hook ends with this short hanging part
    tubeRadius: 0.055,             // thickness of the cane
    segments: 8,                   // vertices around the tube
    ringStep: 0.07,                // distance between rings along the cane (smaller = more strokes)
    stripeWidth: 0.09,             // length of each red / white stripe along the cane
    stripeTwist: 0.14,             // how diagonal the stripes are (0 = straight rings)
    lean: 12,                      // random lean, degrees
    sink: [0.05, 0.25],            // pushed this far into the snow
    collisionRadius: 0.15,         // times scale
    minSpacing: 1.5,               // between canes
    treeClearance: 0.8,            // kept away from tree trunks
    lakeClearance: 0.5,            // kept off the lake
    playerClearance: 3,            // kept away from the start point
  },

  /* --------------------------------------------------------------------------
   *  SNOW  (falls toward the center of the planet, around the player)
   * ------------------------------------------------------------------------ */
  snow: {
    count: 3000,
    areaRadius: 18,                // flakes live within this arc distance of the player
    shellHeight: 16,               // spawn height above the ground
    fallSpeed: [0.9, 2.1],         // world units / second toward the center
    drift: 0.45,                   // sideways wandering speed
    size: 0.09,                    // world size of a flake stroke
    color: '#ffffff',
    emissive: 0.45,                // flakes catch a bit of light by themselves
    // WIND: now and then a gust blows every flake horizontally for a moment.
    // The gust ramps up (ease-out cubic) during `attack` of its life, then eases out.
    wind: {
      enabled: true,
      firstGustDelay: 3,           // seconds before the first gust
      interval: [3, 9],            // seconds between the end of a gust and the next one
      seconds: [0.8, 1.8],         // gust duration
      strength: [3.5, 5.5],        // horizontal speed added at the gust peak (world units / second)
      attack: 1.35,                // fraction of the gust spent ramping up
      flakeVariation: [0.2, 1.9],  // per-flake multiplier, so flakes don't move as one block
      turbulence: 0.85,            // 0..1: each flake's gust direction deviates by up to this many radians
    },
  },

  /* --------------------------------------------------------------------------
   *  SKY  (moon and clouds are strokes on a big shell around the planet)
   * ------------------------------------------------------------------------ */
  sky: {
    moonDistance: 120,             // distance from the planet center along lighting.ambientDirection
    moonRadius: 13,
    moonSizeMul: 2.2,              // moon strokes are bigger
    cloudCount: 18,
    cloudShellRadius: [62, 80],    // distance of clouds from the planet center
    cloudSize: [7, 14],            // cloud blob size
    cloudBlobs: [3, 6],            // ellipsoids per cloud
    cloudDriftSpeed: 1.2,          // degrees / second rotation of the cloud shell
    cloudSizeMul: 2.0,
    skyFog: 0.0,                   // 0 = sky objects ignore fog, 1 = fully fogged
  },

  /* --------------------------------------------------------------------------
   *  AUDIO
   *  Music: 4 files, all with the SAME LOOP LENGTH. They all start at the same
   *  moment and loop forever; only their volumes change, so they crossfade in
   *  sync. Missing files are skipped with a console warning.
   *  The welcome page is silent; pressing Start fades the gameplay track in.
   * ------------------------------------------------------------------------ */
  audio: {
    masterVolume: 0.8,
    musicVolume: 0.7,
    sfxVolume: 0.7,
    crossfadeSeconds: 2.5,
    gameplayFadeInSeconds: 4,      // fade-in of the gameplay music after pressing Start
    tracks: {
      gameplay: 'audio/gameplay.ogg',
      wiseman:  'audio/wiseman.ogg',
      nearStar: 'audio/nearstar.ogg',
      final:    'audio/final.ogg',
    },
    gameOverTrack: null,           // track on the game over screen (null = music fades out)
    // procedural sound effects
    sfx: {
      click:     { volume: 0.5, freq: 880, seconds: 0.08 },
      throw:     { volume: 0.35, freqStart: 2400, freqEnd: 500, seconds: 0.28 },
      hit:       { volume: 0.7, freqStart: 160, freqEnd: 45, seconds: 0.3 },
      magic:     { volume: 0.6, baseFreq: 523.25, seconds: 2.4 },
      footstep:  { volume: 0.18, seconds: 0.09, cutoff: 1800 },
      starSeen:  { volume: 0.55, freq: 1046.5, seconds: 3.0 },
      heal:      { volume: 0.4, baseFreq: 784, seconds: 0.6 },
    },
  },

  /* --------------------------------------------------------------------------
   *  HUD  (two thin full-width rectangles at the bottom of the screen, no text:
   *  the spirit bar on top, the life bar below it)
   * ------------------------------------------------------------------------ */
  hud: {
    lifeColor: '#891212',
    pointsColor: '#895d12',
    barBackground: 'rgba(10, 16, 40, 0.45)', // the empty part of each bar
    barThickness: 4,               // px, height of each bar
    barGap: 3,                     // px between the two bars
    bottomMargin: 0,               // px from the bottom edge of the window
    sideMargin: 0,                 // px from the left / right edges
    easeSeconds: 0.35,             // bars ease-out to their new length
    pointsBarMax: 40,              // points needed to fill the spirit bar (it keeps counting beyond)
  },

  /* --------------------------------------------------------------------------
   *  DIALOG BOX
   * ------------------------------------------------------------------------ */
  dialog: {
    charsPerSecond: 42,            // typewriter speed
    // click / tap / Space = next page. Right click / Backspace / long press = one page
    // back (down to the first page). A dialog only closes by reaching its end.
    longPressMs: 450,              // touch screens: hold this long (finger still) to go back
    // no background color: while the dialog is open, no stroke is painted below an
    // arc that joins the two bottom corners of the screen. The arc is only as high
    // as the text box needs (its top corners + arcMargin): on bigger screens it is
    // relatively lower.
    arcHeight: 0.4,                // MAXIMUM arc height (fraction of the screen height); on small screens
                                   // the box gets narrower (and taller) to stay under it
    arcEdgeJitter: 0,              // px: >0 makes the arc edge ragged (strokes cross it a little at random)
    arcMargin: 8,                  // px kept between the top corners of the text box and the arc
    textBottom: '2.5vh',           // distance of the dialog text from the screen bottom (CSS length)
    maxWidth: 640,                 // px; the box gets narrower when needed to fit under the arc
    minWidth: 260,                 // px; it never gets narrower than this
    textColor: '#ffd0cf',
    nameColor: '#d3222e',
  },

  /* --------------------------------------------------------------------------
   *  PAINTED UI  (ui/paint.js)
   *  Buttons and the calendar get a background made of brush dabs (the same
   *  procedural brushes as the world), with rounded, feathered corners.
   *  The dialog box and the "click to return" text have NO background: the
   *  world strokes behind them are not painted (the hole stays in place on
   *  screen, so other strokes are skipped as the camera turns).
   * ------------------------------------------------------------------------ */
  ui: {
    holePadding: 14,               // px around the "click to return" text where no stroke is painted
                                   // (the dialog uses an arc instead: dialog.arcHeight)
    // (the UI clearing always removes every stroke there, ground included)
    paint: {
      dabSize: 54,                 // px, length of a typical dab (clamped to the element size)
      density: 1.1,                // dabs per dab-area. Higher = more opaque, fewer gaps
      edgeRoughness: 0.9,          // 0 = dabs reach the border evenly, 1+ = ragged, eaten borders
      colorJitter: 0.1,            // 0..1: dabs randomly a bit lighter / darker
      opacity: 0.9,                // alpha of each dab (they pile up in the middle)
      seed: 0,                     // change to get a different painting of every element
    },
    buttonColor: '#b8282f',
    buttonTextColor: '#fff8ec',
    buttonPaint: { dabSize: 55 },  // overrides of `paint` for buttons (smaller dabs)
    repaintOnHover: true,          // buttons get fresh paint when the mouse enters
    cornerRadius: 18,              // px, rounded corners of painted buttons
    feather: 5,                    // px, soft (blurred) border so no dab looks cut
  },

  /* --------------------------------------------------------------------------
   *  WIN CALENDAR  (ui/calendar.js)
   *  After the ending text, a painted calendar. Only `selectableDays` can be
   *  clicked. Each click marks the day with the next entry of `marks`: a hand
   *  drawn, almost circular spiral of `turns` turns (+ `rays` little rays).
   *  Clicking a marked day erases all the marks.
   *  When every mark is placed, the Send button opens WhatsApp with
   *  `messageTemplate`, where {first date} is the first day clicked, etc.
   * ------------------------------------------------------------------------ */
  calendar: {
    year: 2026,
    month: 12,                     // 1..12
    selectableDays: [11, 12, 19],
    firstWeekday: 1,               // 0 = the week starts on Sunday, 1 = on Monday
    weekdayLetters: ['D', 'L', 'M', 'X', 'J', 'V', 'S'], // Sunday first (Date.getDay order)
    weekdayNames: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    monthNames: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    titleFormat: '{Month} {year}', // {month} lowercase name, {Month} capitalized, {year}
    width: 420,                    // px (shrinks on narrow windows)
    maxWidthFraction: 0.92,        // of the window width
    panelColor: '#f4e4c4',         // painted paper behind the days
    inkColor: '#6b4a1a',           // day numbers, weekday letters
    bandColor: '#b8282f',          // painted top band behind the month name
    bandHeight: 1.0,               // x cell size
    monthColor: '#fff8ec',         // month name (on the band)
    cornerRadius: 22,              // px, rounded corners of the calendar
    feather: 6,                    // px, soft border
    dimmedAlpha: 0.3,              // opacity of the days that cannot be clicked
    selectableColor: 'rgba(255, 196, 70, 0.55)', // painted dab behind clickable days
    markColor: '#c0202c',          // spirals and rays
    markWidth: 2.2,                // px, thickness of the hand-drawn line
    markPasses: 2,                 // overlapping jittered passes (more = sketchier)
    spiralStartRadius: 0.3,        // x cell size, radius where the spiral starts
    spiralGrowth: 0.028,           // x cell size added to the radius per turn (small = almost circular)
    spiralSquash: 0.86,            // vertical / horizontal radius
    spiralJitter: 0.035,           // x cell size, slow wobble of the line
    spiralNoise: 0.6,              // px, fast hand tremor
    drawSecondsPerTurn: 0.28,      // animation speed of a new mark
    rayGap: 0.07,                  // x cell size, between the spiral and the rays
    rayLength: [0.14, 0.22],       // x cell size
    marks: [                       // 1st, 2nd and 3rd clicked day
      { turns: 1.1 },
      { turns: 3.3 },
      { turns: 5.5, rays: 7 },
    ],
    whatsappNumber: '34628010035',            // international format, digits only (e.g. '34600111222'). Empty = WhatsApp asks for the contact
    whatsappUrl: 'https://wa.me/{number}?text={text}',
    messageTemplate: 'Querida estrella de los deseos, te pido que el próximo CortoClub sea alguno de estos días. Mi orden de preferencia es: {third date}, {second date}, {first date}. Ten en cuenta que he tardado {elapsedTime} en encontrarte ¡Saludos navideños!',
    dateFormat: '{weekday} {day} de {month}', // how each {... date} is written in the message
    // {elapsedTime}: total play time until the star was found, ADDING UP every try
    // (retries included). Written like "1 hora, 4 minutos y 12 segundos"; zero units are left out.
    elapsedUnits: { hour: ['hora', 'horas'], minute: ['minuto', 'minutos'], second: ['segundo', 'segundos'] },
    elapsedJoin: [', ', ' y '],    // between units, before the last one
  },

  /* --------------------------------------------------------------------------
   *  TEXT  (Spanish UI strings). {points} is replaced by the score.
   * ------------------------------------------------------------------------ */
  text: {
    title: '',                     // optional title on the welcome page (empty = only the button)
    start: 'Comenzar',
    controlsHint: 'clic para moverte e interactuar · mueve el ratón para girar la cámara',
    controlsHintTouch: 'mantén el dedo para avanzar y girar. En el ordenador esto es mejor u.u', // touch screens
    dialogHint: 'clic',
    gameOverTitle: 'La nieve te ha vencido...',
    gameOverPoints: 'tu espíritu navideño está al {points}%.',
    endingLines: [                 // win screen: one entry per line, shown above the calendar
      'La búsqueda ha terminado.',
      'Esta estrella de cine concede deseos.',
      'Marca en orden los días que prefieres para el próximo CortoClub:',
    ],
    send:  'Enviar deseo',                // win screen: send the chosen days by WhatsApp
    retry: 'Ser un reno',
    clickToResume: 'haz clic para volver a la búsqueda', // shown after Esc released the mouse
  },
};

export default settings;
