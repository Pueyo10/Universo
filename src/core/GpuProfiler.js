// Non-blocking, sequential WebGL2 timer queries. A frame owns all its queries;
// disjoint results discard the entire batch, never mix partial frame timings.
export class GpuProfiler {
  constructor(gl) {
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.pending = []; this.frame = null; this.active = null; this.stages = {};
  }
  beginFrame() {
    this.frame = this.ext && this.pending.length < 4 ? [] : null;
  }
  begin(name) {
    if (!this.frame || this.active) return;
    const query = this.gl.createQuery();
    if (!query) return;
    this.active = { name, query };
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
  }
  end() {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.frame.push(this.active); this.active = null;
  }
  endFrame() {
    this.end();
    if (this.frame?.length) this.pending.push(this.frame);
    this.frame = null;
  }
  poll() {
    const samples = [], gl = this.gl;
    if (!this.ext) return samples;
    if (gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
      for (const frame of this.pending) for (const { query } of frame) gl.deleteQuery(query);
      this.pending.length = 0; this.stages = {};
      return samples;
    }
    while (this.pending.length) {
      const frame = this.pending[0];
      if (!frame.every(({ query }) => gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE))) break;
      const stages = {};
      for (const { name, query } of frame) {
        const ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
        stages[name] = (stages[name] || 0) + ms;
        gl.deleteQuery(query);
      }
      this.pending.shift();
      const total = Object.values(stages).reduce((a, b) => a + b, 0);
      if (total > 0 && total < 1000) { this.stages = stages; samples.push(total); }
    }
    return samples;
  }
  wrap(pass, name) {
    const render = pass.render;
    pass.render = (...args) => {
      this.begin(name);
      try { return render.apply(pass, args); } finally { this.end(); }
    };
  }
}
