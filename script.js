
(() => {
  const canvas = document.getElementById("mobius-canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  const display = document.querySelector(".mobius-display");
  const rotationButton = document.getElementById("rotation-toggle");
  const rotationValue = document.getElementById("dimension-rotation");

  let w = 0, h = 0, dpr = 1;
  let yaw = 0.42, pitch = -0.32;
  let autoRotate = true;
  let dragging = false;
  let lastX = 0, lastY = 0;
  let lastFrame = 0;
  let elapsed = 0;

  const R = 2.35;
  const WIDTH = 0.53;
  const ROWS = 120;
  const COLS = 16;
  const TAU = Math.PI * 2;

  // Precompute the geometry once.
  const geometry = [];

  function mobius(u, v) {
    const a = u / 2;
    const r = R + v * Math.cos(a);

    return [
      r * Math.cos(u),
      v * Math.sin(a),
      r * Math.sin(u)
    ];
  }

  for (let i = 0; i <= ROWS; i++) {
    const row = [];
    const u = TAU * i / ROWS;

    for (let j = 0; j <= COLS; j++) {
      const v = -WIDTH + 2 * WIDTH * j / COLS;
      row.push(mobius(u, v));
    }

    geometry.push(row);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();

    w = rect.width;
    h = rect.height;
    dpr = Math.min(devicePixelRatio || 1, 1.5);

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function project(p) {
    const [x, y, z] = p;

    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);

    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const y1 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;

    const scale = Math.min(w, h) * 1.45 / (8.8 - z2);

    return {
      x: w * 0.5 + x1 * scale,
      y: h * 0.45 - y1 * scale,
      z: z2
    };
  }

  function projectGeometry() {
    return geometry.map(row => row.map(project));
  }

  // Soft background illumination.
  function drawAtmosphere() {
    const g = ctx.createRadialGradient(
      w * 0.5, h * 0.47, 0,
      w * 0.5, h * 0.47, Math.min(w, h) * 0.5
    );

    g.addColorStop(0, "rgba(90,170,225,0.13)");
    g.addColorStop(0.55, "rgba(50,120,180,0.045)");
    g.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Each surface cell receives a softly changing
  // blue colour and a travelling illuminated band.
  function drawSurface(points) {
    const faces = [];
    const phase = elapsed * 0.00024;

    for (let i = 0; i < ROWS; i++) {
      for (let j = 0; j < COLS; j++) {
        const a = points[i][j];
        const b = points[i + 1][j];
        const c = points[i + 1][j + 1];
        const d = points[i][j + 1];

        const u = (i + 0.5) / ROWS;
        const v = (j + 0.5) / COLS;

        // Light moves diagonally through parameter space.
        // The wrap-aware distance keeps the animation continuous.
        const position = (u + 0.34 * v - phase) % 1;
        const wrapped = ((position % 1) + 1) % 1;
        const distance = Math.min(wrapped, 1 - wrapped);

        const intensity = Math.exp(
          -(distance * distance) / (2 * 0.025 * 0.025)
        );

        faces.push({
          corners: [a, b, c, d],
          depth: (a.z + b.z + c.z + d.z) / 4,
          intensity
        });
      }
    }

    // Back-to-front rendering for transparency.
    faces.sort((a, b) => a.depth - b.depth);

    for (const face of faces) {
      const light = face.intensity;
      const depth = face.depth;

      const alpha = Math.min(
        0.39,
        0.075 + (depth + 3) * 0.025 + light * 0.19
      );

      const red = Math.round(110 + light * 110);
      const green = Math.round(175 + light * 65);
      const blue = 245;

      ctx.beginPath();
      ctx.moveTo(face.corners[0].x, face.corners[0].y);

      for (let k = 1; k < 4; k++) {
        ctx.lineTo(face.corners[k].x, face.corners[k].y);
      }

      ctx.closePath();
      ctx.fillStyle =
        `rgba(${red},${green},${blue},${alpha})`;

      ctx.fill();
    }
  }

  // Mathematical wire grid.
  function drawGrid(points) {
    const back = new Path2D();
    const middle = new Path2D();
    const front = new Path2D();

    function add(a, b) {
      const depth = (a.z + b.z) * 0.5;
      const path = depth > 0.7
        ? front
        : depth > -1.2
          ? middle
          : back;

      path.moveTo(a.x, a.y);
      path.lineTo(b.x, b.y);
    }

    for (let i = 0; i < ROWS; i++) {
      for (let j = 0; j <= COLS; j++) {
        add(points[i][j], points[i + 1][j]);
      }
    }

    for (let i = 0; i < ROWS; i += 2) {
      for (let j = 0; j < COLS; j++) {
        add(points[i][j], points[i][j + 1]);
      }
    }

    ctx.lineWidth = 0.5;
    ctx.strokeStyle = "rgba(130,190,225,0.18)";
    ctx.stroke(back);

    ctx.lineWidth = 0.65;
    ctx.strokeStyle = "rgba(170,215,245,0.38)";
    ctx.stroke(middle);

    ctx.lineWidth = 0.75;
    ctx.strokeStyle = "rgba(215,240,255,0.62)";
    ctx.stroke(front);
  }

  // Continuous illuminated Möbius boundary.
  function drawEdges(points) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const j of [0, COLS]) {
      ctx.beginPath();

      for (let i = 0; i <= ROWS; i++) {
        const p = points[i][j];

        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }

      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "rgba(80,170,235,0.16)";
      ctx.stroke();

      ctx.lineWidth = 1.05;
      ctx.strokeStyle = "rgba(205,240,255,0.75)";
      ctx.stroke();
    }

    ctx.restore();
  }

  // Animated light streak following the Möbius surface.
  // It is evaluated in 3D, not as a screen-space overlay.
  function drawFlowLine() {
    const phase = (elapsed * 0.00024) % 1;
    const segmentCount = 60;
    const trailLength = 0.16;

    const projected = [];

    for (let i = 0; i <= segmentCount; i++) {
      const t = i / segmentCount;
      const uNorm = (phase + t * trailLength) % 1;

      // Diagonal surface path. The end of the strip
      // is identified with its opposite-width edge.
      const u = uNorm * TAU;
      const v = WIDTH * 0.58 *
        Math.sin(uNorm * Math.PI * 2 + phase * Math.PI);

      projected.push(project(mobius(u, v)));
    }

    // Render in short segments for a smooth light tail.
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 1; i < projected.length; i++) {
      const a = projected[i - 1];
      const b = projected[i];

      // Do not connect across the parameter seam.
      if (Math.hypot(b.x - a.x, b.y - a.y) > 35) {
        continue;
      }

      const t = i / projected.length;
      const envelope = Math.sin(Math.PI * t);
      const depthFactor = Math.max(
        0.35,
        Math.min(1, (a.z + 3) / 5)
      );

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);

      ctx.lineWidth = 2.3 * envelope + 0.3;
      ctx.strokeStyle =
        `rgba(205,243,255,${envelope * depthFactor * 0.95})`;

      ctx.shadowColor = "rgba(75,185,255,0.8)";
      ctx.shadowBlur = 7;
      ctx.stroke();
    }

    ctx.restore();
  }

  // X/Y axes shown only while dragging.
  function drawAxes() {
    if (!dragging) return;

    const origin = project([0, 0, 0]);
    const axes = [
      [project([1.6, 0, 0]), "X"],
      [project([0, 1.6, 0]), "Y"]
    ];

    ctx.save();
    ctx.strokeStyle = "rgba(225,246,255,0.85)";
    ctx.fillStyle = "#e9f8ff";
    ctx.lineWidth = 1.3;
    ctx.font = "600 16px Manrope, sans-serif";

    for (const [end, label] of axes) {
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      ctx.fillText(label, end.x + 10, end.y - 8);
    }

    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, w, h);

    drawAtmosphere();

    const points = projectGeometry();

    drawSurface(points);
    drawGrid(points);
    drawEdges(points);
    drawFlowLine();
    drawAxes();

    const degrees =
      ((yaw * 180 / Math.PI) % 360 + 360) % 360;

    rotationValue.textContent = degrees.toFixed(1) + "°";
  }

  function animate(timestamp) {
    const delta = lastFrame
      ? Math.min(timestamp - lastFrame, 40)
      : 16;

    lastFrame = timestamp;
    elapsed += delta;

    if (autoRotate && !dragging) {
      yaw += delta * 0.00016;
    }

    render();
    requestAnimationFrame(animate);
  }

  // Mouse and touch interaction.
  canvas.addEventListener("pointerdown", e => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;

    canvas.setPointerCapture(e.pointerId);
    display.classList.add("is-dragging");
  });

  canvas.addEventListener("pointermove", e => {
    if (!dragging) return;

    yaw += (e.clientX - lastX) * 0.007;

    pitch = Math.max(
      -1.25,
      Math.min(
        1.25,
        pitch + (e.clientY - lastY) * 0.007
      )
    );

    lastX = e.clientX;
    lastY = e.clientY;
  });

  function stopDrag() {
    dragging = false;
    display.classList.remove("is-dragging");
  }

  canvas.addEventListener("pointerup", stopDrag);
  canvas.addEventListener("pointercancel", stopDrag);
  canvas.addEventListener("lostpointercapture", stopDrag);

  rotationButton.addEventListener("click", () => {
    autoRotate = !autoRotate;

    rotationButton.setAttribute(
      "aria-pressed",
      String(autoRotate)
    );

    rotationButton.querySelector(".pause-symbol").textContent =
      autoRotate ? "Ⅱ" : "▶";
  });

  window.addEventListener("resize", resize);

  resize();
  requestAnimationFrame(animate);
})();
