import { IText } from 'fabric';

const originalRender = IText.prototype._render;
const originalSetControlsVisibility = IText.prototype.setControlsVisibility;
const PATCH_FLAG = Symbol.for('martinpel.name-label-text');

function hexToRgb(value) {
  const hex = String(value || '').trim().replace('#', '');
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) return null;
  const normalized = hex.length === 3
    ? hex.split('').map((char) => `${char}${char}`).join('')
    : hex;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function isLightColor(value) {
  const rgb = hexToRgb(value);
  if (!rgb) return false;
  const luminance = ((0.299 * rgb.r) + (0.587 * rgb.g) + (0.114 * rgb.b)) / 255;
  return luminance >= 0.67;
}

if (!IText.prototype[PATCH_FLAG]) {
  IText.prototype[PATCH_FLAG] = true;

  IText.prototype.setControlsVisibility = function setNameLabelControlsVisibility(options = {}) {
    const visibility = this.textId
      ? { ...options, ml: true, mr: true, mt: true, mb: true }
      : options;

    return originalSetControlsVisibility.call(this, visibility);
  };

  IText.prototype._render = function renderNameLabel(ctx) {
    if (this.textId) {
      const width = Number(this.width) || 0;
      const height = Number(this.height) || 0;
      const fontSize = Number(this.fontSize) || 56;
      const padX = Math.max(12, fontSize * 0.3);
      const padY = Math.max(7, fontSize * 0.14);
      const left = -(width / 2) - padX;
      const top = -(height / 2) - padY;
      const labelWidth = width + (padX * 2);
      const labelHeight = height + (padY * 2);
      const backgroundColor = this.labelBackgroundColor || (isLightColor(this.fill) ? '#111827' : '#ffffff');
      const lightBackground = isLightColor(backgroundColor);

      ctx.save();
      ctx.fillStyle = backgroundColor;
      ctx.strokeStyle = lightBackground ? 'rgba(15,23,42,0.78)' : 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1.5, fontSize * 0.035);
      ctx.fillRect(left, top, labelWidth, labelHeight);
      ctx.strokeRect(left, top, labelWidth, labelHeight);
      ctx.restore();
    }

    return originalRender.call(this, ctx);
  };
}
