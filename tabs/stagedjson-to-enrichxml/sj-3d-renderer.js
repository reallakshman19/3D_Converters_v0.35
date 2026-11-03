/**
 * Functionality: pure functions to project and render a 3D orthographic scene
 * on a HTML Canvas. Includes depth-sorting, grids, and axis compass.
 * Parameters: explicit. Outputs: canvas drawing. No side effects.
 */

/**
 * Projects a 3D coordinate point onto a 2D screen coordinate.
 */
export function projectPoint(x, y, z, config) {
  const {
    centerX, centerY, centerZ,
    theta, phi, scale,
    offsetX, offsetY,
    canvasWidth, canvasHeight, maxDim
  } = config;

  // Center the coordinates
  const dx = x - centerX;
  const dy = y - centerY;
  const dz = z - centerZ;

  // Rotate around Z axis (theta)
  const x1 = dx * Math.cos(theta) - dy * Math.sin(theta);
  const y1 = dx * Math.sin(theta) + dy * Math.cos(theta);
  const z1 = dz;

  // Rotate around X axis (phi)
  const x2 = x1;
  const y2 = y1 * Math.cos(phi) - z1 * Math.sin(phi);
  const z2 = y1 * Math.sin(phi) + z1 * Math.cos(phi);

  // Apply scale and offsets
  const baseDim = Math.min(canvasWidth, canvasHeight) || 400;
  const wScale = (baseDim * 0.7) / maxDim * scale;
  const screenX = canvasWidth / 2 + x2 * wScale + offsetX;
  const screenY = canvasHeight / 2 - y2 * wScale + offsetY;

  return { x: screenX, y: screenY, depth: z2 };
}

/**
 * Draws the 3D axis compass in the corner of the canvas.
 */
export function drawCompass(ctx, theta, phi, cx, cy) {
  const axes = [
    { name: 'X', dx: 30, dy: 0, dz: 0, color: '#ef4444' }, // Red
    { name: 'Y', dx: 0, dy: 30, dz: 0, color: '#22c55e' }, // Green
    { name: 'Z', dx: 0, dy: 0, dz: 30, color: '#3b82f6' }  // Blue
  ];

  // Rotate coordinates manually
  const rotated = axes.map(a => {
    const x1 = a.dx * Math.cos(theta) - a.dy * Math.sin(theta);
    const y1 = a.dx * Math.sin(theta) + a.dy * Math.cos(theta);
    const z1 = a.dz;

    const x2 = x1;
    const y2 = y1 * Math.cos(phi) - z1 * Math.sin(phi);
    const z2 = y1 * Math.sin(phi) + z1 * Math.cos(phi);

    return { name: a.name, x: cx + x2, y: cy - y2, color: a.color, depth: z2 };
  });

  // Sort axes back-to-front
  rotated.sort((a, b) => a.depth - b.depth);

  ctx.save();
  rotated.forEach(r => {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(r.x, r.y);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = r.color;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(r.name, r.x + (r.x > cx ? 8 : -8), r.y + (r.y > cy ? 8 : -8));
  });
  ctx.restore();
}

/**
 * Draws the 3D scene (grid, lines, nodes) using depth-sorting.
 */
export function draw3dScene(ctx, canvas, nodes, segments, config) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Draw spatial floor grid at Z = minZ
  ctx.save();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.07)';
  ctx.lineWidth = 1;
  const gridStep = config.maxDim / 8;
  
  // Horizontal grid lines
  for (let gx = config.minX; gx <= config.maxX + 0.1; gx += gridStep) {
    const p1 = projectPoint(gx, config.minY, config.minZ, config);
    const p2 = projectPoint(gx, config.maxY, config.minZ, config);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  // Vertical grid lines
  for (let gy = config.minY; gy <= config.maxY + 0.1; gy += gridStep) {
    const p1 = projectPoint(config.minX, gy, config.minZ, config);
    const p2 = projectPoint(config.maxX, gy, config.minZ, config);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  ctx.restore();

  // 2. Project all node points
  nodes.forEach(n => {
    const proj = projectPoint(n.x, n.y, n.z, config);
    n.screenX = proj.x;
    n.screenY = proj.y;
    n.depth = proj.depth;
  });

  // 3. Assemble render items (painter's algorithm)
  const renderables = [];

  for (const segment of segments) {
    const n1 = projectPoint(segment.start.x, segment.start.y, segment.start.z, config);
    const n2 = projectPoint(segment.end.x, segment.end.y, segment.end.z, config);
    renderables.push({
      type: 'segment',
      depth: (n1.depth + n2.depth) / 2,
      n1: { screenX: n1.x, screenY: n1.y },
      n2: { screenX: n2.x, screenY: n2.y },
    });
  }

  nodes.forEach(n => {
    renderables.push({
      type: 'node',
      depth: n.depth,
      node: n
    });
  });

  // Sort back-to-front
  renderables.sort((a, b) => a.depth - b.depth);

  // 4. Render back-to-front
  renderables.forEach(item => {
    if (item.type === 'segment') {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(item.n1.screenX, item.n1.screenY);
      ctx.lineTo(item.n2.screenX, item.n2.screenY);
      
      // High-quality lines
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#38bdf8'; // sky blue
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.restore();
    } else if (item.type === 'node') {
      const n = item.node;
      ctx.save();
      ctx.beginPath();

      let radius = 6;
      let color = '#cbd5e1'; // grey
      
      if (n.type === 'VALV') {
        radius = 8;
        color = '#facc15'; // yellow
      } else if (n.type === 'ATTA' || n.type === 'SUPPORT') {
        radius = 7;
        color = '#4ade80'; // bright green
      } else if (n.type === 'ELBO' || n.type === 'BEND') {
        radius = 5.5;
        color = '#60a5fa'; // neon blue
      }

      const isHovered = (n === config.hoveredNode);
      if (isHovered) {
        radius += 3.5;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        // Glow effect
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 10;
      } else {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.2;
      }

      ctx.arc(n.screenX, n.screenY, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.stroke();

      if (isHovered) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 0;
        ctx.fillText(n.type, n.screenX, n.screenY - radius - 5);
      }
      ctx.restore();
    }
  });

  // 5. Draw orientation compass overlay in bottom left corner
  drawCompass(ctx, config.theta, config.phi, 50, canvas.height - 50);
}
