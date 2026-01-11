export function initStarfield() {
  const canvas = document.querySelector<HTMLCanvasElement>("#starfield");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let width = 0;
  let height = 0;
  let stars: Star[] = [];

  const resize = () => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const scale = devicePixelRatio || 1;
    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    stars = Array.from({ length: Math.floor((width * height) / 12000) }, () =>
      createStar(width, height)
    );
  };

  const render = () => {
    ctx.clearRect(0, 0, width, height);
    for (const star of stars) {
      if (!prefersReducedMotion.matches) {
        star.twinkle += star.speed;
      }
      const glow = 0.5 + Math.sin(star.twinkle) * 0.5;
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha * glow})`;
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!prefersReducedMotion.matches) {
      requestAnimationFrame(render);
    }
  };

  resize();
  render();
  window.addEventListener("resize", resize);
}

interface Star {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  twinkle: number;
  speed: number;
}

function createStar(width: number, height: number): Star {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    radius: Math.random() * 1.6 + 0.2,
    alpha: Math.random() * 0.8 + 0.2,
    twinkle: Math.random() * Math.PI * 2,
    speed: Math.random() * 0.02 + 0.005,
  };
}
