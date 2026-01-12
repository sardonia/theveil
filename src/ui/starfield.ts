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
  let resizeTimeout: number | null = null;
  let isResizing = false;
  let lastResizeAt = 0;

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
    const previousWidth = width;
    const previousHeight = height;
    width = pendingWidth;
    height = pendingHeight;
    const scale = devicePixelRatio || 1;
    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (previousWidth > 0 && previousHeight > 0) {
      resizeStarsToViewport(previousWidth, previousHeight);
    }
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
    const fieldWidth = width || baseWidth;
    const fieldHeight = height || baseHeight;
    if (stars.length === 0) {
      stars = Array.from({ length: targetCount }, () => createStar(fieldWidth, fieldHeight));
    } else {
      if (stars.length < targetCount) {
        stars.push(
          ...Array.from({ length: targetCount - stars.length }, () =>
            createStar(fieldWidth, fieldHeight)
          )
        );
      } else if (stars.length > targetCount) {
        stars = stars.slice(0, targetCount);
      }
    }
  };

  const resizeStarsToViewport = (previousWidth: number, previousHeight: number) => {
    if (!width || !height) return;
    const scaleX = width / previousWidth;
    const scaleY = height / previousHeight;
    stars = stars.map((star) => ({
      ...star,
      x: star.x * scaleX,
      y: star.y * scaleY,
    }));
  };

  const handleResize = () => {
    isResizing = true;
    lastResizeAt = performance.now();
    if (resizeTimeout) {
      window.clearTimeout(resizeTimeout);
    }
    resizeTimeout = window.setTimeout(() => {
      isResizing = false;
    }, 280);
    readCanvasSize();
    updateCanvasSize();
    updateStarCount();
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

  // Tauri on macOS uses WKWebView, whose available Web APIs depend on the
  // installed macOS / WebKit version. Some builds do not provide ResizeObserver.
  // If we reference it unguarded, it throws a ReferenceError and can break the
  // entire application initialization (which makes the "Reveal my reading"
  // button appear to do nothing).
  //
  // Prefer ResizeObserver when available (best behavior), otherwise fall back to
  // a window resize listener.
  if (typeof ResizeObserver !== "undefined") {
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
  } else {
    window.addEventListener("resize", handleResize);
  }
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
    speed: Math.random() * 0.035 + 0.01,
  };
}
