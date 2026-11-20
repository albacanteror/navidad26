// States and priority resolution.
//
// A State has an associated animation and a behaviour priority:
//   name       : identifier
//   animation  : Animation played while in the state
//   priority   : higher wins when several states are eligible
//   when       : (entity, ctx) => bool, is this state eligible right now?
//   behaviour  : (entity, dt, ctx) => void, runs every frame while active
//   canMove    : the entity may move in this state
//   canDamage  : the entity may hurt the player in this state
//   locked     : once entered, stay until the animation ends (unless a higher priority state wants in)
//   enter/exit : optional hooks
//   duration   : optional (entity) => ms override for the animation cycle

export class State {
  constructor(def) {
    Object.assign(this, { canMove: false, canDamage: false, locked: false, when: () => true, behaviour: () => {} }, def);
  }
}

export class StateMachine {
  constructor(entity, player, states) {
    this.entity = entity;
    this.player = player; // AnimationPlayer
    this.states = states; // { name: State }
    this.current = null;
    this.forced = null;
    player.onEnd = (anim) => {
      if (this.current && this.current.animation === anim) {
        this.current.done = true;
        if (anim.triggers) this.force(anim.triggers);
      }
    };
  }

  /** Force a transition on the next update (used by 'once' animations' triggers). */
  force(name) {
    this.forced = name;
  }

  set(name, ctx) {
    const st = this.states[name];
    if (!st || st === this.current) return;
    if (this.current && this.current.exit) this.current.exit(this.entity, ctx);
    this.current = st;
    st.done = false;
    const dur = st.duration ? st.duration(this.entity) : undefined;
    if (st.animation) this.player.play(st.animation, dur); // null = keep the current pose / animation
    if (st.enter) st.enter(this.entity, ctx);
  }

  update(dt, ctx) {
    if (this.forced) {
      const f = this.forced;
      this.forced = null;
      this.set(f, ctx);
    }
    // highest-priority eligible state
    let best = null;
    for (const st of Object.values(this.states)) {
      if (st.when(this.entity, ctx) && (!best || st.priority > best.priority)) best = st;
    }
    const cur = this.current;
    if (best && best !== cur) {
      const curLocked = cur && cur.locked && !cur.done;
      if (!curLocked || best.priority > cur.priority) this.set(best.name, ctx);
    }
    if (this.current) this.current.behaviour(this.entity, dt, ctx);
  }

  get name() {
    return this.current ? this.current.name : null;
  }
}
