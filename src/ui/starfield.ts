export function initStarfield() {
  const canvas = document.querySelector<HTMLCanvasElement>("#starfield");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let width = 0;
  let height = 0;
  let baseWidth = 0;
  let baseHeight = 0;
  let stars: Star[] = [];
  let resizeFrame: number | null = null;
  let pendingWidth = 0;
  let pendingHeight = 0;

  const readCanvasSize = () => {
    const nextWidth = Math.round(canvas.clientWidth);
    const nextHeight = Math.round(canvas.clientHeight);
    if (nextWidth <= 0 || nextHeight <= 0) {
      return;
    }
    pendingWidth = nextWidth;
    pendingHeight = nextHeight;
  };

  const updateCanvasSize = () => {
    if (pendingWidth <= 0 || pendingHeight <= 0) {
      return;
    }
    if (pendingWidth === width && pendingHeight === height) {
      return;
    }
    width = pendingWidth;
    height = pendingHeight;
    const scale = devicePixelRatio || 1;
    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  };

  const ensureBaseSize = () => {
    if (baseWidth > 0 && baseHeight > 0) {
      return;
    }
    const screenWidth = window.screen?.width ?? window.innerWidth;
    const screenHeight = window.screen?.height ?? window.innerHeight;
    baseWidth = Math.max(screenWidth, window.innerWidth);
    baseHeight = Math.max(screenHeight, window.innerHeight);
  };

  const updateStarCount = () => {
    ensureBaseSize();
    const targetCount = Math.floor((baseWidth * baseHeight) / 12000);
    if (stars.length === 0) {
      stars = Array.from({ length: targetCount }, () => createStar(baseWidth, baseHeight));
    } else {
      if (stars.length < targetCount) {
        stars.push(
          ...Array.from({ length: targetCount - stars.length }, () =>
            createStar(baseWidth, baseHeight)
          )
        );
      } else if (stars.length > targetCount) {
        stars = stars.slice(0, targetCount);
      }
    }
  };

  const handleResize = () => {
    readCanvasSize();
    updateCanvasSize();
  };

  const render = () => {
    ctx.clearRect(0, 0, width, height);
    const now = performance.now();
    const shouldTwinkle = !prefersReducedMotion.matches && (!isResizing || now - lastResizeAt > 240);
    for (const star of stars) {
      if (shouldTwinkle) {
        star.twinkle += star.speed;
      }
      const glow = 0.55 + Math.sin(star.twinkle) * 0.45;
      const x = star.x;
      const y = star.y;
      if (x < 0 || x > width || y < 0 || y > height) {
        continue;
      }
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
  updateStarCount();
  render();
  const resizeObserver = new ResizeObserver(() => {
    readCanvasSize();
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
    speed: Math.random() * 0.035 + 0.01,
  };
}
