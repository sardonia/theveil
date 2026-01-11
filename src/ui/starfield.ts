export function initStarfield() {
  const canvas = document.querySelector<HTMLCanvasElement>("#starfield");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let width = 0;
  let height = 0;
  let stars: Star[] = [];
  let resizeFrame: number | null = null;
  let resizeIdleHandle: number | null = null;

  const updateCanvasSize = () => {
    const nextWidth = canvas.clientWidth;
    const nextHeight = canvas.clientHeight;
    if (nextWidth === 0 || nextHeight === 0) {
      return;
    }
    width = nextWidth;
    height = nextHeight;
    const scale = devicePixelRatio || 1;
    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  };

  const updateStarCount = () => {
    const targetCount = Math.floor((width * height) / 12000);
    if (stars.length === 0) {
      stars = Array.from({ length: targetCount }, () => createStar());
    } else {
      if (stars.length < targetCount) {
        stars.push(
          ...Array.from({ length: targetCount - stars.length }, () => createStar())
        );
      } else if (stars.length > targetCount) {
        stars = stars.slice(0, targetCount);
      }
    }
  };

  const handleResize = () => {
    updateCanvasSize();
    if (stars.length === 0) {
      updateStarCount();
    }
    if (resizeIdleHandle) {
      window.clearTimeout(resizeIdleHandle);
    }
    resizeIdleHandle = window.setTimeout(() => {
      updateStarCount();
      resizeIdleHandle = null;
    }, 240);
  };

  const render = () => {
    ctx.clearRect(0, 0, width, height);
    for (const star of stars) {
      if (!prefersReducedMotion.matches) {
        star.twinkle += star.speed;
      }
      const glow = 0.5 + Math.sin(star.twinkle) * 0.5;
      const x = star.x * width;
      const y = star.y * height;
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha * glow})`;
      ctx.arc(x, y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!prefersReducedMotion.matches) {
      requestAnimationFrame(render);
    }
  };

  handleResize();
  render();
  const resizeObserver = new ResizeObserver(() => {
    if (resizeFrame) {
      cancelAnimationFrame(resizeFrame);
    }
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      handleResize();
    });
  });
  resizeObserver.observe(canvas.parentElement ?? canvas);
}

interface Star {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  twinkle: number;
  speed: number;
}

function createStar(): Star {
  return {
    x: Math.random(),
    y: Math.random(),
    radius: Math.random() * 1.6 + 0.2,
    alpha: Math.random() * 0.8 + 0.2,
    twinkle: Math.random() * Math.PI * 2,
    speed: Math.random() * 0.02 + 0.005,
  };
}
