import { useEffect, useMemo, useRef, useState } from 'react';
import { distancePixels, getRegionAtPoint, normalizedPointFromEvent } from '../lib/geometry';
import { findEdgeHit, findVertexHit, insertVertex, moveVertex, removeVertex } from '../lib/editorHit';
import { drawEditableVertices, renderGarment } from '../lib/renderGarment';

function isTypingTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothPolygon(polygon = []) {
  if (polygon.length < 3) return polygon;
  const next = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    next.push({ x: (0.75 * a.x) + (0.25 * b.x), y: (0.75 * a.y) + (0.25 * b.y) });
    next.push({ x: (0.25 * a.x) + (0.75 * b.x), y: (0.25 * a.y) + (0.75 * b.y) });
  }
  return next;
}

export default function GarmentEditorCanvas({
  imageUrl,
  view,
  regions,
  setRegions,
  selectedRegionId,
  mode,
  visibleIds,
  previewColors,
  onSelectRegion,
  onPolygonClosed,
  zoom,
  setZoom,
}) {
  const canvasRef = useRef(null);
  const scrollRef = useRef(null);
  const panRef = useRef(null);
  const zoomRef = useRef(zoom);
  const [image, setImage] = useState(null);
  const [imageError, setImageError] = useState('');
  const [currentPolygon, setCurrentPolygon] = useState([]);
  const [hoverPoint, setHoverPoint] = useState(null);
  const [selectedVertex, setSelectedVertex] = useState(null);
  const [draggingVertex, setDraggingVertex] = useState(null);
  const [isPanning, setIsPanning] = useState(false);

  const selectedRegion = useMemo(
    () => regions.find((region) => region.id === selectedRegionId) ?? null,
    [regions, selectedRegionId],
  );

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    setCurrentPolygon([]);
    setSelectedVertex(null);
  }, [selectedRegionId, view, mode]);

  useEffect(() => {
    setImage(null);
    setImageError('');
    if (!imageUrl) return undefined;
    let cancelled = false;
    let activeImage = null;
    function attempt(useCors) {
      const nextImage = new Image();
      activeImage = nextImage;
      if (useCors) nextImage.crossOrigin = 'anonymous';
      nextImage.onload = () => { if (!cancelled) setImage(nextImage); };
      nextImage.onerror = () => {
        if (cancelled) return;
        if (useCors) attempt(false);
        else setImageError('A imagem foi enviada, mas não pôde ser carregada no editor.');
      };
      nextImage.src = imageUrl;
    }
    attempt(true);
    return () => {
      cancelled = true;
      if (activeImage) {
        activeImage.onload = null;
        activeImage.onerror = null;
      }
    };
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ratio = Math.min(1, 1200 / image.naturalWidth);
    canvas.width = Math.round(image.naturalWidth * ratio);
    canvas.height = Math.round(image.naturalHeight * ratio);
  }, [image]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    renderGarment({
      canvas,
      image,
      regions,
      view,
      colorChoices: mode === 'preview' ? previewColors : {},
      visibleRegionIds: visibleIds,
      highlightRegionId: selectedRegionId,
      showEditorOverlay: mode !== 'preview',
    });
    if (mode === 'draw' || mode === 'edit') {
      drawEditableVertices({ canvas, region: selectedRegion, currentPolygon, hoverPoint, selectedVertex });
    }
  }, [image, regions, view, mode, visibleIds, previewColors, selectedRegionId, selectedRegion, currentPolygon, hoverPoint, selectedVertex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return undefined;

    function onWheel(event) {
      const scroller = scrollRef.current;
      if (!scroller || event.deltaY === 0) return;

      event.preventDefault();
      event.stopPropagation();

      const currentZoom = zoomRef.current;
      const step = event.deltaY < 0 ? 0.1 : -0.1;
      const nextZoom = Math.min(3, Math.max(0.5, Number((currentZoom + step).toFixed(2))));
      if (nextZoom === currentZoom) return;

      const scrollerRect = scroller.getBoundingClientRect();
      const localX = event.clientX - scrollerRect.left;
      const localY = event.clientY - scrollerRect.top;
      const contentX = scroller.scrollLeft + localX;
      const contentY = scroller.scrollTop + localY;
      const ratio = nextZoom / currentZoom;

      zoomRef.current = nextZoom;
      setZoom(nextZoom);

      requestAnimationFrame(() => {
        scroller.scrollLeft = Math.max(0, (contentX * ratio) - localX);
        scroller.scrollTop = Math.max(0, (contentY * ratio) - localY);
      });
    }

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [image, setZoom]);

  function undoLastPoint() {
    if (mode !== 'draw') return;
    setCurrentPolygon((items) => items.slice(0, -1));
    setHoverPoint(null);
  }

  function cancelCurrentPolygon() {
    if (mode !== 'draw') return;
    setCurrentPolygon([]);
    setHoverPoint(null);
  }

  function deleteSelectedVertex() {
    if (mode !== 'edit' || !selectedVertex || !selectedRegionId) return;
    setRegions((items) => removeVertex(items, selectedRegionId, selectedVertex));
    setSelectedVertex(null);
    setDraggingVertex(null);
  }

  function deleteSelectedPart() {
    if (mode !== 'edit' || !selectedVertex || !selectedRegionId) return;
    const polygonIndex = selectedVertex.polygonIndex;
    setRegions((items) => items.map((region) => (
      region.id === selectedRegionId
        ? { ...region, polygons: (region.polygons || []).filter((_, index) => index !== polygonIndex) }
        : region
    )));
    setSelectedVertex(null);
  }

  function mirrorSelectedRegion() {
    if (!selectedRegionId) return;
    setRegions((items) => items.map((region) => (
      region.id === selectedRegionId
        ? { ...region, polygons: (region.polygons || []).map((polygon) => polygon.map((point) => ({ x: 1 - point.x, y: point.y }))) }
        : region
    )));
    setSelectedVertex(null);
  }

  function smoothSelectedRegion() {
    if (!selectedRegionId) return;
    setRegions((items) => items.map((region) => (
      region.id === selectedRegionId
        ? { ...region, polygons: (region.polygons || []).map(smoothPolygon) }
        : region
    )));
    setSelectedVertex(null);
  }

  function duplicateSelectedRegion() {
    if (!selectedRegion) return;
    const taken = new Set(regions.map((region) => region.id));
    let index = 2;
    let id = `${selectedRegion.id}-copia`;
    while (taken.has(id)) {
      id = `${selectedRegion.id}-copia-${index}`;
      index += 1;
    }
    const copy = {
      ...selectedRegion,
      id,
      label: `${selectedRegion.label} cópia`,
      zIndex: Math.max(0, ...regions.filter((region) => region.view === view).map((region) => Number(region.zIndex) || 0)) + 1,
      polygons: (selectedRegion.polygons || []).map((polygon) => polygon.map((point) => ({
        x: clamp(point.x + 0.025),
        y: clamp(point.y + 0.025),
      }))),
    };
    setRegions((items) => [...items, copy]);
    onSelectRegion?.(id);
    setSelectedVertex(null);
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (isTypingTarget(event.target)) return;
      if (mode === 'draw') {
        if (event.key === 'Enter' && currentPolygon.length >= 3) {
          event.preventDefault();
          finishPolygon();
          return;
        }
        if ((event.key === 'Delete' || event.key === 'Backspace') && currentPolygon.length > 0) {
          event.preventDefault();
          undoLastPoint();
          return;
        }
        if (event.key === 'Escape' && currentPolygon.length > 0) {
          event.preventDefault();
          cancelCurrentPolygon();
        }
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && mode === 'edit' && selectedVertex && selectedRegionId) {
        event.preventDefault();
        deleteSelectedVertex();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function finishPolygon() {
    if (currentPolygon.length < 3 || !selectedRegionId) return;
    const polygon = currentPolygon.map((point) => ({ x: point.x, y: point.y }));
    setRegions((items) => items.map((region) => (
      region.id === selectedRegionId
        ? { ...region, polygons: [...(region.polygons ?? []), polygon] }
        : region
    )));
    setCurrentPolygon([]);
    setHoverPoint(null);
    onPolygonClosed?.();
  }

  function handleClick(event) {
    if (event.button !== 0 || isPanning) return;
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const point = normalizedPointFromEvent(event, canvas);
    if (mode === 'draw' && selectedRegionId) {
      if (currentPolygon.length >= 3 && distancePixels(point, currentPolygon[0], canvas.width, canvas.height) <= 10) {
        finishPolygon();
        return;
      }
      setCurrentPolygon((items) => [...items, point]);
      return;
    }
    if (mode === 'preview') {
      const hit = getRegionAtPoint(regions.filter((region) => visibleIds.has(region.id)), point, view);
      if (hit) onSelectRegion?.(hit.id);
    }
  }

  function handlePointerDown(event) {
    if (event.button === 2) {
      const scroller = scrollRef.current;
      if (!scroller) return;
      event.preventDefault();
      panRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        scrollLeft: scroller.scrollLeft,
        scrollTop: scroller.scrollTop,
      };
      setIsPanning(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }
    if (event.button !== 0 || mode !== 'edit' || !selectedRegion) return;
    const canvas = canvasRef.current;
    const point = normalizedPointFromEvent(event, canvas);
    const vertex = findVertexHit(selectedRegion, point, canvas.width, canvas.height, 10);
    if (vertex) {
      setSelectedVertex(vertex);
      setDraggingVertex(vertex);
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }
    const edge = findEdgeHit(selectedRegion, point, canvas.width, canvas.height, 7);
    if (edge) {
      const selection = { polygonIndex: edge.polygonIndex, vertexIndex: edge.edgeIndex + 1 };
      setRegions((items) => insertVertex(items, selectedRegion.id, edge, point));
      setSelectedVertex(selection);
    }
  }

  function handlePointerMove(event) {
    const pan = panRef.current;
    if (pan && pan.pointerId === event.pointerId) {
      const scroller = scrollRef.current;
      if (!scroller) return;
      event.preventDefault();
      scroller.scrollLeft = pan.scrollLeft - (event.clientX - pan.clientX);
      scroller.scrollTop = pan.scrollTop - (event.clientY - pan.clientY);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const point = normalizedPointFromEvent(event, canvas);
    if (mode === 'draw') setHoverPoint(point);
    if (mode === 'edit' && draggingVertex && selectedRegionId) {
      setRegions((items) => moveVertex(items, selectedRegionId, draggingVertex, point));
    }
  }

  function handlePointerEnd(event) {
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
      setIsPanning(false);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    setDraggingVertex(null);
  }

  if (!imageUrl) {
    return <div className="canvas-placeholder"><strong>Envie uma foto da peça</strong><span>Você pode cadastrar até três fotos diferentes para a mesma peça.</span></div>;
  }
  if (imageError) return <div className="canvas-placeholder"><strong>Não foi possível abrir a imagem</strong><span>{imageError}</span></div>;
  if (!image) return <div className="canvas-placeholder"><strong>Carregando imagem…</strong><span>Aguarde um instante.</span></div>;

  return (
    <div ref={scrollRef} className={`editor-scroll ${isPanning ? 'is-panning' : ''}`} onContextMenu={(event) => event.preventDefault()}>
      {(mode === 'draw' || mode === 'edit') && (
        <div className="editor-point-actions">
          {mode === 'draw' && (
            <>
              <button className="button button-secondary" type="button" disabled={currentPolygon.length === 0} onClick={undoLastPoint}>↶ Desfazer último ponto</button>
              <button className="button button-secondary" type="button" disabled={currentPolygon.length === 0} onClick={cancelCurrentPolygon}>Cancelar desenho</button>
              <span>{currentPolygon.length} ponto(s) no desenho atual</span>
            </>
          )}
          {mode === 'edit' && (
            <>
              <button className="button button-secondary" type="button" onClick={duplicateSelectedRegion}>Duplicar região</button>
              <button className="button button-secondary" type="button" onClick={mirrorSelectedRegion}>Espelhar</button>
              <button className="button button-secondary" type="button" onClick={smoothSelectedRegion}>Suavizar contorno</button>
              <button className="button button-secondary" type="button" disabled={!selectedVertex} onClick={deleteSelectedVertex}>Excluir vértice</button>
              <button className="button button-secondary" type="button" disabled={!selectedVertex} onClick={deleteSelectedPart}>Excluir parte</button>
              <span>{selectedVertex ? 'Ponto selecionado.' : 'Clique num ponto ou numa aresta.'}</span>
            </>
          )}
        </div>
      )}

      <div className="editor-zoom-stage" style={{ width: `${zoom * 100}%` }}>
        <canvas
          ref={canvasRef}
          className={`garment-editor-canvas mode-${mode}`}
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onPointerLeave={() => { if (!isPanning) { setDraggingVertex(null); setHoverPoint(null); } }}
        />
      </div>
      {mode === 'draw' && <div className="canvas-hint">Rodinha = zoom só na peça · Enter = fechar área · Backspace/Delete = desfazer último ponto · Esc = cancelar desenho · Botão direito + arrastar = mover imagem.</div>}
      {mode === 'edit' && <div className="canvas-hint">Rodinha = zoom só na peça · arraste pontos · clique numa aresta para adicionar ponto · botão direito + arrastar move a imagem.</div>}
    </div>
  );
}
