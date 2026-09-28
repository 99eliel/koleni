import { useEffect, useMemo, useRef, useState } from 'react';
import { distancePixels, getRegionAtPoint, normalizedPointFromEvent } from '../lib/geometry';
import { findEdgeHit, findVertexHit, insertVertex, moveVertex, removeVertex } from '../lib/editorHit';
import { drawEditableVertices, renderGarment } from '../lib/renderGarment';

function isTypingTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
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

      nextImage.onload = () => {
        if (!cancelled) setImage(nextImage);
      };

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
    const maxWidth = 1200;
    const ratio = Math.min(1, maxWidth / image.naturalWidth);
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

  function handleWheel(event) {
    event.preventDefault();
    const step = event.deltaY < 0 ? 0.1 : -0.1;
    setZoom((value) => Math.min(3, Math.max(0.5, Number((value + step).toFixed(2)))));
  }

  if (!imageUrl) {
    return <div className="canvas-placeholder"><strong>Envie a foto desta vista</strong><span>Você pode usar frente, costas ou frente + costas na mesma imagem.</span></div>;
  }

  if (imageError) {
    return <div className="canvas-placeholder"><strong>Não foi possível abrir a imagem</strong><span>{imageError}</span></div>;
  }

  if (!image) {
    return <div className="canvas-placeholder"><strong>Carregando imagem…</strong><span>Aguarde um instante.</span></div>;
  }

  return (
    <div
      ref={scrollRef}
      className={`editor-scroll ${isPanning ? 'is-panning' : ''}`}
      onWheel={handleWheel}
      onContextMenu={(event) => event.preventDefault()}
    >
      {(mode === 'draw' || mode === 'edit') && (
        <div className="editor-point-actions" onWheel={(event) => event.stopPropagation()}>
          {mode === 'draw' && (
            <>
              <button className="button button-secondary" type="button" disabled={currentPolygon.length === 0} onClick={undoLastPoint}>↶ Desfazer último ponto</button>
              <button className="button button-secondary" type="button" disabled={currentPolygon.length === 0} onClick={cancelCurrentPolygon}>Cancelar desenho</button>
              <span>{currentPolygon.length} ponto(s) no desenho atual</span>
            </>
          )}
          {mode === 'edit' && (
            <>
              <button className="button button-secondary" type="button" disabled={!selectedVertex} onClick={deleteSelectedVertex}>Excluir vértice selecionado</button>
              <span>{selectedVertex ? 'Vértice selecionado. Delete/Backspace também remove.' : 'Clique em um ponto para selecioná-lo.'}</span>
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
      {mode === 'draw' && <div className="canvas-hint">Enter = fechar área · Backspace/Delete = desfazer último ponto · Esc = cancelar desenho · Botão direito + arrastar = mover imagem.</div>}
      {mode === 'edit' && <div className="canvas-hint">Arraste pontos · Clique numa aresta para adicionar · Delete/Backspace remove o ponto selecionado · Botão direito + arrastar move a imagem.</div>}
    </div>
  );
}
