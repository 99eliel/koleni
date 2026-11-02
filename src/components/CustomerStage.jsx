import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Canvas, FabricImage, IText } from 'fabric';
import { getRegionAtPoint } from '../lib/geometry';
import { renderGarment } from '../lib/renderGarment';
import { recolorLogoSource } from '../lib/logoAppearance';

const DEFAULT_COLOR_TUNING = Object.freeze({ opacity: 82, saturation: 88, brightness: 96 });
const FULL_COLOR_TUNING = Object.freeze({ opacity: 100, saturation: 100, brightness: 100 });

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível carregar a imagem com segurança para exportação. Verifique o CORS do Cloud Storage.'));
    image.src = url;
  });
}

function loadDisplayImage(url) {
  return loadImage(url).catch(() => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível carregar a imagem da peça.'));
    image.src = url;
  }));
}

function dimensionsFor(image) {
  const ratio = Math.min(1, 1200 / image.naturalWidth);
  return {
    width: Math.round(image.naturalWidth * ratio),
    height: Math.round(image.naturalHeight * ratio),
  };
}

function randomId(prefix) {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

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

function textBackgroundColor(item) {
  return item.backgroundColor || (isLightColor(item.color) ? '#111827' : '#ffffff');
}

function tuneColorChoices(colorChoices, tuning) {
  return Object.fromEntries(
    Object.entries(colorChoices || {}).map(([regionId, choice]) => {
      if (choice && typeof choice === 'object' && typeof choice.color === 'string') {
        return [regionId, {
          ...choice,
          opacity: tuning.opacity,
          saturation: tuning.saturation,
          brightness: tuning.brightness,
        }];
      }
      return [regionId, {
        color: choice,
        opacity: tuning.opacity,
        saturation: tuning.saturation,
        brightness: tuning.brightness,
      }];
    }),
  );
}

function HarmonySlider({ label, value, min, max, onChange }) {
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '92px minmax(0,1fr) 44px', alignItems: 'center', gap: 10, fontSize: '.76rem', fontWeight: 800, color: '#40566c' }}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ width: '100%', accentColor: '#0b5d92', cursor: 'pointer' }}
      />
      <strong style={{ textAlign: 'right', color: '#0b5d92', fontSize: '.72rem' }}>{value}%</strong>
    </label>
  );
}

const CustomerStage = forwardRef(function CustomerStage({
  garment,
  view,
  colorChoices,
  onRegionClick,
  onLogosChange,
  onTextsChange,
  onHistoryAction,
}, ref) {
  const baseRef = useRef(null);
  const fabricElementRef = useRef(null);
  const fabricRef = useRef(null);
  const imagesRef = useRef({});
  const currentViewRef = useRef(view);
  const historyRef = useRef({ entries: [[]], index: 0, restoring: false });
  const [colorTuning, setColorTuning] = useState(DEFAULT_COLOR_TUNING);

  const tunedChoices = tuneColorChoices(colorChoices, colorTuning);
  const hasCustomColors = Object.keys(colorChoices || {}).length > 0;

  function serializeLogo(object) {
    return {
      id: object.logoId,
      type: 'logo',
      storageUrl: object.storageUrl,
      sourceUrl: object.sourceUrl || object.storageUrl,
      sourceName: object.sourceName || '',
      sourceType: object.sourceType || 'image',
      sourcePage: object.sourcePage || 1,
      sourcePageCount: object.sourcePageCount || 1,
      originalUrl: object.originalUrl || object.sourceUrl || object.storageUrl,
      processedUrl: object.processedUrl || '',
      backgroundRemoved: Boolean(object.backgroundRemoved),
      logoColorMode: object.logoColorMode || 'original',
      logoColor: object.logoColor || '#111827',
      logoOpacity: Number.isFinite(object.logoOpacity) ? object.logoOpacity : 100,
      position: {
        x: object.normX,
        y: object.normY,
        scale: object.normScale,
        rotation: object.angle ?? 0,
        view: object.designView,
      },
    };
  }

  function serializeText(object) {
    return {
      id: object.textId,
      type: 'text',
      text: object.text || '',
      color: object.fill || '#111827',
      backgroundColor: object.labelBackgroundColor || '',
      fontFamily: object.fontFamily || 'Arial',
      fontWeight: object.fontWeight || '700',
      fontStyle: object.fontStyle || 'normal',
      fontSize: Number(object.fontSize) || 56,
      position: {
        x: object.normX,
        y: object.normY,
        scale: object.normScale,
        rotation: object.angle ?? 0,
        view: object.designView,
      },
    };
  }

  function designObjects() {
    const canvas = fabricRef.current;
    return canvas ? canvas.getObjects().filter((object) => object.logoId || object.textId) : [];
  }

  function snapshotObjects() {
    return designObjects().map((object) => (object.logoId ? serializeLogo(object) : serializeText(object)));
  }

  function notifyDesign() {
    const objects = designObjects();
    onLogosChange?.(objects.filter((object) => object.logoId).map(serializeLogo));
    onTextsChange?.(objects.filter((object) => object.textId).map(serializeText));
  }

  function commitHistory() {
    const history = historyRef.current;
    if (history.restoring) return;
    const snapshot = snapshotObjects();
    history.entries = history.entries.slice(0, history.index + 1);
    history.entries.push(snapshot);
    history.index = history.entries.length - 1;
    onHistoryAction?.('stage');
  }

  function captureObject(object, shouldCommit = false) {
    const canvas = fabricRef.current;
    if (!canvas || !(object?.logoId || object?.textId)) return;
    const width = canvas.getWidth();
    const height = canvas.getHeight();
    object.normX = (object.left ?? 0) / width;
    object.normY = (object.top ?? 0) / height;
    object.normScale = object.getScaledWidth() / width;
    notifyDesign();
    if (shouldCommit) commitHistory();
  }

  function layoutObjects(targetView, width, height) {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.discardActiveObject();
    designObjects().forEach((object) => {
      const visible = object.designView === targetView;
      object.set({ visible, selectable: visible, evented: visible });
      if (!visible) return;
      object.set({
        left: object.normX * width,
        top: object.normY * height,
        angle: object.angle ?? 0,
      });
      object.scaleToWidth(Math.max(18, object.normScale * width));
      object.setCoords();
    });
    canvas.requestRenderAll();
  }

  async function paint(targetView) {
    const url = garment.images?.[targetView];
    if (!url) return;
    const image = imagesRef.current[targetView] ?? await loadDisplayImage(url);
    imagesRef.current[targetView] = image;
    if (targetView !== currentViewRef.current) return;

    const { width, height } = dimensionsFor(image);
    const base = baseRef.current;
    base.width = width;
    base.height = height;
    renderGarment({ canvas: base, image, regions: garment.regions ?? [], view: targetView, colorChoices: tunedChoices });

    const fabricCanvas = fabricRef.current;
    if (fabricCanvas) {
      fabricCanvas.setDimensions({ width, height });
      layoutObjects(targetView, width, height);
    }
  }

  async function addLogoObject(storageUrl, metadata = {}, { commit = true } = {}) {
    const canvas = fabricRef.current;
    if (!canvas) return null;
    const source = metadata.processingSource || storageUrl;
    let displaySource = source;
    let appearanceSource = '';
    let appearanceSourceOwned = false;
    const logoColorMode = metadata.logoColorMode || 'original';
    const logoColor = metadata.logoColor || '#111827';
    const logoOpacity = Number.isFinite(Number(metadata.logoOpacity))
      ? Math.max(0, Math.min(100, Number(metadata.logoOpacity)))
      : 100;

    if (logoColorMode !== 'original') {
      const recolored = await recolorLogoSource(source, { color: logoColor, mode: logoColorMode });
      displaySource = recolored.url;
      appearanceSource = recolored.url;
      appearanceSourceOwned = true;
    }

    const imageElement = await loadDisplayImage(displaySource);
    const object = new FabricImage(imageElement, {
      originX: 'center',
      originY: 'center',
      left: canvas.getWidth() / 2,
      top: canvas.getHeight() / 2,
      angle: Number(metadata.rotation ?? metadata.position?.rotation) || 0,
      transparentCorners: false,
      cornerStyle: 'circle',
      cornerColor: '#0b5d92',
      borderColor: '#0b5d92',
      opacity: logoOpacity / 100,
    });
    object.logoId = metadata.id || randomId('logo');
    object.storageUrl = storageUrl;
    object.sourceUrl = metadata.sourceUrl || storageUrl;
    object.sourceName = metadata.sourceName || '';
    object.sourceType = metadata.sourceType || 'image';
    object.sourcePage = metadata.sourcePage || 1;
    object.sourcePageCount = metadata.sourcePageCount || 1;
    object.originalUrl = metadata.originalUrl || metadata.sourceUrl || storageUrl;
    object.processedUrl = metadata.processedUrl || '';
    object.backgroundRemoved = Boolean(metadata.backgroundRemoved);
    object.logoColorMode = logoColorMode;
    object.logoColor = logoColor;
    object.logoOpacity = logoOpacity;
    object.processingSource = source;
    object.processingSourceOwned = Boolean(metadata.processingSourceOwned);
    object.appearanceSource = appearanceSource;
    object.appearanceSourceOwned = appearanceSourceOwned;
    object.designView = metadata.targetView || metadata.position?.view || currentViewRef.current;
    object.normX = Number.isFinite(metadata.initialX) ? metadata.initialX : Number(metadata.position?.x) || 0.5;
    object.normY = Number.isFinite(metadata.initialY) ? metadata.initialY : Number(metadata.position?.y) || 0.5;
    object.normScale = Number(metadata.position?.scale) || Number(metadata.normScale) || 0.2;
    object.set({
      left: object.normX * canvas.getWidth(),
      top: object.normY * canvas.getHeight(),
      visible: object.designView === currentViewRef.current,
      selectable: object.designView === currentViewRef.current,
      evented: object.designView === currentViewRef.current,
    });
    object.scaleToWidth(canvas.getWidth() * object.normScale);
    object.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
    canvas.add(object);
    if (object.designView === currentViewRef.current) canvas.setActiveObject(object);
    canvas.requestRenderAll();
    notifyDesign();
    if (commit) commitHistory();
    return object.logoId;
  }

  function addTextObject(text, metadata = {}, { commit = true } = {}) {
    const canvas = fabricRef.current;
    const cleanText = String(text ?? metadata.text ?? '').trim();
    if (!canvas || !cleanText) return null;
    const object = new IText(cleanText, {
      originX: 'center',
      originY: 'center',
      left: canvas.getWidth() / 2,
      top: canvas.getHeight() / 2,
      angle: Number(metadata.rotation ?? metadata.position?.rotation) || 0,
      fill: metadata.color || '#111827',
      fontFamily: metadata.fontFamily || 'Arial',
      fontWeight: metadata.fontWeight || '700',
      fontStyle: metadata.fontStyle || 'normal',
      fontSize: Number(metadata.fontSize) || 56,
      transparentCorners: false,
      cornerStyle: 'circle',
      cornerColor: '#0b5d92',
      borderColor: '#0b5d92',
      editingBorderColor: '#1d8bd1',
    });
    object.textId = metadata.id || randomId('text');
    object.labelBackgroundColor = metadata.backgroundColor || '';
    object.designView = metadata.targetView || metadata.position?.view || currentViewRef.current;
    object.normX = Number.isFinite(metadata.initialX) ? metadata.initialX : Number(metadata.position?.x) || 0.5;
    object.normY = Number.isFinite(metadata.initialY) ? metadata.initialY : Number(metadata.position?.y) || 0.5;
    object.normScale = Number(metadata.position?.scale) || 0.22;
    object.set({
      left: object.normX * canvas.getWidth(),
      top: object.normY * canvas.getHeight(),
      visible: object.designView === currentViewRef.current,
      selectable: object.designView === currentViewRef.current,
      evented: object.designView === currentViewRef.current,
    });
    const targetWidth = canvas.getWidth() * object.normScale;
    if (object.width > 0) object.scaleToWidth(targetWidth);
    object.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
    canvas.add(object);
    if (object.designView === currentViewRef.current) canvas.setActiveObject(object);
    canvas.requestRenderAll();
    notifyDesign();
    if (commit) commitHistory();
    return object.textId;
  }

  function clearObjects({ notify = true } = {}) {
    const canvas = fabricRef.current;
    if (!canvas) return;
    designObjects().forEach((object) => {
      if (object.processingSourceOwned && object.processingSource?.startsWith('blob:')) URL.revokeObjectURL(object.processingSource);
      if (object.appearanceSourceOwned && object.appearanceSource?.startsWith('blob:')) URL.revokeObjectURL(object.appearanceSource);
      canvas.remove(object);
    });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    if (notify) notifyDesign();
  }

  async function restoreSnapshot(snapshot, { resetHistory = false } = {}) {
    const history = historyRef.current;
    history.restoring = true;
    clearObjects({ notify: false });
    try {
      for (const item of snapshot || []) {
        if (item.type === 'text') addTextObject(item.text, item, { commit: false });
        else {
          const url = item.processedUrl || item.storageUrl || item.sourceUrl;
          if (url) await addLogoObject(url, item, { commit: false });
        }
      }
      notifyDesign();
      if (resetHistory) historyRef.current = { entries: [snapshotObjects()], index: 0, restoring: false };
    } finally {
      historyRef.current.restoring = false;
    }
  }

  useEffect(() => {
    const canvas = new Canvas(fabricElementRef.current, {
      preserveObjectStacking: true,
      selection: true,
      uniformScaling: true,
    });
    fabricRef.current = canvas;

    function onMouseDown(event) {
      if (event.target) return;
      const pointer = canvas.getScenePoint(event.e);
      const width = canvas.getWidth();
      const height = canvas.getHeight();
      const hit = getRegionAtPoint(
        garment.regions ?? [],
        { x: pointer.x / width, y: pointer.y / height },
        currentViewRef.current,
      );
      if (hit) onRegionClick?.(hit);
    }

    canvas.on('mouse:down', onMouseDown);
    canvas.on('object:modified', (event) => captureObject(event.target, true));
    canvas.on('text:changed', (event) => captureObject(event.target, true));

    return () => {
      clearObjects({ notify: false });
      canvas.dispose();
      fabricRef.current = null;
    };
  }, []);

  useEffect(() => {
    currentViewRef.current = view;
    paint(view).catch((err) => console.error(err));
  }, [view, garment.images?.front, garment.images?.back, garment.images?.combined]);

  useEffect(() => {
    paint(view).catch((err) => console.error(err));
  }, [colorChoices, colorTuning, garment.regions]);

  useImperativeHandle(ref, () => ({
    addLogo: addLogoObject,
    addText(text, metadata = {}) {
      return addTextObject(text, metadata);
    },
    getSelectedLogo() {
      const active = fabricRef.current?.getActiveObject();
      if (!active?.logoId) return null;
      return {
        ...serializeLogo(active),
        processingSource: active.processedUrl || active.processingSource || active.originalUrl || active.sourceUrl || active.storageUrl,
      };
    },
    getSelectedItem() {
      const active = fabricRef.current?.getActiveObject();
      if (!active) return null;
      if (active.logoId) return serializeLogo(active);
      if (active.textId) return serializeText(active);
      return null;
    },
    selectLogoById(logoId) {
      const canvas = fabricRef.current;
      if (!canvas || !logoId) return false;
      const target = canvas.getObjects().find((object) => object.logoId === logoId);
      if (!target || target.designView !== currentViewRef.current) return false;
      canvas.setActiveObject(target);
      target.setCoords();
      canvas.requestRenderAll();
      return true;
    },
    removeLogoById(logoId) {
      const canvas = fabricRef.current;
      if (!canvas || !logoId) return false;
      const target = canvas.getObjects().find((object) => object.logoId === logoId);
      if (!target) return false;
      if (target.processingSourceOwned && target.processingSource?.startsWith('blob:')) {
        URL.revokeObjectURL(target.processingSource);
      }
      if (target.appearanceSourceOwned && target.appearanceSource?.startsWith('blob:')) {
        URL.revokeObjectURL(target.appearanceSource);
      }
      canvas.remove(target);
      canvas.requestRenderAll();
      notifyDesign();
      commitHistory();
      return true;
    },
    getColorTuning() {
      return { ...colorTuning };
    },
    async updateSelectedLogoAppearance(metadata = {}) {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active?.logoId) return false;

      const mode = metadata.logoColorMode ?? active.logoColorMode ?? 'original';
      const color = metadata.logoColor ?? active.logoColor ?? '#111827';
      const opacity = Number.isFinite(Number(metadata.logoOpacity))
        ? Math.max(0, Math.min(100, Number(metadata.logoOpacity)))
        : (Number.isFinite(active.logoOpacity) ? active.logoOpacity : 100);

      const baseSource = active.processedUrl || active.processingSource || active.storageUrl || active.sourceUrl;
      if (!baseSource) return false;

      const scaledWidth = active.getScaledWidth();
      let nextSource = baseSource;
      let ownedSource = '';

      if (mode !== 'original') {
        const recolored = await recolorLogoSource(baseSource, { color, mode });
        nextSource = recolored.url;
        ownedSource = recolored.url;
      }

      const imageElement = await loadDisplayImage(nextSource);
      if (active.appearanceSourceOwned && active.appearanceSource?.startsWith('blob:')) {
        URL.revokeObjectURL(active.appearanceSource);
      }

      active.setElement(imageElement);
      active.logoColorMode = mode;
      active.logoColor = color;
      active.logoOpacity = opacity;
      active.appearanceSource = ownedSource;
      active.appearanceSourceOwned = Boolean(ownedSource);
      active.set('opacity', opacity / 100);
      active.scaleToWidth(scaledWidth);
      active.setCoords();
      canvas.setActiveObject(active);
      canvas.requestRenderAll();
      notifyDesign();
      commitHistory();
      return true;
    },
    updateSelectedText(metadata = {}) {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active?.textId) return false;
      if (metadata.text !== undefined) active.set('text', String(metadata.text));
      if (metadata.color !== undefined) active.set('fill', metadata.color);
      if (metadata.backgroundColor !== undefined) active.labelBackgroundColor = metadata.backgroundColor;
      if (metadata.fontWeight !== undefined) active.set('fontWeight', metadata.fontWeight);
      if (metadata.fontFamily !== undefined) active.set('fontFamily', metadata.fontFamily);
      if (metadata.fontStyle !== undefined) active.set('fontStyle', metadata.fontStyle);
      active.setCoords();
      canvas.requestRenderAll();
      captureObject(active, true);
      return true;
    },
    async replaceSelectedLogoImage(storageUrl, metadata = {}) {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active?.logoId) return false;
      const imageElement = await loadDisplayImage(metadata.processingSource || storageUrl);
      if (active.appearanceSourceOwned && active.appearanceSource?.startsWith('blob:')) {
        URL.revokeObjectURL(active.appearanceSource);
      }
      active.appearanceSource = '';
      active.appearanceSourceOwned = false;
      active.logoColorMode = 'original';
      active.logoColor = '#111827';
      active.logoOpacity = 100;
      active.setElement(imageElement);
      active.set('opacity', 1);
      active.storageUrl = storageUrl;
      active.processedUrl = metadata.processedUrl || storageUrl;
      active.backgroundRemoved = metadata.backgroundRemoved ?? true;
      if (metadata.originalUrl) active.originalUrl = metadata.originalUrl;
      if (metadata.sourceUrl) active.sourceUrl = metadata.sourceUrl;
      if (metadata.sourceName) active.sourceName = metadata.sourceName;
      if (metadata.processingSource) {
        if (active.processingSourceOwned && active.processingSource?.startsWith('blob:')) URL.revokeObjectURL(active.processingSource);
        active.processingSource = metadata.processingSource;
        active.processingSourceOwned = Boolean(metadata.processingSourceOwned);
      }
      active.scaleToWidth(active.normScale * canvas.getWidth());
      active.setCoords();
      canvas.setActiveObject(active);
      canvas.requestRenderAll();
      notifyDesign();
      commitHistory();
      return true;
    },
    removeSelectedLogo() {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active?.logoId) return false;
      if (active.processingSourceOwned && active.processingSource?.startsWith('blob:')) URL.revokeObjectURL(active.processingSource);
      if (active.appearanceSourceOwned && active.appearanceSource?.startsWith('blob:')) URL.revokeObjectURL(active.appearanceSource);
      canvas.remove(active);
      canvas.requestRenderAll();
      notifyDesign();
      commitHistory();
      return true;
    },
    removeSelectedItem() {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !(active?.logoId || active?.textId)) return false;
      if (active.processingSourceOwned && active.processingSource?.startsWith('blob:')) URL.revokeObjectURL(active.processingSource);
      if (active.appearanceSourceOwned && active.appearanceSource?.startsWith('blob:')) URL.revokeObjectURL(active.appearanceSource);
      canvas.remove(active);
      canvas.requestRenderAll();
      notifyDesign();
      commitHistory();
      return true;
    },
    clearLogos() {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.getObjects().filter((object) => object.logoId).forEach((object) => {
        if (object.processingSourceOwned && object.processingSource?.startsWith('blob:')) URL.revokeObjectURL(object.processingSource);
        if (object.appearanceSourceOwned && object.appearanceSource?.startsWith('blob:')) URL.revokeObjectURL(object.appearanceSource);
        canvas.remove(object);
      });
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      notifyDesign();
      commitHistory();
    },
    clearDesignItems() {
      clearObjects();
      commitHistory();
    },
    getDesignState() {
      return {
        logos: designObjects().filter((object) => object.logoId).map(serializeLogo),
        texts: designObjects().filter((object) => object.textId).map(serializeText),
      };
    },
    async restoreDesignState(state = {}, options = {}) {
      const snapshot = [
        ...(state.logos || []).map((item) => ({ ...item, type: 'logo' })),
        ...(state.texts || []).map((item) => ({ ...item, type: 'text' })),
      ];
      await restoreSnapshot(snapshot, { resetHistory: options.resetHistory !== false });
    },
    resetHistory() {
      historyRef.current = { entries: [snapshotObjects()], index: 0, restoring: false };
    },
    async undo() {
      const history = historyRef.current;
      if (history.index <= 0) return false;
      history.index -= 1;
      await restoreSnapshot(history.entries[history.index]);
      return true;
    },
    async redo() {
      const history = historyRef.current;
      if (history.index >= history.entries.length - 1) return false;
      history.index += 1;
      await restoreSnapshot(history.entries[history.index]);
      return true;
    },
    async exportView(targetView) {
      const url = garment.images?.[targetView];
      if (!url) return null;
      const image = await loadImage(url);
      const { width, height } = dimensionsFor(image);
      const result = document.createElement('canvas');
      result.width = width;
      result.height = height;
      renderGarment({ canvas: result, image, regions: garment.regions ?? [], view: targetView, colorChoices: tunedChoices });
      const ctx = result.getContext('2d');

      for (const object of designObjects().filter((item) => item.designView === targetView)) {
        if (object.logoId) {
          const element = object.getElement();
          const drawWidth = object.normScale * width;
          const elementWidth = element?.naturalWidth || element?.width || 1;
          const elementHeight = element?.naturalHeight || element?.height || 1;
          const ratio = elementHeight / elementWidth;
          const drawHeight = drawWidth * ratio;
          ctx.save();
          ctx.globalAlpha = Number.isFinite(object.logoOpacity) ? object.logoOpacity / 100 : (object.opacity ?? 1);
          ctx.translate(object.normX * width, object.normY * height);
          ctx.rotate(((object.angle ?? 0) * Math.PI) / 180);
          ctx.drawImage(element, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
          ctx.restore();
        } else if (object.textId) {
          const serialized = serializeText(object);
          const desiredWidth = Math.max(20, serialized.position.scale * width);
          const baseFontSize = Math.max(12, serialized.fontSize);
          ctx.save();
          ctx.translate(serialized.position.x * width, serialized.position.y * height);
          ctx.rotate(((serialized.position.rotation || 0) * Math.PI) / 180);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `${serialized.fontStyle} ${serialized.fontWeight} ${baseFontSize}px ${serialized.fontFamily}`;
          const measured = Math.max(1, ctx.measureText(serialized.text).width);
          const scale = desiredWidth / measured;
          const padX = Math.max(12, baseFontSize * 0.3);
          const padY = Math.max(7, baseFontSize * 0.14);
          const labelWidth = measured + (padX * 2);
          const labelHeight = (baseFontSize * 1.16) + (padY * 2);
          const backgroundColor = textBackgroundColor(serialized);
          const lightBackground = isLightColor(backgroundColor);
          ctx.scale(scale, scale);
          ctx.fillStyle = backgroundColor;
          ctx.strokeStyle = lightBackground ? 'rgba(15,23,42,0.78)' : 'rgba(255,255,255,0.85)';
          ctx.lineWidth = Math.max(1.5, baseFontSize * 0.035);
          ctx.fillRect(-labelWidth / 2, -labelHeight / 2, labelWidth, labelHeight);
          ctx.strokeRect(-labelWidth / 2, -labelHeight / 2, labelWidth, labelHeight);
          ctx.fillStyle = serialized.color;
          ctx.fillText(serialized.text, 0, 0);
          ctx.restore();
        }
      }

      return new Promise((resolve, reject) => {
        try {
          result.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Não foi possível gerar a imagem final.'));
          }, 'image/png', 0.96);
        } catch (error) {
          reject(new Error(`A exportação foi bloqueada por uma imagem sem permissão CORS. ${error?.message || ''}`.trim()));
        }
      });
    },
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="customer-stage">
        <canvas ref={baseRef} className="customer-base-canvas" />
        <canvas ref={fabricElementRef} className="customer-fabric-canvas" />
      </div>

      {hasCustomColors && (
        <section
          aria-label="Harmonização das cores"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
            padding: '12px 14px',
            border: '1px solid #cddbe7',
            borderRadius: 12,
            background: 'linear-gradient(180deg,#fff,#f7fbfe)',
            lineHeight: 1.35,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <strong style={{ color: '#10223a', fontSize: '.86rem' }}>Harmonização da cor</strong>
              <small style={{ color: '#667d91', fontSize: '.68rem', fontWeight: 700 }}>Suavize a cor para preservar luz, sombra e textura do tecido.</small>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="button button-secondary" style={{ padding: '7px 9px', fontSize: '.7rem' }} onClick={() => setColorTuning(DEFAULT_COLOR_TUNING)}>Harmonizar</button>
              <button type="button" className="button button-secondary" style={{ padding: '7px 9px', fontSize: '.7rem' }} onClick={() => setColorTuning(FULL_COLOR_TUNING)}>100%</button>
            </div>
          </div>
          <HarmonySlider label="Intensidade" value={colorTuning.opacity} min={25} max={100} onChange={(opacity) => setColorTuning((current) => ({ ...current, opacity }))} />
          <HarmonySlider label="Saturação" value={colorTuning.saturation} min={30} max={140} onChange={(saturation) => setColorTuning((current) => ({ ...current, saturation }))} />
          <HarmonySlider label="Brilho" value={colorTuning.brightness} min={60} max={125} onChange={(brightness) => setColorTuning((current) => ({ ...current, brightness }))} />
        </section>
      )}
    </div>
  );
});

export default CustomerStage;
