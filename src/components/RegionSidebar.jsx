import { useState } from 'react';

export default function RegionSidebar({
  regions,
  view,
  selectedRegionId,
  visibleIds,
  onSelect,
  onToggleVisible,
  onReorder,
  onUpdateRegion,
  onAddPart,
  onEdit,
}) {
  const [dragId, setDragId] = useState(null);
  const items = [...regions]
    .filter((region) => region.view === view && !region.deleted)
    .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));

  function dropOn(targetId) {
    if (!dragId || dragId === targetId) return;
    const orderedIds = items.map((item) => item.id);
    const from = orderedIds.indexOf(dragId);
    const to = orderedIds.indexOf(targetId);
    orderedIds.splice(to, 0, orderedIds.splice(from, 1)[0]);
    onReorder(orderedIds);
    setDragId(null);
  }

  function removeRegion(region) {
    const confirmed = window.confirm(
      `Excluir a região “${region.label}”?\n\nEla será removida definitivamente da peça quando você clicar em “Salvar peça”.`,
    );
    if (!confirmed) return;

    if (visibleIds.has(region.id)) onToggleVisible(region.id);

    onUpdateRegion(region.id, {
      deleted: true,
      view: '__deleted__',
      polygons: region.polygons?.length ? region.polygons : [[]],
    });
    onSelect(null);
  }

  return (
    <aside className="panel sidebar-panel">
      <div className="panel-heading">
        <h2>Regiões</h2>
        <span className="badge">{items.length}</span>
      </div>
      <p className="muted compact-text">Arraste para mudar a prioridade. O item mais alto fica por cima.</p>

      <div className="region-list">
        {items.length === 0 && <div className="empty-small">Nenhuma região nesta vista.</div>}
        {items.map((region) => (
          <div
            key={region.id}
            className={`region-card ${selectedRegionId === region.id ? 'selected' : ''}`}
            draggable
            onDragStart={() => setDragId(region.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => dropOn(region.id)}
            onClick={() => onSelect(region.id)}
          >
            <div className="region-card-main">
              <span className="drag-handle" title="Arrastar">⋮⋮</span>
              <input
                aria-label={`Cor de ${region.label}`}
                type="color"
                value={region.defaultColor}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onUpdateRegion(region.id, { defaultColor: event.target.value })}
              />
              <div className="region-name">
                <strong>{region.label}</strong>
                <span>{region.polygons?.length ?? 0} parte(s) · z{region.zIndex}</span>
              </div>
              <label className="visible-toggle" title="Visível" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={visibleIds.has(region.id)}
                  onChange={() => onToggleVisible(region.id)}
                />
                <span>visível</span>
              </label>
            </div>

            {selectedRegionId === region.id && (
              <div className="region-actions" onClick={(event) => event.stopPropagation()}>
                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 9, fontSize: '.75rem', fontWeight: 800, color: '#475569' }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  Nome da região
                  <input
                    type="text"
                    value={region.label}
                    placeholder="Nome da região"
                    onChange={(event) => onUpdateRegion(region.id, { label: event.target.value })}
                    onKeyDown={(event) => event.stopPropagation()}
                    draggable={false}
                    style={{ width: '100%', padding: '8px 9px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', font: 'inherit', color: '#0f172a' }}
                  />
                </label>

                <label className="lock-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(region.locked)}
                    onChange={(event) => onUpdateRegion(region.id, { locked: event.target.checked })}
                  />
                  Bloqueada para cliente
                </label>
                <div className="inline-actions">
                  <button type="button" className="mini-button" onClick={() => onEdit(region.id)}>Editar pontos</button>
                  <button type="button" className="mini-button" onClick={() => onAddPart(region.id)}>+ Outra parte</button>
                </div>
                <button
                  type="button"
                  className="mini-button order-delete-button"
                  style={{ width: '100%', marginTop: 7 }}
                  onClick={() => removeRegion(region)}
                >
                  Excluir região
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
