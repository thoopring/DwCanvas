// CleanShot — Slide Template Engine
// Each template exports: render(slide, ctx, canvas) → void
// Slide types: 'cover', 'hook', 'content', 'cta', 'end'

const SIZE = 1080;

function wrapText(ctx, text, maxWidth, lineHeight) {
  const words = (text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, align = 'left') {
  const lines = wrapText(ctx, text, maxWidth, lineHeight);
  ctx.textAlign = align;
  lines.forEach((line, i) => {
    ctx.fillText(line, x, y + i * lineHeight);
  });
  return lines.length * lineHeight;
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawAvatar(ctx, img, x, y, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) ctx.drawImage(img, x, y, size, size);
  ctx.restore();
}

// ─────────────────────────────────────────────────────────
// TEMPLATE 1: Minimal Dark
// ─────────────────────────────────────────────────────────
async function renderMinimalDark(slide, idx, total, brand) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  // Background
  const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  grad.addColorStop(0, '#0f0f0f');
  grad.addColorStop(1, '#1a1a1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Brand accent line
  ctx.fillStyle = brand.color;
  ctx.fillRect(0, 0, 8, SIZE);

  if (slide.type === 'cover') {
    // Cover: video title + accent label
    ctx.fillStyle = brand.color;
    ctx.font = '700 24px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('BREAKDOWN', 60, 90);

    ctx.fillStyle = '#f1f1f1';
    ctx.font = '800 60px Inter, sans-serif';
    ctx.textBaseline = 'top';
    const titleHeight = drawWrappedText(ctx, slide.title || 'LinkedIn Carousel', 60, 180, SIZE - 120, 76);

    ctx.fillStyle = '#717171';
    ctx.font = '500 28px Inter, sans-serif';
    ctx.fillText('Swipe →', 60, SIZE - 120);
  } else if (slide.type === 'end') {
    // End: CTA + profile
    ctx.fillStyle = '#f1f1f1';
    ctx.font = '800 56px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    drawWrappedText(ctx, slide.text, 60, 200, SIZE - 120, 72);

    // Profile block
    if (brand.avatarImg) {
      drawAvatar(ctx, brand.avatarImg, 60, SIZE - 200, 80);
    }
    ctx.fillStyle = '#f1f1f1';
    ctx.font = '700 26px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(brand.name || 'You', brand.avatarImg ? 160 : 60, SIZE - 160);

    if (brand.handle) {
      ctx.fillStyle = brand.color;
      ctx.font = '500 22px Inter, sans-serif';
      ctx.fillText(brand.handle, brand.avatarImg ? 160 : 60, SIZE - 125);
    }
  } else {
    // Hook / Content / CTA
    const isHook = slide.type === 'hook';
    const fontSize = isHook ? 60 : 42;
    const lineHeight = isHook ? 76 : 58;

    ctx.fillStyle = brand.color;
    ctx.font = '700 20px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(slide.label.toUpperCase(), 60, 80);

    ctx.fillStyle = '#717171';
    ctx.textAlign = 'right';
    ctx.fillText(`${idx} / ${total}`, SIZE - 60, 80);

    // Main text (vertically centered)
    ctx.fillStyle = '#f1f1f1';
    ctx.font = `${isHook ? 800 : 600} ${fontSize}px Inter, sans-serif`;
    ctx.textAlign = 'left';
    const maxW = SIZE - 120;
    const lines = wrapText(ctx, slide.text, maxW, lineHeight);
    const totalH = lines.length * lineHeight;
    const startY = (SIZE - totalH) / 2;
    lines.forEach((line, i) => ctx.fillText(line, 60, startY + i * lineHeight));

    // Swipe cue (except CTA)
    if (slide.type !== 'cta') {
      ctx.fillStyle = brand.color;
      ctx.font = '600 22px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('Swipe →', SIZE - 60, SIZE - 60);
    }
  }

  // Footer brand
  ctx.fillStyle = '#717171';
  ctx.font = '600 18px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('CleanShot', 60, SIZE - 40);

  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
}

// ─────────────────────────────────────────────────────────
// TEMPLATE 2: Editorial Bold (black + yellow)
// ─────────────────────────────────────────────────────────
async function renderEditorialBold(slide, idx, total, brand) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  const YELLOW = '#FDE047';
  const BLACK = '#0a0a0a';

  // Background
  ctx.fillStyle = BLACK;
  ctx.fillRect(0, 0, SIZE, SIZE);

  if (slide.type === 'cover' || slide.type === 'hook') {
    // Full yellow block
    ctx.fillStyle = YELLOW;
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.fillStyle = BLACK;
    ctx.font = '900 24px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(slide.type === 'cover' ? 'THE BREAKDOWN' : 'THE HOOK', 60, 80);

    ctx.fillStyle = BLACK;
    ctx.font = '900 72px Inter, sans-serif';
    const text = slide.type === 'cover' ? (slide.title || 'LinkedIn Carousel') : slide.text;
    const lines = wrapText(ctx, text, SIZE - 120, 88);
    const totalH = lines.length * 88;
    const startY = (SIZE - totalH) / 2 - 20;
    lines.forEach((line, i) => ctx.fillText(line, 60, startY + i * 88));

    ctx.font = '800 22px Inter, sans-serif';
    ctx.fillText('KEEP SCROLLING ↓', 60, SIZE - 80);
  } else if (slide.type === 'end') {
    // End slide with profile
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Big yellow accent at top
    ctx.fillStyle = YELLOW;
    ctx.fillRect(60, 60, 120, 8);

    ctx.fillStyle = '#fff';
    ctx.font = '900 56px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    drawWrappedText(ctx, slide.text, 60, 140, SIZE - 120, 72);

    // Profile bottom
    if (brand.avatarImg) drawAvatar(ctx, brand.avatarImg, 60, SIZE - 220, 90);

    ctx.fillStyle = '#fff';
    ctx.font = '800 30px Inter, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(brand.name || 'You', brand.avatarImg ? 170 : 60, SIZE - 175);
    if (brand.handle) {
      ctx.fillStyle = YELLOW;
      ctx.font = '700 24px Inter, sans-serif';
      ctx.fillText(brand.handle, brand.avatarImg ? 170 : 60, SIZE - 140);
    }
  } else {
    // Content / CTA slides
    // Yellow accent stripe on top
    ctx.fillStyle = YELLOW;
    ctx.fillRect(60, 60, 60, 6);

    // Number
    ctx.fillStyle = YELLOW;
    ctx.font = '900 24px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${String(idx).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, 60, 100);

    // Label
    ctx.fillStyle = YELLOW;
    ctx.font = '700 20px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(slide.label.toUpperCase(), SIZE - 60, 100);

    // Main text
    ctx.fillStyle = '#fff';
    ctx.font = '800 44px Inter, sans-serif';
    ctx.textAlign = 'left';
    const lines = wrapText(ctx, slide.text, SIZE - 120, 60);
    const totalH = lines.length * 60;
    const startY = (SIZE - totalH) / 2;
    lines.forEach((line, i) => ctx.fillText(line, 60, startY + i * 60));

    // Swipe cue
    if (slide.type !== 'cta') {
      ctx.fillStyle = YELLOW;
      ctx.font = '800 22px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('SWIPE →', SIZE - 60, SIZE - 60);
    }
  }

  ctx.fillStyle = slide.type === 'cover' || slide.type === 'hook' ? BLACK : YELLOW;
  ctx.font = '700 16px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('CleanShot', 60, SIZE - 30);

  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
}

// ─────────────────────────────────────────────────────────
// TEMPLATE 3: Clean Light
// ─────────────────────────────────────────────────────────
async function renderCleanLight(slide, idx, total, brand) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#FAFAF7';
  ctx.fillRect(0, 0, SIZE, SIZE);

  if (slide.type === 'cover') {
    // Centered cover
    ctx.fillStyle = brand.color;
    ctx.font = '600 22px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('— A carousel by ' + (brand.name || 'CleanShot'), SIZE / 2, 140);

    ctx.fillStyle = '#0a0a0a';
    ctx.font = 'italic 800 64px Georgia, serif';
    const lines = wrapText(ctx, slide.title || 'LinkedIn Carousel', SIZE - 200, 80);
    const totalH = lines.length * 80;
    const startY = (SIZE - totalH) / 2;
    lines.forEach((line, i) => ctx.fillText(line, SIZE / 2, startY + i * 80));

    ctx.fillStyle = '#666';
    ctx.font = '500 24px Georgia, serif';
    ctx.fillText('Swipe to read →', SIZE / 2, SIZE - 120);
  } else if (slide.type === 'end') {
    // End with big profile
    if (brand.avatarImg) drawAvatar(ctx, brand.avatarImg, (SIZE - 140) / 2, 180, 140);

    ctx.fillStyle = '#0a0a0a';
    ctx.font = '700 36px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(brand.name || 'You', SIZE / 2, 350);

    if (brand.handle) {
      ctx.fillStyle = brand.color;
      ctx.font = '500 24px Inter, sans-serif';
      ctx.fillText(brand.handle, SIZE / 2, 400);
    }

    // CTA text
    ctx.fillStyle = '#0a0a0a';
    ctx.font = 'italic 700 44px Georgia, serif';
    ctx.textAlign = 'center';
    drawWrappedText(ctx, slide.text, SIZE / 2, 480, SIZE - 200, 60, 'center');
  } else {
    const isHook = slide.type === 'hook';

    // Number top left
    ctx.fillStyle = '#a8a8a8';
    ctx.font = '500 20px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${idx} / ${total}`, 60, 80);

    // Label
    ctx.fillStyle = brand.color;
    ctx.font = '700 20px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(slide.label.toUpperCase(), SIZE - 60, 80);

    // Main text — serif italic for editorial feel
    ctx.fillStyle = '#0a0a0a';
    ctx.font = isHook ? 'italic 800 60px Georgia, serif' : '600 40px Georgia, serif';
    ctx.textAlign = 'left';
    const lineHeight = isHook ? 78 : 56;
    const lines = wrapText(ctx, slide.text, SIZE - 120, lineHeight);
    const totalH = lines.length * lineHeight;
    const startY = (SIZE - totalH) / 2;
    lines.forEach((line, i) => ctx.fillText(line, 60, startY + i * lineHeight));

    // Swipe
    if (slide.type !== 'cta') {
      ctx.fillStyle = brand.color;
      ctx.font = '600 20px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('Swipe →', SIZE - 60, SIZE - 60);
    }
  }

  // Footer
  ctx.fillStyle = '#a8a8a8';
  ctx.font = '500 16px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('CleanShot', 60, SIZE - 30);

  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
}

// ─────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────
window.CleanShotTemplates = {
  async renderSlide(templateId, slide, idx, total, brand) {
    switch (templateId) {
      case 'editorial_bold': return renderEditorialBold(slide, idx, total, brand);
      case 'clean_light':    return renderCleanLight(slide, idx, total, brand);
      default:               return renderMinimalDark(slide, idx, total, brand);
    }
  },
  async loadAvatar(url) {
    if (!url) return null;
    try { return await loadImage(url); } catch { return null; }
  },
  buildSlides(carousel, videoTitle) {
    const slides = [];
    slides.push({ type: 'cover', title: videoTitle, label: 'COVER', text: videoTitle });
    slides.push({ type: 'hook',  label: 'HOOK',  text: carousel.hook });
    carousel.slides.forEach((s, i) => {
      slides.push({ type: 'content', label: `SLIDE ${i + 1}`, text: s.body });
    });
    slides.push({ type: 'cta', label: 'CTA', text: carousel.cta });
    slides.push({ type: 'end', label: 'END', text: 'Follow for more breakdowns like this.' });
    return slides;
  },
  getTemplates() {
    return [
      { id: 'minimal_dark',    name: 'Minimal Dark' },
      { id: 'editorial_bold',  name: 'Editorial Bold' },
      { id: 'clean_light',     name: 'Clean Light' },
    ];
  },
};
