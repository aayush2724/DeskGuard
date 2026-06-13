/**
 * shader.js — WebGL fluid shader background
 * Mouse-reactive chromatic noise with green plasma tendrils
 * Inspired by shader.se aesthetic: slow, cinematic, deep
 */

(function () {
  'use strict';

  const canvas = document.getElementById('webgl-canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

  if (!gl) {
    // Fallback: CSS gradient if WebGL unavailable
    canvas.style.display = 'none';
    document.body.style.background = 'radial-gradient(ellipse at 30% 20%, #0d2a1a 0%, #08100d 60%)';
    return;
  }

  /* ── Vertex shader ─────────────────────────────────────── */
  const vsSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  /* ── Fragment shader ───────────────────────────────────── */
  const fsSource = `
    precision highp float;
    varying vec2 v_uv;

    uniform float u_time;
    uniform vec2  u_resolution;
    uniform vec2  u_mouse;
    uniform float u_mouseStrength;

    // ── Noise helpers ──
    vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ *ns.x + ns.yyyy;
      vec4 y = y_ *ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
    }

    float fbm(vec3 p) {
      float v = 0.0;
      float a = 0.5;
      vec3 shift = vec3(100.0);
      for (int i = 0; i < 5; i++) {
        v += a * snoise(p);
        p = p * 2.0 + shift;
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec2 uv = v_uv;
      vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
      vec2 st = (uv - 0.5) * aspect;

      // Mouse influence
      vec2 mouse = (u_mouse - 0.5) * aspect;
      float mouseDist = length(st - mouse);
      float mouseInfluence = u_mouseStrength * smoothstep(0.6, 0.0, mouseDist) * 0.3;

      float t = u_time * 0.12;

      // Layered FBM noise
      vec3 p1 = vec3(st * 1.4 + vec2(0.0, t * 0.3), t * 0.2);
      p1.xy += mouse * mouseInfluence * 2.0;
      float n1 = fbm(p1);

      vec3 p2 = vec3(st * 2.1 + vec2(n1 * 0.5, t * 0.5), t * 0.15 + 3.7);
      p2.xy += mouse * mouseInfluence * 1.4;
      float n2 = fbm(p2);

      vec3 p3 = vec3(st * 1.8 + vec2(n2 * 0.7, n1 * 0.4), t * 0.25 + 7.2);
      float n3 = fbm(p3);

      float finalNoise = n3 * 0.5 + 0.5;

      // ── Color palette ──────────────────────────────────────
      // Deep void black-green base
      vec3 colBase   = vec3(0.031, 0.063, 0.047);  // #081010 deep
      vec3 colMid    = vec3(0.055, 0.18,  0.11);   // dark forest
      vec3 colAccent = vec3(0.22,  0.72,  0.37);   // #38B85E plasma green
      vec3 colFog    = vec3(0.08,  0.22,  0.15);   // subtle fog

      // Build color from noise layers
      vec3 col = mix(colBase, colMid, smoothstep(0.3, 0.7, n1 * 0.5 + 0.5));
      col = mix(col, colFog,   smoothstep(0.4, 0.6, n2 * 0.5 + 0.5) * 0.5);
      col = mix(col, colAccent, pow(smoothstep(0.55, 0.9, finalNoise), 2.8) * 0.55);

      // Mouse glow bloom
      float bloom = smoothstep(0.35, 0.0, mouseDist) * u_mouseStrength * 0.25;
      col += colAccent * bloom;

      // Subtle vignette
      float vignette = 1.0 - smoothstep(0.3, 1.2, length(st));
      col *= mix(0.6, 1.0, vignette);

      // Chromatic tint on edges — cool blue-green
      vec2 edgeDist = abs(st) / aspect;
      float edge = smoothstep(0.3, 0.8, max(edgeDist.x, edgeDist.y));
      col = mix(col, col * vec3(0.7, 1.0, 0.9), edge * 0.3);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  /* ── Compile shaders ─────────────────────────────────── */
  function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader error:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  const vs = compileShader(gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    return;
  }

  gl.useProgram(program);

  /* ── Fullscreen quad ─────────────────────────────────── */
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  /* ── Uniforms ────────────────────────────────────────── */
  const uTime     = gl.getUniformLocation(program, 'u_time');
  const uRes      = gl.getUniformLocation(program, 'u_resolution');
  const uMouse    = gl.getUniformLocation(program, 'u_mouse');
  const uMouseStr = gl.getUniformLocation(program, 'u_mouseStrength');

  /* ── State ───────────────────────────────────────────── */
  let mouse = { x: 0.5, y: 0.5 };
  let mouseStrength = 0.0;
  let targetStrength = 0.0;
  let startTime = performance.now();

  /* ── Resize ──────────────────────────────────────────── */
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  /* ── Mouse tracking ──────────────────────────────────── */
  window.addEventListener('mousemove', e => {
    mouse.x = e.clientX / window.innerWidth;
    mouse.y = 1.0 - e.clientY / window.innerHeight;
    targetStrength = 1.0;
  });
  window.addEventListener('mouseleave', () => { targetStrength = 0.0; });

  /* ── Render loop ─────────────────────────────────────── */
  function render() {
    const t = (performance.now() - startTime) / 1000;

    // Smooth mouse strength
    mouseStrength += (targetStrength - mouseStrength) * 0.06;

    gl.uniform1f(uTime,     t);
    gl.uniform2f(uRes,      canvas.width, canvas.height);
    gl.uniform2f(uMouse,    mouse.x, mouse.y);
    gl.uniform1f(uMouseStr, mouseStrength);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(render);
  }

  render();

})();
