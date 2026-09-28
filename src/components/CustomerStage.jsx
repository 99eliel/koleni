import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Canvas, FabricImage } from 'fabric';
import { getRegionAtPoint } from '../lib/geometry';
import { renderGarment } from '../lib/renderGarment';

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

const CustomerStage = forwardRef(function CustomerStage({ garment, view, colorChoices, onRegionClick, onLogosChange }, ref) {
  const baseRef = useRef(null);
  const fabricElementRef = useRef(null);
  const fabricRef = useRef(null);
  const imagesRef = useRef({});
  const currentViewRef = useRef(view);

  function serializeLogo(object) {
    return {
      id: object.logoId,
      storageUrl: object.storageUrl,
      sourceUrl: object.sourceUrl || object.storageUrl,
      sourceName: object.sourceName || '',
      sourceType: object.sourceType || 'image',
      sourcePage: object.sourcePage || 1,
      sourcePageCount: object.sourcePageCount || 1,
      originalUrl: object.originalUrl || object.sourceUrl || object.storageUrl,
      processedUrl: object.processedUrl || '',
      backgroundRemoved: Boolean(object.backgroundRemoved),
      placementLabel: object.placementLabel || 'Livre',
      widthCm: Number(object.widthCm) || 9,
      position: {
        x: object.normX,
        y: object.normY,
        scale: object.normScale,
        rotation: object.angle ?? 0,
        view: object.logoView,
      },
    };
  }

  function notifyLogos() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    onLogosChange?.(canvas.getObjects().filter((object) => object.logoId).map(serializeLogo));
  }

  function captureObject(object) {
    const canvas = fabricRef.current;
    if (!canvas || !object?.logoId) return;
    const width = canvas.getWidth();
    const height = canvas.getHeight();
    object.normX = (object.left ?? 0) / width;
    object.normY = (object.top ?? 0) / height;
    object.normScale = object.getScaledWidth() / width;
    notifyLogos();
  }

  function layoutObjects(targetView, width, height) {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.discardActiveObject();
    canvas.getObjects().forEach((object) => {
      const visible = object.logoView === targetView;
      object.set({ visible, selectable: visible, evented: visible });
      if (!visible) return;
      object.set({
        left: object.normX * width,
        top: object.normY * height,
        angle: object.angle ?? 0,
      });
      object.scaleToWidth(object.normScale * width);
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
    renderGarment({ canvas: base, image, regions: garment.regions ?? [], view: targetView, colorChoices });

    const fabricCanvas = fabricRef.current;
    if (fabricCanvas) {
      fabricCanvas.setDimensions({ width, height });
      layoutObjects(targetView, width, height);
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
    canvas.on('object:modified', (event) => captureObject(event.target));

    return () => {
      canvas.getObjects().forEach((object) => {
        if (object.processingSourceOwned && object.processingSource?.startsWith('blob:')) {
          URL.revokeObjectURL(object.processingSource);
        }
      });
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
  }, [colorChoices, garment.regions]);

  useImperativeHandle(ref, () => ({
    async addLogo(storageUrl, metadata = {}) {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const imageElement = await loadDisplayImage(metadata.processingSource || storageUrl);
      const object = new FabricImage(imageElement, {
        originX: 'center',
        originY: 'center',
        left: canvas.getWidth() / 2,
        top: canvas.getHeight() / 2,
        angle: Number(metadata.rotation) || 0,
        transparentCorners: false,
        cornerStyle: 'circle',
      });
      object.logoId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      object.storageUrl = storageUrl;
      object.sourceUrl = metadata.sourceUrl || storageUrl;
      object.sourceName = metadata.sourceName || '';
      object.sourceType = metadata.sourceType || 'image';
      object.sourcePage = metadata.sourcePage || 1;
      object.sourcePageCount = metadata.sourcePageCount || 1;
      object.originalUrl = metadata.originalUrl || metadata.sourceUrl || storageUrl;
      object.processedUrl = metadata.processedUrl || '';
      object.backgroundRemoved = Boolean(metadata.backgroundRemoved);
      object.processingSource = metadata.processingSource || storageUrl;
      object.processingSourceOwned = Boolean(metadata.processingSourceOwned);
      object.logoView = metadata.targetView || metadata.position?.view || currentViewRef.current;
      object.normX = Number.isFinite(metadata.initialX) ? metadata.initialX : Number(metadata.position?.x) || 0.5;
      object.normY = Number.isFinite(metadata.initialY) ? metadata.initialY : Number(metadata.position?.y) || 0.5;
      object.normScale = Number(metadata.position?.scale) || 0.2;
      object.placementLabel = metadata.placementLabel || 'Livre';
      object.widthCm = Number(metadata.widthCm) || 9;
      object.set({
        left: object.normX * canvas.getWidth(),
        top: object.normY * canvas.getHeight(),
        visible: object.logoView === currentViewRef.current,
        selectable: object.logoView === currentViewRef.current,
        evented: object.logoView === currentViewRef.current,
      });
      object.scaleToWidth(canvas.getWidth() * object.normScale);
      object.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
      canvas.add(object);
      if (object.logoView === currentViewRef.current) canvas.setActiveObject(object);
      canvas.requestRenderAll();
      notifyLogos();
      return object.logoId;
    },

    getSelectedLogo() {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (!active?.logoId) return null;
      return {
        ...serializeLogo(active),
        processingSource: active.processingSource || active.originalUrl || active.sourceUrl || active.storageUrl,
      };
    },

    updateSelectedLogoProductionMeta(metadata = {}) {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active?.logoId) return false;

      if (metadata.placementLabel !== undefined) active.placementLabel = metadata.placementLabel || 'Livre';
      if (metadata.widthCm !== undefined) active.widthCm = Number(metadata.widthCm) || 9;
      if (Number.isFinite(metadata.x)) active.normX = metadata.x;
      if (Number.isFinite(metadata.y)) active.normY = metadata.y;
      if (Number.isFinite(metadata.x) || Number.isFinite(metadata.y)) {
        active.set({
          left: active.normX * canvas.getWidth(),
          top: active.normY * canvas.getHeight(),
        });
        active.setCoords();
      }
      canvas.setActiveObject(active);
      canvas.requestRenderAll();
      notifyLogos();
      return true;
    },

    async replaceSelectedLogoImage(storageUrl, metadata = {}) {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active?.logoId) return false;

      const imageElement = await loadDisplayImage(metadata.processingSource || storageUrl);
      active.setElement(imageElement);
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
      notifyLogos();
      return true;
    },

    removeSelectedLogo() {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active?.logoId) return false;
      if (active.processingSourceOwned && active.processingSource?.startsWith('blob:')) {
        URL.revokeObjectURL(active.processingSource);
      }
      canvas.remove(active);
      canvas.requestRenderAll();
      notifyLogos();
      return true;
    },

    clearLogos() {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.getObjects().filter((object) => object.logoId).forEach((object) => {
        if (object.processingSourceOwned && object.processingSource?.startsWith('blob:')) {
          URL.revokeObjectURL(object.processingSource);
        }
        canvas.remove(object);
      });
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      notifyLogos();
    },

    async exportView(targetView) {
      const url = garment.images?.[targetView];
      if (!url) return null;
      const image = await loadImage(url);
      const { width, height } = dimensionsFor(image);
      const result = document.createElement('canvas');
      result.width = width;
      result.height = height;
      renderGarment({ canvas: result, image, regions: garment.regions ?? [], view: targetView, colorChoices });
      const ctx = result.getContext('2d');
      const canvas = fabricRef.current;

      for (const object of canvas.getObjects().filter((item) => item.logoView === targetView)) {
        const source = object.processingSource || object.processedUrl || object.storageUrl || object.sourceUrl;
        const element = source ? await loadImage(source) : object.getElement();
        const drawWidth = object.normScale * width;
        const ratio = element.naturalHeight / element.naturalWidth;
        const drawHeight = drawWidth * ratio;
        ctx.save();
        ctx.translate(object.normX * width, object.normY * height);
        ctx.rotate(((object.angle ?? 0) * Math.PI) / 180);
        ctx.drawImage(element, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        ctx.restore();
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
    <div className="customer-stage">
      <canvas ref={baseRef} className="customer-base-canvas" />
      <canvas ref={fabricElementRef} className="customer-fabric-canvas" />
    </div>
  );
});

export default CustomerStage;
