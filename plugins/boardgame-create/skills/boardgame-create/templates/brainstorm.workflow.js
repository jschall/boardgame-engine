export const meta = {
  name: 'boardgame-create-ideate',
  description: 'Fan out designers to brainstorm laser-cut board game concepts, judge them, vet finalists, pick a winner',
  phases: [
    { title: 'Ideate', detail: '7 designers from different angles, 2 concepts each' },
    { title: 'Judge', detail: '3 independent judges score every concept' },
    { title: 'Vet', detail: 'prior art + laser feasibility + mental playtest per finalist' },
    { title: 'Select', detail: 'pick winner, graft best ideas, write design brief' },
  ],
}

const BRIEF = `
THE ASSIGNMENT (from the user):
Design a brand-new tabletop board game.
- It will be made 100% on a 40W diode laser cutter/engraver (cut + engrave), EXCEPT small accessories such as dice. The box is also made on the laser.
- Any material a diode laser can cut/engrave is fair game, but the user has 12x18 inch, 1/8 inch (3 mm) plywood sheets on hand, so ply should be the backbone.
- 2-4 players, and it must be VERY fun at every count (2p included).
- Reasonable play time (aim 30-50 minutes, teach under 10 minutes).
- It must be innovative in some real way: a mechanism or physical interaction players haven't seen.
- It must be cute and beautiful.
- Target market: adults (game night with friends, couples, gift buyers). Cute is not childish: wit, elegance, tension, and interaction matter.
- Ultimate bar: the kind of game that flies off the shelves at Barnes & Noble.

DIODE LASER REALITIES (design within these):
- 40W-class diode (450 nm blue). Cuts 3 mm ply cleanly (1-2 passes); 6 mm wood possible with multiple passes but slower and charrier. Kerf ~0.15 mm; cut edges are browned.
- Engraves beautifully on wood: fine line art, grayscale/dithered shading, deeper relief by repeated passes, text down to ~2 mm tall.
- Other good materials: basswood / birch / walnut / cherry veneer ply, chipboard, cardstock/paper, leather, wool felt, cork sheet, opaque colored acrylic (black/red/orange/green work; CLEAR, translucent, WHITE and BLUE acrylic generally do NOT cut with a blue diode), slate/tile and anodized aluminum (engrave only), painted surfaces (engrave through coating).
- Forbidden: PVC/vinyl (chlorine gas), polycarbonate, ABS-heavy plastics, cutting glass/metal.
- Per-part size: keep every single part within ~290 x 390 mm so it fits the 12x18 sheet and common 400x400 mm beds. Bigger boards must be tiled, puzzle-jointed, folding, or modular.
- Color: from material choice (wood species, felt, cork, leather, cardstock, opaque colored acrylic), engraving tone, and optionally mask-and-fill paint or stain. The game must still read clearly if hand-painting is skipped.
- Laser tricks worth exploiting: layered/stacked relief, inlays, living hinges, press-fit/finger-joint 3D assemblies, pegs & holes, detents, snap fits, shadow/stencil cut-outs, tactile engraving, nested pieces cut from each other's waste, pieces that stack/interlock/balance.
- Budget: roughly 4-10 sheets of 12x18 ply plus minor other materials; cuttable by a hobbyist in a weekend.

ALREADY DONE - DO NOT REPEAT (the user already has these proposals):
1. TUMBLER - cat burglars in a field of 19 click-detent rotating wooden dials whose gates align into a maze.
2. NIGHT VAULT - thieves in a vault of three concentric rotating rings, secret programmed actions, box becomes the board.
3. CROOKED WORKS - shared contraption of channel tiles and switches; resources flow to player outlets; tolls.
4. FALSE BOTTOM - smuggling bluff game packing a case with sliding shutters and an inspector.
So: no heist/thief/smuggling themes, and no rotating-dial / rotating-ring / sliding-shutter core mechanism. Go somewhere genuinely different.
`

const ANGLES = [
  { key: 'material', lens: 'MATERIAL-FIRST. Start from what laser-cut wood can do that cardboard and plastic cannot (stacking, interlocking 3D assembly, relief you can feel, stencils and shadows, living hinges, nested pieces, sound, weight). Find a mechanism that could ONLY exist as a laser-cut object.' },
  { key: 'spectacle', lens: 'TABLE SPECTACLE. The game builds a gorgeous 3D object or diorama during play that people want to photograph and post. Every turn visibly changes a beautiful shared artifact. The strategy must still be real and tense.' },
  { key: 'hybrid', lens: 'SKILL + BRAIN HYBRID. Marry a light physical skill element (balance, stacking, placement, fitting, reaching, flicking) with genuinely tight strategic decisions, so adults feel both clever and giddy. Avoid a pure dexterity party toy.' },
  { key: 'social', lens: 'INTERACTION FIRST. Adults at game night with drinks: laughter, table talk, reading each other, negotiation or simultaneous reveals, but with real decisions and a satisfying arc, not a pure party game. Every player engaged on every turn, including opponents\' turns.' },
  { key: 'elegant', lens: 'ELEGANT MASS-MARKET BREAKOUT. Think Azul, Patchwork, Santorini, Cascadia, Harmonies: a 5-minute teach, instantly beautiful, deep enough to replay 50 times, works perfectly at 2 and at 4. A cute theme wrapped around a crisp, novel core rule.' },
  { key: 'market', lens: 'MARKET-FIRST. Research with WebSearch (load it via ToolSearch "select:WebSearch") what sells in the Barnes & Noble game aisle in 2024-2026 and what adult "cozy" hits share (Wingspan, Cascadia, Harmonies, Azul, Flip 7, Heat, Sky Team, etc.). Find the gap on that shelf and design the game that fills it, using the heirloom laser-cut wood as the premium differentiator.' },
  { key: 'wildcard', lens: 'WILDCARD. Be surprising. A mechanism nobody has seen: light and shadow through cut stencils, pieces that are also a puzzle, a board that folds or unfolds into new geometry during play, hidden information carried in physical texture, emergent pictures, sound. Keep it playable, fun, and producible.' },
]

const CONCEPT = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    tagline: { type: 'string' },
    theme_and_tone: { type: 'string', description: 'Setting, characters, why it is cute AND appeals to adults' },
    elevator_pitch: { type: 'string', description: '3-5 sentences a B&N shopper reads on the back of the box' },
    core_innovation: { type: 'string', description: 'The one thing players have not seen before, and why it is FUN, not just novel' },
    components: { type: 'string', description: 'Every physical part: name, qty, material, size, how it is made on the laser' },
    setup: { type: 'string' },
    turn_structure: { type: 'string', description: 'Exactly what a player does on a turn, with concrete numbers' },
    scoring_and_end: { type: 'string' },
    player_count_scaling: { type: 'string', description: 'How 2p, 3p and 4p each play and why each is great' },
    sample_turns: { type: 'string', description: 'Narrated 4-6 turns of a 2-player game, including what the players say out loud' },
    why_fun: { type: 'string' },
    beauty_and_art_direction: { type: 'string', description: 'Material/palette combos, engraving style, the photo moment' },
    play_time_minutes: { type: 'string' },
    laser_plan: { type: 'string', description: 'Sheet estimate, materials, tricky fits, box design' },
    closest_existing_games: { type: 'string', description: 'Honest list of similar published games and how this differs' },
    risks: { type: 'string' },
  },
  required: ['name', 'tagline', 'theme_and_tone', 'elevator_pitch', 'core_innovation', 'components', 'setup', 'turn_structure', 'scoring_and_end', 'player_count_scaling', 'sample_turns', 'why_fun', 'beauty_and_art_direction', 'play_time_minutes', 'laser_plan', 'closest_existing_games', 'risks'],
}

const DESIGNER_OUT = {
  type: 'object',
  properties: { concepts: { type: 'array', minItems: 2, maxItems: 2, items: CONCEPT } },
  required: ['concepts'],
}

phase('Ideate')
const designed = await parallel(ANGLES.map(a => () => agent(
`You are an award-winning tabletop game designer brainstorming for a client.
${BRIEF}

YOUR DESIGN LENS: ${a.lens}

Produce exactly TWO concepts that differ from each other in both theme and core mechanism.
For each concept:
- Write concrete, playable rules (real numbers, real turn actions, real end condition), not vague vibes.
- Mentally playtest a full 2-player game AND a 4-player game. Find the boring stretches, downtime, runaway leaders, kingmaking and degenerate strategies, then FIX them in the rules before you submit.
- Make the innovation something that makes people at the table grin or gasp, not an engineering curiosity.
- Make it cute AND beautiful in a way that appeals to adults (think the shelf presence of Wingspan / Cascadia / Harmonies, or the wit of a New Yorker cartoon).
- Be honest about the closest existing games. If you are unsure whether something already exists, you may check with WebSearch (load via ToolSearch "select:WebSearch").
Do not write any files. Return only the structured output.`,
  { label: `design:${a.key}`, phase: 'Ideate', schema: DESIGNER_OUT }
)))

const concepts = []
designed.forEach((d, i) => {
  if (!d) { log(`designer ${ANGLES[i].key} returned nothing`); return }
  d.concepts.forEach((c, j) => concepts.push({ id: `${ANGLES[i].key}-${j + 1}`, angle: ANGLES[i].key, ...c }))
})
log(`${concepts.length} concepts generated`)

const conceptDigest = concepts.map(c =>
`### ${c.id}: ${c.name} - ${c.tagline}
THEME: ${c.theme_and_tone}
PITCH: ${c.elevator_pitch}
INNOVATION: ${c.core_innovation}
COMPONENTS: ${c.components}
SETUP: ${c.setup}
TURN: ${c.turn_structure}
SCORING/END: ${c.scoring_and_end}
PLAYER COUNTS: ${c.player_count_scaling}
SAMPLE TURNS: ${c.sample_turns}
WHY FUN: ${c.why_fun}
BEAUTY: ${c.beauty_and_art_direction}
TIME: ${c.play_time_minutes}
LASER: ${c.laser_plan}
SIMILAR GAMES: ${c.closest_existing_games}
RISKS: ${c.risks}`).join('\n\n')

const JUDGES = [
  { key: 'buyer', persona: 'the senior games & puzzles category buyer for Barnes & Noble. You have seen thousands of pitches and reject over 95%. You care about: shelf appeal and the box readable in 10 seconds, gift-ability, broad adult appeal beyond hobbyists, word of mouth, teach time, price-to-perceived-value, and whether it looks like something people will photograph and post.' },
  { key: 'critic', persona: 'a veteran hobby game designer and brutally honest reviewer (think Shut Up & Sit Down meets a BoardGameGeek top-100 designer). You care about: whether the core loop is actually fun turn after turn, true innovation versus a reskin, meaningful decisions, player interaction, downtime, degenerate strategies, runaway leaders, how it plays at 2 vs 4, and play length.' },
  { key: 'maker', persona: 'a product engineer who runs a successful heirloom laser-cut game studio on Etsy and Kickstarter using diode lasers. You care about: whether it can really be made on a 40W diode from 3 mm ply within ~290x390 mm parts, tolerances, durability, part counts and sheet counts, whether the realized wooden object will be genuinely beautiful and cute, and whether the laser is essential rather than incidental.' },
]

const JUDGE_OUT = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          fun: { type: 'number' }, innovation: { type: 'number' }, beauty_cute: { type: 'number' },
          adult_appeal: { type: 'number' }, shelf_appeal: { type: 'number' }, feasibility: { type: 'number' },
          length_and_teach: { type: 'number' },
          overall: { type: 'number', description: '1-10 overall likelihood of being a genuine hit, not an average of the others' },
          fatal_flaw: { type: 'string', description: 'Empty string if none' },
          one_line: { type: 'string' },
        },
        required: ['id', 'fun', 'innovation', 'beauty_cute', 'adult_appeal', 'shelf_appeal', 'feasibility', 'length_and_teach', 'overall', 'fatal_flaw', 'one_line'],
      },
    },
    top_pick_id: { type: 'string' },
    reasoning: { type: 'string' },
  },
  required: ['scores', 'top_pick_id', 'reasoning'],
}

phase('Judge')
const judged = await parallel(JUDGES.map(j => () => agent(
`You are ${j.persona}
You are judging board game concepts for this assignment:
${BRIEF}

Score EVERY concept below on 1-10 scales (fun, innovation, beauty_cute, adult_appeal, shelf_appeal, feasibility, length_and_teach, overall). Be harsh and discriminating: use the full range, most concepts should NOT score above 7 overall. Name any fatal flaw. Then name your single top pick and explain.
Judge independently; do not write files.

CONCEPTS:
${conceptDigest}`,
  { label: `judge:${j.key}`, phase: 'Judge', schema: JUDGE_OUT }
)))

const agg = concepts.map(c => {
  const rows = judged.filter(Boolean).map(j => j.scores.find(s => s.id === c.id)).filter(Boolean)
  const mean = k => rows.length ? rows.reduce((s, r) => s + (r[k] || 0), 0) / rows.length : 0
  return {
    id: c.id, name: c.name, overall: mean('overall'), fun: mean('fun'), innovation: mean('innovation'),
    beauty: mean('beauty_cute'), shelf: mean('shelf_appeal'), feasibility: mean('feasibility'),
    flaws: rows.map(r => r.fatal_flaw).filter(Boolean), lines: rows.map(r => r.one_line),
    topPicks: judged.filter(Boolean).filter(j => j.top_pick_id === c.id).length,
  }
}).sort((a, b) => (b.overall + 0.5 * b.topPicks) - (a.overall + 0.5 * a.topPicks) || (b.fun + b.innovation) - (a.fun + a.innovation))

const finalists = agg.slice(0, 3)
log(`finalists: ${finalists.map(f => `${f.name} (${f.overall.toFixed(1)})`).join(', ')}; ${agg.length - 3} others not vetted`)

const VET_OUT = {
  type: 'object',
  properties: {
    novelty_1to10: { type: 'number' },
    closest_games_found: { type: 'string' },
    novelty_notes: { type: 'string' },
    feasibility_1to10: { type: 'number' },
    sheet_estimate: { type: 'string' },
    feasibility_issues: { type: 'string' },
    playtest_findings: { type: 'string', description: 'What happened in your simulated 2p and 4p games: boring stretches, dominant strategies, length, memorable moments' },
    fun_1to10: { type: 'number' },
    fixes: { type: 'string', description: 'Concrete rule/component changes that fix the problems found' },
    should_advance: { type: 'boolean' },
  },
  required: ['novelty_1to10', 'closest_games_found', 'novelty_notes', 'feasibility_1to10', 'sheet_estimate', 'feasibility_issues', 'playtest_findings', 'fun_1to10', 'fixes', 'should_advance'],
}

phase('Vet')
const vets = await pipeline(finalists, f => {
  const c = concepts.find(x => x.id === f.id)
  const full = conceptDigest.split('\n\n### ').find(s => s.includes(`${c.id}: ${c.name}`)) || ''
  return agent(
`You are vetting a board game finalist. Be skeptical and concrete.
${BRIEF}

FINALIST:
### ${full.replace(/^### /, '')}

JUDGE NOTES: ${f.lines.join(' | ')}
FATAL FLAWS RAISED: ${f.flaws.join(' | ') || 'none'}

Do three things:
1. PRIOR ART: use WebSearch (load via ToolSearch "select:WebSearch") to search BoardGameGeek and the web for published games with the same core mechanism or physical interaction. Report the closest matches honestly and score novelty.
2. LASER FEASIBILITY: sketch a rough cut list against 12x18 in 3 mm ply sheets (parts <= 290x390 mm) on a 40W diode, count sheets, identify fragile/tolerance-critical parts, and check the box.
3. PLAYTEST SIMULATION: play out a full 2-player game and a 4-player game turn by turn in your head (or with a quick throwaway script in /tmp if helpful). Report the arc, estimated real play time, dominant strategies, downtime, and the moments that would make people laugh or gasp.
Then propose concrete fixes. Do not write files outside /tmp.`,
    { label: `vet:${f.id}`, phase: 'Vet', schema: VET_OUT })
})

const SELECT_OUT = {
  type: 'object',
  properties: {
    winner_id: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string', description: 'lowercase-hyphenated filename slug' },
    why_this_one: { type: 'string' },
    grafts: { type: 'string', description: 'Ideas grafted in from other concepts and vet fixes' },
    design_brief_markdown: { type: 'string', description: 'Complete design brief v1: theme/tone, innovation, full components list with materials and dimensions, setup, complete rules, scoring, end, player-count variants, art direction, laser plan and box, 2-player animated demo script idea, and open risks' },
  },
  required: ['winner_id', 'name', 'slug', 'why_this_one', 'grafts', 'design_brief_markdown'],
}

phase('Select')
const vetDigest = finalists.map((f, i) => `## ${f.id} (${f.name}) mean overall ${f.overall.toFixed(2)}, top picks ${f.topPicks}
VET: ${JSON.stringify(vets[i])}`).join('\n\n')
const rankDigest = agg.map(a => `${a.id} ${a.name}: overall ${a.overall.toFixed(2)} fun ${a.fun.toFixed(1)} innov ${a.innovation.toFixed(1)} beauty ${a.beauty.toFixed(1)} shelf ${a.shelf.toFixed(1)} feas ${a.feasibility.toFixed(1)} | ${a.lines.join(' / ')}${a.flaws.length ? ' | FLAWS: ' + a.flaws.join(' / ') : ''}`).join('\n')

const selection = await agent(
`You are the lead designer making the final call on which board game concept to develop.
${BRIEF}

ALL CONCEPTS (full text):
${conceptDigest}

JUDGE RANKING:
${rankDigest}

JUDGE TOP-PICK REASONING:
${judged.filter(Boolean).map((j, i) => `${JUDGES[i].key}: picked ${j.top_pick_id}. ${j.reasoning}`).join('\n')}

FINALIST VETTING:
${vetDigest}

Pick the concept with the best shot at being a genuine Barnes & Noble hit that is also very fun, innovative, cute, beautiful, adult-appealing and truly laser-makeable. You may override the ranking if the vetting reveals a problem (prior art, infeasibility, not fun). Apply the vet fixes and graft in the best ideas from any other concept where they strengthen the winner without muddying it.
Then write a complete, playable design brief v1 in markdown (full rules with concrete numbers; nothing left as TBD). Do not write files.`,
  { label: 'select', phase: 'Select', schema: SELECT_OUT })

return { rankDigest, finalists: finalists.map((f, i) => ({ ...f, vet: vets[i] })), selection, concepts: concepts.map(c => ({ id: c.id, name: c.name, tagline: c.tagline, innovation: c.core_innovation })) }
