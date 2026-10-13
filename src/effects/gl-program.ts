/**
 * Compile and link a WebGL program from two shader sources, or return null if it doesn't link.
 * The vertex attribute `aPos` is pinned to location 0, so programs can share one vertex buffer.
 */
export function linkProgram(gl: WebGLRenderingContext, vert: string, frag: string) {
  const prog = gl.createProgram()!;
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vert],
    [gl.FRAGMENT_SHADER, frag],
  ] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    gl.attachShader(prog, s);
  }
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  return gl.getProgramParameter(prog, gl.LINK_STATUS) ? prog : null;
}
